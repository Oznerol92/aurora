import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotenv } from '../src/env.js';

/** Run `fn` with a throwaway .env file and a clean slate of the given keys. */
function withEnvFile(contents, keys, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-env-'));
  const path = join(dir, '.env');
  writeFileSync(path, contents, 'utf8');
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    return fn(path);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

test('loads simple KEY=value pairs', () => {
  withEnvFile('FOO=bar\nBAZ=qux\n', ['FOO', 'BAZ'], (path) => {
    loadDotenv(path);
    assert.equal(process.env.FOO, 'bar');
    assert.equal(process.env.BAZ, 'qux');
  });
});

test('strips matching surrounding quotes', () => {
  withEnvFile(`A="double"\nB='single'\n`, ['A', 'B'], (path) => {
    loadDotenv(path);
    assert.equal(process.env.A, 'double');
    assert.equal(process.env.B, 'single');
  });
});

test('skips comments and blank lines', () => {
  withEnvFile('# a comment\n\nKEEP=1\n', ['KEEP'], (path) => {
    loadDotenv(path);
    assert.equal(process.env.KEEP, '1');
  });
});

test('the real environment always wins over .env', () => {
  withEnvFile('WINNER=from_file\n', ['WINNER'], (path) => {
    process.env.WINNER = 'from_env';
    loadDotenv(path);
    assert.equal(process.env.WINNER, 'from_env');
  });
});

test('a missing .env file is a no-op, not a crash', () => {
  assert.doesNotThrow(() => loadDotenv(join(tmpdir(), 'definitely-does-not-exist-aurora')));
});

test('lines without an = are ignored', () => {
  withEnvFile('NOTAKEY\nGOOD=yes\n', ['GOOD'], (path) => {
    loadDotenv(path);
    assert.equal(process.env.GOOD, 'yes');
  });
});
