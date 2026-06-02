# Multi-Provider & Local-Model Roadmap (v0.4.x)

Status: **draft / proposed** · Branch: `v0.4.1` · Drafted 2026-06-02

Goal: turn Aurora's provider scaffolding into real, switchable backends — with a
first-class **local self-hosted model** path — and decide what hardware (and how
much money) a usable local model actually needs.

> **Scope note.** Through v0.3.x the deliberate stance was *scaffolding only,
> Claude is the sole implemented backend*. This roadmap is the point where we
> revisit that on purpose: v0.4.x is the "more than one brain" milestone. Nothing
> here is committed yet — it's a plan to cost out and stage.

## Where we start (already in place)

The hard architectural work is done. `src/providers/base.js` defines a clean,
provider-agnostic contract and the rest of the app routes through it:

- **`Provider` contract**: `send()` (async-iterable of `status` / `delta` /
  `done` events), `reset()`, `resume(id)`, `seed(turns)`, `abort()`,
  `shortSession()`, `describe()`. Anything that satisfies this shape works with
  the existing UI, store, SIGINT handling, and Telegram bridge with **zero UI
  changes**.
- **Registry** (`src/providers/index.js`): `claude` implemented; `openai` and
  `gemini` already present as placeholders.
- **Config** (`src/config.js`): `provider`, `model`, plus per-provider knobs;
  secrets are **env-only** (`SECRET_KEYS` already lists `apiKey`/`token`), read
  via `src/env.js`. Nothing secret ever lands in `config.json`.
- **Reference implementation** (`src/providers/claude.js`): shows the full
  pattern — streaming parse, session continuity, seed-fallback, cancel.

So each new provider is essentially: **one new file + one registry line + a few
config/env keys + tests.** No re-plumbing.

## The provider landscape we want

| Tier | Provider | Auth | Status | Priority |
|---|---|---|---|---|
| 0 | **Claude** (Claude Code CLI) | subscription, no key | ✅ done | — |
| 1 | **Local (OpenAI-compatible)** — Ollama / LM Studio / llama.cpp / vLLM | none (localhost) | 🔜 **new focus** | **P1** |
| 2 | **OpenAI (GPT)** | `OPENAI_API_KEY` | placeholder | P2 |
| 2 | **Google Gemini** | `GEMINI_API_KEY` | placeholder | P3 |

**Key insight:** Ollama, LM Studio, and vLLM all expose an **OpenAI-compatible
`/v1/chat/completions` endpoint**. So a single `OpenAICompatibleProvider` —
parameterised by `baseUrl` + optional `apiKey` + `model` — covers **local models
*and* hosted OpenAI** with one streaming implementation. That collapses Tier 1
and half of Tier 2 into one body of code. This is the cheapest path to "Aurora
runs my own model."

## Architecture plan (how it slots in)

1. **`src/providers/openai-compat.js`** — new `OpenAICompatibleProvider`:
   - Config: `baseUrl` (e.g. `http://localhost:11434/v1` for Ollama, or the
     OpenAI URL), `model`, optional `apiKey` (env-only; absent for local).
   - `send()`: POST to `/chat/completions` with `stream: true`, parse the SSE
     `data:` lines into `delta`/`done` events — same event shape as Claude.
   - Continuity: these APIs are **stateless**, so Aurora replays the transcript
     each turn. `seed()` / the store already hold the history → reuse the
     existing rehydration path; `resume()` just re-adopts stored turns. No native
     session id needed (`shortSession()` returns null).
   - `abort()`: `AbortController` on the fetch.
2. **`src/providers/local.js`** (thin) — a preset of `OpenAICompatibleProvider`
   pointed at Ollama defaults, registered as `local` with a friendly label, so
   `provider: "local"` "just works" against a running Ollama.
3. **Registry** (`index.js`): replace the `openai` placeholder with the real
   class; add `local`; leave `gemini` as a placeholder until P3.
4. **Config**: add `baseUrl` (per provider), keep `model`. Document the env keys
   in `.env.example`.
5. **Setup** (`src/setup.js`): extend the first-run picker — "Which backend?
   Claude / Local (Ollama) / OpenAI". For Local, probe `baseUrl` and list
   installed models if reachable.
6. **Gemini** (P3): separate `gemini.js` (different wire format) once the
   compat path is proven.

## Phasing

- **Phase 1 — Local model end-to-end (the headline).**
  `OpenAICompatibleProvider` + `local` preset + Ollama probe in setup + tests
  (streaming parse, abort, seed-replay continuity). Outcome: `provider: "local"`
  chats against a local Ollama model with full Aurora UX (streaming, SIGINT,
  Telegram, store/resume).
- **Phase 2 — Hosted OpenAI.** Same class, `baseUrl` = OpenAI, `OPENAI_API_KEY`,
  cost accounting in the `done` event. Mostly config + docs + tests.
- **Phase 3 — Gemini.** Dedicated provider for the non-compatible wire format.
- **Phase 4 — Polish.** Per-provider model lists, `/provider` switch command,
  cost/latency display, model-capability notes in `describe()`.

