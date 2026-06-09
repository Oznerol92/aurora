// Stateless per-engine one-shot summarizers + the previewEngine routing that makes
// the recap/briefing gist engine-agnostic (src/notify/once.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runClaudeOnce } from '../src/notify/preview.js';
import { runCodexOnce, resolveOnceRunner, resolvePreviewRunner } from '../src/notify/once.js';

test('resolveOnceRunner maps engine id → its stateless runner (claude fallback)', () => {
  assert.equal(resolveOnceRunner('codex', { codexModel: 'gpt-5-codex' }).runOnce, runCodexOnce);
  assert.equal(resolveOnceRunner('codex', { codexModel: 'gpt-5-codex' }).model, 'gpt-5-codex');
  assert.equal(resolveOnceRunner('claude').runOnce, runClaudeOnce);
  assert.equal(resolveOnceRunner('something-else').runOnce, runClaudeOnce); // unknown → claude
});

test('resolvePreviewRunner: default keeps the free claude CLI', () => {
  const { runClaude, model } = resolvePreviewRunner({}, 'codex');
  assert.equal(runClaude, runClaudeOnce);
  assert.equal(model, 'sonnet');
});

test('resolvePreviewRunner: active routes through the live engine', () => {
  const config = { notify: { telegram: { previewEngine: 'active' } }, codexModel: 'gpt-5-codex' };
  const { runClaude, model } = resolvePreviewRunner(config, 'codex');
  assert.equal(runClaude, runCodexOnce);
  assert.equal(model, 'gpt-5-codex');
});

test('resolvePreviewRunner: active on claude stays on the claude runner', () => {
  const config = { notify: { telegram: { previewEngine: 'active' } } };
  const { runClaude } = resolvePreviewRunner(config, 'claude');
  assert.equal(runClaude, runClaudeOnce); // engineId 'claude' is never "another engine"
});

test('resolvePreviewRunner: previewModel overrides the claude model', () => {
  const config = { notify: { telegram: { previewModel: 'haiku' } } };
  assert.equal(resolvePreviewRunner(config, 'claude').model, 'haiku');
});

test('runCodexOnce parses codex JSONL into the final assistant text', async () => {
  // A temp executable that emits codex-exec-style JSONL and ignores its args/stdin,
  // so we exercise the real spawn + mapCodexLine wiring without the codex CLI.
  const dir = mkdtempSync(join(tmpdir(), 'aurora-codex-once-'));
  const bin = join(dir, 'fake-codex.js');
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env node',
      `console.log(JSON.stringify({ type: 'thread.started', thread_id: 't1' }));`,
      `console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'one-line gist' } }));`,
      `console.log(JSON.stringify({ type: 'turn.completed', usage: {} }));`,
    ].join('\n') + '\n',
  );
  chmodSync(bin, 0o755);
  try {
    const text = await runCodexOnce('summarise this', null, bin);
    assert.equal(text, 'one-line gist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runCodexOnce returns null when the binary is missing (best-effort)', async () => {
  const text = await runCodexOnce('x', null, '/nonexistent/codex-binary-xyz');
  assert.equal(text, null);
});
