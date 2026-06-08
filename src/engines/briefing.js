/**
 * Handoff briefing — what a switched-in engine reads so it arrives up to speed.
 *
 * When you `/engine` to a different backend mid-conversation, Aurora's identity
 * (persona + voice + method brain) is re-applied to the new engine, and on top
 * of that we inject a BRIEFING: a short synthesis of the work so far plus the
 * continuity framing. Two flavours:
 *   - returning engine — "you last worked here on <date>; here's what's happened"
 *   - first visit       — "you're taking over this project for the first time"
 *
 * The work summary is produced on demand at switch time by one cheap, tool-free
 * `claude -p` call (reusing the same runner as the recap preview), and degrades
 * to a deterministic digest — session title, exchange count, the last
 * `aurora:done` recap — whenever the model call is unavailable or fails. That
 * deterministic digest is also the floor used by `/context`, which never spends
 * an LLM call just to show you the current handoff context.
 */
import { parseDoneBlock, stripProtocolBlocks } from '../protocol.js';
import { runClaudeOnce } from '../notify/preview.js';
import { previewTitle, firstUserText } from '../store/title.js';

/** Budget for the synthesized summary (kept under the prompt-side briefing cap). */
const SUMMARY_MAX_CHARS = 1400;
/** How much transcript to feed the summarizer (bounded so the prompt stays small). */
const TRANSCRIPT_MAX_TURNS = 40;
const TRANSCRIPT_MAX_CHARS_PER_TURN = 1500;

const oneLine = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();

/** Clip to at most `max` chars on a line boundary, with a marker. */
function clip(s, max) {
  const str = String(s || '');
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const nl = cut.lastIndexOf('\n');
  const boundary = nl > max * 0.6 ? nl : cut.length;
  return cut.slice(0, boundary).trimEnd() + '\n…[truncated]';
}

/** The last `aurora:done` summary in a transcript (newest-first), or ''. */
function lastDoneSummary(turns) {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'user') continue;
    const done = parseDoneBlock(turns[i].text);
    if (done?.summary) return done.summary;
  }
  return '';
}

/**
 * A no-LLM digest of a conversation: topic (first user message), how many
 * exchanges, and the last recap or most-recent request. Always available; used
 * as the summarizer's fallback and as the body of `/context`.
 */
export function deterministicDigest(turns = [], { maxChars = SUMMARY_MAX_CHARS } = {}) {
  const list = (Array.isArray(turns) ? turns : []).filter((t) => t && t.text);
  if (!list.length) return '';
  const topic = previewTitle(firstUserText(list));
  const exchanges = list.filter((t) => t.role === 'user').length;
  const recap = lastDoneSummary(list);
  const lastUser = [...list].reverse().find((t) => t.role === 'user');

  const lines = [];
  if (topic) lines.push(`Topic: ${topic}`);
  lines.push(`Exchanges so far: ${exchanges}`);
  if (recap) lines.push(`Last recap: ${recap}`);
  else if (lastUser) lines.push(`Most recent request: ${oneLine(lastUser.text).slice(0, 240)}`);
  return clip(lines.join('\n'), maxChars);
}

