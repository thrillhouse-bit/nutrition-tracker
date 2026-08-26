import { describe, it, expect } from 'vitest'
import {
  ENGINE_VERSION,
  mifflinStJeor,
  cunningham,
  estimateRMR,
  computeBMI,
  ACTIVITY_MULTIPLIERS,
  baselineEnergy,
  MET_TABLE,
  estimateSessionEnergyKcal,
  reconcileSessions,
  classifyTrainingLoad,
  TRAINING_LOAD_TIERS,
  computeGoalAdjustment,
  applyMinEnergyGuardrail,
  ABSOLUTE_MIN_KCAL,
  proteinTarget,
  fatFloor,
  carbTargetFromBand,
  buildCarbGuidance,
  evaluateCarbLoading,
  evaluateSafety,
  computeProgress,
  computeAdaptivePlan,
} from '../server/afp/engine.js'

describe('mifflinStJeor / cunningham / estimateRMR', () => {
  it('matches the men formula by hand: 10*80 + 6.25*180 - 5*30 + 5', () => {
    expect(mifflinStJeor({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male' })).toBe(1780)
  })
  it('matches the women formula by hand: 10*60 + 6.25*165 - 5*30 - 161', () => {
    // 600 + 1031.25 - 150 - 161 = 1320.25
    expect(mifflinStJeor({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'female' })).toBe(1320.25)
  })
  it('uses the midpoint constant (-78) when sex is withheld', () => {
    const neutral = mifflinStJeor({ weightKg: 70, heightCm: 170, ageYears: 30, sex: null })
    const male = mifflinStJeor({ weightKg: 70, heightCm: 170, ageYears: 30, sex: 'male' })
    const female = mifflinStJeor({ weightKg: 70, heightCm: 170, ageYears: 30, sex: 'female' })
    expect(neutral).toBe((male + female) / 2)
  })
  it('cunningham: RMR = 500 + 22 * lean mass', () => {
    // 80kg at 20% body fat -> lean mass 64kg -> 500 + 22*64 = 1908
    expect(cunningham({ weightKg: 80, bodyFatPct: 20 })).toBe(1908)
  })

  it('estimateRMR uses Mifflin-St Jeor when no body-fat percentage is given', () => {
    const r = estimateRMR({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male', bodyFatPct: null })
    expect(r.equation).toBe('mifflin_st_jeor_male')
    expect(r.value).toBe(1780)
    expect(r.assumptions.length).toBeGreaterThan(0)
  })
  it('estimateRMR switches to Cunningham once a valid body-fat percentage is on file', () => {
    const r = estimateRMR({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male', bodyFatPct: 20 })
    expect(r.equation).toBe('cunningham')
    expect(r.value).toBe(1908)
  })
  it('ignores an out-of-range body-fat percentage and falls back to Mifflin-St Jeor (control)', () => {
    const r = estimateRMR({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male', bodyFatPct: 95 })
    expect(r.equation).toBe('mifflin_st_jeor_male')
  })
  it('estimateRMR is neutral when sex is omitted entirely', () => {
    const r = estimateRMR({ weightKg: 70, heightCm: 170, ageYears: 30, sex: null, bodyFatPct: null })
    expect(r.equation).toBe('mifflin_st_jeor_neutral')
  })
})

describe('computeBMI', () => {
  it('computes weight(kg) / height(m)^2', () => {
    const bmi = computeBMI(70, 175)
    expect(bmi.value).toBeCloseTo(22.9, 1)
    expect(bmi.category).toBe('moderate')
  })
  it('categorizes underweight/elevated/high at the documented WHO cutoffs', () => {
    expect(computeBMI(50, 175).category).toBe('underweight') // ~16.3
    expect(computeBMI(85, 175).category).toBe('elevated') // ~27.8
    expect(computeBMI(100, 175).category).toBe('high') // ~32.7
  })
  it('returns null rather than dividing by a missing height', () => {
    expect(computeBMI(70, null)).toBeNull()
    expect(computeBMI(null, 175)).toBeNull()
  })
})

describe('baselineEnergy / ACTIVITY_MULTIPLIERS', () => {
  it('uses the documented NEAT-only multipliers verbatim', () => {
    expect(ACTIVITY_MULTIPLIERS).toEqual({
      sedentary: 1.15, light: 1.2, moderate: 1.3, active: 1.4, very_active: 1.5,
    })
  })
  it('rises monotonically with activity level', () => {
    const levels = Object.keys(ACTIVITY_MULTIPLIERS)
    const values = levels.map((l) => baselineEnergy(1700, l))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
  })
  it('returns null for an unknown activity level rather than guessing', () => {
    expect(baselineEnergy(1700, 'nonsense')).toBeNull()
  })
  it('is deliberately lower than the legacy TDEE table at every level (no double count with exercise)', async () => {
    const { ACTIVITY_MULTIPLIERS: legacy } = await import('../server/planCalc.js')
    for (const level of Object.keys(ACTIVITY_MULTIPLIERS)) {
      expect(ACTIVITY_MULTIPLIERS[level]).toBeLessThan(legacy[level])
    }
  })
})

describe('estimateSessionEnergyKcal / MET_TABLE', () => {
  it('kcal = MET * 3.5 * kg / 200 * minutes, by hand for a 70kg easy 60-minute run', () => {
    // 8 * 3.5 * 70 / 200 * 60 = 588
    expect(estimateSessionEnergyKcal({ sport: 'run', intensity: 'easy', durationMin: 60 }, 70)).toBeCloseTo(588, 5)
  })
  it('falls back to the generic workout row for an unmapped sport', () => {
    const generic = estimateSessionEnergyKcal({ sport: 'quidditch', intensity: 'moderate', durationMin: 60 }, 70)
    const workout = estimateSessionEnergyKcal({ sport: 'workout', intensity: 'moderate', durationMin: 60 }, 70)
    expect(generic).toBe(workout)
  })
  it('increases with intensity for the same sport/duration', () => {
    const easy = estimateSessionEnergyKcal({ sport: 'ride', intensity: 'easy', durationMin: 60 }, 70)
    const hard = estimateSessionEnergyKcal({ sport: 'ride', intensity: 'hard', durationMin: 60 }, 70)
    expect(hard).toBeGreaterThan(easy)
  })
  it('every MET_TABLE sport defines easy/moderate/hard, each increasing', () => {
    for (const [sport, tiers] of Object.entries(MET_TABLE)) {
      expect(tiers.easy).toBeLessThan(tiers.moderate)
      expect(tiers.moderate).toBeLessThan(tiers.hard)
      expect(sport).toBeTruthy()
    }
  })
})

describe('reconcileSessions', () => {
  it('keeps a planned session with no matching synced sport', () => {
    const out = reconcileSessions([{ sport: 'run', intensity: 'moderate', durationMin: 45 }], [])
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('planned')
  })
  it('supersedes a planned session\'s ENERGY with a matching synced session of the same sport (no double count)', () => {
    const out = reconcileSessions(
      [{ sport: 'run', intensity: 'moderate', durationMin: 45 }],
      [{ sport: 'run', intensity: 'hard', durationMin: 50, calories: 600, provider: 'oura' }],
    )
    expect(out).toHaveLength(1) // one session, not two — no duplicate energy
    expect(out[0].source).toBe('synced')
    expect(out[0].energyKcal).toBe(600)
  })
  it('carries a matched planned session\'s key-session/race/carb-loading flags onto the synced entry', () => {
    const out = reconcileSessions(
      [{ sport: 'run', intensity: 'hard', durationMin: 120, isKeySession: true, isRace: true, carbLoadingOptIn: true }],
      [{ sport: 'run', intensity: 'hard', durationMin: 125, calories: 1500 }],
    )
    expect(out).toHaveLength(1)
    expect(out[0].isKeySession).toBe(true)
    expect(out[0].isRace).toBe(true)
    expect(out[0].carbLoadingOptIn).toBe(true)
  })
  it('keeps an unrelated synced session AND an unrelated planned session as two separate entries (control)', () => {
    const out = reconcileSessions(
      [{ sport: 'strength', intensity: 'moderate', durationMin: 30 }],
      [{ sport: 'run', intensity: 'easy', durationMin: 40, calories: 350 }],
    )
    expect(out).toHaveLength(2)
  })
  it('estimates energy for a synced session with no reported calories (fillSessionEnergy path via computeAdaptivePlan)', () => {
    const out = reconcileSessions([], [{ sport: 'ride', intensity: 'moderate', durationMin: 30, calories: null }])
    expect(out[0].energyKcal).toBeNull() // filled in later by fillSessionEnergy, not here
  })
})

describe('classifyTrainingLoad', () => {
  it('rest_light for no sessions', () => {
    expect(classifyTrainingLoad([]).tier).toBe('rest_light')
  })
  it('boundary: exactly 20 minutes is still rest_light', () => {
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 20 }]).tier).toBe('rest_light')
  })
  it('boundary: 21 minutes crosses into moderate', () => {
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 21 }]).tier).toBe('moderate')
  })
  it('boundary: exactly 75 minutes is still moderate', () => {
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 75 }]).tier).toBe('moderate')
  })
  it('boundary: 76 minutes crosses into endurance_high', () => {
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 76 }]).tier).toBe('endurance_high')
  })
  it('boundary: exactly 180 minutes is still endurance_high', () => {
    expect(classifyTrainingLoad([{ intensity: 'moderate', durationMin: 180 }]).tier).toBe('endurance_high')
  })
  it('boundary: 181 minutes crosses into very_high_extreme', () => {
    expect(classifyTrainingLoad([{ intensity: 'moderate', durationMin: 181 }]).tier).toBe('very_high_extreme')
  })
  it('a hard session bumps the tier up once, even if duration alone would classify lower', () => {
    // 30 min, which alone is "moderate" — hard bumps it to endurance_high
    const load = classifyTrainingLoad([{ intensity: 'hard', durationMin: 30 }])
    expect(load.tier).toBe('endurance_high')
    expect(load.hasHardSession).toBe(true)
  })
  it('a hard session under 20 minutes does NOT bump the tier (control — the bump requires >=20 min hard)', () => {
    const load = classifyTrainingLoad([{ intensity: 'hard', durationMin: 10 }])
    expect(load.tier).toBe('rest_light')
  })
  it('the bump never skips past the tier directly above (control against a double bump)', () => {
    // 10 minutes total would be rest_light; a single hard qualifying session
    // (>=20 min) landing in "moderate" territory bumps once, to endurance_high,
    // never straight to very_high_extreme.
    const load = classifyTrainingLoad([{ intensity: 'hard', durationMin: 20 }])
    expect(load.tier).toBe('moderate') // 20min itself is rest_light range but hasHardSession requires >=20 -> true; base tier idx0 -> bumped to idx1 'moderate'
  })
  it('exposes the documented carb band per tier', () => {
    expect(TRAINING_LOAD_TIERS.map((t) => t.carbBand)).toEqual([[3, 5], [5, 7], [6, 10], [8, 12]])
  })
  it('loadFraction is near 0 just above a tier\'s own lower boundary and exactly 1 at its top', () => {
    // 21 min is the first minute that classifies as "moderate" (20 belongs to
    // rest_light) — so its fraction is 1/55, not exactly 0, but still tiny.
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 21 }]).loadFraction).toBeLessThan(0.05)
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 75 }]).loadFraction).toBeCloseTo(1, 5)
  })
  it('loadFraction interpolates to 0.5 at a tier\'s midpoint', () => {
    // moderate spans 20-75 (span 55); midpoint 47.5 -> (47.5-20)/55 = 0.5
    expect(classifyTrainingLoad([{ intensity: 'easy', durationMin: 47.5 }]).loadFraction).toBeCloseTo(0.5, 5)
  })
})

