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

// A reasoning run is any results dir carrying a summary file (written by
// bench/reasoning.js): the multi-model runner writes one `<model>.summary.json`
// per model; the legacy single-model runner wrote a lone `summary.json`. Its
// records are accuracy-graded, not ARM-discipline metrics, so it loads into a
// separate `reasoning` blob the report renders as its own tab — the ARM SPA is
// untouched.
function isReasoningRun(runId) {
  let files;
  try {
    files = readdirSync(join(RESULTS, runId));
  } catch {
    return false;
  }
  return files.includes('summary.json') || files.some((f) => f.endsWith('.summary.json'));
}

/**
 * Load a reasoning run into a multi-model shape: { runId, models[], questions[] }.
 * Handles both layouts — per-model `<id>.summary.json` (current) and a single
 * `summary.json` (legacy) — so old runs still render in the same comparison tab.
 */
function loadReasoning(runId) {
  const dir = join(RESULTS, runId);
  const all = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const perModel = all.filter((f) => f.endsWith('.summary.json'));

  // [{ id, s }] — one entry per model summary present in the run dir.
  const summaries = [];
  if (perModel.length) {
    for (const f of perModel) {
      try {
        summaries.push({ id: f.replace(/\.summary\.json$/, ''), s: JSON.parse(readFileSync(join(dir, f), 'utf8')) });
      } catch {
        /* skip an unreadable summary */
      }
    }
  } else if (all.includes('summary.json')) {
    try {
      const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
      summaries.push({ id: s.model, s });
    } catch {
      /* nothing to load */
    }
  }

  const recFiles = all.filter((f) => f !== 'summary.json' && !f.endsWith('.summary.json'));
  const recordsFor = (modelId) => {
    const out = [];
    for (const f of recFiles) {
      if (!f.startsWith(modelId + '__')) continue;
      let rec;
      try {
        rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        continue;
      }
      out.push({
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
    out.sort((a, b) => String(a.questionId).localeCompare(String(b.questionId)));
    return out;
  };

  const models = summaries
    .map(({ id, s }) => ({
      id,
      label: s.modelLabel || s.model || id,
      adapter: s.adapter || '',
      summary: s,
      records: recordsFor(id),
    }))
    .sort((a, b) => (b.summary.accuracy ?? 0) - (a.summary.accuracy ?? 0));

  // Question list: the union across models, keyed by id (fields from the first seen).
  const qmap = new Map();
  for (const m of models)
    for (const r of m.records)
      if (!qmap.has(r.questionId))
        qmap.set(r.questionId, {
          id: r.questionId,
          category: r.category,
          prompt: r.prompt,
          expected: r.expected,
          type: r.type,
        });
  const questions = [...qmap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return { runId, models, questions };
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
