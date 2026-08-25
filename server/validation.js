// zod input-validation schemas for mutating routes. `zod` was already a
// dependency (ocr.js uses it to shape Claude's structured output), but
// nothing validated actual HTTP input — PUT /targets in particular took
// req.body straight into the store with no check at all. These schemas
// aren't full business-rule enforcement (routes keep their own "food_id or
// food object" checks etc.) — they exist to reject the wrong TYPE of value
// (a string where a number belongs, a negative calorie count) before it
// reaches the store, on either backend, instead of surfacing as a raw DB
// error on Postgres or silently corrupting math on the JSON-file store.
import { z } from 'zod'

const nonNegNum = () => z.number().finite().nonnegative()
const posNum = () => z.number().finite().positive()

export const FoodInputSchema = z.object({
  name: z.string().trim().min(1, 'A food needs a name.'),
  barcode: z.string().trim().min(1).nullable().optional(),
  brand: z.string().nullable().optional(),
  serving_size: nonNegNum().nullable().optional(),
  serving_unit: z.string().nullable().optional(),
  calories: nonNegNum().nullable().optional(),
  protein_g: nonNegNum().nullable().optional(),
  carbs_g: nonNegNum().nullable().optional(),
  fat_g: nonNegNum().nullable().optional(),
  fiber_g: nonNegNum().nullable().optional(),
  sugar_g: nonNegNum().nullable().optional(),
  sodium_mg: nonNegNum().nullable().optional(),
  source: z.string().nullable().optional(),
  raw_api_response: z.record(z.string(), z.any()).nullable().optional(),
})

export const EntryCreateSchema = z.object({
  food_id: z.number().int().positive().optional(),
  food: FoodInputSchema.optional(),
  servings_consumed: posNum().optional(),
  meal: z.string().nullable().optional(),
  logged_at: z.string().datetime().nullable().optional(),
})

export const EntryPatchSchema = z.object({
  servings_consumed: posNum().optional(),
  meal: z.string().nullable().optional(),
  logged_at: z.string().datetime().optional(),
})

// sugar_g stays nullable (matches DEFAULT_TARGETS) — the others don't carry
// a documented "unset" meaning, so they're just non-negative numbers.
export const TargetsSchema = z.object({
  calories: nonNegNum().optional(),
  protein_g: nonNegNum().optional(),
  carbs_g: nonNegNum().optional(),
  fat_g: nonNegNum().optional(),
  fiber_g: nonNegNum().optional(),
  sugar_g: nonNegNum().nullable().optional(),
  sodium_mg: nonNegNum().optional(),
})

// --- Adaptive Fuel Plan ------------------------------------------------
// A patch, not a full-replace: every field is optional so a partial form
// submission never has to resend the whole profile, matching the existing
// PUT /api/profile convention. `null` clears a field back to "not set" where
// that's meaningful (sex, body_fat_pct, weekly_change_kg, calorie_adjustment)
// — everything else is either a bounded number or an enum.
export const AfpProfilePatchSchema = z.object({
  units_pref: z.enum(['imperial', 'metric']).optional(),
  age_years: z.number().finite().positive().max(120).nullable().optional(),
  height_cm: z.number().finite().positive().max(300).nullable().optional(),
  weight_kg: z.number().finite().positive().max(400).nullable().optional(),
  sex: z.enum(['male', 'female']).nullable().optional(),
  body_fat_pct: z.number().finite().min(1).max(70).nullable().optional(),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).nullable().optional(),
  goal: z.enum(['maintain', 'gradual_loss', 'gradual_gain', 'custom']).optional(),
  // Conservative bounds enforced here too (not just in the engine) so a bad
  // value never reaches the store at all — see server/afp/engine.js's
  // WEEKLY_CHANGE_LIMITS for why these numbers specifically.
  weekly_change_kg: z.number().finite().min(0).max(1.5).nullable().optional(),
  calorie_adjustment: z.number().finite().min(-1500).max(1500).nullable().optional(),
  is_pregnant_or_postpartum: z.boolean().optional(),
  has_ed_risk_flag: z.boolean().optional(),
})

const AFP_SPORTS = ['run', 'ride', 'swim', 'row', 'walk', 'hike', 'strength', 'hiit', 'cardio', 'mobility', 'workout']

export const PlannedWorkoutSchema = z.object({
  id: z.number().int().positive().optional(), // present = update, absent = create
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD.'),
  sport: z.enum(AFP_SPORTS),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'start_time must be HH:MM, 24h, local.').nullable().optional(),
  duration_min: z.number().finite().positive().max(1440),
  intensity: z.enum(['easy', 'moderate', 'hard']),
  distance_km: z.number().finite().positive().max(500).nullable().optional(),
  is_key_session: z.boolean().optional(),
  is_double_session: z.boolean().optional(),
  is_race: z.boolean().optional(),
  carb_loading_opt_in: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

// A day-specific correction layered on top of the computed plan — never a
// full replacement, so any subset of the four targets can be overridden.
export const AfpOverridesSchema = z.object({
  calories: nonNegNum().optional(),
  protein_g: nonNegNum().optional(),
  carbs_g: nonNegNum().optional(),
  fat_g: nonNegNum().optional(),
})

// Express middleware factory: validates req.body against `schema`, replaces
// req.body with the parsed (coerced/defaulted) result, or responds 400 with
// a readable message built from zod's own issue list.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {})
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
      return res.status(400).json({ error: message })
    }
    req.body = result.data
    next()
  }
}
