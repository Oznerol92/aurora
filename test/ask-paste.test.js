// A multi-line paste used to ANSWER an aurora:ask question must be expanded back
// to its real text, exactly like the main REPL line handler — not submitted as the
// literal "[Pasted text #N +M lines]" placeholder (the bug this covers).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askInTerminal } from '../src/cli.js';
import { PasteStore } from '../src/paste.js';

/** Minimal fake readline that answers the one question with `answer`. Tolerates
 * both rl.question(query, cb) and rl.question(query, options, cb). */
function fakeRl(answer) {
  return {
    once() {},
    removeListener() {},
    pause() {},
    resume() {},
    question(_prompt, optsOrCb, maybeCb) {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
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

// Ctrl-C during an open popup: the SIGINT handler fires ctx.askCancel, which must
// settle the popup as unanswered (null) so the caller returns to the prompt and a
// later ^C can exit. A stray Enter arriving after the cancel must not re-resolve.
test('askInTerminal resolves null when cancelled via ctx.askCancel', async () => {
  let storedCb = null;
  const rl = {
    once() {},
    removeListener() {},
    pause() {},
    resume() {},
    question(_prompt, _opts, cb) {
      storedCb = cb; // hold the question open — never answer on its own
    },
  };
  const ctx = {};
  const pending = askInTerminal(rl, freeText, printer, null, ctx);
  assert.equal(typeof ctx.askCancel, 'function'); // canceller registered while open

  ctx.askCancel(); // simulate Ctrl-C landing on the popup
  const answers = await pending;
  assert.equal(answers, null); // settled unanswered
  assert.equal(ctx.askCancel, null); // canceller cleared on settle

  // A leftover Enter after the cancel must hit the settled guard, not push an answer
  // or resolve a second time.
  assert.doesNotThrow(() => storedCb('late enter'));
});
