/**
 * Aurora interaction protocol — the small machine-readable contract the model
 * uses to (a) pause and ask the user a question mid-task, and (b) sign off a
 * finished job with a recap. Both are emitted as fenced code blocks placed last
 * in the model's message:
 *
 *   ```aurora:ask
 *   {"questions":[{"header":"Scope","question":"Which DB?","options":["Postgres","SQLite"],"multiSelect":false}]}
 *   ```
 *
 *   ```aurora:done
 *   {"summary":"Added X and wired Y.","actions":["Run npm test","Set FOO in .env"]}
 *   ```
 *
 * Why blocks at the turn boundary: the `claude` CLI runs headless and exits each
 * turn, so the model can't interrupt itself mid-answer. Instead it ends a turn
 * by asking; Aurora collects the answer and continues the resumed session. A
 * turn that ends with no question is a "finish" and triggers the recap.
 *
 * Everything here is pure (no I/O) so both the REPL (src/cli.js) and the Telegram
 * bridge (src/bridge/telegram.js) share it, and it can be unit-tested directly.
 */

// The opening fence Aurora watches for, in raw model output. Both ask and done
// blocks start with this, so the stream filter only needs the one marker.
const MARKER = '```aurora:';

// Match a whole ask/done block (fence, JSON body, closing fence).
const BLOCK_RE = /```aurora:(ask|done)\s*\n([\s\S]*?)```/gi;

/** Best-effort JSON parse of a block body; returns null instead of throwing. */
function safeJson(raw) {
  try {
    return JSON.parse(String(raw).trim());
  } catch {
    return null;
  }
}

/** Find the first block of a given kind ('ask' | 'done') and parse its JSON. */
function firstBlock(text, kind) {
  const re = new RegExp('```aurora:' + kind + '\\s*\\n([\\s\\S]*?)```', 'i');
  const m = re.exec(String(text || ''));
  return m ? safeJson(m[1]) : null;
}

/** Normalize one question object, or return null if it has no question text. */
function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  const question = typeof q.question === 'string' ? q.question.trim() : '';
  if (!question) return null;
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o).trim()).filter(Boolean)
    : [];
  return {
    header: typeof q.header === 'string' ? q.header.trim() : '',
    question,
    options,
    multiSelect: Boolean(q.multiSelect),
  };
}

/**
 * Parse an `aurora:ask` block. Returns `{ questions: [...] }` with each question
 * normalized, or null when there's no (valid) block.
 */
export function parseAskBlock(text) {
  const data = firstBlock(text, 'ask');
  if (!data || !Array.isArray(data.questions)) return null;
  const questions = data.questions.map(normalizeQuestion).filter(Boolean);
  return questions.length ? { questions } : null;
}

/**
 * Parse an `aurora:done` block into `{ summary, actions }`, or null when absent.
 * A block with neither a summary nor actions is treated as empty (null).
 */
export function parseDoneBlock(text) {
  const data = firstBlock(text, 'done');
  if (!data || typeof data !== 'object') return null;
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  const actions = Array.isArray(data.actions)
    ? data.actions.map((a) => String(a).trim()).filter(Boolean)
    : [];
  if (!summary && !actions.length) return null;
  return { summary, actions };
}

/**
 * Remove every protocol block from a message so neither the terminal, the
 * Telegram reply, nor the stored history ever shows raw JSON. Collapses the
 * blank lines the removal leaves behind.
 */
export function stripProtocolBlocks(text) {
  return String(text || '')
    .replace(BLOCK_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Interpret one free-text reply against a single question: a number (1-based)
 * picks an option; a comma-separated list picks several when multiSelect; any
 * unrecognized token is taken as a literal free-text answer. Empty input yields
 * a visible "(no answer)" so a skipped decision is never silently defaulted.
 */
export function mapChoice(raw, question) {
  const text = String(raw ?? '').trim();
  if (!text) return '(no answer)';
  const options = question?.options || [];
  if (!options.length) return text;

  const picks = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tok) => {
      const n = Number.parseInt(tok, 10);
      return Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : tok;
    });

  if (!question.multiSelect) return picks[0] ?? '(no answer)';
  return picks.join(', ');
}

/**
 * Build the synthetic user turn fed back to the model after the user answers an
 * ask block — one labelled line per question.
 */
