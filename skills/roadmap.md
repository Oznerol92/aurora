---
id: roadmap
title: Plan a coding change from notes (roadmap + todos)
when_to_use: turn notes or a todo list into a code-grounded roadmap and small todos before implementing
tags: [roadmap, plan, notes, todos, decompose, phases, implement, dev, scope]
category: dev
asks: Which notes — a file path, or paste them here? | Which repo or area is this for?
---

Turn freeform notes into a code-grounded roadmap and a list of small todos, then
STOP for human review. This skill is the **decomposition half** only — it does not
write code. The execute loop (implement → verify) is a separate, later step.

1. **Plan.** Get the notes (a file path, or pasted text) and the target repo/area
   — ask if unknown. Treat the notes as the **read-only source of intent**: never
   edit them. Pick a short kebab-case slug for this run.

2. **Ground each item in the real code.** For every note item, search and read the
   actual codebase (grep/read) to find where it lands. A roadmap item that can't
   name real code is a research question, not a todo — flag it as such instead of
   inventing a location.

3. **Write `roadmap.md`** under `./.aurora/runs/<slug>/` — phases, each:

   ```markdown
   ## Phase N: <heading>

   - Goal: <one line>
   - Sites: `src/foo.js:120` (fn `bar`), `src/baz.js`
   - Acceptance: <a testable condition — a test, a command, an observable result>
   ```

   A phase with no testable acceptance is not ready; tighten it or split it out.

4. **Write `todos.md`** under the same dir — one checkbox per unit, each naming its
   files and the acceptance check it satisfies. Keep each unit small enough that its
   diff is reviewable in one sitting; split anything that spans many files or
   concerns. Order them so dependencies come first.

5. **Stop at the human gate.** Present a compact summary — the phases, the todo
   count, and anything you flagged as a research question — and ask for review with
   an `aurora:ask` block (approve / edit / cancel). Do **not** implement anything.
   State plainly that the next step (implementing the todos) runs only after the
   roadmap is approved.

**Verify before you stop:** the notes were not modified; every phase names real
`file:line` sites and has a testable acceptance; every todo is small and
single-concern; un-groundable items are flagged, not faked; nothing was
implemented. Then hand the roadmap back for review.
