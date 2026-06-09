// Minimal MCP stdio client — just enough to drive a contestant's one `answer` tool.
//
// MCP is JSON-RPC 2.0 over stdio: each message is a single line of JSON terminated
// by a newline (no Content-Length framing in the stdio transport). We implement
// only the slice the benchmark needs — the `initialize` handshake, the
// `notifications/initialized` ack, and a single `tools/call` — so a contestant can
// enter the bench without us taking on the full MCP SDK as a dependency. The rest
// of the project shells out rather than vendoring SDKs; this matches that.
//
// A contestant is any process that speaks this protocol and exposes:
//   answer(prompt: string) -> { text, model_used?, usage? }
// returned either as MCP `structuredContent` or as a single text content block.

import { spawn } from 'node:child_process';

const PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * A live MCP stdio session. `start()` spawns the server; `initialize()` does the
 * handshake; `answer()` drives the one tool; `stop()` tears the process down.
 * Newline-delimited JSON-RPC, one pending map keyed by request id.
 */
export class McpStdioClient {
  constructor({ command, args = [], env, cwd } = {}) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.child = null;
    this.buf = '';
    this.nextId = 1;
    this.pending = new Map(); // id -> { resolve, reject, timer }
    this.stderr = '';
    this.exited = null; // set to an Error once the child is gone
  }

  start() {
    this.child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.env,
      cwd: this.cwd,
    });
    this.child.stdout.on('data', (d) => this.#onData(d));
    this.child.stderr.on('data', (d) => (this.stderr += d));
    const die = (why) => {
      this.exited = new Error(why);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(this.exited);
      }
      this.pending.clear();
    };
    this.child.on('error', (e) => die(`contestant spawn failed: ${e.message}`));
    this.child.on('close', (code) =>
      die(
        `contestant exited (code ${code})${this.stderr ? `: ${this.stderr.trim().slice(0, 200)}` : ''}`,
      ),
    );
  }

  #onData(chunk) {
    this.buf += chunk;
    let nl;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // ignore non-JSON noise on stdout
      }
      if (msg.id == null) continue; // a notification from the server — nothing to await
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || 'JSON-RPC error'));
      else p.resolve(msg.result);
    }
  }

  request(method, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this.exited) return Promise.reject(this.exited);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.#write({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method, params) {
    this.#write({ jsonrpc: '2.0', method, params });
  }

  #write(obj) {
    try {
      this.child.stdin.write(JSON.stringify(obj) + '\n');
    } catch {
      /* the close handler rejects pending requests */
    }
  }

  async initialize(timeoutMs) {
    await this.request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'aurora-bench', version: '0' },
      },
      timeoutMs,
    );
    this.notify('notifications/initialized', {});
  }

  /** Call the one contestant tool. Returns { text, model_used?, usage? }. */
  async answer(prompt, timeoutMs) {
    const result = await this.request(
      'tools/call',
      { name: 'answer', arguments: { prompt } },
      timeoutMs,
    );
    if (result?.isError) {
      const m = (result.content || []).map((b) => b?.text).join(' ');
      throw new Error(`contestant answer() returned an error: ${m || 'unknown'}`);
    }
    return normalizeAnswer(result);
  }

  stop() {
    try {
      this.child?.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

/**
 * Map an MCP tool result onto the contract. Prefer `structuredContent` (a typed
 * { text, model_used?, usage? }); fall back to joining text content blocks for a
 * contestant that only returns prose.
 */
export function normalizeAnswer(result) {
  const sc = result?.structuredContent;
  if (sc && typeof sc.text === 'string') {
    return { text: sc.text, model_used: sc.model_used, usage: sc.usage };
  }
  const text = (result?.content || [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text)
    .join('');
  return { text, model_used: undefined, usage: undefined };
}

/**
 * One-shot convenience: start → initialize → answer → stop. Never throws; resolves
 * to { ok, text?, model_used?, usage?, error?, latency_ms } so the bench adapter
 * can treat a dead contestant exactly like any other failed call.
 */
export async function runMcpAnswer({ command, args, env, cwd, prompt, timeoutMs } = {}) {
  const client = new McpStdioClient({ command, args, env, cwd });
  const started = Date.now();
  try {
    client.start();
    await client.initialize(timeoutMs);
    const a = await client.answer(prompt, timeoutMs);
    return { ok: true, ...a, latency_ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), latency_ms: Date.now() - started };
  } finally {
    client.stop();
  }
}
