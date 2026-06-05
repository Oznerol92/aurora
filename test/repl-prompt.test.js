import { test, mock } from 'node:test';
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

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

test('thinking() off a TTY is an inert no-op', () => {
  const out = fakeOut(false);
  const rl = fakeRl();
  const p = new PromptPrinter(rl, out);

  const t = p.thinking();
  t.stop();
  t.stop(); // idempotent — must not throw

  assert.equal(out.data, '', 'nothing is drawn off a TTY');
  assert.equal(rl.prompts, 0, 'the prompt is not touched off a TTY');
  assert.equal(p.statusText, null, 'no status row is tracked off a TTY');
});

test('thinking() on a TTY draws a spinner row above the prompt and clears it on stop', () => {
  const out = fakeOut(true);
  const rl = fakeRl('typing');
  const p = new PromptPrinter(rl, out);

  const t = p.thinking('Aurora is thinking');
  assert.ok(p.statusText, 'a status row is tracked while thinking');
  assert.ok(
    SPINNER_FRAMES.some((f) => p.statusText.includes(f)),
    'the status row carries a spinner frame',
  );
  assert.ok(p.statusText.includes('Aurora is thinking'), 'the status row carries the label');
  assert.ok(out.data.includes(p.statusText), 'the spinner row is written above the prompt');
  assert.ok(rl.prompts >= 1, 'the prompt is redrawn beneath the spinner row');
  assert.ok(rl.preserved.every(Boolean), 'redraws preserve the in-progress input');

  const promptsBeforeStop = rl.prompts;
  t.stop();
  assert.equal(p.statusText, null, 'stop clears the tracked status row');
  assert.ok(rl.prompts > promptsBeforeStop, 'the prompt is redrawn after the row is cleared');

  t.stop(); // idempotent — must not throw or redraw again
});

test('thinking() repaints the spinner without redrawing the prompt (no cursor flash)', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const out = fakeOut(true);
    const rl = fakeRl('half-typed');
    const p = new PromptPrinter(rl, out);

    const t = p.thinking('Aurora is thinking');
    const promptsAfterFirstFrame = rl.prompts; // the first frame establishes the layout
    out.data = ''; // focus on what a repaint tick emits

    mock.timers.tick(100); // one repaint frame

    assert.equal(
      rl.prompts,
      promptsAfterFirstFrame,
      'a repaint must NOT redraw the prompt — that bounce is the flash',
    );
    assert.ok(out.data.includes('\x1b[?25l'), 'the cursor is hidden during the repaint');
    assert.ok(out.data.includes('\x1b7'), 'the live cursor position is saved');
    assert.ok(out.data.includes('\x1b8'), 'the cursor position is restored after painting');
    assert.ok(out.data.includes('\x1b[?25h'), 'the cursor is shown again after the repaint');
    assert.ok(
      SPINNER_FRAMES.some((f) => out.data.includes(f)),
      'a new spinner frame is painted',
    );

    t.stop();
  } finally {
    mock.timers.reset();
  }
});

test('line() keeps the thinking row pinned directly above the prompt', () => {
  const out = fakeOut(true);
  const rl = fakeRl('');
  const p = new PromptPrinter(rl, out);

  const t = p.thinking('Aurora is thinking');
  const status = p.statusText;
  out.data = ''; // focus on what line() emits
  rl.prompts = 0;

  p.line('answer line');

  assert.ok(out.data.includes('answer line'), 'the content line is emitted');
  assert.ok(out.data.includes(status), 're-lays the spinner row beneath the content');
  assert.ok(
    out.data.indexOf('answer line') < out.data.indexOf(status),
    'content is printed above the spinner row',
  );
  assert.ok(rl.prompts >= 1, 'the prompt is redrawn beneath both');

  t.stop();
});