Implementation order starts with the streaming OpenAI-compatible client (highest
value, unlocks both local and OpenAI).

## Hardware & funding — running a model locally

The one number that governs everything is **memory the model weights fit into**:
GPU **VRAM**, or **unified memory** on Apple Silicon. Rule of thumb at 4-bit
quantisation (`Q4`, the quality/size sweet spot):

> **memory ≈ params (B) × ~0.7 GB**, plus ~1–2 GB context headroom.
> 7B ≈ 5 GB · 14B ≈ 9 GB · 32B ≈ 20 GB · 70B ≈ 40 GB.

### Funding tiers (one-time hardware, EUR, approximate)

| Tier | Spend | Hardware | Runs well | Verdict |
|---|---|---|---|---|
| **A — Free / test** | €0 | Existing laptop, 16 GB RAM, CPU only | 3B–8B @ Q4, a few tok/s | Proves the pipeline; too slow for daily flow |
| **B — Entry GPU** | €300–500 | Used/new **RTX 3060 12 GB** in a desktop | 7B–14B, snappy | The real practical floor; great value |
| **C — Strong GPU** | €700–1,200 | **RTX 4070 Ti S 16 GB / used 3090 24 GB** | up to ~32B comfortably, 70B slowly | Genuinely useful, coding-capable |
| **D — Apple Silicon** | €1,600–2,500 | **Mac mini/Studio M-series, 32–64 GB unified** | 32B easily; 64 GB → 70B | Quiet, efficient, low idle power; memory-bandwidth bound |
| **E — 70B at speed** | €2,500–4,000+ | **2× RTX 3090/4090 (48 GB)** or 64 GB+ Mac | 70B comfortably | Approaches "hosted-ish" quality |

**Recommended starting point: Tier B (€300–500, RTX 3060 12 GB).** Lowest spend
that makes a local model *pleasant* rather than a demo. Validate the whole Aurora
local path on it, then decide whether quality justifies stepping up to C/E.

### Ongoing costs to budget
- **Electricity.** A gaming GPU draws ~150–350 W under load. At ~€0.30/kWh, an
  hour of heavy use ≈ €0.05–0.10; idle desktop draw adds up if left on. Apple
  Silicon idles very low.
- **Storage.** Models are 4–40 GB each; budget a fast 1 TB SSD if collecting a
  few.
- **Time.** Setup, quantisation choices, and prompt-tuning are real effort —
  factor it as cost.

### Alternative: rent a GPU instead of buying
If usage is bursty, **cloud GPU rental** (e.g. ~€0.30–1.50/hr for a 24–48 GB
card) avoids capital outlay. Sensible to prototype Tiers C–E before committing to
hardware. Same `OpenAICompatibleProvider` points at a remote Ollama/vLLM URL — no
code difference, just `baseUrl`.

## Local vs hosted — the honest trade

| | Local (self-hosted) | Hosted API (Claude/GPT/Gemini) |
|---|---|---|
| Cost shape | One-time hardware + power | Per-token, pay-as-you-go |
| Privacy | Data never leaves the machine | Sent to provider |
| Offline | Yes | No |
| Quality ceiling | Good (70B ≈ strong, not frontier) | Frontier |
| Ops burden | You run it | Zero |

**Realistic expectation:** a local 70B @ Q4 is genuinely good and private, but
still a step below frontier hosted models. The win is **control, privacy, and
zero marginal cost** — not beating Claude on raw capability.

## Open questions / decisions to make

1. **Buy vs rent first?** Recommendation: rent to prototype Tiers C–E, buy Tier B
   if local becomes a daily driver.
2. **Default local model?** Candidates: Qwen (coding-strong), Llama 3.x
   (general), Gemma (efficient small). Pick after benchmarking on chosen hardware
   — the existing `bench/` harness can drive this.
3. **One compat provider or split local/openai classes?** Lean: one
   `OpenAICompatibleProvider` + thin `local` preset (less code, proven path).
4. **Cost accounting** for hosted providers — surface `costUsd` in `done` like
   Claude does; local is free so report tokens/latency instead.

## Risks
- **Quality disappointment** at low tiers — a 7B model is not Claude; set
  expectations, recommend Tier B+ before judging.
- **Stateless continuity** — local APIs have no native session; we lean entirely
  on the store + `seed()`. Already built in v0.3.3, but long conversations hit
  the context window sooner than Claude Code's local session does.
- **Scope creep** — keep Phase 1 strictly to the OpenAI-compatible local path;
  defer Gemini's bespoke format.

## Next steps
1. Decide buy-vs-rent and a target tier (drives the benchmarking hardware).
2. Spike `OpenAICompatibleProvider` against a local Ollama on whatever machine is
   handy (Tier A is fine to prove the wire format).
3. Pick a default local model via `bench/`.
4. Promote this draft to **accepted** and start Phase 1.
</content>
</invoke>
