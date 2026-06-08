import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeProvider, isSessionNotFound, explainExit } from '../src/providers/claude.js';

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

const SAMPLE_CARDS = [
  {
    id: 'voice-core',
    type: 'voice',
    title: 'Recurring structural patterns',
    tags: ['voice', 'structure'],
    body: 'DISTINCTIVE-CARD-BODY about hooks and numbers.',
    priority: 1,
  },
];

test('setBrainCards/setPersona are injected on a fresh session (index only, not bodies)', () => {
  const p = new ClaudeProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setPersona('USER VOICE PROFILE BODY');
  const sys = systemPrompt(p.buildArgs('draft something'));
  assert.match(sys, /You are Aurora/, 'base persona kept');
  assert.match(sys, /USER VOICE PROFILE BODY/);
  assert.match(sys, /AURORA METHOD BRAIN/, 'the always-on index is injected');
  assert.match(sys, /voice-core/, 'the index lists each card');
  assert.doesNotMatch(
    sys,
    /DISTINCTIVE-CARD-BODY/,
    'full card bodies are retrieved per turn, not always-on',
  );
  // Voice profile is ordered before the brain so it survives truncation.
  assert.ok(sys.indexOf('USER VOICE PROFILE BODY') < sys.indexOf('AURORA METHOD BRAIN'));
});

test('brain/persona are NOT injected on a resumed turn', () => {
  const p = new ClaudeProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setPersona('USER VOICE PROFILE BODY');
  p.resume('11111111-2222-3333-4444-555555555555');
  const args = p.buildArgs('next');
  assert.ok(args.includes('--resume'));
  assert.equal(systemPrompt(args), null, 'resumed sessions restore their own context');
});

test('brain/persona survive reset() (they are config-level, not per-session)', () => {
  const p = new ClaudeProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setPersona('USER VOICE PROFILE BODY');
  p.reset();
  const sys = systemPrompt(p.buildArgs('x'));
  assert.match(sys, /AURORA METHOD BRAIN/, 'brain persists across /new');
  assert.match(sys, /USER VOICE PROFILE BODY/, 'persona persists across /new');
});

test('setBrainCards([]) clears the brain index', () => {
  const p = new ClaudeProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setBrainCards([]);
  const sys = systemPrompt(p.buildArgs('x'));
  assert.doesNotMatch(sys, /AURORA METHOD BRAIN/);
});

test('isSessionNotFound recognises a stale-resume error but not unrelated ones', () => {
  assert.ok(isSessionNotFound('No conversation found with session ID: abcd'));
  assert.ok(isSessionNotFound('Session not found'));
  assert.ok(isSessionNotFound('Error: could not resume — session abcd not found'));
  assert.ok(!isSessionNotFound('claude exited with code 1: rate limit exceeded'));
  assert.ok(!isSessionNotFound(''));
});

test('explainExit leads with an actionable cause for known failures', () => {
  assert.match(explainExit(1, 'Error: Not logged in'), /authenticated.*claude login/i);
  assert.match(explainExit(1, 'You have reached your usage limit'), /usage limit/i);
  assert.match(explainExit(1, 'HTTP 429: rate_limit_error'), /rate-limit/i);
  assert.match(explainExit(1, 'overloaded_error: server is busy'), /overloaded/i);
  assert.match(explainExit(1, 'prompt is too long: 250000 tokens'), /context window.*\/new/i);
  assert.match(explainExit(1, 'model "claude-xyz" not found'), /model was rejected/i);
  assert.match(explainExit(1, 'request failed: ECONNRESET'), /Network error.*ECONNRESET/i);
});

test('explainExit appends the raw stderr (bounded) for diagnostics', () => {
  const msg = explainExit(1, 'overloaded_error here');
  assert.match(msg, /overloaded_error here/, 'keeps the original output');
  const long = explainExit(1, 'x'.repeat(2000));
  assert.ok(long.length < 700, 'long stderr is truncated');
  assert.match(long, /…$/, 'truncation marked');
});

test('explainExit handles the opaque no-output exit (the original bad case)', () => {
  const msg = explainExit(1, '');
  assert.match(msg, /no output/i);
  assert.match(msg, /code 1/);
  assert.doesNotMatch(msg, /undefined/);
});
