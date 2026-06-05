#!/usr/bin/env node
// Reasoning/accuracy benchmark — ALPHA.
//
// A second, deterministic benchmark track that complements the ARM benchmark.
// Where ARM scores research DISCIPLINE on open-ended questions, this scores
// ACCURACY on reasoning questions that have one verifiable ground-truth answer
// (see reasoning.json). It reports the four numbers we care about — accuracy,
// tokens, latency, cost — with no LLM judge, so the only spend is the answers
// themselves (a fraction of a cent at the cheap tier).
//
//   node bench/reasoning.js                       # default model gpt-mini, all questions
//   node bench/reasoning.js --model gpt-mini      # pick a model id from models.json
//   node bench/reasoning.js --only r01-pens-notebooks,r07-sequence
//   node bench/reasoning.js --max-cost 0.50 --max-tokens 1500 --concurrency 2
//
// Cost guardrails mirror run.js: --max-cost (default $0.50) is a hard backstop on
// real out-of-pocket vendor spend, checked per-job pre-dispatch; --max-tokens
// (default 1500) bounds any single call. Only vendor (API) models are gated.
//
// Like the ARM runner, the vendor adapter here calls the OpenAI API DIRECTLY
// from the benchmark — it does NOT make OpenAI a first-class Aurora provider.
// Aurora stays Claude-only by design.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotenv } from '../src/env.js';
import { gradeOne, summarize } from './reasoning-grade.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), 'utf8');

loadDotenv(join(HERE, '..', '.env'));

const SYSTEM_PROMPT = [
  'You are solving reasoning problems that each have exactly one correct answer.',
  'Think step by step, briefly. Then, on the final line, output your answer in the exact form:',
  'FINAL: <answer>',
  'Give only the value after FINAL: — a bare number when the answer is numeric (no units,',
  'no currency symbol, no commas), or a single word/short phrase otherwise.',
].join('\n');

function parseArgs(argv) {
  const out = { model: 'gpt-mini', only: null, concurrency: 2, maxCost: 0.5, maxTokens: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') out.model = argv[++i];
    else if (a === '--only') out.only = argv[++i].split(',');
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
    else if (a === '--max-cost') out.maxCost = Number(argv[++i]);
    else if (a === '--max-tokens') out.maxTokens = Number(argv[++i]);
  }
  return out;
}

function costUsd(modelCfg, inTokens, outTokens) {
  const p = modelCfg.price;
  if (!p || (inTokens == null && outTokens == null)) return null;
  return ((inTokens || 0) * (p.in || 0) + (outTokens || 0) * (p.out || 0)) / 1e6;
}

