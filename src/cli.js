import readline from 'node:readline';
import { loadDotenv } from './env.js';
import { getProvider, listProviders } from './providers/index.js';
import { getStore, listStores } from './store/index.js';
import { sendTelegram, telegramEnabled, fetchTelegramChats } from './notify/telegram.js';
import { runServer } from './serve.js';
import { loadConfig, saveConfig, redactConfig, configPath } from './config.js';
import { TEMPLATE } from './template.js';
import {
  renderMarkdown,
  banner,
  hint,
  promptLabel,
  auroraLabel,
  startSpinner,
  statusLine,
  metaLine,
  info,
  warn,
  error,
} from './ui.js';

export async function main(argv = process.argv.slice(2)) {
  loadDotenv(); // pull .env into process.env before config/creds are read
  if (argv.includes('--help') || argv.includes('-h')) return printUsage();
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log('aurora 0.1.0');
    return;
  }

  const config = loadConfig();

  // Allow a one-shot model override: `aurora --model claude-sonnet-4-6`
  const modelIdx = argv.indexOf('--model');
  if (modelIdx !== -1 && argv[modelIdx + 1]) config.model = argv[modelIdx + 1];

  let provider;
  try {
    provider = getProvider(config.provider, config);
  } catch (e) {
    console.error(error(e.message));
    process.exit(1);
  }

  // --- Server / listener mode (headless, no REPL) -----------------------
  // `aurora --serve` (and what `npm start` runs) starts every configured
  // inbound listener and keeps them running: the two-way Telegram bridge today,
  // plus any future webhooks registered in src/serve.js. `aurora --telegram`
  // is a back-compatible alias that runs the same server.
  if (argv.includes('--serve') || argv.includes('--telegram')) {
    console.log('\n' + banner());
    console.log(info('  Backend: ') + provider.describe());
    try {
      await runServer({ provider, config, logLine: (m) => console.log(info('  • ') + m) });
    } catch (e) {
      console.error(error('  ✖ ' + e.message));
      process.exit(1);
    }
    return;
  }

  // Optional persistence (opt-in via config.store). Best-effort: if the store
  // can't open, warn and fall back to stateless rather than refusing to start.
  let store = getStore(config.store, config);
  try {
    await store.open();
  } catch (e) {
    console.error(warn('  persistence disabled: ' + e.message));
    store = getStore('none', config);
  }

  // --- Startup screen ---------------------------------------------------
  console.log('\n' + banner());
  console.log(renderMarkdown(TEMPLATE));
  console.log('\n' + info('  Backend: ') + provider.describe());
  if (config.store && config.store !== 'none') {
    console.log(info('  Store:   ') + config.store);
  }
  if (telegramEnabled(config)) console.log(info('  Notify:  ') + 'telegram');
  console.log(hint() + '\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptLabel(),
  });

  const ctx = { rl, provider, config, store };

  // Process input strictly one line at a time. Readline can deliver several
  // 'line' events back-to-back (paste, or piped stdin); without a queue their
  // async handlers would interleave and a trailing /exit could exit mid-answer.
  const queue = [];
  let working = false;
  let exitRequested = false; // /exit: stop now, ignore the rest of the queue
  let eofReached = false; // stdin EOF / Ctrl-D: drain the queue, then quit

  const finish = async () => {
    try {
      await ctx.store.close();
    } catch {
      // closing the store should never block exit
    }
    console.log('\n' + info('Goodbye.') + '\n');
    process.exit(0);
  };

  const drain = async () => {
    if (working) return;
    working = true;
    while (queue.length && !exitRequested) {
      const text = queue.shift();
      if (text.startsWith('/')) {
        const keepGoing = await handleCommand(text, ctx);
        if (!keepGoing) exitRequested = true;
      } else {
        rl.pause();
        try {
          await streamResponse(ctx, text);
        } catch (e) {
          console.log(error('  ✖ ' + e.message) + '\n');
        }
        rl.resume();
      }
    }
    working = false;
    if (exitRequested || eofReached) finish();
    else rl.prompt();
  };

  rl.prompt();

  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) {
      if (!working) rl.prompt();
      return;
    }
    queue.push(text);
    drain();
  });

  // EOF (piped stdin) or Ctrl-D. Don't quit mid-answer: if work is in flight,
  // let the queue drain first; otherwise quit now.
  rl.on('close', () => {
    eofReached = true;
    if (!working) finish();
  });
}