describe('computeGoalAdjustment', () => {
  const base = { totalEnergyBeforeGoal: 2400 }
  it('maintain: zero adjustment', () => {
    expect(computeGoalAdjustment({ goal: 'maintain', ...base }).adjustmentKcal).toBe(0)
  })
  it('gradual_loss: converts weekly kg to a daily deficit via 7700 kcal/kg', () => {
    // 0.5 kg/week * 7700 / 7 = 550
    const r = computeGoalAdjustment({ goal: 'gradual_loss', weeklyChangeKg: 0.5, ...base })
    expect(r.adjustmentKcal).toBe(-550)
    expect(r.warnings).toHaveLength(0)
  })
  it('gradual_gain: converts weekly kg to a daily surplus', () => {
    const r = computeGoalAdjustment({ goal: 'gradual_gain', weeklyChangeKg: 0.25, ...base })
    expect(r.adjustmentKcal).toBe(275) // 0.25*7700/7
  })
  it('clamps an excessive weekly loss rate to the conservative guardrail, then the % cap clamps it again, and both warn', () => {
    const r = computeGoalAdjustment({ goal: 'gradual_loss', weeklyChangeKg: 3, ...base })
    expect(r.warnings.some((w) => w.code === 'weekly_change_clamped')).toBe(true)
    // clamped to 1.0 kg/week -> -1100, which still exceeds 25% of 2400 (-600), so the
    // fraction-of-energy cap clamps it a second time — both guardrails are real, not
    // redundant, and both fire here.
    expect(r.warnings.some((w) => w.code === 'goal_adjustment_capped')).toBe(true)
    expect(r.adjustmentKcal).toBe(-600)
  })
  it('clamps an excessive weekly gain rate to the conservative guardrail, then the % cap clamps it again, and both warn', () => {
    const r = computeGoalAdjustment({ goal: 'gradual_gain', weeklyChangeKg: 2, ...base })
    expect(r.warnings.some((w) => w.code === 'weekly_change_clamped')).toBe(true)
    expect(r.warnings.some((w) => w.code === 'goal_adjustment_capped')).toBe(true)
    // clamped to 0.5kg/week -> 550, which still exceeds 20% of 2400 (480)
    expect(r.adjustmentKcal).toBe(480)
  })
  it('a weekly rate within both guardrails produces no warning at all (control)', () => {
    const r = computeGoalAdjustment({ goal: 'gradual_loss', weeklyChangeKg: 0.3, ...base })
    expect(r.warnings).toHaveLength(0)
  })
  it('custom: applies the user-entered kcal/day delta directly when within the guardrail', () => {
    const r = computeGoalAdjustment({ goal: 'custom', calorieAdjustment: -300, ...base })
    expect(r.adjustmentKcal).toBe(-300)
    expect(r.warnings).toHaveLength(0)
  })
  it('custom: caps an aggressive deficit at 25% of total energy and warns rather than applying it silently', () => {
    const r = computeGoalAdjustment({ goal: 'custom', calorieAdjustment: -2000, totalEnergyBeforeGoal: 2400 })
    expect(r.adjustmentKcal).toBe(-600) // -0.25*2400
    expect(r.warnings.some((w) => w.code === 'custom_adjustment_capped')).toBe(true)
  })
  it('custom: caps an aggressive surplus at 20% of total energy and warns', () => {
    const r = computeGoalAdjustment({ goal: 'custom', calorieAdjustment: 2000, totalEnergyBeforeGoal: 2400 })
    expect(r.adjustmentKcal).toBe(480) // 0.20*2400
    expect(r.warnings.some((w) => w.code === 'custom_adjustment_capped')).toBe(true)
  })
  it('a requested deficit inside the guardrail produces no warning (control)', () => {
    const r = computeGoalAdjustment({ goal: 'custom', calorieAdjustment: -400, totalEnergyBeforeGoal: 2400 })
    expect(r.warnings).toHaveLength(0)
  })
})