/** OpenAI Chat Completions, plain (no tools). Returns the same shape run.js uses. */
async function runOpenAI(modelCfg, systemPrompt, userPrompt, opts = {}) {
  const key = process.env.OPENAI_API_KEY;
  const started = Date.now();
  if (!key) return { ok: false, error: 'missing OPENAI_API_KEY', latency_ms: 0 };
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelCfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: opts.maxTokens ?? 1500,
      }),
    });
    const latency_ms = Date.now() - started;
    const j = await r.json();
    if (!r.ok)
      return { ok: false, error: `openai ${r.status}: ${j?.error?.message || ''}`, latency_ms };
    const u = j.usage || {};
    return {
      ok: true,
      text: j.choices?.[0]?.message?.content ?? '',
      cost_usd: costUsd(modelCfg, u.prompt_tokens, u.completion_tokens),
      tokens_in: u.prompt_tokens ?? null,
      tokens_out: u.completion_tokens ?? null,
      latency_ms,
    };
  } catch (e) {
    return { ok: false, error: String(e), latency_ms: Date.now() - started };
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(read('models.json'));
  const modelCfg = registry.models[opts.model];
  if (!modelCfg) {
    console.error(`! unknown model id: ${opts.model} (see bench/models.json)`);
    process.exit(1);
  }
  if (modelCfg.adapter !== 'openai-api') {
    console.error(
      `! the reasoning alpha only wires the OpenAI adapter; '${opts.model}' uses '${modelCfg.adapter}'.`,
    );
    process.exit(1);
  }

  const { questions } = JSON.parse(read('reasoning.json'));
  const qs = opts.only ? questions.filter((q) => opts.only.includes(q.id)) : questions;

  const runId =
    process.env.REASONING_RUN_ID || 'reasoning-' + new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(HERE, 'results', runId);
  mkdirSync(outDir, { recursive: true });

  console.log(
    `Reasoning benchmark (alpha): ${qs.length} questions on ${modelCfg.label} -> ${outDir}\n` +
      `  vendor cost cap $${opts.maxCost}, ${opts.maxTokens} max out tokens/call`,
  );

  let vendorSpent = 0;
  let done = 0;
  const records = await pool(qs, opts.concurrency, async (q) => {
    let res;
    if (vendorSpent >= opts.maxCost) {
      res = { ok: false, error: `skipped: cost cap $${opts.maxCost} reached` };
    } else {
      res = await runOpenAI(modelCfg, SYSTEM_PROMPT, q.prompt, { maxTokens: opts.maxTokens });
      if (typeof res.cost_usd === 'number') vendorSpent += res.cost_usd;
    }
    const graded = res.ok
      ? gradeOne(res.text, q)
      : { correct: false, extracted: '', expected: String(q.answer) };
    const record = {
      runId,
      model: opts.model,
      modelLabel: modelCfg.label,
      questionId: q.id,
      category: q.category,
      prompt: q.prompt,
      type: q.type,
      expected: String(q.answer),
      ...res,
      correct: graded.correct,
      extracted: graded.extracted,
    };
    writeFileSync(join(outDir, `${opts.model}__${q.id}.json`), JSON.stringify(record, null, 2));
    done++;
    const mark = !res.ok ? `ERR (${res.error})` : graded.correct ? '✓' : '✗';
    console.log(
      `[${done}/${qs.length}] ${q.id} — ${mark}  expected=${record.expected} got=${JSON.stringify(record.extracted)}`,
    );
    return record;
  });

  const summary = summarize(records);
  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify({ runId, model: opts.model, modelLabel: modelCfg.label, ...summary }, null, 2),
  );

  console.log('\n=== summary ===');
  console.log(
    `accuracy:   ${summary.correct}/${summary.n} = ${pct(summary.accuracy)}\n` +
      `tokens:     ${summary.tokens_in} in + ${summary.tokens_out} out = ${summary.tokens_in + summary.tokens_out} total\n` +
      `latency:    ${Math.round(summary.avg_latency_ms ?? 0)} ms avg\n` +
      `cost:       $${(summary.total_cost_usd ?? 0).toFixed(5)} total (cap $${opts.maxCost})`,
  );
  console.log('by category:');
  for (const [cat, v] of Object.entries(summary.perCategory).sort()) {
    console.log(`  ${cat.padEnd(16)} ${v.correct}/${v.n} = ${pct(v.accuracy)}`);
  }

  const reportPath = join(HERE, 'results', 'reasoning.html');
  writeFileSync(reportPath, renderReport({ runId, modelLabel: modelCfg.label, records, summary }));
  console.log(`\nWrote ${reportPath}`);
  console.log(`  open: file://${reportPath}`);
}

function pct(x) {
  return x == null ? 'n/a' : (x * 100).toFixed(1) + '%';
}

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

