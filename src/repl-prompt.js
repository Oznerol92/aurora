import readline from 'node:readline';

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
  }

  /** Print one complete line above the pinned prompt, then redraw the prompt. */
  line(text = '') {
    if (this.tty) {
      readline.cursorTo(this.out, 0);
      readline.clearLine(this.out, 0);
    }
    this.out.write(text + '\n');
    if (this.tty && this.rl) this.rl.prompt(true);
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
}
