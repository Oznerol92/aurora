# Changelog

All notable changes to Aurora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Test suite.** Zero-dependency `node --test` specs under `test/` covering the
  `.env` loader, config load/save/redaction, and the research template. Run with
  `npm test`.
- **Linting & formatting.** ESLint (flat config) + Prettier, wired into CI via
  `npm run lint` and `npm run format:check`. `npm run format` / `lint:fix` apply
  fixes locally.
- **Automated releases.** `release-please` (`.github/workflows/release-please.yml`)
  now drives versioning from Conventional Commits: it maintains a release PR that
  bumps `package.json`, updates this changelog, and tags the release on merge.
  Replaces the manual `npm version` step.
- **Dependabot** (`.github/dependabot.yml`) for weekly, grouped npm and
  GitHub-Actions updates.
- **Issue & PR templates** under `.github/` (bug report, feature request, and a
  PR checklist that nudges Conventional Commit titles).

### Changed

- CI now lints, checks formatting, and runs the test suite (in addition to the
  byte-check and CLI smoke tests).
- `.github/workflows/release.yml` now triggers on `release: published` (created
  by release-please) and only verifies the tag and publishes to npm, rather than
  firing on a raw `v*` tag push and creating the GitHub Release itself.

## [0.3.0] - 2026-06-01

### Added

- **npm publishing.** The release workflow now has a conditional `npm publish`
  step (with provenance). It no-ops until an `NPM_TOKEN` repo secret is added,
  so releases stay GitHub-only by default. See the README for setup.
- CI now verifies the publish tarball (`npm pack --dry-run`) so packaging
  mistakes surface before a release.
- README: branch-protection setup for `master` (UI + `gh` command).

### Changed

- `CHANGELOG.md` is now included in the published package.

## [0.2.0] - 2026-06-01

### Added

- **Server mode.** `npm start` now runs `aurora --serve`, which starts every
  configured inbound listener and keeps them running. `src/serve.js` holds a
  listener registry so future webhooks slot in without touching the CLI.
- `npm run chat` opens the interactive REPL (since `npm start` is now the
  server).
- CI workflow (`node --check` + CLI smoke tests on Node 18/20/22) and a
  tag-driven GitHub release workflow.

### Changed

- `aurora --telegram` is now an alias for `aurora --serve`.
- `--version` reads from `package.json` instead of a hardcoded string.

## [0.1.0] - 2026-06-01

### Added

- Initial release: research-oriented AI chat CLI with a pluggable provider
  layer (Claude via the `claude` CLI), optional persistence (`none`/`json`/
  `sqlite`), Telegram notifications, and a two-way Telegram bridge.

[Unreleased]: https://github.com/Oznerol92/aurora/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Oznerol92/aurora/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Oznerol92/aurora/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Oznerol92/aurora/releases/tag/v0.1.0
