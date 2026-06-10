import { loadBrainCards } from './brain/corpus.js';

/**
 * Persona: the user's voice/characteristics profile. It makes Aurora write as
 * the user — replicating their values and way of talking — while the CORRECTION
 * RULE keeps it realistic: fix typos and wrong words, don't polish the person
 * away. Stored one-row-per-scope in the active store (never in config.json,
 * which would put personal text on disk in the settings file).
 */

export const PERSONA_SCOPE = 'default';

/** How many chars of authentic samples to inject (storage keeps the full text). */
export const SAMPLE_INJECT_MAX = 800;

export const DEFAULT_CORRECTION =
  "Replicate the user's voice realistically, but silently fix typos, misspellings " +
  'and obviously wrong words. Do not smooth away their style or turn them into ' +
  'generic AI prose.';

/** The hyped/cliché words Aurora's voice avoids — reused across templates. */
export const HYPED_WORDS =
  'hyped/cliché words: best practices, leverage, unlock, actionable, synergy, ' +
  'game-changer, next-level, ultimate, guru, secret sauce';

/**
 * Starting voice presets offered at first run (the 4-template picker). Each is a
 * ready-to-use persona the user can fine-tune later with /persona. Listed in
 * picker order; resolvePersonaTemplate maps a picker answer to one (or null to
 * skip). All inherit DEFAULT_CORRECTION.
 */
export const PERSONA_TEMPLATES = [
  {
    id: 'aurora-method',
    label: 'Aurora method',
    blurb: 'hook+number openings, anti-patterns→solution, numbers in tables',
    fields: {
      voiceRules:
        'Hook+Number openings; Problem → 3 anti-patterns → Solution; numbers in tables not prose; ' +
        'shorter sentences in narrative, longer in analysis.',
      dontList: HYPED_WORDS,
      correction: DEFAULT_CORRECTION,
    },
  },
  {
    id: 'plain-direct',
    label: 'Plain & direct',
    blurb: 'lead with the answer, short sentences, no jargon',
    fields: {
      voiceRules:
        'Lead with the answer. Short sentences. No jargon or filler. One idea per paragraph.',
      dontList: HYPED_WORDS,
      correction: DEFAULT_CORRECTION,
    },
  },
  {
    id: 'technical-precise',
    label: 'Technical & precise',
    blurb: 'exact terms, explicit trade-offs, no marketing',
    fields: {
      voiceRules:
        'Exact terminology. Make trade-offs explicit. Reference specifics (files, commands, ' +
        'numbers). No marketing tone.',
      dontList: HYPED_WORDS,
      correction: DEFAULT_CORRECTION,
    },
  },
  {
    id: 'warm-conversational',
    label: 'Warm & conversational',
    blurb: 'first person, approachable, contractions',
    fields: {
      voiceRules:
        'First person, approachable. Use contractions. Explain as if to a colleague. ' +
        'Keep it light but accurate.',
      correction: DEFAULT_CORRECTION,
    },
  },
];

/**
 * Map a first-run picker answer to a voice template, or null to skip. A number
 * picks the Nth template; a template id/label also resolves; a blank or unknown
 * answer means skip (stay on the silent default). Mirrors resolveStoreChoice —
 * the mapping lives in one tested place.
 */
export function resolvePersonaTemplate(answer) {
  const a = String(answer || '')
    .trim()
    .toLowerCase();
  if (!a) return null;
  if (/^\d+$/.test(a)) return PERSONA_TEMPLATES[Number(a) - 1] ?? null;
  return PERSONA_TEMPLATES.find((t) => t.id === a || t.label.toLowerCase() === a) ?? null;
}

/** Known persona fields, in render order. */
export const PERSONA_FIELDS = [
  'name',
  'langPrimary',
  'values',
  'voiceRules',
  'samplePhrases',
  'doList',
  'dontList',
  'correction',
];

/** Is there any substantive content in a persona object? */
export function personaHasContent(p) {
  if (!p) return false;
  return PERSONA_FIELDS.some((f) => f !== 'correction' && String(p[f] || '').trim());
}

/**
 * Sensible defaults seeded from the brain's voice cards, so a persona is useful
 * even before the user customizes it. Pure: pass cards in (or it loads them).
 */
export function personaDefaultsFromBrain(cards = loadBrainCards()) {
  const out = { correction: DEFAULT_CORRECTION };
  const ids = new Set((cards || []).map((c) => c.id));
  if (ids.has('forbidden-words')) {
    out.dontList = HYPED_WORDS;
  }
  if (ids.has('voice-core')) {
    out.voiceRules =
      'Hook+Number openings; Problem → 3 anti-patterns → Solution; numbers in tables not prose; ' +
      'shorter sentences in narrative, longer in analysis.';
  }
  return out;
}

/** Render a persona object into the injected "USER VOICE PROFILE" block. */
export function renderPersona(p) {
  if (!personaHasContent(p) && !p?.correction) return '';
  const lines = [
    'USER VOICE PROFILE',
    'Write as the user, in their own voice — do not flatten them into generic AI prose.',
  ];
  if (p.name) lines.push(`Name: ${p.name}.`);
  if (p.langPrimary) lines.push(`Primary language: ${p.langPrimary}.`);
  if (p.values) lines.push(`Values: ${p.values}`);
  if (p.voiceRules) lines.push(`Voice rules: ${p.voiceRules}`);
  if (p.samplePhrases) {
    lines.push('Sound like these authentic samples:');
    lines.push(String(p.samplePhrases).slice(0, SAMPLE_INJECT_MAX).trim());
  }
  if (p.doList) lines.push(`Do: ${p.doList}`);
  if (p.dontList) lines.push(`Never: ${p.dontList}`);
  lines.push(`CORRECTION RULE: ${p.correction || DEFAULT_CORRECTION}`);
  return lines.join('\n');
}

/**
 * Load the persona instruction to inject, or null. Honors config.persona.enabled
 * and tolerates a store without persona support.
 */
export async function loadPersonaInstruction(store, config, scope = PERSONA_SCOPE) {
  if (!config?.persona?.enabled) return null;
  let p = null;
  try {
    p = await store?.getPersona?.(scope);
  } catch {
    return null;
  }
  if (!p) return null;
  return renderPersona(p) || null;
}
