// SummaryStore.swift — the observable that the whole UI reads. It holds the
// latest `PlanSummary`, the moment the watch received it, and the honest
// derived flags (demo / stale / empty). It NEVER computes fueling logic; the
// phone already did that and sent the finished summary. This layer only stores,
// exposes, and labels.
//
// Threading: `@Published` mutations must happen on the main thread. The
// WatchConnectivity delegate runs on a background queue, so `WatchSessionManager`
// hops to main before calling `apply(_:)`. Everything else (init, SwiftUI
// button actions) is already on main.

import Foundation
import Combine
#if canImport(WidgetKit)
import WidgetKit
#endif

final class SummaryStore: ObservableObject {

    /// The last summary we have — from this session, or reloaded from disk on
    /// launch so a cold start still shows the most recent known plan.
    @Published private(set) var summary: PlanSummary?

    /// When the WATCH received `summary` (wall time). Drives "Updated 12m ago".
    @Published private(set) var updatedAt: Date?

    init() {
        // Offline-first: seed from the persisted snapshot so the glance is never
        // blank if the phone isn't reachable at launch.
        if let snap = SummaryPersistence.load() {
            summary = snap.summary
            updatedAt = snap.receivedAt
        }
    }

    /// Install a freshly received summary. Call ONLY on the main thread.
    func apply(_ newSummary: PlanSummary, receivedAt: Date = Date()) {
        summary = newSummary
        updatedAt = receivedAt
        SummaryPersistence.save(FuelSnapshot(summary: newSummary, receivedAt: receivedAt))
        #if canImport(WidgetKit)
        // Close the loop: the complication reads the same persisted snapshot, so
        // nudge it to redraw now rather than waiting for its next timeline tick.
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    // MARK: - Honest state (never present sample/old data as live)

    var hasData: Bool { summary != nil }

    /// True when any signal in the summary is demo/sample data.
    var isDemo: Bool { summary?.isDemo ?? false }

    /// True when the plan's own `generatedAt` is older than ~2h.
    var isStale: Bool {
        guard let s = summary else { return false }
        return SummaryPersistence.isStale(s)
    }

    /// A short "12m ago" / "2h ago" for the footer, or nil if we never received.
    var updatedRelative: String? {
        guard let t = updatedAt else { return nil }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f.localizedString(for: t, relativeTo: Date())
    }
}
