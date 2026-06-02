# The Perplexity Pro Research Template

> **A modular system for running serious research projects with AI.**
> 
> Six building blocks. Combine them for any domain. Free to use, adapt, share.
>
> Companion to the article: *I Spent $60 on Perplexity Pro. The Output Would Have Cost Me $15,000+ from Consultants.*

---

## How to use this template

1. Read the 6 modules below. Each one is a self-contained building block.
2. For your research, copy the modules into a single prompt (in order: Opening → Domains → Citations → Disclaimers → Emerging Patterns).
3. Fill in the `[BRACKETED PLACEHOLDERS]` with your specifics.
4. Run as a single Perplexity Pro deep research query.
5. After you receive the output, run **Module 6 (Post-Research Audit)** as a checklist on what came back.
6. Identify gaps. If gaps exist in Category A, run a second targeted research session.

This is the 4-step workflow described in the article: First pass → Audit → Identify gaps → Closing pass.

**A note on the runtime**: this template is calibrated for the Perplexity API in the `advanced-deep-research` preset (pay-per-token, $50 minimum top-up). It also works with the Perplexity Pro consumer subscription, but expect ~30% lower output density and shallower reasoning. The exact API request structure I use is at the bottom of this document. The Pro Edition has the full configuration reference.

---

## MODULE 1 — Opening

> **Purpose**: establish intent, frame the research neutrally, signal you want exploratory mapping not prescriptive answers.

```
I need an exploratory neutral research mapping of [DOMAIN/TOPIC] 
covering [TIME RANGE, e.g., 2024-2026]. 

Context: I'm working on [BRIEF NON-LEADING DESCRIPTION OF PROJECT 
OR DECISION — keep this neutral, do NOT pre-load conclusions you 
expect].

I am NOT asking for "best practices" or "what works best". I want a 
map of the actual territory: dominant patterns, emerging alternatives, 
documented failures, regulatory/economic/technical constraints, 
trade-offs, anti-patterns.

Bias minimization rules:
- Do not filter by what is commonly recommended
- Do not pre-confirm my framing or assumptions
- Surface contested or unsettled areas explicitly
- When the field has competing schools of thought, present them 
  side by side without picking a winner
```

**Examples (neutral domains):**

- Fintech: "I need an exploratory neutral mapping of buy-now-pay-later regulation in the EU 2024-2026..."
- Biotech: "I need an exploratory neutral mapping of CAR-T therapy commercialization patterns 2023-2026..."
- Climate-tech: "I need an exploratory neutral mapping of direct air capture commercial pricing dynamics 2024-2026..."

---

## MODULE 2 — Domains

> **Purpose**: list the macro-areas you want covered without pre-filtering them. Generate this list broadly. If you're missing 30% of the relevant categories, the AI cannot fill what you didn't ask for.

```
Cover the following macro-areas with mapping depth (not deep teaching, 
but landscape mapping with concrete references):

1. [MACRO-AREA 1] — sub-aspects: [list 3-5 sub-aspects you want surfaced]
2. [MACRO-AREA 2] — sub-aspects: [list 3-5]
3. [MACRO-AREA 3] — sub-aspects: [list 3-5]
[continue for 8-15 macro-areas]

For each area, output:
- 2-4 paragraphs of synthesis
- 1 table of dominant tools/players/patterns/regulations with status, 
  cost (if applicable), license/jurisdiction, key dates
- 3-5 verifiable primary source links per area
```

**Calibration tip:**
- 5-7 macro-areas → light mapping (~30-40K characters output)
- 8-12 macro-areas → standard mapping (~40-50K)
- 13-18 macro-areas → deep mapping (~50-60K)
- 18+ macro-areas → output gets thin per area, split into multiple sessions

---

## MODULE 3 — Citations

> **Purpose**: force primary sources. This single instruction filters AI slop by ~90%.

```
For every claim, cite primary sources with link, author/organization, 
and date. Acceptable primary sources:

- Official documentation (with URL)
- Peer-reviewed papers (arXiv, journals, with DOI when available)
- Industry conference talks (GDC, DEF CON, KubeCon, RSA, ACM, etc., 
  with year)
- Specific blog posts with named author and date
- Regulatory filings, court documents, government publications
- Postmortems with named project + named author
- Company filings (10-K, S-1) for financial claims
- Named industry reports (with publisher + date) for market data

NOT acceptable:
- "Industry reports indicate..." without naming the report
- "Most experts say..." without specific named experts
- Wikipedia as primary source for current/contested topics
- AI-generated summaries of other AI-generated content

If for a given claim you cannot cite a primary source, declare 
"primary source unavailable" rather than citing a vague secondary.
```

