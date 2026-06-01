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

| Command | What it does |
|---|---|
| `/help` | show commands |
| `/template` | show the Aurora Research Method again |
| `/new` | start a fresh conversation (clears context) |
| `/provider [id]` | list providers, or switch backend |
| `/model [name]` | show or set the model (`/model default` to reset) |
| `/store [id]` | show or switch persistence (`none` / `json` / `sqlite`) |
| `/notify [on\|off\|test\|whoami]` | Telegram alerts; `whoami` finds your chat id |
| `/config` | show config path + contents (secrets masked) |
| `/clear` | clear the screen |
| `/exit` | quit (or Ctrl-D) |

## How it works

Aurora drives the `claude` CLI in headless streaming mode
(`claude -p --output-format stream-json --include-partial-messages`). It mints a
session id on the first turn (`--session-id`) and resumes it on every later turn
(`--resume`), so the conversation keeps its memory until you run `/new`. Aurora
is restricted to read-only + web tools (`WebSearch`, `WebFetch`, `Read`, `Glob`,
`Grep`) — enough to do real research, but it can't modify your files from a chat.

Config lives at `~/.config/aurora/config.json`.

## Persistence (optional)

Aurora is **stateless by default** (`store: "none"`). If you want conversations
to survive restarts, pick a local backend — the choice is yours:

| Backend | Select | Notes |
|---|---|---|
| None | `/store none` | Default. Nothing is written. |
| JSON file | `/store json` | Zero native deps, fully portable. Good for a personal log. |
| SQLite | `/store sqlite` | Faster at scale. Requires `npm install better-sqlite3` (an optional dependency). |

Data is written under the config dir (`~/.config/aurora/data/`), never inside
the repo. Switching backends is non-destructive — each keeps its own file.

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

- **Secrets never touch disk.** The bot token and chat id are read *only* from
  the environment (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optionally via a
  gitignored `.env`). Aurora never writes them to `config.json`. `.gitignore`
  covers `.env`, `*.sqlite`, `*.db`, and `data/`.
- **Secrets are never logged** — not in `/config`, not on API errors.
- **Config file is `chmod 600`** (owner-only) since it may hold a token.
- **No injection surface.** SQLite uses parameterized queries; Telegram messages
  are sent as plain text (no `parse_mode`); the notifier uses HTTPS with a hard
  timeout and fails safe without breaking the chat.
- **Least privilege at runtime.** The Claude backend runs read-only + web tools
  only (see *How it works*), so a chat can't modify your files.

## Adding another AI later

The provider layer is already scalable. To add, say, OpenAI:

1. Create `src/providers/openai.js` with a class extending `Provider`
   (`src/providers/base.js` documents the contract: an async `send()` that
   yields `status` / `delta` / `done` events, plus `reset()`).
2. Register it in `src/providers/index.js`.

Nothing in the CLI or UI needs to change — `/provider openai` will just work.

## Versioning & releases

Aurora follows [Semantic Versioning](https://semver.org). `package.json` is the
single source of truth for the version (`--version` reads it), and releases are
cut from git tags.

**Continuous integration** (`.github/workflows/ci.yml`) runs on every push to
`master` and on pull requests: it byte-checks every source file and smoke-tests
the CLI across Node 18/20/22.

**Cutting a release** — bump, tag, and push:

```bash
npm version patch          # or minor / major — bumps package.json, commits, tags vX.Y.Z
git push --follow-tags     # pushes the commit and the tag
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which re-runs the
checks, verifies the tag matches `package.json`, and publishes a GitHub Release
with auto-generated notes. (GitHub-only — no npm publish, no extra secrets.)
Record notable changes in [`CHANGELOG.md`](CHANGELOG.md) as you go.

## Layout

```
bin/aurora.js            entry point
src/cli.js               REPL loop, slash commands, lifecycle
src/serve.js             server mode: listener registry (`npm start` / --serve)
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
src/notify/
  telegram.js            optional Telegram notifier
```