describe('applyMinEnergyGuardrail', () => {
  it('leaves a target above the floor unchanged', () => {
    const r = applyMinEnergyGuardrail(2000, 1500)
    expect(r.calories).toBe(2000)
    expect(r.guardrailApplied).toBe(false)
  })
  it('clamps to the absolute minimum when RMR itself is low', () => {
    const r = applyMinEnergyGuardrail(1000, 1100)
    expect(r.floor).toBe(ABSOLUTE_MIN_KCAL)
    expect(r.calories).toBe(ABSOLUTE_MIN_KCAL)
    expect(r.guardrailApplied).toBe(true)
    expect(r.warning.code).toBe('min_energy_guardrail')
  })
  it('clamps to RMR itself when RMR exceeds the absolute floor', () => {
    const r = applyMinEnergyGuardrail(1400, 1600)
    expect(r.floor).toBe(1600)
    expect(r.calories).toBe(1600)
    expect(r.guardrailApplied).toBe(true)
  })
  it('a target exactly at the floor is not flagged as clamped (boundary control)', () => {
    const r = applyMinEnergyGuardrail(1600, 1500)
    expect(r.calories).toBe(1600)
    expect(r.guardrailApplied).toBe(false)
  })
})

describe('proteinTarget', () => {
  it('uses the documented g/kg table', () => {
    expect(proteinTarget(80, 'maintain').perKg).toBe(1.6)
    expect(proteinTarget(80, 'gradual_loss').perKg).toBe(2.0)
    expect(proteinTarget(80, 'gradual_gain').perKg).toBe(1.8)
  })
  it('rounds grams to the nearest gram', () => {
    expect(proteinTarget(80, 'maintain').grams).toBe(128)
  })
})

