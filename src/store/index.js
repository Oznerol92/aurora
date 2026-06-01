import { NoneStore } from './none.js';
import { JsonStore } from './json.js';
import { SqliteStore } from './sqlite.js';

/**
 * Registry of persistence backends. The user picks one via config.store
 * ('none' | 'json' | 'sqlite'). Mirrors the provider registry so the choice
 * is data-driven and adding a backend (Postgres, etc.) is one line here.
 */
const REGISTRY = {
  [NoneStore.id]: NoneStore,
  [JsonStore.id]: JsonStore,
  [SqliteStore.id]: SqliteStore,
};

/** Construct (but do not open) a store by id. Falls back to NoneStore. */
export function getStore(id, config = {}) {
  const Cls = REGISTRY[id] || NoneStore;
  return new Cls(config.storeOptions || {});
}

/** List store ids for display. */
export function listStores() {
  return Object.values(REGISTRY).map((Cls) => ({ id: Cls.id, label: Cls.label }));
}
