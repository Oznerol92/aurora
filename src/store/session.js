import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDataDir } from './location.js';

/**
 * The "active session" pointer: a tiny file in the data dir holding the id of
 * the conversation currently in progress. Both the CLI and the Telegram bridge
 * read it on startup so they attach to the SAME provider session — that's what
 * makes a chat you started on Telegram continuable from the command line (and
 * vice-versa). `/new` on either side rewrites it to start a fresh shared thread.
 *
 * Scoped exactly like the stores (global vs ./.aurora), so the active session
 * follows whichever data dir is in effect.
 */
function pointerPath(config = {}) {
  const dir = resolveDataDir({ scope: config.storeScope });
  return { dir, path: join(dir, 'active-session') };
}

/** Read the active session id, or null if none has been recorded. */
export function readActiveSession(config = {}) {
  try {
    const { path } = pointerPath(config);
    if (!existsSync(path)) return null;
    const id = readFileSync(path, 'utf8').trim();
    return id || null;
  } catch {
    return null;
  }
}

/** Record `id` as the active session (best-effort; never throws). */
export function writeActiveSession(config = {}, id) {
  if (!id) return;
  try {
    const { dir, path } = pointerPath(config);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path, String(id) + '\n', 'utf8');
  } catch {
    // A failed pointer write just means the next process starts a new session.
  }
}

/**
 * Point `provider` at the shared active session. With a store active: resume the
 * recorded session if there is one, else record this provider's fresh session as
 * the active one. With no store (stateless), do nothing and just report the
 * provider's own session id. Returns the session id now in effect.
 */
export function attachSession(provider, config = {}, hasStore = false) {
  if (!hasStore) return provider.sessionId ?? null;
  const existing = readActiveSession(config);
  if (existing) {
    provider.resume?.(existing);
    return existing;
  }
  const id = provider.sessionId ?? null;
  writeActiveSession(config, id);
  return id;
}

/**
 * Start a fresh shared conversation: reset the provider and (with a store)
 * record the new session as active so the other side picks it up too. Returns
 * the new session id.
 */
export function rotateSession(provider, config = {}, hasStore = false) {
  provider.reset?.();
  const id = provider.sessionId ?? null;
  if (hasStore) writeActiveSession(config, id);
  return id;
}