async function streamResponse(ctx, text) {
  const { provider, store, config } = ctx;
  process.stdout.write('\n');
  const spinner = startSpinner();
  let headerPrinted = false;
  let gotText = false;
  let meta = null;
  let answer = '';

  const ensureHeader = () => {
    if (!headerPrinted) {
      spinner.stop();
      process.stdout.write(auroraLabel() + '\n');
      headerPrinted = true;
    }
  };

  for await (const ev of provider.send(text)) {
    if (ev.type === 'status') {
      spinner.stop();
      // Status lines appear before the answer body starts.
      if (!gotText) console.log(statusLine(ev.text));
    } else if (ev.type === 'delta') {
      ensureHeader();
      gotText = true;
      answer += ev.text;
      process.stdout.write(ev.text);
    } else if (ev.type === 'done') {
      meta = ev;
    }
  }

  spinner.stop();

  if (meta?.isError && !gotText) {
    console.log(error('  ✖ ' + (meta.text || 'the model returned an error')) + '\n');
    return;
  }
  if (!gotText && meta?.text) {
    // No streaming deltas arrived, but we have a final result — print it.
    process.stdout.write(auroraLabel() + '\n' + meta.text);
  }

  process.stdout.write('\n');
  const ml = metaLine({
    costUsd: meta?.costUsd ?? undefined,
    session: provider.shortSession?.(),
    model: provider.config?.model || undefined,
  });
  if (ml) console.log(ml);
  process.stdout.write('\n');

  // --- Side effects: persist + notify (both best-effort) ---------------
  const finalText = gotText ? answer : meta?.text || '';
  const sessionId = meta?.sessionId || provider.shortSession?.() || null;
  await persistTurns(store, sessionId, text, finalText, meta);
  await maybeNotify(config, finalText);
}

/** Record the user prompt and assistant answer, if a store is active. */
async function persistTurns(store, sessionId, prompt, answer, meta) {
  if (!store || store.constructor.id === 'none' || !sessionId) return;
  const ts = new Date().toISOString();
  try {
    await store.saveTurn(sessionId, { role: 'user', text: prompt, ts });
    await store.saveTurn(sessionId, {
      role: 'assistant',
      text: answer,
      ts,
      model: meta?.model,
      costUsd: meta?.costUsd,
    });
  } catch {
    // Persistence is best-effort; never break the chat over a failed write.
  }
}

/** Send a Telegram ping when the turn finishes, if enabled. */
async function maybeNotify(config, answer) {
  if (!config?.notify?.telegram?.notifyOnDone || !telegramEnabled(config)) return;
  const preview = answer.replace(/\s+/g, ' ').trim().slice(0, 280);
  const res = await sendTelegram(`Aurora finished a turn:\n\n${preview}`, config);
  if (!res.ok) console.log(warn('  telegram: ' + res.error));
}

async function handleCommand(text, ctx) {
  const [cmd, ...rest] = text.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case 'help':
    case '?':
      printHelp();
      return true;

    case 'template':
      console.log('\n' + renderMarkdown(TEMPLATE) + '\n');
      return true;

    case 'new':
    case 'reset':
      ctx.provider.reset();
      console.log('\n' + info('Started a fresh conversation.') + ' ' + warn(`(session ${ctx.provider.shortSession?.() ?? 'n/a'})`) + '\n');
      return true;

    case 'provider':
      handleProvider(arg, ctx);
      return true;

    case 'model':
      handleModel(arg, ctx);
      return true;

    case 'config':
      console.log('\n' + info('Config file: ') + configPath);
      // Mask secrets (tokens) so /config is safe to screen-share.
      console.log(JSON.stringify(redactConfig(ctx.config), null, 2) + '\n');
      return true;

    case 'store':
      await handleStore(arg, ctx);
      return true;

    case 'notify':
      await handleNotify(arg, ctx);
      return true;

    case 'clear':
      console.clear();
      return true;

    case 'exit':
    case 'quit':
    case 'q':
      ctx.rl.close();
      return false;

    default:
      console.log('\n' + warn(`Unknown command: /${cmd}. Try /help.`) + '\n');
      return true;
  }
}

function handleProvider(arg, ctx) {
  if (!arg || arg === 'list') {
    console.log('\n' + info('Providers:'));
    for (const p of listProviders()) {
      const current = p.id === ctx.config.provider ? warn('  ◀ current') : '';
      const status = p.implemented ? '' : warn(' (planned)');
      console.log(`  ${p.id === ctx.config.provider ? '●' : '○'} ${p.id} — ${p.label}${status}${current}`);
    }
    console.log(info('\n  Switch with: ') + '/provider <id>\n');
    return;
  }

  try {
    const next = getProvider(arg, ctx.config);
    ctx.provider = next;
    ctx.config.provider = arg;
    saveConfig(ctx.config);
    console.log('\n' + info('Switched to: ') + next.describe() + '\n');
  } catch (e) {
    console.log('\n' + error(e.message) + '\n');
  }
}

function handleModel(arg, ctx) {
  if (!arg) {
    console.log('\n' + info('Current model: ') + (ctx.config.model || '(provider default)'));
    console.log(info('Set with: ') + '/model <name>   ·   reset with /model default\n');
    return;
  }
  ctx.config.model = arg === 'default' ? null : arg;
  // Rebuild the provider so the new model takes effect on the next turn.
  ctx.provider = getProvider(ctx.config.provider, ctx.config);
  saveConfig(ctx.config);
  console.log('\n' + info('Model set to: ') + (ctx.config.model || '(provider default)') + '\n');
}

