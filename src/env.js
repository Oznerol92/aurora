import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal .env loader — zero dependencies.
 *
 * Node only auto-reads .env with `--env-file` (v20.6+), but Aurora supports
 * Node 18, so we load it ourselves. Reads KEY=VALUE lines from a .env in the
 * current directory and sets them on process.env, WITHOUT overriding variables
 * already present in the real environment (the environment always wins).
 *
 * Intentionally simple: `KEY=value`, `#` comments, blank lines, optional
 * surrounding quotes. No interpolation, no multiline — keep secrets boring.
 */
export function loadDotenv(path = join(process.cwd(), '.env')) {
  if (!existsSync(path)) return;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // unreadable .env shouldn't crash startup
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue; // real env takes precedence
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
