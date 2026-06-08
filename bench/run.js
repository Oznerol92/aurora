#!/usr/bin/env node
// ARM benchmark runner.
//
// Runs every (model x condition x question) combination and saves each raw
// output under bench/results/<runId>/. Models come from models.json (only the
// ids in `active` run); conditions come from bench/conditions/*.md.
//
//   node bench/run.js                 # run all active models, both conditions
//   node bench/run.js --models opus   # subset of models
//   node bench/run.js --only A1-llm-agents-prod   # subset of questions
//   node bench/run.js --concurrency 2 # parallel runs (default 2)
//   node bench/run.js --models gpt-mini,gemini-flash --only B1-react19 --concurrency 1
//                                     # cheap multi-vendor smoke (see --max-cost / --max-tokens)
//   node bench/run.js --questions brain-eval.json --conditions baseline,arm,brain
//                                     # the brain harness: measure what Aurora's brain
//                                     # adds over a plain baseline (and vs the full ARM prompt)
//
// Conditions resolve a per-question system prompt. `arm` and `baseline` are the
// static prompts in bench/conditions/*.md. `brain` is dynamic: it scores the
// method cards in brain/ against each question (selectRelevantCards) and injects
// the top matches over the baseline — exactly how Aurora's runtime brain works —
// so the eval isolates what RETRIEVAL adds. Each brain output records which cards
// it retrieved; an off-domain control question retrieves none, proving the gating.
//
// The 'claude-cli' adapter shells out to the local `claude` CLI with --model,
// mirroring how Aurora itself invokes Claude. The 'openai-api' and 'gemini-api'
// adapters call those vendors' HTTP APIs directly (plain completions, no web
// tools) for cross-vendor comparison — they do NOT make those vendors
// first-class Aurora providers; Aurora stays Claude-only by design.

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotenv } from '../src/env.js';
import { loadBrainCards, selectRelevantCards, formatTurnBrain } from '../src/brain/corpus.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), 'utf8');

// Pick up OPENAI_API_KEY / GEMINI_API_KEY from the repo-root .env (real env
// still wins). The claude-cli adapter needs no key — it uses your Claude Code
// subscription auth via the local CLI.
loadDotenv(join(HERE, '..', '.env'));

function parseArgs(argv) {
  // --max-cost: out-of-pocket spend backstop in USD for VENDOR adapters only
  //   (default $0.50, matching the cheap-smoke use case). Once cumulative vendor
  //   spend reaches it, remaining vendor jobs are skipped. claude-cli runs are
  //   subscription-billed and are NOT gated by this. Note: the check is per-job
  //   pre-dispatch, so with --concurrency N it can overshoot by up to the cost
  //   of N in-flight jobs; --max-tokens bounds how big each overshoot can be.
  // --max-tokens: cap output tokens per vendor call (default 1500), so a single
  //   call's cost is bounded no matter how chatty the model gets.
  // --questions: which question file to load (default questions.json — the ARM
  //   set). Pass brain-eval.json to run the brain harness.
  // --conditions: comma list of conditions to run (default arm,baseline). The
  //   brain harness uses baseline,arm,brain to measure what the brain adds.
  const out = {
    models: null,
    only: null,
    concurrency: 2,
    maxCost: 0.5,
    maxTokens: 1500,
    questions: 'questions.json',
    conditions: null,
    tools: true,
    timeoutMs: 180000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') out.models = argv[++i].split(',');
    else if (a === '--only') out.only = argv[++i].split(',');
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
    else if (a === '--max-cost') out.maxCost = Number(argv[++i]);
    else if (a === '--max-tokens') out.maxTokens = Number(argv[++i]);
    else if (a === '--questions') out.questions = argv[++i];
    else if (a === '--conditions') out.conditions = argv[++i].split(',');
    else if (a === '--no-tools') out.tools = false;
    else if (a === '--timeout') out.timeoutMs = Number(argv[++i]) * 1000;
  }
  return out;
}

/**
 * Cost from token usage and a per-million-token price table on the model
 * config: `price: { in, out }` in USD per 1M tokens. Returns null if the model
 * has no price table (e.g. the subscription-billed claude-cli adapter), so the
 * field stays honestly empty rather than a fabricated 0.
 */
