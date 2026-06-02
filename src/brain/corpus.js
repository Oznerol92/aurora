import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Aurora "brain": a small, curated corpus of method knowledge stored as
 * Markdown "cards" under the repo-root `brain/` directory. Each card carries
 * flat frontmatter (id, type, lang, title, tags, source, priority) and a short
 * distilled body. No YAML dependency — the frontmatter is deliberately flat.
 *
 * How a card reaches the model (see the provider):
 *   - buildBrainIndex() lists every card (id · type · title · tags) in a compact,
 *     always-on block injected on a fresh session, so the model knows the whole
 *     brain exists.
 *   - selectRelevantCards() scores cards against the user's message and
 *     formatTurnBrain() injects the full text of the top matches into THAT turn,
 *     so the relevant method is in context on every turn — fresh or resumed.
 * `priority` no longer gates whether a card is used (it once gated the legacy
 * buildBrainDigest); it now only breaks ranking ties, lowest first.
 */

const DEFAULT_DIGEST_MAX_CHARS = 6000;

/** Where the brain lives: AURORA_BRAIN_DIR, else <repoRoot>/brain. */
export function defaultBrainDir() {
  if (process.env.AURORA_BRAIN_DIR) return process.env.AURORA_BRAIN_DIR;
  // This file is src/brain/corpus.js, so the repo root is two levels up.
  return fileURLToPath(new URL('../../brain', import.meta.url));
}

/** Parse one card: flat frontmatter between `---` fences, then the body. */
export function parseCard(raw, path = '') {
  const text = String(raw).replace(/^\uFEFF/, '');
  const card = {
    id: '',
    type: 'rule',
    lang: 'any',
    title: '',
    tags: [],
    source: '',
    priority: 2,
  };
  let body = text.trim();

  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  if (m) {
    body = m[2].trim();
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
      if (!kv) continue;
      const key = kv[1];
      const val = kv[2].trim();
      if (key === 'tags') {
        card.tags = parseList(val);
      } else if (key === 'priority') {
        const n = parseInt(val, 10);
        if (Number.isFinite(n)) card.priority = n;
      } else if (key in card) {
        card[key] = stripQuotes(val);
      }
    }
  }
  // Fall back to the filename (minus .md) when no id is declared.
  if (!card.id && path) card.id = path.replace(/.*[/\\]/, '').replace(/\.md$/i, '');
  return { ...card, body, path };
}

function parseList(val) {
  let v = val.trim();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  return v
    .split(',')
    .map((s) => stripQuotes(s.trim()))
    .filter(Boolean);
}

function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

/** Recursively load every `.md` card under dir. Returns [] when dir is absent. */
export function loadBrainCards(dir = defaultBrainDir()) {
  if (!dir || !existsSync(dir)) return [];
  const out = [];
  walk(dir, out);
  // Stable, deterministic order: by priority, then id.
  out.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return out;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      try {
        out.push(parseCard(readFileSync(full, 'utf8'), full));
      } catch {
        // Skip an unreadable card rather than failing the whole load.
      }
    }
  }
}

/**
 * Build the always-on digest from the core (priority ≤ maxPriority) cards,
 * bounded by maxChars. Cards are added whole until the next one would overflow
 * the budget; at least one card is always included if any qualify.
 */
export function buildBrainDigest(
  cards,
  { maxChars = DEFAULT_DIGEST_MAX_CHARS, maxPriority = 1 } = {},
) {
  const selected = (cards || []).filter((c) => c.priority <= maxPriority);
  if (!selected.length) return '';
  const header = 'AURORA METHOD BRAIN — write and research by these rules and structures.';
  const blocks = [];
  let used = header.length;
  for (const c of selected) {
    const block = `## ${c.title}\n${c.body}`;
    if (used + block.length + 2 > maxChars && blocks.length) break;
    blocks.push(block);
    used += block.length + 2;
  }
  return [header, ...blocks].join('\n\n');
}

/**
 * A compact, always-on index of every card — one line each — so a fresh session
 * knows the whole brain exists. The full text of the cards most relevant to a
 * given message is injected per-turn (selectRelevantCards + formatTurnBrain),
 * keeping this block small while every card stays reachable.
 */
export function buildBrainIndex(cards) {
  const list = (cards || []).filter((c) => c && c.id);
  if (!list.length) return '';
  const header =
    'AURORA METHOD BRAIN — index of method cards; follow these rules and structures. ' +
    'The full text of the cards most relevant to each message is added to that turn ' +
    'automatically; rely on them when they apply.';
  const lines = list.map((c) => {
    const tags = c.tags?.length ? ` — tags: ${c.tags.join(', ')}` : '';
    return `- ${c.id} (${c.type}): ${c.title}${tags}`;
  });
  return [header, ...lines].join('\n');
}

// Grammatical noise dropped before matching — kept deliberately small so domain
// words ("research", "voice", "anonymous") are never discarded.
const STOPWORDS = new Set(
  (
    'the a an and or but to of in on for with how do does i my me is are was were it this that ' +
    'what when which should could can will would you your yours about as at by be been being so ' +
    'if then than into out up down not no yes here there from have has had get got use using'
  ).split(' '),
);

/** Lowercase a string into meaningful tokens (≥3 chars, no stopwords). */
function tokenizeWords(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Length of the common prefix of two strings. */
function commonPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Fuzzy word match tolerant of plurals/inflections: exact, prefix, or a shared
 * 5+ char prefix (so "anonymous" matches "anonymity", "research" "researching").
 */
function wordMatch(token, w) {
  if (w === token) return true;
  if (token.length >= 4 && w.startsWith(token)) return true;
  if (w.length >= 4 && token.startsWith(w)) return true;
  return commonPrefix(token, w) >= 5;
}

function anyMatch(token, words) {
  for (const w of words) if (wordMatch(token, w)) return true;
  return false;
}

/**
 * Rank cards by relevance to a free-text query. Deterministic and offline: each
 * query token scores against a card's tags (×3), title (×2), and body (×1).
 * Returns the top `max` cards scoring at least `minScore`, ties broken by
 * priority (lowest first) then id. An empty/again-stopword query returns [].
 */
export function selectRelevantCards(cards, query, { max = 3, minScore = 1 } = {}) {
  const list = (cards || []).filter(Boolean);
  const tokens = [...new Set(tokenizeWords(query))];
  if (!list.length || !tokens.length) return [];
  const scored = list.map((c) => {
    const tagW = tokenizeWords((c.tags || []).join(' '));
    const titleW = tokenizeWords(c.title);
    const bodyW = tokenizeWords(c.body);
    let score = 0;
    for (const t of tokens) {
      if (anyMatch(t, tagW)) score += 3;
      if (anyMatch(t, titleW)) score += 2;
      if (anyMatch(t, bodyW)) score += 1;
    }
    return { card: c, score };
  });
  return scored
    .filter((s) => s.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.card.priority - b.card.priority ||
        String(a.card.id).localeCompare(String(b.card.id)),
    )
    .slice(0, max)
    .map((s) => s.card);
}

/**
 * Render selected cards as the per-turn guidance block prepended to the user's
 * message. Returns '' when there's nothing to inject.
 */
export function formatTurnBrain(cards) {
  const list = (cards || []).filter((c) => c && c.body);
  if (!list.length) return '';
  const blocks = list.map((c) => `## ${c.title}\n${c.body}`);
  return [
    '[Aurora method — relevant guidance for this turn; apply it, do not quote these tags back]',
    ...blocks,
    '[end method guidance]',
  ].join('\n\n');
}

export { DEFAULT_DIGEST_MAX_CHARS };
