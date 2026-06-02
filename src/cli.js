import readline from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotenv } from './env.js';
import { getProvider, listProviders } from './providers/index.js';
import { getStore, listStores } from './store/index.js';
import { resolveDataDir } from './store/location.js';
import { attachSession, rotateSession, writeActiveSession } from './store/session.js';
import { saveExchange } from './store/persist.js';
import { previewTitle, firstUserText } from './store/title.js';
import { conversationToMarkdown } from './store/export.js';
import { runFirstRunSetup, shouldRunSetup } from './setup.js';
import { sendTelegram, telegramEnabled, fetchTelegramChats } from './notify/telegram.js';
import { runServer, startListeners } from './serve.js';
import { loadConfig, saveConfig, redactConfig, configPath } from './config.js';
import { TEMPLATE } from './template.js';

// Single source of truth for the version: package.json. `npm version` bumps it,
// and the release workflow checks it against the pushed tag.
const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
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
    console.log('aurora ' + VERSION);
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

  const isServe = argv.includes('--serve') || argv.includes('--telegram');
  // REPL by default also starts listeners (Telegram); --solo keeps it local.
  const solo = argv.includes('--solo');

  // First-run questionnaire: offer a persistence backend (with hints based on
  // what's installed) before anything opens a store. Interactive REPL only, and
  // only until the user has answered once.
  if (shouldRunSetup(config, { isServe, isTty: Boolean(process.stdin.isTTY) })) {
    await runFirstRunSetup(config);
  }

  // Optional persistence (opt-in via config.store). Best-effort: if the store
  // can't open, warn and fall back to stateless rather than refusing to start.
  // Opened before either mode so the CLI and the server share one history.
  let store = getStore(config.store, config);
  try {
    await store.open();
  } catch (e) {
    console.error(warn('  persistence disabled: ' + e.message));
    store = getStore('none', config);
  }
  const hasStore = store.constructor.id !== 'none';

  // Attach to the shared "active session" so the CLI and the Telegram bridge
  // continue the same conversation (only when a store is on — otherwise each
  // process stays its own stateless chat).
  let sessionId = attachSession(provider, config, hasStore);

  // --- Server / listener mode (headless, no REPL) -----------------------
  // `aurora --serve` (and what `npm start` runs) starts every configured
  // inbound listener and keeps them running: the two-way Telegram bridge today,
  // plus any future webhooks registered in src/serve.js. `aurora --telegram`
  // is a back-compatible alias that runs the same server.
  if (isServe) {
    console.log('\n' + banner());
    console.log(info('  Backend: ') + provider.describe());
    if (hasStore)
      console.log(info('  Store:   ') + config.store + ` (session ${shortId(sessionId)})`);
    try {
      await runServer({
        provider,
        config,
        store,
        logLine: (m) => console.log(info('  • ') + m),
      });
    } catch (e) {
      console.error(error('  ✖ ' + e.message));
      process.exit(1);
    }
    return;
  }

  // --- Startup screen ---------------------------------------------------
  console.log('\n' + banner());
  console.log(renderMarkdown(TEMPLATE));
  console.log('\n' + info('  Backend: ') + provider.describe());
  if (hasStore) {
    console.log(info('  Store:   ') + config.store + ` (session ${shortId(sessionId)})`);
  }
  if (telegramEnabled(config)) console.log(info('  Notify:  ') + 'telegram');

  // Bring up inbound listeners (the Telegram bridge today) alongside the REPL,
  // so you can talk to Aurora from your phone while the terminal stays open —
  // both share the one active session, so it's a single conversation. They run
  // in the background; pass --solo for a purely-local chat. Listeners start on
  // their own credentials (same rule as --serve), independent of /notify.
  if (!solo) {
    const started = startListeners({
      provider,
      config,
      store,
      logLine: (m) => console.log(info('  • ') + m),
    });
    if (started.length) console.log(info('  Live on: ') + started.join(', '));
  }
  console.log(hint() + '\n');

  // Pick the shared conversation back up: replay its recent turns (including any
  // that arrived over Telegram) so the terminal shows where things left off.
  if (hasStore && sessionId) {
    try {
      const prior = await store.getConversation(sessionId);
      if (prior.length) {
        const title = previewTitle(firstUserText(prior));
        replayTurns(prior, `Picking up session ${shortId(sessionId)} · "${title}"`);
        console.log(hint() + '\n');
      }
    } catch {
      // A failed replay shouldn't stop the chat from starting.
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptLabel(),
  });

  const ctx = { rl, provider, config, store, hasStore, sessionId };

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
  // Persist under the shared session id (so CLI + Telegram land in one thread),
  // falling back to whatever the provider reported.
  const finalText = gotText ? answer : meta?.text || '';
  ctx.sessionId = ctx.sessionId || meta?.sessionId || null;
  await saveExchange(store, ctx.sessionId, text, finalText, meta);
  await maybeNotify(config, finalText);
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
      // Rotate the shared session so a fresh thread starts on Telegram too.
      ctx.sessionId = rotateSession(ctx.provider, ctx.config, ctx.hasStore);
      console.log(
        '\n' +
          info('Started a fresh conversation.') +
          ' ' +
          warn(`(session ${ctx.provider.shortSession?.() ?? 'n/a'})`) +
          '\n',
      );
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

    case 'history':
    case 'sessions':
      await handleHistory(ctx);
      return true;

    case 'resume':
      await handleResume(arg, ctx);
      return true;

    case 'export':
      await handleExport(arg, ctx);
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
      console.log(
        `  ${p.id === ctx.config.provider ? '●' : '○'} ${p.id} — ${p.label}${status}${current}`,
      );
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
  // `/store scope [global|project]` — view or change where data is kept.
  if (arg === 'scope' || arg.startsWith('scope ')) {
    const want = arg.slice('scope'.length).trim();
    if (!want) {
      console.log(
        '\n' +
          info('Store scope: ') +
          (ctx.config.storeScope || 'global') +
          '\n' +
          info('Data dir:    ') +
          resolveDataDir({ scope: ctx.config.storeScope }) +
          '\n  Set with: /store scope global | project   (project = ./.aurora here)\n',
      );
      return;
    }
    if (want !== 'global' && want !== 'project') {
      console.log('\n' + warn(`Unknown scope "${want}". Use global or project.`) + '\n');
      return;
    }
    ctx.config.storeScope = want;
    saveConfig(ctx.config);
    // Re-open the active store so the change takes effect immediately.
    if (ctx.config.store && ctx.config.store !== 'none') {
      const next = getStore(ctx.config.store, ctx.config);
      try {
        await next.open();
        await ctx.store.close().catch(() => {});
        ctx.store = next;
      } catch (e) {
        console.log('\n' + error(e.message) + '\n');
        return;
      }
    }
    console.log(
      '\n' + info('Store scope: ') + want + '  →  ' + resolveDataDir({ scope: want }) + '\n',
    );
    return;
  }

  if (!arg || arg === 'list') {
    console.log('\n' + info('Stores:'));
    for (const s of listStores()) {
      const current = s.id === ctx.config.store;
      console.log(
        `  ${current ? '●' : '○'} ${s.id} — ${s.label}${current ? warn('  ◀ current') : ''}`,
      );
    }
    console.log(
      info('\n  Scope: ') +
        (ctx.config.storeScope || 'global') +
        '  (' +
        resolveDataDir({ scope: ctx.config.storeScope }) +
        ')',
    );
    console.log(
      info('  Switch with: ') +
        '/store <id>   ·   /store scope global|project   (persistence is opt-in)\n',
    );
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

/** List saved conversations (most recent first). Needs a non-`none` store. */
async function handleHistory(ctx) {
  if (!ctx.store || ctx.store.constructor.id === 'none') {
    console.log(
      '\n' +
        warn('Persistence is off. Enable it with /store sqlite (or json) to keep history.') +
        '\n',
    );
    return;
  }
  let convs = [];
  try {
    convs = await ctx.store.listConversations();
  } catch (e) {
    console.log('\n' + error('  ✖ ' + e.message) + '\n');
    return;
  }
  if (!convs.length) {
    console.log('\n' + info('No saved conversations yet.') + '\n');
    return;
  }
  convs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  console.log('\n' + info('Saved conversations:') + warn('  (most recent first)'));
  for (const c of convs) {
    const id = String(c.sessionId).slice(0, 8);
    const when = c.updatedAt ? String(c.updatedAt).replace('T', ' ').slice(0, 16) : '—';
    const meta = warn(`${String(c.turns).padStart(3)} turns · ${when}`);
    console.log(`  ${info(id)}  ${meta}  ${previewTitle(c.title)}`);
  }
  console.log(
    info('\n  Resume: ') +
      '/resume <id>  ·  ' +
      info('latest: ') +
      '/resume  ·  ' +
      info('save: ') +
      '/export [id]\n',
  );
}

/** Reattach to a saved conversation by (a prefix of) its session id. */
async function handleResume(arg, ctx) {
  if (!ctx.store || ctx.store.constructor.id === 'none') {
    console.log(
      '\n' + warn('Persistence is off. Enable it with /store sqlite (or json) first.') + '\n',
    );
    return;
  }
  let convs = [];
  try {
    convs = await ctx.store.listConversations();
  } catch (e) {
    console.log('\n' + error('  ✖ ' + e.message) + '\n');
    return;
  }
  if (!convs.length) {
    console.log('\n' + info('No saved conversations to resume yet.') + '\n');
    return;
  }

  let target;
  if (!arg) {
    // No id given: pick up the most recently updated conversation.
    target = convs.reduce((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)) > 0 ? b : a,
    );
  } else {
    const matches = convs.filter((c) => String(c.sessionId).startsWith(arg));
    if (!matches.length) {
      console.log('\n' + warn(`No saved conversation matches "${arg}". Try /history.`) + '\n');
      return;
    }
    if (matches.length > 1) {
      console.log(
        '\n' +
          warn(`"${arg}" matches ${matches.length} conversations — use more characters.`) +
          '\n',
      );
      return;
    }
    target = matches[0];
  }

  const sessionId = String(target.sessionId);
  if (!ctx.provider.resume(sessionId)) {
    console.log(
      '\n' + warn(`The ${ctx.provider.constructor.id} provider can't resume sessions.`) + '\n',
    );
    return;
  }
  // Make this the shared active session so it persists and the server follows.
  ctx.sessionId = sessionId;
  if (ctx.hasStore) writeActiveSession(ctx.config, sessionId);
  let turns = [];
  try {
    turns = await ctx.store.getConversation(sessionId);
  } catch {
    // Best-effort replay; resuming still works without the on-screen history.
  }
  const title = previewTitle(target.title || firstUserText(turns));
  replayTurns(turns, `Resuming session ${shortId(sessionId)} · "${title}"`);
  console.log(info('\n  Continuing this conversation. Type your next message.') + '\n');
}

