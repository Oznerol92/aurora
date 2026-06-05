#!/usr/bin/env node
// ARM benchmark report generator.
//
//   node bench/report.js          # build report for every run under results/
//   node bench/report.js <runId>  # build but open straight to one run
//
// Scans bench/results/<runId>/ for raw outputs (+ optional metrics.json from
// grade.js), inlines everything into a single self-contained HTML page, and
// writes bench/results/index.html. The page needs no server and no network —
// open it straight from disk. It carries interactive ARM-vs-baseline charts, a
// sortable scoreboard, and a sidebar to navigate every run and every output
// with its research text rendered as styled markdown.

import { readFileSync, readdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');

// metric fields lifted from a grade.js row onto an output
const METRIC_KEYS = [
  'chars',
  'urls_cited',
  'urls_resolved',
  'resolve_rate',
  'vague_attributions',
  'disclaimer_markers',
  'tag_compliance',
];

function loadRun(runId) {
  const dir = join(RESULTS, runId);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('metrics'));

  // metrics.json (if graded) keyed by model__condition__questionId
  const metricsBy = {};
  const mp = join(dir, 'metrics.json');
  if (existsSync(mp)) {
    try {
      for (const row of JSON.parse(readFileSync(mp, 'utf8'))) {
        metricsBy[`${row.model}__${row.condition}__${row.questionId}`] = row;
      }
    } catch {
      /* malformed metrics — outputs still render without charts */
    }
  }

  const outputs = [];
  for (const f of files) {
    let rec;
    try {
      rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue;
    }
    const key = `${rec.model}__${rec.condition}__${rec.questionId}`;
    const row = metricsBy[key];
    const metrics = row ? Object.fromEntries(METRIC_KEYS.map((k) => [k, row[k] ?? null])) : null;
    outputs.push({
      model: rec.model,
      modelLabel: rec.modelLabel || rec.model,
      condition: rec.condition,
      questionId: rec.questionId,
      regime: rec.regime ?? null,
      domain: rec.domain ?? null,
      prompt: rec.prompt ?? '',
      ok: rec.ok !== false,
      error: rec.error ?? null,
      text: rec.text ?? '',
      metrics,
      cost_usd: rec.cost_usd ?? (row ? row.cost_usd : null) ?? null,
      latency_ms: rec.latency_ms ?? (row ? row.latency_ms : null) ?? null,
      // Claude reports usage under raw.usage; the vendor adapters report flat
      // tokens_in/tokens_out. Normalize so the report's token block shows either.
      usage:
        rec.raw?.usage ??
        (rec.tokens_in != null || rec.tokens_out != null
          ? { input_tokens: rec.tokens_in, output_tokens: rec.tokens_out }
          : null),
    });
  }
  outputs.sort((a, b) =>
    (a.questionId + a.model + a.condition).localeCompare(b.questionId + b.model + b.condition),
  );
  return { runId, outputs };
}

// A reasoning run is any results dir carrying a summary.json (written by
// bench/reasoning.js). Its records are accuracy-graded, not ARM-discipline
// metrics, so it loads into a separate `reasoning` blob the report renders as
// its own tab — the ARM SPA is untouched.
function isReasoningRun(runId) {
  return existsSync(join(RESULTS, runId, 'summary.json'));
}

function loadReasoning(runId) {
  const dir = join(RESULTS, runId);
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'summary.json');
  const records = [];
  for (const f of files) {
    let rec;
    try {
      rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue;
    }
    records.push({
      questionId: rec.questionId,
      category: rec.category ?? '',
      prompt: rec.prompt ?? '',
      type: rec.type ?? '',
      expected: rec.expected ?? '',
      extracted: rec.ok ? (rec.extracted ?? '') : '',
      ok: rec.ok !== false,
      correct: Boolean(rec.correct),
      error: rec.error ?? null,
      tokens_in: rec.tokens_in ?? null,
      tokens_out: rec.tokens_out ?? null,
      latency_ms: rec.latency_ms ?? null,
      cost_usd: rec.cost_usd ?? null,
    });
  }
  records.sort((a, b) => String(a.questionId).localeCompare(String(b.questionId)));
  return {
    runId,
    model: summary.model,
    modelLabel: summary.modelLabel || summary.model,
    summary,
    records,
  };
}

function main() {
  if (!existsSync(RESULTS)) {
    console.error(`no results directory at ${RESULTS} — run bench/run.js first`);
    process.exit(1);
  }
  const only = process.argv[2];
  const runIds = readdirSync(RESULTS)
    .filter((d) => statSync(join(RESULTS, d)).isDirectory())
    // newest first by mtime, so the latest run loads on open
    .sort((a, b) => statSync(join(RESULTS, b)).mtimeMs - statSync(join(RESULTS, a)).mtimeMs);

  if (!runIds.length) {
    console.error('no runs found under bench/results/ — run bench/run.js first');
    process.exit(1);
  }

  // Split ARM runs from reasoning runs — they have different shapes and tabs.
  const reasoning = runIds.filter(isReasoningRun).map(loadReasoning);
  let runs = runIds
    .filter((id) => !isReasoningRun(id))
    .map(loadRun)
    .filter((r) => r.outputs.length);

  if (!runs.length && !reasoning.length) {
    console.error(
      'no usable runs found under bench/results/ — run bench/run.js or bench/reasoning.js',
    );
    process.exit(1);
  }
  if (only) {
    const picked = runs.find((r) => r.runId === only);
    if (!picked) {
      console.error(`unknown runId: ${only}`);
      process.exit(1);
    }
    runs = [picked, ...runs.filter((r) => r.runId !== only)];
  }

  const data = {
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    runs,
    reasoning,
  };

  const template = readFileSync(join(HERE, 'report.template.html'), 'utf8');
  // JSON is injected into a <script> body; guard against a literal </script>
  // in any research text closing the tag early.
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  const html = template.replace('__BENCH_DATA__', json);

  const out = join(RESULTS, 'index.html');
  writeFileSync(out, html);

  const totalOutputs = runs.reduce((a, r) => a + r.outputs.length, 0);
  console.log(`Wrote ${out}`);
  console.log(
    `  ${runs.length} ARM run(s), ${totalOutputs} output(s); ${reasoning.length} reasoning run(s) — open it in your browser:`,
  );
  console.log(`  file://${out}`);
}

main();
