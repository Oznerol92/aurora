# Intent gate — act vs. discuss (design)

Status: **draft** (2026-06-09). Targets **v0.3.11**. Captures the design for two
symptoms of one root problem; no code yet.

## The problem, concretely

Aurora acts when the user is still thinking. Two observed symptoms, one root:

- **Skill misfire (was v0.3.10 #3a).** `selectSkill` (`src/skills/corpus.js`) scores a
  message purely on keyword overlap with each skill's `when_to_use` (trigger terms
  weighted ×3 as tags, ×1 as body; threshold `SKILL_MIN_SCORE = 6`). On 2026-06-09
  a message *about* the write-article skill — it literally contained the words
  "write article skill" and "research skill" — fired the write-article skill and
  reshaped the whole turn into article-writing. Talking *about* a task triggered the
  task.
- **Charging ahead (v0.3.11 #5).** When the user is brainstorming or triaging
  ("what should we do?", a todo list, "maybe v0.3.11?"), Aurora executes instead of
  discussing. Same in the dev loop: a dismissed picker got read as consent and work
  started (see the `dismissed-choice-not-consent` lesson).

**Root:** there is no check for *intent* before acting — only keyword and scope
signals. A keyword match is treated as a work order. The fix is a small gate that
asks "is this message asking me to DO the thing, or to TALK about it?" before any
turn-reshaping or consequential action.

## Root, named

Two turn intents Aurora must tell apart:

| Intent | Examples | Aurora should |
|--------|----------|---------------|
| **Act** | "fix the paste bug", "add a previewEngine flag", imperative verbs | do the work (skills may fire, code may change) |
| **Discuss** | "should we…", "what do you think", "I'm thinking about…", a todo list to triage, meta-references to a tool/skill | propose, ask, lay out options — do NOT execute or fire a skill |

This is the same doctrine routing.md already states for engines — *route by task,
escalate by stakes* — applied one level up: **default to the cheap, reversible
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
- **Apply to skills first:** `selectSkill` should require an *action* intent (or a
  much higher score) before auto-firing, and never fire when the message is a
  meta-reference to that skill. Explicit `/skill use <id>` always bypasses the gate
  (the user asked by name).

### Layer 2 — turn mode (item #5)

A per-turn mode, `act` vs `discuss`, that gates consequential actions (running a
skill, editing files, outward-facing ops), not just skill selection:

- **Explicit** wins: a `/plan` (discuss) or `/go` (act) command, or a session
  default. Cheap, predictable.
- **Inferred** from Layer-1 signals when not set. On ambiguity, prefer **discuss**
  and surface a one-line "want me to do this, or talk it through?" rather than
  executing.

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
  Aurora *ask one line*, not to guess silently in either direction.

## Phasing

1. **Phase 1 (v0.3.11):** Layer-1 classifier + wire it into `selectSkill` (require
   action intent, suppress on meta-reference). Closes the skill-misfire bug with a
   pure, testable function. Low blast radius.
2. **Phase 2 (v0.3.11+):** turn mode (`/plan` · `/go` · inferred) gating
   consequential actions. The behavioural half of item #5.
3. **Phase 3 (later):** model-decided `aurora:mode`, only if Layers 1–2 are too blunt.

## Relation to other work

- The **code-research skill** (v0.4.1 backlog) is the positive counterpart: once the
  gate stops the wrong skill firing, "digging into code" should fire the right one.
- Shares the **escalate-by-stakes** doctrine with `docs/design/routing.md`.
- Encodes the `dismissed-choice-not-consent` lesson as a rule: a non-answer is a
  discuss signal, never an act signal.
