import { scoreCards } from './corpus.js';

/**
 * Graph retrieval for the method brain.
 *
 * The flat keyword scorer (corpus.scoreCards) only finds cards whose own text
 * matches the message. But the method is a web of connected rules: writing an
 * article should also pull the voice rules, the anti-hype rule, and the quality
 * gate — even when the message never says "voice" or "quality". So we model the
 * brain as a graph and let a keyword match "spread" to the rules it's linked to.
 *
 * Nodes are cards. Edges come from two sources:
 *   - explicit: a card's `related: [id, …]` frontmatter (typed, undirected,
 *     strong) — for connections tags don't capture.
 *   - implicit: shared tags between two cards (weighted by how many), so the
 *     graph is useful out of the box without hand-authoring every edge.
 *
 * Retrieval is deterministic spreading activation: score the seeds by keyword,
 * then propagate a decayed fraction of each seed's score to its neighbours over
 * a couple of hops. A card surfaces if it matched directly OR collected enough
 * activation from its neighbours. No embeddings, no network — same offline,
 * reproducible character as the rest of the brain.
 */

const RELATED_EDGE_WEIGHT = 1.0; // an authored `related:` link
const TAG_EDGE_WEIGHT = 0.4; // per shared tag
const TAG_EDGE_CAP = 0.8; // ceiling for tag-only edges (< an explicit link)

const DEFAULT_HOPS = 2;
const DEFAULT_DECAY = 0.5; // fraction of score passed along each hop
const DEFAULT_MAX = 4;
const MIN_PROPAGATED = 1.5; // activation a non-matching card needs to surface

/**
 * Build the card graph: { nodes: Map<id,card>, edges: Map<id, Map<id,weight>> }.
 * Edges are undirected (stored both ways); the strongest weight wins when an
 * explicit and a tag edge coincide.
 */
export function buildBrainGraph(cards) {
  const nodes = new Map();
  for (const c of cards || []) if (c && c.id) nodes.set(c.id, c);
  const edges = new Map();

  const addEdge = (a, b, w) => {
    if (a === b || !nodes.has(a) || !nodes.has(b)) return;
    if (!edges.has(a)) edges.set(a, new Map());
    const m = edges.get(a);
    m.set(b, Math.max(m.get(b) || 0, w));
  };
  const link = (a, b, w) => {
    addEdge(a, b, w);
    addEdge(b, a, w);
  };

  const list = [...nodes.values()];
  for (const c of list) {
    for (const r of c.related || []) link(c.id, r, RELATED_EDGE_WEIGHT);
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const shared = sharedTagCount(list[i].tags, list[j].tags);
      if (shared > 0)
        link(list[i].id, list[j].id, Math.min(TAG_EDGE_CAP, shared * TAG_EDGE_WEIGHT));
    }
  }
  return { nodes, edges };
}

/** How many tags two cards share (case-insensitive). */
function sharedTagCount(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a.map((t) => String(t).toLowerCase()));
  let n = 0;
  for (const t of b) if (set.has(String(t).toLowerCase())) n++;
  return n;
}

/**
 * Graph-aware card retrieval. Scores seeds by keyword (scoreCards), spreads the
 * activation over the graph, and returns the top `max` cards by total activation.
 * Returns [] when nothing matches directly (same as the flat scorer), so an
 * unrelated message injects no brain. Pass a prebuilt `graph` to avoid rebuilding
 * it every turn.
 */
export function selectRelevantCardsGraph(
  cards,
  query,
  { max = DEFAULT_MAX, minScore = 1, hops = DEFAULT_HOPS, decay = DEFAULT_DECAY, graph } = {},
) {
  const list = (cards || []).filter(Boolean);
  if (!list.length) return [];
  const g = graph || buildBrainGraph(list);

  const direct = new Map();
  for (const { card, score } of scoreCards(list, query)) {
    if (score > 0) direct.set(card.id, score);
  }
  if (!direct.size) return []; // nothing relevant — inject nothing

  // Spreading activation: total starts at the direct scores; each hop pushes a
  // decayed share of the current frontier's scores along edges.
  const total = new Map(direct);
  let frontier = new Map(direct);
  for (let h = 0; h < hops; h++) {
    const next = new Map();
    for (const [id, score] of frontier) {
      const nbrs = g.edges.get(id);
      if (!nbrs) continue;
      for (const [to, w] of nbrs) {
        const add = score * decay * w;
        if (add > 0) next.set(to, (next.get(to) || 0) + add);
      }
    }
    for (const [id, add] of next) total.set(id, (total.get(id) || 0) + add);
    frontier = next;
  }

  // A card is a candidate if it matched directly (≥ minScore) or collected enough
  // activation from its neighbours (≥ MIN_PROPAGATED).
  const candidates = [];
  for (const [id, score] of total) {
    const d = direct.get(id) || 0;
    if (d >= minScore || score - d >= MIN_PROPAGATED) {
      candidates.push({ card: g.nodes.get(id), score });
    }
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      (a.card.priority ?? 2) - (b.card.priority ?? 2) ||
      String(a.card.id).localeCompare(String(b.card.id)),
  );
  return candidates.slice(0, max).map((c) => c.card);
}

export { DEFAULT_HOPS, DEFAULT_DECAY, MIN_PROPAGATED };
