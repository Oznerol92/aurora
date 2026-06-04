#!/usr/bin/env bash
# Publish the ARM benchmark report to Netlify (free static hosting).
#
# The report is a single self-contained HTML file (CSS + JS + run data inlined
# by report.js), so deploying is: regenerate it, then push that one file to a
# Netlify site. Nothing runs on Netlify — it is plain static hosting.
#
# Why a manual deploy and not Netlify's git auto-build: the report's data lives
# in bench/results/ (gitignored), and producing it needs the local `claude` CLI
# plus vendor API keys — none of which exist in a Netlify build container. So we
# build locally and upload the finished file.
#
# Config from env or the repo .env (never committed; the real env always wins):
#   NETLIFY_AUTH_TOKEN   personal access token
#                        (Netlify → User settings → Applications → New token)
#   NETLIFY_SITE_ID      target site's API ID
#                        (Site settings → General → API ID). Create the site
#                        once with `npx netlify-cli sites:create` or in the UI.
#
# Usage:
#   bash bench/publish.sh             # deploy to production
#   bash bench/publish.sh --dry-run   # draft deploy → preview URL, not live
#
# Prereqs: network access; the Netlify CLI is fetched on demand via npx.
#
# NOTE: Netlify's FREE tier has no password protection, so the site is PUBLIC.
# The report inlines full model outputs — don't deploy a run you wouldn't want
# world-readable. (Password / role-based protection is a paid Netlify feature.)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
prod="--prod"
[ "${1:-}" = "--dry-run" ] && prod=""

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

NETLIFY_AUTH_TOKEN="$(load_var NETLIFY_AUTH_TOKEN)"
NETLIFY_SITE_ID="$(load_var NETLIFY_SITE_ID)"
: "${NETLIFY_AUTH_TOKEN:?set NETLIFY_AUTH_TOKEN in .env or env (Netlify access token)}"
: "${NETLIFY_SITE_ID:?set NETLIFY_SITE_ID in .env or env (target site API ID)}"
export NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID

report="$here/results/index.html"
echo "→ regenerating report"
node "$here/report.js" >/dev/null
[ -f "$report" ] || {
  echo "no report at $report — run 'node bench/run.js' and 'node bench/grade.js <runId>' first" >&2
  exit 1
}

# Assemble a clean publish dir holding ONLY the report (so the raw run JSON in
# results/ is never uploaded) plus a Netlify _headers file.
site="$here/site"
rm -rf "$site"; mkdir -p "$site"
cp "$report" "$site/index.html"
cat > "$site/_headers" <<'HDR'
/index.html
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
HDR

if [ -n "$prod" ]; then echo "→ deploying to production"; else echo "→ draft deploy (preview URL only, not live)"; fi
# shellcheck disable=SC2086
npx --yes netlify-cli deploy --dir="$site" --site="$NETLIFY_SITE_ID" $prod

echo "✓ published${prod:+ (production)}"
