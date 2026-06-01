# Changelog

All notable changes to Aurora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