function costUsd(modelCfg, inTokens, outTokens) {
  const p = modelCfg.price;
  if (!p || (inTokens == null && outTokens == null)) return null;
  return ((inTokens || 0) * (p.in || 0) + (outTokens || 0) * (p.out || 0)) / 1e6;
}

// --- adapters: (modelCfg, systemPrompt, userPrompt, opts) -> Promise<result> ---

function runClaudeCli(modelCfg, systemPrompt, userPrompt, opts = {}) {
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
  // Web tools are on by default (the ARM benchmark grounds claims live). They can
  // be turned off (--no-tools) for method/writing evals where search adds only
  // latency and variance — and where a single hung search can stall the pool.
  if (opts.tools !== false) args.push('--allowedTools', 'WebSearch', 'WebFetch');
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '',
      settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    // Safety net: kill a call that hangs (e.g. a stuck web search) so one bad job
    // never blocks the whole run, as happened before this guard existed.
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      done({
        ok: false,
        error: `timeout after ${opts.timeoutMs ?? 180000}ms`,
        latency_ms: Date.now() - started,
      });
    }, opts.timeoutMs ?? 180000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) =>
      done({ ok: false, error: String(err), latency_ms: Date.now() - started }),
    );
    child.on('close', (code) => {
      const latency_ms = Date.now() - started;
      if (settled) return;
      if (code !== 0) return done({ ok: false, error: stderr || `exit ${code}`, latency_ms });
      try {
        const j = JSON.parse(stdout);
        done({
          ok: true,
          text: j.result ?? j.text ?? '',
          cost_usd: j.total_cost_usd ?? j.cost_usd ?? null,
          session_id: j.session_id ?? null,
          latency_ms,
          raw: j,
        });
      } catch (e) {
        done({ ok: false, error: `parse: ${e}`, stdout: stdout.slice(0, 2000), latency_ms });
      }
    });
  });
}

/**
 * OpenAI Chat Completions adapter. Plain (no tools) completion: the cheap-smoke
 * path tests harness plumbing + ARM-discipline following, not live web research.
 * Reads OPENAI_API_KEY from env/.env. Cost is computed from the API's own usage
 * counts times the model's price table — so it's the real spend, not an estimate.
 */
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

/**
 * Google Gemini (Generative Language API) adapter. Plain generateContent call,
 * same cheap-smoke contract as the OpenAI one. Reads GEMINI_API_KEY (falls back
 * to GOOGLE_API_KEY). Cost from usageMetadata times the model price table.
 */
