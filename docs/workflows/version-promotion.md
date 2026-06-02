# Version-promotion workflow

The repeatable flow for closing out a version branch and opening the next one.
Trigger phrase: **"promote to v0.3.x"** (or "move on to v0.3.x").

## Roles of the branches

- `vMAJOR.MINOR.PATCH` (e.g. `v0.3.3`) — a single version's work branch.
- `pre-release` — the integration branch all finished version work fast-forwards into.
- `release` — the published/stable branch (promoted from `pre-release` when shipping).
- New version branches (e.g. `v0.3.4`, `v0.3.5`) carry forward in-progress, not-yet-shipped
  directories (e.g. `to-implement/`) that must survive the promotion.

## Steps (current branch = the finished work branch, e.g. `v0.3.3`)

1. **Push the work branch** so the remote has the final commits:
   ```sh
   git push origin <work-branch>      # often already in sync — a no-op is fine
   ```

2. **Bring `pre-release` up to date, then fast-forward in the work branch.**
   The work branch descends from `origin/pre-release`, so both merges are clean fast-forwards:
   ```sh
   git checkout pre-release
   git merge --ff-only origin/pre-release     # reconcile any stale local pre-release
   git merge --ff-only <work-branch>
   git push origin pre-release                # the one remote-touching step — confirm before running
   ```
   If `--ff-only` fails, stop and inspect — the branches diverged and need a real review/merge,
   not an automated fast-forward.

3. **Switch to the next version branch and pull `pre-release` in, keeping new directories.**
   A normal merge preserves any directory unique to the version branch (e.g. `to-implement/`):
   it never existed on `pre-release`, so the merge cannot delete it.
   ```sh
   git checkout <next-version-branch>
   git merge --no-edit pre-release
   # verify: the unique dir is still present AND the promoted work landed
   ```
   Resolve any conflicts (typically `package.json` / `README.md` / `CHANGELOG.md`) by keeping
   the promoted work plus the version branch's unique content.

## Guardrails

- **Direct (local) merge only when explicitly confirmed.** Otherwise promote `pre-release`
  via a GitHub PR (the review-gated default, matching PRs #1–#3).
- **Pushing the next version branch is not part of this flow** unless explicitly requested.
- Before creating a new version branch, double-check it is actually the next available
  number across local branches, remote branches, and tags.
