import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * config.js reads AURORA_CONFIG_DIR at import time, so each test that needs an
 * isolated config dir imports the module fresh with a cache-busting query.
 */
async function freshConfig(dir) {
  process.env.AURORA_CONFIG_DIR = dir;
  return import(`../src/config.js?dir=${encodeURIComponent(dir)}`);
}

function tmpConfigDir() {
  return mkdtempSync(join(tmpdir(), 'aurora-cfg-'));
}

test('redactConfig masks secret keys but keeps structure', async () => {
  const dir = tmpConfigDir();
  try {
    const { redactConfig } = await freshConfig(dir);
    const cfg = {
      provider: 'claude',
      notify: { telegram: { enabled: true, botToken: 'super-secret', chatId: '123' } },
    };
    const out = redactConfig(cfg);
    assert.equal(out.provider, 'claude');
    assert.equal(out.notify.telegram.enabled, true);
    assert.equal(out.notify.telegram.botToken, '«set»');
    assert.equal(out.notify.telegram.chatId, '«set»');
    // Original is untouched (redact returns a copy).
    assert.equal(cfg.notify.telegram.botToken, 'super-secret');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty/false secret is not masked (nothing to hide)', async () => {
  const dir = tmpConfigDir();
  try {
    const { redactConfig } = await freshConfig(dir);
    const out = redactConfig({ notify: { telegram: { botToken: '' } } });
    assert.equal(out.notify.telegram.botToken, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig returns defaults when no file exists', async () => {
  const dir = tmpConfigDir();
  try {
    const { loadConfig } = await freshConfig(dir);
    const cfg = loadConfig();
    assert.equal(cfg.provider, 'claude');
    assert.equal(cfg.store, 'none');
    assert.equal(cfg.notify.telegram.enabled, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveConfig then loadConfig round-trips and deep-merges defaults', async () => {
  const dir = tmpConfigDir();
  try {
    const { loadConfig, saveConfig, configPath } = await freshConfig(dir);
    saveConfig({ model: 'claude-sonnet-4-6', notify: { telegram: { enabled: true } } });
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.equal(written.model, 'claude-sonnet-4-6');

    const cfg = loadConfig();
    assert.equal(cfg.model, 'claude-sonnet-4-6');
    assert.equal(cfg.notify.telegram.enabled, true);
    // A default nested key the saved object never mentioned survives the merge.
    assert.equal(cfg.provider, 'claude');
    assert.equal(cfg.notify.telegram.notifyOnDone, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
