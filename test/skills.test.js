import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkill, loadSkills, selectSkill, compileSkill } from '../src/skills/corpus.js';

const BRAIN = [
  { id: 'voice-core', title: 'Core voice', body: 'VOICE-RULES write tight.' },
  { id: 'quality-gate', title: 'Quality gate', body: 'GATE-RULES no hype.' },
  { id: 'article-skeleton', title: 'Article skeleton', body: 'SKELETON hook → close.' },
];

const WRITE_SKILL = `---
id: write-article
title: Write an article
when_to_use: write or draft an article or blog post
tags: [article, blog]
brain: [voice-core, quality-gate]
template: article-skeleton
engine: codex
asks: Topic? | Audience?
---
1. Plan. 2. Execute. 3. Verify against the gate.`;

test('parseSkill reads frontmatter, lists, pipe-delimited asks, and body', () => {
  const s = parseSkill(WRITE_SKILL, '/x/write-article.md');
  assert.equal(s.id, 'write-article');
  assert.equal(s.title, 'Write an article');
  assert.deepEqual(s.brain, ['voice-core', 'quality-gate']);
  assert.deepEqual(s.tags, ['article', 'blog']);
  assert.equal(s.template, 'article-skeleton');
  assert.equal(s.engine, 'codex', 'optional engine: field parsed for routing');
  assert.deepEqual(s.asks, ['Topic?', 'Audience?']);
  assert.match(s.body, /Plan\. 2\. Execute/);
});

test('parseSkill falls back to the filename for id and uses id as title', () => {
  const s = parseSkill('no frontmatter here', '/x/summarize.md');
  assert.equal(s.id, 'summarize');
  assert.equal(s.title, 'summarize');
  assert.equal(s.body, 'no frontmatter here');
});

test('loadSkills reads a dir, and a later dir overrides by id', () => {
  const a = mkdtempSync(join(tmpdir(), 'sk-a-'));
  const b = mkdtempSync(join(tmpdir(), 'sk-b-'));
  try {
    writeFileSync(join(a, 'write-article.md'), WRITE_SKILL);
    writeFileSync(join(a, 'other.md'), '---\nid: other\ntitle: Other\n---\nbody');
    writeFileSync(join(b, 'write-article.md'), '---\nid: write-article\ntitle: Override\n---\nb');
    const skills = loadSkills([a, b]);
    assert.equal(skills.length, 2, 'deduped by id across dirs');
    assert.equal(skills.find((s) => s.id === 'write-article').title, 'Override', 'later dir wins');
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('selectSkill matches a clear trigger and ignores weak/unrelated messages', () => {
  const skills = [parseSkill(WRITE_SKILL)];
  assert.equal(selectSkill(skills, 'help me write a blog article about X')?.id, 'write-article');
  assert.equal(selectSkill(skills, 'what time is it in Tokyo?'), null, 'no match below threshold');
  assert.equal(selectSkill([], 'write an article'), null, 'empty corpus');
});

test('compileSkill inlines the named brain rules, the template, asks, and the procedure', () => {
  const skill = parseSkill(WRITE_SKILL);
  const block = compileSkill(skill, BRAIN);
  assert.match(block, /Aurora skill: Write an article/);
  assert.match(block, /VOICE-RULES/, 'named brain card body included');
  assert.match(block, /GATE-RULES/, 'quality-gate body included');
  assert.match(block, /SKELETON/, 'template body included');
  assert.match(block, /aurora:ask/, 'asks routed through the ask protocol');
  assert.match(block, /Topic\?/);
  assert.match(block, /Execute/, 'the procedure body is present');
  assert.match(block, /VERIFY before finishing/);
});

test('compileSkill skips brain ids it cannot resolve, without throwing', () => {
  const skill = parseSkill('---\nid: s\nbrain: [missing-card]\n---\ndo the thing');
  const block = compileSkill(skill, BRAIN);
  assert.match(block, /do the thing/);
  assert.doesNotMatch(block, /missing-card/);
});

test('the built-in write-article skill loads and triggers on a writing request', () => {
  const skills = loadSkills(); // real dirs, incl. the shipped skills/
  const wa = skills.find((s) => s.id === 'write-article');
  assert.ok(wa, 'write-article ships as a built-in');
  assert.equal(selectSkill(skills, 'draft an article about my workflow')?.id, 'write-article');
});

test('parseSkill reads the optional category field; absent → empty (grouped as general)', () => {
  const withCat = parseSkill('---\nid: s\ncategory: dev\n---\nbody');
  assert.equal(withCat.category, 'dev');
  const without = parseSkill('---\nid: s\n---\nbody');
  assert.equal(without.category, '');
});

test('the built-in roadmap skill loads with category dev', () => {
  const skills = loadSkills();
  const rm = skills.find((s) => s.id === 'roadmap');
  assert.ok(rm, 'roadmap ships as a built-in');
  assert.equal(rm.category, 'dev');
});
