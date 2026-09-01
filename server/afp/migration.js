// One-time compatibility bridge from the original calculator profile into the
// canonical Adaptive Fuel Plan profile. It fills only missing values and never
// overwrites a profile the person has already edited in the new system.

const REQUIRED = ['weight_kg', 'height_cm', 'age_years', 'activity_level', 'goal']

export function isAfpProfileReady(profile) {
  return !!profile && REQUIRED.every((key) => profile[key] !== null && profile[key] !== undefined && profile[key] !== '')
}

export function legacyGoalToAfp(goal) {
  return {
    maintain: 'maintain',
    lose_fat: 'gradual_loss',
    build_muscle: 'gradual_gain',
    // Endurance needs are periodized from actual planned/synced sessions in
    // AFP. Mapping the old broad endurance label to maintenance avoids adding
    // a second automatic surplus on top of that training energy.
    endurance: 'maintain',
  }[goal] || 'maintain'
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
