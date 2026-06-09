// MCP contestant — Phase 2 vertical slice (see docs/design/mcp-contestants.md).
//
// Proves the four properties the slice rests on, all offline (a deterministic
// fixture server, no `claude`, no network):
//   1. round-trip — the bench client drives a contestant's one answer() tool;
//   2. env scrubbing — only allowlisted vars reach the contestant; keys are dropped;
//   3. no cross-run drift — the seed is byte-for-byte untouched and a scribbling
//      contestant cannot leak state into the next run (ephemeral + snapshot/restore);
//   4. manifest routing — a kind:"mcp" entry resolves to the mcp adapter and is
//      reported available only when it declares a command.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runMcpAnswer } from '../bench/mcp/client.js';
import {
  makeEnv,
  hashTree,
  withEphemeralState,
  withSnapshotState,
} from '../bench/mcp/isolation.js';
import { availability, adapterKey, runMcpContestant } from '../bench/reasoning.js';

const FIXTURE = fileURLToPath(
  new URL('../bench/contestants/echo-contestant.fixture.js', import.meta.url),
);

/** Run the fixture once against an isolated state dir; report what it saw + wrote. */
function runFixture(seedDir, prompt) {
  return withEphemeralState({ seedDir }, async (stateDir) => {
    const pre = readdirSync(stateDir).sort();
    const res = await runMcpAnswer({
      command: 'node',
      args: [FIXTURE],
      env: { PATH: process.env.PATH, AURORA_CONTESTANT_STATE: stateDir },
      cwd: stateDir,
      prompt,
    });
    const log = existsSync(join(stateDir, 'calls.log'))
      ? readFileSync(join(stateDir, 'calls.log'), 'utf8').trim()
      : '';
    return { pre, res, logLines: log ? log.split('\n').length : 0 };
  });
}

test('client drives the contestant answer() tool and maps the result shape', async () => {
  const { res } = await runFixture(null, 'what is 42?');
  assert.ok(res.ok, res.error);
  assert.match(res.text, /FINAL: 42/);
  assert.equal(res.model_used, 'fixture');
  assert.equal(res.usage.cost_usd, 0); // runMcpAnswer returns the raw usage block
  assert.ok(typeof res.latency_ms === 'number');
});

test('makeEnv passes only allowlisted vars — Aurora keys are scrubbed', () => {
  const parent = {
    PATH: '/bin',
    ANTHROPIC_API_KEY: 'secret',
    THEIR_API_KEY: 'theirs',
    RANDOM: 'x',
  };
  const base = makeEnv([], parent);
  assert.equal(base.PATH, '/bin'); // infrastructure var kept
  assert.equal(base.ANTHROPIC_API_KEY, undefined); // secret dropped
  assert.equal(base.RANDOM, undefined); // unrelated var dropped

  const allowed = makeEnv(['THEIR_API_KEY'], parent);
  assert.equal(allowed.THEIR_API_KEY, 'theirs'); // explicitly allowed → passed
  assert.equal(allowed.ANTHROPIC_API_KEY, undefined); // still never Aurora's key
});

test('ephemeral state: seed untouched and no scribble leaks into the next run', async () => {
  const seedDir = mkdtempSync(join(tmpdir(), 'aurora-seed-'));
  writeFileSync(join(seedDir, 'seed.txt'), 'baseline\n');
  try {
    const before = hashTree(seedDir);
    const r1 = await runFixture(seedDir, 'first 7');
    const r2 = await runFixture(seedDir, 'second 9');

    assert.ok(r1.res.ok && r2.res.ok);
    // The seed the contestant never receives is byte-for-byte unchanged.
    assert.equal(hashTree(seedDir), before);
    // Each run starts from exactly the seed — no calls.log carried over.
    assert.deepEqual(r1.pre, ['seed.txt']);
    assert.deepEqual(r2.pre, ['seed.txt']);
    // Each run logged exactly its own single call (no accumulation across runs).
    assert.equal(r1.logLines, 1);
    assert.equal(r2.logLines, 1);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
  }
});

test('persistent state: snapshot → run → restore is byte-for-byte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-persist-'));
  writeFileSync(join(dir, 'memory.json'), 'v1');
  try {
    const before = hashTree(dir);
    const { out, after } = await withSnapshotState(dir, async (sd) => {
      appendFileSync(join(sd, 'memory.json'), '-mutated'); // contestant drifts its memory
      writeFileSync(join(sd, 'stray.txt'), 'junk'); // …and drops a stray file
      return 'ran';
    });
    assert.equal(out, 'ran');
    assert.equal(after, before); // restored to the exact pre-run bytes
    assert.equal(readFileSync(join(dir, 'memory.json'), 'utf8'), 'v1'); // mutation undone
    assert.ok(!existsSync(join(dir, 'stray.txt'))); // stray file removed
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mcp adapter flattens the contestant result into the bench shape', async () => {
  // The adapter wraps the client in the ephemeral harness and maps usage → the flat
  // { cost_usd, tokens_in, tokens_out } shape the grader/report already consume.
  const cfg = {
    kind: 'mcp',
    command: 'node',
    args: [FIXTURE],
    env_allow: [], // fixture needs no keys
    state: { mode: 'ephemeral' },
  };
  const res = await runMcpContestant(cfg, 'system', 'what is 7?');
  assert.ok(res.ok, res.error);
  assert.match(res.text, /FINAL: 7/);
  assert.equal(res.cost_usd, 0);
  assert.equal(res.tokens_in, 1);
  assert.equal(res.tokens_out, 1);
  assert.equal(res.model_used, 'fixture');
});

test('manifest: kind:"mcp" routes to the mcp adapter and needs a command', () => {
  assert.equal(adapterKey({ kind: 'mcp', command: 'node' }), 'mcp');
  assert.equal(adapterKey({ adapter: 'claude-cli' }), 'claude-cli');

  assert.deepEqual(availability({ kind: 'mcp', command: 'node' }), { ok: true });
  assert.equal(availability({ kind: 'mcp' }).ok, false); // no command declared
  assert.equal(availability({ adapter: 'claude-cli' }).ok, true);
});
