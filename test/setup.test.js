import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSqliteAvailable, resolveStoreChoice, shouldRunSetup } from '../src/setup.js';

test('resolveStoreChoice maps numbered options when SQLite is available', () => {
  assert.equal(resolveStoreChoice('1', true), 'sqlite');
  assert.equal(resolveStoreChoice('2', true), 'json');
  assert.equal(resolveStoreChoice('3', true), 'none');
  assert.equal(resolveStoreChoice('', true), 'none'); // default
});

test('resolveStoreChoice renumbers options when SQLite is missing', () => {
  assert.equal(resolveStoreChoice('1', false), 'json');
  assert.equal(resolveStoreChoice('2', false), 'none');
  assert.equal(resolveStoreChoice('', false), 'none');
});

test('resolveStoreChoice accepts word answers regardless of numbering', () => {
  assert.equal(resolveStoreChoice('sqlite', true), 'sqlite');
  assert.equal(resolveStoreChoice('JSON', false), 'json');
  assert.equal(resolveStoreChoice('no', true), 'none');
  assert.equal(resolveStoreChoice('none', false), 'none');
});

test('shouldRunSetup only fires for an interactive, un-set-up REPL', () => {
  const fresh = { store: 'none', setupDone: false };
  assert.equal(shouldRunSetup(fresh, { isServe: false, isTty: true }), true);
  // already answered
  assert.equal(
    shouldRunSetup({ store: 'none', setupDone: true }, { isServe: false, isTty: true }),
    false,
  );
  // store already chosen
  assert.equal(
    shouldRunSetup({ store: 'json', setupDone: false }, { isServe: false, isTty: true }),
    false,
  );
  // server mode
  assert.equal(shouldRunSetup(fresh, { isServe: true, isTty: true }), false);
  // non-interactive (piped)
  assert.equal(shouldRunSetup(fresh, { isServe: false, isTty: false }), false);
});

test('isSqliteAvailable returns a boolean without throwing', () => {
  assert.equal(typeof isSqliteAvailable(), 'boolean');
});
