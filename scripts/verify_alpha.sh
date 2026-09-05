#!/usr/bin/env bash
# Read-only release gate for the invite-only Body Current alpha.
#
# Usage:
#   scripts/verify_alpha.sh https://omnifuelapp.tech
#   EXPECTED_SHA=<full-git-sha> scripts/verify_alpha.sh https://omnifuelapp.tech
set -uo pipefail

BASE="${1:-${BASE:-}}"
if [[ -z "$BASE" ]]; then
  echo "usage: $0 <base-url>"
  exit 2
fi
BASE="${BASE%/}"

probe_dir="$(mktemp -d)"
trap 'rm -rf -- "$probe_dir"' EXIT
pass=0
fail=0

ok() { echo "  PASS  $*"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $*"; fail=$((fail + 1)); }

request() {
  local name="$1"
  local path="$2"
  curl -sS --max-time 15 -D "$probe_dir/$name.headers" -o "$probe_dir/$name.body" -w '%{http_code}' "$BASE$path" 2>/dev/null || true
}

json_field() {
  local file="$1"
  local field="$2"
  node -e '
    const fs = require("node:fs")
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]]
      process.stdout.write(value == null ? "" : String(value))
    } catch {}
  ' "$file" "$field"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v wanted="$name" '
    BEGIN { wanted=tolower(wanted) }
    index(tolower($0), wanted ":") == 1 {
      sub(/^[^:]+:[[:space:]]*/, "")
      sub(/\r$/, "")
      print
      exit
    }
  ' "$file"
}

echo "== Body Current alpha release gate: $BASE =="

health_code="$(request health /api/health)"
backend="$(json_field "$probe_dir/health.body" backend)"
[[ "$health_code" == 200 ]] && ok "health endpoint responds" || bad "health endpoint returned HTTP $health_code"
[[ "$backend" == postgres ]] && ok "production storage is Postgres" || bad "storage backend is '${backend:-unknown}', expected postgres"

version_code="$(request version /api/version)"
running_sha="$(json_field "$probe_dir/version.body" sha)"
[[ "$version_code" == 200 && -n "$running_sha" && "$running_sha" != unknown ]] && ok "version reports $running_sha" || bad "version is unavailable or unknown"
if [[ -n "${EXPECTED_SHA:-}" ]]; then
  [[ "$running_sha" == "$EXPECTED_SHA" ]] && ok "running SHA matches EXPECTED_SHA" || bad "running SHA $running_sha does not match EXPECTED_SHA $EXPECTED_SHA"
fi

legal_code="$(request legal /api/legal/status)"
legal_ready="$(json_field "$probe_dir/legal.body" ready)"
signup_enabled="$(json_field "$probe_dir/legal.body" signupEnabled)"
invite_required="$(json_field "$probe_dir/legal.body" inviteRequired)"
[[ "$legal_code" == 200 && "$legal_ready" == true ]] && ok "reviewed legal documents are ready" || bad "legal launch gate is not ready"
[[ "$signup_enabled" == true && "$invite_required" == true ]] && ok "signup is enabled only through alpha invitations" || bad "invite-only signup is not ready"

privacy_code="$(request privacy /privacy)"
terms_code="$(request terms /terms)"
[[ "$privacy_code" == 200 ]] && ok "Privacy Policy is published" || bad "Privacy Policy returned HTTP $privacy_code"
[[ "$terms_code" == 200 ]] && ok "Terms of Service are published" || bad "Terms of Service returned HTTP $terms_code"

export_code="$(request export /api/account/export)"
[[ "$export_code" == 401 ]] && ok "anonymous account export is denied" || bad "anonymous account export returned HTTP $export_code, expected 401"

root_code="$(request root /)"
csp="$(header_value "$probe_dir/root.headers" content-security-policy)"
frame="$(header_value "$probe_dir/root.headers" x-frame-options)"
nosniff="$(header_value "$probe_dir/root.headers" x-content-type-options)"
hsts="$(header_value "$probe_dir/root.headers" strict-transport-security)"
powered_by="$(header_value "$probe_dir/root.headers" x-powered-by)"
[[ "$root_code" == 200 ]] && ok "PWA shell responds" || bad "PWA shell returned HTTP $root_code"
[[ "$csp" == *"default-src 'self'"* && "$csp" == *"frame-ancestors 'none'"* ]] && ok "Content Security Policy is active" || bad "Content Security Policy is missing or incomplete"
[[ "$frame" == DENY && "$nosniff" == nosniff ]] && ok "clickjacking and MIME-sniffing defenses are active" || bad "baseline response hardening is incomplete"
[[ "$hsts" == *max-age=31536000* ]] && ok "HSTS is active" || bad "HSTS is missing"
[[ -z "$powered_by" ]] && ok "server technology header is suppressed" || bad "X-Powered-By is still exposed"

echo
echo "SUMMARY: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
