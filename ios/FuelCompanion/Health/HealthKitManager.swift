// HealthKitManager.swift — the read-only HealthKit bridge. It requests the
// MINIMUM fueling context (workouts, active energy, exercise/activity, sleep,
// and OPTIONAL heart-rate context: HRV + resting HR + steps), reads today's
// samples, and normalizes them into the shared `[HealthSample]` shape the
// backend understands. It also arms background delivery so fresh workout/energy
// data can trigger a sync.
//
// Hard rules encoded here:
//  • READ ONLY. We request `toShare: []` — no write access — so the app needs
//    no NSHealthUpdateUsageDescription and can never modify the user's Health.
//  • NO clinical data. No ECG, blood glucose, blood pressure, or Health Records.
//    Only the fueling-context types listed below.
//  • We NEVER record or start workouts (no HKWorkoutSession / WorkoutKit) — we
//    read APPROVED workouts the user already logged.
//  • We NEVER infer "denied". HealthKit hides read-authorization by design, so a
//    category that returns no data is simply omitted from `available`; it is not
//    reported as refused.

import Foundation
import HealthKit

@MainActor
final class HealthKitManager: ObservableObject {

    /// Whether HealthKit exists on this device at all (false on iPad and on a
    /// simulator without Health). Drives the "HealthKit unavailable" UI state.
    @Published private(set) var isHealthDataAvailable: Bool = HKHealthStore.isHealthDataAvailable()

    /// True once we have completed an authorization request this launch. Note it
    /// does NOT mean data will be returned — HealthKit reports read-auth as
    /// undetermined for privacy — so partial/no-data is decided from real reads.
    @Published private(set) var didRequestAuthorization: Bool = false

    /// Every category we ask to read. This is the honest `requested` set; the
    /// `available` set is computed from which reads actually returned data.
    let requestedCategories: [HealthCategory] = HealthCategory.allCases

    private let store = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []

    // MARK: - Type accessors (all optional — a type may be unknown on old OSes)

