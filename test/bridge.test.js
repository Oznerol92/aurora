import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleUpdate } from '../src/bridge/telegram.js';
import { JsonStore } from '../src/store/json.js';
import { readActiveSession } from '../src/store/session.js';

// Project scope + temp cwd, so both the store and the active-session pointer
// land in an isolated ./.aurora.
async function withProjectDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-bridge-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await fn();
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

function fakeProvider() {
  return {
    sessionId: 'sess-1',
    started: false,
    resume(s) {
      this.sessionId = s;
      this.started = true;
      return true;
    },
    reset() {
      this.sessionId = 'sess-2';
      this.started = false;
    },
    async *send(text) {
      yield { type: 'delta', text: 'Ans: ' };
      yield { type: 'delta', text: String(text).toUpperCase() };
      yield { type: 'done', text: '', sessionId: this.sessionId, costUsd: 0.01, model: 'claude' };
    },
  };
}

function makeCtx(store, provider) {
  const captured = { replies: [], typing: 0 };
  const ctx = {
    provider,
    config: { storeScope: 'project' },
    store,
    hasStore: true,
    state: { sessionId: provider.sessionId },
    authorizedChatId: '42',
    log: () => {},
    notify: (t) => captured.replies.push(t),
    typing: () => {
      captured.typing += 1;
    },
  };
  return { ctx, captured };
}

const fromOwner = (text) => ({ message: { chat: { id: 42 }, text } });

test('an authorized message is answered, typed, and persisted to the shared session', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const { ctx, captured } = makeCtx(store, fakeProvider());

    await handleUpdate(fromOwner('hello'), ctx);

    assert.equal(captured.typing, 1, 'showed a typing indicator');
    assert.equal(captured.replies.length, 1);
    assert.match(captured.replies[0], /Ans: HELLO/);

    const conv = await store.getConversation('sess-1');
    assert.equal(conv.length, 2);
    assert.equal(conv[0].role, 'user');
    assert.equal(conv[0].text, 'hello');
    assert.equal(conv[1].role, 'assistant');
    assert.match(conv[1].text, /HELLO/);
  });
});

test('a message from an unauthorized chat is ignored (no reply, no persist)', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const { ctx, captured } = makeCtx(store, fakeProvider());

    await handleUpdate({ message: { chat: { id: 999 }, text: 'let me in' } }, ctx);

    assert.equal(captured.replies.length, 0);
    assert.equal(captured.typing, 0);
    assert.deepEqual(await store.getConversation('sess-1'), []);
  });
});

test('/new rotates the shared session and records the new active id', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const provider = fakeProvider();
    const { ctx, captured } = makeCtx(store, provider);

    await handleUpdate(fromOwner('/new'), ctx);

    assert.match(captured.replies[0], /fresh conversation/i);
    assert.equal(provider.sessionId, 'sess-2', 'provider was reset');
    assert.equal(ctx.state.sessionId, 'sess-2');
    assert.equal(readActiveSession({ storeScope: 'project' }), 'sess-2');
  });
});

test('a failed turn warns, and keeps the user message but no assistant reply', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const provider = {
      sessionId: 'sess-err',
      resume() {},
      reset() {},
      // eslint-disable-next-line require-yield
      async *send() {
        throw new Error('boom');
      },
    };
    const { ctx, captured } = makeCtx(store, provider);

    await handleUpdate(fromOwner('question'), ctx);

    assert.match(captured.replies[0], /⚠️/);
    // Crash-safety: the question is persisted up front so it isn't lost, but the
    // failed turn produces no assistant reply.
    const conv = await store.getConversation('sess-err');
    assert.equal(conv.length, 1);
    assert.equal(conv[0].role, 'user');
    assert.equal(conv[0].text, 'question');
  });
});