async function handleStore(arg, ctx) {
  if (!arg || arg === 'list') {
    console.log('\n' + info('Stores:'));
    for (const s of listStores()) {
      const current = s.id === ctx.config.store;
      console.log(`  ${current ? '●' : '○'} ${s.id} — ${s.label}${current ? warn('  ◀ current') : ''}`);
    }
    console.log(info('\n  Switch with: ') + '/store <id>   (persistence is opt-in)\n');
    return;
  }
  const ids = listStores().map((s) => s.id);
  if (!ids.includes(arg)) {
    console.log('\n' + warn(`Unknown store "${arg}". Options: ${ids.join(', ')}.`) + '\n');
    return;
  }
  const next = getStore(arg, { ...ctx.config, store: arg });
  try {
    await next.open();
  } catch (e) {
    console.log('\n' + error(e.message) + '\n');
    return;
  }
  try {
    await ctx.store.close();
  } catch {
    // ignore close errors on the outgoing store
  }
  ctx.store = next;
  ctx.config.store = arg;
  saveConfig(ctx.config);
  console.log('\n' + info('Store set to: ') + arg + '\n');
}

async function handleNotify(arg, ctx) {
  const tg = (ctx.config.notify ||= {}).telegram ||= {};
  if (arg === 'test') {
    if (!telegramEnabled(ctx.config)) {
      console.log('\n' + warn('Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, then enable it.') + '\n');
      return;
    }
    const res = await sendTelegram('Aurora test message ✅', ctx.config);
    console.log('\n' + (res.ok ? info('Sent ✅') : error('Failed: ' + res.error)) + '\n');
    return;
  }
  if (arg === 'whoami') {
    console.log('\n' + info('Looking up your chat id via getUpdates…'));
    const res = await fetchTelegramChats();
    if (!res.ok) {
      console.log(error('  ✖ ' + res.error) + '\n');
      return;
    }
    if (!res.chats.length) {
      console.log(warn('  No chats found. Send your bot a message first, then run /notify whoami again.') + '\n');
      return;
    }
    console.log(info('  Chats that have messaged your bot:'));
    for (const c of res.chats) {
      console.log(`    ${c.id}  —  ${c.name || '(no name)'} ${warn('[' + c.type + ']')}`);
    }
    // Print-only: Aurora never writes the chat id to disk. Export it yourself.
    const one = res.chats.length === 1 ? res.chats[0].id : '<chat-id>';
    console.log(info('\n  Add it to your environment (e.g. .env):'));
    console.log('    export TELEGRAM_CHAT_ID=' + one + '\n');
    return;
  }
  if (arg === 'on' || arg === 'off') {
    tg.enabled = arg === 'on';
    tg.notifyOnDone = arg === 'on';
    saveConfig(ctx.config);
    console.log('\n' + info('Telegram notifications: ') + (tg.enabled ? 'on' : 'off') + '\n');
    return;
  }
  // Status (default)
  console.log(
    '\n' +
      info('Telegram notify: ') +
      (tg.enabled ? 'enabled' : 'disabled') +
      (telegramEnabled(ctx.config) ? '' : warn('  (credentials missing)')) +
      '\n  Commands: /notify on | off | test | whoami' +
      '\n  Credentials come from $TELEGRAM_BOT_TOKEN / $TELEGRAM_CHAT_ID (preferred) or config.\n',
  );
}

function printHelp() {
  console.log(
    '\n' +
      info('Commands') +
      '\n' +
      [
        ['/help', 'show this help'],
        ['/template', 'show the Aurora Research Method again'],
        ['/new', 'start a fresh conversation (clears context)'],
        ['/provider [id]', 'list providers, or switch backend'],
        ['/model [name]', 'show or set the model (/model default to reset)'],
        ['/store [id]', 'show or switch persistence (none/json/sqlite)'],
        ['/notify [on|off|test|whoami]', 'Telegram alerts; whoami finds your chat id'],
        ['/config', 'show config file path and contents'],
        ['/clear', 'clear the screen'],
        ['/exit', 'quit (or Ctrl-D)'],
      ]
        .map(([c, d]) => '  ' + c.padEnd(16) + ' ' + d)
        .join('\n') +
      '\n',
  );
}

function printUsage() {
  console.log(
    [
      'aurora — a research-grade AI chat in your terminal',
      '',
      'Usage:',
      '  aurora                 start an interactive chat',
      '  aurora --model <name>  start with a specific model',
      '  aurora --serve         run as a server: start every configured listener',
      '                         (Telegram bridge + future webhooks). `npm start` runs this.',
      '  aurora --telegram      alias for --serve (kept for back-compat)',
      '  aurora --help          show this',
      '  aurora --version       print version',
      '',
      'Config lives at: ' + configPath,
    ].join('\n'),
  );
}
