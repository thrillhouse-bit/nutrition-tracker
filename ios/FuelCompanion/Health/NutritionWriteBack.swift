// NutritionWriteBack.swift — the WRITE half of the Apple Health bridge.
// HealthKitManager (Health/HealthKitManager.swift) reads wearable signals
// IN; this writes logged nutrition OUT, so a person's food log also shows up
// in the Health app's own Nutrition data, alongside whatever else reads it.
//
// This is a SEPARATE, explicitly opt-in authorization from HealthKitManager's
// — that one requests `toShare: []` and must stay that way (see its own
// header comment: the app must never gain write access to the fueling-signal
// categories it reads, or a reviewer auditing "read-only" would have to
// re-check every write path instead of finding a hard `toShare: []`).
// Nutrition types are a disjoint set — dietary energy/protein/carbs/fat/
// fiber/sugar/sodium — never a workout, activity, or sleep type, so this
// writer can never touch the read-only guarantee.
//
// Known limitation, deliberately scoped for v1: each logged entry is written
// ONCE (a fixed `HKMetadataKeySyncVersion` of 1) and never updated in place —
// editing an already-synced entry's servings/meal does not update its
// HealthKit record. Deleting the entry does remove it (see `reconcile`).
// Revisit if that turns out to matter in practice.

import Foundation
import HealthKit

/// The custom metadata key this app stamps on every correlation it writes,
/// so a later sync can recognize its own entries without relying on
/// HealthKit's sync-identifier predicate matching (which only supports exact
/// values, not "any entry-* key" — a plain in-Swift filter over a bounded
/// date-range query is simpler and just as correct here).
private let fuelEntryIDKey = "com.fuelintelligence.entryId"

struct HealthKitNutritionWriter {
    enum WriteBackError: LocalizedError {
        case unavailable
        case notAuthorized

        var errorDescription: String? {
            switch self {
            case .unavailable: return "Apple Health is not available on this device."
            case .notAuthorized: return "Nutrition write-back isn't authorized yet."
            }
        }
    }

    private let store = HKHealthStore()

    // MARK: - Types

    private var shareTypes: Set<HKSampleType> {
        var s: Set<HKSampleType> = [HKCorrelationType.correlationType(forIdentifier: .food)!]
        for id in Self.quantityIdentifiers { s.insert(HKQuantityType.quantityType(forIdentifier: id)!) }
        return s
    }

    private static let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
        .dietaryEnergyConsumed, .dietaryProtein, .dietaryCarbohydrates,
        .dietaryFatTotal, .dietaryFiber, .dietarySugar, .dietarySodium,
    ]

    // MARK: - Authorization

    /// True once the user has explicitly allowed (or denied) nutrition
    /// sharing — unlike read authorization, HealthKit DOES report write
    /// authorization status honestly, since the app itself needs to know
    /// before attempting a write.
    var isDetermined: Bool {
        guard HKHealthStore.isHealthDataAvailable(),
              let food = HKCorrelationType.correlationType(forIdentifier: .food) else { return false }
        return store.authorizationStatus(for: food) != .notDetermined
    }

    var isAuthorized: Bool {
        guard HKHealthStore.isHealthDataAvailable(),
              let food = HKCorrelationType.correlationType(forIdentifier: .food) else { return false }
        return store.authorizationStatus(for: food) == .sharingAuthorized
    }

    /// Request share (write) AND read authorization for the nutrition types —
    /// read is required too, even for data this app itself wrote, or the
    /// dedup query in `reconcile` could never see its own prior writes.
    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw WriteBackError.unavailable }
        try await store.requestAuthorization(toShare: shareTypes, read: shareTypes)
    }

    // MARK: - Reconcile: create missing, remove entries no longer present

    /// `entries` should be the FULL set the server reports for [from, to) —
    /// anything previously written in that window but absent from `entries`
    /// is treated as deleted server-side and removed from Health too.
    func reconcile(entries: [LoggedEntry], from: Date, to: Date) async throws {
        guard isAuthorized else { throw WriteBackError.notAuthorized }

        let existing = try await existingByEntryID(from: from, to: to)
        let presentIDs = Set(entries.map { String($0.id) })

        for entry in entries where existing[String(entry.id)] == nil {
            try await save(entry: entry)
        }

        let stale = existing.filter { !presentIDs.contains($0.key) }.map(\.value)
        if !stale.isEmpty {
            try await store.delete(stale)
        }
    }

    /// Every `.food` correlation THIS APP wrote in [from, to), keyed by the
    /// entry id in its metadata. Correlations without our key (written by a
    /// different app) are ignored — never touched by delete.
    private func existingByEntryID(from: Date, to: Date) async throws -> [String: HKCorrelation] {
        guard let foodType = HKCorrelationType.correlationType(forIdentifier: .food) else { return [:] }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: .strictStartDate)
        let samples: [HKSample] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: foodType, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error { cont.resume(throwing: error) } else { cont.resume(returning: samples ?? []) }
            }
            store.execute(q)
        }
        var out: [String: HKCorrelation] = [:]
        for case let c as HKCorrelation in samples {
            if let id = c.metadata?[fuelEntryIDKey] as? String { out[id] = c }
        }
        return out
    }

    /// Build the per-nutrient quantity samples (servings-scaled) and save
    /// them as one `.food` correlation, tagged with the entry id + food name.
    private func save(entry: LoggedEntry) async throws {
        guard let foodType = HKCorrelationType.correlationType(forIdentifier: .food),
              let food = entry.food else { return }
        let servings = entry.servingsConsumed

        func quantity(_ id: HKQuantityTypeIdentifier, _ perServing: Double?, unit: HKUnit) -> HKQuantitySample? {
            guard let perServing, let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
            let total = perServing * servings
            return HKQuantitySample(type: type, quantity: HKQuantity(unit: unit, doubleValue: total),
                                    start: entry.loggedAt, end: entry.loggedAt)
        }

        var members: Set<HKSample> = []
        if let s = quantity(.dietaryEnergyConsumed, food.calories, unit: .kilocalorie()) { members.insert(s) }
        if let s = quantity(.dietaryProtein, food.proteinG, unit: .gram()) { members.insert(s) }
        if let s = quantity(.dietaryCarbohydrates, food.carbsG, unit: .gram()) { members.insert(s) }
        if let s = quantity(.dietaryFatTotal, food.fatG, unit: .gram()) { members.insert(s) }
        if let s = quantity(.dietaryFiber, food.fiberG, unit: .gram()) { members.insert(s) }
        if let s = quantity(.dietarySugar, food.sugarG, unit: .gram()) { members.insert(s) }
        if let s = quantity(.dietarySodium, food.sodiumMg, unit: .gramUnit(with: .milli)) { members.insert(s) }
        guard !members.isEmpty else { return } // nothing nutritive to write (e.g. an entry whose food row is missing values)

        let metadata: [String: Any] = [
            HKMetadataKeyFoodType: food.name,
            HKMetadataKeySyncIdentifier: "entry-\(entry.id)",
            HKMetadataKeySyncVersion: 1,
            fuelEntryIDKey: String(entry.id),
        ]
        let correlation = HKCorrelation(type: foodType, start: entry.loggedAt, end: entry.loggedAt,
                                        objects: members, metadata: metadata)
        try await store.save(correlation)
    }
}
