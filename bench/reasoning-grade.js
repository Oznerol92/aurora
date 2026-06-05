// Deterministic grading for the reasoning/accuracy benchmark.
//
// Pure functions only (no I/O, no network) so they are cheap to unit-test and
// carry no API cost. The model is asked to end its answer with a line like
//   FINAL: 17
// We extract that, normalize it, and compare to the question's ground truth.
//
// Two match modes, driven by question.type:
//   'number' — compare the numeric value (ignores $, commas, units, prose)
//   'text'   — compare the normalized string, or accept any listed alias
//
// Robustness over cleverness: if there is no FINAL line we fall back to the
// last non-empty line, so a model that forgot the marker but still answered
// isn't auto-failed on a formatting technicality.

/**
 * Pull the model's stated final answer. Prefers the LAST `FINAL: ...` marker
 * (case-insensitive, tolerant of `*`, `:`, `-` decoration); falls back to the
 * last non-empty line. Returns '' when there is nothing to grade.
 */
export function extractFinal(text) {
  const s = String(text ?? '');
  const re = /final\s*answer|final\b/gi;
  let lastIdx = -1;
  let m;
  while ((m = re.exec(s)) !== null) lastIdx = m.index + m[0].length;
  if (lastIdx !== -1) {
    // take the rest of that line after the marker and any :/-/* decoration
    const rest = s.slice(lastIdx).replace(/^[\s:*\-–—]+/, '');
    const line = rest.split(/\n/)[0].trim();
    if (line) return line;
  }
  const lines = s
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

/** Lowercase, strip currency/commas/markup, collapse spaces, drop trailing punctuation. */
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[$,*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?:;]+$/, '')
    .trim();
}

/** First signed decimal number in a string, or null. */
export function firstNumber(s) {
  const m = String(s ?? '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Grade one model output against one question. Returns
 * { correct, extracted, expected } — `extracted` is what the model said,
 * surfaced in the report so a near-miss is visible, not just a red X.
 */
export function gradeOne(text, question) {
  const extracted = extractFinal(text);
  const expected = String(question.answer);

  if (question.type === 'number') {
    const got = firstNumber(extracted);
    const want = firstNumber(expected);
    const correct = got != null && want != null && got === want;
    return { correct, extracted, expected };
  }

  // text: normalized equality against the answer or any accepted alias
  const cand = normalize(extracted);
  const accepted = [expected, ...(question.accept ?? [])].map(normalize);
  // exact normalized match, or the candidate is exactly an accepted token
  // (so "apples." or "it is apples" both pass for answer "apples")
  const correct = accepted.some((a) => cand === a || new RegExp(`\\b${escapeRe(a)}\\b`).test(cand));
  return { correct, extracted, expected };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mean of the numeric entries, or null if none. */
function mean(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function sum(xs) {
  return xs.reduce((a, b) => a + (typeof b === 'number' && Number.isFinite(b) ? b : 0), 0);
}

/**
 * Aggregate graded records into the headline numbers. A record is
 * { ok, correct, category, tokens_in, tokens_out, latency_ms, cost_usd }.
 * Errored runs (ok:false) count toward n but never toward `correct`.
 */
export function summarize(records) {
  const n = records.length;
  const correct = records.filter((r) => r.ok && r.correct).length;
  const byCat = {};
  for (const r of records) {
    const c = (byCat[r.category] ??= { n: 0, correct: 0 });
    c.n++;
    if (r.ok && r.correct) c.correct++;
  }
  const perCategory = Object.fromEntries(
    Object.entries(byCat).map(([k, v]) => [k, { ...v, accuracy: v.n ? v.correct / v.n : null }]),
  );
  return {
    n,
    correct,
    accuracy: n ? correct / n : null,
    tokens_in: sum(records.map((r) => r.tokens_in)),
    tokens_out: sum(records.map((r) => r.tokens_out)),
    avg_latency_ms: mean(records.map((r) => r.latency_ms)),
    total_cost_usd: sum(records.map((r) => r.cost_usd)),
    perCategory,
  };
}
