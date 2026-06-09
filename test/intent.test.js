// Intent gate — Phase 1 (docs/design/intent-gate.md). A skill auto-fires only when
// the user is REQUESTING the task, not discussing it or naming the machinery.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoFireSkill, referencesSkill, intentIsDiscuss } from '../src/skills/intent.js';
import { selectSkill } from '../src/skills/corpus.js';

const writeArticle = {
  id: 'write-article',
  title: 'Write an article',
  when_to_use: 'write a method or experience article',
  tags: [],
};

// The actual 2026-06-09 misfire: a message ABOUT the skill, which used to fire it.
const MISFIRE =
  "it's weird it's using write article skill when I'm not writing an article, " +
  'maybe we need research skill so it uses that one when digging into code?';

test('shouldAutoFireSkill: a genuine task request is allowed', () => {
  assert.equal(shouldAutoFireSkill('write a method article about caching', writeArticle), true);
  assert.equal(
    shouldAutoFireSkill('draft an experience piece on our migration', writeArticle),
    true,
  );
});

test('shouldAutoFireSkill: a message about the skill machinery is suppressed', () => {
  assert.equal(shouldAutoFireSkill(MISFIRE, writeArticle), false);
  assert.equal(shouldAutoFireSkill('the write-article skill keeps firing', writeArticle), false);
  assert.equal(shouldAutoFireSkill('why is this skill triggering?', writeArticle), false);
  assert.equal(shouldAutoFireSkill('/skill use write-article', writeArticle), false);
});

test('shouldAutoFireSkill: a brainstorm / question is suppressed', () => {
  assert.equal(shouldAutoFireSkill('should we write an article about X?', writeArticle), false);
  assert.equal(
    shouldAutoFireSkill('maybe we write something on caching, wdyt?', writeArticle),
    false,
  );
});

test('referencesSkill distinguishes machinery from a "skills" topic', () => {
  assert.equal(referencesSkill('using the write article skill', writeArticle), true);
  assert.equal(referencesSkill('the skill misfired', writeArticle), true);
  // "skills" as a plain topic must NOT count as a machinery reference.
  assert.equal(referencesSkill('write an article about negotiation skills', writeArticle), false);
  assert.equal(referencesSkill('write an article about caching', writeArticle), false);
});

test('intentIsDiscuss catches questions and musings, not commands', () => {
  assert.equal(intentIsDiscuss('should we do X?'), true);
  assert.equal(intentIsDiscuss('maybe we need Y'), true);
  assert.equal(intentIsDiscuss('write the article now'), false);
});

test('selectSkill: the gate (not the scorer) suppresses a discussed skill', () => {
  // Same message clears the score either way; only the gate changes the outcome.
  assert.equal(selectSkill([writeArticle], MISFIRE, { gate: false })?.id, 'write-article');
  assert.equal(selectSkill([writeArticle], MISFIRE), null); // gated off

  // A real request still selects it.
  assert.equal(
    selectSkill([writeArticle], 'write a method article about caching strategies')?.id,
    'write-article',
  );
});
