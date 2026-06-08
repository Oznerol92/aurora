import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicDigest,
  summarizeWork,
  composeBriefing,
  briefingDigestForUser,
  formatWhen,
} from '../src/engines/briefing.js';

const CONV = [
  { role: 'user', text: 'Help me design a cross-engine handoff briefing.' },
  {
    role: 'assistant',
    text: 'Sure — here is a plan.\n\n```aurora:done\n{"summary":"Drafted the briefing data model","actions":[]}\n```',
  },
  { role: 'user', text: 'Now build slice 1.' },
];

test('deterministicDigest reports topic, exchange count, and the last recap', () => {
  const d = deterministicDigest(CONV);
  assert.match(d, /Topic: Help me design a cross-engine handoff briefing\./);
  assert.match(d, /Exchanges so far: 2/);
  assert.match(d, /Last recap: Drafted the briefing data model/);
});

test('deterministicDigest falls back to the latest request when there is no recap', () => {
  const d = deterministicDigest([
    { role: 'user', text: 'What is Aurora?' },
    { role: 'assistant', text: 'A terminal research assistant.' },
    { role: 'user', text: 'Add a Codex engine.' },
  ]);
  assert.match(d, /Most recent request: Add a Codex engine\./);
});

test('deterministicDigest is empty for an empty conversation', () => {
  assert.equal(deterministicDigest([]), '');
  assert.equal(deterministicDigest(null), '');
});

test('summarizeWork returns the model gist when the call succeeds', async () => {
  let seenPrompt = null;
  const runClaude = async (prompt) => {
    seenPrompt = prompt;
    return 'Designed the ledger + briefing; slice 1 is being built.';
  };
  const out = await summarizeWork(CONV, { runClaude });
  assert.equal(out, 'Designed the ledger + briefing; slice 1 is being built.');
  assert.match(seenPrompt, /handoff\s+briefing/i, 'prompt frames a handoff for the next engine');
  assert.doesNotMatch(
    seenPrompt,
    /aurora:done/,
    'protocol blocks are stripped from the transcript',
  );
});

test('summarizeWork degrades to the deterministic digest when the model fails', async () => {
  const out = await summarizeWork(CONV, { runClaude: async () => null });
  assert.match(out, /Topic: Help me design/, 'fell back to the no-LLM digest');
  assert.match(out, /Last recap: Drafted the briefing data model/);
});

test('summarizeWork degrades to the digest when the model throws', async () => {
  const out = await summarizeWork(CONV, {
    runClaude: async () => {
      throw new Error('boom');
    },
  });
  assert.match(out, /Exchanges so far: 2/);
});

test('summarizeWork returns empty for an empty conversation (no model call)', async () => {
  let called = false;
  const out = await summarizeWork([], {
    runClaude: async () => {
      called = true;
      return 'x';
    },
  });
  assert.equal(out, '');
  assert.equal(called, false);
});

test('composeBriefing: first visit frames a fresh-to-project takeover', () => {
  const b = composeBriefing({ engineId: 'codex', isFirst: true, summary: 'Work in progress.' });
  assert.match(b, /HANDOFF BRIEFING/);
  assert.match(b, /the codex engine/);
  assert.match(b, /first time you've worked in this project/);
  assert.match(b, /Work so far in the current conversation:/);
  assert.match(b, /Work in progress\./);
  assert.match(b, /do not greet the user as if starting fresh/);
});

test('composeBriefing: returning engine cites when and what it last worked on', () => {
  const b = composeBriefing({
    engineId: 'claude',
    isFirst: false,
    lastRecord: {
      lastActiveAt: '2026-06-08T10:00:00Z',
      lastSessionId: 'abcdef12-0000',
      lastTitle: 'the handoff design',
    },
    summary: '',
  });
  assert.match(b, /taking this conversation back over/);
  assert.match(b, /2026-06-08 10:00 UTC/);
  assert.match(b, /session abcdef12/);
  assert.match(b, /"the handoff design"/);
  assert.doesNotMatch(b, /Work so far/, 'no work section when the summary is empty');
});

test('formatWhen renders an ISO timestamp compactly, and tolerates junk', () => {
  assert.equal(formatWhen('2026-06-08T14:03:21Z'), '2026-06-08 14:03 UTC');
  assert.equal(formatWhen(''), 'an earlier session');
  assert.equal(formatWhen('not-a-date'), 'not-a-date');
});

test('briefingDigestForUser summarizes the handoff for the terminal', () => {
  const lines = briefingDigestForUser({
    fromId: 'claude',
    toId: 'codex',
    isFirst: true,
    summary: 'Built the ledger.\nThen the briefing.',
    hasStore: true,
  });
  assert.match(lines[0], /Handoff: claude → codex/);
  assert.ok(lines.some((l) => /first time/.test(l)));
  assert.ok(lines.some((l) => /Briefed with: Built the ledger\./.test(l)));
});

test('briefingDigestForUser flags the stateless case', () => {
  const lines = briefingDigestForUser({ fromId: 'claude', toId: 'codex', hasStore: false });
  assert.ok(lines.some((l) => /in-memory only/.test(l)));
});
