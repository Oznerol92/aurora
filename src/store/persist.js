/**
 * Conversation persistence helpers, shared by the REPL (src/cli.js) and the
 * Telegram bridge so both record turns the same way.
 *
 * Crash/interrupt safety (v0.3.3): the user turn is saved as soon as it's
 * submitted — before the model is even called — so an interrupt or crash mid
 * answer can't lose the question. The assistant turn is saved when it finishes;
 * if it's cut short, it's saved with `complete: false` so /resume can show it
 * (and the model can continue from it).
 *
 * Every write is best-effort: a failed write never propagates (persistence must
 * not break a live chat). All of these no-op for the stateless 'none' store or a
 * missing session id.
 */

function persists(store, sessionId) {
  return Boolean(store) && store.constructor.id !== 'none' && Boolean(sessionId);
}

/** Persist the user's message immediately, before the model is called. */
export async function saveUserTurn(store, sessionId, text) {
  if (!persists(store, sessionId)) return;
  try {
    await store.saveTurn(sessionId, {
      role: 'user',
      text,
      ts: new Date().toISOString(),
      complete: true,
    });
  } catch {
    // best-effort
  }
}

/**
 * Persist the assistant's reply. Pass `{ complete: false }` when the turn was
 * interrupted or errored mid-stream so it's recorded as partial.
 */
export async function saveAssistantTurn(
  store,
  sessionId,
  text,
  meta = {},
  { complete = true } = {},
) {
  if (!persists(store, sessionId)) return;
  try {
    await store.saveTurn(sessionId, {
      role: 'assistant',
      text,
      ts: new Date().toISOString(),
      model: meta?.model,
      costUsd: meta?.costUsd,
      complete,
    });
  } catch {
    // best-effort
  }
}

/**
 * Save a complete user→assistant exchange. Convenience wrapper kept for callers
 * that have both halves in hand at once; interactive paths prefer the split
 * saveUserTurn / saveAssistantTurn so a half-finished turn still survives.
 */
export async function saveExchange(store, sessionId, userText, assistantText, meta = {}) {
  await saveUserTurn(store, sessionId, userText);
  await saveAssistantTurn(store, sessionId, assistantText, meta, { complete: true });
}
