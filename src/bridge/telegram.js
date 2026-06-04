import { sendTelegram } from '../notify/telegram.js';
import { attachSession, rotateSession } from '../store/session.js';
import { saveUserTurn, saveAssistantTurn } from '../store/persist.js';
import {
  parseAskBlock,
  parseDoneBlock,
  stripProtocolBlocks,
  formatAnswers,
  interpretReply,
  formatQuestionsForTelegram,
  buildRecap,
} from '../protocol.js';

/**
 * Two-way Telegram bridge: long-poll getUpdates, feed each authorized message
 * through the provider, and reply on Telegram. Run via `aurora --telegram`.
 *
 * SECURITY: only messages from TELEGRAM_CHAT_ID are processed — a public bot
 * can be messaged by anyone, so everything else is ignored. The bridge refuses
 * to start without that chat id, since it has no one to trust.
 *
 * Credentials are read from the environment only (never disk), consistent with
 * the rest of the notifier.
 */

const POLL_TIMEOUT_S = 30; // Telegram long-poll hold time
const FETCH_TIMEOUT_MS = (POLL_TIMEOUT_S + 5) * 1000;
const TELEGRAM_MAX_LEN = 4096;
const ERROR_BACKOFF_MS = 3000;

export async function runTelegramBridge({ provider, config, store, logLine }) {
  const token = process.env.TELEGRAM_BOT_TOKEN || null;
  const authorizedChatId = process.env.TELEGRAM_CHAT_ID || null;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  if (!authorizedChatId) {
    throw new Error(
      'TELEGRAM_CHAT_ID is not set — refusing to listen without an authorized chat. Run with the REPL and /notify whoami to find it.',
    );
  }
  const log = logLine || ((m) => console.log(m));

  // Share the same conversation as the CLI: attach to the active session so a
  // chat continues across Telegram and the terminal (only when a store is on).
  const hasStore = Boolean(store) && store.constructor.id !== 'none';
  const state = { sessionId: attachSession(provider, config, hasStore) };
  if (hasStore) log(`Persisting to store; session ${shortId(state.sessionId)}`);

  // Skip any backlog so a restart doesn't replay old messages.
  let offset = await drainBacklog(token);
  log(
    `Telegram bridge live. Listening for messages from chat ${authorizedChatId}. Ctrl-C to stop.`,
  );
  await sendTelegram(
    '🟢 Aurora is listening. Send me anything; /new starts a fresh conversation.',
    config,
  );

  // Outbound effects are injected so handleUpdate can be tested without network.
  const ctx = {
    provider,
    config,
    store,
    hasStore,
    state,
    authorizedChatId,
    log,
    notify: (text) => sendTelegram(text, config),
    typing: () => sendChatAction(token, authorizedChatId, 'typing'),
  };

  // Main loop: never let a single failure kill the bridge.
  while (true) {
    let updates;
    try {
      updates = await pollUpdates(token, offset);
    } catch {
      await sleep(ERROR_BACKOFF_MS);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      try {
        await handleUpdate(u, ctx);
      } catch (e) {
        log('  error handling update: ' + (e?.message || String(e)));
      }
    }
  }
}

