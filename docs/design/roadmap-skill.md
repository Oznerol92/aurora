# Roadmap skill — notes → roadmap → todos → implement → verify (design)

Status: **draft** (2026-06-10). Targets a near-term **v0.3.x** line. **Level 1
first** (see "Build levels"). No code yet — this captures the design.

## The problem, concretely

Multi-step coding work in Aurora today is ad-hoc: you paste a list of intentions
(a `# PRE_RELEASE` block of `- []` items) and the model starts doing things. Two
costs follow:

- **Implementing against an unreviewed plan.** If the model's idea of the work is
  wrong, you only find out after it has spent implement-tokens producing the wrong
  code. Re-doing a plan is free; re-doing code is not.
- **No structure, no gate.** There's no roadmap grounded in the actual codebase,
  no per-task acceptance check, and nothing that says "this unit is done, move
  on." Work drifts and re-litigates itself.

The sibling repo `../workflow` (`wfq`, a Rust orchestrator) already solves this
shape — `notes → roadmap → per-task todo → plan/implement/verify`, gated on a
verifier — but it also spends heavily where we don't need to (parallel 32-dev
fan-out, review-everything mode, 3× Opus retries). **The goal is to borrow wfq's
discipline without its cost**, as an Aurora skill.

## Goal / non-goals

- **Goal:** a skill that turns freeform notes into a code-grounded roadmap and a
  list of small todos, stops for human review, then works the todos one at a time
  with a verify gate. Structured, re-runnable, cheap.
- **Non-goal (for now):** parallel multi-agent fan-out, a merge-conflict resolver,
  or a long-running daemon. Those are wfq's expensive end; out of scope until the
  cheap core proves itself.

## What we borrow from `wfq` — and what we drop

From `wfq/src/orchestrator_seed.txt` and `wfq/src/pipeline.rs:800-1100`:

