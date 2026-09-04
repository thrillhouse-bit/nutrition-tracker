#!/usr/bin/env bash
# General/preview deploy: rebuild and restart the app container with GIT_SHA
# baked in, then prove GET /api/version actually reports it. This command does
# not make a complete-game release claim. Pass --complete-release to run the
# complete-game gate immediately before the deploy.
#
#   ./deploy.sh [docker-compose-file]
#   ./deploy.sh --complete-release [docker-compose-file]
#
# GET /api/version has reported {"sha":"unknown"} on every deploy so far
# (25 Aug 2026) — not a code bug, `Dockerfile`/`docker-compose.app-only.yml`
# both wire GIT_SHA through correctly (`ARG GIT_SHA=unknown` /
# `GIT_SHA: ${GIT_SHA:-unknown}`), but every actual deploy ran
# `docker compose up -d --build` bare, with GIT_SHA never set in the shell
# that invoked it, so the arg silently fell back to "unknown" every time.
# This script is the fix: the ONE place that runs the build always sets it,
# so there is nothing left to forget.
#
# Defaults to docker-compose.app-only.yml — the variant actually running in
# production (a resident Traefik/Caddy/nginx already owns 80/443; see that
# file's own header for the full app-only vs. full-stack explanation). Pass
# a different compose file as $1 if you're running the full-stack variant
# instead: ./deploy.sh docker-compose.yml
set -euo pipefail
cd "$(dirname "$0")"

COMPLETE_RELEASE=false
if [[ "${1:-}" == "--complete-release" ]]; then
  COMPLETE_RELEASE=true
  shift
fi
COMPOSE_FILE="${1:-docker-compose.app-only.yml}"

if "$COMPLETE_RELEASE"; then
  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    echo "FAILED: a complete-game release requires a clean Git working tree at HEAD." >&2
    echo "Commit, stash, or remove staged, unstaged, and untracked changes, then rerun --complete-release." >&2
    git status --short --untracked-files=all >&2
    exit 1
  fi
  echo "Running complete-game release gate before deploy ..." >&2
  npm run verify:oathbearer:complete
else
  echo "General/preview deploy only; this does not certify Aegean Frontier as complete." >&2
fi
GIT_SHA="$(git rev-parse HEAD)"
export GIT_SHA

echo "Deploying $GIT_SHA via $COMPOSE_FILE ..." >&2
docker compose -f "$COMPOSE_FILE" up -d --build

echo "Waiting for the app to answer /api/health ..." >&2
for _ in $(seq 1 15); do
  if curl -fs http://127.0.0.1:3001/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

health=$(curl -fs http://127.0.0.1:3001/api/health) || { echo "FAILED: /api/health never came up" >&2; exit 1; }
echo "health: $health" >&2

live_sha=$(curl -fs http://127.0.0.1:3001/api/version | grep -o '"sha":"[^"]*"' | cut -d'"' -f4) || true
if [ "$live_sha" != "$GIT_SHA" ]; then
  echo "FAILED: /api/version reports '$live_sha', expected '$GIT_SHA' — deploy did not take, or GIT_SHA still isn't reaching the build." >&2
  exit 1
fi
echo "OK: /api/version confirms $live_sha is live." >&2
