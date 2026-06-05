import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkTelegram } from '../src/notify/telegram.js';

const MAX = 4096;

test('chunkTelegram leaves a short message in a single chunk', () => {
  assert.deepEqual(chunkTelegram('hello'), ['hello']);
});

test('chunkTelegram splits a long message at the 4096-char boundary', () => {
  const text = 'x'.repeat(MAX + 10);
  const chunks = chunkTelegram(text);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, MAX);
  assert.equal(chunks[1].length, 10);
  assert.equal(chunks.join(''), text); // lossless — nothing truncated
});

test('chunkTelegram fills exact multiples without an empty trailing chunk', () => {
  const chunks = chunkTelegram('y'.repeat(MAX * 2));
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((c) => c.length === MAX));
});

test('chunkTelegram yields one empty chunk for empty/blank input', () => {
  assert.deepEqual(chunkTelegram(''), ['']);
  assert.deepEqual(chunkTelegram(null), ['']);
  assert.deepEqual(chunkTelegram(undefined), ['']);
});
