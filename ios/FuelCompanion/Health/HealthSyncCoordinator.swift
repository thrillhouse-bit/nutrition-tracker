// HealthSyncCoordinator.swift — orchestrates one sync cycle:
//   read HealthKit → build IngestPayload → POST /api/apple/ingest → refresh
//   /api/today and push the PlanSummary to the watch.
//
// It is the single entry point every trigger funnels through — app foreground,
// an HKObserverQuery firing, the "Sync now" button, and the BGTask handler — so
// there is exactly one place that decides what a sync does. Its published state
// (`lastSyncAt`, `lastError`, `permissions`, `isSyncing`) drives the status UI.

import Foundation
import Combine

@MainActor
final class HealthSyncCoordinator: ObservableObject {

    enum Reason: String { case foreground, observer, background, manual }

    /// Timestamp of the last SUCCESSFUL ingest (nil until the first one lands).
    @Published private(set) var lastSyncAt: Date?
    /// A user-facing error from the last cycle, or nil when the last cycle was
    /// clean. Never contains the token or any secret.
    @Published private(set) var lastError: String?
    /// The honest device-side view of which categories returned data. Published
    /// even on a failed POST so the status screen can show partial permissions.
    @Published private(set) var permissions: HealthPermissions?
    /// True while a cycle is in flight (drives the spinner / disables buttons).
    @Published private(set) var isSyncing: Bool = false

    /// Nutrition write-back state — kept separate from `lastError`/`lastSyncAt`
    /// (the ingest direction) so a write-back failure never masks, or gets
    /// masked by, an ingest result; the two are independent best-effort steps.
    @Published private(set) var writeBackError: String?
    @Published private(set) var lastWriteBackAt: Date?

    private let health: HealthKitManager
    private let config: AppConfig
    private let ingest: IngestClient
    private let today: TodayClient
    private let entries: EntriesClient
    private let nutritionWriter: HealthKitNutritionWriter

    /// How far back each cycle reconciles nutrition write-back. Bounded on
    /// purpose (see NutritionWriteBack.swift): an entry edited outside this
    /// window after its first sync will not be corrected in Health.
    private static let writeBackWindowDays = 14

    /// Serializes cycles so overlapping triggers (observer + foreground) don't
    /// double-POST the same day.
    private var inFlight: Task<Void, Never>?

    init(health: HealthKitManager, config: AppConfig, ingest: IngestClient, today: TodayClient,
         entries: EntriesClient = EntriesClient(), nutritionWriter: HealthKitNutritionWriter = HealthKitNutritionWriter()) {
        self.health = health
        self.config = config
        self.ingest = ingest
        self.today = today
        self.entries = entries
        self.nutritionWriter = nutritionWriter
    }

    /// Called when the user turns on "Sync nutrition to Health" — requests the
    /// separate write-authorization and, on success, runs one write-back pass
    /// immediately rather than waiting for the next scheduled cycle.
    ///
    /// `requestAuthorization` does NOT throw on a user decline — unlike read
    /// access, HealthKit reports write-authorization status honestly, so a
    /// decline surfaces as `isAuthorized == false` afterward, not an error.
    /// Checking it explicitly here means the toggle never sits ON silently
    /// doing nothing after a decline.
    func enableNutritionWriteBack() async {
        do {
            try await nutritionWriter.requestAuthorization()
        } catch {
            writeBackError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return
        }
        guard nutritionWriter.isAuthorized else {
            writeBackError = "Health denied write access. Turn it on in Settings → Health → FuelCompanion."
            return
        }
        writeBackError = nil
        await runWriteBack()
    }

    /// Ask for authorization (idempotent) then arm background delivery so future
    /// workout/energy writes wake us to sync. Safe to call more than once.
    func start() async {
        guard health.isHealthDataAvailable else { return }
        try? await health.requestAuthorization()
        health.enableBackgroundDelivery { [weak self] in
            // Observer callbacks arrive off the main actor; hop back on.
            Task { @MainActor in await self?.sync(reason: .observer) }
        }
    }

    /// Run a full sync cycle. Coalesces with any in-flight cycle so concurrent
    /// triggers await the same work instead of racing.
    func sync(reason: Reason) async {
        if let inFlight { await inFlight.value; return }
        let task = Task { await runCycle(reason: reason) }
        inFlight = task
        await task.value
        inFlight = nil
    }

    private func runCycle(reason: Reason) async {
        guard health.isHealthDataAvailable else {
            lastError = "Apple Health is not available on this device."
            return
        }
        guard let baseURL = config.baseURL else {
            lastError = "Set your server URL in Settings to start syncing."
            return
        }

        isSyncing = true
        defer { isSyncing = false }

        // Make sure we've asked before reading — a first observer fire could
        // otherwise read before the user ever authorized.
        if !health.didRequestAuthorization { try? await health.requestAuthorization() }

        let now = Date()
        let (samples, available) = await health.readToday(now: now)

        // Publish the honest device-side permission view immediately. `available`
        // lists only categories that returned data; missing = unavailable, never
        // denied.
        let perms = HealthPermissions(requested: health.requestedCategories, available: available)
        permissions = perms

        let payload = IngestPayload(date: TodayClient.localYmd(now), samples: samples, permissions: perms)

        do {
            let response = try await ingest.post(payload, baseURL: baseURL, token: config.ingestToken)
            lastSyncAt = Date()
            lastError = nil
            // Prefer the server's recorded permission view when it echoes one, so
            // the UI matches what the backend stored.
            if let serverPerms = response.permissions { permissions = serverPerms }
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            // Do not update lastSyncAt: the sync did not succeed.
            return
        }

        // Best-effort: refresh the Today composite and push the watch summary.
        // A failure here does NOT fail the ingest that already succeeded; it is
        // surfaced separately without clobbering `lastSyncAt`.
        do {
            try await today.refresh(baseURL: baseURL, token: config.ingestToken)
        } catch {
            lastError = "Synced, but the watch summary could not refresh: "
                + ((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }

        // Best-effort, opt-in: write logged nutrition back to Health. Never
        // affects `lastError`/`lastSyncAt` — ingest already succeeded above.
        if config.writeBackEnabled { await runWriteBack() }
    }

    /// One write-back reconciliation pass over the trailing window. Safe to
    /// call directly (from the opt-in toggle) or from a sync cycle.
    private func runWriteBack() async {
        guard let baseURL = config.baseURL, nutritionWriter.isAuthorized else { return }
        let now = Date()
        let from = Calendar.current.date(byAdding: .day, value: -Self.writeBackWindowDays, to: now) ?? now
        do {
            let rows = try await entries.fetch(from: from, to: now, baseURL: baseURL, token: config.ingestToken)
            try await nutritionWriter.reconcile(entries: rows, from: from, to: now)
            lastWriteBackAt = Date()
            writeBackError = nil
        } catch {
            writeBackError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// True when the last successful sync is older than 24h (STALE state).
    func isStale(now: Date = Date()) -> Bool {
        guard let lastSyncAt else { return false }
        return now.timeIntervalSince(lastSyncAt) > 24 * 3600
    }

    // Exposed so the status UI can read write-back's authorization state
    // without holding its own reference to a non-Observable HealthKit type.
    var isNutritionWriteBackAuthorized: Bool { nutritionWriter.isAuthorized }
    var isNutritionWriteBackDetermined: Bool { nutritionWriter.isDetermined }
}
