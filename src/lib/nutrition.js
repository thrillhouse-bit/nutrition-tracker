// Single source of truth for the nutrient fields the app tracks. Both the
// running-totals math and the target rings iterate this list, so adding a
// nutrient here wires it through the whole UI.
export const NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', decimals: 0 },
  { key: 'protein_g', label: 'Protein', unit: 'g', decimals: 1 },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', decimals: 1 },
  { key: 'fat_g', label: 'Fat', unit: 'g', decimals: 1 },
  { key: 'fiber_g', label: 'Fiber', unit: 'g', decimals: 1 },
  { key: 'sugar_g', label: 'Sugar', unit: 'g', decimals: 1 },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg', decimals: 0 },
]

// The four macros the home screen shows as primary rings; the rest render as a
// secondary strip.
export const PRIMARY_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g']

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']

export function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function fmt(value, decimals = 0) {
  const n = num(value)
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

// A log entry's contribution = the food's per-serving value × servings consumed.
// Returns `null` when the food has no recorded value for this nutrient at
// all (a manually-entered field that was left blank, or a looked-up product
// that never reported it) — distinct from a recorded value of 0 (e.g. black
// coffee's real calorie count). `num()` deliberately coerces both to 0 for
// display math elsewhere; this is the one place that must NOT do that, or a
// "never filled in" entry becomes indistinguishable from a verified zero
// (Number('') === 0 is the exact coercion that used to erase the distinction —
// ManualEntry.jsx already writes a blank field as `null`, not `''`, so the
// null check here is what has to preserve that all the way to the log).
export function entryNutrient(entry, key) {
  const v = entry.food?.[key]
  if (v === null || v === undefined) return null
  return num(v) * num(entry.servings_consumed)
}

// True when an entry's food has no recorded calorie value — i.e. it would
// render/sum as a verified zero without actually being one. Calories is the
// figure every log row and the day's headline total are built from, so it's
// the one field this checks; a food missing only a secondary macro still
// contributes what it does know (see sumEntries below).
export function entryIncomplete(entry) {
  return entryNutrient(entry, 'calories') === null
}

// Rebuilds an addEntry-shaped payload from a previously-fetched entry (the
// "undo delete" restore path in App.jsx). food_id and servings_consumed came
// back from the entries API, so — Postgres bigint/numeric columns round-trip
// over JSON as strings, not numbers (confirmed live, production-verification
// audit 25 Aug 2026) — both need the same Number() coercion FoodConfirm's
// own food_id shortcut needed, or the server's strict z.number() schema 400s.
export function restoreEntryPayload(entry) {
  return {
    food_id: Number(entry.food_id),
    servings_consumed: Number(entry.servings_consumed),
    meal: entry.meal,
    logged_at: entry.logged_at,
  }
}

// Sums only the nutrients each entry actually has a known value for — a food
// with no recorded value for a nutrient contributes nothing to that
// nutrient's total, so the day's numbers reflect only what's actually known
// rather than silently padding in a zero for an unknown quantity.
export function sumEntries(entries) {
  const totals = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]))
  for (const e of entries) {
    for (const n of NUTRIENTS) {
      const v = entryNutrient(e, n.key)
      if (v !== null) totals[n.key] += v
    }
  }
  return totals
}

// Local-day boundaries as ISO strings, for querying entries by calendar day in
// the user's own timezone (the server stores UTC timestamps and filters by
// range, so no server-side timezone config is needed).
export function dayBounds(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export function ymd(date = new Date()) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// kg is the canonical stored unit everywhere (profile, weight log); these
// convert only for imperial display/input. Shared here rather than in one
// component since both the profile form and any weight display need the
// same conversion and must never drift apart.
export const KG_PER_LB = 0.453592
export const lbToKg = (lb) => num(lb) * KG_PER_LB
export const kgToLb = (kg) => num(kg) / KG_PER_LB
