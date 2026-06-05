import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureReason } from '../src/notify/telegram.js';

test('failureReason maps an AbortError to a timeout, not a network error', () => {
  const e = new Error('aborted');
  e.name = 'AbortError';
  assert.equal(failureReason(e), 'request timed out');
});

test('failureReason surfaces a top-level error code', () => {
  const e = new Error('connect failed');
  e.code = 'ECONNREFUSED';
  assert.equal(failureReason(e), 'network error (ECONNREFUSED)');
});

test('failureReason surfaces the cause code for a wrapped fetch failure', () => {
  // undici throws TypeError('fetch failed') with the real error on .cause
  const e = new TypeError('fetch failed');
  e.cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
  assert.equal(failureReason(e), 'network error (ENOTFOUND)');
});

test('failureReason falls back to a bare message when no code is present', () => {
  assert.equal(failureReason(new Error('mystery')), 'network error');
  assert.equal(failureReason(undefined), 'network error');
});

test('failureReason never leaks the error message (which can carry the token URL)', () => {
  const e = new TypeError('fetch failed');
  e.cause = Object.assign(
    new Error('request to https://api.telegram.org/bot123:SECRET/sendMessage failed'),
    { code: 'ECONNRESET' },
  );
  const reason = failureReason(e);
  assert.equal(reason, 'network error (ECONNRESET)');
  assert.ok(!reason.includes('SECRET'), 'token must not appear in the reason');
  assert.ok(!reason.includes('api.telegram.org'), 'URL must not appear in the reason');
});
