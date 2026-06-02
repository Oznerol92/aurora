import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLaunch } from '../src/cli.js';
import { JsonStore } from '../src/store/json.js';
import { readActiveSession, writeActiveSession } from '../src/store/session.js';

// Project scope + temp cwd, so the store and the active-session pointer land in
// an isolated ./.aurora.
async function withProjectDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-launch-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await fn();
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

const cfg = { storeScope: 'project' };

function fakeProvider(id = 'fresh-id') {
  return {
    sessionId: id,
    started: false,
    seeded: null,
    resume(s) {
      this.sessionId = s;
      this.started = true;
      return true;
    },
    reset() {
      this.sessionId = 'reset-id';
      this.started = false;
    },
    seed(turns) {
      this.seeded = turns;
      return turns.length > 0;
    },
  };
}

async function storeWith(sessionId, text = 'hello') {
  const store = new JsonStore({ scope: 'project' });
  await store.open();
  await store.saveTurn(sessionId, { role: 'user', text, ts: '2026-01-01T00:00:00Z' });
  await store.saveTurn(sessionId, {
    role: 'assistant',
    text: 'hi back',
    ts: '2026-01-01T00:00:01Z',
  });
  return store;
}

test('--new starts a fresh session and records it as active', async () => {
  await withProjectDir(async () => {
    writeActiveSession(cfg, 'stale-old');
    const store = await storeWith('stale-old');
    const provider = fakeProvider('brand-new');

    const res = await resolveLaunch({
      provider,
      config: cfg,
      store,
      hasStore: true,
      argv: ['--new'],
    });

    assert.equal(res.source, 'new');
    assert.equal(res.sessionId, 'brand-new');
    assert.equal(provider.started, false, 'a fresh session is not resumed');
    assert.equal(readActiveSession(cfg), 'brand-new');
  });
});

test('--resume <prefix> reattaches to the matching conversation and seeds it', async () => {
  await withProjectDir(async () => {
    const store = await storeWith('abc12345-feed');
    const provider = fakeProvider();

    const res = await resolveLaunch({
      provider,
      config: cfg,
      store,
      hasStore: true,
      argv: ['--resume', 'abc'],
    });

    assert.equal(res.source, 'resumed');
    assert.equal(res.sessionId, 'abc12345-feed');
    assert.equal(provider.started, true, 'native resume is attempted');
    assert.equal(readActiveSession(cfg), 'abc12345-feed');
    assert.ok(provider.seeded?.length, 'transcript is handed to the provider as fallback context');
  });
});

test('--resume with no matching conversation falls back to fresh', async () => {
  await withProjectDir(async () => {
    const store = await storeWith('abc12345-feed');
    const provider = fakeProvider('new-one');

    const res = await resolveLaunch({
      provider,
      config: cfg,
      store,
      hasStore: true,
      argv: ['--resume', 'zzz'],
    });

    assert.equal(res.source, 'new');
    assert.equal(res.sessionId, 'new-one');
  });
});

test('--resume without a store warns and starts fresh', async () => {
  await withProjectDir(async () => {
    const provider = fakeProvider('no-store-id');
    const res = await resolveLaunch({
      provider,
      config: cfg,
      store: null,
      hasStore: false,
      argv: ['--resume'],
    });
    assert.equal(res.source, 'new');
    assert.equal(res.sessionId, 'no-store-id');
  });
});

test('default launch continues the existing active session and seeds it', async () => {
  await withProjectDir(async () => {
    const store = await storeWith('existing-1');
    writeActiveSession(cfg, 'existing-1');
    const provider = fakeProvider();

    const res = await resolveLaunch({ provider, config: cfg, store, hasStore: true, argv: [] });

    assert.equal(res.source, 'continued');
    assert.equal(res.sessionId, 'existing-1');
    assert.equal(provider.started, true);
    assert.ok(provider.seeded?.length, 'continued session is also seeded for fallback');
  });
});

test('default launch with no active session is new', async () => {
  await withProjectDir(async () => {
    const store = new JsonStore({ scope: 'project' });
    await store.open();
    const provider = fakeProvider('first-run');

    const res = await resolveLaunch({ provider, config: cfg, store, hasStore: true, argv: [] });

    assert.equal(res.source, 'new');
    assert.equal(res.sessionId, 'first-run');
    assert.equal(readActiveSession(cfg), 'first-run');
  });
});
