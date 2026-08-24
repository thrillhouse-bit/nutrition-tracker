// WatchSessionManager.swift — the watch side of WatchConnectivity.
//
// Direction of data:
//   • PHONE -> WATCH: a `PlanSummary` (JSON, encoded with `FuelJSON`) arrives
//     as either `applicationContext` (latest-state, coalesced, survives a
//     relaunch) OR a live `message` (immediate, only when reachable). We accept
//     BOTH and treat them identically — whichever lands last wins.
//   • WATCH -> PHONE: `requestLogLater()` — the ONLY capture affordance on the
//     watch. It is a handoff: it tells the phone "the wearer wants to log
//     something later," and the phone (the HealthKit bridge / scanner) does the
//     actual capture. The watch never scans barcodes or labels.
//
// The watch does NOT read HealthKit and does NOT compute the plan. It renders
// what the phone sends. See PlanSummary.swift for the contract.

import Foundation
import Combine
import WatchConnectivity

/// Cross-app WatchConnectivity keys. The PHONE app must use these exact strings
/// when it sends the summary and when it reads the handoff, or the two ends
/// silently talk past each other — the house failure mode. Keep this list and
/// the phone's in sync (ideally by sharing this file with the phone target).
enum FuelWCKeys {
    /// The summary payload: `FuelJSON`-encoded `PlanSummary` bytes under this key.
    static let summary = "planSummary"

    /// The handoff message: `[action: logLater]`, optionally with a `note`.
    static let action = "action"
    static let logLater = "logLater"
    static let note = "note"
}

/// User-visible outcome of the last handoff tap.
enum HandoffState: Equatable {
    case idle
    case sent            // delivered live (phone was reachable and acked)
    case queued          // phone not reachable; queued for guaranteed delivery
    case failed(String)  // transport error — surfaced, never swallowed
}

final class WatchSessionManager: NSObject, ObservableObject {

    /// The store we push received summaries into. Held strongly; the app owns
    /// both for its whole lifetime.
    private let store: SummaryStore

    @Published private(set) var activationState: WCSessionActivationState = .notActivated
    @Published private(set) var isReachable: Bool = false
    @Published private(set) var lastHandoff: HandoffState = .idle

    /// Whether this device even supports WatchConnectivity (always true on a
    /// real watch; false in some preview/simulator edge cases).
    let isSupported: Bool = WCSession.isSupported()

    init(store: SummaryStore) {
        self.store = store
        super.init()
    }

    /// Activate the session. Idempotent-ish: WCSession tolerates a repeat
    /// `activate()`, but we set the delegate once. Call after the UI is up.
    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: - Handoff (watch -> phone)

    /// Ask the phone to let the wearer log something later. This is a handoff,
    /// not a capture: the phone owns scanning/entry. Delivered live when the
    /// phone is reachable, otherwise queued for guaranteed background delivery.
    func requestLogLater(note: String? = nil) {
        guard WCSession.isSupported() else {
            setHandoff(.failed("Watch connectivity unavailable"))
            return
        }
        var payload: [String: Any] = [FuelWCKeys.action: FuelWCKeys.logLater]
        if let note { payload[FuelWCKeys.note] = note }

        let session = WCSession.default
        if session.isReachable {
            // Live path: fast, needs the phone app foregrounded/reachable. On any
            // failure, fall back to the queued transfer rather than dropping it.
            session.sendMessage(payload, replyHandler: { [weak self] _ in
                self?.setHandoff(.sent)
            }, errorHandler: { [weak self] _ in
                self?.queueHandoff(payload)
            })
        } else {
            // Not reachable: queue it. `transferUserInfo` is delivered in the
            // background whenever the phone next comes up — guaranteed, ordered.
            queueHandoff(payload)
        }
    }

    private func queueHandoff(_ payload: [String: Any]) {
        _ = WCSession.default.transferUserInfo(payload) // returns a transfer handle; we don't track it
        setHandoff(.queued)
    }

    // MARK: - Applying an inbound summary

    /// Decode a `PlanSummary` from either transport's dictionary and hand it to
    /// the store on the main thread. Ignores dictionaries that don't carry a
    /// summary (e.g. a phone-side ack) rather than clobbering good state.
    private func ingest(_ dict: [String: Any]) {
        guard let data = dict[FuelWCKeys.summary] as? Data,
              let summary = try? FuelJSON.decoder.decode(PlanSummary.self, from: data)
        else { return }
        DispatchQueue.main.async { [store] in
            store.apply(summary)
        }
    }

    private func setHandoff(_ state: HandoffState) {
        DispatchQueue.main.async { [weak self] in self?.lastHandoff = state }
    }
}

// MARK: - WCSessionDelegate
//
// watchOS requires only `activationDidCompleteWith`. The `sessionDidBecomeInactive`
// / `sessionDidDeactivate` pair is iOS-only and deliberately absent here.

extension WatchSessionManager: WCSessionDelegate {

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        DispatchQueue.main.async { [weak self] in
            self?.activationState = activationState
            self?.isReachable = session.isReachable
        }
        // On (re)activation the phone's latest-state context may already be
        // waiting — pick it up so we don't sit blank until the next push.
        let pending = session.receivedApplicationContext
        if !pending.isEmpty { ingest(pending) }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { [weak self] in
            self?.isReachable = session.isReachable
        }
    }

    /// Latest-state push (coalesced, survives relaunch). The common path.
    func session(_ session: WCSession,
                 didReceiveApplicationContext applicationContext: [String: Any]) {
        ingest(applicationContext)
    }

    /// Live message, no reply expected.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        ingest(message)
    }

    /// Live message with a reply — ack so the phone knows the watch has it.
    func session(_ session: WCSession,
                 didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        ingest(message)
        replyHandler(["ok": true])
    }

    /// Queued background transfer (the phone's fallback when the watch wasn't
    /// reachable). Same payload shape as a live message.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        ingest(userInfo)
    }
}
