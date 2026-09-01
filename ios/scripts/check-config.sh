#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

blockers=()

if rg -q 'com\.example' ios/project.yml ios/FuelWatch/Info.plist; then
  blockers+=("replace every com.example bundle/companion identifier")
fi
if rg -q 'DEVELOPMENT_TEAM:[[:space:]]*""' ios/project.yml; then
  blockers+=("set DEVELOPMENT_TEAM in ios/project.yml")
fi
if rg -q 'group\.com\.example' ios/FuelWatch/Store/SummaryPersistence.swift ios/FuelWatch/FuelWatch.entitlements; then
  blockers+=("set one real App Group in SummaryPersistence.swift and FuelWatch.entitlements")
fi

if ((${#blockers[@]})); then
  echo "iOS release configuration is incomplete:"
  for blocker in "${blockers[@]}"; do
    echo "- $blocker"
  done
  echo "See ios/README.md, then rerun npm run verify:ios-config."
  exit 1
fi

echo "iOS source configuration has no known signing or identifier placeholders."
