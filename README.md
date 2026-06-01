# Aurora

A research-grade AI chat in your terminal. Aurora opens with the **Aurora Research Method** — a 6-module workflow for running serious, well-cited research — then drops you into a chat.

It's **provider-agnostic** by design: the UI talks to a small provider interface, so new AIs slot in without touching anything else. Today it ships with one backend — **Claude**, driven through your local `claude` (Claude Code) CLI, so it uses your existing subscription auth with no API key.

## Requirements

- Node.js ≥ 18
- The [`claude`](https://docs.claude.com/en/docs/claude-code) CLI installed and signed in (`claude` on your `PATH`)

## Install

```bash
npm install        # install deps
npm link           # makes the `aurora` command available globally (optional)
```

Or just run it directly:

```bash
node bin/aurora.js
```

## Usage

```bash
aurora                      # start a chat (shows the research template first)
aurora --model <name>       # start with a specific model, e.g. claude-sonnet-4-6
aurora --serve              # run as a server: start every configured listener
aurora --help
```

`npm start` runs `aurora --serve` (server mode); `npm run chat` opens the
interactive REPL.

### In-chat commands

| Command                           | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `/help`                           | show commands                                      |
| `/template`                       | show the Aurora Research Method again              |
| `/new`                            | start a fresh conversation (clears context)        |
| `/provider [id]`                  | list providers, or switch backend                  |
| `/model [name]`                   | show or set the model (`/model default` to reset)  |
| `/store [id]`                     | switch persistence; `/store scope global\|project` |
| `/history`                        | list saved conversations (needs persistence on)    |
| `/resume <id>`                    | reattach to a saved conversation                   |
| `/notify [on\|off\|test\|whoami]` | Telegram alerts; `whoami` finds your chat id       |
| `/config`                         | show config path + contents (secrets masked)       |
| `/clear`                          | clear the screen                                   |
| `/exit`                           | quit (or Ctrl-D)                                   |

## How it works

Aurora drives the `claude` CLI in headless streaming mode
(`claude -p --output-format stream-json --include-partial-messages`). It mints a
session id on the first turn (`--session-id`) and resumes it on every later turn
(`--resume`), so the conversation keeps its memory until you run `/new`. Aurora
is restricted to read-only + web tools (`WebSearch`, `WebFetch`, `Read`, `Glob`,
`Grep`) — enough to do real research, but it can't modify your files from a chat.

Config lives at `~/.config/aurora/config.json`.

## Persistence (optional)

**On first launch**, Aurora runs a one-time setup that asks whether to save your
conversations and where, recommending SQLite when `better-sqlite3` is installed
(and pointing you at how to install it otherwise). You can skip it and stay
stateless, then change your mind anytime with `/store`.

Aurora is **stateless by default** (`store: "none"`). If you want conversations
to survive restarts, pick a local backend — the choice is yours:

| Backend   | Select          | Notes                                                                            |
| --------- | --------------- | -------------------------------------------------------------------------------- |
| None      | `/store none`   | Default. Nothing is written.                                                     |
| JSON file | `/store json`   | Zero native deps, fully portable. Good for a personal log.                       |
| SQLite    | `/store sqlite` | Faster at scale. Requires `npm install better-sqlite3` (an optional dependency). |

Once a backend is on, every turn is saved. **`/history`** lists past
conversations and **`/resume <id>`** reattaches to one (the short id from
`/history` is enough) so you can pick a research thread back up.

**One conversation across the CLI and Telegram.** With a store enabled, the REPL
and the `--serve` Telegram bridge attach to the same _active session_: a chat
you start on Telegram is shown and picked up the next time you open `aurora` on
the command line, and what you type in the terminal continues on Telegram.
`/new` on either side starts a fresh shared thread. (SQLite is recommended if
you'll have the server and the CLI running at the same time — it handles
concurrent writes; the JSON store is best for one-at-a-time use. Full model
context carries over only when both are launched from the same directory, since
the `claude` CLI scopes its own session state per directory — but the message
history always replays regardless, because Aurora stores it itself.)

**Where the data lives** — two scopes, switched with `/store scope`:

| Scope              | Location                 | When to use                                           |
| ------------------ | ------------------------ | ----------------------------------------------------- |
| `global` (default) | `~/.config/aurora/data/` | One searchable research log across every directory.   |
| `project`          | `./.aurora/` in the cwd  | Keep a separate history alongside a specific project. |

A `./.aurora/` directory that already exists is picked up automatically (like
`git` finding `.git`). Data is never committed — `.gitignore` covers it.
Switching backends or scopes is non-destructive; each keeps its own file.

## Notifications (optional)

Aurora can ping you on **Telegram** when a turn finishes — handy for long
research runs. Enable with `/notify on`, test with `/notify test`.

```bash
export TELEGRAM_BOT_TOKEN=...   # from @BotFather
export TELEGRAM_CHAT_ID=...     # your chat id
```

Don't know your chat id? Set just the bot token, send your bot any message,
then run **`/notify whoami`** — Aurora calls `getUpdates` and prints the chats
that have messaged your bot, ready to paste into your `.env`. (Aurora never
writes secrets — token or chat id — to disk; they live only in the environment.)

### Server mode (listeners)

Run Aurora as a long-running server that accepts inbound messages:

```bash
npm start            # = aurora --serve
aurora --serve
```

This starts every **listener** that's configured. A listener is any inbound
channel that feeds messages through the AI. Today there's one — the two-way
**Telegram bridge** — but the runner (`src/serve.js`) is built so future
webhooks slot in without touching the CLI: add an entry to the `LISTENERS`
array with a `name`, an `available()` check, and a `start()` function, and
`npm start` will pick it up. Listeners whose credentials are missing are skipped
(logged), not crashed; if nothing is configured, the server exits with an error.

The **Telegram bridge** long-polls for messages, runs each through the AI, and
replies on Telegram. Send `/new` to start a fresh conversation. **Security:**
only messages from your `TELEGRAM_CHAT_ID` are processed — a public bot can be
messaged by anyone, so every other sender is ignored, and the bridge refuses to
start without that id. (`aurora --telegram` still works as an alias for
`--serve`.)

## Security

This is an open-source repo, so it's built to be safe to publish and share:

- **Secrets never touch disk.** The bot token and chat id are read _only_ from
  the environment (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optionally via a
  gitignored `.env`). Aurora never writes them to `config.json`. `.gitignore`
  covers `.env`, `*.sqlite`, `*.db`, `data/`, and `.aurora/`.
- **Secrets are never logged** — not in `/config`, not on API errors.
- **Config file is `chmod 600`** (owner-only) since it may hold a token.
- **No injection surface.** SQLite uses parameterized queries; Telegram messages
  are sent as plain text (no `parse_mode`); the notifier uses HTTPS with a hard
  timeout and fails safe without breaking the chat.
- **Least privilege at runtime.** The Claude backend runs read-only + web tools
  only (see _How it works_), so a chat can't modify your files.

## Adding another AI later

The provider layer is already scalable. To add, say, OpenAI:

1. Create `src/providers/openai.js` with a class extending `Provider`
   (`src/providers/base.js` documents the contract: an async `send()` that
   yields `status` / `delta` / `done` events, plus `reset()`).
2. Register it in `src/providers/index.js`.

Nothing in the CLI or UI needs to change — `/provider openai` will just work.

## Versioning & releases

Aurora follows [Semantic Versioning](https://semver.org). `package.json` is the
single source of truth for the version (`--version` reads it).

### Branch model

Two long-lived branches, with every change promoted through approved PRs:

```
work branch (e.g. vX.Y.1) ──PR──▶ pre-release ──PR──▶ release
        (your approval)              (your approval)
```

- **`release`** — stable. Tagged on the major line (`v1.0.0`, `v2.0.0`, …).
- **`pre-release`** — integration / pre-release. Tagged on the minor line
  (`v0.1.0`, `v0.2.0`, …); these ship as GitHub pre-releases.
- **work branches** — one per change, branched off `pre-release`. Name them with
  the patch they carry (`v0.4.1`, …); `.0` is reserved for tags, so a work
  branch never collides with a tag.

Both `pre-release` and `release` are protected: a merge needs **your approving
review** and green CI. (`release` is the default branch; `master` is retired.)

**Continuous integration** (`.github/workflows/ci.yml`) runs on pushes to those
branches and on every PR into them: it lints (`eslint`), checks formatting
(`prettier`), runs the test suite (`node --test`), byte-checks every source
file, and smoke-tests the CLI across Node 18/20/22. Run the same checks locally:

```bash
npm run lint          # eslint
npm run format        # prettier --write (or `npm run format:check` to verify)
npm test              # node --test
```

**Cutting a release** — once a PR is merged into the target branch, a maintainer
bumps the version, records the changes, and pushes a tag:

```bash
# from pre-release (minor / pre-release) or release (major / stable):
npm version 0.4.0 --no-git-tag-version   # bump package.json
# move the [Unreleased] notes into a new section in CHANGELOG.md, then:
git commit -am "Release v0.4.0"
git tag v0.4.0 && git push --follow-tags
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which verifies the
tag matches `package.json`, re-runs the checks, creates the GitHub Release
(automatically marked **pre-release** for `0.x` / `-rc` tags), and publishes to
npm. Keep [`CHANGELOG.md`](CHANGELOG.md) up to date under `[Unreleased]` as you
go.

### Publishing to npm (optional)

The release workflow also has an `npm publish` step. It **no-ops by default** —
so releases stay GitHub-only — and starts publishing once you add an npm token:

1. Create an [npm automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens).
2. Add it as a repo secret named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions).

From then on, each tagged release publishes `aurora-cli` to npm with
[provenance](https://docs.npmjs.com/generating-provenance-statements). Stable
tags publish under `latest`; pre-release (`0.x` / `-rc`) tags publish under the
`next` dist-tag so they never displace `latest`. (The package name `aurora-cli`
must be available/yours.)

### Protecting the branches

Both long-lived branches require an approving review **and** green CI before a
merge. Set this once with the GitHub CLI (run for each branch):

```bash
for branch in pre-release release; do
  gh api --method PUT "repos/Oznerol92/aurora/branches/$branch/protection" --input - <<'JSON'
{ "required_status_checks": { "strict": true,
    "contexts": ["check (node 18)", "check (node 20)", "check (node 22)"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null }
JSON
done
```

Then make `release` the default branch (**Settings → Branches**, or
`gh repo edit --default-branch release`) and delete the retired `master`.

## Layout

```
bin/aurora.js            entry point
src/cli.js               REPL loop, slash commands, lifecycle
src/serve.js             server mode: listener registry (`npm start` / --serve)
src/setup.js             first-run questionnaire (pick a store, install hints)
src/bridge/
  telegram.js            two-way Telegram bridge (a listener)
src/ui.js                banner, markdown rendering, spinner, styling
src/template.js          the Aurora Research Method (startup screen)
src/config.js            load/save ~/.config/aurora/config.json
src/providers/
  base.js                Provider interface (the contract)
  claude.js              Claude backend via the claude CLI
  index.js               provider registry
src/store/               optional persistence (pluggable, opt-in)
  base.js                Store interface (the contract)
  none.js / json.js / sqlite.js   backends
  index.js               store registry
  location.js            data-dir resolution (global vs project ./.aurora)
  session.js             shared "active session" (CLI ⇄ Telegram continuity)
  persist.js             save a turn exchange (shared by CLI + bridge)
src/notify/
  telegram.js            optional Telegram notifier
test/                    node --test specs (env, config, store, session, …)
```
