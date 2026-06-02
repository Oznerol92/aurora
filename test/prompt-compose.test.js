import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeSystemPrompt,
  BRAIN_MAX_CHARS,
  PERSONA_MAX_CHARS,
} from '../src/providers/prompt.js';

test('omits sections that are null/empty', () => {
  const sys = composeSystemPrompt({ persona: 'BASE' });
  assert.equal(sys, 'BASE');
});

test('orders base persona, then voice profile, then brain, then seed', () => {
  const sys = composeSystemPrompt({
    persona: 'BASE',
    personaProfile: 'VOICE',
    brain: 'BRAIN',
    seed: 'SEED',
  });
  assert.ok(sys.indexOf('BASE') < sys.indexOf('VOICE'));
  assert.ok(sys.indexOf('VOICE') < sys.indexOf('BRAIN'));
  assert.ok(sys.indexOf('BRAIN') < sys.indexOf('SEED'));
});

test('clips the brain to its budget but keeps the voice profile whole', () => {
  const bigBrain = 'B'.repeat(BRAIN_MAX_CHARS * 2);
  const voice = 'VOICE-PROFILE';
  const sys = composeSystemPrompt({ persona: 'BASE', personaProfile: voice, brain: bigBrain });
  assert.match(sys, /…\[truncated\]/, 'oversized brain is truncated');
  assert.match(sys, /VOICE-PROFILE/, 'voice profile survives');
  // The brain portion alone must not exceed its budget (+ a small marker).
  const brainPart = sys.slice(sys.indexOf('BBB'));
  assert.ok(brainPart.length <= BRAIN_MAX_CHARS + 32);
});

test('clips the voice profile to its own budget', () => {
  const bigVoice = 'V'.repeat(PERSONA_MAX_CHARS * 2);
  const sys = composeSystemPrompt({ persona: 'BASE', personaProfile: bigVoice });
  assert.match(sys, /…\[truncated\]/);
  assert.ok(sys.length <= 'BASE'.length + PERSONA_MAX_CHARS + 32);
});

test('returns empty string when given nothing', () => {
  assert.equal(composeSystemPrompt(), '');
  assert.equal(composeSystemPrompt({}), '');
});
