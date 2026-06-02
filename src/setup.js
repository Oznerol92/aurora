import readline from 'node:readline';
import { createRequire } from 'node:module';
import { saveConfig } from './config.js';
import { info, warn, hint } from './ui.js';
import { personaDefaultsFromBrain, PERSONA_SCOPE } from './persona.js';

const require = createRequire(import.meta.url);

/**
 * Is the optional `better-sqlite3` native module installed? Resolved (not
 * loaded), so the check is cheap and side-effect-free. Drives the setup hints:
 * SQLite is only offered when its dependency is actually present.
 */
export function isSqliteAvailable() {
  try {
    require.resolve('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

/**
 * Map a questionnaire answer to a store id, given whether SQLite is available.
 * The options are renumbered when SQLite isn't installed, so this keeps the
 * mapping in one tested place. Unrecognised / empty answers mean "stay
 * stateless" (the safe default).
 */
export function resolveStoreChoice(answer, sqliteAvailable) {
  const a = String(answer || '')
    .trim()
    .toLowerCase();
  if (a === 'sqlite' || a === 'json' || a === 'none' || a === 'no') {
    return a === 'no' ? 'none' : a;
  }
  if (sqliteAvailable) {
    if (a === '1') return 'sqlite';
    if (a === '2') return 'json';
    return 'none'; // '3', empty, anything else
  }
  if (a === '1') return 'json';
  return 'none'; // '2', empty, anything else
}

/** Did the user already make a persistence choice (so we shouldn't nag)? */
export function shouldRunSetup(config, { isServe, isTty }) {
  return !isServe && isTty && config.store === 'none' && !config.setupDone;
}

/**
 * Build an `ask(question)` over a readline that queues lines as they arrive, so
 * an already-buffered answer (e.g. piped input) isn't dropped between questions,
 * and EOF resolves a pending prompt with the default rather than hanging.
 */
function createBufferedAsk(rl) {
  const buffered = [];
  let waiting = null;
  rl.on('line', (line) => {
    if (waiting) {
      const w = waiting;
      waiting = null;
      w(line);
    } else {
      buffered.push(line);
    }
  });
  rl.on('close', () => {
    if (waiting) {
      const w = waiting;
      waiting = null;
      w('');
    }
  });
  return (q) =>
    new Promise((resolve) => {
      process.stdout.write(q);
      if (buffered.length) resolve(buffered.shift());
      else waiting = resolve;
    });
}

/**
 * First-run questionnaire: asks whether to save conversations and where, showing
 * hints based on what's installed. Mutates and persists `config`, and always
 * marks setup as done so it only runs once. Interactive (own readline); callers
 * should only invoke it when `shouldRunSetup` is true.
 */
export async function runFirstRunSetup(config) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = createBufferedAsk(rl);
  const sqlite = isSqliteAvailable();

  try {
    console.log('\n' + info('Welcome to Aurora — quick setup') + ' ' + warn('(one time)'));
    console.log(
      'Aurora can save your conversations so you can resume them later and share\n' +
        'one chat across the terminal and Telegram. Pick a store (change it anytime\n' +
        'with /store):\n',
    );

    if (sqlite) {
      console.log(
        '  ' + info('1') + ') SQLite      — recommended; fast, handles CLI + server at once',
      );
      console.log('  ' + info('2') + ') JSON file   — simple, no native dependency');
      console.log('  ' + info('3') + ') No, thanks  — stay stateless (default)');
    } else {
      console.log('  ' + info('1') + ') JSON file   — simple, no native dependency');
      console.log('  ' + info('2') + ') No, thanks  — stay stateless (default)');
      console.log(
        warn('  tip: ') + 'for the faster SQLite store, run `npm install better-sqlite3`',
      );
    }

    const choice = resolveStoreChoice(await ask('\nChoose [default: no]: '), sqlite);
    config.store = choice;

    if (choice !== 'none') {
      console.log('\n' + info('Where should it live?'));
      console.log(
        '  ' + info('1') + ') Global   — ~/.config/aurora/data (one log everywhere) [default]',
      );
      console.log('  ' + info('2') + ') Project  — ./.aurora in the current folder');
      const where = String(await ask('Choose [default: global]: ')).trim();
      config.storeScope = where === '2' || where.toLowerCase() === 'project' ? 'project' : 'global';
      console.log(
        '\n' +
          info('Saved. ') +
          `Conversations will persist (${choice}, ${config.storeScope}). ` +
          'Use /history and /resume to manage them.',
      );
    } else {
      console.log(
        '\n' + info('Staying stateless. ') + 'Turn it on later with /store sqlite (or json).',
      );
    }

    // Environment-aware hints.
    const tg = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    if (tg) {
      console.log(
        warn('\n  Telegram detected: ') +
          'run `aurora --serve` to bridge it' +
          (choice !== 'none'
            ? ' — it shares this same conversation.'
            : ' (enable a store to share the chat).'),
      );
    }

    config.setupDone = true;
    saveConfig(config);
    console.log(hint() + '\n');
  } finally {
    rl.close();
  }
  return config;
}

/**
 * Should we offer the one-time persona questionnaire? Only with a real store to
 * write to (persona never lives in config.json), interactively, and only until
 * the user has been asked once.
 */
export function shouldRunPersonaSetup(config, hasStore, { isServe, isTty }) {
  return Boolean(
    !isServe && isTty && hasStore && !config.persona?.enabled && !config.persona?.prompted,
  );
}

/**
 * One-time persona questionnaire: a few optional questions so Aurora writes in
 * the user's voice. Seeds sensible defaults from the brain's voice cards, writes
 * the profile to the store (not config), and flips the config toggles. Callers
 * should gate on shouldRunPersonaSetup and pass an open, persona-capable store.
 */
export async function runPersonaSetup(store, config) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = createBufferedAsk(rl);
  config.persona ||= {};

  try {
    console.log(
      '\n' + info('Make Aurora write in your voice') + ' ' + warn('(optional, one time)'),
    );
    console.log(
      'A few quick questions so Aurora replicates how you write — typos and wrong\n' +
        'words fixed, your style kept. Press Enter to skip any (or all).\n',
    );
    const lang = String(await ask('Primary language (e.g. en / it) [skip]: ')).trim();
    const voice = String(
      await ask('In one line, how would you describe your writing voice? [skip]: '),
    ).trim();
    const samples = String(
      await ask('Paste a sentence or two that sound like you [skip]: '),
    ).trim();
    const never = String(await ask('Anything you never want to sound like? [skip]: ')).trim();

    config.persona.prompted = true;

    if (lang || voice || samples || never) {
      const fields = { ...personaDefaultsFromBrain() };
      if (lang) fields.langPrimary = lang;
      if (voice) fields.voiceRules = fields.voiceRules ? `${voice}\n${fields.voiceRules}` : voice;
      if (samples) fields.samplePhrases = samples;
      if (never) fields.dontList = fields.dontList ? `${never}; ${fields.dontList}` : never;
      await store.savePersona(PERSONA_SCOPE, fields);
      config.persona.enabled = true;
      console.log('\n' + info('Saved your voice profile. ') + 'View or edit it with /persona.');
    } else {
      console.log('\n' + info('Skipped. ') + 'Set it up anytime with /persona.');
    }
    saveConfig(config);
  } finally {
    rl.close();
  }
  return config;
}
