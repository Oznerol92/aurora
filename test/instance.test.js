import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { primaryLockHolder, acquirePrimaryLock, releasePrimaryLock } from '../src/instance.js';

// instance.js derives the lock path from AURORA_CONFIG_DIR at call time, so each
// test can point it at an isolated tmpdir.
function withTmpConfig(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-lock-'));
  const prev = process.env.AURORA_CONFIG_DIR;
  process.env.AURORA_CONFIG_DIR = dir;
  try {
    return fn(dir);
  } finally {
    releasePrimaryLock(); // never leak the module-level `held` flag between tests
    if (prev === undefined) delete process.env.AURORA_CONFIG_DIR;
    else process.env.AURORA_CONFIG_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeLock(dir, pid) {
  const d = join(dir, 'data');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'aurora.lock'), JSON.stringify({ pid, startedAt: 'x' }) + '\n');
}

test('no lock file → no holder', () => {
  withTmpConfig(() => {
    assert.equal(primaryLockHolder(), null);
  });
});

test('acquire writes a lock, and our own lock is not reported as a holder', () => {
  withTmpConfig((dir) => {
    assert.equal(acquirePrimaryLock(), true);
    assert.ok(existsSync(join(dir, 'data', 'aurora.lock')));
    // It's ours, so a fresh launch in THIS process would not see a foreign holder.
    assert.equal(primaryLockHolder(), null);
  });
});

test('release removes our lock', () => {
  withTmpConfig((dir) => {
    acquirePrimaryLock();
    releasePrimaryLock();
    assert.equal(existsSync(join(dir, 'data', 'aurora.lock')), false);
  });
});

test('a different, live process is reported as the holder', () => {
  withTmpConfig((dir) => {
    // The parent process is alive and is not us — a perfect stand-in for a
    // second running aurora.
    writeLock(dir, process.ppid);
    const holder = primaryLockHolder();
    assert.ok(holder, 'expected a live foreign holder');
    assert.equal(Number(holder.pid), process.ppid);
  });
});

test('a stale lock from a dead process is ignored', () => {
  withTmpConfig((dir) => {
    // A pid that is virtually certain not to exist → treated as no holder.
    writeLock(dir, 2147483646);
    assert.equal(primaryLockHolder(), null);
  });
});

test('release only removes a lock we own', () => {
  withTmpConfig((dir) => {
    writeLock(dir, process.ppid); // someone else's lock
    releasePrimaryLock(); // we don't hold it, so this is a no-op
    assert.ok(existsSync(join(dir, 'data', 'aurora.lock')), 'a foreign lock must survive');
  });
});
