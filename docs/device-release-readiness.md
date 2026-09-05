# Body Current device readiness — 2026-09-04

## Weekend web/PWA alpha

Web invite distribution can proceed after the application release gates pass without a native Apple build or Garmin partner access. Describe this accurately to testers: Oura connection and manual logging are the available paths; native Apple Health and direct Garmin activity sync have separate acceptance gates. A browser install cannot itself read HealthKit. Do not substitute demonstration activity for missing provider data.

## Apple native companion

### Existing Apple ingestion: migrate before a second account signs up

The legacy global `APPLE_INGEST_TOKEN` is accepted only while the server has exactly one account. A second signup makes that token return unauthorized; keeping it in the environment does not preserve ingestion. Before invite distribution, the existing owner must open Connections → Apple Health → How to sync → Generate pairing token while signed into their own account. Copy the once-shown token directly into the native companion's Health settings or the existing Health Auto Export automation's authentication header. Use `x-ingest-token` for the native adapter, or `Authorization: Bearer <token>` for the export adapter; keep the existing endpoint. Never put the token in a URL, handoff, or screenshot.

Trigger an actual device export/sync and confirm success and an updated Apple sync timestamp for the owner. Record that transition as release evidence before enabling invites. Generating another token invalidates the previous per-user token, so update every active sender when rotating. Each tester must generate their own token after signup. The session-gated `/api/apple/token` and both ingest paths have a rotation regression in `test/api-routes.test.js`; tests do not prove the owner's device has been reconfigured. After confirmed migration, the operator can remove the legacy global token through the normal environment deployment process.

Observed on the development Mac: `xcode-select -p` selects `/Library/Developer/CommandLineTools`; `xcodegen` is absent; `security find-identity -v -p codesigning` reports zero valid identities. Source has a blank development team and example bundle/App Group identifiers. No signed build or physical-device test is claimed.

Resolved in source: Body Current project/target/product names, watch companion bundle-chain mismatch, complication sharing the watch App Group entitlement, Health permission error branding, and the README project-open command. Existing source filenames/types remain stable.

1. Install full Xcode and XcodeGen on the build Mac. Select the actual installed Xcode developer directory, open Xcode, and complete first launch.
2. Use the owner's Apple Developer account/team and registered identifiers. Set `DEVELOPMENT_TEAM` and the three bundle identifiers in `ios/project.yml`; keep `<phone>.watchkitapp` and `<watch>.complication`. Update `WKCompanionAppBundleIdentifier` in `ios/FuelWatch/Info.plist` to the phone identifier.
3. Register an App Group and set the same identifier in `ios/FuelWatch/Store/SummaryPersistence.swift` and `ios/FuelWatch/FuelWatch.entitlements`. The watch and complication now both reference this entitlement. Enable HealthKit/background delivery on the phone's registered identifier.
4. Run `npm run verify:ios-config`, then `cd ios && xcodegen generate`. Build the `BodyCurrentCompanion` scheme in `BodyCurrent.xcodeproj` for the paired physical phone/watch with appropriate signing. Source verification is not a signed-build check.
5. Distribute through the owner's provisioned-device or TestFlight workflow. Required owner input: team/account access and registered IDs; the chosen distribution method determines whether tester device registration is needed.
6. Test with a separate user account: issue that user's Apple ingest token, enter the production URL/token in Health settings, grant partial then full read permission, record a workout, sync, and verify its real activity type/time on Today. Verify denial/revocation, duplicate sync, local-day rollover, background refresh, phone-to-watch plan updates, and complication refresh. Confirm no data appears in another account. Revoke the token and verify access ends.

## Garmin direct activity sync

Production `.env` presence-only inspection: `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and `GARMIN_REDIRECT_URI` are absent; `GARMIN_INTEGRATION_VERIFIED` is not enabled. Do not print or place future credentials in this document.

Garmin's [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/) and [Health API](https://developer.garmin.com/gc-developer-program/health-api/) both describe approval followed by an evaluation environment. The [program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/) distinguishes available APIs. Existing claims that the program is currently “on hold” are not established by these public pages; verify application availability directly with Garmin. Approval status for this app is not proven.

1. Obtain the owner's approved Garmin developer application and Activity API access, registered callback, credentials, and current payload/authentication documentation. A willing watch tester alone does not supply this access.
2. Verify OAuth endpoints/scopes, callback identity mapping, webhook authentication/replay contract, and actual activity payload fixtures against that access. Implement authenticated, account-owned, idempotent activity storage before claiming ingestion; the current server only ingests daily summaries and explicitly counts activities as unsupported.
3. Exercise authorized connect, actual run/strength activity delivery, retries/duplicates, unknown users, malformed/unauthenticated pushes, disconnection, and deletion in the partner evaluation environment. Verify Garmin-first/Oura-backup selection with recorded timestamps and cross-provider deduplication.
4. Configure production only after those checks. `GARMIN_INTEGRATION_VERIFIED=true` is an acknowledgement, not authentication implementation or proof of a passing test.

The Connect IQ widget is a separate app-to-watch summary display, not a route for importing Garmin activities. It now displays Body Current but still needs its own SDK/device build, non-placeholder application ID before store publication, and device tests. It does not remove the Activity API gate.
