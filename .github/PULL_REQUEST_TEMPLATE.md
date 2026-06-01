<!--
Aurora uses Conventional Commits for the PR *title* — release-please reads it to
decide the next version and to write the changelog. Examples:
  feat: add OpenAI provider          (→ minor bump)
  fix: don't crash on unreadable .env (→ patch bump)
  feat!: rename --telegram to --serve (→ major bump; ! marks a breaking change)
Other valid types: docs, chore, refactor, test, ci, build, perf.
-->

## What & why

<!-- What does this change do, and what problem does it solve? -->

## How it was tested

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] Smoke-tested the CLI (`node bin/aurora.js --help` / `--version`)

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] No secrets, tokens, or `.env` contents are committed
- [ ] Docs updated (README / comments) if behavior changed