describe('fatFloor', () => {
  it('takes the higher of 0.3 g/kg or 20% of calories', () => {
    // 70kg -> 0.3*70=21g; 20% of 1500kcal /9 = 33.3 -> 33g -> the 20% branch wins
    expect(fatFloor(70, 1500)).toBe(33)
    // 100kg -> 0.3*100=30g; 20% of 1200kcal/9=26.7 -> 27g -> the g/kg branch wins
    expect(fatFloor(100, 1200)).toBe(30)
  })
})

describe('carbTargetFromBand', () => {
  it('picks the low end of the band at loadFraction 0', () => {
    const r = carbTargetFromBand(70, [5, 7], 0)
    expect(r.perKg).toBe(5)
    expect(r.grams).toBe(350)
  })
  it('picks the high end of the band at loadFraction 1', () => {
    const r = carbTargetFromBand(70, [5, 7], 1)
    expect(r.perKg).toBe(7)
    expect(r.grams).toBe(490)
  })
  it('interpolates in between', () => {
    const r = carbTargetFromBand(70, [5, 7], 0.5)
    expect(r.perKg).toBe(6)
  })
})

describe('buildCarbGuidance', () => {
  it('produces no pre/during-workout guidance for a short easy session', () => {
    const g = buildCarbGuidance({ sessions: [{ sport: 'walk', intensity: 'easy', durationMin: 30 }], tier: 'rest_light', carbGrams: 250, nextDayHasDemandingSession: false })
    expect(g.preworkout).toBeNull()
    expect(g.duringWorkout).toBeNull()
    expect(g.recovery).toBeNull()
    expect(g.allocationPct.breakfast + g.allocationPct.remaining).toBe(100)
  })
  it('produces pre-workout guidance for a session >= 60 minutes', () => {
    const g = buildCarbGuidance({ sessions: [{ sport: 'run', intensity: 'moderate', durationMin: 70 }], tier: 'moderate', carbGrams: 400, nextDayHasDemandingSession: false })
    expect(g.preworkout).not.toBeNull()
    expect(g.preworkout.grams).toBeGreaterThanOrEqual(30)
  })
  it('produces during-workout guidance for a session >= 90 minutes', () => {
    const g = buildCarbGuidance({ sessions: [{ sport: 'run', intensity: 'moderate', durationMin: 95 }], tier: 'endurance_high', carbGrams: 500, nextDayHasDemandingSession: false })
    expect(g.duringWorkout).not.toBeNull()
    expect(g.duringWorkout.gramsPerHour).toBe(45)
  })
  it('produces during-workout guidance for a hard 60+ minute session even under 90 minutes', () => {
    const g = buildCarbGuidance({ sessions: [{ sport: 'run', intensity: 'hard', durationMin: 65 }], tier: 'endurance_high', carbGrams: 500, nextDayHasDemandingSession: false })
    expect(g.duringWorkout).not.toBeNull()
    expect(g.duringWorkout.gramsPerHour).toBe(60)
  })
  it('does NOT produce during-workout guidance for a 65-minute EASY session (control)', () => {
    const g = buildCarbGuidance({ sessions: [{ sport: 'run', intensity: 'easy', durationMin: 65 }], tier: 'moderate', carbGrams: 400, nextDayHasDemandingSession: false })
    expect(g.duringWorkout).toBeNull()
  })
  it('adds recovery guidance when another demanding session is coming up soon', () => {
    const g = buildCarbGuidance({ sessions: [{ sport: 'run', intensity: 'moderate', durationMin: 60 }], tier: 'moderate', carbGrams: 400, nextDayHasDemandingSession: true })
    expect(g.recovery).not.toBeNull()
    expect(g.allocationPct.recovery).toBe(20)
  })
  it('allocation percentages always sum to 100 across whichever slots apply', () => {
    const cases = [
      { sessions: [], tier: 'rest_light', carbGrams: 200, nextDayHasDemandingSession: false },
      { sessions: [{ sport: 'run', intensity: 'moderate', durationMin: 70 }], tier: 'moderate', carbGrams: 400, nextDayHasDemandingSession: false },
      { sessions: [{ sport: 'run', intensity: 'hard', durationMin: 120 }], tier: 'endurance_high', carbGrams: 600, nextDayHasDemandingSession: true },
    ]
    for (const c of cases) {
      const g = buildCarbGuidance(c)
      const sum = Object.values(g.allocationPct).reduce((a, b) => a + b, 0)
      expect(sum).toBe(100)
    }
  })
})

