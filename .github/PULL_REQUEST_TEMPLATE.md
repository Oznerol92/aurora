<!--
Target branch:
  - day-to-day work → base this PR on `pre-release`
  - promoting a release → PR `pre-release` into `release` (stable)
Both branches are protected and need an approving review + green CI to merge.
A clear, Conventional-Commit-style title (feat:/fix:/docs:/chore:) keeps the
CHANGELOG tidy, but versioning is done by hand at release time.
-->

## What & why

<!-- What does this change do, and what problem does it solve? -->

## How it was tested

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] Smoke-tested the CLI (`node bin/aurora.js --help` / `--version`)

## Checklist

- [ ] Targets the right branch (`pre-release` for work, `release` for promotion)
- [ ] No secrets, tokens, or `.env` contents are committed
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if behavior changed
- [ ] Docs updated (README / comments) if behavior changed
