import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PromptPrinter } from '../src/repl-prompt.js';

// A minimal stdout double: captures writes and reports a TTY flag.
function fakeOut(isTTY = false) {
  return {
    isTTY,
    columns: 80,
    data: '',
    write(s) {
      this.data += s;
      return true;
    },
  };
}

// A minimal readline double: counts prompt redraws and records preserveCursor.
function fakeRl(line = '') {
  return {
    line,
    prompts: 0,
    preserved: [],
    prompt(preserveCursor) {
      this.prompts++;
      this.preserved.push(Boolean(preserveCursor));
    },
  };
}

test('write buffers a partial line and emits only complete ones', () => {
  const out = fakeOut(false);
  const p = new PromptPrinter(fakeRl(), out);

  p.write('hello ');
  assert.equal(out.data, '', 'no newline yet → nothing emitted');

  p.write('world\nsecond');
  assert.equal(out.data, 'hello world\n', 'the completed line is emitted, the rest is held');

  p.flush();
  assert.equal(out.data, 'hello world\nsecond\n', 'flush emits the buffered remainder');
});

test('flush is a no-op when there is no buffered partial', () => {
  const out = fakeOut(false);
  const p = new PromptPrinter(fakeRl(), out);
  p.write('a\n');
  const before = out.data;
  p.flush();
  assert.equal(out.data, before, 'nothing extra is written');
});

test('off a TTY: plain line writer, no prompt redraw, no cursor escapes', () => {
  const out = fakeOut(false);
  const rl = fakeRl('draft');
  const p = new PromptPrinter(rl, out);

  p.line('x');
  assert.equal(out.data, 'x\n');
  assert.equal(rl.prompts, 0, 'the readline prompt is not redrawn off a TTY');
  assert.ok(!out.data.includes('\x1b['), 'no ANSI cursor control is emitted off a TTY');
});

test('on a TTY: redraws the pinned prompt (preserving input) once per line', () => {
  const out = fakeOut(true);
  const rl = fakeRl('half-typed');
  const p = new PromptPrinter(rl, out);

  p.write('one\ntwo\n');
  assert.ok(out.data.includes('one\n') && out.data.includes('two\n'), 'both lines are written');
  assert.equal(rl.prompts, 2, 'the prompt is redrawn once per emitted line');
  assert.deepEqual(rl.preserved, [true, true], 'redraws preserve the in-progress input');
});