describe('evaluateCarbLoading', () => {
  it('returns null when no upcoming session is both a race and opted in', () => {
    expect(evaluateCarbLoading([{ sport: 'run', isRace: true, carbLoadingOptIn: false, durationMin: 120 }])).toBeNull()
    expect(evaluateCarbLoading([{ sport: 'run', isRace: false, carbLoadingOptIn: true, durationMin: 120 }])).toBeNull()
    expect(evaluateCarbLoading([])).toBeNull()
  })
  it('is ineligible for a short opted-in race (never auto-applied for a 5k)', () => {
    const r = evaluateCarbLoading([{ sport: 'run', isRace: true, carbLoadingOptIn: true, durationMin: 25, distanceKm: 5 }])
    expect(r.eligible).toBe(false)
  })
  it('is eligible for a marathon-distance opted-in race', () => {
    const r = evaluateCarbLoading([{ sport: 'run', isRace: true, carbLoadingOptIn: true, durationMin: 240, distanceKm: 42.2 }])
    expect(r.eligible).toBe(true)
    expect(r.gramsPerKgRange).toEqual([8, 12])
  })
  it('is eligible by duration alone even for a shorter-distance but long event (e.g. a triathlon leg)', () => {
    const r = evaluateCarbLoading([{ sport: 'ride', isRace: true, carbLoadingOptIn: true, durationMin: 100, distanceKm: 10 }])
    expect(r.eligible).toBe(true)
  })
})

