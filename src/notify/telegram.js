/**
 * Telegram notifier — optionally ping the user when a turn finishes.
 *
 * SECURITY NOTES (this repo is open source):
 *   - Secrets come from the environment first (TELEGRAM_BOT_TOKEN,
 *     TELEGRAM_CHAT_ID); config values are only a local fallback. Never commit
 *     a token — .gitignore covers .env, and /config masks secrets.
 *   - The token is never logged; failures report a generic message.
 *   - Messages are sent as plain text (no parse_mode), so user/research content
 *     can't be interpreted as Telegram markup or trigger formatting injection.
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
 * Split `text` into chunks no longer than Telegram's per-message limit so a long
 * turn arrives whole instead of being truncated. Pure (no I/O) so the splitting is
 * unit-testable; naive fixed-width slicing, matching the bridge's `replyChunked`.
 * Empty/blank input yields a single empty chunk so callers preserve their existing
 * empty-message handling.
 */
export function chunkTelegram(text) {
  const full = String(text ?? '');
  if (!full) return [''];
  const chunks = [];
  for (let i = 0; i < full.length; i += TELEGRAM_MAX_LEN) {
    chunks.push(full.slice(i, i + TELEGRAM_MAX_LEN));
  }
  return chunks;
}

/**
 * Send `text` to Telegram across as many messages as it takes to fit the 4096-char
 * limit (see `chunkTelegram`), so a long answer is mirrored in full rather than cut
 * off. Sequential and best-effort: stops at the first failed chunk and returns its
 * result. Returns { ok, error? } and never throws.
 */
export async function sendTelegramChunked(text, config = {}) {
  let res = { ok: false, error: 'empty message' };
  for (const chunk of chunkTelegram(text)) {
    res = await sendTelegram(chunk, config);
    if (!res.ok) return res;
  }
  return res;
}

/**
 * Send a Telegram message. Best-effort: returns { ok, error? } and never throws,
 * so notification problems can't break the chat loop.
 */
export async function sendTelegram(text, _config = {}) {
  const creds = resolveTelegramCreds();
  if (!creds) return { ok: false, error: 'telegram credentials not configured' };

  const body = String(text ?? '').slice(0, TELEGRAM_MAX_LEN);
  if (!body) return { ok: false, error: 'empty message' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No parse_mode → Telegram treats this strictly as plain text.
      body: JSON.stringify({ chat_id: creds.chatId, text: body, disable_web_page_preview: true }),
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
