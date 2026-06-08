import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { Provider } from './base.js';
import {
  composeSystemPrompt,
  AURORA_PERSONA,
  INTERACTION_PROTOCOL,
  SEED_MAX_TURNS,
  seedPreamble,
} from './prompt.js';
import { buildBrainIndex, selectRelevantCards, formatTurnBrain } from '../brain/corpus.js';

/**
 * Codex provider, driven through the local `codex` CLI in headless mode
 * (`codex exec --json`). It's the second "muscle" behind the same Aurora
 * identity: persona, interaction protocol, voice and method brain are shared
 * with the Claude provider (see ./prompt.js), so `/provider codex` should feel
 * like the same Aurora with a different engine underneath.
 *
 * Two things differ from Claude and shape this file:
 *
 *  1. Continuity. We can't choose the session id up front. The first turn creates
 *     a Codex thread; we learn its `thread_id` from the `thread.started` event
 *     and resume it (`codex exec resume <id>`) on every later turn, so the
 *     conversation persists in Codex's own session store.
 *
 *  2. Identity injection. `codex exec` has no `--append-system-prompt`. So on a
 *     fresh thread Aurora's whole system prompt (persona + protocol + voice +
 *     brain index + any seeded transcript) is PREPENDED to the prompt we feed on
 *     stdin. Resumed turns inject only the per-turn brain, since Codex restores
 *     the rest of the context itself.
 *
 * Credentials are the Codex CLI's own concern (`codex login`, or OPENAI_API_KEY
 * in the environment) — Aurora never reads or stores them, mirroring how the
 * Claude provider relies on Claude Code's auth.
 */

// Research assistant posture: never let model-generated commands mutate the
// user's files from a chat. Mirrors Claude's read-only + web tool allowance.
const SANDBOX_MODE = 'read-only';

// Separates the prepended system context from the user's message on a fresh
// thread, so the model reads the top as standing instructions.
const SYSTEM_SEPARATOR =
  '════════ The block above is your standing context (identity, protocol, ' +
  'method brain). Follow it every turn. Now respond to the user. ════════';

export class CodexProvider extends Provider {
  static id = 'codex';
  static label = 'Codex (via OpenAI Codex CLI)';
  static implemented = true;

  constructor(config = {}) {
    super(config);
    this.bin = config.codexBin || 'codex';
    // Codex model names differ from Claude's, and the shared `/model` setting
    // (config.model) targets Claude — so we only forward a model when a
    // codex-specific one is configured, else let the CLI use its own default.
    this.model = config.codexModel || null;

    // Continuity: learned from the first turn's `thread.started`, then resumed.
    this.threadId = null;
    this.started = false;

    // Fallback context adopted from Aurora's store (seed), used to prime a fresh
    // thread when there's no native session to resume.
    this.seedTurns = null;
    this.useSeed = false;

    // Curated method brain + the user's voice profile (config-level, reused
    // across reset()/rotate), exactly like the Claude provider.
    this.brainCards = [];
    this.brainIndex = null;
    this.personaText = null;

    // Cancellation.
    this._child = null;
    this._aborted = false;
  }

  reset() {
    this.threadId = null;
    this.started = false;
    this.seedTurns = null;
    this.useSeed = false;
  }

  /**
   * Resume a prior Codex thread: adopt its id and mark the provider started, so
   * the next send() uses `codex exec resume <id>` and Codex restores the
   * conversation. Pairs with seed() for a future fresh-session fallback.
   */
  resume(sessionId) {
    if (!sessionId) return false;
    this.threadId = sessionId;
    this.started = true;
    return true;
  }

  /** Adopt a bounded stored transcript to prime a fresh thread. */
  seed(turns) {
    const usable = (Array.isArray(turns) ? turns : []).filter((t) => t && t.text);
    this.seedTurns = usable.slice(-SEED_MAX_TURNS);
    this.useSeed = this.seedTurns.length > 0;
    return this.useSeed;
  }

  setBrainCards(cards) {
    this.brainCards = Array.isArray(cards) ? cards : [];
    this.brainIndex = this.brainCards.length ? buildBrainIndex(this.brainCards) : null;
  }

  setPersona(text) {
    this.personaText = text || null;
  }

