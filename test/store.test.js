import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDataDir } from '../src/store/location.js';
import { JsonStore } from '../src/store/json.js';
import { configDir } from '../src/config.js';

test('resolveDataDir: explicit dataDir wins over everything', () => {
  assert.equal(resolveDataDir({ dataDir: '/tmp/custom', scope: 'project' }), '/tmp/custom');
});

test('resolveDataDir: project scope is a .aurora in the cwd', () => {
  assert.equal(resolveDataDir({ scope: 'project' }), join(process.cwd(), '.aurora'));
});

test('resolveDataDir: default scope is the global config data dir', () => {
  assert.equal(resolveDataDir({}), join(configDir, 'data'));
});

test('JsonStore round-trips turns and lists conversations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-store-'));
  try {
    const store = new JsonStore({ dataDir: dir });
    await store.open();
    assert.ok(existsSync(dir), 'open() creates the data dir');

    await store.saveTurn('sess-1', { role: 'user', text: 'hi', ts: '2026-06-01T10:00:00Z' });
    await store.saveTurn('sess-1', {
      role: 'assistant',
      text: 'hello',
      ts: '2026-06-01T10:00:01Z',
    });
    await store.saveTurn('sess-2', { role: 'user', text: 'other', ts: '2026-06-01T11:00:00Z' });

    const conv = await store.getConversation('sess-1');
    assert.equal(conv.length, 2);
    assert.equal(conv[0].role, 'user');
    assert.equal(conv[1].text, 'hello');

    const list = await store.listConversations();
    assert.equal(list.length, 2);
    const one = list.find((c) => c.sessionId === 'sess-1');
    assert.equal(one.turns, 2);
    assert.equal(one.updatedAt, '2026-06-01T10:00:01Z');

    // A fresh store over the same dir reads the persisted data back.
    const reopened = new JsonStore({ dataDir: dir });
    await reopened.open();
    assert.equal((await reopened.getConversation('sess-1')).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getConversation returns [] for an unknown session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-store-'));
  try {
    const store = new JsonStore({ dataDir: dir });
    await store.open();
    assert.deepEqual(await store.getConversation('nope'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
