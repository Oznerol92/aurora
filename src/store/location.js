import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { configDir } from '../config.js';

/** Name of the project-local store directory (git-style, lives in the cwd). */
export const PROJECT_DIR_NAME = '.aurora';

/**
 * Decide where a store keeps its data files. Precedence:
 *   1. An explicit `dataDir` (storeOptions.dataDir) always wins.
 *   2. Project-local `./.aurora` — used when scope is 'project', OR when such a
 *      directory already exists in the cwd (so `cd`-ing into a project that has
 *      one "just works", the way git finds `.git`).
 *   3. The global `~/.config/aurora/data` — the default for a research log that
 *      isn't tied to any one directory.
 */
export function resolveDataDir({ dataDir, scope } = {}) {
  if (dataDir) return dataDir;
  const local = join(process.cwd(), PROJECT_DIR_NAME);
  if (scope === 'project' || existsSync(local)) return local;
  return join(configDir, 'data');
}
