import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  countLines,
  placeholder,
  PasteStore,
  PasteFilter,
  createPasteInput,
} from '../src/paste.js';

const START = '\x1b[200~';
const END = '\x1b[201~';

test('countLines ignores a single trailing newline', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('one'), 1);
  assert.equal(countLines('a\nb'), 2);
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\nb\nc'), 3);
});

test('placeholder pluralizes the line count', () => {
  assert.equal(placeholder('one line'), '[Pasted 1 line]');
  assert.equal(placeholder('a\nb\nc'), '[Pasted 3 lines]');
});

test('PasteStore swaps placeholders back to their text', () => {
  const s = new PasteStore();
  const t1 = s.register('a\nb');
  const t2 = s.register('x\ny\nz');
  assert.equal(t1, '[Pasted 2 lines]');
  assert.equal(s.expand(`before ${t1} mid ${t2} end`), 'before a\nb mid x\ny\nz end');
  s.reset();
  assert.equal(s.size, 0);
});

test('PasteStore expands identical placeholders in registration order', () => {
  const s = new PasteStore();
  s.register('a\nb'); // both render as [Pasted 2 lines]
  s.register('c\nd');
  assert.equal(s.expand('[Pasted 2 lines] and [Pasted 2 lines]'), 'a\nb and c\nd');
});

test('PasteFilter forwards normal text and escapes untouched', () => {
  const f = new PasteFilter(() => 'X');
  assert.equal(f.push('hello world'), 'hello world');
  assert.equal(f.push('\x1b[A'), '\x1b[A'); // an arrow-key escape passes through
});

test('PasteFilter replaces a bracketed paste with onPaste() and hides the body', () => {
  const seen = [];
  const f = new PasteFilter((body) => {
    seen.push(body);
    return `<${body}>`;
  });
  const out = f.push(`pre ${START}a\nb\nc${END} post`);
  assert.deepEqual(seen, ['a\nb\nc']);
  assert.equal(out, 'pre <a\nb\nc> post');
});

test('PasteFilter handles markers split across chunks', () => {
  const f = new PasteFilter((body) => `[${body}]`);
  let out = '';
  for (const c of ['hi ', '\x1b[2', '00~line1\nli', 'ne2\x1b[20', '1~ bye']) out += f.push(c);
  assert.equal(out, 'hi [line1\nline2] bye');
});

test('PasteFilter withholds the paste body until the paste closes', () => {
  const f = new PasteFilter((b) => placeholder(b));
  assert.equal(f.push(`${START}line1\nline2`), ''); // body withheld, no END yet
  assert.equal(f.push(END), '[Pasted 2 lines]'); // END arrives → placeholder
});

test('createPasteInput collapses a paste on a TTY and toggles bracketed-paste mode', async () => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const writes = [];
  const stdout = {
    write: (s) => {
      writes.push(s);
      return true;
    },
  };
  const { input, store, enable, disable } = createPasteInput(stdin, stdout);

  enable();
  assert.ok(writes.includes('\x1b[?2004h'), 'enabled bracketed paste');

  const chunks = [];
  input.on('data', (d) => chunks.push(d.toString('utf8')));
  // The write callback fires once the pipe has consumed the chunk; a nextTick
  // then lets the transform's output 'data' events land.
  await new Promise((r) => stdin.write(`hi ${START}a\nb\nc${END}!`, r));
  await new Promise((r) => process.nextTick(r));

  assert.equal(chunks.join(''), 'hi [Pasted 3 lines]!', 'paste body hidden behind a placeholder');
  assert.equal(store.size, 1);
  assert.equal(store.expand('[Pasted 3 lines]'), 'a\nb\nc', 'full paste recoverable at submit');

  disable();
  assert.ok(writes.includes('\x1b[?2004l'), 'restored bracketed paste on exit');
});

test('createPasteInput is a no-op on non-TTY input', () => {
  const stdin = new PassThrough(); // no isTTY → piped/test input
  const { input, store } = createPasteInput(stdin, { write() {} });
  assert.equal(input, stdin, 'reads stdin directly, unchanged');
  assert.equal(store.size, 0);
});
