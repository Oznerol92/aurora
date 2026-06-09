# Backlog — deferred & to-review

Status: **living index** (started 2026-06-09). One place for everything we said we'd
do but parked. Each item has a status, a one-line scope, and a pointer to the doc
that owns the detail. This file does not duplicate designs — it makes them findable.

Legend: **TODO** = agreed, not started · **REVIEW** = needs a decision before work ·
**LIMIT** = known v1 limitation to revisit · **DONE** = closed, kept for trail.

---

## Decisions to make (REVIEW)

| Item | Question | Source |
|------|----------|--------|
| Blockless-gist engine | The blockless-turn recap gist (`aiPreview` → `runClaudeOnce`) is hardwired to the free `claude` CLI. Route through the active engine, keep always-claude, or add a `notify.telegram.previewEngine` flag (recommended)? Costs API money per turn under codex. | `src/notify/preview.js`, `src/engines/briefing.js` |
| `/read` abort-resume | TTY mid-stream steer confirmed "ok for now" by Lorenzo but not formally verified in a real terminal. Re-check via `aurora --solo`. | `src/cli.js` (`composeSteer`) |
| Research protocol | Fold the distilled research-discipline protocol into the deep-research skill, or leave standalone? Decision pending. | memory: research-protocol-candidate |
| Cross-engine continuity | Pick Option A (always seed from store), B (re-seed interface after a side-call), or C (shared context object). Prerequisite for routing layers 5–6. | `docs/design/routing.md` |

---

## Carried-forward implementation TODO

| Item | Scope | Source |
|------|-------|--------|
| Bench Netlify deploy | Reasoning-benchmark report PROD Netlify deploy is pending an eyeball. | bench scripts |
| MCP-contestants Phase 2 | Vertical slice: `mcp` adapter + manifest fields + ephemeral-state harness + one reference contestant + isolation test (no cross-run drift). | `docs/design/mcp-contestants.md` |
| MCP-contestants Phase 3 | Hardening: OS-level sandbox for untrusted servers, full provenance recording, capability/weight-class rendering. | `docs/design/mcp-contestants.md` |
| Codex stale-resume fallback | Codex provider has no fallback when a native `thread_id` is stale/gone; resume just fails. | `src/providers/codex.js` |

---

## Handoff-briefing — open layer (designed, not built)

All from `docs/design/handoff-briefing.md` § "Open layer":

- **TODO** Live-transcript summary under `store: none` — in-memory turn ring on `ctx`, summarize from it when no store.
- **TODO** `@worker` first-borrow briefing — brief a borrowed worker once per session on first borrow, then stay quiet.
- **TODO** Rolling summary (optional optimization) — only if the ~1–2s on-demand call at switch becomes annoying.
- **TODO** Onboarding depth knob — one-time "how Aurora works here" block on first visit.
- **TODO** Topic-level recall — cluster by topic across sessions instead of working-dir key (needs classification/embeddings).

---

## Routing ladder — layers 4–6 (v0.4.x)

All from `docs/design/routing.md` § "v0.4.x TODO". Layers 2–3 shipped in v0.3.9.

- **TODO** Layer 4 — capability / rule router: engines declare capabilities + weight class; cheap offline classifier maps task → engine. Open: where tags live; how to classify without a model call.
- **TODO** Layer 5 — model-decided delegation: new `aurora:route` turn-boundary block. Prereq: cross-engine continuity decision above.
- **TODO** Layer 6 — multi-agent debate / ensemble: N workers reconcile on high-stakes answers; `/debate` command or skill flag, never default. Gated on the research paper below.

---

## Research & roadmap (v0.4.1 milestone)

- **TODO** Multi-agent-debate / LLM-consensus design paper — Lorenzo's request; debate evidence is genuinely mixed (echo-chamber, N× cost), so the paper must pressure-test, not assume. 8-domain neutral framing.
- **TODO** Multi-provider & local-model roadmap + hardware funding tiers — see `docs/design/multi-provider-roadmap.md`.

---

## Deferred further out

- **TODO** Provenance recording — explicitly deferred to **v0.5.1** (originally scoped in the v0.3.4 brain milestone).

---

## Closed this cycle (DONE — kept for trail)

- **DONE** Telegram recap Stop hook — the "blocked by the auto-mode classifier" note was stale; the hook is registered in `~/.claude/settings.local.json`, the chat registry resolves Lorenzo's chat, and a dry-run rendered the card correctly (2026-06-09). Works for any dev model; only the optional blockless gist is claude-coupled (see REVIEW above).
- **DONE** TTY features — pinned prompt, paste path, spinner confirmed working by Lorenzo (2026-06-09). `/read` abort-resume moved to REVIEW (parked, "ok for now").
- **DONE** Codex per-provider `/model` + web search (`c98de59`); the earlier "shared /model targets Claude" limit is resolved.

---

## Not tracked here

Release-process state (v0.3.9 has 8 unpushed commits; promotion to `pre-release`
pending) lives in the version memories / `version-promotion-workflow`, not this
backlog — this file is product/design work, not release mechanics.
