#!/usr/bin/env node
// Reasoning/accuracy benchmark — ALPHA. Multi-model.
//
// A deterministic benchmark track that complements the ARM benchmark. Where ARM
// scores research DISCIPLINE on open-ended questions, this scores ACCURACY on
// reasoning questions that have one verifiable ground-truth answer (see
// reasoning.json). It reports accuracy, tokens, latency, and cost — with no LLM
// judge, so the only spend is the answers themselves.
//
// It runs SEVERAL models head to head and writes a single comparison report
// (bench/results/reasoning.html) with an accuracy chart, a per-category model
// matrix, and an expandable per-question breakdown showing every model's answer
// side by side.
//
//   node bench/reasoning.js                          # default working set, all questions
//   node bench/reasoning.js --models opus,sonnet     # pick model ids from models.json
//   node bench/reasoning.js --model gpt-mini         # single model
//   node bench/reasoning.js --only r01-warehouse,r07-sequence
//   node bench/reasoning.js --max-cost 0.50 --max-tokens 1500 --concurrency 2
//
// Adapters (selected by each model's `adapter` field in models.json):
//   claude-cli  — shells out to the local `claude` CLI (subscription auth, no key,
//                 no web tools here: these are closed-form problems). Not cost-gated.
//   openai-api  — calls the OpenAI API directly (needs OPENAI_API_KEY). Cost-gated.
// A model whose adapter has no credentials (or isn't wired, e.g. gemini-api) is
// SKIPPED with a notice rather than erroring the whole run — so "don't include the
// ones that error" is the default behaviour.
//
// Calling OpenAI directly here does NOT make it a first-class Aurora provider.
// Aurora stays Claude-only by design.

import { spawn } from 'node:child_process';
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
  const out = { models: null, only: null, concurrency: 2, maxCost: 0.5, maxTokens: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') out.models = [argv[++i]];
    else if (a === '--models') out.models = argv[++i].split(',');
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

// --- adapters: (modelCfg, systemPrompt, userPrompt, opts) -> Promise<result> ---

/**
 * Claude via the local CLI. Subscription-billed (no API key) and given NO web
 * tools — the reasoning set is closed-form, so tools would only add latency and
 * make the comparison with the plain OpenAI completion unfair. `total_cost_usd`
 * from the CLI is the API-EQUIVALENT cost, not out-of-pocket subscription spend.
 */
function runClaudeCli(modelCfg, systemPrompt, userPrompt) {
  const args = [
    '-p',
    userPrompt,
    '--append-system-prompt',
    systemPrompt,
    '--model',
    modelCfg.model,
    '--output-format',
    'json',
  ];
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) =>
      resolve({ ok: false, error: String(err), latency_ms: Date.now() - started }),
    );
    child.on('close', (code) => {
      const latency_ms = Date.now() - started;
      if (code !== 0) return resolve({ ok: false, error: stderr || `exit ${code}`, latency_ms });
      try {
        const j = JSON.parse(stdout);
        const u = j.usage || {};
        resolve({
          ok: true,
          text: j.result ?? j.text ?? '',
          cost_usd: j.total_cost_usd ?? j.cost_usd ?? null,
          tokens_in: u.input_tokens ?? null,
          tokens_out: u.output_tokens ?? null,
          latency_ms,
        });
      } catch (e) {
        resolve({ ok: false, error: `parse: ${e}`, latency_ms });
      }
    });
  });
}

/** OpenAI Chat Completions, plain (no tools). Returns the same shape as above. */
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

const ADAPTERS = { 'claude-cli': runClaudeCli, 'openai-api': runOpenAI };

