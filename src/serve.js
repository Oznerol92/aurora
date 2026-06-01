import { runTelegramBridge } from './bridge/telegram.js';

/**
 * Aurora server mode: start every available inbound listener and keep them
 * running until the process is stopped. This is what `npm start` runs.
 *
 * A "listener" is any long-running inbound channel that feeds messages through
 * the provider — today that's the two-way Telegram bridge; tomorrow it might be
 * an HTTP webhook receiver, a Slack socket, a queue consumer, etc.
 *
 * To add a future webhook, append an entry to LISTENERS:
 *   - `name`         short id, used in logs
 *   - `available()`  true when its credentials/config are present (so it's
 *                    skipped, not crashed, when unconfigured)
 *   - `missing`      one-line hint shown when it's skipped
 *   - `start(ctx)`   async fn that runs forever; gets { provider, config, store, logLine }
 *
 * Nothing else needs to change — `runServer` discovers and runs whatever is
 * listed and configured. The interactive REPL is still `aurora` with no args.
 */
const LISTENERS = [
  {
    name: 'telegram',
    available: () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    missing: 'set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable',
    start: (ctx) => runTelegramBridge(ctx),
  },
  // Future webhooks register here, e.g.:
  // {
  //   name: 'webhook',
  //   available: () => Boolean(process.env.WEBHOOK_PORT),
  //   missing: 'set WEBHOOK_PORT to enable',
  //   start: (ctx) => runWebhookServer(ctx),
  // },
];

/**
 * Start all available listeners concurrently. Throws only if nothing is
 * configured (so `npm start` fails loudly instead of idling silently).
 */
export async function runServer({ provider, config, store, logLine }) {
  const log = logLine || ((m) => console.log(m));

  const active = LISTENERS.filter((l) => l.available(config));
  const skipped = LISTENERS.filter((l) => !l.available(config));

  for (const l of skipped) log(`${l.name}: skipped — ${l.missing || 'not available'}`);

  if (!active.length) {
    throw new Error(
      'no listeners are configured. ' + LISTENERS.map((l) => `${l.name} (${l.missing})`).join('; '),
    );
  }

  log(`Listening on: ${active.map((l) => l.name).join(', ')}. Ctrl-C to stop.`);

  // Run every listener concurrently. Each is meant to run forever; if one
  // throws, surface it but let the others keep serving.
  await Promise.all(
    active.map((l) =>
      l
        .start({ provider, config, store, logLine: (m) => log(`[${l.name}] ${m}`) })
        .catch((e) => log(`${l.name}: stopped — ${e?.message || String(e)}`)),
    ),
  );
}
