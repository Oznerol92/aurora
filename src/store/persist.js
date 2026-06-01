/**
 * Save one user→assistant exchange to the store under `sessionId`. Shared by the
 * REPL (src/cli.js) and the Telegram bridge so both record turns the same way.
 * Best-effort: a failed write never propagates (persistence must not break a
 * live chat). No-ops for the stateless 'none' store or a missing session id.
 */
export async function saveExchange(store, sessionId, userText, assistantText, meta = {}) {
  if (!store || store.constructor.id === 'none' || !sessionId) return;
  const ts = new Date().toISOString();
  try {
    await store.saveTurn(sessionId, { role: 'user', text: userText, ts });
    await store.saveTurn(sessionId, {
      role: 'assistant',
      text: assistantText,
      ts,
      model: meta?.model,
      costUsd: meta?.costUsd,
    });
  } catch {
    // best-effort
  }
}
