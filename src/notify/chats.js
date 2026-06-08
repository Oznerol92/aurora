/**
 * Local Telegram chat registry.
 *
 * A chat id is NOT a secret — it's a routing number, useless without the bot
 * token (which stays env-only, see notify/telegram.js). So unlike the token, we
 * persist learned chat ids to a small local file. The bot learns them when a
 * user sends `/start` (or any message we discover via getUpdates); from then on
 * notifications and the two-way bridge reach those chats without anyone setting
 * TELEGRAM_CHAT_ID by hand.
 *
 * File: ~/.config/aurora/telegram-chats.json (honours AURORA_CONFIG_DIR).
 * Shape: { chats: [{ id, name, type, addedAt }] }
 *
 * The directory is resolved lazily (per call) rather than at import time so the
 * AURORA_CONFIG_DIR override is honoured even when set after this module loads
 * (the test harness relies on this).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function configDir() {
  return process.env.AURORA_CONFIG_DIR || join(homedir(), '.config', 'aurora');
}

export function chatsPath() {
  return join(configDir(), 'telegram-chats.json');
}

/** Load the registered chats (always an array; never throws). */
export function loadChats() {
  try {
    const path = chatsPath();
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (Array.isArray(data?.chats)) return data.chats;
    }
  } catch {
    // Corrupt/unreadable registry: behave as if empty.
  }
  return [];
}

/** Registered chat ids as strings (the form Telegram comparisons use). */
export function listChatIds() {
  return loadChats().map((c) => String(c.id));
}

export function isRegistered(id) {
  return listChatIds().includes(String(id));
}

/**
 * Register (or refresh) a chat. Returns { added, chat }: `added` is false when
 * the chat was already known (its name/type are refreshed in place).
 */
export function registerChat({ id, name = '', type = '' }) {
  const sid = String(id);
  const chats = loadChats();
  const existing = chats.find((c) => String(c.id) === sid);
  if (existing) {
    if (name) existing.name = name;
    if (type) existing.type = type;
    saveChats(chats);
    return { added: false, chat: existing };
  }
  const entry = { id, name, type, addedAt: new Date().toISOString() };
  chats.push(entry);
  saveChats(chats);
  return { added: true, chat: entry };
}

/** Forget a chat by id. Returns true if one was removed. */
export function removeChat(id) {
  const sid = String(id);
  const chats = loadChats();
  const next = chats.filter((c) => String(c.id) !== sid);
  if (next.length === chats.length) return false;
  saveChats(next);
  return true;
}

function saveChats(chats) {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = chatsPath();
  writeFileSync(path, JSON.stringify({ chats }, null, 2) + '\n', 'utf8');
  // Owner-only: the file maps your bot to your private chats.
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort (e.g. Windows)
  }
}
