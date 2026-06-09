// `/go` command — intent gate Phase 2 (docs/design/intent-gate.md). `/go` acts NOW
// on what was just discussed by enqueuing an ACT turn, instead of arming for the
// next message. These tests exercise the command's three paths: bare `/go` with a
// discussion to act on, `/go <text>` as an act-now message, and the empty-session
// guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCommand } from '../src/cli.js';

// Minimal ctx for the `/go` path: it only touches hasContext, goOnce, and queue
// (plus console.log, which we silence to keep test output clean).
function makeCtx({ hasContext = false } = {}) {
  return { hasContext, goOnce: false, queue: [] };
}

async function runGo(input, ctx) {
  const log = console.log;
  console.log = () => {};
  try {
    return await handleCommand(input, ctx);
  } finally {
    console.log = log;
  }
}

test('/go with a discussion: enqueues an ACT turn now, not on the next message', async () => {
  const ctx = makeCtx({ hasContext: true });
  const keepGoing = await runGo('/go', ctx);
  assert.equal(keepGoing, true); // stays in the REPL
  assert.equal(ctx.goOnce, true); // forces this turn into ACT
  assert.deepEqual(ctx.queue, ['Go ahead with what we agreed.']);
});

test('/go <text>: the inline text becomes the act-now message', async () => {
  const ctx = makeCtx({ hasContext: true });
  await runGo('/go fix the paste bug', ctx);
  assert.equal(ctx.goOnce, true);
  assert.deepEqual(ctx.queue, ['fix the paste bug']);
});

test('/go <text> works even on an empty session (text is the context)', async () => {
  const ctx = makeCtx({ hasContext: false });
  await runGo('/go ship it', ctx);
  assert.equal(ctx.goOnce, true);
  assert.deepEqual(ctx.queue, ['ship it']);
});

test('bare /go on an empty session declines: nothing enqueued, no ACT armed', async () => {
  const ctx = makeCtx({ hasContext: false });
  const keepGoing = await runGo('/go', ctx);
  assert.equal(keepGoing, true); // declines but stays in the REPL
  assert.equal(ctx.goOnce, false); // does not arm ACT against no history
  assert.deepEqual(ctx.queue, []); // nothing to act on
});
