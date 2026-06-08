import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { Provider } from './base.js';
import {
  composeSystemPrompt,
  AURORA_PERSONA,
  INTERACTION_PROTOCOL,
  SEED_MAX_TURNS,
  seedPreamble,
} from './prompt.js';
import { buildBrainIndex, formatTurnBrain } from '../brain/corpus.js';
import { buildBrainGraph, selectRelevantCardsGraph } from '../brain/graph.js';

// Aurora's identity (persona + interaction protocol) and the seed-preamble
// helper are shared across providers via ./prompt.js, so switching the backend
// keeps the same Aurora. Only Claude-specific config lives here.

/**
 * Tools Aurora is allowed to use. Deliberately read-only + web: enough to do
 * real research, but it can't edit or delete the user's files from a chat.
 * Anything not listed is auto-denied in headless mode (no hanging prompts).
 */
const ALLOWED_TOOLS = ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'];

/**
 * Claude provider, driven through the local `claude` CLI in headless mode.
 * Uses the user's existing Claude Code subscription auth — no API key needed.
 *
 * Continuity: we mint a session id up front. The first turn creates the session
 * (`--session-id`); every later turn resumes it (`--resume`). `reset()` mints a
 * new id, starting a clean conversation.
 *
 * Trustworthy resume (v0.3.3): a native `--resume` can fail if Claude no longer
 * has that session (other machine, pruned `~/.claude`, foreign id). When that
 * happens on the first turn, we transparently fall back to a fresh session
 * seeded with Aurora's own stored transcript (see `seed()`), so the model keeps
 * its context instead of silently starting blank.
 */
export class ClaudeProvider extends Provider {
  static id = 'claude';
  static label = 'Claude (via Claude Code CLI)';
  static implemented = true;

  constructor(config = {}) {
    super(config);
    this.bin = config.claudeBin || 'claude';
    this.model = config.model || null; // null => CLI default
    this.sessionId = randomUUID();
    this.started = false;

    // Fallback context: a bounded transcript adopted from Aurora's store, used
    // to seed a fresh session if a native resume turns out to be stale.
    this.seedTurns = null;
    this.useSeed = false;

    // Curated method "brain" and the user's voice profile. Both are config-level
    // (not per-session): set once from the store/corpus and reused, so
    // reset()/rotate keeps them. The brain is held as cards: an always-on index
    // is injected on a fresh session, and the most relevant cards are retrieved
    // and injected into each turn (see #augment).
    this.brainCards = [];
    this.brainIndex = null;
    this.brainGraph = null;
    this.personaText = null;

    // Cancellation: the in-flight child process and a flag set by abort().
    this._child = null;
    this._aborted = false;
  }

  reset() {
    this.sessionId = randomUUID();
    this.started = false;
    this.seedTurns = null;
    this.useSeed = false;
  }

  /**
   * Resume a prior session: point at its id and mark it started, so the next
   * send() uses `--resume <id>` and the CLI restores that conversation's own
   * context. (Aurora's stored turns are a parallel log; Claude keeps the real
   * session state.) Pair with seed() so we can recover if that resume is stale.
   */
  resume(sessionId) {
    if (!sessionId) return false;
    this.sessionId = sessionId;
    this.started = true;
    return true;
  }

  /**
   * Adopt a stored transcript as fallback context. If a native `--resume` later
   * fails, the next turn starts a fresh session and prepends these turns as a
   * context preamble so the model isn't left with amnesia. Bounded to the last
   * SEED_MAX_TURNS turns; older context is dropped (summarization is a later
   * phase). Returns whether any usable turns were taken.
   */
  seed(turns) {
    const usable = (Array.isArray(turns) ? turns : []).filter((t) => t && t.text);
    this.seedTurns = usable.slice(-SEED_MAX_TURNS);
    this.useSeed = this.seedTurns.length > 0;
    return this.useSeed;
  }

  /**
   * Supply the curated method brain as cards. Precomputes the always-on index
   * (injected on the next fresh session); relevant cards are retrieved per turn
   * in #augment. Pass [] (or nothing) to disable the brain.
   */
  setBrainCards(cards) {
    this.brainCards = Array.isArray(cards) ? cards : [];
    this.brainIndex = this.brainCards.length ? buildBrainIndex(this.brainCards) : null;
    // Precompute the retrieval graph once (reused every turn in #augment).
    this.brainGraph = this.brainCards.length ? buildBrainGraph(this.brainCards) : null;
  }

