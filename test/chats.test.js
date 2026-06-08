import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadChats,
  listChatIds,
  isRegistered,
  registerChat,
  removeChat,
  chatsPath,
} from '../src/notify/chats.js';

// Point the registry at an isolated config dir so tests never touch ~/.config.
async function withConfigDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-chats-'));
  const prev = process.env.AURORA_CONFIG_DIR;
  process.env.AURORA_CONFIG_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.AURORA_CONFIG_DIR;
    else process.env.AURORA_CONFIG_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('an empty registry reads as no chats', async () => {
  await withConfigDir(() => {
    assert.deepEqual(loadChats(), []);
    assert.deepEqual(listChatIds(), []);
    assert.equal(isRegistered(42), false);
  });
});

test('registering a chat persists it and reports it as new', async () => {
  await withConfigDir(() => {
    const res = registerChat({ id: 42, name: 'Lorenzo', type: 'private' });
    assert.equal(res.added, true);
    assert.ok(existsSync(chatsPath()), 'a registry file was written');
    assert.deepEqual(listChatIds(), ['42']);
    assert.equal(isRegistered('42'), true, 'string and number ids match');
    assert.equal(isRegistered(42), true);
  });
});

test('re-registering a known chat is idempotent and refreshes the name', async () => {
  await withConfigDir(() => {
    registerChat({ id: 42, name: 'Old', type: 'private' });
    const res = registerChat({ id: 42, name: 'New', type: 'private' });
    assert.equal(res.added, false, 'not counted as a new registration');
    assert.equal(listChatIds().length, 1, 'no duplicate entry');
    assert.equal(loadChats()[0].name, 'New', 'name refreshed in place');
  });
});

test('removeChat forgets a chat and is a no-op for unknown ids', async () => {
  await withConfigDir(() => {
    registerChat({ id: 42, name: 'A', type: 'private' });
    registerChat({ id: 99, name: 'B', type: 'group' });
    assert.equal(removeChat(42), true);
    assert.deepEqual(listChatIds(), ['99']);
    assert.equal(removeChat(12345), false, 'removing an unknown id returns false');
  });
});