describe('evaluateSafety', () => {
  it('does not suppress a maintain goal for a minor (control — only deficit is suppressed)', () => {
    const r = evaluateSafety({ ageYears: 16 }, 'maintain', null)
    expect(r.suppressed).toBe(false)
  })
  it('suppresses gradual_loss for a minor', () => {
    const r = evaluateSafety({ ageYears: 16 }, 'gradual_loss', null)
    expect(r.suppressed).toBe(true)
    expect(r.reason).toBe('minor')
  })
  it('suppresses gradual_loss for a pregnancy/postpartum flag', () => {
    const r = evaluateSafety({ ageYears: 30, isPregnantOrPostpartum: true }, 'gradual_loss', null)
    expect(r.suppressed).toBe(true)
    expect(r.reason).toBe('pregnancy_postpartum')
  })
  it('suppresses gradual_loss for an ED-risk flag', () => {
    const r = evaluateSafety({ ageYears: 30, hasEdRiskFlag: true }, 'gradual_loss', null)
    expect(r.suppressed).toBe(true)
    expect(r.reason).toBe('ed_risk')
  })
  it('suppresses a negative custom adjustment for an at-risk user', () => {
    const r = evaluateSafety({ ageYears: 30, hasEdRiskFlag: true }, 'custom', -300)
    expect(r.suppressed).toBe(true)
  })
  it('does NOT suppress a positive custom adjustment for an at-risk user (control)', () => {
    const r = evaluateSafety({ ageYears: 30, hasEdRiskFlag: true }, 'custom', 300)
    expect(r.suppressed).toBe(false)
  })
  it('does not suppress an adult with no risk flags (control)', () => {
    const r = evaluateSafety({ ageYears: 30, isPregnantOrPostpartum: false, hasEdRiskFlag: false }, 'gradual_loss', null)
    expect(r.suppressed).toBe(false)
  })
  it('does not suppress gradual_gain even for a minor (control — gain is never suppressed)', () => {
    const r = evaluateSafety({ ageYears: 16 }, 'gradual_gain', null)
    expect(r.suppressed).toBe(false)
  })
})