  abort() {
    this._aborted = true;
    const child = this._child;
    if (!child) return false;
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone — nothing to cancel
    }
    return true;
  }

  shortSession() {
    return this.threadId ? String(this.threadId).slice(0, 8) : null;
  }

  describe() {
    return `${CodexProvider.label}${this.model ? ` · ${this.model}` : ''}`;
  }

  /**
   * Args for `codex exec`. The prompt is read from stdin (we pass `-`), so a
   * large system+brain prompt can't hit argv limits or shell-quoting issues. On
   * a resumed turn the `resume <id>` subcommand follows the exec options.
   */
  buildArgs() {
    const args = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-s',
      SANDBOX_MODE,
      '--color',
      'never',
    ];
    if (this.model) args.push('-m', this.model);
    if (this.started && this.threadId) args.push('resume', this.threadId);
    args.push('-');
    return args;
  }

  /**
   * The prompt fed on stdin. Fresh thread: Aurora's full system prompt prepended
   * above the (brain-augmented) user message, since Codex has no system channel.
   * Resumed thread: just the augmented message — Codex keeps the rest.
   */
  buildPrompt(text) {
    const augmented = this.#augment(text);
    if (this.started && this.threadId) return augmented;
    const system = composeSystemPrompt({
      persona: AURORA_PERSONA,
      protocol: INTERACTION_PROTOCOL,
      personaProfile: this.personaText,
      brain: this.brainIndex,
      seed: this.useSeed && this.seedTurns?.length ? seedPreamble(this.seedTurns) : null,
    });
    return `${system}\n\n${SYSTEM_SEPARATOR}\n\n${augmented}`;
  }

  async *send(text) {
    yield* this.#stream(this.buildPrompt(text));
  }

  /** Prepend the per-turn brain guidance to a message, or return it unchanged. */
  #augment(text) {
    if (!this.brainCards.length) return text;
    const block = formatTurnBrain(selectRelevantCards(this.brainCards, text));
    return block ? `${block}\n\n${text}` : text;
  }

  /** One turn against the CLI: spawn, feed stdin, stream events, settle exit. */
  async *#stream(prompt) {
    const args = this.buildArgs();
    const child = spawn(this.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this._child = child;
    this._aborted = false;

    // Feed the prompt and close stdin so Codex stops waiting for more input.
    child.stdin.on('error', () => {}); // ignore EPIPE if Codex exits early
    child.stdin.end(prompt);

    // Async queue bridging readline 'line' events to the generator.
    const queue = [];
    let notify = null;
    let finished = false;
    let spawnError = null;
    let stderr = '';
    let streamError = null;

    // Accumulated assistant text — Codex delivers each message whole in an
    // `item.completed`, so we track it to both stream deltas and build the final
    // `done` text (turn.completed carries usage, not text).
    let answer = '';

    const push = (item) => {
      queue.push(item);
      if (notify) {
        const n = notify;
        notify = null;
        n();
      }
    };

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      spawnError = err;
      finished = true;
      if (notify) {
        const n = notify;
        notify = null;
        n();
      }
    });

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const m = mapCodexLine(line);
      if (!m) return;
      switch (m.kind) {
        case 'thread':
          // Learn (and lock onto) the session so later turns can resume it.
          this.threadId = m.threadId;
          this.started = true;
          break;
        case 'text': {
          const full = m.text || '';
          let delta;
          if (!answer) {
            delta = full;
            answer = full;
          } else if (full.startsWith(answer)) {
            delta = full.slice(answer.length);
            answer = full;
          } else {
            // A distinct second message in the same turn: append, separated.
            delta = `\n${full}`;
            answer = `${answer}\n${full}`;
          }
          if (delta) push({ type: 'delta', text: delta });
          break;
        }
        case 'status':
          push({ type: 'status', text: m.text });
          break;
        case 'error':
          streamError = m.message || streamError;
          break;
        case 'done':
          push({
            type: 'done',
            text: answer,
            costUsd: null, // Codex reports tokens, not USD
            model: this.model,
            sessionId: this.threadId,
            usage: m.usage || null,
          });
          break;
      }
    });

    let exitCode = 0;
    child.on('close', (code) => {
      exitCode = code ?? 0;
      finished = true;
      if (notify) {
        const n = notify;
        notify = null;
        n();
      }
    });

    try {
      while (true) {
        while (queue.length) yield queue.shift();
        if (finished) break;
        await new Promise((resolve) => {
          notify = resolve;
        });
      }
      while (queue.length) yield queue.shift();
    } finally {
      this._child = null;
    }

    // Cancelled on purpose (Ctrl-C): treat the kill as a clean stop so the
    // caller keeps the partial answer instead of seeing an error.
    if (this._aborted) return;

    if (spawnError) {
      if (spawnError.code === 'ENOENT') {
        throw new Error(
          `Could not find the "${this.bin}" CLI on your PATH. Install Codex and run ` +
            '`codex login` (or set OPENAI_API_KEY), or set codexBin in your config.',
        );
      }
      throw spawnError;
    }
    if (exitCode !== 0) {
      throw new Error(explainCodexExit(exitCode, stderr, streamError));
    }
  }
}

/**
 * Map one JSONL line from `codex exec --json` into a normalized step, or null to
 * ignore it. Pure (no provider state) so it can be unit-tested directly. Kinds:
 *   { kind:'thread', threadId } — session id from `thread.started`
 *   { kind:'text',   text }     — an assistant message (whole)
 *   { kind:'status', text }     — non-message activity (web search, command, …)
 *   { kind:'error',  message }  — a turn-level failure
 *   { kind:'done',   usage }    — the turn finished
 */
