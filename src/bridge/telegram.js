import { sendTelegram } from '../notify/telegram.js';
import { listChatIds, isRegistered, registerChat } from '../notify/chats.js';
import { attachSession, rotateSession } from '../store/session.js';
import { saveUserTurn, saveAssistantTurn } from '../store/persist.js';
import {
  parseAskBlock,
  parseImplicitAsk,
  parseDoneBlock,
  stripProtocolBlocks,
  formatAnswers,
  interpretReply,
  formatQuestionsForTelegram,
  buildRecap,
} from '../protocol.js';

/**
 * Two-way Telegram bridge: long-poll getUpdates, feed each registered chat's
 * messages through the provider, and reply on Telegram. Run via `aurora --serve`.
 *
 * AUTHORIZATION: a chat must register itself by sending `/start` before it can
 * drive the model — a public bot can be messaged by anyone, so unregistered
 * chats are ignored until they opt in. Registrations persist locally
 * (notify/chats.js); TELEGRAM_CHAT_ID, if set, is always authorized too (an
 * override / back-compat). The bridge needs only the bot token to start; it has
 * no one to talk to until a chat registers, which is fine.
 *
 * The bot TOKEN is read from the environment only (never disk); chat ids are not
 * secrets and live in the local registry.
 */

const POLL_TIMEOUT_S = 30; // Telegram long-poll hold time
const FETCH_TIMEOUT_MS = (POLL_TIMEOUT_S + 5) * 1000;
const TELEGRAM_MAX_LEN = 4096;
const ERROR_BACKOFF_MS = 3000;

export async function runTelegramBridge({ provider, config, store, logLine, mirror }) {
  const token = process.env.TELEGRAM_BOT_TOKEN || null;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  const log = logLine || ((m) => console.log(m));

  // Share the same conversation as the CLI: attach to the active session so a
  // chat continues across Telegram and the terminal (only when a store is on).
  const hasStore = Boolean(store) && store.constructor.id !== 'none';
  const state = { sessionId: attachSession(provider, config, hasStore), pendingAsk: null };
  if (hasStore) log(`Persisting to store; session ${shortId(state.sessionId)}`);

  // Skip any backlog so a restart doesn't replay old messages.
  let offset = await drainBacklog(token);
  const known = listChatIds().length + (process.env.TELEGRAM_CHAT_ID ? 1 : 0);
  log(
    `Telegram bridge live. ${known} chat(s) registered. New chats register with /start. Ctrl-C to stop.`,
  );
  // Greet every already-registered chat (broadcast); a no-op if none yet.
  await sendTelegram(
    '🟢 Aurora is listening. Send me anything; /new starts a fresh conversation.',
    config,
  );

  // Outbound effects are injected so handleUpdate can be tested without network.
  const ctx = { provider, config, store, hasStore, state, token, log, mirror };

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
  const { provider, config, store, hasStore, state } = ctx;
  const log = ctx.log || (() => {});

  const msg = update.message;
  if (!msg || typeof msg.text !== 'string') return; // ignore non-text updates
  const chatId = String(msg.chat?.id ?? '');
  if (!chatId) return;

  // Outbound effects default to the real Telegram calls (targeting the chat that
  // wrote, so multi-user replies reach the right person); tests inject stubs.
  const notify = ctx.notify || ((text, opts) => sendTelegram(text, config, { ...opts, chatId }));
  const typing = ctx.typing || (() => sendChatAction(ctx.token, chatId, 'typing'));
  // Optional: mirror the exchange into the terminal REPL so a chat that arrived
  // over Telegram is visible there too (shared session = one conversation). No-op
  // in headless --serve mode, where there is no terminal.
  const mirror = ctx.mirror || (() => {});

  const text = msg.text.trim();
  if (!text) return;

  // `/start` is the registration handshake: any chat may send it, and doing so
  // opts that chat in. Everything else requires an already-authorized chat.
  if (text === '/start') {
    const { added } = registerChat({
      id: msg.chat.id,
      name: chatName(msg.chat),
      type: msg.chat.type,
    });
    log(`  ${added ? 'registered' : 'known'} chat ${chatId}`);
    await notify(
      (added ? "👋 Aurora here — you're registered. " : '👋 Aurora here. ') +
        'Send a question and I will research it. /new clears the conversation.',
    );
    return;
  }

  // The authorization gate: only registered chats (or the env override, via
  // ctx.authorizedChatId in tests) get through. Strangers are ignored silently —
  // no reply, so a public bot doesn't chatter at whoever probes it.
  if (!isAuthorized(chatId, ctx)) {
    log(`  ignored message from unregistered chat ${chatId} (send /start to register)`);
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
  mirror({ kind: 'in', text }); // echo the incoming Telegram message to the terminal
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
    mirror({ kind: 'out', text: fullAnswer });
    log('  → ' + indent(fullAnswer));
    return;
  }

  // Split the answer into what the user sees (prose, blocks stripped) and the
  // machine signals (a pending question, or a finish recap). The model is
  // supposed to wrap a question in an `aurora:ask` block; when it forgets and
  // just asks in prose, parseImplicitAsk recovers the trailing question so the
  // reply is mapped back as an answer instead of starting a new turn.
  const explicitAsk = parseAskBlock(fullAnswer);
  const ask = explicitAsk || parseImplicitAsk(fullAnswer);
  const done = parseDoneBlock(fullAnswer);
  const cleanAnswer = stripProtocolBlocks(fullAnswer);
  const hasProse = Boolean(cleanAnswer);

  if (hasProse) {
    await replyChunked(cleanAnswer, notify);
    mirror({ kind: 'out', text: cleanAnswer });
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
    // An explicit block carries options worth rendering as a numbered list. An
    // implicit (prose) question is already in the answer we just sent, so don't
    // echo it back — only the pendingAsk wiring matters there.
    if (explicitAsk) {
      const rendered = formatQuestionsForTelegram(ask.questions);
      await notify(rendered);
      // Mirror the numbered question too (the prose framing, if any, was already
      // mirrored above) so the terminal shows the same options Telegram does.
      mirror({ kind: 'out', text: rendered });
    }
    log(`  ? awaiting answer to ${ask.questions.length} question(s)`);
    return;
  }

  // Finished turn: the answer already went to Telegram, so only add a recap when
  // it carries action items the user shouldn't miss.
  if (done && done.actions.length) {
    // The recap is HTML (escaped in buildRecap); send it directly so parse_mode is
    // set, rather than through `notify`, which sends plain text. Target the same
    // chat that drove this turn.
    await sendTelegram(buildRecap(cleanAnswer, done), config, { parseMode: 'HTML', chatId });
  }
}

/**
 * Is this chat allowed to drive the model? Tests/back-compat pass an explicit
 * `ctx.authorizedChatId` (exact match, registry not consulted). Otherwise a chat
 * is authorized if it's in the local registry or matches the TELEGRAM_CHAT_ID
 * env override.
 */
function isAuthorized(chatId, ctx) {
  if (ctx.authorizedChatId != null) return chatId === String(ctx.authorizedChatId);
  if (process.env.TELEGRAM_CHAT_ID && chatId === String(process.env.TELEGRAM_CHAT_ID)) return true;
  return isRegistered(chatId);
}

/** Best display name for a chat from a Telegram message. */
function chatName(chat = {}) {
  return (
    chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || ''
  );
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
