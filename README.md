# Aurora

A research-grade AI chat in your terminal. Aurora opens with the **Aurora Research Method** — a 6-module workflow for running serious, well-cited research — then drops you into a chat.

It's **provider-agnostic** by design: the UI talks to a small provider interface, so new AIs slot in without touching anything else. Today it ships with one backend — **Claude**, driven through your local `claude` (Claude Code) CLI, so it uses your existing subscription auth with no API key.

Plain `aurora` also brings up a two-way **Telegram bridge** in the background (when configured), so the same conversation follows you to your phone — one command, terminal and Telegram on one shared session.

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
aurora                      # start a chat; also starts the Telegram bridge if configured
aurora --solo               # chat only — don't start any listeners
aurora --model <name>       # start with a specific model, e.g. claude-sonnet-4-6
aurora --serve              # run as a server (no REPL): start every configured listener
aurora --help
```

Plain `aurora` opens the interactive REPL **and** brings up any configured
inbound listener (the Telegram bridge) in the background, so you can talk to
Aurora from your phone while the terminal stays open — both share the one active
session, so it's a single conversation. Use `--solo` for a purely-local chat.
Listeners start on their own credentials, so this is independent of the
`/notify` toggle; with no Telegram credentials set, plain `aurora` is just the
REPL. `npm start` runs `aurora --serve` (headless server, no REPL); `npm run
chat` opens the REPL.

### In-chat commands

| Command                                         | What it does                                            |
| ----------------------------------------------- | ------------------------------------------------------- |
| `/help`                                         | show commands                                           |
| `/template`                                     | show the Aurora Research Method again                   |
| `/new`                                          | start a fresh conversation (clears context)             |
| `/provider [id]`                                | list providers, or switch backend                       |
| `/model [name]`                                 | show or set the model (`/model default` to reset)       |
| `/store [id]`                                   | switch persistence; `/store scope global\|project`      |
| `/history`                                      | list saved conversations, with previews (needs a store) |
| `/resume [id]`                                  | reattach to a conversation (no id = most recent)        |
| `/export [id]`                                  | save a conversation to Markdown (no id = current)       |
| `/notify [on\|off\|test\|whoami\|list\|forget]` | Telegram alerts; `whoami` registers your chat           |
| `/config`                                       | show config path + contents (secrets masked)            |
| `/clear`                                        | clear the screen                                        |
| `/exit`                                         | quit (or Ctrl-D)                                        |

## How it works

Aurora drives the `claude` CLI in headless streaming mode
(`claude -p --output-format stream-json --include-partial-messages`). It mints a
session id on the first turn (`--session-id`) and resumes it on every later turn
(`--resume`), so the conversation keeps its memory until you run `/new`. Aurora
is restricted to read-only + web tools (`WebSearch`, `WebFetch`, `Read`, `Glob`,
`Grep`) — enough to do real research, but it can't modify your files from a chat.

Config lives at `~/.config/aurora/config.json`.

## Talking back: questions & finish recaps

Aurora can hold a real back-and-forth instead of guessing. When a decision, a
preference, or a missing fact would change what it produces, it **stops and
asks** rather than assuming:

- **In the terminal**, the question appears as a numbered popup — type a number
  to pick an option, comma-separated numbers for a multi-select, or just type
  your own answer.
- **Over Telegram**, the same question arrives as numbered options you reply to.

Your answer is fed straight back into the _same_ session, and Aurora keeps asking
until nothing is left to settle — so a task that needs your input pauses for it
instead of running off in the wrong direction.

When a turn **finishes** (nothing left to ask), Aurora pushes a short **recap**
to Telegram — what it did, plus any action items for you — so a long job started
at your desk pings your phone when it's done. The recap uses the model's own
sign-off when present, otherwise a trimmed summary of the answer.

This rides on a tiny turn-boundary protocol (`aurora:ask` / `aurora:done`
fenced blocks the model emits, parsed in `src/protocol.js`); the raw JSON is
filtered out of the stream, so you only ever see the question or the recap, never
the markup. Recaps follow the `/notify` toggle (see
[Notifications](#notifications-optional)).

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
conversations (each with a one-line preview of its opening message), and
**`/resume [id]`** reattaches to one — pass the short id from `/history`, or no
id to pick up the most recent. **`/export [id]`** writes a conversation to a
Markdown file you can keep or share (no id exports the current one).

**One conversation across the CLI and Telegram.** With a store enabled, the REPL
and the Telegram bridge attach to the same _active session_ — and because plain
`aurora` now starts the bridge alongside the REPL (see below), a single command
gives you both. A chat you start on Telegram is shown and picked up the next time
you open `aurora` on the command line, and what you type in the terminal
continues on Telegram. `/new` on either side starts a fresh shared thread.
(SQLite is recommended if
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

Aurora can ping you on **Telegram** when a turn finishes — a short recap of what
it did plus any action items (see
[Talking back: questions & finish recaps](#talking-back-questions--finish-recaps)).
Handy for long research runs. Enable with `/notify on`, test with `/notify test`.

```bash
export TELEGRAM_BOT_TOKEN=...   # from @BotFather — that's all you need
```

No chat id to copy. Set just the bot token, then **send your bot `/start`** —
Aurora registers that chat locally (`~/.config/aurora/telegram-chats.json`) and
notifications go to every registered chat. From the REPL you can also run
**`/notify whoami`** to discover and register any chat that has messaged the bot,
**`/notify list`** to see them, and **`/notify forget <id>`** to drop one. The
bot **token** is the only secret and is read only from the environment, never
disk; a chat id is just a routing number, so it's kept in the local registry.
`TELEGRAM_CHAT_ID` still works as an optional override if you'd rather pin a
single chat.

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
replies on Telegram. Send `/new` to start a fresh conversation. **Authorization:**
a chat must register itself by sending **`/start`** before it can drive the model
— a public bot can be messaged by anyone, so unregistered chats are ignored until
they opt in. Registrations persist locally; `TELEGRAM_CHAT_ID`, if set, is always
authorized too. The bridge needs only the bot token to start. (`aurora --telegram`
still works as an alias for `--serve`.)

**You usually don't need `--serve` for Telegram.** Plain `aurora` already starts
every available listener (the bridge boots whenever `TELEGRAM_BOT_TOKEN` is set)
alongside the REPL, so one terminal drives both the command line and your phone.
Reach for `--serve` when you want a **headless** server with no REPL — e.g.
running it under systemd/pm2.

Run only **one** poller at a time, though: Telegram lets a single client
long-poll `getUpdates`, so two live bridges fight over it. If you open a second
terminal while a bridge is already running, start it with **`aurora --solo`** —
that gives you a purely-local REPL that starts no listeners. (`--solo` is also
the way to launch a quick local chat without pinging Telegram at all.)

## Security

This is an open-source repo, so it's built to be safe to publish and share:

- **The bot token never touches disk.** It's read _only_ from the environment
  (`TELEGRAM_BOT_TOKEN`, optionally via a gitignored `.env`) and never written to
  `config.json`. Chat ids are not secrets (useless without the token), so the
  registry of chats that have `/start`ed lives at
  `~/.config/aurora/telegram-chats.json` (`chmod 600`). `.gitignore` covers
  `.env`, `*.sqlite`, `*.db`, `data/`, and `.aurora/`.
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

## Benchmark (dev tool)

[`bench/`](bench/) holds the **ARM benchmark** — it measures the Aurora Research
Method against a freeform baseline across models, to answer "does the structured
method beat freeform research, and where?" It runs each model × condition ×
question, grades the outputs with cheap objective metrics (citation count,
link-resolve rate, vague-attribution count, honest-disclaimer count, cost,
latency), and builds a single self-contained HTML report.

```bash
node bench/run.js --only B1-react19 --concurrency 1   # a quick smoke
node bench/grade.js <runId>                            # metrics
node bench/report.js                                   # build results/index.html
bash bench/publish.sh                                  # deploy it to Netlify
```

It can compare Claude (via the `claude` CLI) against other vendors (OpenAI,
Gemini) for a few cents, with a cost cap — but those vendor calls live **only in
the benchmark**; they don't add a provider to Aurora, which stays Claude-only by
design. The latest report is published at <https://aurora-bm.netlify.app>. See
[`bench/README.md`](bench/README.md) for the full workflow (run → grade → report
→ publish), the cheap multi-vendor smoke, and the scoring rubric.

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
  gh api --method PUT "repos/Werewolf-Solutions/aurora/branches/$branch/protection" --input - <<'JSON'
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
src/protocol.js          turn-boundary Q&A + recap protocol (ask/done blocks)
src/paste.js             multi-line paste → "[Pasted text #N +M lines]" (bracketed paste)
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
