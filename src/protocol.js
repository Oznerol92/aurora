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
 * The trailing question in a block of prose, or null when it doesn't end in one.
 * Conservative on purpose: the text must END with a question mark (allowing a
 * closing quote/bracket and trailing whitespace), so a rhetorical question in the
 * middle of an answer — which the model then answers itself — won't match. Returns
 * just the final question sentence, for display.
 */
export function trailingQuestion(text) {
  const t = String(text || '').trim();
  if (!t || !/\?['")\]]*$/.test(t)) return null;
  // Anchor on the last non-empty line, then keep only its final sentence.
  const lastLine =
    t
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() || t;
  const m = lastLine.match(/[^.!?]*\?['")\]]*$/);
  return (m ? m[0] : lastLine).trim() || null;
}

/**
 * Fallback question detection. The model is *told* to wrap a question in an
 * `aurora:ask` block (see the interaction protocol), but it doesn't always
 * comply — it frequently just asks in prose and stops. Those questions were
 * slipping through: the turn looked "finished", so on Telegram the user's reply
 * was treated as a brand-new turn (never mapped back as an answer) and a finish
 * recap could fire on what was really a question.
 *
 * This recovers that case. When a message carries NO explicit `aurora:ask` and
 * NO `aurora:done` block but its visible prose ENDS in a question, it's treated
 * as a single free-form ask, so the same ask → answer → resume flow kicks in.
 * Explicit blocks always win (a `done` block means the model declared itself
 * finished, so a trailing question there is rhetorical and is left alone).
 *
 * Returns the same shape as parseAskBlock (`{ questions: [...] }`) or null.
 */
export function parseImplicitAsk(text) {
  const raw = String(text || '');
  if (firstBlock(raw, 'ask') || firstBlock(raw, 'done')) return null;
  const question = trailingQuestion(stripProtocolBlocks(raw));
  if (!question) return null;
  return { questions: [{ header: '', question, options: [], multiSelect: false }] };
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
 * Pick which text a finish recap should preview. A streamed turn is captured as
 * the full narration — every delta, in order — so its opening is the model's
 * preamble ("On it, let me run the gate…", "Let me check whether…"). Slicing the
 * front of that for a one-line recap surfaces the *start* of the work, which on
 * Telegram reads as stale, in-progress "old output" rather than the result.
 *
 * The CLI's final `result` message is the turn's conclusion, so prefer it. Fall
 * back to the full narration only when no final message is available (e.g. a
 * block-only turn that streamed no result text).
 */
export function recapSource(finalMessage, fullNarration) {
  const final = stripProtocolBlocks(finalMessage || '').trim();
  return final || fullNarration || '';
}

/**
 * Escape the three characters Telegram's HTML parse mode treats as markup, so any
 * model- or user-authored text is shown literally instead of breaking the tags we
 * add ourselves. (Quotes only matter inside attribute values, which we never emit.)
 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the Telegram recap for a finished turn as an HTML message (send it with
 * parse_mode "HTML"). Prefers a model-authored `done` block, rendered as a styled
 * "Done / Next steps" card: the summary is what was accomplished, the actions are
 * what's next. Falls back to a short preview of the answer body only when a turn
 * carries no `done` block. Pass the turn's conclusion as `answer` (see
 * `recapSource`), not the full streamed narration, or the preview shows preamble.
 *
 * All dynamic text is HTML-escaped; only the structural tags are literal markup.
 */
export function buildRecap(answer, done) {
  if (done) {
    const lines = [
      '✅ <b>Aurora finished</b>',
      '',
      escapeHtml(done.summary || '(no summary provided)'),
    ];
    if (done.actions.length) {
      lines.push('', '<b>Next steps</b>');
      for (const a of done.actions) lines.push(`• ${escapeHtml(a)}`);
    } else {
      lines.push('', '<i>Nothing needed from you.</i>');
    }
    return lines.join('\n');
  }
  const body = stripProtocolBlocks(answer).replace(/\s+/g, ' ').trim();
  const preview = previewText(body, 500);
  return `✅ <b>Aurora finished a turn</b>\n\n${escapeHtml(preview) || '<i>(no response)</i>'}`;
}

/**
 * A recap preview that never clips a word. Returns the whole body when it already
 * fits within `limit`; otherwise keeps as many leading WHOLE sentences as fit and
 * marks the remainder with an ellipsis. If even the first sentence is over budget
 * (rare for a recap), it breaks at the last word boundary rather than mid-word — so
 * the preview always reads as a complete thought, never a message cut in half.
 */
export function previewText(body, limit = 500) {
  const text = String(body ?? '').trim();
  if (text.length <= limit) return text;
  let out = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > limit) break;
    out = next;
  }
  if (out) return `${out} …`;
  // First sentence alone exceeds the budget: break on the last word boundary.
  const slice = text.slice(0, limit);
  const cut = slice.lastIndexOf(' ');
  return `${(cut > 0 ? slice.slice(0, cut) : slice).trimEnd()}…`;
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
