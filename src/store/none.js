import { Store } from './base.js';

/** The default no-op store: Aurora stays stateless, nothing is written. */
export class NoneStore extends Store {
  static id = 'none';
  static label = 'None (stateless)';
}
