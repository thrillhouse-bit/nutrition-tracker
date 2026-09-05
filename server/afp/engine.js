// Adaptive Fuel Plan v1 calculation engine. This module is pure: callers
// provide every input and persist the returned snapshot.
import { AFP_SCIENCE, SCIENCE_VERSION } from './science.js'

export const ENGINE_VERSION = 2
export { SCIENCE_VERSION }

const number = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null }
const round = (value, step = 1) => Math.round(value / step) * step
const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value))

// Historical aliases keep old snapshots readable. Unknown values are never
// guessed or silently assigned a different strategy.
export const GOAL_STRATEGIES = Object.freeze({
  maintenance: Object.freeze({ aliases: ['maintain', 'maintenance'], adjustmentFraction: 0 }),
  fat_loss: Object.freeze({ aliases: ['gradual_loss', 'loss', 'weight_loss', 'fat_loss'], adjustmentFraction: -0.1 }),
  // A surplus is deliberately more conservative than a deficit. AFP is a
  // planning aid, not a promise of a particular rate of muscle gain.
  muscle_gain: Object.freeze({ aliases: ['gradual_gain', 'gain', 'weight_gain', 'muscle_gain'], adjustmentFraction: 0.05 }),
  endurance_performance: Object.freeze({ aliases: ['performance', 'fuel_performance', 'endurance_performance'], adjustmentFraction: 0 }),
})
export function normalizeGoal(goal) {
  return Object.entries(GOAL_STRATEGIES).find(([, definition]) => definition.aliases.includes(goal))?.[0] || null
}

export const ACTIVITY_ALIASES = Object.freeze({
  inactive: 'inactive', sedentary: 'inactive', low: 'low', low_active: 'low', light: 'low',
  active: 'active', moderate: 'active', very_active: 'very_active', very: 'very_active',
})
export const normalizeActivity = (activity) => ACTIVITY_ALIASES[activity] || null

// `sex` means the explicit physiological EER stratum selected for this
// equation. It is never inferred from gender identity, name, or any proxy.
export const NASEM_2023_EER = AFP_SCIENCE.energy.constants.eer
export function normalizeEerSex(profile = {}) {
  const explicit = profile.eerSex ?? profile.eer_sex ?? profile.sexAtBirth ?? profile.sex_at_birth ?? profile.sex
  return explicit === 'male' || explicit === 'female' ? explicit : null
}
export function estimateEER({ ageYears, heightCm, weightKg, activityLevel, activity, ...profile } = {}) {
  const age = number(ageYears), height = number(heightCm), weight = number(weightKg)
  const sex = normalizeEerSex(profile), category = normalizeActivity(activityLevel ?? activity)
  const missing = []
  if (age == null) missing.push('ageYears')
  if (height == null || height <= 0) missing.push('heightCm')
  if (weight == null || weight <= 0) missing.push('weightKg')
  if (!sex) missing.push('eerSex')
  if (!category) missing.push('activityLevel')
  if (missing.length) return { ok: false, code: 'missing_eer_inputs', missing }
  if (age < 19) return { ok: false, code: 'under_19', missing: [], message: 'AFP v1 EER is limited to adults age 19 and older.' }
  const c = NASEM_2023_EER[sex][category]
  const value = c.intercept + c.age * age + c.heightCm * height + c.weightKg * weight
  return { ok: true, value: round(value), rawValue: value, equation: 'nasem_2023_adult_eer', sexStratum: sex, activityCategory: category, citationId: AFP_SCIENCE.energy.id }
}
// Compatibility name. AFP v1 intentionally exposes EER rather than an RMR proxy.
export const estimateRMR = estimateEER

export function computeBMI(weightKg, heightCm) {
  const weight = number(weightKg), height = number(heightCm)
  return weight == null || height == null || weight <= 0 || height <= 0 ? null : { value: Math.round((weight / ((height / 100) ** 2)) * 10) / 10 }
}