  /** User voice/characteristics injected on the next fresh session (null to clear). */
  setPersona(text) {
    this.personaText = text || null;
  }

  /**
   * Cancel the in-flight turn: kill the child `claude` process and flag the run
   * as aborted so send() ends cleanly (no spurious error) and the caller can
   * keep whatever streamed so far. Safe to call when nothing is running.
   */
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
    return this.sessionId.slice(0, 8);
  }

  describe() {
    return `${ClaudeProvider.label}${this.model ? ` · ${this.model}` : ''}`;
  }

  buildArgs(text) {
    const args = [
      '-p',
      text,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    if (this.model) args.push('--model', this.model);
    args.push('--allowedTools', ...ALLOWED_TOOLS);

    if (this.started) {
      args.push('--resume', this.sessionId);
    } else {
      args.push('--session-id', this.sessionId);
      // Fresh session: assemble the system prompt from the base persona, the
      // user's voice profile, the method brain, and any seeded transcript. Only
      // happens here — a --resume turn injects nothing (the CLI restores state).
      const system = composeSystemPrompt({
        persona: AURORA_PERSONA,
        protocol: INTERACTION_PROTOCOL,
        personaProfile: this.personaText,
        brain: this.brainIndex,
        seed: this.useSeed && this.seedTurns?.length ? seedPreamble(this.seedTurns) : null,
      });
      args.push('--append-system-prompt', system);
    }
    return args;
  }

  async *send(text) {
    // Prepend the brain cards most relevant to THIS message. Done here (not in
    // buildArgs) so it rides every turn — fresh or resumed — and so Aurora's
    // stored transcript and seed preamble keep the user's raw text, unpolluted.
    const augmented = this.#augment(text);
    // Whether this turn relies on a native `--resume` (vs. creating/seeding a
    // session). Captured before #stream flips `started`, so the fallback check
    // below knows a resume was actually attempted.
    const usedResume = this.started;
    try {
      yield* this.#stream(augmented);
    } catch (e) {
      if (this.#shouldFallback(usedResume, e)) {
        // The native session is gone. Start fresh, seeded from the store, and
        // retry once. Nothing streamed yet (resume failures error immediately),
        // so the user sees a clean recovery rather than a dropped turn.
        yield {
          type: 'status',
          text: 'native session unavailable — resuming from saved transcript',
        };
        this.sessionId = randomUUID();
        this.started = false; // buildArgs will create + seed a new session
        yield* this.#stream(augmented);
      } else {
        throw e;
      }
    }
  }

  /** Prepend the per-turn brain guidance to a message, or return it unchanged. */
  #augment(text) {
    if (!this.brainCards.length) return text;
    const cards = selectRelevantCardsGraph(this.brainCards, text, { graph: this.brainGraph });
    const block = formatTurnBrain(cards);
    return block ? `${block}\n\n${text}` : text;
  }

  /** Whether a failed turn can recover by seeding a fresh session. */
  #shouldFallback(usedResume, error) {
    return Boolean(
      usedResume && !this._sawDelta && this.seedTurns?.length && isSessionNotFound(error?.message),
    );
  }

  /** One turn against the CLI: spawn, stream events, settle exit status. */
  async *#stream(text) {
    const args = this.buildArgs(text);
    const child = spawn(this.bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this._child = child;
    this._aborted = false;
    this._sawDelta = false;

    // Async queue bridging readline 'line' events to the generator.
    const queue = [];
    let notify = null;
    let finished = false;
    let spawnError = null;
    let stderr = '';

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
      const ev = parseEvent(line);
      if (ev) push(ev);
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

    this.started = true;

    try {
      while (true) {
        while (queue.length) yield this.#track(queue.shift());
        if (finished) break;
        await new Promise((resolve) => {
          notify = resolve;
        });
      }
      // Drain anything that arrived between the last check and close.
      while (queue.length) yield this.#track(queue.shift());
    } finally {
      this._child = null;
    }

    // Cancelled on purpose (Ctrl-C): treat the kill as a clean stop so the
    // caller keeps the partial answer instead of seeing an error.
    if (this._aborted) return;

    if (spawnError) {
      if (spawnError.code === 'ENOENT') {
        throw new Error(
          `Could not find the "${this.bin}" CLI on your PATH. Install Claude Code and sign in, or set claudeBin in your config.`,
        );
      }
      throw spawnError;
    }
    if (exitCode !== 0) {
      throw new Error(explainExit(exitCode, stderr));
    }
  }

  /** Note when real text has streamed (so we don't retry mid-answer). */
  #track(ev) {
    if (ev.type === 'delta') this._sawDelta = true;
    return ev;
  }
}

