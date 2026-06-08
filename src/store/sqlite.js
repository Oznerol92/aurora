import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { Store } from './base.js';
import { resolveDataDir } from './location.js';

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
    const dir = resolveDataDir(config);
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
        cost_usd   REAL,
        complete   INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);

      CREATE TABLE IF NOT EXISTS persona (
        scope      TEXT PRIMARY KEY,
        data       TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS engine_ledger (
        scope      TEXT PRIMARY KEY,
        data       TEXT NOT NULL,
        updated_at TEXT
      );
    `);
    this.#migrate();
  }

  // Additive, idempotent migrations for databases created by older versions.
  // `complete` (v0.3.3) marks interrupted/partial turns; rows that predate it
  // default to complete. The `persona` (v0.3.4) and `engine_ledger` (v0.3.9)
  // tables are created by open()'s CREATE TABLE IF NOT EXISTS, so older DBs gain
  // them on open with no data loss. PRAGMA user_version tracks the schema:
  // 1 = turns.complete, 2 = persona, 3 = engine_ledger.
  #migrate() {
    const cols = this.db
      .prepare('PRAGMA table_info(turns)')
      .all()
      .map((c) => c.name);
    if (!cols.includes('complete')) {
      this.db.exec('ALTER TABLE turns ADD COLUMN complete INTEGER NOT NULL DEFAULT 1');
    }
    this.db.pragma('user_version = 3');
  }

  async getPersona(scope = 'default') {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT data FROM persona WHERE scope = ?').get(scope);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  async savePersona(scope = 'default', fields = {}) {
    if (!this.db) return null;
    const current = (await this.getPersona(scope)) || {};
    const next = { ...current, ...fields, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `INSERT INTO persona (scope, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(scope, JSON.stringify(next), next.updatedAt);
    return next;
  }

  async getEngineLedger() {
    if (!this.db) return null;
    const row = this.db.prepare("SELECT data FROM engine_ledger WHERE scope = 'default'").get();
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  async saveEngineLedger(ledger) {
    if (!this.db) return null;
    const at = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO engine_ledger (scope, data, updated_at) VALUES ('default', ?, ?)
         ON CONFLICT(scope) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(ledger || {}), at);
    return ledger || {};
  }

  async saveTurn(sessionId, turn) {
    if (!sessionId || !this.db) return;
    // Parameterized — no string interpolation, so no SQL injection.
    this.db
      .prepare(
        'INSERT INTO turns (session_id, role, text, ts, model, cost_usd, complete) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        sessionId,
        turn.role,
        turn.text,
        turn.ts,
        turn.model ?? null,
        turn.costUsd ?? null,
        turn.complete === false ? 0 : 1,
      );
  }

  async getConversation(sessionId) {
    if (!this.db) return [];
    return this.db
      .prepare(
        'SELECT role, text, ts, model, cost_usd AS costUsd, complete FROM turns WHERE session_id = ? ORDER BY id',
      )
      .all(sessionId)
      .map((r) => ({ ...r, complete: r.complete !== 0 }));
  }

  async listConversations() {
    if (!this.db) return [];
    return this.db
      .prepare(
        `SELECT session_id AS sessionId, COUNT(*) AS turns, MAX(ts) AS updatedAt,
                (SELECT text FROM turns f
                  WHERE f.session_id = t.session_id AND f.role = 'user'
                  ORDER BY id LIMIT 1) AS title
           FROM turns t GROUP BY session_id`,
      )
      .all();
  }

  async close() {
    this.db?.close();
    this.db = null;
  }
}
