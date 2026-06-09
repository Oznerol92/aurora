// Isolation harness — make every contestant invocation a hermetic function of its
// input, with no shared mutable state across contestants or across runs.
//
// The threat (see docs/design/mcp-contestants.md): the base MODEL is stateless per
// call and cannot be poisoned by a co-running contestant. The real reproducibility
// risk is a WRAPPER's persistent state — its brain/memory/DB dir — drifting between
// runs. This module isolates that state. It is the "Yes, corrupts reproducibility"
// rows of the threat table, and nothing else.
//
// Two modes:
//   ephemeral  — fresh scratch dir per run (optionally seeded from a fixture), torn
//                down after. Run N+1 starts from exactly the same bytes as run N.
//   persistent — snapshot a real state dir, run, then restore it byte-for-byte, so a
//                measured-memory wrapper stays reproducible despite mutating itself.
//
// Plus `makeEnv`: spawn a contestant with ONLY allowlisted env vars present, so
// Aurora's own keys (ANTHROPIC_API_KEY, …) are never handed to a third-party server.

import { mkdtempSync, rmSync, cpSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Infrastructure vars a spawned process legitimately needs (none is a secret).
// Everything else — crucially every API key — is dropped unless explicitly allowed.
const BASE_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot'];

/**
 * Build the env for a contestant: the infrastructure base plus ONLY the vars named
 * in `envAllow`. A contestant brings its own credentials via its allowlist; it never
 * inherits Aurora's. Returns a fresh object (never mutates `parentEnv`).
 */
export function makeEnv(envAllow = [], parentEnv = process.env) {
  const env = {};
  for (const k of BASE_ENV) if (parentEnv[k] != null) env[k] = parentEnv[k];
  for (const k of envAllow) if (parentEnv[k] != null) env[k] = parentEnv[k];
  return env;
}

/** Relative POSIX-style paths of every file under `dir`, sorted (stable order). */
function walk(dir, base = dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc.push(relative(base, p).split(sep).join('/'));
  }
  return acc.sort();
}

/**
 * Content hash of a directory tree: sorted relative paths plus file bytes. Two trees
 * with identical files in identical places hash equal regardless of walk order. The
 * isolation test uses this to assert "byte-for-byte restore" / "seed untouched".
 */
export function hashTree(dir) {
  const h = createHash('sha256');
  for (const rel of walk(dir)) {
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(join(dir, rel)));
    h.update('\0');
  }
  return h.digest('hex');
}

/**
 * Run `fn(stateDir)` against a fresh scratch dir. If `seedDir` is given, the scratch
 * starts as a byte-copy of it; the seed itself is never handed to the contestant, so
 * a contestant that scribbles in its state dir cannot mutate the seed (and therefore
 * cannot change the next run's input). The scratch dir is removed afterwards, pass or
 * fail. Returns whatever `fn` returns.
 */
export async function withEphemeralState({ seedDir = null, prefix = 'aurora-contestant-' }, fn) {
  const stateDir = mkdtempSync(join(tmpdir(), prefix));
  try {
    if (seedDir) cpSync(seedDir, stateDir, { recursive: true });
    return await fn(stateDir);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

/**
 * Run `fn(stateDir)` against a real persistent dir, then restore it to its exact
 * pre-run bytes from an aside snapshot. Returns { out, before, after } where `out`
 * is fn's result and before/after are tree hashes — equal iff the restore was exact.
 */
export async function withSnapshotState(stateDir, fn) {
  const snap = mkdtempSync(join(tmpdir(), 'aurora-snap-'));
  try {
    cpSync(stateDir, snap, { recursive: true });
    const before = hashTree(stateDir);
    const out = await fn(stateDir);
    rmSync(stateDir, { recursive: true, force: true });
    cpSync(snap, stateDir, { recursive: true });
    return { out, before, after: hashTree(stateDir) };
  } finally {
    rmSync(snap, { recursive: true, force: true });
  }
}
