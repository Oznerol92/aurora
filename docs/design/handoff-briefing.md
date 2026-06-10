# Cross-Engine Handoff Briefing (v0.3.9)

Status: **slice 1 implemented** · Branch: `v0.3.9` · Decided 2026-06-08

Goal: when you switch the interface engine mid-conversation (`/engine codex`), the
incoming engine should arrive _up to speed_ — knowing Aurora's identity, the work
done so far, and whether it has worked in this project before — instead of
starting from a raw transcript tail with no framing.

## What switching did before

`adoptProvider()` re-applied the method brain + voice (`applyBrainAndPersona`) and
seeded the **last 12 raw turns** (`seedFromStore` → `provider.seed`). That's it:
no synthesized "what we've done", no record of which engine has worked here, no
special treatment for an engine new to the project, and nothing shown to the user.

## Decisions (confirmed with the user, 2026-06-08)

| #   | Decision                  | Choice                                                                                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Ledger location           | **In the store/DB** (`getEngineLedger`/`saveEngineLedger` on the Store contract; json + sqlite). Degrades to in-memory-only under `store: none`. |
| 2   | Summary production        | **On-demand at switch**, one cheap `claude -p` call, degrading to a deterministic digest (title · exchanges · last `aurora:done` recap).         |
| 3   | Registry key ("new" unit) | **Provider id** (`claude` vs `codex`), _not_ model-id.                                                                                           |
| 4   | Recall scope              | **Working directory** (`process.cwd()`) now; topic clustering later.                                                                             |
| 5   | Applies to                | **`/engine` switches** now; `@worker` first-borrow briefing is a fast follow.                                                                    |

## Slice 1 — what's built

- **Engine ledger** (`src/engines/ledger.js`, persisted via the Store). Per provider
  id: `firstSeen` (set once ≈ "when this engine was added") and `dirs[<cwd>]`
  (`lastSessionId`, `lastActiveAt`, `lastTitle`). Pure merge helpers; stores stay
  dumb (whole-blob get/save, like `persona`). New sqlite table `engine_ledger`,
  `user_version` → 3; json gains an `engineLedger` key.
- **Briefing composer + summarizer** (`src/engines/briefing.js`). `summarizeWork`
  reuses the recap summarizer's `runClaudeOnce`; `deterministicDigest` is the
  fallback floor; `composeBriefing` writes the returning-vs-first-visit framing.
- **Engine contract**: `setBriefing(text)` on `Provider`, injected on a fresh
  session as a new system-prompt section (`composeSystemPrompt({ briefing })`),
  ordered after the brain and before the raw seed transcript. One-shot — cleared
  by `reset()` like the seed, since it describes the handed-over conversation.
- **Wiring**: `applyHandoffBriefing()` in `handleEngine` (first-visit per engine
  per directory triggers the fuller onboarding framing), a startup ledger touch
  for the launching engine, and a `/context` command that shows the per-directory
  engine ledger + a deterministic conversation digest (no LLM call).

## When it does NOT help

- **`store: none`** — no cross-session memory; the briefing carries only the
  continuity framing (the user is told so in the digest). The work summary needs a
  stored transcript.
- **First turn of a fresh session** — nothing to summarize; the briefing is framing
  only.
- **Same-engine `/model` change** — not a handoff; no briefing is generated.

## Open layer — summary & onboarding (design, not yet built)

The pieces deliberately left for a follow-up slice, so the data model (the
expensive-to-change part) could land first:

1. **Live-transcript summary under `store: none`.** Today the summary is sourced
   from `store.getConversation`. To brief statelessly, keep a small in-memory turn
   ring on `ctx` (fed by the same path that persists turns) and summarize from it
   when no store is on. Bounded (~last 40 turns) to cap prompt size.
2. **`@worker` first-borrow briefing.** When a task borrows a worker engine
   (`@codex …` / skill `engine:`), brief it once per session on first borrow, then
   stay quiet — reuse `composeBriefing` with a "borrowed for a task" framing.
   Routing already isolates the worker (`src/route.js`); the hook is in
   `streamResponse` where the worker is adopted.
3. **Rolling summary (optional optimization).** If the on-demand call's ~1–2s at
   switch becomes annoying, maintain a rolling summary refreshed every N turns and
   read it instantly at switch. More writes + complexity; only if measured.
4. **Onboarding depth knob.** First-visit currently differs only in framing text.
   A fuller onboarding could inject a one-time "how Aurora works here" block
   (project conventions, the brain's posture) above the work summary.
5. **Topic-level recall (v0.4.1).** Replace/augment the directory key with topic
   clustering across sessions, so "last conversation on this _topic_" works across
   directories. Needs classification/embeddings — out of scope for v0.3.9.

## Tests

`test/ledger.test.js` (pure helpers, purity, per-dir recall), `test/briefing.test.js`
(digest, summarizer success + fallback + throw, composer both flavours, user
digest), and additions to `test/store.test.js` (ledger round-trip, json + sqlite),
`test/prompt-compose.test.js` (briefing ordering + budget), `test/provider.test.js`
and `test/codex.test.js` (`setBriefing` injection + reset clears it).