// Kept for the independent workout-entry estimate. AFP does not add this or
// synced provider calories to EER, preventing a 1:1 exercise-calorie add-on.
export const MET_TABLE = Object.freeze({
  run: { easy: 8, moderate: 10, hard: 13 }, ride: { easy: 6, moderate: 8, hard: 10.5 }, swim: { easy: 6, moderate: 8.5, hard: 11 }, row: { easy: 6, moderate: 8.5, hard: 12 }, walk: { easy: 3, moderate: 3.8, hard: 5 }, hike: { easy: 5, moderate: 6, hard: 7.5 }, strength: { easy: 4, moderate: 5, hard: 6.5 }, hiit: { easy: 6, moderate: 8, hard: 10 }, cardio: { easy: 5, moderate: 6.5, hard: 8 }, mobility: { easy: 2.5, moderate: 3, hard: 3.5 }, workout: { easy: 5, moderate: 6, hard: 7.5 },
})
export function estimateSessionEnergyKcal(session = {}, weightKg) {
  const weight = number(weightKg); if (weight == null || weight <= 0) return 0
  const values = MET_TABLE[session.sport] || MET_TABLE.workout
  return (values[session.intensity] ?? values.moderate) * 3.5 * weight / 200 * Math.max(0, number(session.durationMin) || 0)
}
export function reconcileSessions(planned = [], synced = []) {
  const out = synced.map((s) => ({ ...s, source: 'synced', intensity: s.intensity || 'moderate', durationMin: number(s.durationMin) || 0 }))
  for (const plannedSession of planned) {
    const match = out.find((s) => s.sport === plannedSession.sport)
    if (match) Object.assign(match, { isKeySession: !!(match.isKeySession || plannedSession.isKeySession), isRace: !!(match.isRace || plannedSession.isRace), carbLoadingOptIn: !!(match.carbLoadingOptIn || plannedSession.carbLoadingOptIn) })
    else out.push({ ...plannedSession, source: 'planned', intensity: plannedSession.intensity || 'moderate', durationMin: number(plannedSession.durationMin) || 0 })
  }
  return out
}

export const TRAINING_LOAD_TIERS = AFP_SCIENCE.carbohydrate.constants.dailyBands
export function classifyTrainingLoad(sessions = []) {
  const totalMinutes = sessions.reduce((sum, session) => sum + Math.max(0, number(session.durationMin) || 0), 0)
  const hard = sessions.some((session) => session.intensity === 'hard' && (number(session.durationMin) || 0) >= 20)
  let tier = totalMinutes <= 20 ? TRAINING_LOAD_TIERS[0] : totalMinutes <= 75 ? TRAINING_LOAD_TIERS[1] : totalMinutes <= 240 ? TRAINING_LOAD_TIERS[2] : TRAINING_LOAD_TIERS[3]
  // Daily carbohydrate bands are duration bands. A hard interval is useful
  // context for the plan, but must not promote a 76-minute session into the
  // over-four-hour very-high band.
  return { tier: tier.id, totalMinutes, hasHardSession: hard, carbBand: tier.gPerKg }
}
export function carbohydrateTarget(weightKg, load) {
  const weight = number(weightKg); if (weight == null || weight <= 0) return null
  const [low, high] = load.carbBand, perKg = (low + high) / 2
  return { grams: round(weight * perKg), perKg, band: [low, high], citationId: AFP_SCIENCE.carbohydrate.id }
}
export const carbTargetFromBand = (weightKg, band) => carbohydrateTarget(weightKg, { carbBand: band })
export function proteinTarget(weightKg, goal) {
  const weight = number(weightKg), strategy = normalizeGoal(goal) || 'maintenance'
  if (weight == null || weight <= 0) return null
  const band = AFP_SCIENCE.protein.constants.bands[strategy] || AFP_SCIENCE.protein.constants.bands.maintenance
  const perKg = (band[0] + band[1]) / 2
  return { grams: round(weight * perKg), perKg, band: [...band], citationId: AFP_SCIENCE.protein.id }
}
export function buildCarbGuidance({ sessions = [], nextDayHasDemandingSession = false } = {}) {
  const focus = [...sessions].sort((a, b) => (number(b.durationMin) || 0) - (number(a.durationMin) || 0))[0]
  const duration = number(focus?.durationMin) || 0
  return {
    preworkout: focus && duration >= 60 ? { gPerKg: [...AFP_SCIENCE.carbohydrate.constants.pre.gPerKg], timingHours: [...AFP_SCIENCE.carbohydrate.constants.pre.timingHours], citationId: AFP_SCIENCE.carbohydrate.id } : null,
    duringWorkout: focus && duration >= 60 ? duration > 150 && focus.intensity === 'hard'
      ? { gramsPerHour: [60, 90], multiTransportCarbohydrate: true, gutTrainingDisclosure: 'Higher rates require practiced tolerance; use multiple transportable carbohydrates and practice in training.', citationId: AFP_SCIENCE.carbohydrate.id }
      : { gramsPerHour: [30, 60], durationHours: [1, 2.5], citationId: AFP_SCIENCE.carbohydrate.id } : null,
    recovery: nextDayHasDemandingSession ? { message: 'Prioritize carbohydrate-containing recovery meals before the next demanding session.' } : null,
  }
}
export function evaluateCarbLoading(nextDaySessions = []) {
  const candidate = nextDaySessions.find((session) => session.isRace && session.carbLoadingOptIn)
  if (!candidate) return null
  const qualifies = (number(candidate.durationMin) || 0) > 90
  return qualifies ? { eligible: true, optIn: true, gPerKgPerDay: [...AFP_SCIENCE.carbohydrate.constants.loading.gPerKgPerDay], durationHours: [...AFP_SCIENCE.carbohydrate.constants.loading.durationHours], citationId: AFP_SCIENCE.carbohydrate.id } : { eligible: false, reason: 'Carbohydrate loading is reserved for an opted-in endurance event of about 90 minutes or longer.' }
}

