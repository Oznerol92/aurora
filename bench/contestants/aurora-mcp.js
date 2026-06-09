#!/usr/bin/env node
// Reference MCP contestant: "Aurora-as-MCP calling Claude".
//
// The first concrete contestant for the bench's agent track (see
// docs/design/mcp-contestants.md). It exposes the single contract tool —
// answer(prompt) -> { text, model_used?, usage? } — over newline-delimited
// JSON-RPC 2.0 on stdio, with no SDK dependency (mirrors bench/mcp/client.js).
//
// It is deliberately STATEFUL: each call is appended to a `calls.log` in its state
// dir (AURORA_CONTESTANT_STATE, set by the isolation harness to a scratch/snapshot
// dir). That gives the harness a real wrapper state to seed, snapshot, and restore —
// and lets the isolation test prove a scribbling contestant can't change the next
// run's input. The answer itself comes from the local `claude` CLI (subscription
// auth), matching how Aurora answers.
//
// Run standalone for a manual check:
//   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node bench/contestants/aurora-mcp.js

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = process.env.AURORA_CONTESTANT_STATE || process.cwd();
const MODEL = process.env.AURORA_CONTESTANT_MODEL || 'sonnet';

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

/** Append the (truncated) prompt to the wrapper's call log — its persistent state. */
function recordCall(prompt) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(
      join(STATE_DIR, 'calls.log'),
      String(prompt).slice(0, 120).replace(/\n/g, ' ') + '\n',
    );
  } catch {
    /* state logging is best-effort; never break the answer */
  }
}

/** One tool-free `claude -p` call. Resolves to { text, model_used, usage }. */
function callClaude(prompt) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', prompt, '--model', MODEL, '--output-format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve({ text: '', error: 'claude spawn failed' }));
    child.on('close', (code) => {
      if (code !== 0) return resolve({ text: '', error: `claude exit ${code}` });
      try {
        const j = JSON.parse(out);
        const u = j.usage || {};
        resolve({
          text: j.result ?? j.text ?? '',
          model_used: j.model || MODEL,
          usage: {
            tokens_in: u.input_tokens ?? null,
            tokens_out: u.output_tokens ?? null,
            cost_usd: j.total_cost_usd ?? null,
          },
        });
      } catch {
        resolve({ text: '', error: 'claude output parse failed' });
      }
    });
  });
}

const TOOL = {
  name: 'answer',
  description: 'Answer a single prompt. Returns the text plus optional model/usage provenance.',
  inputSchema: {
    type: 'object',
    properties: { prompt: { type: 'string' } },
    required: ['prompt'],
  },
};

async function handle(msg) {
  const { id, method, params } = msg;
  if (id == null) return; // notification (e.g. notifications/initialized) — no reply

  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'aurora-mcp-contestant', version: '0' },
      },
    });
  }
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
  }
  if (method === 'tools/call' && params?.name === 'answer') {
    const prompt = params?.arguments?.prompt ?? '';
    recordCall(prompt);
    const r = await callClaude(prompt);
    if (r.error) {
      return send({
        jsonrpc: '2.0',
        id,
        result: { isError: true, content: [{ type: 'text', text: r.error }] },
      });
    }
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: r.text }],
        structuredContent: { text: r.text, model_used: r.model_used, usage: r.usage },
      },
    });
  }
  // Unknown method → JSON-RPC "method not found".
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
}

let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
