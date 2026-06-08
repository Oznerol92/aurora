import { ClaudeProvider } from './claude.js';
import { CodexProvider } from './codex.js';
import { Provider } from './base.js';

/**
 * Registry of known providers. To add a new AI later: implement a Provider
 * subclass in this folder and add it here. Everything else (CLI, UI, config)
 * already routes through this registry.
 */
const REGISTRY = {
  [ClaudeProvider.id]: ClaudeProvider,
  [CodexProvider.id]: CodexProvider,
  // Placeholders for the future — listed so the UI can show what's planned.
  // `openai` is reserved for a direct-API provider, distinct from the Codex CLI.
  openai: makePlaceholder('openai', 'OpenAI API (GPT)'),
  gemini: makePlaceholder('gemini', 'Google Gemini'),
};

function makePlaceholder(id, label) {
  return class extends Provider {
    static id = id;
    static label = label;
    static implemented = false;
    constructor() {
      super();
      throw new Error(`Provider "${id}" (${label}) is registered but not implemented yet.`);
    }
  };
}

/** Construct a provider instance by id. */
export function getProvider(id, config = {}) {
  const Cls = REGISTRY[id];
  if (!Cls) {
    throw new Error(`Unknown provider "${id}". Known: ${Object.keys(REGISTRY).join(', ')}`);
  }
  if (!Cls.implemented) {
    throw new Error(`Provider "${id}" (${Cls.label}) is not implemented yet. Try "claude".`);
  }
  return new Cls(config);
}

/** List providers for display: [{ id, label, implemented }]. */
export function listProviders() {
  return Object.values(REGISTRY).map((Cls) => ({
    id: Cls.id,
    label: Cls.label,
    implemented: Cls.implemented,
  }));
}
