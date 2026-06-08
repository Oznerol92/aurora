import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const CONFIG_DIR = process.env.AURORA_CONFIG_DIR || join(homedir(), '.config', 'aurora');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  provider: 'claude',
  model: null, // null => provider default
  claudeBin: 'claude',

  // Set true once the first-run questionnaire has run (see src/setup.js), so it
  // only prompts once even if the user declines a store.
  setupDone: false,

  // Persistence is opt-in. 'none' keeps Aurora stateless (default);
  // 'json' and 'sqlite' persist conversations. See src/store/.
  store: 'none',

  // Where a persistent store keeps its data:
  //   'global'  — one shared history under ~/.config/aurora/data (default)
  //   'project' — a git-style ./.aurora directory in the current folder
  // A ./.aurora that already exists is used automatically regardless. See
  // src/store/location.js.
  storeScope: 'global',

  // The curated method "brain" (see src/brain/ and the brain/ corpus). When
  // enabled, a digest of the core method cards is injected into every fresh
  // session's system prompt. Non-secret toggle only.
  brain: { enabled: true },

  // Executable "skills" (see src/skills/ and the skills/ corpus). When enabled,
  // a message that clearly matches a skill's trigger gets that skill's plan
  // (procedure + named brain rules + template) injected for the turn. Non-secret.
  skills: { enabled: true },

  // The user's voice/characteristics profile. The profile text itself lives in
  // the store (never here — it's personal); config holds only the toggles.
  // `enabled` gates injection; `prompted` records that the one-time setup ran.
  persona: { enabled: false, prompted: false },

  // Optional Telegram notifications when a turn finishes.
  // SECURITY: the bot token is NEVER stored here — it's read only from the
  // environment (TELEGRAM_BOT_TOKEN, which can come from a gitignored .env).
  // Config holds only non-secret toggles. Chat ids are not secrets and live in
  // a local registry (~/.config/aurora/telegram-chats.json, see notify/chats.js),
  // learned when a user sends the bot /start.
  notify: {
    telegram: {
      enabled: false,
      notifyOnDone: false,
    },
  },
};

/** Keys whose values are secrets and must never be printed/logged. */
const SECRET_KEYS = new Set(['botToken', 'chatId', 'apiKey', 'token']);

export function loadConfig() {
  let fromFile = {};
  try {
    if (existsSync(CONFIG_PATH)) {
      fromFile = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {
    // Corrupt/unreadable config: fall back to defaults silently.
  }
  // Shallow merge is not enough now that we have nested objects (notify.*).
  return deepMerge(DEFAULTS, fromFile);
}

export function saveConfig(config) {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
  // The config can hold a token — keep it readable only by the owner.
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // chmod is best-effort (e.g. on Windows); ignore failures.
  }
  return CONFIG_PATH;
}

/**
 * Return a deep copy of `config` with secret values masked, safe to print
 * (used by `/config`). A present secret shows as "set" so the user knows it
 * exists without exposing it.
 */
export function redactConfig(config) {
  const walk = (val) => {
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = SECRET_KEYS.has(k) && v ? '«set»' : walk(v);
      }
      return out;
    }
    return val;
  };
  return walk(config);
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const configPath = CONFIG_PATH;
export const configDir = CONFIG_DIR;
