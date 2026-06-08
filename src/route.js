/**
 * Turn-level engine routing (the v0.3.x slice).
 *
 * Doctrine: **route by task, escalate by stakes.** Aurora's identity is the
 * constant INTERFACE model you talk to; WORKERS (claude, codex, …) are engines it
 * can borrow for a task and then hand back. The full routing ladder — capability
 * router, model-decided `aurora:route` delegation, multi-agent debate — is
 * designed in docs/design/routing.md on the v0.4.1 branch.
 *
 * This file implements only the two cheapest, fully-predictable signals that
 * borrow a worker for ONE task, after which the interface reverts:
 *   - `@worker <message>`        an explicit per-message override
 *   - a fired skill's `engine:`  task-declared (the skill knows its best tool)
 *
 * `@worker` wins over a skill's engine; absent both, the turn stays on whatever
 * engine the user chose with `/engine`. An `@name` that isn't a known engine is
 * left untouched (it's just text — a handle, a mention).
 */

/**
 * Resolve which engine should run this turn, and the message to send.
 * @param {string} text  the raw user message
 * @param {{skill?: object|null, engines?: string[], current?: string}} opts
 * @returns {{engineId: string|null, message: string, source: 'override'|'skill'|'current'}}
 */
export function resolveTurnEngine(text, { skill = null, engines = [], current = null } = {}) {
  const known = new Set(engines.map((e) => String(e).toLowerCase()));
  const raw = String(text ?? '');

  // `@worker rest…` — only treated as routing when the name is a known engine.
  const m = /^@([a-z0-9_-]+)\s+([\s\S]+)$/i.exec(raw.trim());
  if (m && known.has(m[1].toLowerCase())) {
    return { engineId: m[1].toLowerCase(), message: m[2].trim(), source: 'override' };
  }

  const skillEngine = skill?.engine ? String(skill.engine).toLowerCase() : null;
  if (skillEngine && known.has(skillEngine)) {
    return { engineId: skillEngine, message: raw, source: 'skill' };
  }

  return {
    engineId: current ? String(current).toLowerCase() : null,
    message: raw,
    source: 'current',
  };
}
