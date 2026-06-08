import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRelevantCards } from '../brain/corpus.js';

/**
 * Aurora "skills": executable method cards.
 *
 * A brain card is passive context a model reads; a skill is a PLAN the model
 * RUNS. Each skill names the brain rules to load, an optional template to fill,
 * the clarifying questions to ask, and a plan → execute → verify procedure. When
 * a user's message clearly matches a skill's trigger, Aurora compiles the skill
 * into an instruction block and prepends it to that turn — so Aurora orients
 * itself ("this is a writing task; load these rules, follow these steps, verify
 * against the quality gate") instead of free-forming.
 *
 * Format — a Markdown file with flat frontmatter (no YAML dep), then the body:
 *   id           stable id (defaults to the filename)
 *   title        human label
 *   when_to_use  trigger phrase, matched against the user's message
 *   tags         extra match terms (comma/bracket list)
 *   brain        brain card ids to load in full (comma/space list)
 *   template     a brain card id whose body is the structure to fill (optional)
 *   asks         clarifying questions to raise if unknown (comma list, optional)
 *   <body>       the procedure: plan → execute → verify
 *
 * Skills load from these dirs, later overriding earlier BY id, so a user can
 * shadow or extend a built-in by dropping a file with the same id:
 *   <repoRoot>/skills        built-ins shipped with Aurora (or AURORA_SKILLS_DIR)
 *   ~/.config/aurora/skills  user-global (honours AURORA_CONFIG_DIR)
 *   ./.aurora/skills         project-local
 */

// Only inject a skill on a clear match — skills reshape the whole turn, so a
// weak keyword overlap shouldn't hijack it. Tuned against the pseudo-card scorer
// below (trigger terms are weighted ×3 as tags + ×1 as body).
const SKILL_MIN_SCORE = 6;

/** The built-in skills dir: AURORA_SKILLS_DIR, else <repoRoot>/skills. */
export function defaultSkillsDir() {
  if (process.env.AURORA_SKILLS_DIR) return process.env.AURORA_SKILLS_DIR;
  // This file is src/skills/corpus.js, so the repo root is two levels up.
  return fileURLToPath(new URL('../../skills', import.meta.url));
}

function configSkillsDir() {
  const base = process.env.AURORA_CONFIG_DIR || join(homedir(), '.config', 'aurora');
  return join(base, 'skills');
}

/** Every skills dir, in increasing-precedence order (later wins by id). */
export function skillDirs() {
  return [defaultSkillsDir(), configSkillsDir(), join(process.cwd(), '.aurora', 'skills')];
}

/** Parse one skill: flat `key: value` frontmatter between `---` fences, then body. */
export function parseSkill(raw, path = '') {
  const text = String(raw).replace(/^\uFEFF/, '');
  const skill = {
    id: '',
    title: '',
    when_to_use: '',
    tags: [],
    brain: [],
    template: '',
    asks: [],
    engine: '', // optional: pin this skill's task to a worker engine (see route.js)
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
      if (key === 'tags' || key === 'brain') {
        skill[key] = parseList(val);
      } else if (key === 'asks') {
        // Questions can contain commas; split on '|' first, else fall back to ','.
        skill.asks = (val.includes('|') ? val.split('|') : splitList(val))
          .map((s) => stripQuotes(s.trim()))
          .filter(Boolean);
      } else if (key in skill) {
        skill[key] = stripQuotes(val);
      }
    }
  }
  if (!skill.id && path) skill.id = path.replace(/.*[/\\]/, '').replace(/\.md$/i, '');
  if (!skill.title) skill.title = skill.id;
  return { ...skill, body, path };
}

function parseList(val) {
  let v = val.trim();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  return splitList(v)
    .map((s) => stripQuotes(s.trim()))
    .filter(Boolean);
}

function splitList(v) {
  return v.split(/[,\s]+/).filter(Boolean);
}

function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

/** Load every `.md` skill across the skill dirs, later dirs overriding by id. */
export function loadSkills(dirs = skillDirs()) {
  const byId = new Map();
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      try {
        const skill = parseSkill(readFileSync(join(dir, e.name), 'utf8'), join(dir, e.name));
        if (skill.id) byId.set(skill.id, skill); // later dir wins
      } catch {
        // Skip an unreadable skill rather than failing the whole load.
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Pick the single skill whose trigger best matches a free-text message, or null
 * when nothing clears SKILL_MIN_SCORE. Reuses the brain's deterministic scorer
 * by shaping each skill as a pseudo-card (trigger terms as tags + body).
 */
export function selectSkill(skills, query, { minScore = SKILL_MIN_SCORE } = {}) {
  const list = (skills || []).filter(Boolean);
  if (!list.length) return null;
  const pseudo = list.map((s) => ({
    id: s.id,
    title: s.title,
    tags: [...(s.tags || []), ...String(s.when_to_use || '').split(/[^a-z0-9]+/i)].filter(Boolean),
    body: s.when_to_use || s.title,
    priority: 2,
  }));
  const best = selectRelevantCards(pseudo, query, { max: 1, minScore })[0];
  return best ? list.find((s) => s.id === best.id) || null : null;
}

/**
 * Compile a skill into the instruction block prepended to the turn: the named
 * brain rules in full, the template to fill, the questions to ask, and the
 * procedure — framed so the model plans, executes, then verifies. `brainCards`
 * is the loaded brain corpus (to resolve `brain`/`template` ids to bodies).
 */
export function compileSkill(skill, brainCards = []) {
  if (!skill) return '';
  const byId = new Map((brainCards || []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const lines = [
    `[Aurora skill: ${skill.title} — follow this plan for this task; don't mention the plan back]`,
  ];

  lines.push('', 'PLAN');
  const rules = (skill.brain || []).map((id) => byId.get(id)).filter(Boolean);
  if (rules.length) {
    lines.push('Apply these method rules (full text below):');
    for (const c of rules) lines.push(`\n## ${c.title}\n${c.body}`);
  }
  const tpl = skill.template ? byId.get(skill.template) : null;
  if (tpl)
    lines.push(`\nFill this structure (template "${tpl.id}"):\n## ${tpl.title}\n${tpl.body}`);
  if (skill.asks?.length) {
    lines.push(
      '\nBefore drafting, if any of these are unknown, ASK via the aurora:ask protocol (do not guess):',
      ...skill.asks.map((q) => `- ${q}`),
    );
  }

  lines.push('', 'EXECUTE', skill.body || '(follow the rules above)');

  lines.push(
    '',
    'VERIFY before finishing: check the draft against the rules above (esp. any ' +
      'quality-gate / forbidden-words rules) and revise until it passes.',
    '[end skill]',
  );
  return lines.join('\n');
}

export { SKILL_MIN_SCORE };
