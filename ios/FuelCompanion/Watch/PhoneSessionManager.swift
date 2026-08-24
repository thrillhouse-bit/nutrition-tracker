// PhoneSessionManager.swift — the phone half of WatchConnectivity. It activates
// the WCSession, ships the latest `PlanSummary` to the watch, and handles the
// watch's "log this later" handoff by surfacing it on the phone (a local
// notification + a deep link into the WKWebView-hosted add-food flow).
//
// The watch never re-derives fueling logic: it renders the exact `PlanSummary`
// the phone builds from `/api/today`. We send it two ways — `updateApplication
// Context` (the always-available latest snapshot) and `sendMessage` (an instant
// nudge when the watch is reachable).

import Foundation
import Combine
#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

@MainActor
final class PhoneSessionManager: NSObject, ObservableObject {

    /// Whether the paired watch is reachable right now (drives instant sends).
    @Published private(set) var isReachable: Bool = false
    /// Whether a watch is paired and the companion app is installed.
    @Published private(set) var isWatchAppInstalled: Bool = false
    @Published private(set) var activationError: String?

    /// Set by the app to route a watch "log later" handoff into the UI. The
    /// String is an optional note the watch attached.
    var onLogLater: ((String?) -> Void)?

    /// The most recent summary we tried to send, kept so a late activation or a
    /// newly-reachable watch can be caught up.
    private var latestSummary: PlanSummary?

    #if canImport(WatchConnectivity)
    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }
    #endif

    /// Activate the session. Safe to call once at launch; a no-op where
    /// WatchConnectivity is unsupported (e.g. iPad).
    func activate() {
        #if canImport(WatchConnectivity)
        guard let session else { return }
        session.delegate = self
        session.activate()
        #endif
    }

    /// Send the latest plan summary to the watch. Uses application context (the
    /// durable "latest state" channel) always, plus an immediate message when the
    /// watch is reachable. Encoded as JSON `Data` so both sides share exactly one
    /// serialization (FuelJSON) — no hand-built dictionaries to drift.
    func send(_ summary: PlanSummary) {
        latestSummary = summary
        #if canImport(WatchConnectivity)
        guard let session, session.activationState == .activated else { return }
        guard let data = try? FuelJSON.encoder.encode(summary) else { return }
        let payload: [String: Any] = ["planSummary": data]

        // Durable latest-state: overwrites the previous context, delivered when
        // the watch next wakes. `updateApplicationContext` throws if called before
        // activation completes — guarded above.
        try? session.updateApplicationContext(payload)

        // Instant nudge when reachable; failures are non-fatal (the context above
        // still carries the state).
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
        #endif
    }

    // MARK: - Inbound handoff

    /// Central handler for any inbound dictionary that might carry a "log later"
    /// handoff from the watch. Recognizes {"action":"logLater", "note": "..."}.
    private func handleInbound(_ message: [String: Any]) {
        guard (message["action"] as? String) == "logLater" else { return }
        let note = message["note"] as? String
        onLogLater?(note)
    }
}

#if canImport(WatchConnectivity)
extension PhoneSessionManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession,
                             activationDidCompleteWith activationState: WCSessionActivationState,
                             error: Error?) {
        Task { @MainActor in
            self.refreshReachability(session)
            self.activationError = error?.localizedDescription
            // If we already built a summary before activation completed, deliver
            // it now so the watch is never left with stale state.
            if activationState == .activated, let summary = self.latestSummary {
                self.send(summary)
            }
        }
    }

    // On iPhone the session can deactivate when switching watches; reactivate so
    // the phone stays ready for the next paired watch.
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in self.refreshReachability(session) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.handleInbound(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                             replyHandler: @escaping ([String: Any]) -> Void) {
        Task { @MainActor in self.handleInbound(message) }
        replyHandler(["ok": true])
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        Task { @MainActor in self.handleInbound(userInfo) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.handleInbound(applicationContext) }
    }

    @MainActor
    private func refreshReachability(_ session: WCSession) {
        isReachable = session.isReachable
        isWatchAppInstalled = session.isWatchAppInstalled
    }
}
#endif
