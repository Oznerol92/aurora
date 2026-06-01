/**
 * Provider interface.
 *
 * A provider is a backend that turns a stream of user turns into a stream of
 * assistant events. Aurora's CLI is provider-agnostic: it only depends on the
 * shape defined here, so adding a new AI (OpenAI, Gemini, a local model, ...)
 * means dropping a new file in this folder and registering it in index.js —
 * nothing in the UI layer changes.
 *
 * Implementations should subclass `Provider` (or just duck-type it).
 *
 * The contract of `send()`:
 *   - Takes the user's text for this turn.
 *   - Returns an async iterator that yields event objects:
 *       { type: 'status', text }   — transient activity (e.g. "searching web")
 *       { type: 'delta',  text }   — a chunk of assistant text, as it streams
 *       { type: 'done',   text, costUsd?, model?, sessionId? } — final summary
 *   - The provider is responsible for maintaining conversation continuity
 *     across successive `send()` calls until `reset()` is invoked.
 */
export class Provider {
  /** Stable id, e.g. "claude". */
  static id = 'base';
  /** Human-facing name shown in the UI. */
  static label = 'Base';
  /** Whether this provider is actually wired up. */
  static implemented = false;

  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Send one user turn. Must return an async iterable of event objects.
   * @param {string} _text
   * @returns {AsyncIterable<{type:string, text?:string}>}
   */
  // eslint-disable-next-line require-yield
  async *send(_text) {
    throw new Error(`${this.constructor.id}: send() not implemented`);
  }

  /** Start a fresh conversation (drop any session state). */
  reset() {}

  /** Short, display-friendly session identifier (or null). */
  shortSession() {
    return null;
  }

  /** Provider/model description for the UI. */
  describe() {
    return this.constructor.label;
  }
}
