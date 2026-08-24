// HealthModel.swift — the provider-neutral signal contract, shared by the iOS
// companion and the watch app. It mirrors the backend's ingest contract exactly
// (see server/index.js `/api/apple/ingest` and server/providers.js). Apple
// Health is a THIRD provider alongside Oura and Garmin: the native layer only
// normalizes HealthKit samples into these shapes and POSTs them; the backend and
// the PWA stay provider-agnostic.
//
// Design rules encoded here:
//  • Minimum fueling context only — no clinical data types.
//  • HRV / resting heart rate are CONTEXT ONLY. They are sent for explanation
//    and never drive a target change (the rules engine ignores them).
//  • Missing data is unavailable, never "denied" — HealthKit hides read-denials,
//    so `permissions.available` lists what actually returned data and we never
//    claim a category was refused.

import Foundation

/// The HealthKit categories the companion may read (minimum fueling context).
/// These strings are the vocabulary the backend stores as `permissions`.
enum HealthCategory: String, CaseIterable, Codable {
    case workouts        // HKWorkoutType + workout timing
    case activeEnergy    // HKQuantityType activeEnergyBurned
    case exercise        // appleExerciseTime / HKActivitySummary
    case sleep           // HKCategoryType sleepAnalysis
    case hrv             // heartRateVariabilitySDNN — context only
    case restingHR       // restingHeartRate — context only
    case steps           // stepCount
}

/// The normalized metric keys the backend understands (server/providers.js).
enum SignalMetric: String, Codable {
    case workout         // value = WorkoutValue
    case expenditure     // value = kcal (Double)
    case exercise        // value = minutes (Double)
    case steps           // value = count (Double)
    case sleep           // value = hours (Double)
    case hrv             // value = ms (Double) — context only
    case restingHR = "resting_hr" // value = bpm (Double) — context only
}

/// A workout normalized from HealthKit. `startHour` is a local-time float
/// (17.5 = 5:30 PM) so the rules engine can compute the pre-workout window; the
/// watch reads only APPROVED HealthKit workouts and never records new ones.
struct WorkoutValue: Codable, Equatable {
    var label: String            // "Evening Run"
    var shortLabel: String       // "run"
    var kind: String             // "run" | "ride" | "swim" | "strength" | ...
    var time: String?            // "5:30 PM" (localized, display only)
    var startHour: Double?       // 17.5
    var endHour: Double?         // 18.2
    var durationMin: Double?     // 42
    var estKcal: Double?         // active energy of the workout, if available
    var status: String           // "completed" | "planned"

    enum CodingKeys: String, CodingKey {
        case label, shortLabel, kind, time, startHour, endHour
        case durationMin = "duration_min"
        case estKcal = "est_kcal"
        case status
    }
}

/// The value carried by a sample. Most metrics are a scalar; `workout` is an
/// object. Encoded as the raw JSON the backend expects (number or object).
enum SampleValue: Codable, Equatable {
    case number(Double)
    case workout(WorkoutValue)

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .number(let n): try c.encode(n)
        case .workout(let w): try c.encode(w)
        }
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Double.self) { self = .number(n) }
        else { self = .workout(try c.decode(WorkoutValue.self)) }
    }
}

/// One normalized HealthKit sample, matching a backend `samples[]` element.
struct HealthSample: Codable, Equatable {
    var metric: SignalMetric
    var value: SampleValue
    var unit: String?
    var recordedAt: Date          // when the sample happened on-device
    var fetchedAt: Date           // when the companion read it
    var extra: [String: Double]?  // e.g. {"active": 430}

    enum CodingKeys: String, CodingKey {
        case metric, value, unit
        case recordedAt = "recorded_at"
        case fetchedAt = "fetched_at"
        case extra
    }
}

/// Which categories the companion requested vs. which actually returned data.
/// `available` is the honest signal of partial permissions; we never record a
/// "denied" set because HealthKit does not expose read-denials.
struct HealthPermissions: Codable, Equatable {
    var requested: [HealthCategory]
    var available: [HealthCategory]
}

/// The exact POST body for `/api/apple/ingest`.
struct IngestPayload: Codable, Equatable {
    var date: String              // "YYYY-MM-DD" local day
    var samples: [HealthSample]
    var permissions: HealthPermissions

    enum CodingKeys: String, CodingKey { case date, samples, permissions }
}

/// The server's response to an ingest, so the client can surface the recorded
/// permission set back to the UI.
struct IngestResponse: Codable, Equatable {
    var ingested: Int
    var day: String
    var permissions: HealthPermissions?
}

// A JSON encoder/decoder pair configured to match the backend's ISO-8601
// timestamps. Shared so every network path serializes dates identically.
enum FuelJSON {
    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