    private var activeEnergyType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) }
    private var exerciseTimeType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .appleExerciseTime) }
    private var stepType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .stepCount) }
    private var hrvType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) }
    private var restingHRType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .restingHeartRate) }
    private var sleepType: HKCategoryType? { HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) }
    private var bodyMassType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .bodyMass) }

    /// Sample types we observe for background delivery (activity summary is not a
    /// sample type, so it is excluded here but still read on demand).
    private var observableSampleTypes: [HKSampleType] {
        var t: [HKSampleType] = [HKObjectType.workoutType()]
        for case let type? in [activeEnergyType, exerciseTimeType, stepType, hrvType, restingHRType, bodyMassType] {
            t.append(type)
        }
        if let sleepType { t.append(sleepType) }
        return t
    }

    /// The full READ set. Includes `activitySummaryType` (for the exercise ring
    /// fallback) even though it is not a sample type.
    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [HKObjectType.workoutType(), HKObjectType.activitySummaryType()]
        for case let type? in [activeEnergyType, exerciseTimeType, stepType, hrvType, restingHRType, bodyMassType] {
            s.insert(type)
        }
        if let sleepType { s.insert(sleepType) }
        return s
    }

    // MARK: - Authorization

    /// Request READ authorization for the minimum set. Read-only: `toShare` is
    /// empty. Throws only on a genuine request failure (not on the user choosing
    /// to withhold a category — HealthKit does not surface that to us).
    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try await store.requestAuthorization(toShare: [], read: readTypes)
        didRequestAuthorization = true
    }

    // MARK: - Reading today

    /// Read every metric for the local day containing `now`, returning the
    /// normalized samples and the set of categories that ACTUALLY returned data
    /// (the honest `available` set). Categories that returned nothing are simply
    /// absent — never marked denied.
    func readToday(now: Date = Date()) async -> (samples: [HealthSample], available: [HealthCategory]) {
        guard HKHealthStore.isHealthDataAvailable() else { return ([], []) }

        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: now)
        var samples: [HealthSample] = []
        var available: Set<HealthCategory> = []

        // Steps (context) — cumulative count for the day.
        if let steps = await cumulativeSum(stepType, unit: .count(), dayStart, now) {
            available.insert(.steps)
            samples.append(makeSample(.steps, .number(steps), unit: "steps", recorded: now, fetched: now))
        }

        // Active energy → `expenditure`. We only read ACTIVE energy (no basal —
        // basal is not in our minimum set), so value == active and we also stamp
        // `extra.active` to match the backend's expenditure shape.
        if let kcal = await cumulativeSum(activeEnergyType, unit: .kilocalorie(), dayStart, now) {
            available.insert(.activeEnergy)
            samples.append(makeSample(.expenditure, .number(kcal), unit: "kcal",
                                      recorded: now, fetched: now, extra: ["active": kcal]))
        }

        // Exercise minutes — appleExerciseTime, falling back to the day's Activity
        // Summary ring if the discrete metric is unavailable.
        var exerciseMin = await cumulativeSum(exerciseTimeType, unit: .minute(), dayStart, now)
        if exerciseMin == nil { exerciseMin = await activitySummaryExerciseMinutes(now) }
        if let m = exerciseMin {
            available.insert(.exercise)
            samples.append(makeSample(.exercise, .number(m), unit: "min", recorded: now, fetched: now))
        }

        // Sleep — sum of "asleep" segments. The window reaches back 18h before
        // midnight so last night's sleep (which ends this morning) is captured.
        let sleepWindowStart = cal.date(byAdding: .hour, value: -18, to: dayStart) ?? dayStart
        if let hours = await sleepHours(sleepWindowStart, now) {
            available.insert(.sleep)
            samples.append(makeSample(.sleep, .number(hours), unit: "h", recorded: now, fetched: now))
        }

        // HRV (SDNN) — CONTEXT ONLY. Sent for explanation; the backend's rules
        // engine never reads it, so it can never change a target.
        if let ms = await discreteAverage(hrvType, unit: HKUnit.secondUnit(with: .milli), dayStart, now) {
            available.insert(.hrv)
            samples.append(makeSample(.hrv, .number(ms), unit: "ms", recorded: now, fetched: now))
        }

        // Resting heart rate — CONTEXT ONLY, same rule as HRV.
        let bpmUnit = HKUnit.count().unitDivided(by: .minute())
        if let bpm = await discreteAverage(restingHRType, unit: bpmUnit, dayStart, now) {
            available.insert(.restingHR)
            samples.append(makeSample(.restingHR, .number(bpm), unit: "bpm", recorded: now, fetched: now))
        }

        // Body mass → the backend's trend-weight feature (server/weightTrend.js),
        // provider='apple' alongside any manually-typed reading for the same
        // day (the backend merges the two at read time, manual taking
        // precedence — see listWeightEntries). Requested in kilograms
        // directly, matching the backend's canonical storage unit, so there
        // is no display-unit conversion to get wrong here regardless of the
        // Health app's own locale/unit setting. discreteAverage — the same
        // helper HRV/resting-HR already use — is deliberate: someone who
        // weighs in more than once in a day gets those readings averaged
        // into one value, rather than only the single most-recent reading
        // silently winning.
        let kgUnit = HKUnit.gramUnit(with: .kilo)
        if let kg = await discreteAverage(bodyMassType, unit: kgUnit, dayStart, now) {
            available.insert(.bodyMass)
            samples.append(makeSample(.weight, .number(kg), unit: "kg", recorded: now, fetched: now))
        }

        // Workouts — APPROVED, completed workouts only. One sample per workout;
        // the backend keeps the last for the day's composed `workout` signal.
        let workouts = await workoutsToday(dayStart, now)
        if !workouts.isEmpty {
            available.insert(.workouts)
            for w in workouts { samples.append(makeWorkoutSample(w, fetched: now)) }
        }

        // Order the available set to match the requested list for stable display.
        let orderedAvailable = requestedCategories.filter { available.contains($0) }
        return (samples, orderedAvailable)
    }

    // MARK: - Background delivery

    /// Enable background delivery + an observer query per sample type so fresh
    /// workout/energy data wakes the app to sync. `onUpdate` is invoked on the
    /// query's callback queue; hop to the main actor inside it if needed.
    func enableBackgroundDelivery(onUpdate: @escaping @Sendable () -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        // Clear any prior observers so re-arming does not double-fire.
        disableObservers()

        for type in observableSampleTypes {
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in
                // Enabling is best-effort; a failure here just means we rely on
                // foreground + BGTask refresh. No user-facing error.
            }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, _ in
                onUpdate()
                // MUST call completion so HealthKit knows we handled the update;
                // omitting it throttles future background deliveries.
                completion()
            }
            store.execute(query)
            observerQueries.append(query)
        }
    }

    func disableObservers() {
        for q in observerQueries { store.stop(q) }
        observerQueries.removeAll()
    }

    // MARK: - Query helpers (completion-handler HealthKit APIs wrapped in async)

    private func cumulativeSum(_ type: HKQuantityType?, unit: HKUnit, _ start: Date, _ end: Date) async -> Double? {
        guard let type else { return nil }
        return await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred,
                                      options: .cumulativeSum) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private func discreteAverage(_ type: HKQuantityType?, unit: HKUnit, _ start: Date, _ end: Date) async -> Double? {
        guard let type else { return nil }
        return await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred,
                                      options: .discreteAverage) { _, stats, _ in
                cont.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private func workoutsToday(_ start: Date, _ end: Date) async -> [HKWorkout] {
        await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
                cont.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }
    }

    private func sleepHours(_ start: Date, _ end: Date) async -> Double? {
        guard let sleepType else { return nil }
        return await withCheckedContinuation { cont in
            let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
            let q = HKSampleQuery(sampleType: sleepType, predicate: pred,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                guard let cats = samples as? [HKCategorySample], !cats.isEmpty else {
                    cont.resume(returning: nil); return
                }
                let asleep = cats.filter { Self.isAsleepValue($0.value) }
                guard !asleep.isEmpty else { cont.resume(returning: nil); return }
                let seconds = asleep.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                cont.resume(returning: seconds / 3600.0)
            }
            store.execute(q)
        }
    }

    private func activitySummaryExerciseMinutes(_ now: Date) async -> Double? {
        await withCheckedContinuation { cont in
            let cal = Calendar.current
            var comps = cal.dateComponents([.year, .month, .day], from: now)
            comps.calendar = cal
            let pred = HKQuery.predicate(forActivitySummariesBetweenStart: comps, end: comps)
            let q = HKActivitySummaryQuery(predicate: pred) { _, summaries, _ in
                let mins = summaries?.first?.appleExerciseTime.doubleValue(for: .minute())
                cont.resume(returning: mins)
            }
            store.execute(q)
        }
    }

    // MARK: - Normalization helpers

    private func makeSample(_ metric: SignalMetric, _ value: SampleValue, unit: String?,
                            recorded: Date, fetched: Date, extra: [String: Double]? = nil) -> HealthSample {
        HealthSample(metric: metric, value: value, unit: unit,
                     recordedAt: recorded, fetchedAt: fetched, extra: extra)
    }

    private func makeWorkoutSample(_ w: HKWorkout, fetched: Date) -> HealthSample {
        let (kind, shortLabel) = Self.kind(for: w.workoutActivityType)
        let startHour = Self.hourFloat(w.startDate)
        let endHour = Self.hourFloat(w.endDate)
        // Active energy of the workout, if the workout carries it. Uses the
        // current statistics(for:) API rather than the deprecated
        // `totalEnergyBurned`; nil is fine — estKcal is optional context.
        var kcal: Double?
        if let energyType = activeEnergyType {
            kcal = w.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie())
        }
        let value = WorkoutValue(
            label: Self.label(startHour: startHour, kind: kind),
            shortLabel: shortLabel,
            kind: kind,
            time: Self.timeString(w.startDate),
            startHour: startHour,
            endHour: endHour,
            durationMin: w.duration / 60.0,
            estKcal: kcal,
            // We only ever read completed, approved workouts; we never plan or
            // record, so status is always "completed".
            status: "completed"
        )
        return HealthSample(metric: .workout, value: .workout(value), unit: nil,
                            recordedAt: w.endDate, fetchedAt: fetched, extra: nil)
    }

    // MARK: - Small pure mappers (static so they can be unit-tested in isolation)

    /// Which sleep-analysis category values count as "asleep". iOS 16 split the
    /// old single `.asleep` into core/deep/REM/unspecified.
    static func isAsleepValue(_ raw: Int) -> Bool {
        if #available(iOS 16.0, *) {
            return HKCategoryValueSleepAnalysis.allAsleepValues.map { $0.rawValue }.contains(raw)
        } else {
            return raw == HKCategoryValueSleepAnalysis.asleep.rawValue
        }
    }

    /// Local-time hour as a float: 17:30 → 17.5. Matches `WorkoutValue.startHour`
    /// so the rules engine can compute the pre-workout window.
    static func hourFloat(_ date: Date) -> Double {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return Double(c.hour ?? 0) + Double(c.minute ?? 0) / 60.0
    }

    static func timeString(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f.string(from: date)
    }

    /// A display label built from the time of day and the workout kind, e.g.
    /// "Evening Run". HKWorkout has no reliable user title, so we synthesize one.
    static func label(startHour: Double, kind: String) -> String {
        let part: String
        switch startHour {
        case ..<5: part = "Night"
        case ..<12: part = "Morning"
        case ..<17: part = "Afternoon"
        case ..<21: part = "Evening"
        default: part = "Night"
        }
        return "\(part) \(kind.capitalized)"
    }

    /// Map a HealthKit activity type to (kind, shortLabel). `kind` must contain
    /// one of PlanSummary's endurance stems (run/ride/bike/cycl/swim/row/…) for
    /// the pre/post-workout fueling window to trigger.
    static func kind(for type: HKWorkoutActivityType) -> (kind: String, shortLabel: String) {
        switch type {
        case .running:                                   return ("run", "run")
        case .cycling:                                   return ("ride", "ride")
        case .swimming:                                  return ("swim", "swim")
        case .rowing:                                    return ("row", "row")
        case .walking:                                   return ("walk", "walk")
        case .hiking:                                    return ("hike", "hike")
        case .traditionalStrengthTraining,
             .functionalStrengthTraining:                return ("strength", "strength")
        case .highIntensityIntervalTraining:            return ("hiit", "hiit")
        case .elliptical, .stairClimbing, .stairs:      return ("cardio", "cardio")
        case .yoga, .flexibility, .mindAndBody:         return ("mobility", "mobility")
        default:                                         return ("workout", "workout")
        }
    }
}
