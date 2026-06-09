/**
 * Intent gate — Phase 1 (see docs/design/intent-gate.md).
 *
 * A skill reshapes a whole turn, so it should fire only when the user is asking
 * Aurora to DO the task — not when they're merely TALKING about it. `selectSkill`
 * matches on keyword overlap alone, which let a message *about* the write-article
 * skill ("it's using write article skill…") fire that skill. This gate is the cheap,
 * deterministic check that stops that: no model call, biased toward NOT firing
 * (a false "don't fire" costs only an explicit `/skill use <id>`, the bug it
 * prevents — a skill hijacking the turn — is the expensive case).
 *
 * Two suppression signals:
 *   - meta-reference: the message names the skill machinery ("the X skill",
 *     "using … skill", "/skill", or the skill's own id/title) — it's discussing
 *     skills, not requesting one;
 *   - discuss intent: the message is a question or brainstorm ("should we…",
 *     "maybe we…", "wdyt"), not a command.
 * Anything else is allowed through to the score threshold, unchanged.
 */

// The message is a question / proposal / musing rather than a work order.
const DISCUSS_CUES = [
  /\bshould (i|we|it|aurora)\b/,
  /\bwhat (do you think|about|if|should)\b/,
  /\bwdyt\b/,
  /\bthoughts?\?/,
  /\bany (ideas?|thoughts?)\b/,
  /\bbrainstorm/,
  /\bi'?m thinking\b/,
  /\bidea:\s/,
  /\bmaybe we\b/,
  /\bcould we\b/,
  /\bwondering\b/,
  /\bnot writing\b/,
];

// Verbs that operate ON a skill (so "skill" here is the machinery, not a topic).
const SKILL_VERBS =
  'use|uses|using|used|fire|fires|firing|fired|misfire|misfires|misfiring|' +
  'trigger|triggers|triggered|invoke|invokes|invoking|call|calls|calling|' +
  'need|needs|want|wants|pick|picks|run|runs|running';

/** Does the message refer to the SKILL SYSTEM (vs. just requesting a task)? */
export function referencesSkill(message, skill = null) {
  const m = String(message ?? '').toLowerCase();
  if (!m) return false;
  if (/\/skill\b/.test(m)) return true;
  // "the/this/a/your/which … skill" (singular "skill" only — "skills" as a topic,
  // e.g. "negotiation skills", is not a machinery reference).
  if (/\b(the|this|that|a|an|your|its|which|what)\b[\w\s'-]{0,25}\bskill\b/.test(m)) return true;
  // a skill-operating verb just before the word "skill".
  if (new RegExp(`\\b(${SKILL_VERBS})\\b[\\w\\s'-]{0,25}\\bskill\\b`).test(m)) return true;
  // "skill" followed by behaviour words ("skill keeps firing", "skill fired wrong").
  if (
    /\bskill\b[\w\s'-]{0,25}\b(fire|fires|firing|fired|misfire|trigger|triggers|triggered|wrong|instead|again|keeps|kicked)\b/.test(
      m,
    )
  )
    return true;
  // the skill named explicitly by its id. We do NOT match the title: a skill's
  // title is often the natural request phrasing itself ("write an article"), so
  // matching it would suppress the very requests we want to allow. An id (e.g.
  // "write-article", hyphenated) rarely appears verbatim in a genuine request.
  const id = (skill?.id || '').toLowerCase();
  if (id && m.includes(id)) return true;
  return false;
}

/** Is the message discussing/brainstorming rather than commanding? */
export function intentIsDiscuss(message) {
  const m = String(message ?? '').toLowerCase();
  return DISCUSS_CUES.some((re) => re.test(m));
}

/**
 * Should a matched skill be allowed to auto-fire for this message? True unless the
 * message references the skill machinery or reads as discussion. Empty/blank input
 * defers to the caller (returns true) so the score threshold stays the only gate.
 */
export function shouldAutoFireSkill(message, skill = null) {
  const m = String(message ?? '').trim();
  if (!m) return true;
  if (referencesSkill(m, skill)) return false;
  if (intentIsDiscuss(m)) return false;
  return true;
}

// Cues that the message is a request to ACT (do work now), not to discuss it. Kept
// deliberately tight: a clear action signal, so ambiguous messages fall through to
// 'ambiguous' and rest at PLAN (the turn-mode default) rather than over-acting.
const ACTION_CUES = [
  // a leading imperative verb (optionally "please …").
  /^\s*(please\s+|pls\s+|just\s+)?(fix|add|implement|build|create|make|write|draft|refactor|run|ship|update|change|remove|delete|rename|move|install|wire|hook|generate|commit|push|deploy|apply|migrate|rewrite|do)\b/i,
  // an explicit go-ahead.
  /\b(go ahead|do it|just do it|make it so|let'?s do it|go for it|ship it|build it)\b/i,
];

/** Is the message phrased as a request to act (do work now)? */
export function intentIsAction(message) {
  return ACTION_CUES.some((re) => re.test(String(message ?? '')));
}

/**
 * Classify a message's intent for turn-mode: 'act' (do it now), 'discuss' (talk it
 * through), or 'ambiguous' (neither clear). Discuss cues win over action cues — a
 * question ABOUT doing something ("should we fix X?") is discussion, not a command.
 */
export function classifyIntent(message) {
  const m = String(message ?? '').trim();
  if (!m) return 'discuss';
  if (intentIsDiscuss(m)) return 'discuss';
  if (intentIsAction(m)) return 'act';
  return 'ambiguous';
}
