import { Transform } from 'node:stream';

/**
 * Multi-line paste handling for the REPL.
 *
 * Without this, a pasted block of N lines reaches readline as N separate
 * 'line' events — so a single paste becomes N chat turns and the whole block
 * floods the screen. We turn on the terminal's *bracketed paste mode* and route
 * stdin through a filter that detects a paste, hides its body, and echoes a
 * compact `[Pasted N lines]` placeholder instead. The real text is kept and
 * swapped back in when the line is submitted, so the model still receives the
 * full paste as ONE message.
 *
 * It engages only on an interactive TTY (piped/test input is untouched, so the
 * old line-by-line behaviour is preserved), degrades gracefully on terminals
 * that don't support bracketed paste, and can be disabled with AURORA_NO_PASTE.
 */

// Terminal control sequences for bracketed paste mode.
export const PASTE_ON = '\x1b[?2004h';
export const PASTE_OFF = '\x1b[?2004l';
// Markers the terminal wraps a paste in once bracketed paste is enabled.
const START = '\x1b[200~';
const END = '\x1b[201~';

/** Lines in a pasted blob (a single trailing newline doesn't add a line). */
export function countLines(text) {
  if (!text) return 0;
  const t = text.endsWith('\n') ? text.slice(0, -1) : text;
  return t.split('\n').length;
}

/** The visible placeholder shown in place of a hidden paste body. */
export function placeholder(text) {
  const n = countLines(text);
  return `[Pasted ${n} line${n === 1 ? '' : 's'}]`;
}

/** Longest suffix of `s` that is a proper prefix of `marker` (0 if none). */
function overlap(s, marker) {
  const max = Math.min(s.length, marker.length - 1);
  for (let k = max; k > 0; k--) {
    if (s.slice(s.length - k) === marker.slice(0, k)) return k;
  }
  return 0;
}

/**
 * Registry of pending pastes for the current input line. `register()` hides a
 * blob behind a placeholder and remembers it; `expand()` swaps every known
 * placeholder in a submitted line back to its original text (in registration
 * order, so identical placeholders expand correctly); `reset()` clears it once
 * a line is consumed.
 */
export class PasteStore {
  constructor() {
    this.items = [];
  }
  register(text) {
    const token = placeholder(text);
    this.items.push({ token, text });
    return token;
  }
  expand(line) {
    let out = line;
    for (const { token, text } of this.items) {
      const i = out.indexOf(token);
      if (i !== -1) out = out.slice(0, i) + text + out.slice(i + token.length);
    }
    return out;
  }
  reset() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
}

/**
 * Streaming filter over raw terminal input. `push(chunk)` returns the text to
 * forward to readline, calling `onPaste(body)` for each completed bracketed
 * paste and forwarding whatever that returns (e.g. a placeholder) in its place.
 * The paste body itself is never forwarded, so readline neither echoes nor
 * splits it. Markers split across chunks are held back until they complete.
 */
export class PasteFilter {
  constructor(onPaste) {
    this.onPaste = onPaste; // (body: string) => string  (text to forward instead)
    this._mode = 'normal';
    this._buf = ''; // normal-mode hold buffer (possible partial START)
    this._paste = ''; // paste-mode accumulated body (+ possible partial END)
  }

  push(chunk) {
    let input = String(chunk);
    let out = '';
    while (input.length) {
      if (this._mode === 'normal') {
        this._buf += input;
        input = '';
        const i = this._buf.indexOf(START);
        if (i !== -1) {
          out += this._buf.slice(0, i);
          input = this._buf.slice(i + START.length); // re-scan the remainder
          this._buf = '';
          this._mode = 'paste';
          continue;
        }
        // No full START marker: forward everything except a tail that could be
        // the start of one (so a marker split across chunks is still caught).
        const keep = overlap(this._buf, START);
        out += this._buf.slice(0, this._buf.length - keep);
        this._buf = this._buf.slice(this._buf.length - keep);
      } else {
        this._paste += input;
        input = '';
        const i = this._paste.indexOf(END);
        if (i !== -1) {
          const body = this._paste.slice(0, i);
          input = this._paste.slice(i + END.length); // re-scan the remainder
          this._paste = '';
          this._mode = 'normal';
          out += this.onPaste(body);
          continue;
        }
        // No full END marker yet: keep accumulating the body (never forwarded).
      }
    }
    return out;
  }
}

/**
 * Build the readline `input` stream with paste handling, plus the matching
 * paste store and enable/disable hooks for bracketed paste mode.
 *
 * On a non-TTY (piped stdin, tests) or when AURORA_NO_PASTE is set, this is a
 * no-op: readline reads stdin directly and the old behaviour is unchanged.
 *
 * @returns {{ input: NodeJS.ReadableStream, store: PasteStore, enable: () => void, disable: () => void }}
 */
export function createPasteInput(stdin = process.stdin, stdout = process.stdout) {
  const store = new PasteStore();
  if (!stdin.isTTY || process.env.AURORA_NO_PASTE) {
    return { input: stdin, store, enable() {}, disable() {} };
  }

  // Multi-line pastes collapse to a placeholder; a single-line paste is
  // forwarded as-is (it never caused the multi-turn/flood problem).
  const filter = new PasteFilter((body) => (countLines(body) >= 2 ? store.register(body) : body));
  const tty = new Transform({
    transform(chunk, _enc, cb) {
      try {
        cb(null, filter.push(chunk.toString('utf8')));
      } catch {
        cb(null, chunk); // a filter bug must never wedge input
      }
    },
  });
  // readline only enables raw mode + keypress editing when its input looks like
  // a TTY, so make the transform proxy the real terminal's TTY-ness.
  tty.isTTY = true;
  tty.setRawMode = (mode) => {
    stdin.setRawMode?.(mode);
    tty.isRaw = mode;
    return tty;
  };
  stdin.pipe(tty);

  let on = false;
  return {
    input: tty,
    store,
    enable() {
      if (on) return;
      on = true;
      try {
        stdout.write(PASTE_ON);
      } catch {
        // a terminal that can't enable it just falls back to raw newlines
      }
    },
    disable() {
      if (!on) return;
      on = false;
      try {
        stdout.write(PASTE_OFF);
      } catch {
        // best-effort on the way out
      }
    },
  };
}
