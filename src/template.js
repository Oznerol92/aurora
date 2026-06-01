export const TEMPLATE = `# The Aurora Research Method

> **A modular system for running serious research with an AI.**
> Six building blocks. Combine them for any domain. Provider-neutral — works the same whether Aurora is backed by Claude, GPT, Gemini, or a local model.

---

## How to use this

1. Skim the **6 modules** below — each is a self-contained building block.
2. For a real project, paste modules **1 → 5** into a single message (in order), filling the \`[BRACKETED PLACEHOLDERS]\`.
3. Send it as **one** deep-research request.
4. When the answer comes back, run **Module 6 (Audit)** as a checklist on it.
5. Find the gaps. If a *Category A* gap exists, run one targeted follow-up.

That's the loop: **first pass → audit → identify gaps → closing pass.**

---

## MODULE 1 — Opening
> Frame the research neutrally. Ask for a map of the territory, not a verdict.

\`\`\`
I need an exploratory, neutral research mapping of [DOMAIN/TOPIC]
covering [TIME RANGE, e.g. 2024-2026].

Context: I'm working on [BRIEF, NON-LEADING DESCRIPTION] — keep this
neutral, do NOT pre-load the conclusion you expect.

I'm NOT asking for "best practices" or "what works best." I want the
actual territory: dominant patterns, emerging alternatives, documented
failures, constraints (regulatory/economic/technical), trade-offs.

Bias-minimisation rules:
- Don't filter by what's commonly recommended
- Don't pre-confirm my framing
- Surface contested or unsettled areas explicitly
- Where schools of thought compete, present them side by side
\`\`\`

## MODULE 2 — Domains
> List the macro-areas to cover, broadly. Aurora can't fill a category you never asked for.

\`\`\`
Cover these macro-areas with mapping depth (landscape, not a textbook):

1. [MACRO-AREA 1] — sub-aspects: [3-5]
2. [MACRO-AREA 2] — sub-aspects: [3-5]
[continue for 8-15 areas]

For each area output:
- 2-4 paragraphs of synthesis
- 1 table of dominant tools/players/patterns (status, cost, dates)
- 3-5 verifiable primary-source links
\`\`\`
*Calibration:* 5-7 areas = light · 8-12 = standard · 13-18 = deep · 18+ = split into sessions.

## MODULE 3 — Citations
> Force primary sources. This one instruction filters most slop.

\`\`\`
For every claim, cite a primary source with link, author/org, and date.
Acceptable: official docs, peer-reviewed papers (DOI), named conference
talks (with year), dated blog posts by a named author, regulatory/court
filings, postmortems, company filings (10-K/S-1), named industry reports.

NOT acceptable: "reports indicate…", "most experts say…", Wikipedia for
contested/current topics, AI summaries of AI summaries.

If you can't cite a primary source for a claim, write
"primary source unavailable" rather than citing a vague secondary.
\`\`\`

## MODULE 4 — Disclaimers
> Reverse the incentive to fill gaps with confident speculation.

\`\`\`
Where public data is thin or absent, DECLARE IT rather than filling
with filler:
- Covered in adjacent fields but not this one? Say so + where patterns transfer from.
- Too recent for consensus? Mark "emerging, contested" + timeframe.
- Known but unverifiable? "documented at [X] but not independently verified".
- No useful data? Leave it "no public data available".

Sections WITH honest limitation notes are more valuable than those without.
\`\`\`

## MODULE 5 — Emerging Patterns
> Permission to surface what you didn't think to ask. Usually the highest-yield section.

\`\`\`
End with a section "EMERGING PATTERNS NOT EXPLICITLY REQUESTED."
Surface 5-10 patterns/trends from [TIME RANGE] that are relevant but were
NOT in Module 2 — emerging, contested, niche, or counterintuitive.
For each: name it, 2-3 sentences of context, 1-2 primary sources, and a
maturity tag (experimental / emerging / production).
\`\`\`

## MODULE 6 — Post-Research Audit
> Don't move on after one answer. Audit it.

- **Density** — enough substance and citations per area? If thin, the model didn't engage — re-prompt with a stronger Module 1.
- **Citations** — spot-check 5-10 claims: does the source exist, say what's claimed, and fall in range? >20% fail ⇒ treat the whole output as suspect.
- **Disclaimers** — *zero* disclaimers across many areas means it's bluffing somewhere; 2-5 honest ones is healthy realism.
- **Categorise findings 1-5** — 5: direction-changing · 4: substantive-new · 3: confirms a hunch · 2: marginal · 1: filler.
- **Gaps** — **A**: run another session (big territory, literature exists) · **B**: closes during the work · **C**: needs direct/local consultation.
- **Anti-demoting discipline** — for anything you labelled "minor/edge case," re-interrogate *why* it's minor. Most under-researched areas were quietly demoted in the audit, not missed in the prompt.

---

### When to use this
Complex, shifting domains · multi-month commitments where the territory matters · areas where acting on incomplete info is expensive.

### When *not* to
Simple factual lookups · well-documented questions · binary A-vs-B comparisons · 10-minute decisions.

---

*Aurora gives you a high-density, well-cited **landscape map** — not a finished report. The synthesis, and the judgement, stay yours.*
*Type \`/template\` to show this again, or just start chatting.*`;