---

## MODULE 4 — Disclaimers

> **Purpose**: reverse the implicit incentive that makes AI fill gaps with confident speculation.

```
For every macro-area where public data is limited or absent, 
DECLARE THIS EXPLICITLY rather than filling with generic speculation.

Specifically:
- If a topic is covered well in adjacent fields but not specifically 
  in [YOUR DOMAIN], say so and indicate where transferable patterns 
  come from
- If a topic is too recent to have stable consensus, mark it as 
  "emerging, contested" with timeframe
- If a topic has well-known publicly-available answers but you 
  cannot verify them with primary sources, say "documented at [X] 
  but not independently verified"
- If you have no useful data on a sub-area, leave it blank with 
  "no public data available" rather than producing filler

Sections marked with limitation notes are MORE valuable than 
sections without them. Honesty is preferred over completeness 
appearance.
```

---

## MODULE 5 — Emerging Patterns

> **Purpose**: explicit permission for the AI to surface patterns outside the prompt structure. This is consistently the highest-yield section.

```
At the end of the output, include a section titled "EMERGING PATTERNS 
NOT EXPLICITLY REQUESTED."

In this section, surface 5-10 patterns, observations, or trends from 
2024-2026 that:
- Are relevant to the domain mapped above
- Were NOT covered by the macro-areas in Module 2
- Are emerging, contested, niche, or counterintuitive
- May include documented failures, anti-patterns, controversial 
  trends, or futures-leaning experiments

For each pattern: name it, provide 2-3 sentences of context, cite 
1-2 specific primary sources, and indicate maturity (experimental / 
emerging / production-deployed) and realistic relevance scope.

This section is bonus exploration. The goal is patterns I didn't 
know to ask about. Surprise me with substance, not novelty for its 
own sake.
```

---

## MODULE 6 — Post-Research Audit Checklist

> **Purpose**: don't move on after one prompt. Audit the output systematically. This step is what separates serious research from AI slop consumption.

After receiving the output, run this checklist (allow 30-45 minutes per session):

### A. Density Check

| Metric | Threshold | Your Output |
|---|---|---|
| Total characters | ≥40,000 | _____ |
| H2 clusters | ≥14 | _____ |
| H3 sub-clusters | ≥50 | _____ |
| Citations per macro-area | ≥3 verifiable primary | _____ |

If any below threshold: the model didn't engage seriously. Re-prompt with stronger Module 1 framing.

### B. Citation Check

For 5-10 random claims in the output, verify:
- Does the cited source exist? (Click the link)
- Does the source say what the AI says it says?
- Is the source dated within your specified time range?

If >20% of spot-checked citations fail: treat the entire output as suspect. Re-run with stronger Module 3 instructions.

### C. Disclaimer Check

Count sections labeled "limited data," "primary source unavailable," "emerging contested," etc.

- 0 disclaimers in 14+ macro-areas = the AI is bullshitting somewhere. Treat output as suspect.
- 2-5 honest disclaimers = healthy realism. Trust the rest more.
- 8+ disclaimers = either your domain is genuinely poorly documented, or your prompt was too narrow.

### D. Categorize Findings (1–5)

Go through every notable claim in the output and tag:

- **Category 5** — Direction-changing. Shifts your project's trajectory or assumptions.
- **Category 4** — Substantive. New information you didn't have, materially useful.
- **Category 3** — Confirmation of what you already suspected.
- **Category 2** — Marginal information, useful but minor.
- **Category 1** — Filler, generic, low-value.

Healthy distribution: 5–10% Cat 5, 15–25% Cat 4, rest Cat 3–2–1. If <5% Cat 4–5: the area is over-mapped or your prompt was off. If >30% Cat 4–5: you found a richly under-explored vein.

### E. Identify Gaps (Categories A/B/C)

For each major area not satisfactorily covered:

- **Category A — Run another research session.** Big territory missing, public literature exists.
- **Category B — Closes during work.** Specific implementation details, will surface during the project.
- **Category C — Won't close from external research.** Local context, very emerging, needs direct consultation.

