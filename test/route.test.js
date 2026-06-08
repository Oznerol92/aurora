import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTurnEngine } from '../src/route.js';

const ENGINES = ['claude', 'codex'];

test('@worker prefix routes to that engine and strips the prefix', () => {
  const r = resolveTurnEngine('@codex refactor this loop', { engines: ENGINES, current: 'claude' });
  assert.equal(r.engineId, 'codex');
  assert.equal(r.message, 'refactor this loop');
  assert.equal(r.source, 'override');
});

test('@worker is case-insensitive and tolerates extra spaces', () => {
  const r = resolveTurnEngine('@CODEX   do it', { engines: ENGINES, current: 'claude' });
  assert.equal(r.engineId, 'codex');
  assert.equal(r.message, 'do it');
});

test('an @name that is not a known engine is left untouched (just text)', () => {
  const r = resolveTurnEngine('@dave can you review this', { engines: ENGINES, current: 'claude' });
  assert.equal(r.engineId, 'claude', 'stays on the interface');
  assert.equal(r.message, '@dave can you review this', 'prefix NOT stripped');
  assert.equal(r.source, 'current');
});

test("a fired skill's engine routes when there is no @worker override", () => {
  const r = resolveTurnEngine('write me an article', {
    skill: { id: 'write-article', engine: 'codex' },
    engines: ENGINES,
    current: 'claude',
  });
  assert.equal(r.engineId, 'codex');
  assert.equal(r.source, 'skill');
  assert.equal(r.message, 'write me an article');
});

test('@worker beats a skill engine', () => {
  const r = resolveTurnEngine('@claude write me an article', {
    skill: { id: 'write-article', engine: 'codex' },
    engines: ENGINES,
    current: 'claude',
  });
  assert.equal(r.engineId, 'claude');
  assert.equal(r.source, 'override');
});

test('a skill engine that is not a known engine is ignored', () => {
  const r = resolveTurnEngine('hello', {
    skill: { engine: 'gemini' }, // planned, not implemented
    engines: ENGINES,
    current: 'claude',
  });
  assert.equal(r.engineId, 'claude');
  assert.equal(r.source, 'current');
});

test('with no signals, the turn stays on the current interface engine', () => {
  const r = resolveTurnEngine('just a normal message', { engines: ENGINES, current: 'codex' });
  assert.equal(r.engineId, 'codex');
  assert.equal(r.source, 'current');
  assert.equal(r.message, 'just a normal message');
});
