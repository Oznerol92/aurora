import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_LEDGER,
  normalizeLedger,
  engineRecord,
  dirRecord,
  isFirstVisit,
  recordVisit,
} from '../src/engines/ledger.js';

const DIR = '/home/u/project';

test('normalizeLedger coerces junk into a well-formed ledger', () => {
  assert.deepEqual(normalizeLedger(null), EMPTY_LEDGER);
  assert.deepEqual(normalizeLedger(undefined), EMPTY_LEDGER);
  assert.deepEqual(normalizeLedger('nope'), EMPTY_LEDGER);
  assert.deepEqual(normalizeLedger({ engines: 5 }), EMPTY_LEDGER);
  assert.deepEqual(normalizeLedger({ engines: { claude: {} } }), { engines: { claude: {} } });
});

test('isFirstVisit is true until an engine has worked in that directory', () => {
  let l = EMPTY_LEDGER;
  assert.equal(isFirstVisit(l, 'codex', DIR), true);
  l = recordVisit(l, 'codex', DIR, { sessionId: 's1', title: 'T', at: '2026-06-08T10:00:00Z' });
  assert.equal(isFirstVisit(l, 'codex', DIR), false);
  // Still first for a different engine, and for the same engine elsewhere.
  assert.equal(isFirstVisit(l, 'claude', DIR), true);
  assert.equal(isFirstVisit(l, 'codex', '/other/dir'), true);
});

test('recordVisit stamps firstSeen once and updates the per-directory pointer', () => {
  let l = recordVisit(EMPTY_LEDGER, 'claude', DIR, {
    sessionId: 's1',
    title: 'First thread',
    at: '2026-06-08T10:00:00Z',
  });
  assert.equal(engineRecord(l, 'claude').firstSeen, '2026-06-08T10:00:00Z');
  assert.deepEqual(dirRecord(l, 'claude', DIR), {
    lastSessionId: 's1',
    lastActiveAt: '2026-06-08T10:00:00Z',
    lastTitle: 'First thread',
  });

  // A later visit moves lastActiveAt but NOT firstSeen.
  l = recordVisit(l, 'claude', DIR, {
    sessionId: 's2',
    title: 'Second thread',
    at: '2026-06-09T12:00:00Z',
  });
  assert.equal(engineRecord(l, 'claude').firstSeen, '2026-06-08T10:00:00Z', 'firstSeen is sticky');
  assert.equal(dirRecord(l, 'claude', DIR).lastActiveAt, '2026-06-09T12:00:00Z');
  assert.equal(dirRecord(l, 'claude', DIR).lastSessionId, 's2');
});

test('recordVisit is pure — it does not mutate the input ledger', () => {
  const before = recordVisit(EMPTY_LEDGER, 'claude', DIR, { at: '2026-06-08T10:00:00Z' });
  const snapshot = JSON.stringify(before);
  const after = recordVisit(before, 'codex', DIR, { at: '2026-06-08T11:00:00Z' });
  assert.equal(JSON.stringify(before), snapshot, 'original ledger is untouched');
  assert.ok(after.engines.claude && after.engines.codex, 'new ledger has both engines');
});

test('per-directory recall keeps separate pointers for the same engine', () => {
  let l = recordVisit(EMPTY_LEDGER, 'claude', '/a', {
    sessionId: 'sa',
    at: '2026-06-08T10:00:00Z',
  });
  l = recordVisit(l, 'claude', '/b', { sessionId: 'sb', at: '2026-06-08T11:00:00Z' });
  assert.equal(dirRecord(l, 'claude', '/a').lastSessionId, 'sa');
  assert.equal(dirRecord(l, 'claude', '/b').lastSessionId, 'sb');
});
