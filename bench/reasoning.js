#!/usr/bin/env node
// Reasoning/accuracy benchmark — ALPHA. Multi-model.
//
// A deterministic benchmark track that complements the ARM benchmark. Where ARM
// scores research DISCIPLINE on open-ended questions, this scores ACCURACY on
// reasoning questions that have one verifiable ground-truth answer (see
// reasoning.json). It reports accuracy, tokens, latency, and cost — with no LLM
// judge, so the only spend is the answers themselves.
//
// It runs SEVERAL models head to head, writes each model's results into the run
// dir, then rebuilds the unified report (bench/results/index.html via report.js)
// where the comparison appears in the "Reasoning accuracy" tab: an accuracy
// chart, a per-category model matrix, and an expandable per-question breakdown
// showing every model's answer side by side, alongside the ARM benchmark.
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

import { spawn, spawnSync } from 'node:child_process';
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
    JSON.stringify(
      { model: modelId, modelLabel: modelCfg.label, adapter: modelCfg.adapter, ...summary },
      null,
      2,
    ),
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

  // Rebuild the unified report so the reasoning comparison shows up in the
  // "Reasoning accuracy" tab of bench/results/index.html, next to the ARM runs.
  // The page builder (report.js) reads the per-model summaries this run wrote.
  const res = spawnSync(process.execPath, [join(HERE, 'report.js')], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.log('\n(could not rebuild index.html automatically — run: node bench/report.js)');
  }
}

function pct(x) {
  return x == null ? 'n/a' : (x * 100).toFixed(1) + '%';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
