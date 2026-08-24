#!/usr/bin/env bash
# verify_deploy.sh — probe a LIVE deployment (VPS, Vercel, Render, anything) and
# report what is actually configured and reachable FROM the box, so nobody has
# to guess from local source. Deployment-agnostic: it only needs the public
# base URL and, optionally, the Apple ingest token to test that path.
#
# Usage:
#   scripts/verify_deploy.sh https://your-app.example.com
#   BASE=https://your-app.example.com scripts/verify_deploy.sh
#   APPLE_INGEST_TOKEN=... scripts/verify_deploy.sh https://your-app.example.com
#
# It never sends secrets in the URL or shell history beyond the single header it
# needs, and it makes only read probes plus (optionally) one Apple ingest with a
# single empty sample to prove the write path + token gate.
set -euo pipefail

BASE="${1:-${BASE:-}}"
if [[ -z "$BASE" ]]; then echo "usage: $0 <base-url>   (e.g. https://your-app.example.com)"; exit 2; fi
BASE="${BASE%/}"

pass=0; fail=0
ok()   { echo "  PASS  $*"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $*"; fail=$((fail+1)); }
info() { echo "  ..    $*"; }

# GET helper. Uses the agent proxy transparently if one is configured.
get() { curl -fsS --max-time 15 "$@" 2>/dev/null; }
# Parse a top-level JSON string field without jq.
field() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const v=j[process.argv[1]];process.stdout.write(v==null?"":String(v))}catch{process.stdout.write("")}})' "$1"; }

echo "== Verifying $BASE =="

# 1. Health --------------------------------------------------------------------
H="$(get "$BASE/api/health" || true)"
if [[ -z "$H" ]]; then bad "GET /api/health did not respond"; echo; echo "SUMMARY: $pass passed, $fail failed"; exit 1; fi
ok "GET /api/health responded"
BACKEND="$(printf '%s' "$H" | field backend)"
OURA="$(printf '%s' "$H" | field oura)"
GARMIN="$(printf '%s' "$H" | field garmin)"
info "backend=$BACKEND  oura=$OURA  garmin=$GARMIN"
[[ "$BACKEND" == "postgres" ]] && ok "storage is Postgres (data persists/syncs)" || info "storage=$BACKEND (local JSON — fine for single-box, not multi-device)"

# 2. Oura configured + connected + returning live data -------------------------
case "$OURA" in
  oauth|legacy-token) ok "Oura credentials configured on the box ($OURA)";;
  not-configured)     bad "Oura NOT configured — set OURA_CLIENT_ID/SECRET/REDIRECT_URI (or OURA_TOKEN) on the box";;
  *)                  info "Oura state: $OURA";;
esac

if [[ "$OURA" != "not-configured" && -n "$OURA" ]]; then
  ACCT="$(get "$BASE/api/oura/accounts" || true)"
  NACC="$(printf '%s' "$ACCT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String((JSON.parse(d).accounts||[]).length))}catch{process.stdout.write("0")}})')"
  if [[ "${NACC:-0}" -ge 1 || "$OURA" == "legacy-token" ]]; then
    ok "Oura connected (${NACC:-legacy} account(s))"
    TODAY="$(date +%F)"
    SUM="$(get "$BASE/api/oura/summary?date=$TODAY" || true)"
    CONF="$(printf '%s' "$SUM" | field configured)"
    ACT="$(printf '%s' "$SUM" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).activity==null?"null":"present")}catch{process.stdout.write("null")}})')"
    if [[ "$ACT" == "present" ]]; then ok "Oura returned LIVE activity for $TODAY (end-to-end verified)"
    else info "Oura configured=$CONF but no activity yet for $TODAY (may be early in the day, or token needs a refresh cycle)"; fi
  else
    info "Oura configured but no account connected yet — open $BASE, go to Connections → Connect Oura"
  fi
fi

# 3. Composed signals + today reflect a real (non-demo) source when connected ---
SIG="$(get "$BASE/api/signals" || true)"
DEMO_READINESS="$(printf '%s' "$SIG" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const s=JSON.parse(d).signals||{};const r=s.readiness;process.stdout.write(r? (r.demo?"demo":"live") : "none")}catch{process.stdout.write("none")}})')"
info "composed readiness signal: $DEMO_READINESS"
[[ "$DEMO_READINESS" == "live" ]] && ok "readiness is LIVE (not demo)" || info "readiness is '$DEMO_READINESS' (demo until a provider is connected + synced)"

# 4. Apple ingest path (optional) ---------------------------------------------
if [[ -n "${APPLE_INGEST_TOKEN:-}" ]]; then
  R="$(curl -fsS --max-time 15 -X POST "$BASE/api/apple/ingest" -H 'Content-Type: application/json' -H "x-ingest-token: $APPLE_INGEST_TOKEN" -d '{"date":"1970-01-01","samples":[],"permissions":{"requested":[],"available":[]}}' 2>/dev/null || true)"
  [[ -n "$R" ]] && ok "Apple ingest accepted a token-gated request" || bad "Apple ingest rejected the token (check APPLE_INGEST_TOKEN matches the box)"
else
  info "APPLE_INGEST_TOKEN not provided — skipping Apple ingest probe"
fi

echo
echo "SUMMARY: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
