import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeProvider } from '../src/providers/claude.js';

test('a fresh provider creates the session on its first turn', () => {
  const p = new ClaudeProvider();
  const args = p.buildArgs('hello');
  assert.ok(args.includes('--session-id'), 'first turn uses --session-id');
  assert.ok(args.includes('--append-system-prompt'), 'first turn injects the persona');
  assert.ok(!args.includes('--resume'));
});

test('resume() reattaches so the next turn uses --resume <id>', () => {
  const p = new ClaudeProvider();
  const ok = p.resume('11111111-2222-3333-4444-555555555555');
  assert.equal(ok, true);
  assert.equal(p.sessionId, '11111111-2222-3333-4444-555555555555');

  const args = p.buildArgs('continue please');
  assert.ok(args.includes('--resume'), 'resumed turn uses --resume');
  assert.equal(args[args.indexOf('--resume') + 1], '11111111-2222-3333-4444-555555555555');
  assert.ok(!args.includes('--session-id'), 'resumed turn does not re-create the session');
});

test('resume(falsy) is a no-op that reports failure', () => {
  const p = new ClaudeProvider();
  assert.equal(p.resume(''), false);
  // Still in "fresh" state — first turn would create a new session.
  assert.ok(p.buildArgs('x').includes('--session-id'));
});

test('reset() starts a brand-new session', () => {
  const p = new ClaudeProvider();
  const first = p.sessionId;
  p.resume('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  p.reset();
  assert.notEqual(p.sessionId, first);
  assert.notEqual(p.sessionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.ok(p.buildArgs('x').includes('--session-id'));
});
