import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../src/store/json.js';
import { NoneStore } from '../src/store/none.js';
import { saveUserTurn, saveAssistantTurn, saveExchange } from '../src/store/persist.js';

function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-persist-'));
  return (async () => {
    const store = new JsonStore({ dataDir: dir });
    await store.open();
    try {
      await fn(store);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })();
}

test('saveUserTurn persists the question immediately, marked complete', async () => {
  await withStore(async (store) => {
    await saveUserTurn(store, 'sess', 'what is X?');
    const conv = await store.getConversation('sess');
    assert.equal(conv.length, 1);
    assert.equal(conv[0].role, 'user');
    assert.equal(conv[0].text, 'what is X?');
    assert.equal(conv[0].complete, true);
  });
});

test('saveAssistantTurn records a partial reply with complete:false', async () => {
  await withStore(async (store) => {
    await saveUserTurn(store, 'sess', 'q');
    await saveAssistantTurn(store, 'sess', 'half an ans', { model: 'claude' }, { complete: false });
    const conv = await store.getConversation('sess');
    assert.equal(conv.length, 2);
    assert.equal(conv[1].role, 'assistant');
    assert.equal(conv[1].complete, false);
    assert.equal(conv[1].model, 'claude');
  });
});

test('saveAssistantTurn defaults to complete:true', async () => {
  await withStore(async (store) => {
    await saveAssistantTurn(store, 'sess', 'done', {});
    const conv = await store.getConversation('sess');
    assert.equal(conv[0].complete, true);
  });
});

test('saveExchange writes a complete user→assistant pair in order', async () => {
  await withStore(async (store) => {
    await saveExchange(store, 'sess', 'hi', 'hello', { costUsd: 0.02 });
    const conv = await store.getConversation('sess');
    assert.deepEqual(
      conv.map((t) => [t.role, t.complete]),
      [
        ['user', true],
        ['assistant', true],
      ],
    );
    assert.equal(conv[1].costUsd, 0.02);
  });
});

test('persistence helpers no-op for the none store and missing session id', async () => {
  const none = new NoneStore();
  await none.open();
  // Should not throw and should write nothing the store can return.
  await saveUserTurn(none, 'sess', 'x');
  await saveAssistantTurn(none, 'sess', 'y', {});
  assert.deepEqual(await none.getConversation('sess'), []);

  await withStore(async (store) => {
    await saveUserTurn(store, null, 'x');
    await saveAssistantTurn(store, '', 'y', {});
    assert.deepEqual(await store.getConversation('sess'), []);
  });
});