export function evaluateEligibility(profile = {}) {
  // This is an affirmative safety gate, not a convenience default.  Keeping
  // it here (rather than only at the HTTP boundary) prevents a worker, job,
  // or future caller from calculating an automatic target without consent.
  if (profile.eligibilityAttested !== true && profile.eligibility_attested !== true) return { eligible: false, code: 'eligibility_not_attested' }
  const age = number(profile.ageYears)
  if (age == null) return { eligible: false, code: 'missing_age' }
  if (age < 19) return { eligible: false, code: 'under_19' }
  if (!normalizeEerSex(profile)) return { eligible: false, code: 'missing_eer_sex' }
  if (profile.isPregnantOrPostpartum || profile.isPregnant || profile.isPostpartum || profile.isLactating || profile.lactating) return { eligible: false, code: 'pregnancy_postpartum' }
  // Keep the persisted AFP names here as well as historical aliases. These
  // flags are safety gates: a true value must never be lost in translation
  // before an automatic target is calculated.
  if (profile.hasEdRiskFlag || profile.hasEatingDisorderRisk || profile.medicalRiskFlag || profile.hasMedicalContraindication || profile.hasCkdOrRenalCondition || profile.hasRenalDisease || profile.renalDisease || profile.renalCondition || profile.kidneyDisease || profile.hasClinicianPrescribedDiet || profile.isOnClinicianDiet || profile.requiresClinicianDiet || profile.clinicianDiet || profile.hasMajorIllnessOrGlucoseLoweringMeds || profile.hasMajorIllness || profile.majorIllness || profile.hasGlucoseManagementCondition || profile.glucoseManagementCondition || profile.hasDiabetes || profile.diabetes) return { eligible: false, code: 'clinical_review_required' }
  if (profile.afpEligible === false || profile.isEligibleForAfp === false) return { eligible: false, code: 'not_eligible' }
  return { eligible: true, code: null }
}
export const evaluateSafety = (profile) => { const eligibility = evaluateEligibility(profile); return { ...eligibility, suppressed: !eligibility.eligible } }
export function computeGoalAdjustment({ goal, calorieAdjustment, eer }) {
  const strategy = normalizeGoal(goal); if (!strategy) return { ok: false, code: 'unknown_goal' }
  const adjustment = eer * GOAL_STRATEGIES[strategy].adjustmentFraction
  const capped = clamp(adjustment, -eer * 0.15, eer * 0.15)
  return { ok: true, strategy, adjustmentKcal: round(capped), requestedKcal: round(adjustment), capped: capped !== adjustment, citationId: AFP_SCIENCE.goal.id }
}

// Macro policy: retain the calculated calorie, protein, and carbohydrate
// targets; derive fat from their remaining energy. If protein plus carbohydrate
// already exceeds calories, raise calories to include the selected fat floor.
// This keeps all four values non-negative and physically
// reconcilable without silently lowering protein or carbohydrate targets.
export function reconcileMacroTargets({ calories, protein_g, carbs_g, fat_g, fatFloorG = 0 }) {
  const protein = Math.max(0, number(protein_g) || 0)
  const carbs = Math.max(0, number(carbs_g) || 0)
  const requestedCalories = Math.max(0, number(calories) || 0)
  const proteinCarbCalories = protein * 4 + carbs * 4
  const floor = Math.max(0, number(fatFloorG) || 0)
  const requestedFat = number(fat_g)
  const minimumFat = Math.max(floor, requestedFat == null ? 0 : Math.max(0, requestedFat))
  const reconciledCalories = Math.max(requestedCalories, proteinCarbCalories + minimumFat * 9)
  const fat = Math.max(minimumFat, (reconciledCalories - proteinCarbCalories) / 9)
  return {
    calories: round(reconciledCalories, 0.1),
    protein_g: round(protein, 0.1),
    carbs_g: round(carbs, 0.1),
    fat_g: round(fat, 0.1),
  }
}
export function computeProgress(targets, actualIntake = {}) {
  return Object.fromEntries(['calories', 'protein_g', 'carbs_g', 'fat_g'].map((key) => { const target = number(targets?.[key]); if (target == null) return [key, null]; const actual = number(actualIntake?.[key]) || 0; return [key, { target, actual, remaining: round(target - actual, 0.1), pct: target > 0 ? Math.round(actual / target * 100) : 0 }] }))
}

