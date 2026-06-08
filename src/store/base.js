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

  /**
   * Persona: the user's voice/characteristics profile, one row per `scope`.
   * Returns the stored object (or null). No-op backends return null.
   * @param {string} _scope
   */
  async getPersona(_scope = 'default') {
    return null;
  }

  /**
   * Merge `fields` into the persona for `scope` and persist. Returns the merged
   * object (or null when the backend doesn't persist).
   * @param {string} _scope @param {object} _fields
   */
  async savePersona(_scope = 'default', _fields = {}) {
    return null;
  }

  /**
   * Engine ledger: a single structured record of which engines have fronted
   * Aurora's conversation, when each was first seen, and the last conversation
   * per working directory. Powers the cross-engine handoff briefing (so a
   * switched-in engine arrives up to speed). Returns the stored object (or null).
   * The shape is opaque to the store; see src/engines/ledger.js.
   */
  async getEngineLedger() {
    return null;
  }

  /**
   * Persist the whole engine ledger object. No-op backends drop it (the briefing
   * still works from the live transcript, it just doesn't carry across sessions).
   * @param {object} _ledger
   */
  async saveEngineLedger(_ledger) {
    return null;
  }
}
