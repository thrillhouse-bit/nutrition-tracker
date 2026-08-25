// Baseline calculator: turns a biometric profile into starting daily targets.
// Pure functions only — no I/O — so the caller (index.js) decides what to do
// with the result (save it via the existing targets mechanism, or not).
//
// These are standard, published nutrition-science formulas (Mifflin-St Jeor +
// widely-used activity multipliers + moderate goal presets), not a medical or
// individualized prescription. This module computes an ESTIMATE; the caller
// is responsible for any "not medical advice" disclosure shown to the user.

const round = (v, step = 1) => Math.round(v / step) * step

// Mifflin-St Jeor resting energy expenditure (kcal/day). The most commonly
// cited equation for this in sports-nutrition literature — more accurate
// across a wider BMI range than the older Harris-Benedict formula.
//   men:   10*kg + 6.25*cm - 5*age + 5
//   women: 10*kg + 6.25*cm - 5*age - 161
export function bmrMifflinStJeor({ weightKg, heightCm, ageYears, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  return sex === 'female' ? base - 161 : base + 5
}

// Standard, widely-published Harris-Benedict-style activity multipliers
// (sedentary … very active) applied to BMR to estimate total daily energy
// expenditure (TDEE). Do not invent different numbers here — these are the
// commonly cited values and changing them silently changes every user's
// calculated baseline.
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// Moderate, defensible goal presets — not aggressive cuts/surpluses.
// calorieMult scales TDEE; proteinPerKg is grams of protein per kg bodyweight
// (higher for fat-loss and muscle-building goals, where protein retention/
// synthesis matters more than at maintenance).
export const GOAL_PRESETS = {
  maintain: { calorieMult: 1.0, proteinPerKg: 1.6 },
  lose_fat: { calorieMult: 0.8, proteinPerKg: 2.0 }, // ~20% deficit
  build_muscle: { calorieMult: 1.1, proteinPerKg: 1.8 }, // ~10% surplus
  endurance: { calorieMult: 1.05, proteinPerKg: 1.6 },
}

const REQUIRED_FIELDS = ['height_cm', 'weight_kg', 'sex', 'age_years', 'activity_level', 'goal']

// Computes a baseline from a full profile. Returns null (never throws, never
// guesses) when any required field is missing — the caller decides what a
// null result means (here: don't call setTargets, so an incomplete profile
// can never silently establish garbage targets).
export function computeBaseline(profile = {}) {
  for (const f of REQUIRED_FIELDS) {
    if (profile[f] === null || profile[f] === undefined) return null
  }

  const bmr = bmrMifflinStJeor({
    weightKg: profile.weight_kg,
    heightCm: profile.height_cm,
    ageYears: profile.age_years,
    sex: profile.sex,
  })
  const activityMult = ACTIVITY_MULTIPLIERS[profile.activity_level]
  const preset = GOAL_PRESETS[profile.goal]
  if (!activityMult || !preset) return null // unknown enum value — never compute from it

  const tdee = bmr * activityMult
  const calories = round(tdee * preset.calorieMult, 10)
  const protein_g = round(profile.weight_kg * preset.proteinPerKg)
  // 28% of calories from fat is a standard default split, not personalized.
  const fat_g = round((calories * 0.28) / 9)
  // Whatever's left after protein (4 kcal/g) and fat (9 kcal/g) goes to carbs
  // — never negative (an extreme deficit + high protein/fat could otherwise
  // drive this below zero).
  const carbs_g = round(Math.max(0, calories - protein_g * 4 - fat_g * 9) / 4)

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g: 30, // matches DEFAULT_TARGETS in db.js — not personalized
    sugar_g: null, // matches DEFAULT_TARGETS in db.js — not personalized
    sodium_mg: 2300, // matches DEFAULT_TARGETS in db.js — not personalized
  }
}
