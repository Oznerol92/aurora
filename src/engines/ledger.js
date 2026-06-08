/**
 * Engine ledger — the cross-engine memory behind the handoff briefing.
 *
 * It records, per engine (keyed by provider id, e.g. `claude` / `codex`):
 *   - `firstSeen`: when this engine first fronted Aurora anywhere (≈ "when the
 *     model was added"), set once and never moved.
 *   - `dirs[<cwd>]`: the last conversation this engine worked on in a given
 *     working directory — `{ lastSessionId, lastActiveAt, lastTitle }`.
 *
 * The recall key is the working directory (process.cwd()), so "last conversation
 * on this project/directory" is answerable now. Topic-level clustering is a
 * later phase (see docs/design/handoff-briefing.md).
 *
 * The shape is opaque to the Store (it persists/returns the whole blob); all the
 * merge logic lives here so both the JSON and SQLite stores stay dumb. These
 * pure helpers are easy to unit-test; callers pass `at` (an ISO timestamp) so
 * the functions stay deterministic.
 */

/** A normalized, empty ledger. */
export const EMPTY_LEDGER = { engines: {} };

/** Coerce any stored value into a well-formed ledger ({ engines: {...} }). */
export function normalizeLedger(ledger) {
  const l = ledger && typeof ledger === 'object' ? ledger : {};
  const engines = l.engines && typeof l.engines === 'object' ? l.engines : {};
  return { engines };
}

/** The whole record for one engine, or null if never seen. */
export function engineRecord(ledger, engineId) {
  return normalizeLedger(ledger).engines[engineId] || null;
}

/** The per-directory record for one engine, or null. */
export function dirRecord(ledger, engineId, dir) {
  const rec = engineRecord(ledger, engineId);
  return (rec && rec.dirs && rec.dirs[dir]) || null;
}

/**
 * Whether `engineId` has never worked in `dir` before — the trigger for the
 * fuller "first time in this project" onboarding briefing.
 */
export function isFirstVisit(ledger, engineId, dir) {
  return !dirRecord(ledger, engineId, dir);
}

/**
 * Return a new ledger with `engineId`'s visit to `dir` recorded: stamps
 * `firstSeen` once (the first time the engine is seen at all) and overwrites the
 * directory's last-conversation pointer. Pure — does not mutate the input.
 * @param {object} ledger
 * @param {string} engineId
 * @param {string} dir
 * @param {{sessionId?:string|null, title?:string, at:string}} info
 */
export function recordVisit(ledger, engineId, dir, { sessionId = null, title = '', at } = {}) {
  // Deep copy via JSON — the ledger is plain JSON-serializable data — so the
  // function stays pure and never mutates the caller's ledger.
  const next = normalizeLedger(JSON.parse(JSON.stringify(normalizeLedger(ledger))));
  const eng = (next.engines[engineId] ||= { firstSeen: at, dirs: {} });
  eng.firstSeen ||= at;
  eng.dirs ||= {};
  eng.dirs[dir] = { lastSessionId: sessionId, lastActiveAt: at, lastTitle: title || '' };
  return next;
}

/** Load and normalize the ledger from a store (best-effort; never throws). */
export async function loadLedger(store) {
  try {
    return normalizeLedger(await store?.getEngineLedger?.());
  } catch {
    return normalizeLedger(null);
  }
}

/** Persist a ledger through a store (best-effort; never throws). */
export async function saveLedger(store, ledger) {
  try {
    await store?.saveEngineLedger?.(normalizeLedger(ledger));
  } catch {
    // Persistence is opt-in and best-effort — a failed write must not break a
    // switch. The briefing for THIS switch was already composed in memory.
  }
}