export function mapCodexLine(line) {
  const s = String(line).trim();
  if (!s) return null;
  let e;
  try {
    e = JSON.parse(s);
  } catch {
    return null;
  }

  switch (e.type) {
    case 'thread.started':
      return e.thread_id ? { kind: 'thread', threadId: e.thread_id } : null;
    case 'item.started':
    case 'item.updated':
    case 'item.completed': {
      const item = e.item || {};
      const itemType = item.type || item.item_type || '';
      if (itemType === 'agent_message') {
        // Only the completed message carries the final text; ignore partials so
        // we don't double-count (each completed item is the whole message).
        if (e.type !== 'item.completed') return null;
        return { kind: 'text', text: typeof item.text === 'string' ? item.text : '' };
      }
      const status = codexItemStatus(itemType);
      return status ? { kind: 'status', text: status } : null;
    }
    case 'turn.completed':
      return { kind: 'done', usage: e.usage || null };
    case 'turn.failed':
    case 'error':
      return { kind: 'error', message: codexErrorText(e) };
    default:
      return null;
  }
}

/** Friendly status label for a Codex work item, or '' to ignore it. */
function codexItemStatus(itemType) {
  const pretty = {
    command_execution: 'running a command',
    local_shell_call: 'running a command',
    exec_command: 'running a command',
    web_search: 'searching the web',
    web_search_call: 'searching the web',
    file_change: 'editing files',
    patch: 'editing files',
    mcp_tool_call: 'calling a tool',
    reasoning: '', // internal/large — don't surface
    agent_message: '',
  };
  if (itemType in pretty) return pretty[itemType];
  return itemType ? `working (${itemType})` : '';
}

/** Best error text from a Codex failure event. */
function codexErrorText(e = {}) {
  return e.error?.message || e.message || e.error || 'Codex turn failed';
}

/**
 * Turn a non-zero `codex` exit (or a streamed error) into a cause-led, actionable
 * message instead of a bare "codex exited with code 1". Prefers any streamed
 * error text, falls back to stderr, then to a "no output" hint.
 */
export function explainCodexExit(exitCode, stderr = '', streamError = '') {
  const raw = String(streamError || stderr || '').trim();
  const cause = classifyCodexExit(raw);
  const head = cause
    ? cause
    : raw
      ? `Codex CLI failed (exit ${exitCode}).`
      : `Codex CLI exited with code ${exitCode} and produced no output — it may have ` +
        'crashed or been killed. Try running `codex` directly to see the underlying error.';
  const detail = raw ? `\n${raw.length > 600 ? raw.slice(0, 600) + '…' : raw}` : '';
  return head + detail;
}

/** Match Codex/OpenAI failure signatures; null when nothing matches. */
function classifyCodexExit(stderr) {
  const m = String(stderr).toLowerCase();
  const has = (...needles) => needles.some((n) => m.includes(n));

  if (
    has('not logged in', 'unauthorized', 'authentication', 'no api key', 'invalid api key') ||
    (has('login') && has('codex login', 'please run', 'sign in')) ||
    m.includes('401')
  ) {
    return 'Codex isn’t authenticated. Run `codex login` (or set OPENAI_API_KEY) and try again.';
  }
  if (has('usage limit', 'quota', 'insufficient_quota', 'billing')) {
    return 'You’ve hit your OpenAI usage/quota limit. Check your plan or switch models.';
  }
  if (has('rate limit', 'rate_limit', 'too many requests') || m.includes('429')) {
    return 'Codex is rate-limiting requests. Wait a few seconds and retry.';
  }
  if (has('overloaded', 'server is busy') || m.includes('503') || m.includes('529')) {
    return 'OpenAI is overloaded right now. Retry in a moment.';
  }
  if (
    has('context length', 'maximum context', 'too many tokens') ||
    (has('context') && has('exceed'))
  ) {
    return 'The conversation is too long for the model’s context window. Start fresh with /new.';
  }
  if (
    (has('model') && has('not found', 'invalid', 'unknown', 'does not exist')) ||
    has('invalid model')
  ) {
    return 'The configured Codex model was rejected. Check your `codexModel` setting.';
  }
  if (
    has(
      'econnreset',
      'enotfound',
      'etimedout',
      'econnrefused',
      'fetch failed',
      'socket hang up',
      'network error',
    )
  ) {
    const code = (m.match(/\b(econnreset|enotfound|etimedout|econnrefused)\b/) || [])[1];
    return `Network error reaching OpenAI${code ? ` (${code.toUpperCase()})` : ''}. Check your connection and retry.`;
  }
  return null;
}
