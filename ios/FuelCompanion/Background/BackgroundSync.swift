// BackgroundSync.swift — periodic refresh via BGTaskScheduler. Registers a
// single app-refresh task that runs a full sync cycle (read HealthKit → ingest →
// push watch) when iOS grants background time, and re-schedules itself so the
// cadence continues.
//
// Two identifiers are declared for the two UIBackgroundModes we request:
//   • refreshTaskId    — BGAppRefreshTask   (opportunistic, short)
//   • processingTaskId — BGProcessingTask   (longer, e.g. after a big import)
// Both MUST appear in Info.plist's BGSchedulerPermittedIdentifiers. The plist
// and this code derive them from PRODUCT_BUNDLE_IDENTIFIER so they cannot drift.

import Foundation
import BackgroundTasks

enum BackgroundSync {

    private static var appIdentifier: String {
        guard let value = Bundle.main.bundleIdentifier, !value.isEmpty else {
            preconditionFailure("FuelCompanion requires PRODUCT_BUNDLE_IDENTIFIER")
        }
        return value
    }

    static var refreshTaskId: String { "\(appIdentifier).refresh" }
    static var processingTaskId: String { "\(appIdentifier).sync" }

    /// The work one background run performs. Set once by the app at launch so the
    /// registered handlers have something to call. Kept as a stored closure
    /// (rather than a captured object) so registration can happen at the exact
    /// launch moment BGTaskScheduler requires, before the object graph is built.
    private static var work: (@Sendable () async -> Void)?

    /// Register the task handlers. MUST be called before the app finishes
    /// launching (from the app delegate's didFinishLaunching), exactly once.
    static func register(work: @escaping @Sendable () async -> Void) {
        self.work = work

        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshTaskId, using: nil) { task in
            handle(task)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: processingTaskId, using: nil) { task in
            handle(task)
        }
    }

    /// Ask iOS for the next background run. Call when entering background. iOS
    /// decides the actual time; `earliestBeginDate` is a floor, not a promise.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 3600) // ~every 2h
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Common in the simulator / when disabled in Settings; not fatal.
            // The app still syncs on foreground and on observer-query fires.
        }
    }

    /// Run the stored work with a task-expiration guard, then re-schedule.
    private static func handle(_ task: BGTask) {
        // Re-schedule immediately so a missed/short run doesn't end the cadence.
        schedule()

        let job = Task {
            await work?()
            task.setTaskCompleted(success: true)
        }
        // If the system reclaims our time, cancel the work and report incomplete.
        task.expirationHandler = {
            job.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}
