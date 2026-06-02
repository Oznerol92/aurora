import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Single-writer coordination across aurora instances on one machine.
 *
 * Only one "primary" aurora — the one that owns the DB (persistence) and the
 * inbound listeners (the Telegram bridge) — may run at a time. The primary holds
 * a lock file; a second plain launch is refused and pointed at `aurora --solo`,
 * which runs fully ephemeral (no listeners, no DB) and so can never fight the
 * primary over the store or double-bind the Telegram poller. Any number of solo
 * instances may coexist; they neither take nor check the lock.
 *
 * The lock lives in the machine-global data dir. We derive that path here the
 * same way config.js derives CONFIG_DIR (env override → ~/.config/aurora),
 * deliberately NOT via store/location.js#resolveDataDir: that helper redirects
 * to ./.aurora whenever one exists in the cwd, which would scope the lock to a
 * directory instead of the machine.
 */
function lockPath() {
  const configDir = process.env.AURORA_CONFIG_DIR || join(homedir(), '.config', 'aurora');
  return join(configDir, 'data', 'aurora.lock');
}

/** Probe whether `pid` is a live process (kill with signal 0 sends nothing). */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH → no such process; EPERM → it exists but isn't ours to signal (alive).
    return e.code === 'EPERM';
  }
}

/**
 * If a DIFFERENT, live aurora already holds the primary lock, return its recorded
 * info ({ pid, startedAt }). Otherwise return null — meaning no lock, a stale lock
 * left by a crashed process, an unreadable lock, or one we hold ourselves.
 */
export function primaryLockHolder() {
  try {
    const path = lockPath();
    if (!existsSync(path)) return null;
    const info = JSON.parse(readFileSync(path, 'utf8'));
    const pid = Number(info?.pid);
    if (!pid || pid === process.pid) return null;
    return isPidAlive(pid) ? info : null;
  } catch {
    return null;
  }
}

// Whether THIS process currently holds the lock — gates release so we never
// delete a lock another instance has since taken over.
let held = false;

/** Record this process as the primary (best-effort; never throws). */
export function acquirePrimaryLock() {
  try {
    const path = lockPath();
    const dir = join(path, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n',
      'utf8',
    );
    held = true;
    // Backstop for the paths that don't run finish() (e.g. --serve, crashes).
    process.once('exit', releasePrimaryLock);
  } catch {
    // If we can't write the lock we simply run without coordination.
  }
  return held;
}

/** Remove the lock, but only if it's still ours. */
export function releasePrimaryLock() {
  if (!held) return;
  try {
    const path = lockPath();
    if (existsSync(path)) {
      const info = JSON.parse(readFileSync(path, 'utf8'));
      if (Number(info?.pid) === process.pid) unlinkSync(path);
    }
  } catch {
    // best-effort
  }
  held = false;
}
