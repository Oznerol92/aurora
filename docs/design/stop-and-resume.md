# Stop-and-Resume (v0.3.3)

Status: **accepted, in progress** · Branch: `v0.3.3` · Decided 2026-06-02

Goal: quit `aurora` at any moment and relaunch into the same conversation —
reliably, with the model's context intact, and without losing an in-flight turn.

## What already works (v0.3.1 groundwork)

- The Claude provider mints a session UUID, uses `--session-id` on turn 1 then
  `--resume <id>` after; **Claude Code keeps the real context locally**
  (`src/providers/claude.js`).
- An `active-session` pointer + `attachSession()` re-attach to the last session
  on launch (store enabled) and replay recent turns on screen (`src/cli.js`).
- `/history`, `/resume [id]`, `/export`, project-vs-global scope, and a shared
  CLI↔Telegram session exist and are tested.

So on a single machine with a store on, basic restart-and-continue already
functions. v0.3.3 makes it **trustworthy, crash-safe, and explicit**.

## The three gaps

1. **Silent context amnesia (highest priority).** `provider.resume(id)` just
   sets a flag and returns `true` — it never verifies Claude still has that
   session. If the session is gone (other machine, `~/.claude` pruned, foreign
   id), the next `--resume` starts blank while Aurora still replays the
   transcript — so it *looks* resumed while the model has amnesia.
2. **Interrupted turns vanish.** `saveExchange` writes the user+assistant pair
   only after the turn fully completes. Ctrl-C during a long answer, or a crash,
   loses both the question and the partial answer. No graceful SIGINT.
3. **Resume is implicit and uncontrollable.** Launch always silently
   auto-attaches the latest session. No `--new`, no `--resume <id>` at launch,
   no signal distinguishing "truly resumed" from "replayed text only".

## Design — three workstreams

### A. Trustworthy context via store-backed rehydration (fixes Gap 1)

Aurora's store becomes the source of truth for context; the provider's native
session is the fast path.

- Provider contract gains **`seed(turns)`**: adopt a prior transcript as context
  for a fresh session. For Claude, the first `send()` after a seed prepends a
  bounded transcript as a context preamble / appended system prompt.
- Resume flow: **try native `--resume`; on failure** (session-not-found / empty
  result) **transparently fall back** to a fresh session seeded from the store.
  The startup line tells the user which happened.
- Unlocks cross-machine resume and resume-after-prune.

### B. Crash/interrupt-safe persistence (fixes Gap 2)

- Persist the **user turn immediately** on submit (before `send()`).
- Save the assistant turn on completion; **on interrupt/error save whatever
  streamed so far, flagged `complete: false`** so resume shows it and the model
  continues from it.
- **Graceful SIGINT:** first Ctrl-C cancels the in-flight turn (kill the child,
  flush partial), returns to the prompt; second exits. Mirrored in the Telegram
  bridge (both share `saveExchange`).
- Schema: a per-turn `complete` flag. JSON store is free-form; SQLite migrates
  with an additive `complete` column guarded by a column/`user_version` check.

### C. Explicit launch-time control (fixes Gap 3)

- Flags: `aurora --resume [id]`, `aurora --new` / `--fresh`.
- Config `resumeOnLaunch: "latest" | "ask" | "off"` (default `latest`).
- Validate the pointer against the current store/scope; show the resume source
  on the startup screen.

### Cross-cutting

- Store schema versioning (SQLite `PRAGMA user_version`, JSON `version`).
- Tests extend the existing suite: `session.test.js` (fallback, pointer
  validation), `store.test.js` (partial turns, migration), `provider.test.js`
  (`seed`), `bridge.test.js` (parity), plus interrupt coverage.

## Decisions (accepted)

1. **Launch behavior:** default `latest` (silent auto-resume), with `--new` /
   `--resume [id]` escapes; `ask` available via config.
2. **Rehydration depth:** bounded last-N-turns replay with a "N earlier hidden"
   note. Summarization of older turns is deferred to Phase 3.
3. **Persistence default:** stays **opt-in** (first-run setup still offers it).

## Phasing

- **Phase 1 (trustworthy):** B (crash-safety + SIGINT) + the resume-failure
  detection & rehydration fallback of A + `--resume` / `--new` flags.
- **Phase 2 (polish):** full `seed()` bounded replay, `resumeOnLaunch` policy +
  `ask` picker, pointer/scope validation, schema versioning.
- **Phase 3 (stretch):** summarize older turns to fit the context budget.

Implementation order within Phase 1 starts with the persistence layer
(crash-safety + `complete` flag), the lowest-risk, highest-value slice.
