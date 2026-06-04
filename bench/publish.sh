#!/usr/bin/env bash
# Publish the ARM benchmark report to a static web root (e.g. an nginx droplet).
#
# The report is a single self-contained HTML file (CSS + JS + run data all
# inlined by report.js), so "deploy" is just: regenerate it, then copy that one
# file to the server's web root. No Node, no server runtime, no database on the
# host — plain static hosting.
#
# Config comes from the environment (never committed) — set these in the repo's
# .env or your shell; the real environment always wins:
#   AURORA_BM_HOST   ssh target, e.g. deploy@aurora-bm.werewolf.solutions
#   AURORA_BM_PATH   nginx web root on the host, e.g. /var/www/aurora-bm
#   AURORA_BM_SSH    (optional) extra ssh opts, e.g. "-i ~/.ssh/id_droplet -p 22"
#
# Usage:
#   bash bench/publish.sh            # build + upload
#   bash bench/publish.sh --dry-run  # show what rsync would do, transfer nothing
#
# Prereqs: key-based ssh access to the host and rsync on both ends.
#
# SECURITY: the report inlines the FULL model output for every inlined run. A
# public URL makes all of that world-readable — gate it (nginx basic-auth or an
# IP allowlist; see deploy/nginx-aurora-bm.conf.example) if any run could carry
# something you don't want public.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
dry=""
[ "${1:-}" = "--dry-run" ] && dry="-n"

# Read a single KEY from the real env, else from the repo .env. We extract just
# the keys we need rather than sourcing the whole .env, so an unrelated line
# can't run as shell. Strips optional surrounding quotes (matching src/env.js).
load_var() {
  local key="$1" cur="${!1:-}" val=""
  if [ -n "$cur" ]; then printf '%s' "$cur"; return; fi
  [ -f "$root/.env" ] || return 0
  val="$(sed -n "s/^${key}=//p" "$root/.env" | tail -n1)"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

AURORA_BM_HOST="$(load_var AURORA_BM_HOST)"
AURORA_BM_PATH="$(load_var AURORA_BM_PATH)"
AURORA_BM_SSH="$(load_var AURORA_BM_SSH)"

: "${AURORA_BM_HOST:?set AURORA_BM_HOST (e.g. deploy@aurora-bm.werewolf.solutions) in .env or env}"
: "${AURORA_BM_PATH:?set AURORA_BM_PATH (e.g. /var/www/aurora-bm) in .env or env}"

report="$here/results/index.html"

echo "→ regenerating report"
node "$here/report.js" >/dev/null

[ -f "$report" ] || {
  echo "no report at $report — run 'node bench/run.js' and 'node bench/grade.js <runId>' first" >&2
  exit 1
}

echo "→ ${dry:+(dry-run) }uploading index.html to ${AURORA_BM_HOST}:${AURORA_BM_PATH}/"
# shellcheck disable=SC2086
rsync -az $dry --chmod=F644 ${AURORA_BM_SSH:+-e "ssh ${AURORA_BM_SSH}"} \
  "$report" "${AURORA_BM_HOST}:${AURORA_BM_PATH}/index.html"

echo "✓ published${dry:+ (dry-run, nothing transferred)}"
