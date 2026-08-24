// FuelWatchApp.swift — @main for the watchOS app target.
//
// FuelWatch is a MINIMAL, glanceable VIEWER for the phone's fueling plan. It is
// not a dashboard and not a scanner. Architecture, v1:
//   • The PHONE is the HealthKit bridge and computes the plan.
//   • The WATCH receives a small `PlanSummary` over WatchConnectivity and shows
//     it. It reads NO HealthKit, records NO workouts, and scans nothing.
//
// This file wires the two long-lived objects together and hands them to the
// view tree:
//   • `SummaryStore`         — holds/persists the latest summary.
//   • `WatchSessionManager`  — the WCSession delegate that feeds the store and
//                              sends the "log later" handoff back to the phone.
//
// TODO (developer, before it builds): create the watch app target + a Widget
// Extension target, set bundle ids / team, add the App Group capability to both
// (see FuelWatch.entitlements), and pair a phone build so WatchConnectivity has
// a counterpart. Nothing here has been compiled — there is no Xcode/watchOS SDK
// in this environment.

import SwiftUI

@main
struct FuelWatchApp: App {

    @StateObject private var store: SummaryStore
    @StateObject private var session: WatchSessionManager

    init() {
        // The session manager needs the store, so build the store first and
        // hand the SAME instance to both `@StateObject`s.
        let sharedStore = SummaryStore()
        _store = StateObject(wrappedValue: sharedStore)
        _session = StateObject(wrappedValue: WatchSessionManager(store: sharedStore))
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                GlanceView()
            }
            .environmentObject(store)
            .environmentObject(session)
            // Activate WatchConnectivity once the UI exists. `activate()` also
            // drains any application-context the phone already left waiting.
            .task { session.activate() }
        }
    }
}
