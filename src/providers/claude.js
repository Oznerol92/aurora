import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { Provider } from './base.js';

/**
 * Aurora's persona, appended to Claude's system prompt on the first turn of a
 * session. Kept short on purpose — the research workflow itself lives in the
 * startup template, not buried in the system prompt.
 */
const AURORA_PERSONA = [
  'You are Aurora, a research-oriented AI assistant running inside a terminal chat.',
  'You help the user run serious, well-cited research and think clearly.',
  'Favour primary sources with links and dates; when evidence is thin, say so',
  'explicitly rather than filling the gap with confident speculation.',
  'Surface contested or unsettled areas instead of papering over them.',
  'Keep prose tight. Use Markdown (headings, tables, lists, code blocks) since',
  'the terminal renders it. When a web lookup would materially improve an answer,',
  'use your web search / fetch tools.',
].join(' ');

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
  }

  reset() {
    this.sessionId = randomUUID();
    this.started = false;
  }

  /**
   * Resume a prior session: point at its id and mark it started, so the next
   * send() uses `--resume <id>` and the CLI restores that conversation's own
   * context. (Aurora's stored turns are a parallel log; Claude keeps the real
   * session state.)
   */
  resume(sessionId) {
    if (!sessionId) return false;
    this.sessionId = sessionId;
    this.started = true;
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
      args.push('--append-system-prompt', AURORA_PERSONA);
    }
    return args;
  }

  async *send(text) {
    const args = this.buildArgs(text);
    const child = spawn(this.bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

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

    while (true) {
      while (queue.length) yield queue.shift();
      if (finished) break;
      await new Promise((resolve) => {
        notify = resolve;
      });
    }
    // Drain anything that arrived between the last check and close.
    while (queue.length) yield queue.shift();

    if (spawnError) {
      if (spawnError.code === 'ENOENT') {
        throw new Error(
          `Could not find the "${this.bin}" CLI on your PATH. Install Claude Code and sign in, or set claudeBin in your config.`,
        );
      }
      throw spawnError;
    }
    if (exitCode !== 0) {
      throw new Error(`claude exited with code ${exitCode}${stderr ? `:\n${stderr.trim()}` : ''}`);
    }
  }
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
