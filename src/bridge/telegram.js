import { sendTelegram } from '../notify/telegram.js';

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

export async function runTelegramBridge({ provider, config, logLine }) {
  const token = process.env.TELEGRAM_BOT_TOKEN || null;
  const authorizedChatId = process.env.TELEGRAM_CHAT_ID || null;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  if (!authorizedChatId) {
    throw new Error(
      'TELEGRAM_CHAT_ID is not set — refusing to listen without an authorized chat. Run with the REPL and /notify whoami to find it.',
    );
  }
  const log = logLine || ((m) => console.log(m));

  // Skip any backlog so a restart doesn't replay old messages.
  let offset = await drainBacklog(token);
  log(
    `Telegram bridge live. Listening for messages from chat ${authorizedChatId}. Ctrl-C to stop.`,
  );
  await sendTelegram(
    '🟢 Aurora is listening. Send me anything; /new starts a fresh conversation.',
    config,
  );

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
        await handleUpdate(u, { provider, config, authorizedChatId, token, log });
      } catch (e) {
        log('  error handling update: ' + (e?.message || String(e)));
      }
    }
  }
}

export async function handleUpdate(update, { provider, config, authorizedChatId, token, log }) {
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
    await sendTelegram(
      '👋 Aurora here. Send a question and I will research it. /new clears the conversation.',
      config,
    );
    return;
  }
  if (text === '/new' || text === '/reset') {
    provider.reset();
    await sendTelegram('🔄 Started a fresh conversation.', config);
    return;
  }

  log(`  ← "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
  await sendChatAction(token, authorizedChatId, 'typing');

  let answer = '';
  try {
    for await (const ev of provider.send(text)) {
      if (ev.type === 'delta') answer += ev.text;
      else if (ev.type === 'done' && !answer && ev.text) answer = ev.text;
    }
  } catch (e) {
    answer = '⚠️ ' + (e?.message || 'the model returned an error');
  }

  await replyChunked(answer || '(no response)', config);
  log('  → replied');
}

/** Telegram caps messages at 4096 chars; split long answers across messages. */
async function replyChunked(text, config) {
  for (let i = 0; i < text.length; i += TELEGRAM_MAX_LEN) {
    await sendTelegram(text.slice(i, i + TELEGRAM_MAX_LEN), config);
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
