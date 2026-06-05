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

test('countLines treats CR and CRLF separators like newlines', () => {
  assert.equal(countLines('a\rb\rc'), 3); // VTE/xterm-style paste body
  assert.equal(countLines('a\r\nb\r\nc'), 3);
  assert.equal(countLines('a\rb\r'), 2); // trailing CR doesn't add a line
});

test('placeholder numbers the paste and pluralizes the line count', () => {
  assert.equal(placeholder('one line'), '[Pasted text #1 +1 line]');
  assert.equal(placeholder('a\nb\nc'), '[Pasted text #1 +3 lines]');
  assert.equal(placeholder('a\nb\nc', 2), '[Pasted text #2 +3 lines]');
});

test('PasteStore swaps placeholders back to their text', () => {
  const s = new PasteStore();
  const t1 = s.register('a\nb');
  const t2 = s.register('x\ny\nz');
  assert.equal(t1, '[Pasted text #1 +2 lines]');
  assert.equal(t2, '[Pasted text #2 +3 lines]');
  assert.equal(s.expand(`before ${t1} mid ${t2} end`), 'before a\nb mid x\ny\nz end');
  s.reset();
  assert.equal(s.size, 0);
});

test('PasteStore numbers pastes per line and normalizes CR bodies', () => {
  const s = new PasteStore();
  const t1 = s.register('a\rb'); // CR-separated, like a real terminal paste
  const t2 = s.register('c\rd');
  assert.equal(t1, '[Pasted text #1 +2 lines]');
  assert.equal(t2, '[Pasted text #2 +2 lines]');
  assert.equal(s.expand(`${t1} and ${t2}`), 'a\nb and c\nd'); // restored as \n
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
  assert.equal(f.push(END), '[Pasted text #1 +2 lines]'); // END arrives → placeholder
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

  assert.equal(
    chunks.join(''),
    'hi [Pasted text #1 +3 lines]!',
    'paste body hidden behind a placeholder',
  );
  assert.equal(store.size, 1);
  assert.equal(
    store.expand('[Pasted text #1 +3 lines]'),
    'a\nb\nc',
    'full paste recoverable at submit',
  );

  disable();
  assert.ok(writes.includes('\x1b[?2004l'), 'restored bracketed paste on exit');
});

test('createPasteInput collapses a CR-separated paste (real terminal body)', async () => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const { input, store, enable } = createPasteInput(stdin, { write() {} });
  enable();

  const chunks = [];
  input.on('data', (d) => chunks.push(d.toString('utf8')));
  // VTE/xterm deliver the paste body with carriage returns, not newlines.
  await new Promise((r) => stdin.write(`${START}a\rb\rc\rd${END}`, r));
  await new Promise((r) => process.nextTick(r));

  assert.equal(chunks.join(''), '[Pasted text #1 +4 lines]', 'CR body still collapses');
  assert.equal(store.expand('[Pasted text #1 +4 lines]'), 'a\nb\nc\nd', 'restored as newlines');
});

test('createPasteInput is a no-op on non-TTY input', () => {
  const stdin = new PassThrough(); // no isTTY → piped/test input
  const { input, store } = createPasteInput(stdin, { write() {} });
  assert.equal(input, stdin, 'reads stdin directly, unchanged');
  assert.equal(store.size, 0);
});
