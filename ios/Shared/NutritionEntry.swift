// NutritionEntry.swift — the shape of one row from GET /api/entries (the
// backend's log_entries + joined food, see server/db.js `listEntries`).
// This is the WRITE-BACK half of the Apple Health bridge: HealthModel.swift
// carries HealthKit → server (ingest); this carries server → HealthKit
// (logged nutrition appearing in the Health app's own Nutrition data).
//
// Field values on `food` are PER SERVING (schema.sql: "calories numeric, --
// per serving") — callers multiply by `servingsConsumed` before writing a
// quantity to HealthKit. Only `id`, `loggedAt`, `servingsConsumed`, and the
// food's nutrient fields are used for write-back; `meal` rides along for a
// possible future display use but isn't written to Health today.

import Foundation

struct LoggedFood: Codable, Equatable {
    var name: String
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var fiberG: Double?
    var sugarG: Double?
    var sodiumMg: Double?

    enum CodingKeys: String, CodingKey {
        case name, calories
        case proteinG = "protein_g"
        case carbsG = "carbs_g"
        case fatG = "fat_g"
        case fiberG = "fiber_g"
        case sugarG = "sugar_g"
        case sodiumMg = "sodium_mg"
    }
}

struct LoggedEntry: Codable, Equatable, Identifiable {
    var id: Int
    var foodId: Int
    var loggedAt: Date
    var servingsConsumed: Double
    var meal: String?
    var food: LoggedFood?

    enum CodingKeys: String, CodingKey {
        case id
        case foodId = "food_id"
        case loggedAt = "logged_at"
        case servingsConsumed = "servings_consumed"
        case meal, food
    }
}

struct EntriesResponse: Codable, Equatable {
    var entries: [LoggedEntry]
}
