import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiPreview } from '../src/notify/preview.js';

const long = (n = 600) => 'This is a sentence. '.repeat(Math.ceil(n / 20)).slice(0, n);

test('aiPreview returns the model gist for a long turn', async () => {
  let seenPrompt = null;
  const runClaude = async (prompt) => {
    seenPrompt = prompt;
    return 'Fixed the recap so it never cuts a word; next, deploy to prod.';
  };
  const out = await aiPreview(long(), { runClaude });
  assert.equal(out, 'Fixed the recap so it never cuts a word; next, deploy to prod.');
  assert.match(seenPrompt, /Summarise the assistant turn/);
});

test('aiPreview skips the model for a short body (returns null)', async () => {
  let called = false;
  const runClaude = async () => {
    called = true;
    return 'unused';
  };
  const out = await aiPreview('A short answer.', { runClaude, minChars: 500 });
  assert.equal(out, null);
  assert.equal(called, false, 'no model call for a body under the threshold');
});

test('aiPreview returns null when the model call fails (caller falls back)', async () => {
  const out = await aiPreview(long(), { runClaude: async () => null });
  assert.equal(out, null);
});

test('aiPreview clamps an overshooting model response to the budget, never mid-word', async () => {
  const verbose = 'word '.repeat(300).trim() + '.'; // ~1500 chars, way over budget
  const out = await aiPreview(long(), { runClaude: async () => verbose, maxChars: 80 });
  assert.ok(out.length <= 82, 'clamped to ~maxChars');
  // every kept token is a whole "word" — the clamp broke on a space, not mid-word
  const kept = out.replace(/…$/, '').trim();
  assert.ok(
    kept.split(' ').every((w) => w === 'word'),
    'no word was split',
  );
});

test('aiPreview passes the chosen model through to the runner', async () => {
  let seenModel = null;
  await aiPreview(long(), {
    model: 'sonnet',
    runClaude: async (_p, model) => {
      seenModel = model;
      return 'ok gist';
    },
  });
  assert.equal(seenModel, 'sonnet');
});
