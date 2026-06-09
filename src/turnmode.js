/**
 * Turn mode — act vs. discuss (intent gate Phase 2). See docs/design/intent-gate.md.
 *
 * PLAN is the resting state; ACT is a bounded excursion. Each turn independently
 * decides whether to ACT from the session mode + the message, so Aurora can never
 * "keep charging" — there is no sticky ACT to revert. A one-shot `/go` forces ACT
 * for the next turn only (the caller clears it after consuming).
 *
 * What ACT vs PLAN changes (narrow v1 scope): whether a skill may auto-fire, and a
 * one-line framing prepended to the turn that tells the model to carry out the task
 * (ACT) or to discuss/propose and confirm-before-acting (PLAN). It does NOT yet gate
 * arbitrary tool use or outward-facing ops — deferred until observed in use.
 */

import { classifyIntent } from './skills/intent.js';

/** Session modes the user can set. `auto` decides per turn; `plan` forces discuss. */
export const TURN_MODES = ['auto', 'plan'];

export function isTurnMode(m) {
  return TURN_MODES.includes(m);
}

/**
 * Should THIS turn act? `forceGo` (a one-shot `/go`) always acts. In `plan` the turn
 * never auto-acts. In `auto`, only a clearly action-phrased message acts — a
 * question, brainstorm, or anything ambiguous rests at PLAN.
 */
export function turnIsAct(sessionMode, message, { forceGo = false } = {}) {
  if (forceGo) return true;
  if (sessionMode === 'plan') return false;
  return classifyIntent(message) === 'act';
}

const ACT_FRAMING =
  '[Aurora turn-mode: ACT — the user is asking you to do this now. Carry out the ' +
  "task and give a brief recap; don't ask permission for what was clearly requested.]";

const PLAN_FRAMING =
  '[Aurora turn-mode: PLAN — discuss, propose, and lay out options. Do NOT execute, ' +
  'produce a final deliverable, or run a skill unless the user clearly asked. If it ' +
  'looks like they may want you to act, confirm in one line first rather than ' +
  'charging ahead. A dismissed or unanswered question is not consent to proceed.]';

/** The one-line mode framing prepended to a turn. */
export function modeFraming(act) {
  return act ? ACT_FRAMING : PLAN_FRAMING;
}
