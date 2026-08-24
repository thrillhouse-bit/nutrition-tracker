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
export function entryNutrient(entry, key) {
  return num(entry.food?.[key]) * num(entry.servings_consumed)
}

export function sumEntries(entries) {
  const totals = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]))
  for (const e of entries) {
    for (const n of NUTRIENTS) totals[n.key] += entryNutrient(e, n.key)
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
