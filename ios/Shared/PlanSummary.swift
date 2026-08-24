// PlanSummary.swift — the small, glanceable summary the watch shows and the
// phone sends over WatchConnectivity. It is derived from the backend's
// `/api/today` composite (server/index.js `todayComposite`) so the watch never
// re-derives fueling logic differently from the app — the same numbers, one
// source of truth. Every recommendation carries its `why` so the watch can show
// a rationale, matching the app's "Why?" requirement.

import Foundation

/// A macro target pair (protein + carbohydrate), in grams.
struct MacroTarget: Codable, Equatable {
    var proteinG: Double
    var carbsG: Double
}

/// A consumed-vs-target progress pair for one nutrient.
struct Progress: Codable, Equatable {
    var consumed: Double
    var target: Double
    var remaining: Double { max(0, target - consumed) }
    var fraction: Double { target > 0 ? min(1, consumed / target) : 0 }
}

/// The watch's whole world: the next action, the fuel windows, and today's
/// headline progress. Deliberately tiny — a glance, not a dashboard.
struct PlanSummary: Codable, Equatable {
    var date: String
    var generatedAt: Date

    // The one next action, with its transparent rationale.
    var recommendationTitle: String
    var recommendationDetail: String
    var why: [String]

    var calories: Progress
    var protein: Progress

    // Present only when a workout is on the day. `preWorkoutBy` is a localized
    // deadline string ("5:30 PM"); nil windows mean "no session today".
    var workoutLabel: String?
    var workoutTime: String?
    var preWorkout: MacroTarget?
    var preWorkoutBy: String?
    var postWorkout: MacroTarget?

    /// Whether any signal in the summary is demo/sample data, so the watch can
    /// label it honestly and never imply a live sync.
    var isDemo: Bool
}

// MARK: - Building a summary from the /api/today composite

/// A minimal Decodable view over `/api/today` — only the fields the summary
/// needs. Keeping it narrow means backend additions don't break the watch.
struct TodayComposite: Decodable {
    struct Rec: Decodable { var title: String?; var detail: String?; var why: [String]? }
    struct Workout: Decodable {
        var label: String?; var shortLabel: String?; var kind: String?
        var time: String?; var startHour: Double?; var status: String?
    }
    struct WorkoutSignal: Decodable { var value: Workout?; var demo: Bool?; var freshness: String? }
    struct Signals: Decodable { var workout: WorkoutSignal? }

    var date: String?
    var intake: [String: Double]?
    var baseline: [String: Double]?
    var adjusted: [String: Double]?
    var recommendation: Rec?
    var signals: Signals?
    var generatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case date, intake, baseline, adjusted, recommendation, signals, generatedAt
    }
}

enum PlanSummaryBuilder {
    private static func round(_ v: Double, _ step: Double) -> Double { (v / step).rounded() * step }
    private static let enduranceKinds = ["run", "ride", "bike", "cycl", "swim", "row", "cardio", "endurance", "long"]
    private static func isEndurance(_ kind: String) -> Bool {
        let k = kind.lowercased(); return enduranceKinds.contains { k.contains($0) }
    }

    /// Mirror of server/plan.js's pre-workout window: protein = max(15, 20% of
    /// the adjusted protein target); carbs = max(30, 25% of adjusted carbs).
    static func preWorkoutTarget(adjustedProtein: Double, adjustedCarbs: Double) -> MacroTarget {
        MacroTarget(proteinG: max(15, round(adjustedProtein * 0.2, 5)),
                    carbsG: max(30, round(adjustedCarbs * 0.25, 5)))
    }

    /// A recovery split after the session: a protein-forward refuel toward the
    /// day's remaining targets (context, never a silent target change).
    static func postWorkoutTarget(adjustedProtein: Double, adjustedCarbs: Double) -> MacroTarget {
        MacroTarget(proteinG: max(20, round(adjustedProtein * 0.27, 5)),
                    carbsG: max(40, round(adjustedCarbs * 0.32, 5)))
    }

    static func make(from t: TodayComposite, isDemo: Bool) -> PlanSummary {
        let adjusted = t.adjusted ?? t.baseline ?? [:]
        let intake = t.intake ?? [:]
        let calTarget = adjusted["calories"] ?? 0
        let proTarget = adjusted["protein_g"] ?? 0
        let carbTarget = adjusted["carbs_g"] ?? 0

        var workoutLabel: String?; var workoutTime: String?
        var pre: MacroTarget?; var preBy: String?; var post: MacroTarget?
        if let w = t.signals?.workout, (w.freshness ?? "") != "unavailable", let wv = w.value {
            workoutLabel = wv.label ?? wv.shortLabel
            workoutTime = wv.time
            if isEndurance(wv.kind ?? "") {
                pre = preWorkoutTarget(adjustedProtein: proTarget, adjustedCarbs: carbTarget)
                preBy = wv.time
                post = postWorkoutTarget(adjustedProtein: proTarget, adjustedCarbs: carbTarget)
            }
        }

        return PlanSummary(
            date: t.date ?? "",
            generatedAt: t.generatedAt ?? Date(),
            recommendationTitle: t.recommendation?.title ?? "Log your next meal",
            recommendationDetail: t.recommendation?.detail ?? "",
            why: t.recommendation?.why ?? [],
            calories: Progress(consumed: intake["calories"] ?? 0, target: calTarget),
            protein: Progress(consumed: intake["protein_g"] ?? 0, target: proTarget),
            workoutLabel: workoutLabel,
            workoutTime: workoutTime,
            preWorkout: pre,
            preWorkoutBy: preBy,
            postWorkout: post,
            isDemo: isDemo
        )
    }
}