async function runGemini(modelCfg, systemPrompt, userPrompt, opts = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const started = Date.now();
  if (!key) return { ok: false, error: 'missing GEMINI_API_KEY', latency_ms: 0 };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelCfg.model)}:generateContent`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 1500 },
      }),
    });
    const latency_ms = Date.now() - started;
    const j = await r.json();
    if (!r.ok)
      return { ok: false, error: `gemini ${r.status}: ${j?.error?.message || ''}`, latency_ms };
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('');
    const u = j.usageMetadata || {};
    return {
      ok: true,
      text,
      cost_usd: costUsd(modelCfg, u.promptTokenCount, u.candidatesTokenCount),
      tokens_in: u.promptTokenCount ?? null,
      tokens_out: u.candidatesTokenCount ?? null,
      latency_ms,
    };
  } catch (e) {
    return { ok: false, error: String(e), latency_ms: Date.now() - started };
  }
}

const ADAPTERS = {
  'claude-cli': runClaudeCli,
  'openai-api': runOpenAI,
  'gemini-api': runGemini,
};

// --- simple concurrency pool ---
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
  const { questions } = JSON.parse(read(opts.questions));

  // Conditions resolve a per-question system prompt. `arm`/`baseline` are static
  // .md files; `brain` is DYNAMIC — it mirrors Aurora's runtime brain by scoring
  // the method cards against THIS question and injecting only the top matches on
  // top of the plain baseline, so the eval measures what retrieval adds. The
  // resolver also returns the retrieved card ids, recorded for the audit (and to
  // prove gating: an off-domain control question retrieves none).
  const armSys = read('conditions/arm.md');
  const baselineSys = read('conditions/baseline.md');
  const brainCards = loadBrainCards();
  const conditions = {
    arm: () => ({ system: armSys }),
    baseline: () => ({ system: baselineSys }),
    brain: (q) => {
      const sel = selectRelevantCards(brainCards, q.prompt, { max: 3 });
      const guidance = formatTurnBrain(sel);
      return {
        system: guidance ? baselineSys + '\n\n' + guidance : baselineSys,
        brainCardIds: sel.map((c) => c.id),
      };
    },
  };
  const condIds = (opts.conditions ?? ['arm', 'baseline']).filter((c) => {
    if (conditions[c]) return true;
    console.error(`! unknown condition: ${c} (have ${Object.keys(conditions).join(', ')})`);
    return false;
  });

  const modelIds = opts.models ?? registry.active;
  const qs = opts.only ? questions.filter((q) => opts.only.includes(q.id)) : questions;

  // runId: caller can override via env for reproducible paths; else timestamp.
  const runId = process.env.ARM_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(HERE, 'results', runId);
  mkdirSync(outDir, { recursive: true });

  const jobs = [];
  for (const modelId of modelIds) {
    const modelCfg = registry.models[modelId];
    if (!modelCfg) {
      console.error(`! unknown model id: ${modelId} (skipping)`);
      continue;
    }
    for (const condition of condIds) {
      for (const q of qs) {
        jobs.push({ modelId, modelCfg, condition, q });
      }
    }
  }

  // The --max-cost backstop gates only adapters that incur real out-of-pocket
  // API spend (vendor HTTP APIs). claude-cli is billed against your Claude Code
  // subscription, not per call, so it is NOT throttled by the cap — a full
  // Claude benchmark runs unbounded, as it did before the cap existed.
  const isBilled = (job) => job.modelCfg.adapter !== 'claude-cli';
  console.log(
    `ARM benchmark: ${jobs.length} runs -> ${outDir}  (vendor cost cap $${opts.maxCost}, ${opts.maxTokens} max out tokens/vendor call; Claude runs are subscription-billed and uncapped)`,
  );
  let done = 0;
  let spent = 0; // all reported cost (Claude subscription-equiv + vendor), for the summary
  let vendorSpent = 0; // real out-of-pocket vendor spend — what --max-cost gates
  await pool(jobs, opts.concurrency, async (job) => {
    const adapter = ADAPTERS[job.modelCfg.adapter];
    const resolved = conditions[job.condition](job.q); // { system, brainCardIds? }
    let res;
    if (!adapter) {
      res = { ok: false, error: `no adapter: ${job.modelCfg.adapter}` };
    } else if (isBilled(job) && vendorSpent >= opts.maxCost) {
      res = {
        ok: false,
        error: `skipped: vendor cost cap $${opts.maxCost} reached ($${vendorSpent.toFixed(4)} vendor spend)`,
      };
    } else {
      res = await adapter(job.modelCfg, resolved.system, job.q.prompt, {
        maxTokens: opts.maxTokens,
        tools: opts.tools,
        timeoutMs: opts.timeoutMs,
      });
      if (typeof res.cost_usd === 'number') {
        spent += res.cost_usd;
        if (isBilled(job)) vendorSpent += res.cost_usd;
      }
    }
    const record = {
      runId,
      model: job.modelId,
      modelLabel: job.modelCfg.label,
      condition: job.condition,
      questionId: job.q.id,
      regime: job.q.regime,
      domain: job.q.domain,
      prompt: job.q.prompt,
      // Which brain cards retrieved for this question (brain condition only) — the
      // gating audit: a control question should show [].
      ...(resolved.brainCardIds ? { brainCardIds: resolved.brainCardIds } : {}),
      ...res,
    };
    const fname = `${job.modelId}__${job.condition}__${job.q.id}.json`;
    writeFileSync(join(outDir, fname), JSON.stringify(record, null, 2));
    done++;
    const status = res.ok ? 'ok' : `FAIL (${res.error})`;
    console.log(`[${done}/${jobs.length}] ${fname} — ${status}`);
    return record;
  });

  console.log(`\nDone. Raw outputs in ${outDir}`);
  console.log(
    `Reported cost: $${spent.toFixed(4)} total — of which $${vendorSpent.toFixed(4)} is out-of-pocket vendor spend (cap $${opts.maxCost}). Claude figures are subscription-billed, not extra charges.`,
  );
  console.log(`Next: node bench/grade.js ${runId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
