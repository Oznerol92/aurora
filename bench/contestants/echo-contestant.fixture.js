#!/usr/bin/env node
// Test fixture MCP contestant — deterministic and OFFLINE (no `claude`, no network).
//
// Used by test/mcp-contestant.test.js to exercise the MCP client and the isolation
// harness without depending on a model. It answers with a fixed transform of the
// prompt and appends the prompt to `calls.log` in its state dir, so the isolation
// test can prove (a) the round-trip works and (b) a scribbling contestant cannot
// leak state into the next run.
//
// It lives under bench/ (NOT test/) on purpose: `node --test` auto-runs every file
// under a test/ directory, and this is a stdin-driven server that would hang the
// suite if treated as a test file.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = process.env.AURORA_CONTESTANT_STATE || process.cwd();

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function scribble(prompt) {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(join(STATE_DIR, 'calls.log'), String(prompt).replace(/\n/g, ' ') + '\n');
}

function answerFor(prompt) {
  // Deterministic: echo a marker plus the first integer found (or "echo").
  const m = String(prompt).match(/\d+/);
  return `FINAL: ${m ? m[0] : 'echo'}`;
}

function handle(msg) {
  const { id, method, params } = msg;
  if (id == null) return;
  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'echo-contestant', version: '0' },
      },
    });
  }
  if (method === 'tools/call' && params?.name === 'answer') {
    const prompt = params?.arguments?.prompt ?? '';
    scribble(prompt);
    const text = answerFor(prompt);
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text }],
        structuredContent: {
          text,
          model_used: 'fixture',
          usage: { tokens_in: 1, tokens_out: 1, cost_usd: 0 },
        },
      },
    });
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
}

let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) {
      try {
        handle(JSON.parse(line));
      } catch {
        /* ignore */
      }
    }
  }
});
process.stdin.on('end', () => process.exit(0));
