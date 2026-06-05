import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFinal,
  normalize,
  firstNumber,
  gradeOne,
  summarize,
} from '../bench/reasoning-grade.js';

test('extractFinal prefers the last FINAL marker', () => {
  assert.equal(extractFinal('reasoning...\nFINAL: 17'), '17');
  assert.equal(extractFinal('Final answer: friday'), 'friday');
  assert.equal(extractFinal('**FINAL:** 42'), '42');
  // a stray "final" in prose then a real one later → take the later
  assert.equal(extractFinal('this is my final reasoning\nFINAL ANSWER - 30'), '30');
});

test('extractFinal falls back to the last non-empty line when no marker', () => {
  assert.equal(extractFinal('step one\nstep two\n80'), '80');
  assert.equal(extractFinal(''), '');
});

test('firstNumber pulls a signed decimal', () => {
  assert.equal(firstNumber('about 10080 minutes'), 10080);
  assert.equal(firstNumber('$17.00 total'), 17);
  assert.equal(firstNumber('no digits here'), null);
});

test('normalize strips currency, commas, markup and trailing punctuation', () => {
  assert.equal(normalize('$1,234.'), '1234');
  assert.equal(normalize('  Friday!  '), 'friday');
  assert.equal(normalize('**Apples**'), 'apples');
});

test('gradeOne matches numbers regardless of surrounding prose', () => {
  const q = { type: 'number', answer: '17' };
  assert.equal(gradeOne('FINAL: 17', q).correct, true);
  assert.equal(gradeOne('FINAL: $17.00', q).correct, true);
  assert.equal(gradeOne('FINAL: the total is 17 dollars', q).correct, true);
  assert.equal(gradeOne('FINAL: 27', q).correct, false);
});

test('gradeOne matches text via normalized equality or word boundary', () => {
  const q = { type: 'text', answer: 'friday' };
  assert.equal(gradeOne('FINAL: Friday', q).correct, true);
  assert.equal(gradeOne('FINAL: It will be Friday.', q).correct, true);
  assert.equal(gradeOne('FINAL: Thursday', q).correct, false);
});

test('gradeOne honors accept aliases', () => {
  const q = { type: 'text', answer: 'apples', accept: ['apple'] };
  assert.equal(gradeOne('FINAL: apple', q).correct, true);
  assert.equal(gradeOne('FINAL: oranges', q).correct, false);
});

test('gradeOne surfaces the extracted answer for the report', () => {
  const r = gradeOne('FINAL: 42', { type: 'number', answer: '42' });
  assert.deepEqual(r, { correct: true, extracted: '42', expected: '42' });
});

test('summarize computes accuracy, totals and per-category breakdown', () => {
  const records = [
    {
      ok: true,
      correct: true,
      category: 'arithmetic',
      tokens_in: 100,
      tokens_out: 200,
      latency_ms: 1000,
      cost_usd: 0.001,
    },
    {
      ok: true,
      correct: false,
      category: 'arithmetic',
      tokens_in: 100,
      tokens_out: 200,
      latency_ms: 3000,
      cost_usd: 0.001,
    },
    {
      ok: true,
      correct: true,
      category: 'logic',
      tokens_in: 50,
      tokens_out: 100,
      latency_ms: 2000,
      cost_usd: 0.0005,
    },
  ];
  const s = summarize(records);
  assert.equal(s.n, 3);
  assert.equal(s.correct, 2);
  assert.equal(s.accuracy, 2 / 3);
  assert.equal(s.tokens_in, 250);
  assert.equal(s.tokens_out, 500);
  assert.equal(s.avg_latency_ms, 2000);
  assert.ok(Math.abs(s.total_cost_usd - 0.0025) < 1e-9);
  assert.equal(s.perCategory.arithmetic.accuracy, 0.5);
  assert.equal(s.perCategory.logic.accuracy, 1);
});

test('summarize never credits an errored run as correct', () => {
  const records = [
    {
      ok: false,
      correct: false,
      category: 'logic',
      tokens_in: 0,
      tokens_out: 0,
      latency_ms: 0,
      cost_usd: 0,
    },
    {
      ok: true,
      correct: true,
      category: 'logic',
      tokens_in: 10,
      tokens_out: 10,
      latency_ms: 100,
      cost_usd: 0,
    },
  ];
  const s = summarize(records);
  assert.equal(s.correct, 1);
  assert.equal(s.accuracy, 0.5);
});
