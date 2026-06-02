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

`report.js` is the read-friendly view. It scans every `results/<runId>/`, folds
in each run's `metrics.json` (if graded), and writes a single self-contained
`results/index.html` — no server, no network, no build step. Open it straight
from disk. The page carries interactive ARM-vs-baseline charts (one per metric,
averaged per model), a sortable scoreboard, and a sidebar to navigate every run
and every individual output with its research text rendered as styled markdown.
Re-run it any time after grading to refresh.

`run.js` shells out to the local `claude` CLI with `--model`, the same way Aurora invokes Claude. Web tools (`WebSearch`, `WebFetch`) are enabled for **both** conditions, so the only difference between ARM and baseline is the discipline in the system prompt.

## Scoring

- **`grade.js` (automated):** length, citations, link-resolve rate, vague-attribution count, disclaimer count, ARM tag compliance, cost, latency. Cheap and objective.
- **Judge panel (manual / orchestrated):** the qualitative dimensions in `rubric.md` need a model. Run an odd panel (≥3) of independent judges per output, score blind to condition, take the median. This is a natural multi-agent **workflow** step.
- **Paraphrase-fidelity check:** sample cited URLs per output and verify the source _actually supports_ the claim. Highest-value check; also model-assisted.

## Adding a model

1. Add an entry to `models.json` under `models` and put its id in `active[]`.
2. If it's another Claude tier (`haiku`), it works immediately via the `claude-cli` adapter.
3. For a new vendor (OpenAI, Gemini), implement its adapter in `run.js` (`ADAPTERS`). These adapters call the vendor API **directly from the benchmark** — they do NOT add a provider to Aurora itself, which stays Claude-only by design.

## Status

Scaffold is in place and `opus`/`sonnet` are wired. Not yet run end-to-end — the first pass will shake out the `claude --output-format json` field names (`run.js` parses defensively) and the regex thresholds in `grade.js`.
