import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCard,
  loadBrainCards,
  buildBrainDigest,
  buildBrainIndex,
  selectRelevantCards,
  formatTurnBrain,
} from '../src/brain/corpus.js';

test('parseCard reads flat frontmatter and body', () => {
  const raw = [
    '---',
    'id: my-card',
    'type: rule',
    'lang: en',
    'title: My Card',
    'tags: [a, b, c]',
    'priority: 1',
    '---',
    'This is the body.',
  ].join('\n');
  const card = parseCard(raw, '/x/my-card.md');
  assert.equal(card.id, 'my-card');
  assert.equal(card.type, 'rule');
  assert.equal(card.title, 'My Card');
  assert.deepEqual(card.tags, ['a', 'b', 'c']);
  assert.equal(card.priority, 1);
  assert.equal(card.body, 'This is the body.');
});

test('parseCard falls back to the filename for a missing id', () => {
  const card = parseCard('---\ntype: rule\n---\nbody', '/x/derived-id.md');
  assert.equal(card.id, 'derived-id');
});

test('parseCard degrades gracefully without frontmatter', () => {
  const card = parseCard('just a body, no fences', '/x/loose.md');
  assert.equal(card.id, 'loose');
  assert.equal(card.body, 'just a body, no fences');
  assert.equal(card.priority, 2, 'defaults to retrieval-only');
});

test('loadBrainCards reads a dir recursively, sorted by priority then id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-'));
  try {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'b.md'), '---\nid: bbb\npriority: 1\ntitle: B\n---\nbody b');
    writeFileSync(join(dir, 'sub', 'a.md'), '---\nid: aaa\npriority: 1\ntitle: A\n---\nbody a');
    writeFileSync(join(dir, 'z.md'), '---\nid: zzz\npriority: 2\ntitle: Z\n---\nbody z');
    writeFileSync(join(dir, 'notes.txt'), 'ignored, not .md');
    const cards = loadBrainCards(dir);
    assert.deepEqual(
      cards.map((c) => c.id),
      ['aaa', 'bbb', 'zzz'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBrainCards returns [] for a missing dir', () => {
  assert.deepEqual(loadBrainCards('/no/such/brain/dir/here'), []);
});

test('buildBrainDigest includes only core (priority<=1) cards and respects the budget', () => {
  const cards = [
    { id: 'core1', title: 'Core 1', body: 'x'.repeat(100), priority: 1 },
    { id: 'core2', title: 'Core 2', body: 'y'.repeat(100), priority: 1 },
    { id: 'extra', title: 'Extra', body: 'z'.repeat(100), priority: 2 },
  ];
  const digest = buildBrainDigest(cards, { maxChars: 10000 });
  assert.match(digest, /Core 1/);
  assert.match(digest, /Core 2/);
  assert.doesNotMatch(digest, /Extra/, 'priority-2 cards are excluded from the digest');
});

test('buildBrainDigest always keeps at least one card even past budget', () => {
  const cards = [{ id: 'big', title: 'Big', body: 'q'.repeat(5000), priority: 1 }];
  const digest = buildBrainDigest(cards, { maxChars: 100 });
  assert.match(digest, /Big/);
});

test('buildBrainDigest returns empty string when no core cards qualify', () => {
  assert.equal(buildBrainDigest([{ id: 'x', title: 'X', body: 'b', priority: 2 }]), '');
  assert.equal(buildBrainDigest([]), '');
});

test('the shipped brain/ corpus loads and yields a non-empty digest', () => {
  const cards = loadBrainCards();
  assert.ok(cards.length >= 5, 'ships several cards');
  assert.ok(cards.some((c) => c.id === 'article-skeleton'));
  assert.ok(buildBrainDigest(cards).includes('AURORA METHOD BRAIN'));
});

const RETRIEVAL_CARDS = [
  {
    id: 'anonymity',
    type: 'rule',
    title: 'Anonymity discipline',
    tags: ['privacy', 'anonymity'],
    body: 'keep identity out of published work',
    priority: 1,
  },
  {
    id: 'research-method',
    type: 'structure',
    title: 'The 6-module research method',
    tags: ['research', 'citations'],
    body: 'frame the request neutrally and cite primary sources',
    priority: 1,
  },
  {
    id: 'images',
    type: 'structure',
    title: 'Editorial illustration approach',
    tags: ['images', 'visual'],
    body: 'functional illustration, not decorative stock photos',
    priority: 2,
  },
];

test('buildBrainIndex lists every card with id, type, title and tags', () => {
  const idx = buildBrainIndex(RETRIEVAL_CARDS);
  assert.match(idx, /AURORA METHOD BRAIN/);
  for (const c of RETRIEVAL_CARDS) assert.ok(idx.includes(c.id) && idx.includes(c.title));
  assert.match(idx, /tags: privacy, anonymity/);
  assert.equal(buildBrainIndex([]), '');
});

test('selectRelevantCards ranks the on-topic card first', () => {
  const picked = selectRelevantCards(RETRIEVAL_CARDS, 'how do I stay anonymous when I publish?');
  assert.ok(picked.length >= 1);
  assert.equal(picked[0].id, 'anonymity', 'fuzzy-matches anonymous -> anonymity');
});

test('selectRelevantCards respects max and minScore', () => {
  const one = selectRelevantCards(RETRIEVAL_CARDS, 'research citations images privacy', { max: 1 });
  assert.equal(one.length, 1);
  const none = selectRelevantCards(RETRIEVAL_CARDS, 'research', { minScore: 100 });
  assert.equal(none.length, 0);
});

test('selectRelevantCards returns [] for an empty or stopword-only query', () => {
  assert.deepEqual(selectRelevantCards(RETRIEVAL_CARDS, ''), []);
  assert.deepEqual(selectRelevantCards(RETRIEVAL_CARDS, 'how do I'), []);
  assert.deepEqual(selectRelevantCards([], 'anything'), []);
});

test('formatTurnBrain wraps selected cards in a guidance block', () => {
  const block = formatTurnBrain([RETRIEVAL_CARDS[1]]);
  assert.match(block, /relevant guidance for this turn/);
  assert.match(block, /The 6-module research method/);
  assert.match(block, /cite primary sources/);
  assert.equal(formatTurnBrain([]), '');
});

test('the shipped corpus retrieves the right cards for a real query', () => {
  const cards = loadBrainCards();
  const picked = selectRelevantCards(cards, 'help me run serious research with citations');
  assert.ok(
    picked.some((c) => c.id === 'research-method'),
    'research query pulls the research card',
  );
});
