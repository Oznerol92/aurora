#!/usr/bin/env node
// ARM benchmark grader — automated (deterministic) metrics only.
//
//   node bench/grade.js <runId>
//
// Computes the Section A metrics from rubric.md for every result in
// bench/results/<runId>/, writes metrics.json + scoreboard.csv there, and
// prints an aggregate table per (model, condition, regime).
//
// The LLM judge panel (Section B) and the hallucinated-paraphrase check
// (Section C) are NOT done here — those need a model and are run as a
// separate step (see README). This file produces the cheap, objective signal.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const URL_RE = /https?:\/\/[^\s)\]}>"'`]+/g;
const VAGUE_RE =
  /\b(reports?\s+(?:indicate|suggest|show)|experts?\s+(?:agree|say)|studies?\s+(?:show|suggest)|research\s+suggests|it\s+is\s+widely\s+believed|industry\s+sources)\b/gi;
const DISCLAIMER_RE =
  /\b(not\s+(?:documented|publicly\s+available|well\s+documented)|limited\s+(?:public\s+)?(?:data|documentation)|no\s+primary\s+source|unclear|not\s+yet\s+(?:stabilis|standardis)|genuinely\s+unmapped|could\s+not\s+(?:verify|find)|proprietary|closed-source)\b/gi;
const TIER_TAG_RE = /\[(DEPLOYED|PROTOTYPE|CLAIMED)\]/g;
const CONF_TAG_RE = /\((substantial|directional)\)/gi;

async function resolves(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (r.status === 405 || r.status === 403) {
      // some servers reject HEAD; retry GET
      r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
    }
    return r.status >= 200 && r.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function checkUrls(urls, limit = 6) {
  const uniq = [...new Set(urls.map((u) => u.replace(/[.,;]+$/, '')))];
  let resolved = 0;
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, uniq.length) }, async () => {
    while (i < uniq.length) {
      const u = uniq[i++];
      if (await resolves(u)) resolved++;
    }
  });
  await Promise.all(workers);
  return { cited: uniq.length, resolved };
}

function metricsFor(text, condition) {
  const urls = text.match(URL_RE) ?? [];
  const vague = text.match(VAGUE_RE) ?? [];
  const disc = text.match(DISCLAIMER_RE) ?? [];
  const tierTags = text.match(TIER_TAG_RE) ?? [];
  const confTags = text.match(CONF_TAG_RE) ?? [];
  return {
    chars: text.length,
    urls,
    vague_attributions: vague.length,
    disclaimer_markers: disc.length,
    tag_compliance: condition === 'arm' ? tierTags.length + confTags.length > 0 : null,
    tier_tags: tierTags.length,
    conf_tags: confTags.length,
  };
}

function mean(xs) {
  const v = xs.filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('usage: node bench/grade.js <runId>');
    process.exit(1);
  }
  const dir = join(HERE, 'results', runId);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('metrics'));

  const rows = [];
  for (const f of files) {
    const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!rec.ok) {
      rows.push({ ...pick(rec), error: rec.error });
      continue;
    }
    const m = metricsFor(rec.text || '', rec.condition);
    const { cited, resolved } = await checkUrls(m.urls);
    rows.push({
      ...pick(rec),
      chars: m.chars,
      urls_cited: cited,
      urls_resolved: resolved,
      resolve_rate: cited ? +(resolved / cited).toFixed(2) : null,
      vague_attributions: m.vague_attributions,
      disclaimer_markers: m.disclaimer_markers,
      tag_compliance: m.tag_compliance,
      cost_usd: rec.cost_usd ?? null,
      latency_ms: rec.latency_ms ?? null,
    });
    console.log(`graded ${f}`);
  }

  writeFileSync(join(dir, 'metrics.json'), JSON.stringify(rows, null, 2));
  writeFileSync(join(dir, 'scoreboard.csv'), toCsv(rows));

  // aggregate per (model, condition, regime)
  console.log('\n=== aggregate (means) ===');
  const groups = {};
  for (const r of rows) {
    if (r.error) continue;
    const k = `${r.model} | ${r.condition} | ${r.regime}`;
    (groups[k] ??= []).push(r);
  }
  const header = [
    'model|condition|regime',
    'n',
    'chars',
    'urls',
    'resolve',
    'vague',
    'disclaim',
    '$',
  ];
  console.log(header.join('\t'));
  for (const [k, g] of Object.entries(groups).sort()) {
    console.log(
      [
        k,
        g.length,
        Math.round(mean(g.map((x) => x.chars)) ?? 0),
        (mean(g.map((x) => x.urls_cited)) ?? 0).toFixed(1),
        (mean(g.map((x) => x.resolve_rate)) ?? 0).toFixed(2),
        (mean(g.map((x) => x.vague_attributions)) ?? 0).toFixed(1),
        (mean(g.map((x) => x.disclaimer_markers)) ?? 0).toFixed(1),
        (mean(g.map((x) => x.cost_usd)) ?? 0).toFixed(3),
      ].join('\t'),
    );
  }
  console.log(`\nWrote ${join(dir, 'metrics.json')} and scoreboard.csv`);
  console.log('Section B (judge panel) + C (paraphrase check) are run separately — see README.');
  console.log(
    'Next: node bench/report.js — build the browsable HTML report (open results/index.html)',
  );
}

function pick(rec) {
  return {
    model: rec.model,
    condition: rec.condition,
    questionId: rec.questionId,
    regime: rec.regime,
  };
}

function toCsv(rows) {
  const cols = [
    'model',
    'condition',
    'questionId',
    'regime',
    'chars',
    'urls_cited',
    'urls_resolved',
    'resolve_rate',
    'vague_attributions',
    'disclaimer_markers',
    'tag_compliance',
    'cost_usd',
    'latency_ms',
    'error',
  ];
  const esc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
