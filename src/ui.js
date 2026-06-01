import chalk from 'chalk';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Render Markdown to ANSI for the terminal.
marked.use(
  markedTerminal({
    reflowText: true,
    width: Math.min(process.stdout.columns || 100, 100),
    tab: 2,
  }),
);

export function renderMarkdown(md) {
  try {
    return marked.parse(md).trimEnd();
  } catch {
    return md;
  }
}

export function banner() {
  const art = [
    '    ___   __  ____  ____  ____  ____  ___ ',
    '   / _ \\ /  \\(  _ \\(  _ \\(  _ \\(  _ \\/ _ \\',
    '  / /_\\ \\/ /\\ \\ )   /)   / )   / )   / /_\\ \\',
    '  \\__  /\\____/(_)\\_)(_)\\_)(_)\\_)(_)\\_\\__  /',
    '  (___/                                (___/',
  ].join('\n');
  return chalk.magentaBright(art) + '\n' + chalk.dim('  your research-grade AI chat, in the terminal') + '\n';
}

export function hint() {
  return chalk.dim(
    'Type your message and press Enter. Commands: ' +
      [
        chalk.cyan('/help'),
        chalk.cyan('/template'),
        chalk.cyan('/new'),
        chalk.cyan('/provider'),
        chalk.cyan('/exit'),
      ].join(chalk.dim(' · ')),
  );
}

export function promptLabel() {
  return chalk.bold.cyan('you ❯ ');
}

export function auroraLabel() {
  return chalk.bold.magentaBright('aurora');
}

export function startSpinner(label = 'Aurora is thinking') {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let stopped = false;
  const tty = process.stdout.isTTY;
  let id = null;
  const clearLine = () => {
    if (tty) process.stdout.write('\r' + ' '.repeat(label.length + 4) + '\r');
  };
  if (tty) {
    id = setInterval(() => {
      process.stdout.write('\r' + chalk.magenta(frames[i % frames.length]) + ' ' + chalk.dim(label + '…'));
      i++;
    }, 80);
  }
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (id) clearInterval(id);
      clearLine();
    },
  };
}

export function statusLine(text) {
  return '  ' + chalk.dim('↳ ' + text + '…');
}

export function metaLine({ costUsd, session, model }) {
  const parts = [];
  if (model) parts.push(model);
  if (session) parts.push(`session ${session}`);
  if (typeof costUsd === 'number') parts.push(`$${costUsd.toFixed(4)}`);
  return parts.length ? chalk.dim('  · ' + parts.join(' · ')) : '';
}

export function info(text) {
  return chalk.cyan(text);
}

export function warn(text) {
  return chalk.yellow(text);
}

export function error(text) {
  return chalk.red(text);
}
