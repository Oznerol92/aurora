import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeProvider, isSessionNotFound } from '../src/providers/claude.js';

/** Pull the value passed to --append-system-prompt out of an args array. */
function systemPrompt(args) {
  const i = args.indexOf('--append-system-prompt');
  return i === -1 ? null : args[i + 1];
}

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

test('seed() carries a bounded transcript into a fresh session preamble', () => {
  const p = new ClaudeProvider();
  const took = p.seed([
    { role: 'user', text: 'What is Aurora?' },
    { role: 'assistant', text: 'A terminal research assistant.' },
  ]);
  assert.equal(took, true);

  const args = p.buildArgs('continue');
  assert.ok(args.includes('--session-id'), 'a seeded session is still created fresh');
  const sys = systemPrompt(args);
  assert.match(sys, /TRANSCRIPT START/);
  assert.match(sys, /What is Aurora\?/);
  assert.match(sys, /terminal research assistant/);
  assert.match(sys, /You are Aurora/, 'persona is kept alongside the transcript');
});

test('seed() keeps only the last SEED_MAX_TURNS turns', () => {
  const p = new ClaudeProvider();
  const many = Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: `turn ${i}` }));
  p.seed(many);
  const sys = systemPrompt(p.buildArgs('x'));
  assert.ok(!sys.includes('turn 0'), 'oldest turns are dropped');
  assert.match(sys, /turn 29/, 'newest turn is kept');
});

test('a resumed turn does not inject the seed preamble', () => {
  const p = new ClaudeProvider();
  p.resume('11111111-2222-3333-4444-555555555555');
  p.seed([{ role: 'user', text: 'earlier question' }]);
  const args = p.buildArgs('next');
  assert.ok(args.includes('--resume'), 'native resume is preferred');
  assert.equal(systemPrompt(args), null, 'no preamble while the native session is trusted');
});

test('reset() clears any seeded context', () => {
  const p = new ClaudeProvider();
  p.seed([{ role: 'user', text: 'old' }]);
  p.reset();
  const sys = systemPrompt(p.buildArgs('x'));
  assert.doesNotMatch(sys, /TRANSCRIPT START/);
  assert.doesNotMatch(sys, /old/);
});

test('abort() is safe to call when nothing is running', () => {
  const p = new ClaudeProvider();
  assert.equal(p.abort(), false, 'no child to cancel');
});

test('isSessionNotFound recognises a stale-resume error but not unrelated ones', () => {
  assert.ok(isSessionNotFound('No conversation found with session ID: abcd'));
  assert.ok(isSessionNotFound('Session not found'));
  assert.ok(isSessionNotFound('Error: could not resume — session abcd not found'));
  assert.ok(!isSessionNotFound('claude exited with code 1: rate limit exceeded'));
  assert.ok(!isSessionNotFound(''));
});
