import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodexProvider, mapCodexLine, explainCodexExit } from '../src/providers/codex.js';

const SAMPLE_CARDS = [
  {
    id: 'voice-core',
    type: 'voice',
    title: 'Core voice',
    tags: ['voice', 'draft'],
    body: 'DISTINCTIVE-CARD-BODY about hooks and numbers.',
    priority: 1,
  },
];

test('a fresh provider has no thread and builds args without resume', () => {
  const p = new CodexProvider();
  assert.equal(p.started, false);
  assert.equal(p.threadId, null);
  const args = p.buildArgs();
  assert.ok(args.includes('exec') && args.includes('--json'));
  assert.ok(args.includes('-s') && args.includes('read-only'), 'read-only sandbox');
  assert.ok(args.includes('tools.web_search=true'), 'web search on for research parity');
  assert.ok(!args.includes('resume'), 'no resume on a fresh thread');
  assert.equal(args[args.length - 1], '-', 'prompt is read from stdin');
});

test('the model command targets codexModel, not the shared Claude model field', () => {
  assert.equal(new CodexProvider().modelKey(), 'codexModel');
});

test('resume() reattaches so the next turn uses `resume <id>`', () => {
  const p = new CodexProvider();
  const ok = p.resume('019ea7d0-d650-7900-b2f1-fbc0e2f2986f');
  assert.equal(ok, true);
  assert.equal(p.started, true);
  const args = p.buildArgs();
  const i = args.indexOf('resume');
  assert.ok(i !== -1, 'resume subcommand present');
  assert.equal(args[i + 1], '019ea7d0-d650-7900-b2f1-fbc0e2f2986f');
});

test('resume(falsy) is a no-op that reports failure', () => {
  const p = new CodexProvider();
  assert.equal(p.resume(''), false);
  assert.equal(p.started, false);
});

test('reset() drops the thread so a brand-new conversation starts', () => {
  const p = new CodexProvider();
  p.resume('abc');
  p.reset();
  assert.equal(p.started, false);
  assert.equal(p.threadId, null);
});

test('the Aurora identity + brain index are prepended on a fresh thread', () => {
  const p = new CodexProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setPersona('USER VOICE PROFILE BODY');
  const prompt = p.buildPrompt('draft something');
  assert.match(prompt, /You are Aurora/, 'base persona prepended');
  assert.match(prompt, /INTERACTION PROTOCOL/, 'protocol prepended');
  assert.match(prompt, /USER VOICE PROFILE BODY/, 'voice profile prepended');
  assert.match(prompt, /AURORA METHOD BRAIN/, 'always-on brain index prepended');
  assert.match(prompt, /voice-core/, 'index lists each card');
  assert.match(prompt, /draft something/, 'the user message is included');
});

test('a resumed turn injects no system prompt (Codex restores its own context)', () => {
  const p = new CodexProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setPersona('USER VOICE PROFILE BODY');
  p.resume('019ea7d0-d650-7900-b2f1-fbc0e2f2986f');
  const prompt = p.buildPrompt('next message');
  assert.doesNotMatch(prompt, /You are Aurora/);
  assert.doesNotMatch(prompt, /AURORA METHOD BRAIN/);
  assert.match(prompt, /next message/);
});

test('brain/persona survive reset() (config-level, not per-session)', () => {
  const p = new CodexProvider();
  p.setBrainCards(SAMPLE_CARDS);
  p.setPersona('USER VOICE PROFILE BODY');
  p.reset();
  const prompt = p.buildPrompt('x');
  assert.match(prompt, /AURORA METHOD BRAIN/);
  assert.match(prompt, /USER VOICE PROFILE BODY/);
});

test('setBriefing is prepended on a fresh thread and cleared by reset()', () => {
  const p = new CodexProvider();
  p.setBriefing('HANDOFF BRIEFING — claude handing over. Work so far: built the ledger.');
  let prompt = p.buildPrompt('continue');
  assert.match(prompt, /HANDOFF BRIEFING/, 'briefing prepended on a fresh thread');
  assert.match(prompt, /built the ledger/);
  p.reset();
  prompt = p.buildPrompt('x');
  assert.doesNotMatch(prompt, /HANDOFF BRIEFING/, '/new clears the briefing');
});

