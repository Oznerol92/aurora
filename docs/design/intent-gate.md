# Intent gate — act vs. discuss (design)

Status: **draft** (2026-06-09). Targets **v0.3.11**. Captures the design for two
symptoms of one root problem; no code yet.

## The problem, concretely

Aurora acts when the user is still thinking. Two observed symptoms, one root:

- **Skill misfire (was v0.3.10 #3a).** `selectSkill` (`src/skills/corpus.js`) scores a
  message purely on keyword overlap with each skill's `when_to_use` (trigger terms
  weighted ×3 as tags, ×1 as body; threshold `SKILL_MIN_SCORE = 6`). On 2026-06-09
  a message _about_ the write-article skill — it literally contained the words
  "write article skill" and "research skill" — fired the write-article skill and
  reshaped the whole turn into article-writing. Talking _about_ a task triggered the
  task.
- **Charging ahead (v0.3.11 #5).** When the user is brainstorming or triaging
  ("what should we do?", a todo list, "maybe v0.3.11?"), Aurora executes instead of
  discussing. Same in the dev loop: a dismissed picker got read as consent and work
  started (see the `dismissed-choice-not-consent` lesson).

**Root:** there is no check for _intent_ before acting — only keyword and scope
signals. A keyword match is treated as a work order. The fix is a small gate that
asks "is this message asking me to DO the thing, or to TALK about it?" before any
turn-reshaping or consequential action.

## Root, named

Two turn intents Aurora must tell apart:

| Intent      | Examples                                                                                                         | Aurora should                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Act**     | "fix the paste bug", "add a previewEngine flag", imperative verbs                                                | do the work (skills may fire, code may change)                 |
| **Discuss** | "should we…", "what do you think", "I'm thinking about…", a todo list to triage, meta-references to a tool/skill | propose, ask, lay out options — do NOT execute or fire a skill |

This is the same doctrine routing.md already states for engines — _route by task,
escalate by stakes_ — applied one level up: **default to the cheap, reversible
thing (discuss) and only act on a clear action intent.**

## Design — a layered gate

Mirror the routing ladder: cheap + deterministic first, model-decided only if needed.

### Layer 1 — deterministic signals (fixes #3a, low risk)

A pure classifier over the message, no model call:

- **Action cues** → act: leading imperative verbs (fix, add, write, implement,
  refactor, run, ship, build…), "please <verb>", "go ahead", "do it".
- **Discuss cues** → discuss: interrogatives ("should we", "what about", "wdyt",
  "?"), hedges ("maybe", "I'm thinking", "brainstorm", "idea:"), and **meta-
  references** — the message names the machinery ("the X skill", "this command",
  "/help") rather than asking for the task. Meta-reference is the specific signal
  that would have stopped the 2026-06-09 misfire.
- **Apply to skills first:** `selectSkill` should require an _action_ intent (or a
  much higher score) before auto-firing, and never fire when the message is a
  meta-reference to that skill. Explicit `/skill use <id>` always bypasses the gate
  (the user asked by name).

### Layer 2 — turn mode, with auto-revert (item #5)

Decisions locked with Lorenzo 2026-06-09. The core idea: **PLAN is the resting
state; ACT is a bounded excursion.** Aurora enters ACT to do one piece of work,
then — after it ships the result and recap — falls back to PLAN automatically. So
Aurora can never "keep charging": every action is one deliberate trip out and back.
This reuses the engine-routing precedent (`adoptProvider` in `src/route.js`: borrow
for one task, revert in a `finally`), one level up.

**Session mode** (sticky, the user's standing preference):

- `auto` — **default.** Aurora decides per turn from Layer-1 cues; rests at PLAN,
  enters ACT only on a clear action signal, reverts after.
- `plan` — forced discuss. Aurora never auto-acts; it proposes and asks until released.

**Per-turn ACT** is therefore: `mode === auto && turn reads as act`, or a one-shot
`/go`. Commands:

- `/plan` — set session mode to `plan` (force discuss).
- `/auto` — set session mode back to `auto` (release `/plan`).
- `/go` — act THIS turn regardless of mode, then auto-revert to the session mode.

(No sticky-ACT command on purpose — a "stay acting" mode is exactly the
charge-ahead behaviour we're removing.)

**The decider** (in `auto`):

1. **Deterministic** — Layer-1 cues. Clear action → ACT; discuss/meta/question →
   PLAN. Default on ambiguity = **PLAN**.
2. **Ask, only when action-shaped but unclear** — Aurora asks one line ("do it now,
   or talk it through?") via `aurora:ask` instead of guessing. Pure chat that isn't
   action-shaped just stays PLAN silently (never asks). This is Lorenzo's "ask the
   user directly" path, bounded so it doesn't nag.

**What the mode changes (start NARROW — Lorenzo's call):** for v1, mode gates only
**skill auto-fire + heavy deliverables**, via a system-prompt line:

- PLAN: "discuss, propose, ask; don't run skills or produce final deliverables
  unless asked." Skill auto-fire OFF (reuses Phase-1's `autoFire` path).
- ACT: "carry out the task." Skill auto-fire ON (still subject to the Phase-1 gate).

Widening the gate to all tool use / outward-facing ops is deferred until v1 is
observed in use.

**Auto-revert mechanism:** hook the same turn-end point where `maybeNotify` fires
the recap. After an ACT turn that completed (emitted a `done` block), set
`ctx.mode`'s per-turn ACT back to PLAN. Revert ONLY on true completion — an
intermediate `aurora:ask` (a mid-task clarification) keeps the turn in ACT until its
`done`, so a multi-step task isn't stranded.

**Display:** the prompt shows the resting mode (`plan ❯`) and ACT excursions
(`act ❯`), so the user always knows whether the next message will be discussed or
executed. A dismissed/unanswered picker counts as a discuss signal, never act
(encodes the `dismissed-choice-not-consent` lesson).

### Layer 3 — model-decided (optional, later)

Only if deterministic cues prove too blunt: let the interface model emit an
`aurora:mode` hint as part of its turn, the way `aurora:ask`/`aurora:done` work. A
planning step, so gate it on stakes — not every turn.

## When this does NOT help / failure modes

- **Terse action requests look like nothing.** "the /help one" after a plan is an
  action, not a meta-reference — Layer 1 could mis-flag it as discuss. Mitigation:
  context (a just-offered choice) biases toward act; an explicit `/go` overrides.
- **Over-suppression is its own bug.** If the gate is too eager to "discuss", Aurora
  stops being useful and asks when it should just do. The default must be tunable,
  and a single clear verb should always get action.
- **It cannot read true intent**, only surface cues. This narrows misfires; it does
  not eliminate them. Keep the override cheap and obvious.
- **Not a replacement for asking.** When genuinely unsure, the gate's job is to make
  Aurora _ask one line_, not to guess silently in either direction.

## Phasing

1. **Phase 1 (v0.3.11) — DONE.** `src/skills/intent.js`: a pure classifier
   (`shouldAutoFireSkill` = meta-reference suppression + discuss-cue detection),
   wired into `selectSkill` (the `gate` option; the explicit `/skill use` path skips
   it). Plus `config.skills.autoFire` to disable trigger-based selection entirely.
   The 2026-06-09 misfire message is now suppressed; genuine requests still fire.
   Note learned: do NOT match a skill's _title_ as a meta-reference — a title is
   often the natural request ("write an article"), so it would suppress real asks;
   match the hyphenated `id` instead. `test/intent.test.js`.
2. **Phase 2 (v0.3.11, design locked — next to build):** the auto/plan turn mode
   above. Session mode `auto`|`plan` (`/auto`·`/plan`) + one-shot `/go`, the
   deterministic decider with ask-when-ambiguous, the PLAN/ACT system-prompt framing
   gating skill auto-fire + deliverables (narrow scope for v1), and the auto-revert
   to PLAN on the turn-end recap hook. Reuses the `adoptProvider` borrow-and-revert
   pattern. Build order: (a) mode state on `ctx` + `/plan`·`/auto`·`/go` commands +
   prompt indicator; (b) decider wired to the message; (c) PLAN/ACT framing + gate;
   (d) auto-revert at the `maybeNotify` turn-end.
3. **Phase 3 (later):** model-decided `aurora:mode`, only if Layers 1–2 are too blunt.

## Relation to other work

- The **code-research skill** (v0.4.1 backlog) is the positive counterpart: once the
  gate stops the wrong skill firing, "digging into code" should fire the right one.
- Shares the **escalate-by-stakes** doctrine with `docs/design/routing.md`.
- Encodes the `dismissed-choice-not-consent` lesson as a rule: a non-answer is a
  discuss signal, never an act signal.
