# MCP Contestants — pluggable AI wrappers in the benchmark (v0.3.8)

Status: **proposed** · Branch: `v0.3.8` · Drafted 2026-06-08

Goal: let the benchmark compare not just raw models but whole **AI wrappers**
(other people's "aurora"-like interfaces) attached over **MCP** — and do it so
that no contestant can corrupt another contestant's results or the
reproducibility of future runs.

## What exists today

The bench compares **models** through thin adapters: `(modelCfg, system, prompt)
→ {ok, text, tokens, cost, latency}`. Two are wired in `bench/reasoning.js:159`:

- `claude-cli` — shells out to the local `claude` CLI with `--model`, matching
  how Aurora itself calls Claude (subscription auth, no key).
- `openai-api` — calls the OpenAI API directly, cost-gated.

The registry is `bench/models.json`; an unwired/uncredentialed model is **skipped
with a notice**, not an error (`availability()` in `reasoning.js:162`). The
grader (`reasoning-grade.js`) and report (`report.js`) consume a fixed result
shape, so adding a contestant kind is additive if it returns that shape.

Aurora itself stays **Claude-only by design** ([[aurora-provider-scope]]); calling
other vendors lives only in the bench, never as a first-class provider.

## The reframe: model contestant → agent contestant

A model adapter is a pure call. A **wrapper** is a stateful agent: its own system
prompt, brain (`src/brain/corpus.js`, `AURORA_BRAIN_DIR`), memory, tools, and
some model underneath. Comparing wrappers means treating each as a **black box**
that answers a question — exactly what MCP is for: the contestant is a separate
MCP **server**, the bench is the **client**.

Crucial caveat up front: **MCP is a protocol, not a sandbox.** It gives a process
boundary and a typed tool contract. Every isolation guarantee below comes from
how the harness *provisions* the contestant, not from MCP itself.

## Threat model — what can and cannot be corrupted

The motivating fear — "someone changes memory so the next benchmark's Claude
isn't as good" — splits into one impossible half and one real half:

- **The model is stateless across calls.** Two wrappers both calling Claude do
  **not** affect each other's answers. There is no per-account memory inside the
  model that one caller degrades for another. The base model **cannot be
  poisoned** by a co-running contestant. That fear is unfounded.
- **Persistent wrapper state drifts.** The brain cards, the memory store, the
  v0.3.3 DB — if two contestants share a state directory, or a contestant's
  memory persists and mutates between runs, then run N+1 ≠ run N. **This** is the
  real reproducibility threat, and it is entirely filesystem/state isolation, not
  the model.

Design principle, one line: **every contestant invocation is a hermetic function
`question → answer` with no shared mutable state — not with other contestants,
not with prior runs.**

### Interference, decomposed

| Shared layer | Corrupts answer *quality*? | Mitigation |
|---|---|---|
| Model weights | No — stateless per call | nothing needed |
| Persistent state (brain/memory/DB dir) | **Yes** | per-contestant scratch dir, seeded fresh, snapshot → run → restore |
| Credentials / account | No quality; rate-limit → latency & cost skew | each contestant brings **its own** key; if shared, serialize and flag latency unreliable |
| Env / filesystem (adversarial server) | **Yes** | scrubbed env allowlist + OS sandbox; never expose Aurora's state dirs or keys |
| Prompt cache | No quality; latency & cost skew | record cache hits, or compare cold |

The two **Yes** rows are the whole job. The credential row is why a third-party
wrapper must **not** be handed Aurora's `ANTHROPIC_API_KEY` — it brings its own
backend; sharing one account only buys throttling and unreliable latency numbers.

## Design — four pieces

### A. The contestant contract (the integration seam)

One MCP tool every contestant must expose:

```
answer(prompt: string) -> { text: string, model_used?: string, usage?: {tokens_in, tokens_out, cost_usd} }
```

That is the entire surface anyone implements to enter the bench. `model_used` and
`usage` are optional but recorded for provenance when present (a wrapper that
hides its backend still competes; it just reports less).

### B. The contestant manifest

Extend `models.json` (or a sibling `contestants.json`) with a `kind:"mcp"` entry:

```json
{
  "their-wrapper": {
    "kind": "mcp",
    "command": "node",
    "args": ["./their-server.js"],
    "env_allow": ["THEIR_API_KEY"],
    "model_declared": "claude-opus-4-8",
    "capabilities": ["brain", "memory", "web"],
    "state": { "mode": "ephemeral", "seed": "fixtures/their-seed" }
  }
}
```

- `env_allow` — the **only** env vars passed through; everything else (including
  Aurora's own keys) is scrubbed.
- `capabilities` — declared weight class (see D).
- `state.mode` — `ephemeral` (fresh from `seed` each run, torn down after) or
  `persistent` (snapshot → run → restore, so a measured-memory wrapper stays
  reproducible).

### C. The `mcp` adapter + isolation harness

A new adapter alongside `claude-cli`/`openai-api`, returning the **same result
shape** so grader and report are untouched. Per contestant, per run, the harness:

1. Copies the seed state into a temp dir (or snapshots the persistent dir).
2. Spawns the MCP server with **only** `env_allow` vars present.
3. Drives one `answer()` call per question over the MCP client.
4. Tears down / restores the state dir.
5. Records provenance into each result record: resolved model snapshot,
   declared vs reported model, capabilities, state mode, cache hits.

Concurrency: if contestants share a backend account, run them at `concurrency:1`
and mark latency as **not comparable** in that run.

### D. Fairness / weight classes

Comparing whole agents reopens the fairness problem the reasoning track dodges by
giving Claude **no web tools** (so it's a clean comparison to a plain OpenAI
completion — `reasoning.js:81` note). A wrapper *with* retrieval vs one *without*
is not a like-for-like test. So: tag every contestant with its `capabilities`
profile and either compare **within a class** or always render the profile next
to the score in the report. Never publish a bare scoreboard that mixes classes.

## Open question — adversarial isolation depth

An `env_allow` list stops **accidental** state sharing. It does **not** stop a
determined malicious MCP server from reading the filesystem or exfiltrating over
the network — that needs OS-level sandboxing (container / `bwrap` / `firejail`),
which is heavier and platform-specific. Decision needed: do we (a) trust
contestants the operator installs and ship only env-scrubbing + state isolation,
or (b) treat every contestant as hostile and require a sandbox? Recommendation:
**(a) for v0.3.8** — document the trust boundary loudly, defer the sandbox to a
later version — because the operator chooses which wrappers to install, the same
trust posture as installing any npm dependency or MCP server today.

## Decisions (proposed, pending Lorenzo)

1. **Unit of comparison:** agent-as-black-box over MCP, one `answer()` tool.
2. **Reproducibility mechanism:** hermetic runs via per-contestant ephemeral
   state seeded from a fixture; persistent-memory contestants use snapshot/restore.
3. **Credentials:** each contestant brings its own; Aurora keys never exposed.
4. **Trust boundary (v0.3.8):** env-scrubbing + state isolation only; OS sandbox
   deferred and documented as a known gap.
5. **Fairness:** capability tagging mandatory; no mixed-class scoreboards.

## Phasing

- **Phase 1 (this doc):** design + threat model + contract. No code.
- **Phase 2 (vertical slice):** `mcp` adapter + manifest fields + ephemeral-state
  harness + one reference contestant (Aurora-as-MCP calling Claude) + an
  isolation test proving no cross-run drift (run twice, identical seed → byte-for-
  byte state restore; a contestant that scribbles in its dir can't change the
  next run's input).
- **Phase 3 (hardening):** OS-level sandbox for untrusted servers, full provenance
  recording, capability/weight-class rendering in the report.

Aurora stays Claude-only throughout; this lives entirely in the bench.
