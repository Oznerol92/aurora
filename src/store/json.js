import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from './base.js';
import { configDir } from '../config.js';

/**
 * JSON-file store. Zero native dependencies, fully portable. Fine for the
 * scale of a personal research log; for very large histories prefer 'sqlite'.
 *
 * Data shape: { conversations: { [sessionId]: { turns: [...], updatedAt } } }
 */
export class JsonStore extends Store {
  static id = 'json';
  static label = 'JSON file';

  constructor(config = {}) {
    super(config);
    const dir = config.dataDir || join(configDir, 'data');
    this.path = join(dir, 'conversations.json');
    this.dir = dir;
    this.data = { conversations: {} };
  }

  async open() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (existsSync(this.path)) {
      try {
        this.data = JSON.parse(readFileSync(this.path, 'utf8'));
        this.data.conversations ||= {};
      } catch {
        // Corrupt file: start clean rather than crash the chat.
        this.data = { conversations: {} };
      }
    }
  }

  async saveTurn(sessionId, turn) {
    if (!sessionId) return;
    const conv = (this.data.conversations[sessionId] ||= { turns: [], updatedAt: null });
    conv.turns.push(turn);
    conv.updatedAt = turn.ts;
    this.#flush();
  }

  async getConversation(sessionId) {
    return this.data.conversations[sessionId]?.turns ?? [];
  }

  async listConversations() {
    return Object.entries(this.data.conversations).map(([sessionId, c]) => ({
      sessionId,
      turns: c.turns.length,
      updatedAt: c.updatedAt,
    }));
  }

  // Atomic write: serialize to a temp file then rename, so a crash mid-write
  // can't truncate the real file.
  #flush() {
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
