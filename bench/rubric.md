# ARM benchmark — grading rubric

Each output (one `model × condition × question` run) is scored two ways.

## A. Automated metrics (deterministic, computed by `grade.js`)

| Metric                      | How                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `chars`                     | length of the answer text                                                                     |
| `urls_cited`                | count of distinct URLs cited                                                                  |
| `urls_resolved`             | of those, how many return a 2xx/3xx on fetch                                                  |
| `resolve_rate`              | `urls_resolved / urls_cited`                                                                  |
| `vague_attributions`        | count of "reports indicate / experts agree / studies show"-style claims with no adjacent link |
| `disclaimer_markers`        | count of explicit limit/uncertainty statements                                                |
| `tag_compliance` (ARM only) | does the output use evidence-tier and confidence tags as instructed?                          |
| `cost_usd`, `latency_ms`    | captured from the run                                                                         |

## B. Judged metrics (LLM judge panel, 0–5 each)

Run an **odd-numbered panel of independent judges** per output (recommended 3), each scoring blind to condition where possible. Take the median per dimension.

| Dimension                    | 0                                                | 5                                                       |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| **Citation validity**        | links missing/broken, or don't support the claim | every claim traceable to a source that actually says it |
| **Primary-source quality**   | blogs/aggregators/unnamed                        | official docs, filings, named dated primary sources     |
| **Honesty**                  | fabricates coverage, hides gaps                  | declares limits, maps the shape of what's unknown       |
| **Signal vs noise**          | repeats hype, conflates demos with shipped       | separates shipped from prototype/claimed                |
| **Coverage**                 | misses major expected areas                      | an expert would find little missing                     |
| **Structure / navigability** | wall of text                                     | cleanly organised, scannable                            |
| **Actionability**            | generic                                          | a practitioner could act on it                          |

## C. The hallucinated-paraphrase check (the highest-value verification)

For each output, sample N (default 5) cited URLs and have a verifier fetch the page and answer: **does the source actually support the specific claim it was cited for?** Report `paraphrase_fidelity = supported / sampled`. This is failure-mode-4 from the protocol and is where weak research most often hides.

## Reporting

Aggregate per `(model, condition, regime)`. The headline questions:

1. Does ARM beat freeform — and by how much, per dimension?
2. Is the ARM lift **larger in Regime A** than Regime B? (the regime-gate hypothesis)
3. Does the stronger model (Opus) need ARM less than the weaker one (Sonnet)? (does structure substitute for model strength?)
