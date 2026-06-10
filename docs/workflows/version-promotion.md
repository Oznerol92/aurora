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

2. **Promote into `pre-release` through a PR (the default).**
   `pre-release` is branch-protected (PR + status checks). Route the promotion through a PR
   rather than a direct push, so the gate runs instead of being bypassed:

   ```sh
   gh pr create --base pre-release --head <work-branch> \
     --title "Promote <work-branch> into pre-release" --fill
   # wait for required checks to pass, then:
   gh pr merge <work-branch> --merge        # or --rebase to keep a linear history
   ```

   **Direct fast-forward is the exception** — only when explicitly confirmed (e.g. a hotfix and
   protection is intentionally relaxed). It bypasses the gate, so never make it the default:

   ```sh
   git checkout pre-release
   git merge --ff-only origin/pre-release     # reconcile any stale local pre-release
   git merge --ff-only <work-branch>
   git push origin pre-release                # bypasses branch protection — confirm first
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

## Versioning & tagging (sync model)

The version in `package.json` tracks the branch: a `vMAJOR.MINOR.PATCH` work branch keeps
`package.json` at the matching `MAJOR.MINOR.PATCH`. This is what makes `aurora --version` and
`/version` honest per branch, and it satisfies `release.yml`'s "tag matches package.json" gate.

- **On a work branch**, bump `package.json` to the branch's number as part of the work (not at
  the very end), so the running version is never stale.
- **Tag only at a deliberate release.** A pushed `v*` tag fires `.github/workflows/release.yml`
  (GitHub Release + npm publish-attempt) — so tag when the line is actually shipped, not on every
  branch cut:

  ```sh
  # version already bumped + CHANGELOG stamped; from the released branch:
  git tag v<version> && git push origin v<version>
  ```

  The tag must equal `package.json` (the workflow fails otherwise). Branch names alone are **not**
  releases — `v0.3.1`…`v0.3.12` were branch milestones and were never tagged; the line starts
  cutting real tags at `v0.3.13`.

## Guardrails

- **Promote through a PR by default; direct fast-forward only when explicitly confirmed.**
  A direct push to `pre-release` bypasses branch protection — the review-gated PR is the default,
  matching PRs #1–#3.
- **Pushing the next version branch is not part of this flow** unless explicitly requested.
- Before creating a new version branch, double-check it is actually the next available
  number across local branches, remote branches, and tags.
