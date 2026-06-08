/**
 * Telegram notifier — optionally ping the user when a turn finishes.
 *
 * SECURITY NOTES (this repo is open source):
 *   - The bot token is the only secret; it comes from the environment ONLY
 *     (TELEGRAM_BOT_TOKEN), never disk. Never commit a token — .gitignore covers
 *     .env, and /config masks secrets.
 *   - Chat ids are NOT secrets (just routing numbers, useless without the token)
 *     and are learned from `/start` and kept in a local registry (notify/chats.js).
 *     TELEGRAM_CHAT_ID is an optional env override, no longer required.
 *   - The token is never logged; failures report a generic message.
 *   - Messages are plain text by default (no parse_mode), so user/research content
 *     can't be interpreted as Telegram markup. The finish recap opts into HTML
 *     parse mode, but every dynamic part is HTML-escaped first (see buildRecap),
 *     so content still can't inject markup.
 *   - The request uses HTTPS and a hard timeout so a hung network call can't
 *     wedge the CLI.
 *
 * Setup: message @BotFather → /newbot for a token; then send your bot `/start`
 * (or run `/notify whoami` from the REPL) to register your chat — no chat id to
 * copy by hand.
 */

import { listChatIds } from './chats.js';

const TELEGRAM_MAX_LEN = 4096;
const TIMEOUT_MS = 10_000;

/**
 * Token-safe failure reason for a failed fetch. The 10s AbortController fires as
 * an AbortError → "request timed out"; anything else is a connection-level
 * failure. For those we surface the symbolic code (ENOTFOUND, ECONNRESET,
 * UND_ERR_CONNECT_TIMEOUT, …) so an otherwise-opaque "network error" becomes
 * actionable.
 *
 * SECURITY: we append ONLY `e.code`/`e.cause.code` — short symbolic codes that
 * can't contain the token. We never include `e.message` or `e.cause.message`,
 * which can echo the request URL (and the token lives in that URL's path).
 */
export function failureReason(e) {
  if (e?.name === 'AbortError') return 'request timed out';
  const code = e?.code || e?.cause?.code;
  return code ? `network error (${code})` : 'network error';
}

/** The bot token from the ENVIRONMENT ONLY (never disk). Null if unset. */
export function resolveBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/**
 * Every chat we should reach, deduped: the optional TELEGRAM_CHAT_ID override
 * plus everything in the local registry (notify/chats.js). Strings, since that's
 * the form Telegram comparisons use.
 */
export function telegramTargets() {
  const ids = new Set();
  if (process.env.TELEGRAM_CHAT_ID) ids.add(String(process.env.TELEGRAM_CHAT_ID));
  for (const id of listChatIds()) ids.add(String(id));
  return [...ids];
}

/** Telegram can be reached: a token is set AND at least one chat is known. */
export function telegramConfigured() {
  return Boolean(resolveBotToken()) && telegramTargets().length > 0;
}

/**
 * Discover chat id(s) via getUpdates (method 2 in the README). Needs only the
 * bot token; the user must have messaged the bot first. Returns deduped chats:
 * { ok, chats: [{ id, name, type }] } or { ok:false, error }. Never throws.
 */
export async function fetchTelegramChats() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || null;
  if (!botToken) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `telegram API returned ${res.status}` };
    const data = await res.json();
    if (!data.ok) return { ok: false, error: 'telegram rejected the token' };

    const seen = new Map();
    for (const update of data.result || []) {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      if (!chat) continue;
      const name =
        chat.title ||
        [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
        chat.username ||
        '';
      seen.set(chat.id, { id: chat.id, name, type: chat.type });
    }
    return { ok: true, chats: [...seen.values()] };
  } catch (e) {
    return { ok: false, error: failureReason(e) };
  } finally {
    clearTimeout(timer);
  }
}

export function telegramEnabled(config = {}) {
  return Boolean(config.notify?.telegram?.enabled) && telegramConfigured();
}

/**
 * Send a Telegram message. Best-effort: returns { ok, error? } and never throws,
 * so notification problems can't break the chat loop.
 *
 * Targeting: pass `{ chatId }` to reach exactly one chat (the bridge uses this to
 * reply to whoever wrote). With no `chatId` the message is BROADCAST to every
 * registered chat (`telegramTargets`) — that's the notify-on-done path. The
 * result is { ok:true, sent } if at least one delivery succeeded.
 *
 * By default the message is sent as plain text (no parse_mode), so arbitrary
 * user/research content can't be interpreted as Telegram markup. Pass
 * `{ parseMode: 'HTML' }` ONLY for text whose dynamic parts are already escaped
 * (see `escapeHtml` / `buildRecap`); otherwise stray `<`/`>`/`&` break rendering.
 */
export async function sendTelegram(text, _config = {}, { parseMode, chatId } = {}) {
  const botToken = resolveBotToken();
  if (!botToken) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };

  const targets = chatId ? [String(chatId)] : telegramTargets();
  if (!targets.length) {
    return { ok: false, error: 'no Telegram chats registered (send the bot /start)' };
  }

  const body = String(text ?? '').slice(0, TELEGRAM_MAX_LEN);
  if (!body) return { ok: false, error: 'empty message' };

  let sent = 0;
  let lastError = null;
  for (const target of targets) {
    const res = await postMessage(botToken, target, body, parseMode);
    if (res.ok) sent += 1;
    else lastError = res.error;
  }
  return sent ? { ok: true, sent } : { ok: false, error: lastError || 'no chats reachable' };
}

/** POST one sendMessage with the shared timeout. Never throws. */
async function postMessage(botToken, chatId, body, parseMode) {
  const payload = { chat_id: chatId, text: body, disable_web_page_preview: true };
  if (parseMode) payload.parse_mode = parseMode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Don't surface the response body — it can echo the token in some errors.
      return { ok: false, error: `telegram API returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: failureReason(e) };
  } finally {
    clearTimeout(timer);
  }
}
