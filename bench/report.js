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
      usage: rec.raw?.usage ?? null,
    });
  }
  outputs.sort((a, b) =>
    (a.questionId + a.model + a.condition).localeCompare(b.questionId + b.model + b.condition),
  );
  return { runId, outputs };
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

  let runs = runIds.map(loadRun).filter((r) => r.outputs.length);
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
  console.log(`  ${runs.length} run(s), ${totalOutputs} output(s) — open it in your browser:`);
  console.log(`  file://${out}`);
}

main();
