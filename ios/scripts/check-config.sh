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
if ! rg -q '<string>Body Current</string>' ios/FuelCompanion/Info.plist; then
  blockers+=("set the iPhone app visible display name to Body Current")
fi
if ! rg -q '<string>Body Current</string>' ios/FuelWatch/Info.plist; then
  blockers+=("set the watch app visible display name to Body Current")
fi
if ! rg -q 'PRODUCT_NAME: Body Current Complication' ios/project.yml; then
  blockers+=("set the complication visible product name")
fi
phone_bundle_id="$(awk '/PRODUCT_BUNDLE_IDENTIFIER:/{print $2; exit}' ios/project.yml)"
watch_companion_id="$(plutil -extract WKCompanionAppBundleIdentifier raw -o - ios/FuelWatch/Info.plist 2>/dev/null || true)"
if [[ -z "$phone_bundle_id" || "$watch_companion_id" != "$phone_bundle_id" ]]; then
  blockers+=("make WKCompanionAppBundleIdentifier match the iOS bundle identifier")
fi
watch_bundle_id="$(awk '/PRODUCT_BUNDLE_IDENTIFIER:/{n++; if(n==2) print $2}' ios/project.yml)"
complication_bundle_id="$(awk '/PRODUCT_BUNDLE_IDENTIFIER:/{n++; if(n==3) print $2}' ios/project.yml)"
if [[ "$watch_bundle_id" != "$phone_bundle_id.watchkitapp" || "$complication_bundle_id" != "$watch_bundle_id.complication" ]]; then
  blockers+=("make the watch and complication bundle identifiers extend their parent identifiers")
fi
if [[ "$(rg -c 'CODE_SIGN_ENTITLEMENTS: FuelWatch/FuelWatch.entitlements' ios/project.yml)" != "2" ]]; then
  blockers+=("apply the shared App Group entitlements to both watch and complication targets")
fi
swift_group_id="$(sed -n 's/.*static let appGroupIdentifier = "\([^"]*\)".*/\1/p' ios/FuelWatch/Store/SummaryPersistence.swift)"
entitled_group_id="$(plutil -extract com.apple.security.application-groups.0 raw -o - ios/FuelWatch/FuelWatch.entitlements 2>/dev/null || true)"
# plutil's key path syntax treats dots as separators; PlistBuddy accepts the literal entitlement key.
if [[ -z "$entitled_group_id" ]]; then
  entitled_group_id="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups:0' ios/FuelWatch/FuelWatch.entitlements 2>/dev/null || true)"
fi
if [[ -z "$swift_group_id" || "$swift_group_id" != "$entitled_group_id" ]]; then
  blockers+=("make the persisted summary App Group match the signed entitlement")
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
