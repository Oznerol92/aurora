// A multi-line paste used to ANSWER an aurora:ask question must be expanded back
// to its real text, exactly like the main REPL line handler — not submitted as the
// literal "[Pasted text #N +M lines]" placeholder (the bug this covers).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askInTerminal } from '../src/cli.js';
import { PasteStore } from '../src/paste.js';

/** Minimal fake readline that answers the one question with `answer`. */
function fakeRl(answer) {
  return {
    once() {},
    removeListener() {},
    question(_prompt, cb) {
      cb(answer);
    },
  };
}

const printer = { line() {} }; // interactive mode → skips rl.resume/pause
const freeText = [{ question: 'Paste it', options: [], multiSelect: false }];

test('askInTerminal expands a pasted placeholder in an answer', async () => {
  const store = new PasteStore();
  const token = store.register('line one\nline two\nline three'); // [Pasted text #1 +3 lines]
  assert.match(token, /^\[Pasted text #1 \+3 lines\]$/);

  const answers = await askInTerminal(fakeRl(token), freeText, printer, { store });
  assert.equal(answers[0], 'line one\nline two\nline three'); // expanded, not the placeholder
  assert.equal(store.size, 0); // store reset after the answer is consumed
});

test('askInTerminal expands a placeholder embedded in surrounding text', async () => {
  const store = new PasteStore();
  const token = store.register('alpha\nbeta');
  const answers = await askInTerminal(fakeRl(`use this: ${token} thanks`), freeText, printer, {
    store,
  });
  assert.equal(answers[0], 'use this: alpha\nbeta thanks');
});

test('askInTerminal passes a plain answer through unchanged (no paste store)', async () => {
  const answers = await askInTerminal(fakeRl('just typed this'), freeText, printer);
  assert.equal(answers[0], 'just typed this');
});