export async function handleUpdate(update, ctx) {
  const { provider, config, store, hasStore, state, authorizedChatId } = ctx;
  const log = ctx.log || (() => {});
  // Outbound effects default to the real Telegram calls; tests inject stubs.
  const notify = ctx.notify || ((text) => sendTelegram(text, config));
  const typing = ctx.typing || (() => sendChatAction(ctx.token, authorizedChatId, 'typing'));

  const msg = update.message;
  if (!msg || typeof msg.text !== 'string') return; // ignore non-text updates

  // The security gate: only the owner's chat is allowed through.
  if (String(msg.chat?.id) !== String(authorizedChatId)) {
    log(`  ignored message from unauthorized chat ${msg.chat?.id}`);
    return;
  }

  const text = msg.text.trim();
  if (!text) return;

  if (text === '/start') {
    await notify(
      '👋 Aurora here. Send a question and I will research it. /new clears the conversation.',
    );
    return;
  }
  if (text === '/new' || text === '/reset') {
    // Rotate the shared session so the terminal starts fresh too. Drop any
    // question we were waiting on — it belongs to the old conversation.
    state.sessionId = rotateSession(provider, config, hasStore);
    state.pendingAsk = null;
    await notify('🔄 Started a fresh conversation.');
    return;
  }

  // If we asked the user something last turn, this message is the answer: map it
  // onto the pending questions and feed it back to the model as a normal turn.
  let outbound = text;
  if (state.pendingAsk) {
    const answers = interpretReply(text, state.pendingAsk.questions);
    outbound = formatAnswers(state.pendingAsk.questions, answers);
    state.pendingAsk = null;
    log(`  ↳ answer "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
  } else {
    log(`  ← "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
  }
  await typing();

  // Persist the incoming message up front (before the model is called) so it
  // survives a crash mid-answer and shows in the CLI's /history and /resume.
  if (hasStore) {
    state.sessionId = state.sessionId || provider.sessionId || null;
    await saveUserTurn(store, state.sessionId, outbound);
  }

  let fullAnswer = '';
  let meta = null;
  let errored = false;
  try {
    for await (const ev of provider.send(outbound)) {
      if (ev.type === 'delta') fullAnswer += ev.text;
      else if (ev.type === 'done') {
        meta = ev;
        if (!fullAnswer && ev.text) fullAnswer = ev.text;
      }
    }
  } catch (e) {
    errored = true;
    fullAnswer = '⚠️ ' + (e?.message || 'the model returned an error');
  }

  // On error, surface the warning and stop — don't parse protocol blocks or
  // persist a non-answer (the user turn is already saved above).
  if (errored) {
    await replyChunked(fullAnswer, notify);
    log('  → ' + indent(fullAnswer));
    return;
  }

  // Split the answer into what the user sees (prose, blocks stripped) and the
  // machine signals (a pending question, or a finish recap).
  const ask = parseAskBlock(fullAnswer);
  const done = parseDoneBlock(fullAnswer);
  const cleanAnswer = stripProtocolBlocks(fullAnswer);
  const hasProse = Boolean(cleanAnswer);

  if (hasProse) {
    await replyChunked(cleanAnswer, notify);
    log('  → ' + indent(cleanAnswer));
  }

  // Record the assistant reply under the shared session. When the turn is purely
  // a question with no prose, store the rendered question so /resume stays legible.
  if (hasStore) {
    state.sessionId = state.sessionId || meta?.sessionId || null;
    const stored = hasProse ? cleanAnswer : ask ? formatQuestionsForTelegram(ask.questions) : '';
    if (stored) await saveAssistantTurn(store, state.sessionId, stored, meta, { complete: true });
  }

  if (ask) {
    // Wait for the user's answer; the next message will be fed back to the model.
    state.pendingAsk = { questions: ask.questions };
    await notify(formatQuestionsForTelegram(ask.questions));
    log(`  ? awaiting answer to ${ask.questions.length} question(s)`);
    return;
  }

  // Finished turn: the answer already went to Telegram, so only add a recap when
  // it carries action items the user shouldn't miss.
  if (done && done.actions.length) {
    await notify(buildRecap(cleanAnswer, done));
  }
}

/** Short, display-friendly form of a session id. */
function shortId(id) {
  return id ? String(id).slice(0, 8) : 'n/a';
}

/** Indent continuation lines so a multi-line answer aligns under the → marker. */
function indent(text) {
  return String(text).replace(/\n/g, '\n    ');
}

/** Telegram caps messages at 4096 chars; split long answers across messages. */
async function replyChunked(text, notify) {
  for (let i = 0; i < text.length; i += TELEGRAM_MAX_LEN) {
    await notify(text.slice(i, i + TELEGRAM_MAX_LEN));
  }
}

/** One long-poll for new updates. Returns the (possibly empty) updates array. */
async function pollUpdates(token, offset) {
  const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=${POLL_TIMEOUT_S}&offset=${offset}`;
  const data = await getJson(url, FETCH_TIMEOUT_MS);
  return data?.ok ? data.result || [] : [];
}

/** Read pending updates once at startup and return the next offset past them. */
async function drainBacklog(token) {
  try {
    const data = await getJson(`https://api.telegram.org/bot${token}/getUpdates`, FETCH_TIMEOUT_MS);
    const results = data?.ok ? data.result || [] : [];
    return results.length ? results[results.length - 1].update_id + 1 : 0;
  } catch {
    return 0;
  }
}

async function sendChatAction(token, chatId, action) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // cosmetic only — ignore failures
  }
}

async function getJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`telegram API returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
