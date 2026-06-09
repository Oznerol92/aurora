/**
 * Stateless one-shot summarizers, per engine.
 *
 * A "once" call is a throwaway, tool-free completion used by best-effort
 * summarizers — the blockless-turn recap gist (notify/preview.js) and the handoff
 * briefing (engines/briefing.js). It must NEVER touch an engine's conversational
 * session: a provider's `send()` resumes/advances a native thread, so reusing it
 * for a summary would corrupt the very continuity the engines work to preserve.
 * So every once-runner spawns a FRESH process, exactly like `runClaudeOnce` does
 * with `claude -p`.
 *
 * This is what makes the recap engine-agnostic: by default the gist is written by
 * the free local `claude` CLI (subscription auth, no out-of-pocket cost); with
 * `notify.telegram.previewEngine: 'active'` it is written by whichever engine is in
 * use, so a codex-only setup gets a real AI gist instead of the deterministic
 * leading-sentences fallback — at that engine's own cost.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { runClaudeOnce } from './preview.js';
import { mapCodexLine } from '../providers/codex.js';

const TIMEOUT_MS = 20_000;

/**
 * One stateless, tool-free Codex completion. Mirrors `runClaudeOnce`'s contract:
 * resolves to the answer text, or null on ANY failure (timeout, non-zero exit, the
 * CLI missing, no message) so a summariser hiccup degrades to the deterministic
 * fallback. Never throws. A fresh `codex exec` with no `resume` — no thread is
 * created or advanced, so the conversation's native session is untouched.
 */
export function runCodexOnce(prompt, model, bin = 'codex') {
  return new Promise((resolve) => {
    const args = ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '--color', 'never'];
    if (model) args.push('-m', model);
    args.push('-'); // prompt on stdin

    let child;
    let answer = '';
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child?.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      resolve(val);
    };
    const timer = setTimeout(() => done(null), TIMEOUT_MS);

    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      return done(null);
    }
    child.stdin.on('error', () => {}); // ignore EPIPE if codex exits early
    child.stdin.end(prompt);
    child.on('error', () => done(null));

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const m = mapCodexLine(line);
      // Codex delivers each assistant message whole; keep the latest as the answer.
      if (m?.kind === 'text' && typeof m.text === 'string') answer = m.text;
    });
    child.on('close', (code) => {
      if (code !== 0) return done(null);
      const text = answer.trim();
      done(text || null);
    });
  });
}

/**
 * Resolve a stateless one-shot runner for an engine id. Returns a `runClaude`-shaped
 * fn (prompt, model, bin) plus a sensible default model, so it drops straight into
 * `aiPreview` / `summarizeWork`. Unknown engines fall back to Claude (free).
 *
 * @param {string} engineId  the active engine ('claude' | 'codex' | …)
 * @param {object} [opts]
 * @param {string} [opts.codexModel]  model to pass codex when engineId is 'codex'
 */
export function resolveOnceRunner(engineId, { codexModel } = {}) {
  if (engineId === 'codex') return { runOnce: runCodexOnce, model: codexModel || null };
  return { runOnce: runClaudeOnce, model: 'sonnet' };
}

/**
 * Pick the summariser runner for a recap/briefing, honouring
 * `notify.telegram.previewEngine`. Default ('claude') keeps the free CLI; 'active'
 * routes through `engineId`'s stateless one-shot. Returns { runClaude, model } ready
 * to spread into aiPreview/summarizeWork.
 *
 * @param {object} config    the loaded config
 * @param {string} engineId  the engine to use when previewEngine is 'active'
 */
export function resolvePreviewRunner(config, engineId) {
  const tg = config?.notify?.telegram || {};
  const mode = tg.previewEngine || 'claude';
  if (mode === 'active' && engineId && engineId !== 'claude') {
    const { runOnce, model } = resolveOnceRunner(engineId, { codexModel: config?.codexModel });
    return { runClaude: runOnce, model: model || tg.previewModel || undefined };
  }
  return { runClaude: runClaudeOnce, model: tg.previewModel || 'sonnet' };
}
