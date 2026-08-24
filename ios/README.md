# Fuel — native iOS + watchOS companion

A native companion that **keeps the React/Vite PWA as the main experience** and
adds what a browser cannot do: read Apple Health / Apple Watch data. Apple Health
is a **third provider** alongside Oura and Garmin, feeding the same
provider-neutral signal model — the iOS app only *normalizes HealthKit samples
and syncs them to your own backend*; it does not reimplement the nutrition UI.

> **The browser PWA cannot connect to Apple Watch.** HealthKit has no cloud/web
> API; health data only leaves the device through a native app the user installs.
> This companion is that native bridge.

## Architecture (data flow)

```
 Apple Watch / iPhone HealthKit
        │  (read-only, on device)
        ▼
 HealthKitManager ──► [HealthSample] + HealthPermissions
        │
        ▼  POST {base}/api/apple/ingest   (x-ingest-token)
 Backend  ─► wearable_signals ─► providers.js (provider-neutral) ─► /api/today, /api/plan/today
        │                                                              │
        │  GET /api/today                                              ▼
        └────────────────────────────► PlanSummary ──WatchConnectivity──► Apple Watch (glance)
                                                    ◄── "Log later on iPhone" (handoff, no scanning on watch)
```

The contract both native targets share lives in [`Shared/`](Shared/):
`HealthModel.swift` (the exact `/api/apple/ingest` body) and `PlanSummary.swift`
(the glance the watch shows, derived from `/api/today` so the watch never
re-derives fueling logic differently from the app).

## Targets & files

| Target | What it is | Key files |
|---|---|---|
| **FuelCompanion** (iOS app) | Hosts the PWA in a `WKWebView` + the HealthKit bridge + a native Health-status screen | `FuelCompanionApp`, `App/RootView`, `Web/WebAppView`, `Health/HealthKitManager`, `Health/HealthSyncCoordinator`, `Net/IngestClient`, `Net/TodayClient`, `Watch/PhoneSessionManager`, `UI/ConnectionStatusView`, `Settings/AppConfig`+`Keychain`, `Background/BackgroundSync` |
| **FuelWatch** (watchOS app) | Glanceable receiver of `PlanSummary` + "Log later" handoff | `FuelWatchApp`, `Views/GlanceView`+`WhyView`, `Store/SummaryStore`+`SummaryPersistence`, `Connectivity/WatchSessionManager` |
| **FuelWatchComplication** (WidgetKit extension) | Summary-only complication (next action / kcal / protein) | `Complication/FuelComplication` |
| **Shared** | Provider-neutral contract, compiled into every target | `Shared/HealthModel.swift`, `Shared/PlanSummary.swift` |

## Build & run

There is **no Xcode project committed** — generate it from `project.yml`:

```bash
brew install xcodegen
cd ios && xcodegen generate && open Fuel.xcodeproj
```

Then, before it will build & run, fill in every `// TODO:` / `# TODO:`:

1. **Team & bundle ids** — `project.yml` `DEVELOPMENT_TEAM` and the three
   `PRODUCT_BUNDLE_IDENTIFIER`s. The watch app id must be `<iOS id>.watchkitapp`
   and the complication `<watch id>.complication`; `FuelWatch/Info.plist`'s
   `WKCompanionAppBundleIdentifier` must equal the iOS app id.
2. **App Group** — set a real id in `FuelWatch/Store/SummaryPersistence.swift`
   and enable the same group on the watch app **and** the complication (so the
   persisted `PlanSummary` is shared with the complication).
3. **Background task ids** — the ids in `FuelCompanion/Info.plist`
   (`BGTaskSchedulerPermittedIdentifiers`) must match `Background/BackgroundSync.swift`.
4. **Server URL** — set at runtime in the app's **Health** tab, or the default
   in `Settings/AppConfig.swift`.
5. **Ingest token** — if the server sets `APPLE_INGEST_TOKEN`, enter the same
   value in the Health tab (stored in the Keychain, sent as `x-ingest-token`).
6. **Signing** — a real device is required for HealthKit (the simulator has no
   Health data); pair an Apple Watch for the watch flow.

## Capabilities & entitlements

**FuelCompanion.entitlements**
- `com.apple.developer.healthkit` = `true`
- `com.apple.developer.healthkit.background-delivery` = `true`
- (App Group only if you later share storage phone↔watch — intentionally omitted to avoid a provisioning failure.)