/** Export a conversation to a Markdown file in the current directory. */
async function handleExport(arg, ctx) {
  if (!ctx.store || ctx.store.constructor.id === 'none') {
    console.log(
      '\n' + warn('Persistence is off. Enable it with /store sqlite (or json) first.') + '\n',
    );
    return;
  }
  // No id → export the conversation currently in progress.
  let sessionId = arg ? null : ctx.sessionId;
  if (arg) {
    let convs = [];
    try {
      convs = await ctx.store.listConversations();
    } catch (e) {
      console.log('\n' + error('  ✖ ' + e.message) + '\n');
      return;
    }
    const matches = convs.filter((c) => String(c.sessionId).startsWith(arg));
    if (matches.length !== 1) {
      const how = matches.length ? 'use more characters' : 'see /history';
      console.log('\n' + warn(`"${arg}" matches ${matches.length} conversations — ${how}.`) + '\n');
      return;
    }
    sessionId = String(matches[0].sessionId);
  }
  if (!sessionId) {
    console.log(
      '\n' + warn('Nothing to export yet — start (or /resume) a conversation first.') + '\n',
    );
    return;
  }

  let turns = [];
  try {
    turns = await ctx.store.getConversation(sessionId);
  } catch (e) {
    console.log('\n' + error('  ✖ ' + e.message) + '\n');
    return;
  }
  if (!turns.length) {
    console.log('\n' + warn('That conversation has no saved turns.') + '\n');
    return;
  }

  const md = conversationToMarkdown(turns, {
    sessionId,
    exportedAt: new Date().toISOString(),
  });
  const file = join(process.cwd(), `aurora-${shortId(sessionId)}.md`);
  try {
    writeFileSync(file, md, 'utf8');
  } catch (e) {
    console.log('\n' + error('  ✖ could not write file: ' + e.message) + '\n');
    return;
  }
  console.log('\n' + info('Exported ') + `${turns.length} turns → ` + file + '\n');
}