/** Is this model runnable right now? (adapter wired here + credentials present) */
function availability(modelCfg) {
  if (modelCfg.adapter === 'claude-cli') return { ok: true };
  if (modelCfg.adapter === 'openai-api')
    return process.env.OPENAI_API_KEY
      ? { ok: true }
      : { ok: false, why: 'missing OPENAI_API_KEY' };
  return { ok: false, why: `adapter '${modelCfg.adapter}' not wired in the reasoning runner` };
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

/** Run every question for one model. Returns { records, summary }. */
async function runModel(modelId, modelCfg, qs, outDir, opts) {
  const adapter = ADAPTERS[modelCfg.adapter];
  const gated = modelCfg.adapter === 'openai-api'; // only vendor spend is cost-capped
  let vendorSpent = 0;
  let done = 0;
  console.log(`\n▶ ${modelCfg.label} (${modelId}) — ${qs.length} questions`);
  const records = await pool(qs, opts.concurrency, async (q) => {
    let res;
    if (gated && vendorSpent >= opts.maxCost) {
      res = { ok: false, error: `skipped: cost cap $${opts.maxCost} reached` };
    } else {
      res = await adapter(modelCfg, SYSTEM_PROMPT, q.prompt, { maxTokens: opts.maxTokens });
      if (gated && typeof res.cost_usd === 'number') vendorSpent += res.cost_usd;
    }
    const graded = res.ok
      ? gradeOne(res.text, q)
      : { correct: false, extracted: '', expected: String(q.answer) };
    const record = {
      model: modelId,
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
    writeFileSync(join(outDir, `${modelId}__${q.id}.json`), JSON.stringify(record, null, 2));
    done++;
    const mark = !res.ok ? `ERR (${res.error})` : graded.correct ? '✓' : '✗';
    console.log(
      `  [${done}/${qs.length}] ${q.id} — ${mark}  expected=${record.expected} got=${JSON.stringify(record.extracted)}`,
    );
    return record;
  });
  const summary = summarize(records);
  writeFileSync(
    join(outDir, `${modelId}.summary.json`),
    JSON.stringify({ model: modelId, modelLabel: modelCfg.label, ...summary }, null, 2),
  );
  console.log(
    `  = ${modelCfg.label}: ${summary.correct}/${summary.n} = ${pct(summary.accuracy)}  ` +
      `(${Math.round(summary.avg_latency_ms ?? 0)} ms avg)`,
  );
  return { id: modelId, label: modelCfg.label, adapter: modelCfg.adapter, summary, records };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(read('models.json'));

  // Resolve the model set: explicit --models, else the active claude models plus
  // the cheap OpenAI model, deduped. Then drop any that can't run right now.
  const wanted = opts.models ?? [...(registry.active || []), 'gpt-mini'];
  const seen = new Set();
  const runnable = [];
  for (const id of wanted) {
    if (seen.has(id)) continue;
    seen.add(id);
    const cfg = registry.models[id];
    if (!cfg) {
      console.log(`  ⚠ skip ${id}: not in models.json`);
      continue;
    }
    const avail = availability(cfg);
    if (!avail.ok) {
      console.log(`  ⚠ skip ${id} (${cfg.label}): ${avail.why}`);
      continue;
    }
    runnable.push([id, cfg]);
  }
  if (!runnable.length) {
    console.error('! no runnable models — check models.json and credentials.');
    process.exit(1);
  }

  const { questions } = JSON.parse(read('reasoning.json'));
  const qs = opts.only ? questions.filter((q) => opts.only.includes(q.id)) : questions;

  const runId =
    process.env.REASONING_RUN_ID || 'reasoning-' + new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(HERE, 'results', runId);
  mkdirSync(outDir, { recursive: true });

  console.log(
    `Reasoning benchmark (alpha): ${qs.length} questions × ${runnable.length} models -> ${outDir}\n` +
      `  models: ${runnable.map(([id]) => id).join(', ')}\n` +
      `  vendor cost cap $${opts.maxCost}, ${opts.maxTokens} max out tokens/call`,
  );

  const models = [];
  for (const [id, cfg] of runnable) {
    models.push(await runModel(id, cfg, qs, outDir, opts));
  }

  // Console scoreboard, best first.
  const board = [...models].sort((a, b) => (b.summary.accuracy ?? 0) - (a.summary.accuracy ?? 0));
  console.log('\n=== scoreboard ===');
  for (const m of board) {
    console.log(
      `  ${m.label.padEnd(28)} ${String(m.summary.correct).padStart(2)}/${m.summary.n} = ${pct(m.summary.accuracy)}`,
    );
  }

  const reportPath = join(HERE, 'results', 'reasoning.html');
  writeFileSync(reportPath, renderReport({ runId, models: board, questions: qs }));
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

/** Green-tinted background for an accuracy in [0,1]; grey for null. */
function accCell(a) {
  if (a == null) return 'background:transparent';
  const light = 92 - Math.round(a * 42); // 92% (pale) -> 50% (saturated) lightness
  return `background:hsl(140 55% ${light}% / .85);color:${a > 0.5 ? '#0b3d1c' : '#444'}`;
}

/**
 * Self-contained HTML comparison report: no server, no network, no external
 * assets. CSS-only accuracy bars, a category×model matrix, and one expandable
 * <details> per question showing every model's answer side by side.
 */
function renderReport({ runId, models, questions }) {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const maxAcc = Math.max(0.0001, ...models.map((m) => m.summary.accuracy ?? 0));

  // 1. Accuracy bar chart (CSS bars), best first.
  const bars = models
    .map((m) => {
      const a = m.summary.accuracy ?? 0;
      const w = ((a / maxAcc) * 100).toFixed(1);
      return `<div class="bar-row">
        <div class="bar-label">${esc(m.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div>
        <div class="bar-val">${pct(m.summary.accuracy)} <span class="dim">(${m.summary.correct}/${m.summary.n})</span></div>
      </div>`;
    })
    .join('');

  // 2. Headline comparison table.
  const noteCost = models.some((m) => m.adapter === 'claude-cli');
  const tableRows = models
    .map((m) => {
      const s = m.summary;
      const tot = (s.tokens_in || 0) + (s.tokens_out || 0);
      const cost =
        s.total_cost_usd != null && s.total_cost_usd > 0
          ? '$' + s.total_cost_usd.toFixed(5) + (m.adapter === 'claude-cli' ? '*' : '')
          : '—';
      return `<tr>
        <td>${esc(m.label)}</td>
        <td class="mono dim">${esc(m.adapter)}</td>
        <td class="num"><strong>${pct(s.accuracy)}</strong></td>
        <td class="num">${s.correct}/${s.n}</td>
        <td class="num">${Math.round(s.avg_latency_ms ?? 0)} ms</td>
        <td class="num">${tot ? tot.toLocaleString('en-US') : '—'}</td>
        <td class="num">${cost}</td>
      </tr>`;
    })
    .join('');

  // 3. Category × model matrix.
  const cats = [...new Set(questions.map((q) => q.category))].sort();
  const matrixHead = models.map((m) => `<th class="num">${esc(m.label)}</th>`).join('');
  const matrixRows = cats
    .map((c) => {
      const cells = models
        .map((m) => {
          const v = m.summary.perCategory[c];
          if (!v) return `<td class="num" style="${accCell(null)}">—</td>`;
          return `<td class="num" style="${accCell(v.accuracy)}" title="${v.correct}/${v.n}">${Math.round(v.accuracy * 100)}%</td>`;
        })
        .join('');
      return `<tr><td>${esc(c)}</td>${cells}</tr>`;
    })
    .join('');

  // 4. Expandable per-question detail: each model's extracted answer side by side.
  const byQ = (qid) =>
    Object.fromEntries(
      models.map((m) => [m.id, m.records.find((r) => r.questionId === qid)]),
    );
  const questionBlocks = questions
    .map((q) => {
      const recs = byQ(q.id);
      const right = models.filter((m) => recs[m.id]?.ok && recs[m.id]?.correct).length;
      const cls = right === models.length ? 'all' : right === 0 ? 'none' : 'some';
      const rows = models
        .map((m) => {
          const r = recs[m.id];
          const mark = !r || !r.ok ? 'err' : r.correct ? 'ok' : 'no';
          const sym = mark === 'err' ? 'error' : mark === 'ok' ? '✓' : '✗';
          const got = !r ? '—' : r.ok ? r.extracted : r.error;
          return `<tr><td>${esc(m.label)}</td><td class="mono">${esc(got)}</td><td class="ctr ${mark}">${sym}</td></tr>`;
        })
        .join('');
      return `<details class="q ${cls}">
        <summary><span class="mono">${esc(q.id)}</span> · ${esc(q.category)}
          <span class="pill">${right}/${models.length} correct</span></summary>
        <div class="q-body">
          <p class="prompt">${esc(q.prompt)}</p>
          <p class="dim">expected: <span class="mono">${esc(String(q.answer))}</span></p>
          <table class="ans"><thead><tr><th>model</th><th>answer</th><th>✓/✗</th></tr></thead>
            <tbody>${rows}</tbody></table>
        </div>
      </details>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aurora reasoning benchmark — model comparison</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; max-width: 1100px; margin-inline: auto; color: #1a1a1a; background: #fafafa; }
  @media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #121212; } }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2.2rem 0 .75rem; }
  .meta { color: #888; font-size: .85rem; margin-bottom: 1.5rem; }
  .alpha { display: inline-block; background: #b8860b; color: #fff; font-size: .7rem; font-weight: 700; padding: .1rem .45rem; border-radius: .25rem; vertical-align: middle; letter-spacing: .05em; }
  .dim { color: #888; }
  .mono { font-family: ui-monospace, monospace; }
  /* bar chart */
  .bar-row { display: grid; grid-template-columns: 170px 1fr 150px; align-items: center; gap: .75rem; margin: .35rem 0; }
  .bar-label { font-size: .9rem; }
  .bar-track { background: #e6e6e6; border-radius: .3rem; height: 1.4rem; overflow: hidden; }
  @media (prefers-color-scheme: dark) { .bar-track { background: #2a2a2a; } }
  .bar-fill { height: 100%; background: linear-gradient(90deg,#2e9e5b,#46c878); border-radius: .3rem; }
  .bar-val { font-size: .85rem; text-align: right; white-space: nowrap; }
  /* tables */
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
  @media (prefers-color-scheme: dark) { th, td { border-color: #2a2a2a; } }
  th { color: #888; font-weight: 600; text-transform: uppercase; font-size: .72rem; letter-spacing: .04em; }
  .num { text-align: right; white-space: nowrap; }
  .ctr { text-align: center; font-weight: 700; }
  .ok { color: #1a9c4a; } .no { color: #d12c2c; } .err { color: #b8860b; }
  .matrix td:first-child { font-weight: 500; }
  /* expandable questions */
  details.q { border: 1px solid #e2e2e2; border-radius: .4rem; margin: .4rem 0; padding: .1rem .2rem; }
  @media (prefers-color-scheme: dark) { details.q { border-color: #333; } }
  details.q summary { cursor: pointer; padding: .5rem .6rem; font-size: .9rem; }
  details.q[open] summary { border-bottom: 1px solid #eee; }
  details.q.all { border-left: 3px solid #1a9c4a; }
  details.q.none { border-left: 3px solid #d12c2c; }
  details.q.some { border-left: 3px solid #b8860b; }
  .pill { background: #00000010; border-radius: 1rem; padding: .05rem .5rem; font-size: .75rem; margin-left: .4rem; }
  @media (prefers-color-scheme: dark) { .pill { background: #ffffff14; } }
  .q-body { padding: .6rem; }
  .prompt { margin: .2rem 0 .4rem; color: #444; }
  @media (prefers-color-scheme: dark) { .prompt { color: #bbb; } }
  table.ans { max-width: 640px; }
  .note { color: #888; font-size: .82rem; border-left: 3px solid #ccc; padding-left: .8rem; margin: 1.5rem 0; }
</style></head>
<body>
  <h1>Aurora reasoning benchmark — model comparison <span class="alpha">ALPHA</span></h1>
  <div class="meta">${models.length} models · ${questions.length} questions · run <span class="mono">${esc(runId)}</span> · generated ${esc(generatedAt)}</div>

  <h2>Accuracy</h2>
  ${bars}

  <h2>Scoreboard</h2>
  <table><thead><tr>
    <th>model</th><th>adapter</th><th class="num">accuracy</th><th class="num">correct</th>
    <th class="num">avg latency</th><th class="num">tokens</th><th class="num">cost</th>
  </tr></thead><tbody>${tableRows}</tbody></table>

  <h2>Accuracy by category</h2>
  <table class="matrix"><thead><tr><th>category</th>${matrixHead}</tr></thead><tbody>${matrixRows}</tbody></table>

  <h2>Per question <span class="dim" style="font-size:.8rem">(click to expand each model's answer)</span></h2>
  ${questionBlocks}

  <div class="note">Accuracy is graded <strong>deterministically</strong> against one ground-truth answer per question (no LLM judge), so the only cost is the models' own answers. This is an <strong>alpha</strong>: a small fixed question set, one attempt per question, no retries — treat the figures as directional, not a leaderboard.${
    noteCost
      ? ' &nbsp;<strong>*</strong> Claude (claude-cli) runs on subscription auth; its cost is the API-<em>equivalent</em> figure the CLI reports, not out-of-pocket spend.'
      : ''
  }</div>
</body></html>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
