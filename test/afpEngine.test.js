import { describe, expect, it } from 'vitest'
import { AFP_SCIENCE, SCIENCE_VERSION } from '../server/afp/science.js'
import { ENGINE_VERSION, NASEM_2023_EER, computeAdaptivePlan, estimateEER, evaluateEligibility, normalizeGoal, proteinTarget, reconcileMacroTargets } from '../server/afp/engine.js'

const adultMale = { ageYears: 30, heightCm: 180, weightKg: 80, eerSex: 'male', activityLevel: 'active', goal: 'maintenance', eligibilityAttested: true }

describe('AFP v1 science registry', () => {
  it('is independently versioned and carries stable sources, populations, limits, and review dates', () => {
    expect(SCIENCE_VERSION).not.toBe(String(ENGINE_VERSION))
    for (const source of [AFP_SCIENCE.energy, AFP_SCIENCE.carbohydrate, AFP_SCIENCE.protein]) {
      expect(source.url).toMatch(/^https:/); expect(source.doi).toMatch(/^https:\/\/doi.org\//)
      expect(source.population).toBeTruthy(); expect(source.limits).toBeTruthy()
      expect(source.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(source.reviewDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
  it('indexes the cited evidence base with stable IDs and official URLs', () => {
    expect(AFP_SCIENCE.sources.map((source) => source.id)).toEqual(expect.arrayContaining([
      'nasem-2023-eer', 'burke-2011-carbohydrate', 'wearable-validation-2024',
    ]))
    for (const source of AFP_SCIENCE.sources) {
      expect(source.doi || source.url).toMatch(/^https:\/\//)
      expect(source.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(source.type).toBeTruthy()
      expect(source.confidenceMethod).toBe('editorial_applicability_not_GRADE')
    }
    for (const rule of [AFP_SCIENCE.energy, AFP_SCIENCE.carbohydrate, AFP_SCIENCE.protein]) {
      const bibliography = AFP_SCIENCE.sources.find((source) => source.id === rule.id)
      expect(rule.type).toBe(bibliography.type)
      expect(rule.confidence).toBe(bibliography.confidence)
    }
  })
  it('contains the supplied NASEM 2023 constants exactly', () => {
    expect(NASEM_2023_EER.male.inactive).toEqual({ intercept: 753.07, age: -10.83, heightCm: 6.5, weightKg: 14.1 })
    expect(NASEM_2023_EER.male.low).toEqual({ intercept: 581.47, age: -10.83, heightCm: 8.3, weightKg: 14.94 })
    expect(NASEM_2023_EER.male.active).toEqual({ intercept: 1004.82, age: -10.83, heightCm: 6.52, weightKg: 15.91 })
    expect(NASEM_2023_EER.male.very_active).toEqual({ intercept: -517.88, age: -10.83, heightCm: 15.61, weightKg: 19.11 })
    expect(NASEM_2023_EER.female.inactive).toEqual({ intercept: 584.9, age: -7.01, heightCm: 5.72, weightKg: 11.71 })
    expect(NASEM_2023_EER.female.low).toEqual({ intercept: 575.77, age: -7.01, heightCm: 6.6, weightKg: 12.14 })
    expect(NASEM_2023_EER.female.active).toEqual({ intercept: 710.25, age: -7.01, heightCm: 6.54, weightKg: 12.34 })
    expect(NASEM_2023_EER.female.very_active).toEqual({ intercept: 511.83, age: -7.01, heightCm: 9.07, weightKg: 12.56 })
  })
})

describe('NASEM 2023 EER', () => {
  it('calculates a male active vector using height in centimeters', () => {
    expect(estimateEER(adultMale)).toMatchObject({ ok: true, value: 3126, sexStratum: 'male', activityCategory: 'active', equation: 'nasem_2023_adult_eer' })
  })
  it('calculates a female low-active vector', () => {
    expect(estimateEER({ ageYears: 40, heightCm: 165, weightKg: 60, eerSex: 'female', activityLevel: 'low' }).value).toBe(2113)
  })
  it('fails closed for missing stratum and never uses gender identity as a proxy', () => {
    expect(estimateEER({ ...adultMale, eerSex: null, sex: null, gender: 'man' })).toMatchObject({ ok: false, missing: ['eerSex'] })
    expect(estimateEER({ ...adultMale, ageYears: 18 })).toMatchObject({ ok: false, code: 'under_19' })
  })
})

describe('AFP v1 plan golden vectors', () => {
  it('uses EER as target basis and never adds a synced calorie value 1:1', () => {
    const rest = computeAdaptivePlan({ profile: adultMale })
    const synced = computeAdaptivePlan({ profile: adultMale, syncedSessions: [{ sport: 'run', durationMin: 60, calories: 900, intensity: 'hard' }] })
    expect(rest).toMatchObject({ ok: true, scienceVersion: SCIENCE_VERSION, targets: { calories: 3126, protein_g: 112, carbs_g: 320 } })
    expect(synced.energy.exercise).toBe(0)
    expect(synced.energy.baseline).toBe(rest.energy.baseline)
    expect(synced.targets.calories - rest.targets.calories).toBeLessThan(900)
    expect(synced.targets.carbs_g).toBeGreaterThan(rest.targets.carbs_g)
  })
  it('normalizes strategy aliases and applies a bounded EER-relative strategy', () => {
    expect(normalizeGoal('gradual_loss')).toBe('fat_loss')
    expect(computeAdaptivePlan({ profile: { ...adultMale, goal: 'gradual_loss' } }).energy).toMatchObject({ goalStrategy: 'fat_loss', goalAdjustment: -313, total: 2813 })
    expect(proteinTarget(80, 'gradual_loss')).toMatchObject({ band: [1.2, 1.6], grams: 112 })
  })
  it('returns the pre/during/loading carbohydrate contract only when applicable', () => {
    const plan = computeAdaptivePlan({ profile: adultMale, plannedSessions: [{ sport: 'run', intensity: 'hard', durationMin: 180 }], nextDaySessions: [{ sport: 'run', isRace: true, carbLoadingOptIn: true, durationMin: 240 }] })
    expect(plan.carbPlan).toMatchObject({ band: [6, 10], grams: 640 })
    expect(plan.carbPlan.guidance.preworkout).toMatchObject({ gPerKg: [1, 4], timingHours: [1, 4] })
    expect(plan.carbPlan.guidance.duringWorkout).toMatchObject({ gramsPerHour: [60, 90], multiTransportCarbohydrate: true })
    expect(plan.carbLoading).toMatchObject({ eligible: true, gPerKgPerDay: [10, 12], durationHours: [36, 48] })
  })
  it('blocks an ineligible profile rather than calculating then suppressing a target', () => {
    expect(computeAdaptivePlan({ profile: { ...adultMale, isPregnant: true } })).toMatchObject({ ok: false, code: 'ineligible', eligibility: { code: 'pregnancy_postpartum' } })
    expect(evaluateEligibility({ ...adultMale, hasMedicalContraindication: true })).toMatchObject({ eligible: false, code: 'clinical_review_required' })
  })
  it('fails closed unless eligibility is explicitly attested', () => {
    expect(computeAdaptivePlan({ profile: { ...adultMale, eligibilityAttested: false } })).toMatchObject({ ok: false, eligibility: { code: 'eligibility_not_attested' } })
  })
  it.each(['hasCkdOrRenalCondition', 'hasClinicianPrescribedDiet', 'hasMajorIllnessOrGlucoseLoweringMeds'])('fails closed for persisted %s safety flag', (flag) => {
    expect(computeAdaptivePlan({ profile: { ...adultMale, [flag]: true } })).toMatchObject({ ok: false, code: 'ineligible', eligibility: { code: 'clinical_review_required' } })
  })
  it('reconciles physical macros without negative calories or grams', () => {
    const targets = reconcileMacroTargets({ calories: 100, protein_g: 40, carbs_g: 30 })
    expect(targets).toEqual({ calories: 280, protein_g: 40, carbs_g: 30, fat_g: 0 })
    const plan = computeAdaptivePlan({ profile: adultMale, overrides: { calories: -1, protein_g: -2, carbs_g: -3 } })
    expect(Object.values(plan.targets).every((value) => value >= 0)).toBe(true)
    expect(plan.targets.calories).toBeCloseTo(plan.targets.protein_g * 4 + plan.targets.carbs_g * 4 + plan.targets.fat_g * 9, 0)
  })
  it('keeps a positive fat floor and raises energy on a very-high-load day', () => {
    const plan = computeAdaptivePlan({ profile: adultMale, plannedSessions: [{ sport: 'ride', intensity: 'moderate', durationMin: 300 }] })
    expect(plan.trainingLoad.tier).toBe('very_high')
    expect(plan.targets.fat_g).toBeGreaterThanOrEqual(40)
    expect(plan.targets.calories).toBeCloseTo(plan.targets.protein_g * 4 + plan.targets.carbs_g * 4 + plan.targets.fat_g * 9, 0)
  })
  it('does not classify a 76-minute hard session as very high load', () => {
    const plan = computeAdaptivePlan({ profile: adultMale, plannedSessions: [{ sport: 'run', intensity: 'hard', durationMin: 76 }] })
    expect(plan.trainingLoad).toMatchObject({ tier: 'endurance_high', totalMinutes: 76, hasHardSession: true, carbBand: [6, 10] })
  })
  it('attaches the reviewed evidence citation to the bounded goal policy', () => {
    expect(computeAdaptivePlan({ profile: adultMale }).energy.citationId).toBe(AFP_SCIENCE.goal.id)
  })
  it('is deterministic and puts engine plus science versions in output', () => {
    expect(computeAdaptivePlan({ profile: adultMale })).toEqual(computeAdaptivePlan({ profile: adultMale }))
    expect(computeAdaptivePlan({ profile: adultMale })).toMatchObject({ engineVersion: ENGINE_VERSION, scienceVersion: SCIENCE_VERSION })
  })
})
