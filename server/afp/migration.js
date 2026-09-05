// One-time compatibility bridge from the original calculator profile into the
// canonical Adaptive Fuel Plan profile. It fills only missing values and never
// overwrites a profile the person has already edited in the new system.

const REQUIRED = ['weight_kg', 'height_cm', 'age_years', 'activity_level', 'goal']

// Legacy goals are accepted at the API boundary only, then normalized before
// persistence. There is one canonical representation in snapshots/hashes.
export const AFP_GOAL_ALIASES = Object.freeze({
  maintain: 'maintenance', maintenance: 'maintenance',
  gradual_loss: 'fat_loss', loss: 'fat_loss', lose_fat: 'fat_loss', fat_loss: 'fat_loss',
  gradual_gain: 'muscle_gain', gain: 'muscle_gain', build_muscle: 'muscle_gain', muscle_gain: 'muscle_gain',
  endurance: 'endurance_performance', performance: 'endurance_performance', fuel_performance: 'endurance_performance', endurance_performance: 'endurance_performance',
  custom: 'custom',
})

export function normalizeAfpGoal(goal) {
  return AFP_GOAL_ALIASES[goal] || null
}

// Automatic AFP is intentionally unavailable where an unsupervised estimate
// would be inappropriate. Manual/clinician modes preserve a way to record a
// clinician-directed target without pretending it is an automatic plan.
export function automaticPlanEligibility(profile = {}) {
  const reasons = []
  if (profile.eligibility_attested !== true) reasons.push('eligibility_not_attested')
  if (Number(profile.age_years) < 19) reasons.push('under_19')
  if (profile.is_pregnant_or_postpartum) reasons.push('pregnancy_postpartum')
  if (profile.is_lactating) reasons.push('lactation')
  if (profile.has_ckd_or_renal_condition) reasons.push('ckd_or_renal_condition')
  if (profile.has_ed_risk_flag) reasons.push('eating_disorder_or_restrictive_concern')
  if (profile.has_clinician_prescribed_diet) reasons.push('clinician_prescribed_diet')
  if (profile.has_major_illness_or_glucose_lowering_meds) reasons.push('major_illness_or_glucose_lowering_meds')
  return { eligible: reasons.length === 0, reasons }
}

export function isAfpProfileReady(profile) {
  return !!profile && REQUIRED.every((key) => profile[key] !== null && profile[key] !== undefined && profile[key] !== '')
}

export function legacyGoalToAfp(goal) {
  // Endurance performance remains energy-neutral in the engine; it changes
  // protein/carbohydrate periodization rather than creating a second surplus.
  return normalizeAfpGoal(goal) || 'maintenance'
}

export function legacyProfilePatch(legacy, afp) {
  if (!legacy) return {}
  const patch = {}
  for (const key of ['units_pref', 'height_cm', 'weight_kg', 'age_years', 'sex', 'activity_level']) {
    if ((afp?.[key] === null || afp?.[key] === undefined) && legacy[key] !== null && legacy[key] !== undefined) {
      patch[key] = legacy[key]
    }
  }
  // An untouched AFP default has no updated_at. Once a person has saved the
  // canonical profile, even an explicit "maintain" goal must win.
  if (!afp?.updated_at && legacy.goal) patch.goal = legacyGoalToAfp(legacy.goal)
  return patch
}

export async function ensureCanonicalAfpProfile(store, userId) {
  let profile = await store.getAfpProfile(userId)
  if (isAfpProfileReady(profile)) return { profile, ready: true, migrated: false }

  const legacy = await store.getProfile?.(userId)
  const patch = legacyProfilePatch(legacy, profile)
  if (Object.keys(patch).length > 0) profile = await store.setAfpProfile(userId, patch)
  return { profile, ready: isAfpProfileReady(profile), migrated: Object.keys(patch).length > 0 }
}