const REQUIRED = ['weightKg', 'heightCm', 'ageYears', 'activityLevel', 'goal']
export function computeAdaptivePlan({ profile = {}, plannedSessions = [], syncedSessions = [], nextDaySessions = [], overrides = null } = {}) {
  if (profile.planMode && profile.planMode !== 'automatic') return { ok: false, code: 'manual_targets_required', mode: profile.planMode, scienceVersion: SCIENCE_VERSION }
  const missing = REQUIRED.filter((key) => profile[key] == null)
  if (missing.length) return { ok: false, code: 'missing_profile', missing, scienceVersion: SCIENCE_VERSION }
  const eligibility = evaluateEligibility(profile)
  if (!eligibility.eligible) return { ok: false, code: 'ineligible', eligibility, scienceVersion: SCIENCE_VERSION }
  const eer = estimateEER(profile)
  if (!eer.ok) return { ok: false, code: eer.code, missing: eer.missing || [], scienceVersion: SCIENCE_VERSION }
  const strategy = normalizeGoal(profile.goal)
  if (!strategy) return { ok: false, code: 'unknown_goal', scienceVersion: SCIENCE_VERSION }
  const sessions = reconcileSessions(plannedSessions, syncedSessions), load = classifyTrainingLoad(sessions)
  const goal = computeGoalAdjustment({ goal: profile.goal, calorieAdjustment: profile.calorieAdjustment, eer: eer.value })
  if (!goal.ok) return { ok: false, code: goal.code, scienceVersion: SCIENCE_VERSION }
  // A demanding day never receives a larger deficit: retain EER on hard or
  // long training days to prioritize availability for the session.
  if (goal.strategy === 'fat_loss' && (load.hasHardSession || load.totalMinutes > 75)) goal.adjustmentKcal = 0
  const carb = carbohydrateTarget(profile.weightKg, load), protein = proteinTarget(profile.weightKg, strategy)
  // A positive floor keeps a plan nutritionally coherent even on very-high
  // carbohydrate days where protein + carbohydrate otherwise consume all
  // calories. It is a floor only; calories rise rather than silently cutting
  // a selected protein or carbohydrate target.
  const fatFloorG = Number(profile.weightKg) * AFP_SCIENCE.macroReconciliation.fatFloorGPerKg
  const computedTargets = reconcileMacroTargets({ calories: round(eer.value + goal.adjustmentKcal), protein_g: protein.grams, carbs_g: carb.grams, fatFloorG })
  const acceptedOverrides = Object.fromEntries(Object.entries(overrides || {}).filter(([key, value]) => ['calories', 'protein_g', 'carbs_g', 'fat_g'].includes(key) && number(value) != null).map(([key, value]) => [key, number(value)]))
  const targets = Object.keys(acceptedOverrides).length ? reconcileMacroTargets({ ...computedTargets, ...acceptedOverrides, fatFloorG }) : computedTargets
  return { ok: true, engineVersion: ENGINE_VERSION, scienceVersion: SCIENCE_VERSION, science: AFP_SCIENCE, eligibility, bmi: computeBMI(profile.weightKg, profile.heightCm), eer, energy: { baseline: eer.value, exercise: 0, goalAdjustment: goal.adjustmentKcal, total: computedTargets.calories, goalStrategy: goal.strategy, goalAdjustmentCapped: goal.capped, citationId: goal.citationId }, targets, computedTargets, overridesApplied: Object.keys(acceptedOverrides).length ? acceptedOverrides : null, trainingLoad: { ...load, sessions }, carbPlan: { ...carb, guidance: buildCarbGuidance({ sessions, nextDayHasDemandingSession: nextDaySessions.some((session) => (number(session.durationMin) || 0) >= 60 || session.intensity === 'hard') }) }, carbLoading: evaluateCarbLoading(nextDaySessions) }
}