/** Self-contained HTML report: no server, no network, no external assets. */
function renderReport({ runId, modelLabel, records, summary }) {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const totalTokens = summary.tokens_in + summary.tokens_out;
  const card = (label, value, sub) =>
    `<div class="card"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;

  const cards = [
    card('accuracy', pct(summary.accuracy), `${summary.correct} / ${summary.n} correct`),
    card('total cost', '$' + (summary.total_cost_usd ?? 0).toFixed(5), 'real API spend'),
    card('avg latency', Math.round(summary.avg_latency_ms ?? 0) + ' ms', 'per question'),
    card(
      'tokens',
      totalTokens.toLocaleString('en-US'),
      `${summary.tokens_in} in / ${summary.tokens_out} out`,
    ),
  ].join('');

  const catRows = Object.entries(summary.perCategory)
    .sort()
    .map(
      ([cat, v]) =>
        `<tr><td>${esc(cat)}</td><td>${v.correct}/${v.n}</td><td>${pct(v.accuracy)}</td></tr>`,
    )
    .join('');

  const rows = records
    .map((r) => {
      const status = !r.ok
        ? `<span class="err">error</span>`
        : r.correct
          ? `<span class="ok">✓</span>`
          : `<span class="no">✗</span>`;
      return `<tr class="${r.ok && r.correct ? '' : 'bad'}">
      <td class="mono">${esc(r.questionId)}</td>
      <td>${esc(r.category)}</td>
      <td class="prompt">${esc(r.prompt)}</td>
      <td class="mono">${esc(r.expected)}</td>
      <td class="mono">${esc(r.ok ? r.extracted : r.error)}</td>
      <td class="ctr">${status}</td>
      <td class="num">${r.tokens_in ?? ''}/${r.tokens_out ?? ''}</td>
      <td class="num">${r.latency_ms ?? ''}</td>
      <td class="num">${r.cost_usd != null ? '$' + r.cost_usd.toFixed(5) : ''}</td>
    </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aurora reasoning benchmark (alpha)</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; max-width: 1100px; margin-inline: auto; color: #1a1a1a; background: #fafafa; }
  @media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #121212; } }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  .meta { color: #888; font-size: .85rem; margin-bottom: 1.5rem; }
  .alpha { display: inline-block; background: #b8860b; color: #fff; font-size: .7rem; font-weight: 700; padding: .1rem .45rem; border-radius: .25rem; vertical-align: middle; letter-spacing: .05em; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: #fff; border: 1px solid #e2e2e2; border-radius: .5rem; padding: 1rem 1.25rem; }
  @media (prefers-color-scheme: dark) { .card { background: #1c1c1c; border-color: #333; } }
  .card .v { font-size: 1.8rem; font-weight: 700; }
  .card .l { color: #888; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
  .card .s { color: #aaa; font-size: .8rem; margin-top: .25rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; margin-bottom: 2rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
  @media (prefers-color-scheme: dark) { th, td { border-color: #2a2a2a; } }
  th { color: #888; font-weight: 600; text-transform: uppercase; font-size: .72rem; letter-spacing: .04em; }
  .mono { font-family: ui-monospace, monospace; }
  .num, .ctr { text-align: right; white-space: nowrap; }
  .ctr { text-align: center; }
  .prompt { max-width: 380px; color: #555; }
  @media (prefers-color-scheme: dark) { .prompt { color: #aaa; } }
  tr.bad td { background: rgba(220,40,40,.06); }
  .ok { color: #1a9c4a; font-weight: 700; } .no { color: #d12c2c; font-weight: 700; } .err { color: #b8860b; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; }
  .note { color: #888; font-size: .82rem; border-left: 3px solid #ccc; padding-left: .8rem; margin: 1.5rem 0; }
</style></head>
<body>
  <h1>Aurora reasoning benchmark <span class="alpha">ALPHA</span></h1>
  <div class="meta">${esc(modelLabel)} · run <span class="mono">${esc(runId)}</span> · generated ${esc(generatedAt)}</div>

  <div class="cards">${cards}</div>

  <div class="note">Accuracy is graded <strong>deterministically</strong> against a single ground-truth answer per question (no LLM judge), so the only cost is the model's own answers. Cost is computed from the API's real token counts &times; the model's price table. This is an <strong>alpha</strong>: a small, fixed question set, single model, no per-question retries — treat the figures as directional, not a leaderboard.</div>

  <h2>By category</h2>
  <table><thead><tr><th>category</th><th>correct</th><th>accuracy</th></tr></thead><tbody>${catRows}</tbody></table>

  <h2>Per question</h2>
  <table><thead><tr>
    <th>id</th><th>category</th><th>prompt</th><th>expected</th><th>model answer</th><th>✓/✗</th><th>tok in/out</th><th>ms</th><th>cost</th>
  </tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
