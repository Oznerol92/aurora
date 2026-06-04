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
