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

// A provider that asks a question on its first turn, then finishes once the
// answer comes back. Records the text of the follow-up turn for assertions.
function askingProvider() {
  return {
    sessionId: 'sess-ask',
    started: false,
    turn: 0,
    lastReceived: null,
    resume(s) {
      this.sessionId = s;
      this.started = true;
      return true;
    },
    reset() {
      this.sessionId = 'sess-ask2';
      this.started = false;
    },
    async *send(text) {
      this.turn += 1;
      this.lastReceived = text;
      if (this.turn === 1) {
        yield {
          type: 'delta',
          text:
            'Happy to. One thing first.\n\n```aurora:ask\n' +
            '{"questions":[{"header":"DB","question":"Which database?","options":["Postgres","SQLite"],"multiSelect":false}]}\n```',
        };
        yield { type: 'done', text: '', sessionId: this.sessionId };
      } else {
        yield { type: 'delta', text: 'Using ' + String(text) };
        yield { type: 'done', text: '', sessionId: this.sessionId };
      }
    },
  };
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

test('an ask block sends numbered options, strips JSON, and sets a pending question', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const provider = askingProvider();
    const { ctx, captured } = makeCtx(store, provider);

    await handleUpdate(fromOwner('build me an app'), ctx);

    // Prose first (block stripped), then the numbered question.
    assert.equal(captured.replies.length, 2);
    assert.match(captured.replies[0], /One thing first/);
    assert.doesNotMatch(captured.replies[0], /aurora:ask/);
    assert.match(captured.replies[1], /Which database\?/);
    assert.match(captured.replies[1], /1\. Postgres/);
    assert.ok(ctx.state.pendingAsk, 'a question is now pending');
  });
});

test('the reply to a pending question is mapped and fed back to the model', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const provider = askingProvider();
    const { ctx } = makeCtx(store, provider);

    await handleUpdate(fromOwner('build me an app'), ctx);
    await handleUpdate(fromOwner('1'), ctx); // "1" → Postgres

    assert.equal(ctx.state.pendingAsk, null, 'pending question cleared');
    assert.match(provider.lastReceived, /DB: Postgres/, 'answer fed back to the model');
  });
});

test('/new clears a pending question', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const { ctx } = makeCtx(store, askingProvider());

    await handleUpdate(fromOwner('build me an app'), ctx);
    assert.ok(ctx.state.pendingAsk);
    await handleUpdate(fromOwner('/new'), ctx);
    assert.equal(ctx.state.pendingAsk, null);
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
