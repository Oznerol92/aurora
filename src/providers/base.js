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

  /**
   * Adopt an existing session so the next turn continues it. Used by /resume to
   * pick a saved conversation back up. Providers that can't resume should leave
   * this as a no-op (the CLI tells the user resuming isn't supported).
   * @param {string} _sessionId
   * @returns {boolean} whether the session was adopted
   */
  resume(_sessionId) {
    return false;
  }

  /**
   * Adopt a stored transcript as fallback context, so a provider can recover if
   * a native resume turns out to be stale. No-op by default.
   * @param {Array<{role:string, text:string}>} _turns
   * @returns {boolean} whether any context was taken
   */
  seed(_turns) {
    return false;
  }

  /**
   * Cancel the in-flight turn (e.g. on Ctrl-C). Implementations should stop the
   * underlying request and let `send()` end cleanly so the caller keeps any
   * partial output. No-op by default.
   * @returns {boolean} whether anything was cancelled
   */
  abort() {
    return false;
  }

  /**
   * Supply the curated method "brain" cards. The provider builds an always-on
   * index from them and retrieves the most relevant per turn. No-op by default.
   * @param {Array<object>} _cards
   */
  setBrainCards(_cards) {}

  /**
   * Supply the user's voice/characteristics instruction to inject on the next
   * fresh session. No-op by default. @param {string|null} _text
   */
  setPersona(_text) {}

  /** Short, display-friendly session identifier (or null). */
  shortSession() {
    return null;
  }

  /** Provider/model description for the UI. */
  describe() {
    return this.constructor.label;
  }

  /**
   * The config field this provider reads its model from, so `/model` can target
   * the active backend (model names aren't portable across providers). Defaults
   * to "model"; providers with their own key (e.g. Codex) override this.
   */
  modelKey() {
    return 'model';
  }
}
