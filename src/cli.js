import readline from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotenv } from './env.js';
import { getProvider, listProviders } from './providers/index.js';
import { getStore, listStores } from './store/index.js';
import { resolveDataDir } from './store/location.js';
import {
  attachSession,
  rotateSession,
  writeActiveSession,
  readActiveSession,
} from './store/session.js';
import { saveUserTurn, saveAssistantTurn } from './store/persist.js';
import { previewTitle, firstUserText } from './store/title.js';
import { conversationToMarkdown } from './store/export.js';
import {
  runFirstRunSetup,
  shouldRunSetup,
  shouldRunPersonaSetup,
  runPersonaSetup,
} from './setup.js';
import { loadBrainCards, selectRelevantCards } from './brain/corpus.js';
import { loadSkills, selectSkill, compileSkill } from './skills/corpus.js';
import { resolveTurnEngine } from './route.js';
import { loadPersonaInstruction, PERSONA_SCOPE, PERSONA_FIELDS } from './persona.js';
import { sendTelegram, telegramEnabled, fetchTelegramChats } from './notify/telegram.js';
import { loadChats, registerChat, removeChat } from './notify/chats.js';
import { aiPreview } from './notify/preview.js';
import { resolvePreviewRunner, resolveOnceRunner } from './notify/once.js';
import {
  loadLedger,
  saveLedger,
  recordVisit,
  isFirstVisit,
  dirRecord,
  normalizeLedger,
} from './engines/ledger.js';
import {
  summarizeWork,
  composeBriefing,
  deterministicDigest,
  briefingDigestForUser,
  formatWhen,
} from './engines/briefing.js';
import {
  ProtocolStreamFilter,
  parseAskBlock,
  parseImplicitAsk,
  parseDoneBlock,
  stripProtocolBlocks,
  mapChoice,
  formatAnswers,
  buildRecap,
  recapSource,
} from './protocol.js';
import { createPasteInput } from './paste.js';
import { PromptPrinter } from './repl-prompt.js';
import { runServer, startListeners } from './serve.js';
import { loadConfig, saveConfig, redactConfig, configPath } from './config.js';
import { primaryLockHolder, acquirePrimaryLock, releasePrimaryLock } from './instance.js';
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
  dim,
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
  // REPL by default also starts listeners (Telegram); --solo runs the chat
  // local AND ephemeral (no listeners, no DB) — see the single-writer rule below.
  const solo = argv.includes('--solo');

  // Single-writer rule: only one "primary" aurora (the instance that owns the DB
  // and the inbound listeners) may run at a time, so two instances never fight
  // over the store or double-bind the Telegram poller. A second plain launch is
  // refused and pointed at `aurora --solo`, which runs ephemeral. Solo instances
  // skip the check and may coexist freely.
  if (!solo) {
    const holder = primaryLockHolder();
    if (holder) {
      console.error(
        '\n' +
          warn(
            '  An aurora is already running' + (holder.pid ? ` (pid ${holder.pid})` : '') + '.',
          ) +
          '\n  ' +
          info('Start a second, ephemeral session with: ') +
          'aurora --solo\n',
      );
      process.exit(1);
    }
    acquirePrimaryLock();
  }

  // Solo is fully ephemeral: no inbound listeners (below) and no persistence, so
  // it can't touch the primary's DB. Force the store off regardless of config,
  // and skip the persistence questionnaire — there's nothing to persist.
  if (solo) config.store = 'none';

  // First-run questionnaire: offer a persistence backend (with hints based on
  // what's installed) before anything opens a store. Interactive REPL only, and
  // only until the user has answered once.
  if (!solo && shouldRunSetup(config, { isServe, isTty: Boolean(process.stdin.isTTY) })) {
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

  // One-time persona questionnaire (needs an open store to write to), then wire
  // the method brain + the user's voice profile into the provider so every fresh
  // session injects them. Skipped in serve/solo/non-TTY by the guards.
  if (
    !solo &&
    shouldRunPersonaSetup(config, hasStore, { isServe, isTty: Boolean(process.stdin.isTTY) })
  ) {
    await runPersonaSetup(store, config);
  }
  await applyBrainAndPersona(provider, store, config);

  // Decide which conversation this launch attaches to. By default we silently
  // pick up the shared "active session" (so the CLI and Telegram bridge continue
  // the same thread); `--new`/`--fresh` start clean and `--resume [id]` reattach
  // to a saved conversation. The chosen source is shown on the startup screen.
  const { sessionId: resolvedSession, source: sessionSource } = await resolveLaunch({
    provider,
    config,
    store,
    hasStore,
    argv,
  });
  let sessionId = resolvedSession;

  // Record the launching engine in the ledger (best-effort): stamps its
  // firstSeen once and refreshes "last active in this directory", so a later
  // /engine switch back can brief accurately. No briefing on launch itself —
  // there's no handoff, you're just starting.
  if (hasStore) {
    try {
      const at = new Date().toISOString();
      const ledger = await loadLedger(store);
      await saveLedger(
        store,
        recordVisit(ledger, provider.constructor.id, process.cwd(), { sessionId, at }),
      );
    } catch {
      // ledger is opt-in flourish; never block startup on it
    }
  }

  // --- Server / listener mode (headless, no REPL) -----------------------
  // `aurora --serve` (and what `npm start` runs) starts every configured
  // inbound listener and keeps them running: the two-way Telegram bridge today,
  // plus any future webhooks registered in src/serve.js. `aurora --telegram`
  // is a back-compatible alias that runs the same server.
  if (isServe) {
    console.log('\n' + banner());
    console.log(info('  Backend: ') + provider.describe());
    if (hasStore)
      console.log(
        info('  Store:   ') +
          config.store +
          ` (session ${shortId(sessionId)}${sessionSourceLabel(sessionSource)})`,
      );
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
  if (solo) console.log(info('  Mode:    ') + 'solo (ephemeral — conversation not saved)');
  if (hasStore) {
    console.log(
      info('  Store:   ') +
        config.store +
        ` (session ${shortId(sessionId)}${sessionSourceLabel(sessionSource)})`,
    );
  }
  if (telegramEnabled(config)) console.log(info('  Notify:  ') + 'telegram');

  // Bring up inbound listeners (the Telegram bridge today) alongside the REPL,
  // so you can talk to Aurora from your phone while the terminal stays open —
  // both share the one active session, so it's a single conversation. They run
  // in the background; pass --solo for a purely-local chat. Listeners start on
  // their own credentials (same rule as --serve), independent of /notify.
  // Shared handle to the REPL's pinned-prompt printer, filled in once the prompt
  // is live below. Background listeners capture it now and read it lazily, so a
  // Telegram exchange can be mirrored into the terminal above the `you ❯` line.
  const terminalMirror = { printer: null };
  if (!solo) {
    const started = startListeners({
      provider,
      config,
      store,
      logLine: (m) => console.log(info('  • ') + m),
      mirror: (event) => renderBridgeMirror(event, terminalMirror.printer),
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

  // Route stdin through the paste filter so a multi-line paste arrives as one
  // message shown as "[Pasted text #N +M lines]" rather than N separate turns. No-op on
  // piped/non-TTY input, so tests and pipes keep the old line-by-line behaviour.
  const paste = createPasteInput(process.stdin, process.stdout);
  const rl = readline.createInterface({
    input: paste.input,
    output: process.stdout,
    prompt: promptLabel(),
  });

  // On a real terminal, keep the `you ❯` prompt pinned and typeable while Aurora
  // answers: input is never blocked, and anything typed mid-answer is queued and
  // read at the next turn boundary. Piped/non-TTY input keeps the old, simpler
  // line-by-line flow (no pinned prompt, no type-ahead) so scripts/tests are
  // unchanged. The printer routes all turn output above the pinned prompt.
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const printer = interactive ? new PromptPrinter(rl, process.stdout) : null;
  terminalMirror.printer = printer; // let the Telegram bridge draw above the prompt

  const ctx = { rl, provider, config, store, hasStore, sessionId, printer };

  // Process input strictly one line at a time. Readline can deliver several
  // 'line' events back-to-back (paste, or piped stdin); without a queue their
  // async handlers would interleave and a trailing /exit could exit mid-answer.
  const queue = [];
  let working = false;
  let exitRequested = false; // /exit: stop now, ignore the rest of the queue
  let eofReached = false; // stdin EOF / Ctrl-D: drain the queue, then quit

  const finish = async () => {
    paste.disable(); // turn bracketed paste mode back off before we leave
    try {
      await ctx.store.close();
    } catch {
      // closing the store should never block exit
    }
    releasePrimaryLock(); // give up the single-writer lock so the next launch is primary
    console.log('\n' + info('Goodbye.') + '\n');
    process.exit(0);
  };
  // Safety net: restore the terminal even on an unexpected exit.
  process.on('exit', paste.disable);

  const drain = async () => {
    if (working) return;
    working = true;
    while (queue.length && !exitRequested) {
      const text = queue.shift();
      // A `/store` listing arms a one-shot picker (ctx.storePick). Consume it
      // here: if the next input is a bare number, treat it as the store choice
      // rather than a message to the model. Any other input clears the picker.
      const storePick = ctx.storePick;
      ctx.storePick = null;
      if (storePick && /^\d+$/.test(text)) {
        await handleStore(text, ctx);
        continue;
      }
      if (text.startsWith('/')) {
        const keepGoing = await handleCommand(text, ctx);
        if (!keepGoing) exitRequested = true;
      } else {
        // Interactive: leave readline live so the user can type-ahead while the
        // turn streams (the printer keeps the prompt pinned). Piped: pause as
        // before so a finite stream isn't read ahead into the queue mid-answer.
        if (!printer) rl.pause();
        try {
          await streamResponse(ctx, text);
        } catch (e) {
          const note = error('  ✖ ' + e.message);
          if (printer) printer.line(note);
          else console.log(note + '\n');
        }
        if (!printer) rl.resume();
      }
    }
    working = false;
    if (exitRequested || eofReached) finish();
    else rl.prompt();
  };

  rl.prompt();
  paste.enable(); // turn on bracketed paste mode now that the REPL is live

  rl.on('line', (line) => {
    // Swap any "[Pasted text #N +M lines]" placeholders back to their real text before
    // the line is processed, so the model receives the full paste.
    const raw = paste.store.size ? paste.store.expand(line) : line;
    paste.store.reset();
    const text = raw.trim();
    if (!text) {
      if (!working) rl.prompt();
      return;
    }

    // Mid-answer steering: `/read <text>` interrupts the turn in flight and feeds
    // the text — plus what Aurora had written so far — back into the SAME turn, so
    // the answer changes in place instead of waiting for the next one. Interactive
    // only; piped `/read` falls through to the normal queue (handled as a command).
    const steer = text.match(/^\/read\b\s*([\s\S]*)$/i);
    if (steer && printer) {
      const body = steer[1].trim();
      if (!working) {
        printer.line(
          dim('  /read steers Aurora while she is answering — nothing in progress to steer.'),
        );
        return;
      }
      if (!body) {
        printer.line(dim('  /read needs a message — e.g. /read answer in Go, not Rust'));
        return;
      }
      ctx.think?.stop(); // erase the animated indicator before printing below it
      ctx.steerText = body; // streamResponse picks this up when the turn ends
      ctx.interrupted = true; // make runTurn treat the abort as a clean stop
      ctx.provider.abort?.(); // kill the running turn so the steer turn can resume
      const shown = body.length > 60 ? body.slice(0, 57) + '…' : body;
      printer.line(info(`  ⤤ steering now — "${shown}"`));
      return;
    }

    queue.push(text);
    // Typed while Aurora is mid-answer: it's queued for the next turn. Confirm so
    // the user knows it landed (the answer keeps streaming above the prompt).
    if (working && printer) {
      printer.line(dim(`  ↩ queued (${queue.length}) — Aurora reads it next`));
    }
    drain();
  });

  // EOF (piped stdin) or Ctrl-D. Don't quit mid-answer: if work is in flight,
  // let the queue drain first; otherwise quit now.
  rl.on('close', () => {
    eofReached = true;
    if (!working) finish();
  });

  // Ctrl-C: cancel an in-flight turn (kill the child, keep the partial answer)
  // and return to the prompt; pressing it again at an idle prompt quits. Having
  // this listener also stops readline from killing the process on the first ^C.
  rl.on('SIGINT', () => {
    if (working) {
      ctx.interrupted = true;
      ctx.think?.stop(); // erase the animated indicator before printing below it
      ctx.provider.abort?.();
      // Stop means stop: drop any type-ahead queued behind the cancelled turn so
      // Ctrl-C doesn't silently roll on into the next queued message.
      const dropped = queue.length;
      queue.length = 0;
      if (dropped && printer) printer.line(dim(`  (dropped ${dropped} queued)`));
      return;
    }
    exitRequested = true;
    finish();
  });
}

/**
 * Drive one user message to a finished answer, looping over the interaction
 * protocol: if the model ends a turn with an `aurora:ask` block, prompt the user
 * (a numbered popup), feed the answers back into the SAME session, and continue
 * until a turn comes back with no question. That final turn is a "finish" and
 * pushes a recap to Telegram.
 */
async function streamResponse(ctx, text) {
  const { config } = ctx;

  // Skill selection: a clear trigger match (or an armed `/skill use <id>`)
  // compiles the skill's plan — procedure + named brain rules + template — and
  // prepends it for this turn. The store keeps the user's original text, not the
  // scaffolding (same trick `/read` uses). Applies to the opening message only.
  const applied = applySkillToMessage(ctx, text);

  // Engine routing for THIS task: an `@worker` prefix or the skill's `engine:`
  // field can borrow a different worker; the interface engine reverts afterward
  // (route by task, escalate by stakes — see src/route.js). `@worker` strips its
  // prefix from the message the model sees.
  const engines = listProviders()
    .filter((p) => p.implemented)
    .map((p) => p.id);
  const route = resolveTurnEngine(text, {
    skill: applied?.skill,
    engines,
    current: ctx.config.provider,
  });
  const userText = route.message; // @worker prefix stripped, if any

  let message = applied ? `${applied.block}\n\n${userText}` : userText;
  // Persist the user's own words (not the scaffolding or the @worker prefix).
  let saveAs = message === text ? null : text;

  // Borrow a worker for the duration of this task; the interface engine — what
  // the user chose with /engine — is restored in the finally below.
  const interfaceProvider = ctx.provider;
  let borrowed = false;
  if (route.engineId && route.engineId !== ctx.config.provider) {
    try {
      ctx.provider = await adoptProvider(getProvider(route.engineId, config), ctx);
      borrowed = true;
    } catch (e) {
      console.log('\n' + error(e.message) + '\n');
      ctx.provider = interfaceProvider;
    }
  }
  if (applied) console.log(dim(`  · skill: ${applied.skill.id}`));
  if (borrowed) console.log(dim(`  · engine: ${route.engineId} (${route.source})`));

  try {
    while (true) {
      // Persist the user turn up front (before the model is called) so an interrupt
      // or crash mid-answer can't lose it. Pin the session id now so the user turn
      // and the assistant turn land under the same conversation.
      const sessionId = ctx.sessionId || ctx.provider.sessionId || null;
      ctx.sessionId = sessionId;
      await saveUserTurn(ctx.store, sessionId, saveAs ?? message);
      saveAs = null;

      const turn = await runTurn(ctx, message);
      if (turn.errored) return;
      if (turn.interrupted) {
        // `/read` mid-answer steer: re-run the SAME turn with the user's nudge and
        // whatever Aurora had written so far, so the answer adjusts in place. A plain
        // Ctrl-C interrupt (no steer pending) just stops at the prompt.
        if (ctx.steerText) {
          const steer = ctx.steerText;
          ctx.steerText = null;
          saveAs = steer; // store the user's `/read` text, not the scaffolding we send
          message = composeSteer(steer, turn.cleanAnswer);
          continue;
        }
        return;
      }

      // A pending question takes priority: ask the user, then loop with the answers.
      // The model is supposed to wrap questions in an `aurora:ask` block; when it
      // forgets and just asks in prose, parseImplicitAsk catches the trailing
      // question so it isn't mistaken for a finished turn.
      const ask = parseAskBlock(turn.fullAnswer) || parseImplicitAsk(turn.fullAnswer);
      if (ask) {
        const answers = await askInTerminal(ctx.rl, ask.questions, ctx.printer);
        if (answers == null) {
          const note = warn('  ⏸ left the question unanswered');
          if (ctx.printer) ctx.printer.line(note);
          else console.log('\n' + note + '\n');
          return;
        }
        message = formatAnswers(ask.questions, answers);
        continue;
      }

      // No question → this turn finished the job. Recap to Telegram, previewing
      // the turn's conclusion (the final result message) rather than the full
      // narration, whose opening is preamble and reads as stale "old output".
      const recapText = recapSource(turn.meta?.text, turn.cleanAnswer);
      await maybeNotify(
        config,
        recapText,
        parseDoneBlock(turn.fullAnswer),
        ctx.provider?.constructor?.id,
      );
      return;
    }
  } finally {
    // Hand the conversation back to the interface engine the user chose.
    if (borrowed) ctx.provider = interfaceProvider;
  }
}

/**
 * Build the model-facing text for a mid-turn steer (`/read`). The user cut off an
 * in-flight answer, so we hand the model what it had written so far plus the new
 * instruction and ask it to adjust in place rather than restart blind. We feed the
 * partial back explicitly because the resumed CLI session may not retain the text
 * from a turn that was killed mid-stream.
 */
function composeSteer(steerText, partial) {
  const trimmed = (partial || '').trim();
  const seen = trimmed
    ? `You were partway through answering and had written so far:\n\n"""\n${trimmed}\n"""\n\n`
    : '';
  return (
    '[The user interrupted your in-progress answer to steer it.]\n\n' +
    seen +
    `They add: ${steerText}\n\n` +
    "[Take this into account and continue — adjust or extend what you had; don't start over unless the steer requires it.]"
  );
}

/**
 * Stream a single model turn to the terminal and persist it. Returns
 * `{ fullAnswer, cleanAnswer, meta, interrupted, errored }`, where `fullAnswer`
 * keeps any protocol blocks (for the caller to parse) and `cleanAnswer` is what
 * the user saw / what was stored. Protocol JSON is suppressed on screen via the
 * stream filter.
 */
async function runTurn(ctx, text) {
  const { provider, store, printer } = ctx;
  ctx.interrupted = false; // set by the SIGINT handler if Ctrl-C lands mid-turn
  const filter = new ProtocolStreamFilter();
  let headerPrinted = false;
  let gotText = false;
  let meta = null;

  // Two output paths: with a pinned prompt (interactive) everything goes through
  // the printer, line-buffered above the prompt; otherwise it streams straight to
  // stdout token-by-token as before. Both get a "thinking" indicator. In pinned
  // mode it's a spinner on its own row (`printer.thinking`) pinned directly above
  // the prompt that runs for the WHOLE turn — so the silent gaps between line-
  // buffered output and during tool calls still read as "alive". Off a pinned
  // prompt it's the classic in-place spinner on its own line, which must stop the
  // moment real output starts.
  const writeLine = (s = '') => (printer ? printer.line(s) : process.stdout.write(s + '\n'));
  const spinner = printer ? null : startSpinner();
  const think = printer ? printer.thinking() : null;
  ctx.think = think; // let the line/SIGINT handlers stop it before they print
  // In pinned mode the spinner row already separates the answer from the prompt, so
  // no blank line is needed; off a pinned prompt, keep the leading newline.
  if (!printer) process.stdout.write('\n');

  const stopThinking = () => {
    spinner?.stop();
    think?.stop();
    ctx.think = null;
  };

  const ensureHeader = () => {
    if (!headerPrinted) {
      // Non-printer spinner shares the output line, so it must go before any text;
      // the pinned-prompt spinner lives on the prompt and keeps running till the end.
      spinner?.stop();
      writeLine(auroraLabel());
      headerPrinted = true;
    }
  };
  const show = (chunk) => {
    if (!chunk) return;
    ensureHeader();
    gotText = true;
    if (printer) printer.write(chunk);
    else process.stdout.write(chunk);
  };

  try {
    for await (const ev of provider.send(text)) {
      if (ev.type === 'status') {
        spinner?.stop();
        // Log the tool that's running above the prompt (before the answer body);
        // the pinned-prompt spinner keeps animating to show the wait is alive.
        if (!gotText) writeLine(statusLine(ev.text));
      } else if (ev.type === 'delta') {
        show(filter.push(ev.text));
      } else if (ev.type === 'done') {
        meta = ev;
      }
    }
  } catch (e) {
    stopThinking();
    // Save whatever streamed before the failure, marked incomplete, so /resume
    // shows it and the model can continue from where it was cut off.
    const partial = stripProtocolBlocks(filter.full);
    if (partial) await saveAssistantTurn(store, ctx.sessionId, partial, meta, { complete: false });
    throw e;
  }

  show(filter.end()); // flush any held-back (non-marker) tail
  if (printer) printer.flush(); // emit the last partial line of the stream
  stopThinking();

  // Full text keeps the protocol blocks; fall back to the final result when no
  // deltas streamed (so a block-only turn is still parseable downstream).
  const fullAnswer = filter.full || meta?.text || '';
  const cleanAnswer = stripProtocolBlocks(fullAnswer);

  // Ctrl-C mid-answer: keep whatever streamed (flagged incomplete), then return
  // to the prompt without treating the cancellation as an error.
  if (ctx.interrupted) {
    if (cleanAnswer) {
      await saveAssistantTurn(store, ctx.sessionId, cleanAnswer, meta, { complete: false });
    }
    // A pending `/read` steer re-runs this turn immediately, so skip the "stopped"
    // note — only a real Ctrl-C (nothing queued to steer with) ends at the prompt.
    if (!ctx.steerText) {
      const note = warn('  ⏸ stopped (Ctrl-C again to quit)');
      if (printer) {
        printer.line('');
        printer.line(note);
        printer.line('');
      } else {
        process.stdout.write('\n' + note + '\n\n');
      }
    }
    return { interrupted: true, fullAnswer, cleanAnswer, meta };
  }

  if (meta?.isError && !gotText) {
    writeLine(error('  ✖ ' + (meta.text || 'the model returned an error')));
    if (!printer) process.stdout.write('\n');
    return { errored: true, fullAnswer, cleanAnswer: '', meta };
  }
  if (!gotText && cleanAnswer) {
    // No streaming deltas arrived, but we have a final result — print it.
    writeLine(auroraLabel());
    if (printer) {
      printer.write(cleanAnswer);
      printer.flush();
    } else {
      process.stdout.write(cleanAnswer);
    }
  }

  const ml = metaLine({
    costUsd: meta?.costUsd ?? undefined,
    session: provider.shortSession?.(),
    model: provider.config?.model || undefined,
  });
  if (printer) {
    printer.line('');
    if (ml) printer.line(ml);
    printer.line('');
  } else {
    process.stdout.write('\n');
    if (ml) console.log(ml);
    process.stdout.write('\n');
  }

  // Persist the completed assistant turn (blocks stripped) under the shared
  // session id, falling back to whatever the provider reported for the id.
  ctx.sessionId = ctx.sessionId || meta?.sessionId || null;
  if (cleanAnswer) {
    await saveAssistantTurn(store, ctx.sessionId, cleanAnswer, meta, { complete: true });
  }
  return { fullAnswer, cleanAnswer, meta };
}

/**
 * Render the model's questions as a numbered terminal "popup" and collect the
 * answers. Numbers map to options; free text is taken literally; multiSelect
 * accepts comma-separated picks. Resolves to an array of answers (aligned to the
 * questions), or null if the input stream closed before answering.
 */
function askInTerminal(rl, questions, printer = null) {
  // Interactive (pinned-prompt) mode keeps readline live throughout, so we must
  // not pause/resume around the popup; the question text is printed above the
  // prompt via the printer. Piped mode keeps the old resume-to-read / pause-after
  // dance, since drain() paused readline before the turn streamed.
  const interactive = Boolean(printer);
  const emit = (s = '') => (printer ? printer.line(s) : console.log(s));
  return new Promise((resolve) => {
    const answers = [];
    if (!interactive) rl.resume(); // piped: drain paused us; we need input now

    // If stdin closes mid-question, don't hang the loop. One handler for the
    // whole prompt sequence, removed once we settle, so listeners don't pile up.
    const onClose = () => resolve(null);
    rl.once('close', onClose);
    const settle = (value) => {
      rl.removeListener('close', onClose);
      resolve(value);
    };

    const askOne = (i) => {
      if (i >= questions.length) {
        if (!interactive) rl.pause();
        settle(answers);
        return;
      }
      const q = questions[i];
      const head = q.header ? warn(`[${q.header}] `) : '';
      emit('');
      emit(info('❓ ' + head + q.question));
      q.options.forEach((opt, n) => emit(`   ${warn(String(n + 1))}. ${opt}`));
      const prompt = q.options.length
        ? q.multiSelect
          ? '   number(s) (comma-separated) or your own answer ❯ '
          : '   number or your own answer ❯ '
        : '   your answer ❯ ';
      rl.question(info(prompt), (raw) => {
        answers.push(mapChoice(raw, q));
        askOne(i + 1);
      });
    };

    askOne(0);
  });
}

/**
 * Push a styled recap to Telegram when a turn finishes (best-effort). Prefers the
 * model-authored `done` block — a "Done / Next steps" card. For a blockless turn
 * it asks a model for a one-line gist of the whole turn (`aiPreview`), falling back
 * to the deterministic `previewText` inside `buildRecap` if the summariser is
 * disabled or fails. The gist engine follows notify.telegram.previewEngine: 'claude'
 * (default, the free CLI) or 'active' (the engine in `engineId`). Sent with HTML
 * parse mode; all dynamic content is escaped in `buildRecap`. Honors the `/notify`
 * master switch and only fires when Telegram is configured. Disable the AI step with
 * notify.telegram.aiPreview = false (then long turns get the leading-sentences view).
 */
async function maybeNotify(config, answer, done, engineId) {
  if (!telegramEnabled(config) || config?.notify?.telegram?.notifyOnDone === false) return;
  let body = answer;
  if (!done && config?.notify?.telegram?.aiPreview !== false) {
    const { runClaude, model } = resolvePreviewRunner(config, engineId);
    const gist = await aiPreview(answer, { model, runClaude });
    if (gist) body = gist; // else buildRecap's previewText handles the full answer
  }
  const res = await sendTelegram(buildRecap(body, done), config, { parseMode: 'HTML' });
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

    case 'engine':
    case 'provider': // back-compat alias for the old name
      await handleEngine(arg, ctx);
      return true;

    case 'model':
      await handleModel(arg, ctx);
      return true;

    case 'context':
      await handleContext(ctx);
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

    case 'brain':
      await handleBrain(arg, ctx);
      return true;

    case 'skill':
    case 'skills':
      handleSkill(arg, ctx);
      return true;

    case 'persona':
      await handlePersona(arg, ctx);
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

/**
 * (Re)load the brain cards + persona instruction and hand them to the provider.
 * Called once at startup and again whenever /brain or /persona change them, so
 * the next session reflects the change. Best-effort: a failure just clears that
 * piece rather than breaking the chat.
 */
async function applyBrainAndPersona(provider, store, config) {
  try {
    const cards = config.brain?.enabled !== false ? loadBrainCards() : [];
    provider.setBrainCards?.(cards);
  } catch {
    provider.setBrainCards?.([]);
  }
  try {
    provider.setPersona?.(await loadPersonaInstruction(store, config));
  } catch {
    provider.setPersona?.(null);
  }
}

/**
 * Choose and compile a skill for a user message, or null. Honours an armed
 * `/skill use <id>` (ctx.pendingSkill, one-shot) first, then auto-selects by
 * trigger when skills are enabled. Best-effort: any failure just means no skill.
 */
function applySkillToMessage(ctx, text) {
  const forcedId = ctx.pendingSkill || null;
  ctx.pendingSkill = null;
  if (!forcedId && ctx.config.skills?.enabled === false) return null;
  let skills;
  try {
    skills = loadSkills();
  } catch {
    return null;
  }
  if (!skills.length) return null;
  const skill = forcedId ? skills.find((s) => s.id === forcedId) : selectSkill(skills, text);
  if (!skill) {
    if (forcedId) console.log('\n' + warn(`  No skill "${forcedId}". Try /skill list.`) + '\n');
    return null;
  }
  let brainCards = [];
  try {
    if (ctx.config.brain?.enabled !== false) brainCards = loadBrainCards();
  } catch {
    brainCards = [];
  }
  const block = compileSkill(skill, brainCards);
  return block ? { block, skill } : null;
}

/** /skill — list, inspect, arm, or toggle executable skills. */
function handleSkill(arg, ctx) {
  const [sub, ...rest] = String(arg || '').split(/\s+/);
  const subArg = rest.join(' ').trim();
  const skills = loadSkills();

  if (!sub || sub === 'list') {
    const state = ctx.config.skills?.enabled === false ? warn(' (auto-skill off)') : '';
    console.log('\n' + info('Skills:') + state);
    if (!skills.length) {
      console.log(
        '  ' + dim('none found — add a .md to ./.aurora/skills or ~/.config/aurora/skills') + '\n',
      );
      return;
    }
    for (const s of skills) console.log(`  ${s.id} — ${s.title}\n      ${dim(s.when_to_use)}`);
    console.log(info('\n  Use: ') + '/skill show <id> · /skill use <id> · /skill on|off\n');
    return;
  }
  if (sub === 'show') {
    const s = skills.find((x) => x.id === subArg);
    if (!s) return void console.log('\n' + warn(`  No skill "${subArg}".`) + '\n');
    console.log('\n' + info(`Skill: ${s.id}`) + ` — ${s.title}`);
    console.log(`  when: ${dim(s.when_to_use)}`);
    if (s.brain?.length) console.log(`  brain: ${s.brain.join(', ')}`);
    if (s.template) console.log(`  template: ${s.template}`);
    if (s.asks?.length) console.log(`  asks: ${s.asks.length} question(s)`);
    console.log('\n' + renderMarkdown(s.body) + '\n');
    return;
  }
  if (sub === 'use') {
    if (!skills.find((x) => x.id === subArg)) {
      return void console.log('\n' + warn(`  No skill "${subArg}". Try /skill list.`) + '\n');
    }
    ctx.pendingSkill = subArg;
    console.log('\n' + info(`  Next message will use skill "${subArg}".`) + '\n');
    return;
  }
  if (sub === 'on' || sub === 'off') {
    (ctx.config.skills ||= {}).enabled = sub === 'on';
    saveConfig(ctx.config);
    console.log('\n' + info(`  Auto-skill ${sub === 'on' ? 'enabled' : 'disabled'}.`) + '\n');
    return;
  }
  console.log('\n' + warn('  Usage: /skill [list|show <id>|use <id>|on|off]') + '\n');
}

/** /brain — show, toggle, or inspect the curated method brain. */
async function handleBrain(arg, ctx) {
  const [sub, ...rest] = arg.split(/\s+/);
  const param = rest.join(' ').trim();
  const cards = loadBrainCards();

  if (!sub || sub === 'list') {
    if (!cards.length) {
      console.log(
        '\n' + warn('No brain cards found.') + ' Expected Markdown cards under brain/.\n',
      );
      return;
    }
    const on = ctx.config.brain?.enabled !== false;
    console.log(
      '\n' + info('Method brain ') + (on ? '' : warn('(disabled) ')) + `· ${cards.length} cards`,
    );
    for (const c of cards) {
      const tags = c.tags?.length ? warn(`  [${c.tags.join(', ')}]`) : '';
      console.log(`  ${c.id.padEnd(20)} ${warn(c.type.padEnd(10))} ${c.title}${tags}`);
    }
    console.log(
      info('\n  All cards are indexed each session; the most relevant are pulled into each turn.') +
        info('\n  Preview a query with /brain why <text>.') +
        '\n',
    );
    return;
  }

  if (sub === 'why') {
    if (!param) {
      console.log('\n' + warn('Usage: ') + '/brain why <text>\n');
      return;
    }
    const picked = selectRelevantCards(cards, param);
    if (!picked.length) {
      console.log('\n' + info('No cards matched. ') + 'The turn would carry the index only.\n');
      return;
    }
    console.log('\n' + info(`Cards Aurora would pull for: `) + `"${param}"`);
    for (const c of picked) console.log(`  ${c.id.padEnd(20)} ${warn(c.type)}  ${c.title}`);
    console.log('');
    return;
  }

  if (sub === 'show') {
    const card = cards.find((c) => c.id === param);
    if (!card) {
      console.log('\n' + warn(`No card with id "${param}".`) + ' Try /brain list.\n');
      return;
    }
    console.log(
      '\n' + info(card.title) + ` ${warn(`(${card.type}, priority ${card.priority})`)}\n`,
    );
    console.log(card.body + '\n');
    return;
  }

  if (sub === 'on' || sub === 'off') {
    ctx.config.brain ||= {};
    ctx.config.brain.enabled = sub === 'on';
    saveConfig(ctx.config);
    await applyBrainAndPersona(ctx.provider, ctx.store, ctx.config);
    console.log(
      '\n' +
        info(`Brain ${sub === 'on' ? 'enabled' : 'disabled'}.`) +
        ' Per-turn retrieval applies immediately; the session index refreshes on /new.\n',
    );
    return;
  }

  console.log('\n' + warn('Usage: ') + '/brain [list | show <id> | why <text> | on | off]\n');
}

/** /persona — view and shape the user's voice profile. */
async function handlePersona(arg, ctx) {
  if (!ctx.hasStore) {
    console.log(
      '\n' + warn('Persona needs a store. ') + 'Enable one with /store sqlite (or json).\n',
    );
    return;
  }
  const [sub, ...rest] = arg.split(/\s+/);
  const param = rest.join(' ').trim();

  if (!sub || sub === 'show') {
    const p = await ctx.store.getPersona(PERSONA_SCOPE);
    const on = ctx.config.persona?.enabled === true;
    if (!p) {
      console.log('\n' + info('No persona set. ') + 'Add one with /persona set <field> <value>.');
      console.log(info('  Fields: ') + PERSONA_FIELDS.join(', ') + '\n');
      return;
    }
    console.log('\n' + info('Your voice profile ') + (on ? '' : warn('(disabled) ')));
    for (const f of PERSONA_FIELDS) {
      if (p[f]) console.log(`  ${f.padEnd(14)} ${String(p[f]).replace(/\n/g, ' ⏎ ')}`);
    }
    console.log(
      info('\n  Edit: ') +
        '/persona set <field> <value> · ' +
        info('toggle: ') +
        '/persona on|off\n',
    );
    return;
  }

  if (sub === 'set') {
    const [field, ...valParts] = param.split(/\s+/);
    const value = valParts.join(' ').trim();
    if (!PERSONA_FIELDS.includes(field) || !value) {
      console.log(
        '\n' +
          warn('Usage: ') +
          '/persona set <field> <value>\n  ' +
          info('Fields: ') +
          PERSONA_FIELDS.join(', ') +
          '\n',
      );
      return;
    }
    await ctx.store.savePersona(PERSONA_SCOPE, { [field]: value });
    ctx.config.persona ||= {};
    ctx.config.persona.enabled = true;
    ctx.config.persona.prompted = true;
    saveConfig(ctx.config);
    await applyBrainAndPersona(ctx.provider, ctx.store, ctx.config);
    console.log('\n' + info(`Updated ${field}.`) + ' Applies to the next /new session.\n');
    return;
  }

  if (sub === 'ingest') {
    if (!param) {
      console.log('\n' + warn('Usage: ') + '/persona ingest <file>\n');
      return;
    }
    let text;
    try {
      text = readFileSync(param, 'utf8');
    } catch (e) {
      console.log('\n' + warn('Could not read ') + param + ': ' + e.message + '\n');
      return;
    }
    const existing = (await ctx.store.getPersona(PERSONA_SCOPE))?.samplePhrases || '';
    const merged = (existing ? existing + '\n' : '') + text.trim();
    await ctx.store.savePersona(PERSONA_SCOPE, { samplePhrases: merged.slice(0, 8000) });
    ctx.config.persona ||= {};
    ctx.config.persona.enabled = true;
    ctx.config.persona.prompted = true;
    saveConfig(ctx.config);
    await applyBrainAndPersona(ctx.provider, ctx.store, ctx.config);
    console.log('\n' + info('Ingested writing samples. ') + 'Aurora will echo your phrasing.\n');
    return;
  }

  if (sub === 'clear') {
    await ctx.store.savePersona(
      PERSONA_SCOPE,
      Object.fromEntries(PERSONA_FIELDS.map((f) => [f, ''])),
    );
    ctx.config.persona ||= {};
    ctx.config.persona.enabled = false;
    saveConfig(ctx.config);
    await applyBrainAndPersona(ctx.provider, ctx.store, ctx.config);
    console.log('\n' + info('Persona cleared.') + '\n');
    return;
  }

  if (sub === 'on' || sub === 'off') {
    ctx.config.persona ||= {};
    ctx.config.persona.enabled = sub === 'on';
    ctx.config.persona.prompted = true;
    saveConfig(ctx.config);
    await applyBrainAndPersona(ctx.provider, ctx.store, ctx.config);
    console.log(
      '\n' +
        info(`Persona ${sub === 'on' ? 'enabled' : 'disabled'}.`) +
        ' Applies to the next /new session.\n',
    );
    return;
  }

  console.log(
    '\n' +
      warn('Usage: ') +
      '/persona [show | set <field> <value> | ingest <file> | clear | on | off]\n',
  );
}

// The "engine" is Aurora's interface model — the backend that fronts the
// conversation and holds its voice. (`/provider` stays as a back-compat alias;
// the config key is still `provider`.) Workers borrowed per-task via @worker /
// skill `engine:` are routed separately, in streamResponse — see src/route.js.
async function handleEngine(arg, ctx) {
  const fromId = ctx.config.provider; // the outgoing engine, for the handoff digest
  const engines = listProviders();
  const impl = engines.filter((p) => p.implemented); // switchable, numbered 1..N

  if (arg === 'list') {
    printEngineList(engines, ctx.config.provider);
    return;
  }

  // Resolve the target engine: a number picks the Nth switchable engine, a name
  // picks by id, and no argument opens a numbered chooser (TTY only).
  let targetId = null;
  if (/^\d+$/.test(arg)) {
    targetId = impl[Number(arg) - 1]?.id;
    if (!targetId) {
      console.log('\n' + error(`No engine #${arg}. Run /engine to see the list.`) + '\n');
      return;
    }
  } else if (arg) {
    targetId = arg;
  } else {
    printEngineList(engines, ctx.config.provider);
    if (!ctx.printer && !process.stdin.isTTY) return; // non-interactive: just listed
    const options = impl.map((p) => `${p.id} — ${p.label}`);
    const [answer] = await askInTerminal(
      ctx.rl,
      [
        {
          header: 'Engine',
          question: 'Set Aurora’s interface engine to:',
          options,
          multiSelect: false,
        },
      ],
      ctx.printer,
    );
    if (answer == null) return; // stdin closed
    const picked = impl.find((p) => `${p.id} — ${p.label}` === answer);
    targetId = picked ? picked.id : String(answer).trim().toLowerCase();
  }

  if (targetId === ctx.config.provider) {
    console.log('\n' + info('Already on: ') + ctx.provider.describe() + '\n');
    return;
  }

  try {
    // Build the new engine, then carry the same Aurora onto it. Only make it
    // current on success — if construction threw, the old engine stays.
    const next = await adoptProvider(getProvider(targetId, ctx.config), ctx);
    ctx.provider = next;
    ctx.config.provider = targetId;
    saveConfig(ctx.config);
    console.log('\n' + info('Interface engine: ') + next.describe());
    // Brief the new engine on the work so far + per-engine continuity, and show
    // the user what carried over. Best-effort: a briefing hiccup never blocks the
    // switch (the engine is already current and seeded above).
    await applyHandoffBriefing(next, ctx, { fromId });
    console.log('');
  } catch (e) {
    console.log('\n' + error(e.message) + '\n');
  }
}

/**
 * Build and inject the cross-engine handoff briefing, record the visit in the
 * engine ledger, and print a digest so the user can see what was handed over.
 *
 * The work summary is generated on demand (one cheap `claude -p` call) from the
 * stored transcript, degrading to a deterministic digest. "First visit" is keyed
 * per engine (provider id) per working directory; the fuller onboarding framing
 * fires the first time an engine works in this directory. Needs a store for
 * cross-session memory — with `store: none` the briefing is in-memory only.
 */
async function applyHandoffBriefing(next, ctx, { fromId } = {}) {
  if (!next.setBriefing) return;
  const toId = next.constructor.id;
  const dir = process.cwd();

  const ledger = ctx.hasStore ? await loadLedger(ctx.store) : normalizeLedger(null);
  const first = isFirstVisit(ledger, toId, dir);
  const lastRecord = dirRecord(ledger, toId, dir);

  // Pull the current conversation's transcript (store-backed) for the summary.
  let turns = [];
  if (ctx.hasStore && ctx.sessionId) {
    try {
      turns = await ctx.store.getConversation(ctx.sessionId);
    } catch {
      turns = [];
    }
  }

  if (turns.length) console.log(dim(`  · briefing ${toId} on the work so far…`));
  // The work was done on the outgoing engine; with previewEngine:'active' summarise
  // with it (a stateless one-shot), else use the free claude CLI + briefing.model.
  let runClaude, model;
  const previewEngine = ctx.config?.notify?.telegram?.previewEngine || 'claude';
  if (previewEngine === 'active' && fromId && fromId !== 'claude') {
    const r = resolveOnceRunner(fromId, { codexModel: ctx.config?.codexModel });
    runClaude = r.runOnce;
    model = r.model || undefined;
  } else {
    model = ctx.config?.briefing?.model || 'sonnet';
  }
  const summary = turns.length ? await summarizeWork(turns, { model, runClaude }) : '';

  next.setBriefing(composeBriefing({ engineId: toId, isFirst: first, lastRecord, summary }));

  // Record the incoming engine's visit (stamps firstSeen once; updates last-here).
  if (ctx.hasStore) {
    const at = new Date().toISOString();
    const title = turns.length ? previewTitle(firstUserText(turns)) : '';
    await saveLedger(
      ctx.store,
      recordVisit(ledger, toId, dir, { sessionId: ctx.sessionId, title, at }),
    );
  }

  for (const line of briefingDigestForUser({
    fromId,
    toId,
    isFirst: first,
    lastRecord,
    summary,
    hasStore: ctx.hasStore,
  })) {
    console.log(dim('  ' + line));
  }
}

/**
 * `/context` — show the current handoff context: which engines have fronted this
 * directory (with when each was added and last active), and a deterministic
 * digest of the live conversation. Deliberately LLM-free; the full work summary
 * is only synthesized when you actually /engine switch.
 */
async function handleContext(ctx) {
  const dir = process.cwd();
  console.log('\n' + info('Handoff context') + dim(`  (${dir})`));
  console.log(info('  Interface engine: ') + ctx.provider.describe());

  if (!ctx.hasStore) {
    console.log(
      dim('  No store enabled — no cross-session engine memory. ') +
        'Turn it on with /store sqlite (or json).',
    );
  }

  const ledger = ctx.hasStore ? await loadLedger(ctx.store) : normalizeLedger(null);
  const entries = Object.entries(ledger.engines || {});
  if (entries.length) {
    console.log(info('\n  Engines seen here:'));
    for (const [id, rec] of entries) {
      const added = rec.firstSeen ? formatWhen(rec.firstSeen) : '—';
      const here = rec.dirs?.[dir];
      if (here) {
        const title = here.lastTitle ? ` · "${here.lastTitle}"` : '';
        console.log(
          `    ${id} — added ${added}, last active here ${formatWhen(here.lastActiveAt)}${title}`,
        );
      } else {
        console.log(`    ${id} — added ${added}, not used in this directory`);
      }
    }
  }

  let turns = [];
  if (ctx.hasStore && ctx.sessionId) {
    try {
      turns = await ctx.store.getConversation(ctx.sessionId);
    } catch {
      turns = [];
    }
  }
  const digest = deterministicDigest(turns);
  if (digest) {
    console.log(info('\n  This conversation:'));
    console.log(
      digest
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n'),
    );
  }
  console.log(
    dim('\n  A full work summary is generated by an LLM when you /engine switch.') + '\n',
  );
}

/** Print the engines as a numbered list (only switchable ones get a number). */
function printEngineList(engines, currentId) {
  console.log('\n' + info('Engines') + dim('  (the interface model Aurora speaks as)'));
  let n = 0;
  for (const p of engines) {
    const mark = p.id === currentId ? '●' : '○';
    const num = p.implemented ? warn(`${++n}. `) : '   ';
    const status = p.implemented ? '' : warn(' (planned)');
    const current = p.id === currentId ? warn('  ◀ current') : '';
    console.log(`  ${mark} ${num}${p.id} — ${p.label}${status}${current}`);
  }
  console.log(info('\n  Set: ') + '/engine <number|id> — or just /engine to choose');
  console.log(dim('  Per-task: prefix a message with @<engine>, e.g. @codex …') + '\n');
}

/**
 * Hand the running conversation to a freshly built provider: re-apply the method
 * brain + voice and seed the transcript, so swapping the backend or the model
 * keeps the same Aurora instead of starting blank. Returns the provider.
 */
async function adoptProvider(next, ctx) {
  await applyBrainAndPersona(next, ctx.store, ctx.config);
  if (ctx.hasStore && ctx.sessionId) await seedFromStore(next, ctx.store, ctx.sessionId);
  return next;
}

async function handleModel(arg, ctx) {
  // `/model` targets the ACTIVE provider's model field — names aren't portable
  // across backends (a Claude model id means nothing to Codex, and vice versa).
  const key = ctx.provider.modelKey?.() ?? 'model';
  if (!arg) {
    console.log('\n' + info('Current model: ') + (ctx.config[key] || '(provider default)'));
    console.log(info('Set with: ') + '/model <name>   ·   reset with /model default\n');
    return;
  }
  ctx.config[key] = arg === 'default' ? null : arg;
  // Rebuild the provider so the new model takes effect, carrying brain + history.
  ctx.provider = await adoptProvider(getProvider(ctx.config.provider, ctx.config), ctx);
  saveConfig(ctx.config);
  console.log('\n' + info('Model set to: ') + (ctx.config[key] || '(provider default)') + '\n');
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

  const stores = listStores();

  if (!arg || arg === 'list') {
    console.log('\n' + info('Stores:'));
    stores.forEach((s, i) => {
      const current = s.id === ctx.config.store;
      console.log(
        `  ${current ? '●' : '○'} ${i + 1}. ${s.id} — ${s.label}${current ? warn('  ◀ current') : ''}`,
      );
    });
    console.log(
      info('\n  Scope: ') +
        (ctx.config.storeScope || 'global') +
        '  (' +
        resolveDataDir({ scope: ctx.config.storeScope }) +
        ')',
    );
    console.log(
      info('  Switch with: ') +
        'a number (e.g. 2), /store <id>, or /store scope global|project   (persistence is opt-in)\n',
    );
    // Arm a one-shot picker: a bare number typed as the next input selects the
    // matching store instead of being sent to the model. Cleared after one input.
    ctx.storePick = stores.map((s) => s.id);
    return;
  }

  // Accept either a 1-based number from the list or a store id.
  let arg_id = arg;
  if (/^\d+$/.test(arg)) {
    const picked = stores[parseInt(arg, 10) - 1];
    if (!picked) {
      console.log('\n' + warn(`No store #${arg}. Run /store to see the list.`) + '\n');
      return;
    }
    arg_id = picked.id;
  }
  const ids = stores.map((s) => s.id);
  if (!ids.includes(arg_id)) {
    console.log('\n' + warn(`Unknown store "${arg}". Options: ${ids.join(', ')}.`) + '\n');
    return;
  }
  const next = getStore(arg_id, { ...ctx.config, store: arg_id });
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
  ctx.config.store = arg_id;
  saveConfig(ctx.config);
  console.log('\n' + info('Store set to: ') + arg_id + '\n');
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
  // Hand the transcript to the provider so a stale native session can fall back
  // to a fresh, seeded one instead of resuming blank.
  ctx.provider.seed?.(turns);
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

/**
 * Decide which session a launch attaches to, honouring the launch flags:
 *   --new / --fresh   start a clean conversation (recorded as the new active one)
 *   --resume [id]     reattach to a saved conversation (no id = most recent)
 *   (default)         silently pick up the shared active session
 *
 * Returns `{ sessionId, source }` where source is 'new' | 'resumed' |
 * 'continued', used to label the startup screen. Best-effort: an unresolvable
 * --resume warns and falls back to a fresh session rather than refusing to start.
 */
export async function resolveLaunch({ provider, config, store, hasStore, argv = [] }) {
  const wantNew = argv.includes('--new') || argv.includes('--fresh');
  const resumeIdx = argv.indexOf('--resume');
  const wantResume = resumeIdx !== -1;
  const raw = wantResume ? argv[resumeIdx + 1] : null;
  const resumeId = raw && !raw.startsWith('-') ? raw : null;

  const fresh = (label = 'new') => {
    const id = provider.sessionId ?? null;
    if (hasStore) writeActiveSession(config, id);
    return { sessionId: id, source: label };
  };

  if (wantNew) return fresh();

  if (wantResume) {
    if (!hasStore) {
      console.log(warn('  --resume needs persistence on (e.g. /store sqlite); starting fresh.'));
      return fresh();
    }
    const target = await pickConversation(store, resumeId);
    if (!target) {
      const which = resumeId ? ` matching "${resumeId}"` : '';
      console.log(warn(`  No single saved conversation${which} to resume — starting fresh.`));
      return fresh();
    }
    const id = String(target.sessionId);
    provider.resume?.(id);
    await seedFromStore(provider, store, id);
    writeActiveSession(config, id);
    return { sessionId: id, source: 'resumed' };
  }

  // Default: silently continue the shared active session if there is one.
  const had = hasStore && readActiveSession(config);
  const id = attachSession(provider, config, hasStore);
  if (had) await seedFromStore(provider, store, id);
  return { sessionId: id, source: had ? 'continued' : 'new' };
}

/** Resolve a saved conversation by id-prefix (or the most recent if none). */
async function pickConversation(store, idPrefix) {
  let convs = [];
  try {
    convs = await store.listConversations();
  } catch {
    return null;
  }
  if (!convs.length) return null;
  if (!idPrefix) {
    return convs.reduce((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)) > 0 ? b : a,
    );
  }
  const matches = convs.filter((c) => String(c.sessionId).startsWith(idPrefix));
  return matches.length === 1 ? matches[0] : null;
}

/** Adopt a stored conversation as the provider's fallback context (best-effort). */
async function seedFromStore(provider, store, sessionId) {
  if (!provider.seed || !sessionId) return;
  try {
    const turns = await store.getConversation(sessionId);
    if (turns.length) provider.seed(turns);
  } catch {
    // Without a seed we simply can't fall back if a native resume is stale.
  }
}

/** Tiny suffix for the startup "Store:" line showing how we attached. */
function sessionSourceLabel(source) {
  if (source === 'resumed') return ' · resumed';
  if (source === 'continued') return ' · continued';
  if (source === 'new') return ' · new';
  return '';
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
    if (t.role === 'user') {
      console.log('\n' + promptLabel() + t.text);
    } else {
      // complete === false marks a turn that was interrupted mid-answer.
      const tail = t.complete === false ? ' ' + warn('⏸ (interrupted)') : '';
      console.log(auroraLabel() + tail + '\n' + renderMarkdown(t.text));
    }
  }
}

/**
 * Mirror a Telegram-bridge exchange into the terminal so a chat that arrived over
 * Telegram is visible in the REPL too (one shared conversation). `kind: 'in'` is
 * the incoming message; `kind: 'out'` is Aurora's answer/question. Routed through
 * the pinned-prompt printer when interactive so it lands above `you ❯` without
 * disturbing what the user is typing; falls back to plain logging off a TTY.
 */
function renderBridgeMirror(event, printer) {
  const emit = (s = '') => (printer ? printer.line(s) : console.log(s));
  if (event.kind === 'in') {
    emit('');
    emit(info('📱 Telegram › ') + event.text);
  } else if (event.kind === 'out') {
    emit(auroraLabel());
    for (const line of renderMarkdown(String(event.text || '')).split('\n')) emit(line);
    emit('');
  }
}

async function handleNotify(arg, ctx) {
  const tg = ((ctx.config.notify ||= {}).telegram ||= {});
  // Split the argument into a subcommand and its remainder (e.g. "forget 123").
  const [sub, ...subRest] = String(arg || '').split(/\s+/);
  const subArg = subRest.join(' ').trim();
  if (arg === 'test') {
    if (!telegramEnabled(ctx.config)) {
      console.log(
        '\n' +
          warn(
            'Telegram not configured. Set TELEGRAM_BOT_TOKEN, register a chat with ' +
              '/notify whoami (or send the bot /start), then enable it with /notify on.',
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
    // Discover chats that have messaged the bot and register them, so terminal
    // notifications reach them without anyone exporting a chat id by hand.
    console.log('\n' + info('Looking up chats via getUpdates…'));
    const res = await fetchTelegramChats();
    if (!res.ok) {
      console.log(error('  ✖ ' + res.error) + '\n');
      return;
    }
    if (!res.chats.length) {
      console.log(
        warn('  No chats found. Send your bot /start first, then run /notify whoami again.') + '\n',
      );
      return;
    }
    let added = 0;
    console.log(info('  Chats that have messaged your bot:'));
    for (const c of res.chats) {
      const result = registerChat({ id: c.id, name: c.name, type: c.type });
      if (result.added) added += 1;
      const tag = result.added ? info(' [registered]') : warn(' [already known]');
      console.log(`    ${c.id}  —  ${c.name || '(no name)'} ${warn('[' + c.type + ']')}${tag}`);
    }
    console.log(
      info(`\n  ${added} newly registered. `) +
        'Notifications now reach all registered chats. Manage with /notify list | forget <id>.\n',
    );
    return;
  }
  if (arg === 'list') {
    const chats = loadChats();
    if (!chats.length) {
      console.log(
        '\n' + warn('  No chats registered. Send the bot /start, or run /notify whoami.') + '\n',
      );
      return;
    }
    console.log('\n' + info('  Registered chats:'));
    for (const c of chats) {
      console.log(`    ${c.id}  —  ${c.name || '(no name)'} ${warn('[' + (c.type || '?') + ']')}`);
    }
    console.log('');
    return;
  }
  if (sub === 'forget') {
    const id = subArg;
    if (!id) {
      console.log('\n' + warn('  Usage: /notify forget <chat-id>  (see /notify list)') + '\n');
      return;
    }
    const removed = removeChat(id);
    console.log(
      '\n' + (removed ? info('  Forgot chat ' + id) : warn('  No registered chat ' + id)) + '\n',
    );
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
  const registered = loadChats().length;
  console.log(
    '\n' +
      info('Telegram notify: ') +
      (tg.enabled ? 'enabled' : 'disabled') +
      (telegramEnabled(ctx.config) ? '' : warn('  (token or registered chat missing)')) +
      `\n  Registered chats: ${registered}` +
      (process.env.TELEGRAM_CHAT_ID ? warn('  (+ TELEGRAM_CHAT_ID override)') : '') +
      '\n  Commands: /notify on | off | test | whoami | list | forget <id>' +
      '\n  Token comes from $TELEGRAM_BOT_TOKEN. Chats register via the bot’s /start' +
      ' (or /notify whoami); $TELEGRAM_CHAT_ID is an optional override.\n',
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
        ['/engine [n|id]', 'set the interface engine (pick a number/name); @worker per task'],
        ['/context', 'show the cross-engine handoff context for this directory'],
        ['/model [name]', 'show or set the model (/model default to reset)'],
        [
          '/store [id]',
          'show or switch persistence (none/json/sqlite); /store scope global|project',
        ],
        ['/history', 'list saved conversations (needs persistence on)'],
        ['/resume [id]', 'reattach to a saved conversation (no id = most recent)'],
        ['/export [id]', 'save a conversation to a Markdown file (no id = current)'],
        ['/notify [on|off|test|whoami|list|forget]', 'Telegram alerts; whoami registers your chat'],
        ['/brain [list|show|why|on|off]', 'the curated method brain Aurora writes/researches by'],
        ['/skill [list|show|use|on|off]', 'executable skills Aurora plans and runs a task by'],
        ['/persona [show|set|ingest]', 'shape Aurora to write in your voice'],
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
      '  aurora --resume [id]   resume a saved conversation on launch (no id = most recent)',
      '  aurora --new           start a fresh conversation, ignoring the active session',
      '  aurora --solo          ephemeral chat: no listeners and no saved history.',
      '                         Use this to run a second aurora while one is already',
      '                         running (only one primary instance is allowed at a time).',
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
