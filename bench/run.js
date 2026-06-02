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
//
// The 'claude-cli' adapter shells out to the local `claude` CLI with --model,
// mirroring how Aurora itself invokes Claude. Other adapters are placeholders.

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), 'utf8');

function parseArgs(argv) {
  const out = { models: null, only: null, concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') out.models = argv[++i].split(',');
    else if (a === '--only') out.only = argv[++i].split(',');
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
  }
  return out;
}

// --- adapters: map (modelCfg, systemPrompt, userPrompt) -> Promise<result> ---

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
    '--allowedTools',
    'WebSearch',
    'WebFetch',
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
        resolve({
          ok: true,
          text: j.result ?? j.text ?? '',
          cost_usd: j.total_cost_usd ?? j.cost_usd ?? null,
          session_id: j.session_id ?? null,
          latency_ms,
          raw: j,
        });
      } catch (e) {
        resolve({ ok: false, error: `parse: ${e}`, stdout: stdout.slice(0, 2000), latency_ms });
      }
    });
  });
}

const ADAPTERS = {
  'claude-cli': runClaudeCli,
  'openai-api': () => Promise.resolve({ ok: false, error: 'openai-api adapter not implemented' }),
  'gemini-api': () => Promise.resolve({ ok: false, error: 'gemini-api adapter not implemented' }),
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
  const { questions } = JSON.parse(read('questions.json'));
  const conditions = {
    arm: read('conditions/arm.md'),
    baseline: read('conditions/baseline.md'),
  };

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
    for (const condition of Object.keys(conditions)) {
      for (const q of qs) {
        jobs.push({ modelId, modelCfg, condition, q });
      }
    }
  }

  console.log(`ARM benchmark: ${jobs.length} runs -> ${outDir}`);
  let done = 0;
  await pool(jobs, opts.concurrency, async (job) => {
    const adapter = ADAPTERS[job.modelCfg.adapter];
    const res = adapter
      ? await adapter(job.modelCfg, conditions[job.condition], job.q.prompt)
      : { ok: false, error: `no adapter: ${job.modelCfg.adapter}` };
    const record = {
      runId,
      model: job.modelId,
      modelLabel: job.modelCfg.label,
      condition: job.condition,
      questionId: job.q.id,
      regime: job.q.regime,
      domain: job.q.domain,
      prompt: job.q.prompt,
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
  console.log(`Next: node bench/grade.js ${runId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