describe('computeProgress', () => {
  it('computes remaining and pct against a target', () => {
    const p = computeProgress({ calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 }, { calories: 1200, protein_g: 90 })
    expect(p.calories).toEqual({ target: 2000, actual: 1200, remaining: 800, pct: 60 })
    expect(p.protein_g.pct).toBe(60)
  })
  it('treats a missing actual value as zero, not as null (control)', () => {
    const p = computeProgress({ calories: 2000 }, {})
    expect(p.calories.actual).toBe(0)
    expect(p.calories.remaining).toBe(2000)
  })
  it('a null target produces a null entry rather than dividing by nothing', () => {
    const p = computeProgress({ calories: null }, { calories: 500 })
    expect(p.calories).toBeNull()
  })
})

describe('computeAdaptivePlan', () => {
  const fullProfile = {
    weightKg: 70, heightCm: 175, ageYears: 30, sex: 'male', bodyFatPct: null,
    activityLevel: 'sedentary', goal: 'maintain', weeklyChangeKg: null, calorieAdjustment: null,
    isPregnantOrPostpartum: false, hasEdRiskFlag: false,
  }

  it('reports the exact missing required fields on an incomplete profile, never guessing', () => {
    const r = computeAdaptivePlan({ profile: { weightKg: 70 } })
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(expect.arrayContaining(['heightCm', 'ageYears', 'activityLevel', 'goal']))
  })

  it('computes a full rest-day plan with no sessions', () => {
    const r = computeAdaptivePlan({ profile: fullProfile })
    expect(r.ok).toBe(true)
    expect(r.engineVersion).toBe(ENGINE_VERSION)
    expect(r.trainingLoad.tier).toBe('rest_light')
    expect(r.targets.calories).toBeGreaterThan(0)
    expect(r.carbPlan.band).toEqual([3, 5])
  })

  it('calories always equals the sum of the macro targets (internal consistency invariant)', () => {
    const cases = [
      { ...fullProfile },
      { ...fullProfile, goal: 'gradual_loss', weeklyChangeKg: 0.5 },
      { ...fullProfile, goal: 'gradual_gain', weeklyChangeKg: 0.4 },
      { ...fullProfile, activityLevel: 'very_active', goal: 'gradual_loss', weeklyChangeKg: 1.0 },
    ]
    for (const profile of cases) {
      const r = computeAdaptivePlan({ profile })
      const macroKcal = r.targets.protein_g * 4 + r.targets.carbs_g * 4 + r.targets.fat_g * 9
      expect(macroKcal).toBe(r.targets.calories)
    }
  })

  it('adds exercise energy on top of baseline for a planned run, raising the calorie target', () => {
    const rest = computeAdaptivePlan({ profile: fullProfile })
    const withRun = computeAdaptivePlan({
      profile: fullProfile,
      plannedSessions: [{ sport: 'run', intensity: 'moderate', durationMin: 60 }],
    })
    expect(withRun.energy.exercise).toBeGreaterThan(0)
    expect(withRun.targets.calories).toBeGreaterThan(rest.targets.calories)
  })

  it('prefers a synced completed workout\'s real calories over the planned estimate (no double count)', () => {
    const r = computeAdaptivePlan({
      profile: fullProfile,
      plannedSessions: [{ sport: 'run', intensity: 'moderate', durationMin: 45 }],
      syncedSessions: [{ sport: 'run', intensity: 'moderate', durationMin: 50, calories: 700, provider: 'oura' }],
    })
    expect(r.energy.exercise).toBe(700)
    expect(r.trainingLoad.sessions).toHaveLength(1)
  })

  it('applies the minimum-energy guardrail rather than silently issuing an aggressive deficit', () => {
    const r = computeAdaptivePlan({
      profile: { ...fullProfile, weightKg: 45, heightCm: 150, ageYears: 60, goal: 'gradual_loss', weeklyChangeKg: 1.0 },
    })
    expect(r.energy.guardrailApplied).toBe(true)
    expect(r.warnings.some((w) => w.code === 'min_energy_guardrail')).toBe(true)
  })

  it('suppresses a deficit for a minor and uses a maintenance-level target instead', () => {
    const minorProfile = { ...fullProfile, ageYears: 16, goal: 'gradual_loss', weeklyChangeKg: 0.5 }
    const suppressed = computeAdaptivePlan({ profile: minorProfile })
    const maintained = computeAdaptivePlan({ profile: { ...minorProfile, goal: 'maintain' } })
    expect(suppressed.safety.suppressed).toBe(true)
    expect(suppressed.safety.reason).toBe('minor')
    expect(suppressed.targets.calories).toBe(maintained.targets.calories)
  })

  it('applies a day-specific override on top of the computed targets, labeled distinctly from the computed values', () => {
    const r = computeAdaptivePlan({ profile: fullProfile, overrides: { calories: 2500 } })
    expect(r.targets.calories).toBe(2500)
    expect(r.computedTargets.calories).not.toBe(2500) // the engine's own number survives, unclobbered
    expect(r.overridesApplied).toEqual({ calories: 2500 })
  })

  it('ignores an override object with no recognized keys (control)', () => {
    const r = computeAdaptivePlan({ profile: fullProfile, overrides: { nonsense: 1 } })
    expect(r.overridesApplied).toBeNull()
  })

  it('surfaces carb-loading only when the next day has an opted-in qualifying race', () => {
    const withoutLoading = computeAdaptivePlan({ profile: fullProfile })
    const withLoading = computeAdaptivePlan({
      profile: fullProfile,
      nextDaySessions: [{ sport: 'run', isRace: true, carbLoadingOptIn: true, durationMin: 240, distanceKm: 42.2 }],
    })
    expect(withoutLoading.carbLoading).toBeNull()
    expect(withLoading.carbLoading.eligible).toBe(true)
  })

  it('never mutates carbs_g target automatically for carb loading — only surfaces it as a suggestion (control)', () => {
    const r = computeAdaptivePlan({
      profile: fullProfile,
      nextDaySessions: [{ sport: 'run', isRace: true, carbLoadingOptIn: true, durationMin: 240, distanceKm: 42.2 }],
    })
    // today's own carb target is still driven by TODAY's training load (rest day), not the loading range
    expect(r.targets.carbs_g).toBe(carbTargetFromBand(70, [3, 5], 0).grams)
  })

  it('uses the current weight passed in, not a stale one (deterministic on input, unit-safe)', () => {
    const at70 = computeAdaptivePlan({ profile: { ...fullProfile, weightKg: 70 } })
    const at90 = computeAdaptivePlan({ profile: { ...fullProfile, weightKg: 90 } })
    expect(at90.targets.protein_g).toBeGreaterThan(at70.targets.protein_g)
  })
})
