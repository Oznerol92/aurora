import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE } from '../src/template.js';

test('TEMPLATE is a non-trivial string', () => {
  assert.equal(typeof TEMPLATE, 'string');
  assert.ok(TEMPLATE.length > 500);
});

test('TEMPLATE documents all six modules', () => {
  for (let n = 1; n <= 6; n++) {
    assert.match(TEMPLATE, new RegExp(`MODULE ${n}`), `expected MODULE ${n} in template`);
  }
});

test('TEMPLATE tells the user how to re-show it', () => {
  assert.match(TEMPLATE, /\/template/);
});