/**
 * Classify whether an error from the CLI means "that resume session no longer
 * exists" — the cue to fall back to a seeded fresh session rather than failing.
 */
export function isSessionNotFound(message = '') {
  const m = String(message).toLowerCase();
  return (
    m.includes('no conversation found') ||
    m.includes('session not found') ||
    m.includes('no session found') ||
    (m.includes('session') && m.includes('not found')) ||
    (m.includes('resume') && m.includes('not found'))
  );
}

/**
 * Turn a non-zero `claude` CLI exit into a cause-led, actionable message instead
 * of a bare "claude exited with code 1". Scans stderr for known signatures and
 * leads with the likely cause + a remedy; falls back to the raw output, and to a
 * "no output" hint when stderr is empty (the worst case — the original opaque
 * error). The raw stderr is still appended (bounded) so diagnostics aren't lost.
 *
 * Token-safe: stderr from the CLI doesn't carry secrets, but we bound it anyway
 * so a stack dump can't flood the REPL.
 */
export function explainExit(exitCode, stderr = '') {
  const raw = String(stderr).trim();
  const cause = classifyExit(raw);
  const head = cause
    ? cause
    : raw
      ? `Claude CLI failed (exit ${exitCode}).`
      : `Claude CLI exited with code ${exitCode} and produced no output — it may have ` +
        `crashed or been killed. Try running \`claude\` directly to see the underlying error.`;
  const detail = raw ? `\n${raw.length > 600 ? raw.slice(0, 600) + '…' : raw}` : '';
  return head + detail;
}

/** Match stderr against known failure signatures; null when nothing matches. */
function classifyExit(stderr) {
  const m = String(stderr).toLowerCase();
  const has = (...needles) => needles.some((n) => m.includes(n));

  if (
    has(
      'not logged in',
      'unauthorized',
      'authentication',
      'invalid api key',
      'invalid x-api-key',
    ) ||
    (has('login') && has('please run', 'run `claude', 'sign in')) ||
    m.includes('401')
  ) {
    return 'Claude isn’t authenticated. Run `claude login` (or `/login` in Claude Code) and try again.';
  }
  if (has('usage limit', 'quota')) {
    return 'You’ve hit your Claude usage limit. Wait for it to reset, or switch to a lower tier.';
  }
  if (has('rate limit', 'rate_limit', 'too many requests') || m.includes('429')) {
    return 'Claude is rate-limiting requests. Wait a few seconds and retry.';
  }
  if (has('overloaded') || m.includes('529')) {
    return 'Claude’s API is overloaded right now. Retry in a moment.';
  }
  if (
    has('prompt is too long', 'context length', 'maximum context', 'too many tokens') ||
    (has('context') && has('exceed'))
  ) {
    return 'The conversation is too long for the model’s context window. Start a fresh session with /new, or trim history.';
  }
  if (
    (has('model') && has('not found', 'invalid', 'unknown', 'does not exist')) ||
    has('invalid model')
  ) {
    return 'The configured model was rejected by the CLI. Check your `model` setting.';
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
    return `Network error reaching Claude${code ? ` (${code.toUpperCase()})` : ''}. Check your connection and retry.`;
  }
  return null;
}

/**
 * Map a single stream-json line from the CLI into an Aurora event, or null to
 * ignore it.
 */
function parseEvent(line) {
  line = line.trim();
  if (!line) return null;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return null;
  }

  switch (e.type) {
    case 'stream_event': {
      const ev = e.event || {};
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        return { type: 'delta', text: ev.delta.text || '' };
      }
      if (ev.type === 'content_block_start') {
        const block = ev.content_block || {};
        if (block.type === 'tool_use' || block.type === 'server_tool_use') {
          return { type: 'status', text: toolStatus(block) };
        }
      }
      return null;
    }
    case 'result':
      return {
        type: 'done',
        text: typeof e.result === 'string' ? e.result : '',
        costUsd: typeof e.total_cost_usd === 'number' ? e.total_cost_usd : null,
        isError: !!e.is_error,
        sessionId: e.session_id || null,
      };
    default:
      return null;
  }
}

function toolStatus(block) {
  const name = block.name || block.type || 'tool';
  const pretty = {
    WebSearch: 'searching the web',
    WebFetch: 'fetching a page',
    web_search: 'searching the web',
    Read: 'reading a file',
    Glob: 'finding files',
    Grep: 'searching files',
  };
  return pretty[name] || `using ${name}`;
}
