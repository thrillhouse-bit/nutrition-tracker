// SummaryPersistence.swift — the one place the last `PlanSummary` is written to
// and read back from, so the glance shows something offline and the
// complication has data without talking to the phone itself.
//
// Membership: this file (and the two Shared contract files it imports —
// `PlanSummary.swift` and `HealthModel.swift` for `FuelJSON`) must belong to
// BOTH the watch-app target AND the Widget-Extension target. The complication
// runs in its own process and reaches the summary only through the shared App
// Group defaults written here — there is no other channel and no HealthKit /
// network read on the watch side (the phone is the bridge).
//
// Encoding goes through `FuelJSON` (ISO-8601 dates) so the bytes on disk match
// every other serialization path in the project — one date format, one source
// of truth.

import Foundation

/// What we persist: the summary plus the instant the WATCH received it.
/// `receivedAt` is watch-side wall time (the store's `updatedAt`); plan
/// freshness itself rides `PlanSummary.generatedAt`, so both survive a relaunch
/// and neither is silently reset to launch time.
struct FuelSnapshot: Codable, Equatable {
    var summary: PlanSummary
    var receivedAt: Date
}

enum SummaryPersistence {
    // TODO: replace with the real App Group id, and enable this exact group on
    // BOTH the watch-app target and the Widget-Extension target's
    // capabilities. Must match the id in `FuelWatch.entitlements`. If the group
    // is missing/misconfigured, `defaults` falls back to `.standard`, which the
    // complication's separate process cannot see — so the complication would
    // read nothing rather than crash (a neutral placeholder, never stale data).
    static let appGroupIdentifier = "group.com.example.fuelwatch"

    /// Versioned key so a future shape change can't decode old bytes as new.
    static let snapshotKey = "fuel.snapshot.v1"

    /// A summary older than this (by its own `generatedAt`) is shown as stale
    /// and the watch tells the wearer to open the phone rather than trusting it.
    static let stalenessThreshold: TimeInterval = 2 * 60 * 60 // ~2h

    /// The shared suite. `.standard` fallback keeps a mis-set App Group from
    /// crashing; it just means the two processes stop sharing (see TODO above).
    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupIdentifier) ?? .standard
    }

    static func save(_ snapshot: FuelSnapshot) {
        // Best-effort: a persistence failure must never take down a live glance,
        // so we swallow the encode error rather than propagate it. The in-memory
        // store already holds the summary; disk is only the offline copy.
        guard let data = try? FuelJSON.encoder.encode(snapshot) else { return }
        defaults.set(data, forKey: snapshotKey)
    }

    static func load() -> FuelSnapshot? {
        guard let data = defaults.data(forKey: snapshotKey) else { return nil }
        return try? FuelJSON.decoder.decode(FuelSnapshot.self, from: data)
    }

    static func clear() {
        defaults.removeObject(forKey: snapshotKey)
    }

    /// Freshness is measured from the plan's own `generatedAt`, not from when
    /// the watch happened to receive it — a plan built 3h ago is stale even if
    /// it just synced.
    static func isStale(_ summary: PlanSummary, now: Date = Date()) -> Bool {
        now.timeIntervalSince(summary.generatedAt) > stalenessThreshold
    }
}

/// Tiny display formatters, shared by the glance and the complication so both
/// render "620 kcal" / "62 g" identically. Kept here because this file is the
/// only one guaranteed to be in both targets.
enum FuelFormat {
    /// Rounded integer string for kcal / grams (the watch never shows decimals).
    static func int(_ v: Double) -> String { String(Int(v.rounded())) }

    /// "consumed / target unit" — the headline progress line.
    static func consumedOfTarget(_ p: Progress, unit: String) -> String {
        "\(int(p.consumed)) / \(int(p.target)) \(unit)"
    }

    /// "62g protein + 90g carbs" — a fuel-window target.
    static func macro(_ m: MacroTarget) -> String {
        "\(int(m.proteinG))g protein + \(int(m.carbsG))g carbs"
    }
}
