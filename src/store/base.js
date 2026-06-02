/**
 * Store interface — optional conversation persistence.
 *
 * Aurora is stateless by default. If the user opts in (config.store), the CLI
 * records each completed turn so conversations survive restarts. Like providers,
 * stores are pluggable: implement this contract and register it in index.js.
 *
 * Contract:
 *   - open()                       prepare the backend (create files/tables). Idempotent.
 *   - saveTurn(sessionId, turn)    persist one { role, text, ts, model?, costUsd? }
 *   - getConversation(sessionId)   return ordered array of turns (or [])
 *   - listConversations()          return [{ sessionId, turns, updatedAt, title? }]
 *                                  (title = first user message, for previews)
 *   - close()                      flush/close handles. Idempotent.
 *
 * All methods may be async. Implementations must never throw from a failed
 * write in a way that takes down the chat — persistence is best-effort.
 */
export class Store {
  static id = 'base';
  static label = 'Base';

  constructor(config = {}) {
    this.config = config;
  }

  async open() {}
  async saveTurn(_sessionId, _turn) {}
  async getConversation(_sessionId) {
    return [];
  }
  async listConversations() {
    return [];
  }
  async close() {}
}
