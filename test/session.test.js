import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readActiveSession,
  writeActiveSession,
  attachSession,
  rotateSession,
} from '../src/store/session.js';

// Run inside a temp cwd with project scope, so the active-session pointer lands
// in an isolated ./.aurora rather than the real data dir.
function withProjectDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-sess-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

const cfg = { storeScope: 'project' };

function fakeProvider(id = 'sess-A') {
  return {
    sessionId: id,
    started: false,
    resume(s) {
      this.sessionId = s;
      this.started = true;
      return true;
    },
    reset() {
      this.sessionId = 'sess-NEW';
      this.started = false;
    },
  };
}

test('active-session pointer round-trips', () => {
  withProjectDir(() => {
    assert.equal(readActiveSession(cfg), null);
    writeActiveSession(cfg, 'abc-123');
    assert.equal(readActiveSession(cfg), 'abc-123');
  });
});

test('attachSession with no store leaves the provider alone and writes nothing', () => {
  withProjectDir(() => {
    const p = fakeProvider('orig');
    assert.equal(attachSession(p, cfg, false), 'orig');
    assert.equal(p.started, false);
    assert.equal(readActiveSession(cfg), null);
  });
});

test('attachSession records a new session, then a second process resumes it', () => {
  withProjectDir(() => {
    const p1 = fakeProvider('first');
    assert.equal(attachSession(p1, cfg, true), 'first');
    assert.equal(readActiveSession(cfg), 'first');

    // A different provider (e.g. the Telegram bridge) attaches to the same one.
    const p2 = fakeProvider('second');
    assert.equal(attachSession(p2, cfg, true), 'first');
    assert.equal(p2.sessionId, 'first');
    assert.equal(p2.started, true);
  });
});

test('rotateSession resets the provider and records the new id', () => {
  withProjectDir(() => {
    const p = fakeProvider('first');
    attachSession(p, cfg, true);
    assert.equal(rotateSession(p, cfg, true), 'sess-NEW');
    assert.equal(readActiveSession(cfg), 'sess-NEW');
  });
});
