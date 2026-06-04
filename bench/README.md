# ARM benchmark

Measures the **Aurora Research Method (ARM)** against a freeform baseline, across models.

**The two questions it answers:**

1. Does the structured method (ARM) beat freeform research — and where?
2. Does the lift depend on **regime** (under-documented vs well-documented) and on **model strength**?

## Layout

```
bench/
  questions.json        starter question set, tagged by regime (B / A / hybrid)
  conditions/
    arm.md              the structured system prompt (ARM)
    baseline.md         freeform baseline system prompt
  models.json           model registry — edit `active[]` to choose what runs
  rubric.md             grading rubric (auto metrics + judge panel + paraphrase check)
  run.js                runs model x condition x question -> results/<runId>/
  grade.js              automated metrics + aggregate table
  report.js             builds the self-contained HTML report
  report.template.html  page shell (styles, charts, markdown renderer)
  results/<runId>/      raw outputs + metrics.json + scoreboard.csv
  results/index.html    browsable report across all runs (open in a browser)
```

## Run it

```bash
node bench/run.js                  # all active models (opus, sonnet), both conditions
node bench/run.js --only B1-react19,A1-llm-agents-prod --concurrency 1   # quick smoke test
node bench/grade.js <runId>        # runId is printed by run.js (and is the results/ folder name)
node bench/report.js               # build results/index.html, then open it in a browser
```

### Cheap multi-vendor smoke (~$0.50 cap)

Test the harness against **other vendor APIs** for a few cents. Implemented
adapters: `openai-api`, `gemini-api` (plain completions — **no web tools** on the
cheap path, so this exercises plumbing + ARM-discipline following, not live
research). Set the relevant key first (`OPENAI_API_KEY` / `GEMINI_API_KEY` in
`.env` or the environment — see `.env.example`):

```bash
node bench/run.js --models gpt-mini,gemini-flash --only B1-react19 --concurrency 1
```

That's 1 question × 2 conditions × 2 vendors = 4 calls, typically a few cents.
Two backstops keep it bounded:

- `--max-cost 0.50` (default) — once cumulative **out-of-pocket vendor** spend
  hits the cap, remaining vendor jobs are skipped. **Only vendor adapters are
  gated**; `claude-cli` is subscription-billed and runs uncapped (so a full
  `node bench/run.js` Claude run is never throttled by this). The check is
  per-job pre-dispatch, so with `--concurrency N` it can overshoot the cap by up
  to the cost of N in-flight jobs — keep concurrency low for a tight ceiling.
- `--max-tokens 1500` (default) — caps output tokens per vendor call, which
  bounds how large any single overshoot can be.

Cost is computed from each API's **real usage counts** × the `price` table in
`models.json` (USD per 1M tokens) — verify those numbers against current vendor
pricing and edit as needed. A job whose key is missing records a clean
`FAIL (missing …_API_KEY)` rather than crashing, so you can run only the vendor
you have a key for.

`report.js` is the read-friendly view. It scans every `results/<runId>/`, folds
in each run's `metrics.json` (if graded), and writes a single self-contained
`results/index.html` — no server, no network, no build step. Open it straight
from disk. The page carries interactive ARM-vs-baseline charts (one per metric,
averaged per model), a sortable scoreboard, and a sidebar to navigate every run
and every individual output with its research text rendered as styled markdown.
Re-run it any time after grading to refresh.

`run.js` shells out to the local `claude` CLI with `--model`, the same way Aurora invokes Claude. Web tools (`WebSearch`, `WebFetch`) are enabled for **both** conditions, so the only difference between ARM and baseline is the discipline in the system prompt.

## Publishing the report

`results/index.html` is a **single self-contained file** — CSS, JS, and every run's
data are inlined, with no external requests. So hosting it is plain static hosting:
regenerate it, then copy that one file to a web root. No Node or database runs on
the host.

`bench/publish.sh` does exactly that — rebuilds the report and `rsync`s
`index.html` to a server (e.g. an nginx droplet). The target is read from the
environment (or `.env`), never committed:

```bash
# in .env or your shell:
#   AURORA_BM_HOST=deploy@aurora-bm.werewolf.solutions
#   AURORA_BM_PATH=/var/www/aurora-bm
bash bench/publish.sh --dry-run   # preview the transfer
bash bench/publish.sh             # build + upload
```

A ready-to-edit nginx server block is in
[`deploy/nginx-aurora-bm.conf.example`](deploy/nginx-aurora-bm.conf.example)
(server name, root, TLS-via-certbot, optional basic-auth).

> **Heads-up:** the report inlines the full model output for every run it
> contains. A public URL makes all of that world-readable — put it behind
> basic-auth or an IP allowlist (see the nginx example) if a run could carry
> anything you don't want public. It's also a **frozen snapshot**: it only
> updates when you re-run `publish.sh`.

## Scoring

- **`grade.js` (automated):** length, citations, link-resolve rate, vague-attribution count, disclaimer count, ARM tag compliance, cost, latency. Cheap and objective.
- **Judge panel (manual / orchestrated):** the qualitative dimensions in `rubric.md` need a model. Run an odd panel (≥3) of independent judges per output, score blind to condition, take the median. This is a natural multi-agent **workflow** step.
- **Paraphrase-fidelity check:** sample cited URLs per output and verify the source _actually supports_ the claim. Highest-value check; also model-assisted.

## Adding a model

1. Add an entry to `models.json` under `models` and put its id in `active[]` (or pass it via `--models`).
2. If it's another Claude tier (`haiku`), it works immediately via the `claude-cli` adapter.
3. For a vendor already wired (`openai-api`, `gemini-api`), just point `model` at the tier you want and give it a `price: { in, out }` table (USD per 1M tokens) for cost reporting.
4. For a brand-new vendor, add an adapter to `run.js` (`ADAPTERS`) following the `runOpenAI`/`runGemini` shape: return `{ ok, text, cost_usd, latency_ms }`. These adapters call the vendor API **directly from the benchmark** — they do NOT add a provider to Aurora itself, which stays Claude-only by design.

## Status

Scaffold is in place. `opus`/`sonnet` are wired via `claude-cli`; the `openai-api`
and `gemini-api` adapters are now implemented (cheap models `gpt-mini` /
`gemini-flash`, plain completions, cost + token caps). Not yet run fully
end-to-end — the first pass will shake out the `claude --output-format json`
field names (`run.js` parses defensively) and the regex thresholds in `grade.js`.
The vendor cheap-smoke path is plumbing-validated against the no-key failure mode;
the first real call will confirm vendor model IDs and the `price` tables.