### F. Anti-Demoting Discipline

For any finding that on first pass you label "minor" / "edge case" / "not blocking":

**Stop. Re-interrogate the implicit framing under which it's minor.**

If the framing is implicit and convenient, force it explicit. Then decide if the finding is actually minor or if you're unconsciously demoting it to keep your scope manageable.

This is the highest-leverage discipline in the entire workflow. Most under-researched areas are not "areas you didn't think to ask about" — they're "areas you implicitly demoted in audit."

---

## When to run a closing research session

After the audit, ONLY for Category A gaps:

- Prompt structure: same 5 modules above, but narrowed to specific gaps with explicit reference to what the first session covered
- Cost: typically $3-5 per closing session
- After closing session: final audit, then move on

If after the closing session you still have Cat A gaps, the domain may be poorly documented — proceed with what you have and treat remaining gaps as Category B or C.

---

## When NOT to use this template

- Simple factual questions ("What's the syntax for X?")
- Well-documented domains where official docs answer in 5 minutes
- Binary decisions where you just need to compare A vs B
- Time-pressured single decisions (10-minute answers)

Use this template for: complex domains with shifting state, multi-month commitments where the territory matters, areas where mistakes from incomplete information are expensive.

---

## API request reference

For the `advanced-deep-research` preset, the request structure that produced the results in the article:

```json
{
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "<paste your assembled prompt — Modules 1-5 — here>"
    }
  ],
  "stream": false,
  "preset": "advanced-deep-research",
  "max_output_tokens": 128000,
  "reasoning": {
    "effort": "high"
  },
  "tools": [
    { "type": "web_search" },
    { "type": "fetch_url" }
  ]
}
```

Endpoint: `POST https://api.perplexity.ai/v1/responses`. Bearer auth with your API key. The Pro Edition has a full curl example, follow-up patterns for chaining with downstream LLMs, and notes on cost variance by configuration.

Brief warning on cost: API billing is per-token and complex sessions can run higher than the ~$3 average. Watch the dashboard. Configurations that change reasoning effort, max output tokens, or tool sets all affect price and quality — worth experimenting if you have headroom in your budget.

---

## Examples Library

### Example 1 — Fintech regulation

```
I need an exploratory neutral research mapping of cross-border 
buy-now-pay-later regulation in the EU 2024-2026.

Context: I'm evaluating market entry feasibility for a fintech 
product targeting EU consumers. I am NOT asking which countries 
are best to enter — I want the regulatory map.

[Modules 2-5 customized for: regulators per country, BNPL-specific 
laws vs general consumer credit law, recent enforcement cases, 
compliance tooling vendors, emerging EU-level harmonization, 
documented compliance failures by named operators]
```

### Example 2 — Biotech commercialization

```
I need an exploratory neutral research mapping of CAR-T therapy 
commercialization patterns 2023-2026.

Context: I'm researching commercial dynamics in the cell therapy 
space. I am NOT asking which therapies will succeed — I want the 
landscape.

[Modules 2-5 customized for: pricing models, payer negotiation 
patterns, manufacturing capacity bottlenecks, named clinical trials 
recent results, regulatory paths in US/EU/Japan, post-launch real 
world data publications, documented commercial failures]
```

### Example 3 — Climate-tech market dynamics

```
I need an exploratory neutral research mapping of direct air capture 
commercial pricing dynamics 2024-2026.

Context: I'm evaluating market structure in carbon removal. I am 
NOT asking which DAC company will win — I want the cost/pricing 
landscape.

[Modules 2-5 customized for: cost-per-ton actual reported numbers, 
named project economics, IRA/EU tax credit impact, voluntary market 
prices, compliance market signals, scaling cost curves, documented 
project failures or delays, emerging alternative technologies]
```

---

## Final notes

This template will not produce a finished research document. It will produce a high-density, well-cited landscape map.

The work after the template:
- Read the output carefully
- Synthesize across multiple research sessions
- Make decisions based on the territory
- Apply your domain knowledge to spot what the AI missed

Perplexity Pro is a tool. The template is a workflow. The judgment is still yours.

---

*If you found this useful and want extended examples, troubleshooting, and a worked case study, the Pro version is [available here](https://your-gumroad-link).*

*Free template: use, share, fork. Attribution appreciated but not required.*
