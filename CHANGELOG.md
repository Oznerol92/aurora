# Changelog

All notable changes to Aurora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **First-run setup.** On first launch the CLI asks whether to save
  conversations and where (global vs project), showing hints based on what's
  installed — SQLite is offered only when `better-sqlite3` is present, otherwise
  it points at `npm install better-sqlite3`. Runs once; change anytime with
  `/store`.
- **Shared conversation across CLI and Telegram.** With a store enabled, the
  REPL and the `--serve` Telegram bridge attach to one **active session**: a
  chat you start on Telegram is picked up (and replayed) when you open the CLI,
  and vice-versa. `/new` on either side starts a fresh shared thread. The
  Telegram bridge now persists its turns (previously it saved nothing).
- **Conversation history.** With persistence on (`/store json` or `sqlite`),
  `/history` lists saved conversations and `/resume <id>` reattaches to one —
  reconnecting the provider session and replaying the saved turns on screen.
- **Project-scoped storage.** `/store scope project` keeps a git-style
  `./.aurora/` history in the current directory; `global` (default) keeps one
  shared log under `~/.config/aurora/data`. An existing `./.aurora/` is picked
  up automatically.
- **Test suite.** Zero-dependency `node --test` specs under `test/` covering the
  `.env` loader, config, store round-trips, session resume, and the research
  template. Run with `npm test`.
- **Linting & formatting.** ESLint (flat config) + Prettier, wired into CI via
  `npm run lint` and `npm run format:check`. `npm run format` / `lint:fix` apply
  fixes locally.
- **Dependabot** (`.github/dependabot.yml`) for weekly, grouped npm and
  GitHub-Actions updates.
- **Issue & PR templates** under `.github/`.

### Changed

- **Release process.** Adopted a two-branch promotion model — work branches →
  `pre-release` → `release`, each gated by an approving PR review. `release` is
  now the stable/default branch and `master` is retired. Versioning is manual at
  tag time; `.github/workflows/release.yml` fires on a pushed `v*` tag, verifies
  it against `package.json`, and marks `0.x`/`-rc` tags as GitHub pre-releases
  (publishing to npm under the `next` dist-tag).
- CI now lints, checks formatting, and runs the test suite (in addition to the
  byte-check and CLI smoke tests), and runs on the `release`/`pre-release`
  branches.

### Removed

- `release-please` automation, in favor of the manual, review-gated promotion
  model above.

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
