# Engine routing — design

Status: **draft** (2026-06-08). Captures the full routing plan. The cheapest two
layers shipped in v0.3.9; everything below the line is v0.4.x work, gated on
multi-provider depth and the multi-agent-debate research.

## The model: interface vs. workers

Aurora is the constant **interface model** — the engine you talk to, that holds
the conversation and carries the identity (brain + voice + skills + memory).
**Workers** are engines (claude, codex, any connected API) the interface can
borrow for a task and then hand back. Switching the interface (`/engine`) changes
which engine *is* Aurora; routing borrows a worker *without* changing that.

The identity is constant; the muscle is swappable. Routing decides which muscle,
for which task.

## Doctrine: route by task, escalate by stakes

There is no single router. Routing is a **policy layered from cheap+explicit to
expensive+autonomous**, and you only climb a layer when the one below it is
insufficient. Two principles:

- **Route by task** — the *task* knows its best tool. A skill (which already
  encodes task type) names the engine; a code task wants codex, long-form wants
  whatever the user prefers. This is predictable and free.
- **Escalate by stakes** — a normal turn runs on the interface (cheapest). Only a
  high-stakes or uncertain answer earns the expensive layers (model-decided
  delegation, multi-agent debate). Don't make every turn a routing decision —
  that's latency and N× cost, and the debate literature's echo-chamber failure
  mode, for no gain on easy turns.

## The routing ladder

| # | Layer | Who decides | Cost | Predictable | Status |
|---|-------|-------------|------|-------------|--------|
| 1 | Interface handles it | nobody (default) | cheapest | ✅ | shipped |
| 2 | Skill-declared (`engine:`) | the skill | free | ✅ | **shipped v0.3.9** |
| 3 | User override (`@worker`) | the user | free | ✅ | **shipped v0.3.9** |
| 4 | Capability/rule router | heuristic + capability tags | cheap | mostly | v0.4.x |
| 5 | Model-decided (`aurora:route`) | the interface model | a planning step | ⚠️ | v0.4.x |
| 6 | Debate / ensemble | N workers reconcile | N× tokens | ⚠️ | v0.4.x (see debate paper) |

### Shipped in v0.3.9 (layers 2–3)

`src/route.js :: resolveTurnEngine(text, { skill, engines, current })`. Two signals
borrow a worker for ONE task, after which the interface reverts (handled in
`streamResponse`):

- `@worker <message>` — explicit per-message override; the prefix is stripped. An
  `@name` that isn't a known engine is left as plain text.
- a fired skill's `engine:` frontmatter field — task-declared.

`@worker` wins over a skill's engine. The borrowed worker is built via
`adoptProvider` (brain + voice re-applied, transcript seeded), runs the whole task
(including any `aurora:ask` follow-ups), and is dropped afterward.

**Known limit:** cross-engine continuity is best-effort. A borrowed worker is
seeded from the saved transcript, but the interface engine's *native* session
doesn't absorb the side-call. Solving this properly is layer-4+ work (below).

## v0.4.x TODO

### Layer 4 — capability / rule router

Each engine declares capabilities + a weight class (coding, web, long-context,
cost tier — reuse the capability tagging from `docs/design/mcp-contestants.md`).
A cheap offline classifier maps task → required capabilities → best engine. Start
rule-based (code-shaped → codex; etc.), then capability-matched.

- Open: where do capability tags live (engine registry vs. config)?
- Open: how to classify task type without a model call — extend the brain scorer,
  or a tiny keyword/intent map?
- Risk: brittle at the edges; must be overridable by layers 2–3.

### Layer 5 — model-decided delegation (`aurora:route`)

A new turn-boundary block, sibling to `aurora:ask` / `aurora:done`: the interface
model emits `aurora:route` to delegate a sub-task to a worker, Aurora runs the
worker, returns the result to the interface, which integrates it in Aurora's
voice.

```
```aurora:route
{"engine":"codex","task":"port the parser to Rust","return":"the translated code"}
```​
```

- Open: one delegation per turn, or a plan of several?
- Open: does the interface see the worker's full output or a summary?
- Risk: adds a planning step + nondeterminism — gate on stakes, not every turn.
- Prereq: solve cross-engine continuity (the worker needs the interface's context;
  the interface needs the worker's result in its native session, not just the
  store).

### Layer 6 — multi-agent debate / ensemble

A special case of routing where "when" = "when you want consensus or verification
on a high-stakes answer." N workers answer, critique, reconcile to
consensus / majority / unresolved (never forced agreement). This is its own
research track — see the multi-agent-debate / LLM-consensus paper (this branch).
Surface as an explicit `/debate` command or a skill flag; never the default (N×
cost, echo-chamber risk).

## Cross-engine continuity (the hard prerequisite)

Each engine keeps its own native session (Claude's `--resume`, Codex's threads).
A turn run on one engine is invisible to another's native context. Today Aurora
bridges this with its own stored transcript (`seed()`), but that's a re-send, not
true shared memory. Layers 5–6 need a real answer:

- Option A: drop native sessions; always seed every engine from Aurora's store
  (one source of truth, more tokens per turn).
- Option B: keep native sessions, and after a delegated turn, re-seed the
  interface so it absorbs the side-call.
- Option C: a shared context object Aurora owns, handed to whichever engine runs.

Decide this before building layer 5.

## Relation to other work

- Builds on the provider abstraction (`src/providers/`) and the skills system
  (`src/skills/`) shipped in v0.3.9.
- The debate layer is gated on the multi-agent-debate research paper (this branch)
  and on having ≥2 strong workers, which v0.3.9's Codex provider delivered.
