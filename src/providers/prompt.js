/**
 * System-prompt composition. The Claude CLI only accepts injected context on a
 * fresh session (via --append-system-prompt), so everything Aurora wants the
 * model to know up front — its persona, the user's voice profile, the method
 * brain, and any resumed transcript — is concatenated here under hard budgets.
 *
 * Budgets keep the system prompt from ballooning: the user's voice profile and
 * the brain are clipped independently. The base persona and the seed transcript
 * (already bounded by the provider) are passed through whole. The voice profile
 * is ordered before the brain so that, if anything is cut, the user's identity
 * survives over the generic method.
 */

export const BRAIN_MAX_CHARS = 6000;
export const PERSONA_MAX_CHARS = 2000;

/** How many recent turns to carry as context when seeding a fresh session. */
export const SEED_MAX_TURNS = 12;
/** Cap each seeded turn so a long answer can't blow up the system prompt. */
export const SEED_MAX_CHARS = 4000;

/**
 * Aurora's persona — the identity injected at the top of a fresh session, the
 * SAME for every provider (Claude, Codex, …) so switching the backend still
 * feels like one Aurora. Kept short on purpose; the research workflow lives in
 * the method brain and the startup template, not buried in the system prompt.
 */
export const AURORA_PERSONA = [
  'You are Aurora, a research-oriented AI assistant running inside a terminal chat.',
  'You help the user run serious, well-cited research and think clearly.',
  'Favour primary sources with links and dates; when evidence is thin, say so',
  'explicitly rather than filling the gap with confident speculation.',
  'Surface contested or unsettled areas instead of papering over them.',
  'Keep prose tight. Use Markdown (headings, tables, lists, code blocks) since',
  'the terminal renders it. When a web lookup would materially improve an answer,',
  'use your web search / fetch tools.',
].join(' ');

/**
 * Interaction protocol, injected on a fresh session. It teaches the model to
 * talk back at turn boundaries: ask the user (via an `aurora:ask` block) instead
 * of guessing when a decision matters, and sign off a finished job with an
 * `aurora:done` recap block. Aurora parses these blocks (src/protocol.js),
 * renders the questions as a popup / numbered options, feeds the answers back,
 * and pushes the recap to Telegram. Provider-agnostic, like the persona.
 */
export const INTERACTION_PROTOCOL = [
  'INTERACTION PROTOCOL — you can talk back to the user, not just answer.',
  '',
  'When a decision, preference, or missing fact would change what you produce, do',
  'NOT guess or silently pick for the user. Stop and ask. End that message with',
  'exactly one fenced block as the very last thing (nothing after it):',
  '',
  '```aurora:ask',
  '{"questions":[{"header":"Short label","question":"Full question?","options":["Option A","Option B"],"multiSelect":false}]}',
  '```',
  '',
  'Asking rules:',
  '- Ask 1–4 questions at once. "options" is optional — omit it (or use []) for a',
  '  free-form answer. Set "multiSelect": true when several options can combine.',
  '- Put any human-readable framing in prose ABOVE the block; the block stays last.',
  '- Aurora shows these as a popup / numbered options and feeds the answers back to',
  '  you on the next turn, so just ask and wait — do not also guess the answer.',
  '- Never skip a question that genuinely needs the user’s input or judgement.',
  '',
  'When a task or job is finished and there is nothing left to ask, end the',
  'message with a recap block as the very last thing:',
  '',
  '```aurora:done',
  '{"summary":"One or two sentences on what you did.","actions":["Anything the user must do next"]}',
  '```',
  '',
  'Use "actions": [] when nothing is required from the user. Emit at most one',
  'aurora:ask OR one aurora:done block per message, always as the final content.',
].join('\n');

/**
 * @param {object} parts
 * @param {string} [parts.persona]         base Aurora persona (always kept)
 * @param {string} [parts.protocol]        interaction protocol (always kept)
 * @param {string} [parts.personaProfile]  user voice/characteristics instruction
 * @param {string} [parts.brain]           curated method digest
 * @param {string} [parts.seed]            resumed-transcript preamble
 * @returns {string}
 */
export function composeSystemPrompt({ persona, protocol, personaProfile, brain, seed } = {}) {
  const sections = [];
  if (persona) sections.push(String(persona).trim());
  // The protocol sits right after the persona and is never clipped — it's a
  // contract the model must follow on every turn, not optional background.
  if (protocol) sections.push(String(protocol).trim());
  if (personaProfile) sections.push(clip(String(personaProfile).trim(), PERSONA_MAX_CHARS));
  if (brain) sections.push(clip(String(brain).trim(), BRAIN_MAX_CHARS));
  if (seed) sections.push(String(seed).trim());
  return sections.filter(Boolean).join('\n\n');
}

/** Clip to at most `max` chars, preferring a line boundary, with a marker. */
function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastNl = cut.lastIndexOf('\n');
  const boundary = lastNl > max * 0.6 ? lastNl : cut.length;
  return cut.slice(0, boundary).trimEnd() + '\n…[truncated]';
}

/**
 * Render seeded turns as a bounded transcript for the fresh-session preamble.
 * Shared so any provider that recovers context from Aurora's own store (rather
 * than a native session) frames it identically. Each turn is already clipped by
 * the caller's seed(); this caps again defensively.
 */
export function seedPreamble(turns) {
  const body = (turns || [])
    .map((t) => {
      const who = t.role === 'user' ? 'User' : 'Aurora';
      const text = String(t.text).slice(0, SEED_MAX_CHARS);
      return `${who}: ${text}`;
    })
    .join('\n\n');
  return [
    'The following is the conversation so far, resumed from a saved session.',
    'Treat it as prior context and continue naturally — do not repeat it back.',
    '',
    '--- TRANSCRIPT START ---',
    body,
    '--- TRANSCRIPT END ---',
  ].join('\n');
}
