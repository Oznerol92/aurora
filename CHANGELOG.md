# Changelog

All notable changes to Aurora are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Telegram exchanges mirror into the terminal.** When a message arrives over
  the Telegram bridge while the REPL is open, the incoming message and Aurora's
  answer (or question) now also render in the terminal — above the pinned prompt,
  without disturbing what you're typing — so a chat started on your phone is one
  shared, visible conversation in both places. The bridge gained an optional
  `mirror` channel (no-op in headless `--serve`); turns were already persisted to
  the shared session, so this is purely live display.
- **Always-listening prompt (type-ahead).** On a real terminal the `you ❯`
  prompt now stays pinned at the bottom and typeable _while Aurora is answering_
  — input is never blocked. Anything you type mid-answer is queued and read at
  the next turn boundary (a confirmation shows it landed); Ctrl-C still
  interrupts the current answer and drops the queued type-ahead. The streamed
  answer renders line-by-line above the pinned prompt (`src/repl-prompt.js`).
  Piped/non-TTY input keeps the old line-by-line flow, so scripts and tests are
  unchanged.
- **Multi-line paste in the REPL.** Pasting a block now collapses to a
  `[Pasted text #N +M lines]` placeholder and is sent as a **single** message,
  instead of arriving as N separate turns that flood the screen. Built on the
  terminal's bracketed-paste mode; the full text is restored when you press
  Enter. Paste bodies that arrive carriage-return-separated (VTE/GNOME Terminal,
  xterm) are normalized so they collapse correctly instead of splitting per line.
  Single-line pastes are unchanged, piped/non-TTY input is untouched, and it can
  be turned off with `AURORA_NO_PASTE`.
- **Back-and-forth questions + finish recaps.** Aurora can now talk back at turn
  boundaries instead of guessing: when a decision or missing fact would change
  what it produces, it asks rather than assumes. In the terminal the question
  appears as a numbered popup; over Telegram it arrives as numbered options you
  reply to. Your answer is fed straight back into the same session, looping until
  nothing is left to ask. When a turn finishes, Aurora pushes a recap to Telegram
  — what it did plus any action items for you. Built on a small `aurora:ask` /
  `aurora:done` protocol (`src/protocol.js`); the raw JSON is never shown.
- **First-run setup.** On first launch the CLI asks whether to save
  conversations and where (global vs project), showing hints based on what's
  installed — SQLite is offered only when `better-sqlite3` is present, otherwise
  it points at `npm install better-sqlite3`. Runs once; change anytime with
  `/store`.
- **Shared conversation across CLI and Telegram.** With a store enabled, the
  REPL and the Telegram bridge attach to one **active session**: a chat you
  start on Telegram is picked up (and replayed) when you open the CLI, and
  vice-versa. `/new` on either side starts a fresh shared thread. The Telegram
  bridge now persists its turns (previously it saved nothing).
- **Telegram from one command.** Plain `aurora` now starts every available
  listener (the Telegram bridge) in the background alongside the REPL, so a
  single terminal drives both the command line and your phone on one shared
  session — no separate `--serve` process needed. The bridge boots whenever its
  credentials are set, independent of the `/notify` toggle. New **`--solo`** flag
  runs a purely-local REPL that starts no listeners (use it for a second terminal
  so it doesn't double-poll Telegram). `--serve` remains the headless, no-REPL
  server.
- **Conversation history.** With persistence on (`/store json` or `sqlite`),
  `/history` lists saved conversations — each with a one-line preview of its
  opening message — and `/resume [id]` reattaches to one (no id resumes the most
  recent), reconnecting the provider session and replaying the saved turns.
- **Export.** `/export [id]` writes a conversation to a Markdown file (titled
  from its opening message) — a portable artifact of a research session.
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
- **Method "brain."** Aurora now writes and researches by a curated corpus of
  method cards under `brain/`. A compact index of every card is injected at the
  start of each session, and on every turn the cards most relevant to your
  message (scored locally on tags/title/body — no network) are pulled into
  context. Manage it with `/brain [list | show <id> | why <text> | on | off]`;
  `/brain why <text>` previews which cards a message would pull.
- **Voice profile (persona).** A one-time, optional questionnaire captures how
  you write (values, voice rules, do/don't, sample phrases). Aurora then writes
  in your voice while silently fixing typos — never flattening you into generic
  AI prose. Stored in the active store (never in `config.json`). Manage with
  `/persona [show | set <field> <value> | ingest <file> | clear | on | off]`.

### Fixed

- **Finish recap previewed the wrong end of the turn.** The Telegram "Aurora
  finished a turn" note (sent when a turn has no `aurora:done` block) sliced the
  start of the full streamed narration, so for a tool-using turn it surfaced the
  opening preamble ("On it, let me…") — which read as stale, in-progress "old
  output" — and dropped the conclusion. It now previews the turn's final result
  message, and a clipped preview ends in an ellipsis.

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
- The brain is no longer a single always-on digest (which silently truncated at
  6 KB and left most cards dormant). Every card is now reachable via per-turn
  retrieval; `priority` is only a ranking tiebreaker.

### Removed

- `release-please` automation, in favor of the manual, review-gated promotion
  model above.
- The `to-implement/sito_didattico` teaching-site sources — their method content
  is now encoded in the `brain/` corpus, the canonical source.

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
