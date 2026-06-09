// Turn mode — intent gate Phase 2 (docs/design/intent-gate.md). PLAN is the resting
// state; ACT is a bounded, per-turn excursion decided from the session mode + message.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnIsAct, modeFraming, isTurnMode, TURN_MODES } from '../src/turnmode.js';
import { classifyIntent, intentIsAction } from '../src/skills/intent.js';

test('classifyIntent: act / discuss / ambiguous', () => {
  assert.equal(classifyIntent('fix the paste bug'), 'act');
  assert.equal(classifyIntent('please add a previewEngine flag'), 'act');
  assert.equal(classifyIntent('should we fix the paste bug?'), 'discuss'); // question wins
  assert.equal(classifyIntent('maybe we add a flag, wdyt?'), 'discuss');
  assert.equal(classifyIntent('the paste thing'), 'ambiguous'); // neither → ambiguous
  assert.equal(classifyIntent(''), 'discuss');
});

test('intentIsAction matches leading imperatives and go-aheads, not questions', () => {
  assert.equal(intentIsAction('implement the gate'), true);
  assert.equal(intentIsAction('go ahead and ship it'), true);
  assert.equal(intentIsAction('what about implementing the gate?'), false);
});

test('turnIsAct: plan mode never auto-acts; /go always acts', () => {
  assert.equal(turnIsAct('plan', 'fix the bug'), false); // forced discuss
  assert.equal(turnIsAct('plan', 'fix the bug', { forceGo: true }), true); // /go overrides
  assert.equal(turnIsAct('auto', 'fix the bug', { forceGo: true }), true);
});

test('turnIsAct: auto acts on a clear request, rests at PLAN otherwise', () => {
  assert.equal(turnIsAct('auto', 'add the flag now'), true);
  assert.equal(turnIsAct('auto', 'should we add the flag?'), false); // discuss
  assert.equal(turnIsAct('auto', 'the flag thing'), false); // ambiguous → PLAN
});

test('modeFraming reflects the mode and bakes in the consent rule', () => {
  assert.match(modeFraming(true), /ACT/);
  assert.match(modeFraming(false), /PLAN/);
  // PLAN framing must carry the "dismissed question is not consent" rule.
  assert.match(modeFraming(false), /not consent/i);
});

test('mode validation', () => {
  assert.deepEqual(TURN_MODES, ['auto', 'plan']);
  assert.equal(isTurnMode('auto'), true);
  assert.equal(isTurnMode('plan'), true);
  assert.equal(isTurnMode('act'), false);
  assert.equal(isTurnMode(undefined), false);
});