/** Short, display-friendly form of a session id. */
function shortId(id) {
  return id ? String(id).slice(0, 8) : 'n/a';
}

/**
 * Print a saved conversation to the terminal. `limit` keeps long research
 * threads from flooding the screen — only the most recent turns are shown, with
 * a note about how many were hidden.
 */
function replayTurns(turns, header, limit = 12) {
  const hidden = Math.max(0, turns.length - limit);
  const shown = hidden ? turns.slice(-limit) : turns;
  console.log('\n' + info(`${header} — ${turns.length} turn${turns.length === 1 ? '' : 's'}:`));
  if (hidden) {
    console.log(
      warn(`  … ${hidden} earlier turn${hidden === 1 ? '' : 's'} hidden (/history for all)`),
    );
  }
  for (const t of shown) {
    if (t.role === 'user') console.log('\n' + promptLabel() + t.text);
    else console.log(auroraLabel() + '\n' + renderMarkdown(t.text));
  }
}

async function handleNotify(arg, ctx) {
  const tg = ((ctx.config.notify ||= {}).telegram ||= {});
  if (arg === 'test') {
    if (!telegramEnabled(ctx.config)) {
      console.log(
        '\n' +
          warn(
            'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, then enable it.',
          ) +
          '\n',
      );
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
      console.log(
        warn('  No chats found. Send your bot a message first, then run /notify whoami again.') +
          '\n',
      );
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
        [
          '/store [id]',
          'show or switch persistence (none/json/sqlite); /store scope global|project',
        ],
        ['/history', 'list saved conversations (needs persistence on)'],
        ['/resume [id]', 'reattach to a saved conversation (no id = most recent)'],
        ['/export [id]', 'save a conversation to a Markdown file (no id = current)'],
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
      '  aurora                 start an interactive chat (also starts the Telegram',
      '                         bridge when configured, so you can chat from your phone)',
      '  aurora --solo          interactive chat only — do not start any listeners',
      '  aurora --model <name>  start with a specific model',
      '  aurora --serve         run as a server (no REPL): start every configured',
      '                         listener (Telegram bridge + future webhooks). `npm start` runs this.',
      '  aurora --telegram      alias for --serve (kept for back-compat)',
      '  aurora --help          show this',
      '  aurora --version       print version',
      '',
      'Config lives at: ' + configPath,
    ].join('\n'),
  );
}
