import { describe, it, expect } from 'vitest'
import { bmrMifflinStJeor, computeBaseline, ACTIVITY_MULTIPLIERS, GOAL_PRESETS } from '../server/planCalc.js'

describe('bmrMifflinStJeor', () => {
  it('matches the men formula by hand: 10*80 + 6.25*160 - 5*25 + 5', () => {
    // 800 + 1000 - 125 + 5 = 1680
    expect(bmrMifflinStJeor({ weightKg: 80, heightCm: 160, ageYears: 25, sex: 'male' })).toBe(1680)
  })

  it('matches the women formula by hand: 10*60 + 6.25*160 - 5*25 - 161', () => {
    // 600 + 1000 - 125 - 161 = 1314
    expect(bmrMifflinStJeor({ weightKg: 60, heightCm: 160, ageYears: 25, sex: 'female' })).toBe(1314)
  })

  it('treats any non-"female" sex as the men formula (control against the female branch)', () => {
    const men = bmrMifflinStJeor({ weightKg: 80, heightCm: 160, ageYears: 25, sex: 'male' })
    const women = bmrMifflinStJeor({ weightKg: 80, heightCm: 160, ageYears: 25, sex: 'female' })
    expect(men).toBe(women + 166) // the +5/-161 halves differ by 166
  })
})

describe('computeBaseline', () => {
  const complete = {
    height_cm: 180, weight_kg: 80, sex: 'male', age_years: 40,
    activity_level: 'sedentary', goal: 'maintain',
  }

  it('returns null when a required field is missing', () => {
    for (const key of ['height_cm', 'weight_kg', 'sex', 'age_years', 'activity_level', 'goal']) {
      const partial = { ...complete, [key]: null }
      expect(computeBaseline(partial)).toBeNull()
    }
  })

  it('returns null on a wholly empty profile (control extreme)', () => {
    expect(computeBaseline({})).toBeNull()
  })

  it('computes a real baseline once every required field is present (control)', () => {
    // bmr = 10*80 + 6.25*180 - 5*40 + 5 = 800 + 1125 - 200 + 5 = 1730
    // tdee = 1730 * 1.2 (sedentary) = 2076 -> rounded to nearest 10 = 2080
    const baseline = computeBaseline(complete)
    expect(baseline).not.toBeNull()
    expect(baseline.calories).toBe(2080)
    expect(baseline.protein_g).toBe(128) // round(80 * 1.6)
    expect(baseline.fiber_g).toBe(30) // matches DEFAULT_TARGETS, not personalized
    expect(baseline.sugar_g).toBeNull() // matches DEFAULT_TARGETS, not personalized
    expect(baseline.sodium_mg).toBe(2300) // matches DEFAULT_TARGETS, not personalized
  })

  it('rounds calories to the nearest 10 and macros to the nearest 1g', () => {
    const baseline = computeBaseline(complete)
    expect(baseline.calories % 10).toBe(0)
    expect(Number.isInteger(baseline.protein_g)).toBe(true)
    expect(Number.isInteger(baseline.carbs_g)).toBe(true)
    expect(Number.isInteger(baseline.fat_g)).toBe(true)
  })

  it('floors carbs at 0 rather than going negative under an extreme deficit', () => {
    // bmr = 10*25 + 6.25*100 - 5*90 - 161 = 264; tdee = 264*1.2 = 316.8
    // calories = round(316.8*0.8, nearest 10) = 250; protein_g = round(25*2.0) = 50
    // fat_g = round(250*0.28/9) = 8. Unfloored carbs = (250 - 50*4 - 8*9)/4 = -5.5g
    // — genuinely negative without the max(0, …) floor, so this exercises it
    // rather than merely asserting a bound that would pass either way.
    const tiny = { height_cm: 100, weight_kg: 25, sex: 'female', age_years: 90, activity_level: 'sedentary', goal: 'lose_fat' }
    const baseline = computeBaseline(tiny)
    expect(baseline.calories).toBe(250)
    expect(baseline.protein_g).toBe(50)
    expect(baseline.fat_g).toBe(8)
    expect(baseline.carbs_g).toBe(0)
  })

  it('scales calories by the goal preset multiplier (lose_fat < maintain < build_muscle)', () => {
    const maintain = computeBaseline({ ...complete, goal: 'maintain' })
    const loseFat = computeBaseline({ ...complete, goal: 'lose_fat' })
    const buildMuscle = computeBaseline({ ...complete, goal: 'build_muscle' })
    expect(loseFat.calories).toBeLessThan(maintain.calories)
    expect(buildMuscle.calories).toBeGreaterThan(maintain.calories)
  })

  it('raises TDEE with each activity level (sedentary < ... < very_active)', () => {
    const levels = Object.keys(ACTIVITY_MULTIPLIERS)
    const calories = levels.map((activity_level) => computeBaseline({ ...complete, activity_level }).calories)
    for (let i = 1; i < calories.length; i++) expect(calories[i]).toBeGreaterThan(calories[i - 1])
  })

  it('uses the documented, published activity multipliers verbatim', () => {
    expect(ACTIVITY_MULTIPLIERS).toEqual({
      sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
    })
  })

  it('uses the documented, moderate goal presets verbatim', () => {
    expect(GOAL_PRESETS).toEqual({
      maintain: { calorieMult: 1.0, proteinPerKg: 1.6 },
      lose_fat: { calorieMult: 0.8, proteinPerKg: 2.0 },
      build_muscle: { calorieMult: 1.1, proteinPerKg: 1.8 },
      endurance: { calorieMult: 1.05, proteinPerKg: 1.6 },
    })
  })
})