| Keep (efficient)                                          | Why                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `notes.md` is the **read-only human source of intent**    | One source of truth; agents never rewrite your intent               |
| Roadmap **grounded in real `file:line`** references       | A phase that names the code is testable and hard to fake            |
| **Verifier gate** — progress only when acceptance passes  | Stops "looks done" from counting as done                            |
| **Verify-only review** (wfq's `review_all=false` default) | Skips a reviewer on plan + implement; ~40% fewer orchestrator turns |
| **Retries capped** (wfq caps at 3), then halt + ask       | Bounds the blast radius of a bad unit                               |
| **Narrow per-task scope** (one file / one concern)        | Small context, few conflicts                                        |

| Drop (expensive)                       | Why drop it                                                                |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Parallel 32-dev fan-out + merge worker | Throughput isn't a solo-maintainer bottleneck; this is wfq's biggest spend |
| Review-everything mode                 | 3 reviews/task; verify-only is enough                                      |
| 3× Opus re-runs on failed verify       | Cap at 2, then surface to the human                                        |

## Aurora substrate — where this plugs in

The skill system and spawn surfaces already exist; the constraint shapes the design.

| Hook                   | Location                                                                                    | Use                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Skill format + compile | `src/skills/corpus.js:149` (`selectSkill`), `:172` (`compileSkill`); files in `skills/`     | The skill is a compiled prompt template injected into one turn                          |
| Skill firing           | `src/cli.js` (`applySkillToMessage`, ~508-551)                                              | `/skill use roadmap` fires even in PLAN mode                                            |
| One-shot runner        | `src/notify/once.js:86` (`resolveOnceRunner`), `src/notify/preview.js:28` (`runClaudeOnce`) | Stateless `claude -p` / `codex exec` — cheap, **no tools**, JSON in/out                 |
| Worker borrow          | `src/route.js:26` (`resolveTurnEngine`), `src/cli.js:1611` (`adoptProvider`)                | Full provider **with tools**, session-scoped — the substrate for an implement sub-agent |
| Brain / persona inject | `src/providers/claude.js:117` (`setBrainCards`), `:125` (`setPersona`), `:224` (`#augment`) | A one-shot sub-agent gets neither unless the prompt includes it                         |
| Interaction protocol   | `src/protocol.js` (`aurora:ask`, `aurora:done`)                                             | The human gate uses `aurora:ask`; recaps use `aurora:done`                              |
| Store                  | `src/store/base.js`                                                                         | Persist run artifacts / audit trail                                                     |

**The decisive constraint:** decomposition and verification need **tool access**
(read files, grep, run tests) — that is the live session or a worker-borrow, _not_
a stateless one-shot runner. So Level 1 keeps decomposition + verify in the live
session; Level 2 farms only the well-scoped _implement_ step to a sub-agent.

## The pipeline + artifact schemas

Working dir per run: `./.aurora/runs/<slug>/` (scoped like the stores).

```
notes.md      ← you write it; READ-ONLY for the skill
   │  DECOMPOSE (live session, has tools: grep/read the codebase)
roadmap.md    ← phases, each with real file:line refs + an acceptance check
   │  SPLIT
todos.md      ← small single-concern units (checkboxes), each scoped to files
   │  ━━━ HUMAN GATE (aurora:ask): review/edit before any code is written ━━━
per todo:  implement → verify(acceptance) → gate
                                              ├ pass → check it off, next
                                              ├ fail → retry (≤2)
                                              └ still failing → halt + ask
```

**`roadmap.md`** (generated):

```markdown
## Phase N: <heading>

- Goal: <one line>
- Sites: `src/foo.js:120` (fn `bar`), `src/baz.js`
- Acceptance: <a testable condition>
```

**`todos.md`** (generated): one checkbox per unit, each naming its files and the
acceptance check it satisfies. A unit should be small enough that its diff is
reviewable in one sitting.

## Build levels

| Level                            | What                                                                                        | New code                                                        | "Different agents"?             |
| -------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| **1 — roadmap skill** (this doc) | Decompose + human gate + serial per-todo verify, all in the live session                    | ~none beyond the skill `.md` + brain cards + a small run helper | No — sequential, one engine     |
| **2 — role sub-agents**          | Per todo, spawn an implement agent (worker-borrow, has tools) distinct from the verify step | Small orchestrator module + run-artifact handling               | Yes — distinct prompts per role |
| **3 — parallel fan-out**         | N implement agents per phase in worktrees + merge/verify                                    | Significant                                                     | Yes, concurrent                 |

### Level 1 — concretely

1. **Skill file** `skills/roadmap.md` with frontmatter:
   `id: roadmap`, `when_to_use: turn notes/roadmap into a plan and work
through it`, `brain: [code-quality, testing, ...]`, `asks: Which notes file or
paste? | Repo/scope?`. Body = the procedure below.
2. **Decompose** (one live turn, tools on): read the notes; grep/read the named
   code; write `roadmap.md` + `todos.md` grounded in `file:line`.
3. **Gate** (`aurora:ask`): present the roadmap/todo summary; "approve / edit /
   cancel". Nothing is implemented until approval. _This is the main token saver._
4. **Execute loop** (live session as the orchestrator — wfq's long-lived-session
   lesson, no per-step re-briefing): for each unchecked todo — implement, then
   verify against its acceptance check (run tests where possible), gate, cap
   retries at 2, check it off, persist a short verdict.
5. **Recap** (`aurora:done`): what landed, what's left, what halted.

### Level-2 readiness (so Level 1 doesn't wall us in)

Define the role-prompt taxonomy now, even though Level 1 runs them inline:

| Role                | Job                                       | Level-1 home | Level-2 home                           |
| ------------------- | ----------------------------------------- | ------------ | -------------------------------------- |
| Decomposer ("CTO")  | notes → roadmap + todos, grounded in code | live session | live session (needs tools)             |
| Implementer ("dev") | one todo → a diff                         | live session | worker-borrow (`route.js`) — has tools |
| Verifier            | check acceptance, run tests               | live session | live session or worker-borrow          |

Keeping each role's prompt as a named block in the skill means Level 2 is "send
this block to a sub-agent" rather than a rewrite.

## The token-efficiency contract (the anti-waste heart)

Stated as commitments, with the honest cost behind each:

- **Human-gate before implementing.** The biggest saver: a wrong plan costs a
  re-plan, not re-implemented code.
- **Verify-only gating.** No reviewer per step. _Cost:_ a bad plan isn't caught
  early — you rely on the verify check catching it, so the acceptance check must
  be real.
- **Reuse the live session as orchestrator.** No re-briefing per todo. _Cost:_ a
  long session grows context; for very long runs, periodic summary may be needed.
- **Cap retries at 2, then halt.** _Cost:_ genuinely-hard units stop and wait for
  you instead of grinding.
- **Narrow todo scope.** Fewer conflicts, smaller context. _Cost:_ more, smaller
  units to track.

## When this does NOT serve you

- **Small changes** (one-file fix, a quick bug): decompose→gate→verify costs more
  than just doing it. The skill should fire only for multi-step work, and "just do
  it" must always override.
- **Vague acceptance criteria.** The verify gate is only as good as the check. A
  todo whose "done" isn't testable gets rubber-stamped — you pay for theater.
- **Exploratory / unknown-shape problems.** A phased roadmap assumes you roughly
  know the shape. For research-y work the brainstorm matters more than the pipeline.

## Mistakes to avoid

- **Auto-firing the skill on every message** → it reshapes ordinary turns into
  ceremony. Gate it on multi-step intent; prefer explicit `/skill use roadmap`.
- **Letting the decomposer write to `notes.md`** → your intent gets overwritten.
  `notes.md` is read-only for the skill, full stop (wfq's rule).
- **Implementing before the gate** → the exact token waste this design exists to
  prevent. The gate is not optional.
- **Untestable acceptance checks** → silent pass-through; wasted retries on the
  ones that do fail. Reject a todo whose acceptance can't be checked.

## Open decisions

- Skill id / trigger phrasing, and whether it ever auto-fires vs explicit-only.
- Artifact location: `./.aurora/runs/<slug>/` vs the store. (Leaning: files, so
  they're diffable and git-trackable.)
- Whether the execute loop pauses for approval **per todo** or only at the roadmap
  gate. (Leaning: roadmap gate only, with per-todo halt on failure.)

## Phased build plan

1. **Decomposition half first** — the skill + `roadmap.md`/`todos.md` generation,
   grounded in code, ending at the human gate. Validate on real notes (the
   `PRE_RELEASE` block is a good test input) before building the execute loop.
2. **Execute loop** — serial implement → verify → gate, retries capped.
3. **(Later) Level 2** — farm the implement role to a worker-borrow sub-agent.

Related: `intent-gate.md` (act vs discuss — the skill must respect it), the
routing doctrine (route-by-task / escalate-by-stakes, on the multi-provider line),
and the `../workflow` `wfq` repo as the reference implementation.