**FuelWatch.entitlements**
- `com.apple.security.application-groups` = `[group.<your-id>]` (shared with the complication). **No HealthKit** — see "v1 scope".

**Info.plist keys**
- iOS: `NSHealthShareUsageDescription` (plain-language, non-medical), `UIBackgroundModes` = `fetch, processing`, `BGTaskSchedulerPermittedIdentifiers`. Deliberately **no** `NSHealthUpdateUsageDescription` (the app is read-only) and **no** clinical-health keys.
- watch: `WKApplication` = `YES`, `WKCompanionAppBundleIdentifier`.

## HealthKit permissions requested (READ-ONLY)

`HealthKitManager` requests read access (`toShare: []`) for the **minimum
fueling context** only — no clinical data:

| Category | HealthKit type | Role |
|---|---|---|
| Workouts & timing | `HKObjectType.workoutType()` | drives optional plan adjustments |
| Active energy | `activeEnergyBurned` | expenditure context |
| Exercise | `appleExerciseTime` (+ `HKActivitySummary`) | activity context |
| Sleep | `categoryType(.sleepAnalysis)` | recovery context / explanation |
| Heart-rate variability | `heartRateVariabilitySDNN` | **context only** — never changes a target |
| Resting heart rate | `restingHeartRate` | **context only** |
| Steps | `stepCount` | activity context |

Rules honored end-to-end: **minimum permissions; no clinical data; HRV / resting
HR are context-only (the backend rules engine never reads them, proven by
`test/apple.test.js`); missing data is "No data", never "denied"** (HealthKit
hides read-denials, so we only ever report *available* vs *requested*); **no
workout recording** (approved workouts are read, never started); tokens live in
the Keychain and only in the `x-ingest-token` header.

## What is verified vs. what needs a Mac + paired devices

This companion was authored in a headless Linux container with **no Xcode /
macOS / iOS / watchOS SDK**. Nothing Swift was compiled, linted, or run here.

| Test-plan item | Status here | Needs |
|---|---|---|
| **PWA / mobile browser** — 320/375/390/430 widths, safe-area, 44px targets, long names, 200% zoom, offline shell, states | **Executed** (headless Chromium) — see [`docs/PWA-RESPONSIVE-REPORT.md`](../docs/PWA-RESPONSIVE-REPORT.md) | — |
| Provider-neutral model + Apple ingest + HRV-is-context + partial-permission states | **Executed** — `test/apple.test.js` (part of the 58-test suite) | — |
| Native iOS: HealthKit unavailable / granted / partial / no-data / stale / sync-failure | **Not run** (source models each state in `ConnectionStatusView`) | Xcode + **physical iPhone** (simulator has no Health data) |
| iOS on current simulator | **Not run** | Xcode simulator (UI/layout only; HealthKit reads need a device) |
| Apple Watch: layout/navigation on simulator | **Not run** | watchOS simulator |
| Apple Watch: real HealthKit sync, fresh workout data, background/refresh, handoff | **Not run** | **Physical paired iPhone + Apple Watch** |
| "Why?" rationale on every recommendation | **PWA: yes** (Today card + Plan). Watch: source shows `PlanSummary.why` via `WhyView` | on-watch confirmation needs the device |

**Remaining unverified without a physical paired iPhone + Apple Watch:** the
actual HealthKit authorization sheet and per-category grant/deny behavior;
whether background delivery + `BGTaskScheduler` fire on schedule; real workout
timing/energy values; WatchConnectivity delivery latency and the "Log later"
handoff; complication timeline refresh; and end-to-end freshness/stale
transitions with live data. The Swift is written to be idiomatic (iOS 16+ /
watchOS 9–10, guarded where APIs are newer) but **treat it as review-ready
source to build on a Mac, not a verified binary.**

## v1 scope

- The **watch does not read HealthKit directly** — the phone is the bridge and
  sends a computed `PlanSummary`. This keeps the watch minimal (a glance, not a
  dashboard) and avoids duplicate Health authorization. On-watch HealthKit is a
  clean future addition (add the entitlement + a small manager).
- **No Apple Watch workout recording** (no `HKWorkoutSession` / WorkoutKit). The
  app reads *approved* HealthKit workouts only. Live workout sessions are a
  separate, future feature.
