import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrainGraph, selectRelevantCardsGraph } from '../src/brain/graph.js';
import { loadBrainCards } from '../src/brain/corpus.js';

// A tiny synthetic corpus: "article" links explicitly to "gate"; "voice1" and
// "voice2" share a tag; "weather" is unrelated to everything.
const CARDS = [
  {
    id: 'article',
    title: 'Article skeleton',
    tags: ['article', 'writing'],
    related: ['gate'],
    body: 'open on a hook, numbered steps',
    priority: 1,
  },
  {
    id: 'gate',
    title: 'Quality gate',
    tags: ['checklist'],
    body: 'no hype; verify numbers',
    priority: 1,
  },
  { id: 'voice1', title: 'Voice core', tags: ['voice'], body: 'write tight', priority: 2 },
  {
    id: 'voice2',
    title: 'Forbidden words',
    tags: ['voice'],
    body: 'avoid game-changer',
    priority: 2,
  },
  {
    id: 'weather',
    title: 'Weather',
    tags: ['weather'],
    body: 'rain and sun in Tokyo',
    priority: 2,
  },
];

test('buildBrainGraph links explicit `related` ids and shared tags, undirected', () => {
  const g = buildBrainGraph(CARDS);
  // explicit edge article <-> gate (both directions)
  assert.ok(g.edges.get('article').has('gate'));
  assert.ok(g.edges.get('gate').has('article'));
  // explicit links are stronger than tag-only links
  assert.ok(g.edges.get('article').get('gate') > g.edges.get('voice1').get('voice2'));
  // shared-tag edge voice1 <-> voice2
  assert.ok(g.edges.get('voice1').has('voice2'));
  // weather connects to nothing
  assert.ok(!g.edges.has('weather') || g.edges.get('weather').size === 0);
});

test('graph retrieval surfaces a linked rule the query never mentions', () => {
  // "write an article" matches `article` directly; `gate` should ride in via the
  // explicit edge even though the query says nothing about quality/checklists.
  const ids = selectRelevantCardsGraph(CARDS, 'help me write an article', {
    graph: buildBrainGraph(CARDS),
  }).map((c) => c.id);
  assert.ok(ids.includes('article'), 'direct match present');
  assert.ok(ids.includes('gate'), 'linked rule pulled in by the graph');
  assert.ok(!ids.includes('weather'), 'unrelated card stays out');
});

test('an unrelated message injects nothing (same as the flat scorer)', () => {
  assert.deepEqual(selectRelevantCardsGraph(CARDS, 'stock market prices today'), []);
  assert.deepEqual(selectRelevantCardsGraph([], 'anything'), []);
});

test('results are bounded by max and ranked by total activation', () => {
  const cards = selectRelevantCardsGraph(CARDS, 'article writing voice', { max: 2 });
  assert.equal(cards.length, 2, 'respects max');
  assert.equal(cards[0].id, 'article', 'strongest (direct + propagated) ranks first');
});

test('a shared tag alone propagates between cards (voice1 → voice2)', () => {
  // Query hits voice1 by title/body; voice2 shares the `voice` tag, so it should
  // surface even with no explicit edge.
  const ids = selectRelevantCardsGraph(CARDS, 'voice core write tight').map((c) => c.id);
  assert.ok(ids.includes('voice1'));
  assert.ok(ids.includes('voice2'), 'shared-tag neighbour pulled in');
});

test('on the real corpus, an article request pulls in the quality gate via the graph', () => {
  const cards = loadBrainCards();
  const ids = selectRelevantCardsGraph(cards, 'help me write an article about my workflow').map(
    (c) => c.id,
  );
  assert.ok(ids.includes('article-skeleton'), 'direct hit');
  // article-skeleton has `related: [..., quality-gate, ...]`, so the gate rides in
  // even though "quality"/"gate" never appear in the message.
  assert.ok(ids.includes('quality-gate'), 'linked quality gate surfaced');
});