export function formatAnswers(questions, answers) {
  const parts = (questions || []).map((q, i) => {
    const label = q.header || `Q${i + 1}`;
    const a = answers?.[i] != null ? String(answers[i]).trim() : '';
    return `${label}: ${a || '(no answer)'}`;
  });
  return `My answers — ${parts.join('; ')}.`;
}

/**
 * Map a Telegram reply (a single message) onto the pending questions. For one
 * question the whole message is the answer; for several, split on newlines or
 * semicolons, position-aligned to the questions.
 */
export function interpretReply(text, questions) {
  const list = questions || [];
  const parts = String(text || '')
    .split(/[\n;]+/)
    .map((s) => s.trim());
  return list.map((q, i) => mapChoice(list.length > 1 ? (parts[i] ?? '') : (parts[0] ?? ''), q));
}

/** Render an ask block as a numbered, plain-text message for Telegram. */
export function formatQuestionsForTelegram(questions) {
  const list = questions || [];
  const lines = ['🤔 Aurora needs your input:'];
  list.forEach((q, i) => {
    const head = q.header ? `${q.header} — ` : '';
    const num = list.length > 1 ? `${i + 1}) ` : '';
    lines.push('', `${num}${head}${q.question}`);
    q.options.forEach((opt, n) => lines.push(`   ${n + 1}. ${opt}`));
  });
  lines.push(
    '',
    list.length > 1
      ? 'Reply with your choices (one per line, or separated by ";").'
      : 'Reply with a number, or just type your own answer.',
  );
  return lines.join('\n');
}

/**
 * Build the Telegram recap for a finished turn. Prefers a model-authored `done`
 * block (summary + action items); otherwise falls back to a short preview of the
 * answer body.
 */
export function buildRecap(answer, done) {
  if (done) {
    const lines = ['✅ Aurora finished.', '', done.summary || '(no summary provided)'];
    if (done.actions.length) {
      lines.push('', 'Your action items:');
      for (const a of done.actions) lines.push(`• ${a}`);
    } else {
      lines.push('', 'Nothing needed from you.');
    }
    return lines.join('\n');
  }
  const preview = stripProtocolBlocks(answer).replace(/\s+/g, ' ').trim().slice(0, 280);
  return `✅ Aurora finished a turn:\n\n${preview || '(no response)'}`;
}

/**
 * Streaming guard for the terminal: deltas are pushed through it so the raw
 * ```aurora:… JSON is never printed to the screen, while the full text is kept
 * for parsing once the turn ends.
 *
 *   const f = new ProtocolStreamFilter();
 *   for (const d of deltas) process.stdout.write(f.push(d)); // visible text only
 *   process.stdout.write(f.end());                           // any held-back tail
 *   parseAskBlock(f.full);                                   // full text for parsing
 *
 * It holds back a short tail that could be the start of the marker so a fence
 * split across two chunks is still caught; once the marker appears, everything
 * from it onward is suppressed.
 */
export class ProtocolStreamFilter {
  constructor() {
    this.full = ''; // everything pushed, used for parsing after the turn
    this._pending = ''; // buffered text not yet known to be safe to show
    this._suppress = false; // true once a protocol fence has started
  }

  push(delta) {
    const d = String(delta ?? '');
    this.full += d;
    if (this._suppress) return '';
    this._pending += d;

    const idx = this._pending.indexOf(MARKER);
    if (idx !== -1) {
      const visible = this._pending.slice(0, idx);
      this._pending = '';
      this._suppress = true;
      return visible;
    }

    // Hold back only a tail that could grow into the marker; show the rest now.
    const keep = markerOverlap(this._pending);
    const cut = this._pending.length - keep;
    const visible = this._pending.slice(0, cut);
    this._pending = this._pending.slice(cut);
    return visible;
  }

  /** Flush any held-back tail that turned out not to be a marker. */
  end() {
    if (this._suppress) return '';
    const tail = this._pending;
    this._pending = '';
    return tail;
  }
}

/** Longest suffix of `s` that is a proper prefix of the marker (0 if none). */
function markerOverlap(s) {
  const max = Math.min(s.length, MARKER.length - 1);
  for (let k = max; k > 0; k--) {
    if (s.slice(s.length - k) === MARKER.slice(0, k)) return k;
  }
  return 0;
}
