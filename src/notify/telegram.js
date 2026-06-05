/**
 * Telegram notifier — optionally ping the user when a turn finishes.
 *
 * SECURITY NOTES (this repo is open source):
 *   - Secrets come from the environment first (TELEGRAM_BOT_TOKEN,
 *     TELEGRAM_CHAT_ID); config values are only a local fallback. Never commit
 *     a token — .gitignore covers .env, and /config masks secrets.
 *   - The token is never logged; failures report a generic message.
 *   - Messages are plain text by default (no parse_mode), so user/research content
 *     can't be interpreted as Telegram markup. The finish recap opts into HTML
 *     parse mode, but every dynamic part is HTML-escaped first (see buildRecap),
 *     so content still can't inject markup.
 *   - The request uses HTTPS and a hard timeout so a hung network call can't
 *     wedge the CLI.
 *
 * Setup: message @BotFather → /newbot for a token; send your bot a message,
 * then read the chat id from
 *   https://api.telegram.org/bot<TOKEN>/getUpdates
 */

const TELEGRAM_MAX_LEN = 4096;
const TIMEOUT_MS = 10_000;

/**
 * Resolve credentials from the ENVIRONMENT ONLY (never from config on disk).
 * Returns null if either value is missing.
 */
export function resolveTelegramCreds() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || null;
  const chatId = process.env.TELEGRAM_CHAT_ID || null;
  if (!botToken || !chatId) return null;
  return { botToken, chatId: String(chatId) };
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
    return { ok: false, error: e.name === 'AbortError' ? 'request timed out' : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

export function telegramEnabled(config = {}) {
  return Boolean(config.notify?.telegram?.enabled) && resolveTelegramCreds() !== null;
}

/**
 * Send a Telegram message. Best-effort: returns { ok, error? } and never throws,
 * so notification problems can't break the chat loop.
 *
 * By default the message is sent as plain text (no parse_mode), so arbitrary
 * user/research content can't be interpreted as Telegram markup. Pass
 * `{ parseMode: 'HTML' }` ONLY for text whose dynamic parts are already escaped
 * (see `escapeHtml` / `buildRecap`); otherwise stray `<`/`>`/`&` break rendering.
 */
export async function sendTelegram(text, _config = {}, { parseMode } = {}) {
  const creds = resolveTelegramCreds();
  if (!creds) return { ok: false, error: 'telegram credentials not configured' };

  const body = String(text ?? '').slice(0, TELEGRAM_MAX_LEN);
  if (!body) return { ok: false, error: 'empty message' };

  const payload = { chat_id: creds.chatId, text: body, disable_web_page_preview: true };
  if (parseMode) payload.parse_mode = parseMode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
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
    const reason = e.name === 'AbortError' ? 'request timed out' : 'network error';
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}
