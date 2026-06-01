import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { Store } from './base.js';
import { configDir } from '../config.js';

/**
 * SQLite store, backed by better-sqlite3. That package ships a native binding,
 * so it's an OPTIONAL dependency — installed only if the user wants it:
 *
 *     npm install better-sqlite3
 *
 * We lazy-import it inside open() so the rest of Aurora keeps working (and
 * `npm install` stays lean) when SQLite isn't selected.
 */
export class SqliteStore extends Store {
  static id = 'sqlite';
  static label = 'SQLite (better-sqlite3)';

  constructor(config = {}) {
    super(config);
    const dir = config.dataDir || join(configDir, 'data');
    this.path = join(dir, 'aurora.sqlite');
    this.dir = dir;
    this.db = null;
  }

  async open() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    let Database;
    try {
      ({ default: Database } = await import('better-sqlite3'));
    } catch {
      throw new Error(
        "store 'sqlite' requires the optional dependency 'better-sqlite3'. " +
          "Install it with `npm install better-sqlite3`, or set store to 'json'.",
      );
    }
    this.db = new Database(this.path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role       TEXT NOT NULL,
        text       TEXT NOT NULL,
        ts         TEXT NOT NULL,
        model      TEXT,
        cost_usd   REAL
      );
      CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
    `);
  }

  async saveTurn(sessionId, turn) {
    if (!sessionId || !this.db) return;
    // Parameterized — no string interpolation, so no SQL injection.
    this.db
      .prepare(
        'INSERT INTO turns (session_id, role, text, ts, model, cost_usd) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(sessionId, turn.role, turn.text, turn.ts, turn.model ?? null, turn.costUsd ?? null);
  }

  async getConversation(sessionId) {
    if (!this.db) return [];
    return this.db
      .prepare('SELECT role, text, ts, model, cost_usd AS costUsd FROM turns WHERE session_id = ? ORDER BY id')
      .all(sessionId);
  }

  async listConversations() {
    if (!this.db) return [];
    return this.db
      .prepare(
        'SELECT session_id AS sessionId, COUNT(*) AS turns, MAX(ts) AS updatedAt FROM turns GROUP BY session_id',
      )
      .all();
  }

  async close() {
    this.db?.close();
    this.db = null;
  }
}