/** Render a bounded plain transcript to feed the summarizer. */
function renderTranscript(turns) {
  const recent = turns.slice(-TRANSCRIPT_MAX_TURNS);
  return recent
    .map((t) => {
      const who = t.role === 'user' ? 'User' : 'Aurora';
      const text = oneLine(stripProtocolBlocks(t.text)).slice(0, TRANSCRIPT_MAX_CHARS_PER_TURN);
      return text ? `${who}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildWorkPrompt(transcript, maxChars) {
  return (
    `Below is a conversation between a user and Aurora (an AI research assistant). ` +
    `Another AI engine is about to take over the conversation. Write it a handoff ` +
    `briefing of at most ${maxChars} characters: what the work is about, what has been ` +
    `decided or produced, and what is still open or in progress. Be concrete and ` +
    `specific — name the actual topic and decisions, not generalities. Plain text or ` +
    `short bullet lines, no preamble, no greeting. Output only the briefing.\n\n` +
    `---\n${transcript}`
  );
}

/**
 * Summarize the work in `turns` for the incoming engine. On-demand `claude -p`
 * call, best-effort, falling back to the deterministic digest. `runClaude` is
 * injectable for tests.
 * @returns {Promise<string>} the summary text, or '' when there's nothing to say
 */
export async function summarizeWork(
  turns,
  { model = 'sonnet', bin, runClaude = runClaudeOnce, maxChars = SUMMARY_MAX_CHARS } = {},
) {
  const list = (Array.isArray(turns) ? turns : []).filter((t) => t && t.text);
  if (!list.length) return '';
  const fallback = deterministicDigest(list, { maxChars });
  const transcript = renderTranscript(list);
  if (!transcript) return fallback;
  let gist = null;
  try {
    gist = await runClaude(buildWorkPrompt(transcript, maxChars), model, bin);
  } catch {
    gist = null;
  }
  return gist ? clip(gist.trim(), maxChars) : fallback;
}

/** Compact, human-readable timestamp (UTC) for ledger display and briefings. */
export function formatWhen(iso) {
  if (!iso) return 'an earlier session';
  const s = String(iso);
  // ISO 8601 → "2026-06-08 14:03 UTC" without pulling in a date library.
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s);
  return m ? `${m[1]} ${m[2]} UTC` : s;
}

/**
 * Compose the briefing text injected into the new engine's system prompt.
 * @param {object} o
 * @param {string} o.engineId
 * @param {boolean} o.isFirst   first time this engine works in this directory
 * @param {object|null} o.lastRecord  the engine's prior dir record (for returning)
 * @param {string} o.summary    work-so-far synthesis (may be '')
 */
export function composeBriefing({ engineId, isFirst, lastRecord = null, summary = '' } = {}) {
  const who = `the ${engineId} engine`;
  const lines = [];
  if (isFirst) {
    lines.push(
      `HANDOFF BRIEFING — You (${who}) are taking over this Aurora conversation, and ` +
        `it's the first time you've worked in this project.`,
    );
    lines.push(
      `Aurora's identity, voice, and method brain are already in the system prompt ` +
        `above — treat them as yours. Pick the conversation up where it stands.`,
    );
  } else {
    const when = lastRecord?.lastActiveAt
      ? formatWhen(lastRecord.lastActiveAt)
      : 'an earlier session';
    const sess = lastRecord?.lastSessionId
      ? ` (session ${String(lastRecord.lastSessionId).slice(0, 8)})`
      : '';
    lines.push(`HANDOFF BRIEFING — You (${who}) are taking this conversation back over.`);
    lines.push(`You last worked in this project on ${when}${sess}.`);
    if (lastRecord?.lastTitle) lines.push(`That thread was about: "${lastRecord.lastTitle}".`);
  }
  if (summary) {
    lines.push('');
    lines.push('Work so far in the current conversation:');
    lines.push(summary);
  }
  lines.push('');
  lines.push(
    'Continue seamlessly: do not greet the user as if starting fresh, and do not ' +
      'repeat this briefing back to them.',
  );
  return lines.join('\n');
}

/**
 * A short, plain digest of the handoff for the TERMINAL, so the user can see
 * what carried over to the new engine. Returns an array of display lines.
 */
export function briefingDigestForUser({
  fromId,
  toId,
  isFirst,
  lastRecord = null,
  summary = '',
  hasStore = true,
} = {}) {
  const lines = [];
  const arrow = fromId && fromId !== toId ? `${fromId} → ${toId}` : toId;
  lines.push(`Handoff: ${arrow}`);
  if (!hasStore) {
    lines.push('No store enabled — this handoff is in-memory only (no cross-session recall).');
  } else if (isFirst) {
    lines.push(`${toId} is taking over this project for the first time — full init.`);
  } else if (lastRecord?.lastActiveAt) {
    lines.push(`${toId} last worked here ${formatWhen(lastRecord.lastActiveAt)}.`);
  }
  if (summary) {
    const first = summary.split('\n').map(oneLine).filter(Boolean)[0] || '';
    if (first) lines.push(`Briefed with: ${first.slice(0, 200)}`);
  } else {
    lines.push('Briefed with: continuity framing only (no work to summarize yet).');
  }
  return lines;
}
