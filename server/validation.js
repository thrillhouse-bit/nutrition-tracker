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
