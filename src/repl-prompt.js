import readline from 'node:readline';
import chalk from 'chalk';

// Raw cursor controls used while repainting the spinner row above the prompt.
// HIDE/SHOW bracket the repaint so the brief cursor movement is never visible;
// SAVE/RESTORE (DECSC/DECRC) park the cursor at its live input position and put
// it back exactly, so we can paint the row above without calling rl.prompt() —
// which is what used to bounce the cursor to the prompt and make it flash.
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const SAVE_CURSOR = '\x1b7';
const RESTORE_CURSOR = '\x1b8';

/**
 * Keeps the `you ❯` prompt pinned at the bottom of the terminal and typeable
 * while Aurora is answering. Every piece of turn output — the streamed answer,
 * status lines, the meta line — is routed through here instead of straight to
 * stdout: each complete line is printed ABOVE the prompt, then the prompt and
 * whatever the user has typed so far are redrawn beneath it.
 *
 * Why line-by-line: a Node readline prompt owns the bottom row, so we can't let
 * raw token writes land on it without corrupting the input. We buffer the stream
 * to line boundaries and, for each finished line, clear the prompt row, print the
 * line (which scrolls it up into history), and re-render the prompt via
 * `rl.prompt(true)` (the `true` preserves the in-progress input + cursor). The
 * trade-off vs. the old token-by-token stream is that a line only appears once
 * its newline arrives — acceptable for a persistent, always-listening prompt.
 *
 * Off a TTY (pipes, tests) there is no prompt to protect, so it degrades to a
 * plain line writer with no cursor control and no prompt redraws.
 */
export class PromptPrinter {
  constructor(rl, out = process.stdout) {
    this.rl = rl;
    this.out = out;
    this.partial = ''; // streamed text not yet terminated by a newline
    this.tty = Boolean(out.isTTY);
    this.statusText = null; // the live "thinking" row pinned above the prompt, or null
  }

  /** Print one complete line above the pinned prompt, then redraw the prompt. */
  line(text = '') {
    if (!this.tty || !this.rl) {
      this.out.write(text + '\n');
      return;
    }
    if (this.statusText != null) {
      // The "thinking" row is pinned directly above the prompt. To insert a content
      // line and keep that ordering, clear both the status and prompt rows, print the
      // content (which scrolls up into history), then re-lay the status row and the
      // prompt beneath it. Hide the cursor across the reflow so it doesn't flash.
      this.out.write(HIDE_CURSOR);
      readline.cursorTo(this.out, 0);
      readline.clearLine(this.out, 0); // prompt row
      readline.moveCursor(this.out, 0, -1);
      readline.clearLine(this.out, 0); // status row
      this.out.write(text + '\n'); // content takes the old status row, then scrolls up
      this.out.write(this.statusText + '\n'); // re-draw the status row beneath the content
      this.rl.prompt(true);
      this.out.write(SHOW_CURSOR);
      return;
    }
    readline.cursorTo(this.out, 0);
    readline.clearLine(this.out, 0);
    this.out.write(text + '\n');
    this.rl.prompt(true);
  }

  /** Buffer streamed text; flush each complete line above the prompt as it lands. */
  write(chunk) {
    this.partial += String(chunk ?? '');
    let nl;
    while ((nl = this.partial.indexOf('\n')) !== -1) {
      const line = this.partial.slice(0, nl);
      this.partial = this.partial.slice(nl + 1);
      this.line(line);
    }
  }

  /** Emit any buffered partial line. Call once a turn's output is complete. */
  flush() {
    if (this.partial) {
      const tail = this.partial;
      this.partial = '';
      this.line(tail);
    }
  }

  /**
   * Animated "busy" indicator for the whole turn: a braille spinner on its OWN row,
   * pinned directly above the `you ❯` prompt. It stays visible the entire time Aurora
   * works — including the silent gaps between line-buffered output and during tool
   * calls — because `line()` re-lays this status row beneath each content line it
   * prints (see `this.statusText`), so streaming answer text never pushes it away.
   *
   * The first frame opens a fresh row above the prompt; subsequent frames repaint it
   * in place. `stop()` clears the row (leaving a single blank separator above the
   * prompt) and is idempotent. Off a TTY it is a no-op. Returns `{ stop }`.
   *
   * Tradeoff vs. the old prompt-prefix approach: the in-place repaint assumes the
   * prompt occupies one row, so type-ahead long enough to wrap while Aurora is
   * thinking can momentarily disturb the status row until the next content line.
   */
  thinking(label = 'Aurora is thinking') {
    const { rl, out, tty } = this;
    if (!tty || !rl) return { stop() {} };

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let stopped = false;
    let opened = false;

    const render = () => {
      if (stopped) return;
      this.statusText = chalk.magenta(frames[i++ % frames.length]) + ' ' + chalk.dim(label + '…');
      if (!opened) {
        // First frame: open a fresh row directly above the prompt for the status
        // line. This one redraws the prompt (it establishes the two-row layout);
        // the cursor is hidden so even that initial move isn't seen.
        out.write(HIDE_CURSOR);
        readline.cursorTo(out, 0);
        readline.clearLine(out, 0);
        out.write(this.statusText + '\n'); // scrolls up, leaving the prompt row below
        rl.prompt(true);
        out.write(SHOW_CURSOR);
        opened = true;
      } else {
        // Repaint the status row one line above WITHOUT touching the prompt: hide
        // the cursor, save its live input position, paint the row, restore it. Not
        // calling rl.prompt(true) here is what kills the per-frame flash — the input
        // line is never redrawn, so the cursor never bounces to the prompt and back.
        out.write(HIDE_CURSOR + SAVE_CURSOR);
        readline.moveCursor(out, 0, -1);
        readline.cursorTo(out, 0);
        readline.clearLine(out, 0);
        out.write(this.statusText);
        out.write(RESTORE_CURSOR + SHOW_CURSOR);
      }
    };

    render();
    const id = setInterval(render, 100);

    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        clearInterval(id);
        this.statusText = null;
        // Clear the status row, leaving a single blank separator above the prompt.
        // This one redraws the prompt to re-establish a clean single-row layout;
        // hide the cursor across it so the teardown move isn't seen.
        out.write(HIDE_CURSOR);
        readline.cursorTo(out, 0);
        readline.moveCursor(out, 0, -1);
        readline.clearLine(out, 0);
        readline.cursorTo(out, 0);
        readline.moveCursor(out, 0, 1);
        rl.prompt(true);
        out.write(SHOW_CURSOR);
      },
    };
  }
}
