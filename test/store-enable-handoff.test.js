// Turning persistence on mid-session must update the read path's state, not just
// swap the store object. Regression for a bug where `/store <id>` from a stateless
// start left `ctx.hasStore` false, so the next `/engine` handoff reported "No store
// enabled" and briefed the incoming engine with nothing — losing the work so far.
//
// Sandbox the config dir via AURORA_CONFIG_DIR BEFORE importing cli.js, so the
// store, active-session pointer, and ledger all land under a temp dir. node --test
// isolates each test file in its own process, so this env set is safe here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = mkdtempSync(join(tmpdir(), 'aurora-store-enable-'));
process.env.AURORA_CONFIG_DIR = CONFIG_DIR;

const { handleCommand } = await import('../src/cli.js');
const { readActiveSession } = await import('../src/store/session.js');
const { loadLedger, dirRecord } = await import('../src/engines/ledger.js');

/** A stateless launch ctx: store `none`, hasStore false, a live claude session. */
function statelessCtx() {
  return {
    config: { store: 'none', storeScope: 'global' },
    store: { constructor: { id: 'none' }, close: async () => {} },
    hasStore: false,
    sessionId: 'sess-banana',
    provider: { constructor: { id: 'claude' } },
  };
}

async function run(input, ctx) {
  const log = console.log;
  console.log = () => {};
  try {
    return await handleCommand(input, ctx);
  } finally {
    console.log = log;
  }
}

test('/store from a stateless start flips ctx.hasStore so the read path sees the store', async () => {
  const ctx = statelessCtx();
  await run('/store json', ctx);

  assert.equal(ctx.config.store, 'json', 'config records the new store');
  assert.equal(ctx.hasStore, true, 'hasStore is synced — the handoff/briefing path keys off this');
  assert.equal(ctx.store.constructor.id, 'json', 'the live store object is swapped in');
});

test('/store from a stateless start adopts the live session and records the engine visit', async () => {
  const ctx = statelessCtx();
  await run('/store json', ctx);

  assert.equal(
    readActiveSession(ctx.config),
    'sess-banana',
    'the live session becomes the shared active thread, so cross-session recall works',
  );

  const ledger = await loadLedger(ctx.store);
  const rec = dirRecord(ledger, 'claude', process.cwd());
  assert.ok(rec, 'the launching engine is stamped in the ledger on store-on');
  assert.equal(rec.lastSessionId, 'sess-banana', 'the visit carries the live session id');
});

test.after(() => rmSync(CONFIG_DIR, { recursive: true, force: true }));
