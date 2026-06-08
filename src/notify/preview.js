/**
 * AI-generated recap preview.
 *
 * The deterministic `previewText` (src/protocol.js) guarantees a recap is never
 * cut mid-word, but it can only keep the LEADING sentences of a long turn. This
 * asks Claude (Sonnet by default) for a one-line GIST instead — what was done and
 * any next step — which reads better than the opening sentences alone.
 *
 * It runs Claude the same way Aurora itself does: by shelling out to the local
 * `claude` CLI (subscription auth, no API key, no out-of-pocket cost), with a
 * hard timeout and no tools. It is strictly best-effort — ANY failure (timeout,
 * non-zero exit, unparseable output, the CLI missing) resolves to null so the
 * caller falls back to `previewText`. A summariser hiccup must never block or
 * break a recap.
 */
import { spawn } from 'node:child_process';
import { stripProtocolBlocks, previewText } from '../protocol.js';

const PREVIEW_CHARS = 480; // under Telegram's 4096 cap; a tight one-liner
const MIN_CHARS = 500; // below this the body already fits a preview — don't summarise
const TIMEOUT_MS = 20_000;

/**
 * One tool-free `claude -p` call. Resolves to the result text, or null on any
 * failure. Never throws. Exported so other best-effort summarizers (the handoff
 * briefing, src/engines/briefing.js) shell out to Claude exactly the same way.
 */
export function runClaudeOnce(prompt, model, bin = 'claude') {
  return new Promise((resolve) => {
    let child;
    const timer = setTimeout(() => {
      try {
        child?.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      resolve(null);
    }, TIMEOUT_MS);
    try {
      child = spawn(bin, ['-p', prompt, '--model', model, '--output-format', 'json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      clearTimeout(timer);
      return resolve(null);
    }
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out);
        resolve((j.result ?? j.text ?? '').trim() || null);
      } catch {
        resolve(null);
      }
    });
  });
}

function buildPrompt(text, maxChars) {
  return (
    `Summarise the assistant turn below into ONE plain-text line of at most ${maxChars} ` +
    `characters, for a phone notification. Say what was done and any single next step. ` +
    `No markdown, no quotes, no preamble — output only the line.\n\n---\n${text}`
  );
}

/**
 * Return a short plain-text gist of `fullText`, or null when the model isn't used
 * or the call fails. Returns null for a body that already fits (`<= minChars`), so
 * short turns skip the model entirely. `runClaude` is injectable for tests.
 */
export async function aiPreview(
  fullText,
  {
    model = 'sonnet',
    maxChars = PREVIEW_CHARS,
    minChars = MIN_CHARS,
    bin,
    runClaude = runClaudeOnce,
  } = {},
) {
  const body = stripProtocolBlocks(String(fullText ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (body.length <= minChars) return null;
  const raw = await runClaude(buildPrompt(body, maxChars), model, bin);
  if (!raw) return null;
  // Enforce the budget cleanly even if the model overshoots or returns prose.
  return previewText(raw.replace(/\s+/g, ' ').trim(), maxChars);
}
