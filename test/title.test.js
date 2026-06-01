import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewTitle, firstUserText } from '../src/store/title.js';
import { conversationToMarkdown } from '../src/store/export.js';

test('previewTitle collapses whitespace and trims', () => {
  assert.equal(previewTitle('  hello   world\n'), 'hello world');
});

test('previewTitle clips long text with an ellipsis', () => {
  const out = previewTitle('x'.repeat(100), 10);
  assert.equal(out.length, 10);
  assert.ok(out.endsWith('…'));
});

test('previewTitle handles empty input', () => {
  assert.equal(previewTitle(''), '(untitled)');
  assert.equal(previewTitle(null), '(untitled)');
});

test('firstUserText returns the first user turn, else empty', () => {
  assert.equal(
    firstUserText([
      { role: 'assistant', text: 'hi' },
      { role: 'user', text: 'the question' },
      { role: 'user', text: 'second' },
    ]),
    'the question',
  );
  assert.equal(firstUserText([{ role: 'assistant', text: 'only me' }]), '');
  assert.equal(firstUserText([]), '');
});

test('conversationToMarkdown renders a titled, sectioned document', () => {
  const md = conversationToMarkdown(
    [
      { role: 'user', text: 'What is the capital of France?' },
      { role: 'assistant', text: 'Paris.' },
    ],
    { sessionId: 'abc-123', exportedAt: '2026-06-01T10:00:00Z' },
  );
  assert.match(md, /^# What is the capital of France\?/);
  assert.match(md, /\*\*Session:\*\* `abc-123`/);
  assert.match(md, /\*\*Exported:\*\* 2026-06-01T10:00:00Z/);
  assert.match(md, /## You\n\nWhat is the capital of France\?/);
  assert.match(md, /## Aurora\n\nParis\./);
  assert.ok(md.endsWith('\n'));
});