test('seed() primes a fresh thread but not a resumed one', () => {
  const p = new CodexProvider();
  const ok = p.seed([
    { role: 'user', text: 'earlier question' },
    { role: 'assistant', text: 'earlier answer' },
  ]);
  assert.equal(ok, true);
  assert.match(p.buildPrompt('go on'), /TRANSCRIPT START/, 'seed preamble on a fresh thread');
  p.resume('abc');
  assert.doesNotMatch(p.buildPrompt('go on'), /TRANSCRIPT START/, 'not on a resumed thread');
});

test('a codex-specific model is forwarded with -m; otherwise the CLI default is used', () => {
  assert.ok(!new CodexProvider().buildArgs().includes('-m'), 'no -m by default');
  const p = new CodexProvider({ codexModel: 'gpt-5-codex' });
  const args = p.buildArgs();
  const i = args.indexOf('-m');
  assert.ok(i !== -1 && args[i + 1] === 'gpt-5-codex');
  assert.match(p.describe(), /Codex.*gpt-5-codex/);
});

test('shortSession reflects the learned thread id', () => {
  const p = new CodexProvider();
  assert.equal(p.shortSession(), null);
  p.resume('019ea7d0-d650-7900-b2f1-fbc0e2f2986f');
  assert.equal(p.shortSession(), '019ea7d0');
});

test('abort() is safe to call when nothing is running', () => {
  const p = new CodexProvider();
  assert.equal(p.abort(), false);
});

// --- the JSONL event mapper (verified against real `codex exec --json` output) ---

test('mapCodexLine maps the real Codex event stream', () => {
  assert.deepEqual(
    mapCodexLine('{"type":"thread.started","thread_id":"019ea7d0-d650-7900-b2f1-fbc0e2f2986f"}'),
    { kind: 'thread', threadId: '019ea7d0-d650-7900-b2f1-fbc0e2f2986f' },
  );
  assert.deepEqual(
    mapCodexLine(
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"BANANA"}}',
    ),
    { kind: 'text', text: 'BANANA' },
  );
  assert.deepEqual(
    mapCodexLine('{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}'),
    { kind: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
  );
});

test('mapCodexLine surfaces tool activity as status and ignores partial/empty lines', () => {
  const s = mapCodexLine('{"type":"item.completed","item":{"type":"web_search_call"}}');
  assert.equal(s.kind, 'status');
  assert.match(s.text, /searching the web/);
  // A streamed (not completed) agent_message is ignored so text isn't double-counted.
  assert.equal(
    mapCodexLine('{"type":"item.started","item":{"type":"agent_message","text":"part"}}'),
    null,
  );
  assert.equal(mapCodexLine(''), null);
  assert.equal(mapCodexLine('not json'), null);
});

test('mapCodexLine reports a turn failure as an error kind', () => {
  const e = mapCodexLine('{"type":"turn.failed","error":{"message":"rate_limit exceeded"}}');
  assert.equal(e.kind, 'error');
  assert.match(e.message, /rate_limit/);
});

test('explainCodexExit leads with an actionable cause for known failures', () => {
  assert.match(explainCodexExit(1, 'Error: Not logged in'), /authenticated.*codex login/i);
  assert.match(explainCodexExit(1, 'insufficient_quota'), /quota/i);
  assert.match(explainCodexExit(1, 'HTTP 429: rate limit'), /rate-limit/i);
  assert.match(explainCodexExit(1, 'model "gpt-x" not found'), /model was rejected/i);
  assert.match(explainCodexExit(1, 'request failed: ECONNRESET'), /Network error.*ECONNRESET/i);
  // A streamed error wins over stderr, and no output gets a clear hint.
  assert.match(explainCodexExit(1, '', 'overloaded'), /overloaded/i);
  assert.match(explainCodexExit(137, ''), /no output|crashed or been killed/i);
});
