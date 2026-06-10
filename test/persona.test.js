import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../src/store/json.js';
import {
  renderPersona,
  loadPersonaInstruction,
  personaDefaultsFromBrain,
  personaHasContent,
  DEFAULT_CORRECTION,
  PERSONA_SCOPE,
  PERSONA_TEMPLATES,
  resolvePersonaTemplate,
} from '../src/persona.js';

const require = createRequire(import.meta.url);
const sqliteAvailable = (() => {
  try {
    require.resolve('better-sqlite3');
    return true;
  } catch {
    return false;
  }
})();

test('renderPersona always includes the correction rule', () => {
  const out = renderPersona({ voiceRules: 'short and direct' });
  assert.match(out, /USER VOICE PROFILE/);
  assert.match(out, /short and direct/);
  assert.match(out, /CORRECTION RULE:/);
  assert.match(out, /silently fix typos/);
});

test('renderPersona returns empty for an empty profile', () => {
  assert.equal(renderPersona({}), '');
  assert.equal(renderPersona(null), '');
});

test('PERSONA_TEMPLATES are four usable, render-ready voice presets', () => {
  assert.equal(PERSONA_TEMPLATES.length, 4);
  for (const t of PERSONA_TEMPLATES) {
    assert.ok(t.id && t.label && t.blurb, 'each template is labelled');
    assert.ok(t.fields.voiceRules, 'each template carries voice rules');
    assert.ok(personaHasContent(t.fields), 'each template has substantive content');
  }
});

test('resolvePersonaTemplate maps a picker answer to a template, or null to skip', () => {
  assert.equal(resolvePersonaTemplate('1'), PERSONA_TEMPLATES[0]);
  assert.equal(resolvePersonaTemplate('4'), PERSONA_TEMPLATES[3]);
  assert.equal(resolvePersonaTemplate('aurora-method'), PERSONA_TEMPLATES[0]);
  assert.equal(resolvePersonaTemplate('Plain & direct'), PERSONA_TEMPLATES[1]);
  // Blank, out-of-range, or unknown answers all mean "skip" (silent default).
  assert.equal(resolvePersonaTemplate(''), null);
  assert.equal(resolvePersonaTemplate('  '), null);
  assert.equal(resolvePersonaTemplate('9'), null);
  assert.equal(resolvePersonaTemplate('nope'), null);
});

test('renderPersona injects only a bounded slice of samples', () => {
  const huge = 'x'.repeat(5000);
  const out = renderPersona({ samplePhrases: huge });
  assert.ok(out.length < 2000, 'samples are trimmed for injection');
});

test('personaHasContent ignores a lone correction default', () => {
  assert.equal(personaHasContent({ correction: DEFAULT_CORRECTION }), false);
  assert.equal(personaHasContent({ voiceRules: 'x' }), true);
});

test('personaDefaultsFromBrain seeds voice defaults from the shipped cards', () => {
  const d = personaDefaultsFromBrain();
  assert.equal(d.correction, DEFAULT_CORRECTION);
  assert.match(d.dontList, /best practices/);
  assert.match(d.voiceRules, /Hook\+Number/);
});

test('loadPersonaInstruction respects the config toggle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-'));
  try {
    const store = new JsonStore({ dataDir: dir });
    await store.open();
    await store.savePersona(PERSONA_SCOPE, { voiceRules: 'terse' });

    assert.equal(await loadPersonaInstruction(store, { persona: { enabled: false } }), null);
    const on = await loadPersonaInstruction(store, { persona: { enabled: true } });
    assert.match(on, /terse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('JsonStore persists and merges persona fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-'));
  try {
    const store = new JsonStore({ dataDir: dir });
    await store.open();
    await store.savePersona(PERSONA_SCOPE, { langPrimary: 'it' });
    await store.savePersona(PERSONA_SCOPE, { voiceRules: 'direct' });
    const p = await store.getPersona(PERSONA_SCOPE);
    assert.equal(p.langPrimary, 'it', 'earlier field is preserved on merge');
    assert.equal(p.voiceRules, 'direct');
    assert.ok(p.updatedAt, 'stamps updatedAt');

    // Reopen: persona survives a restart.
    const reopened = new JsonStore({ dataDir: dir });
    await reopened.open();
    assert.equal((await reopened.getPersona(PERSONA_SCOPE)).langPrimary, 'it');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a no-op store returns null persona', async () => {
  const { NoneStore } = await import('../src/store/none.js');
  const store = new NoneStore();
  assert.equal(await store.getPersona(), null);
  assert.equal(await store.savePersona('default', { voiceRules: 'x' }), null);
});

test(
  'SqliteStore persists and merges persona fields',
  { skip: !sqliteAvailable && 'better-sqlite3 not installed' },
  async () => {
    const { SqliteStore } = await import('../src/store/sqlite.js');
    const dir = mkdtempSync(join(tmpdir(), 'persona-sql-'));
    try {
      const store = new SqliteStore({ dataDir: dir });
      await store.open();
      await store.savePersona(PERSONA_SCOPE, { langPrimary: 'en' });
      await store.savePersona(PERSONA_SCOPE, { samplePhrases: 'sounds like me' });
      const p = await store.getPersona(PERSONA_SCOPE);
      assert.equal(p.langPrimary, 'en');
      assert.equal(p.samplePhrases, 'sounds like me');
      await store.close();

      const reopened = new SqliteStore({ dataDir: dir });
      await reopened.open();
      assert.equal((await reopened.getPersona(PERSONA_SCOPE)).langPrimary, 'en');
      await reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
