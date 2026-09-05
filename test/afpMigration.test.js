import { describe, expect, it, vi } from 'vitest'
import { ensureCanonicalAfpProfile, isAfpProfileReady, legacyGoalToAfp, legacyProfilePatch } from '../server/afp/migration.js'

const legacy = {
  units_pref: 'metric', height_cm: 180, weight_kg: 75, age_years: 35,
  sex: 'male', activity_level: 'moderate', goal: 'lose_fat',
}

describe('canonical AFP profile migration', () => {
  it('maps legacy goals without double-counting endurance training', () => {
    expect(legacyGoalToAfp('lose_fat')).toBe('fat_loss')
    expect(legacyGoalToAfp('build_muscle')).toBe('muscle_gain')
    expect(legacyGoalToAfp('endurance')).toBe('endurance_performance')
  })

  it('fills only missing canonical fields and preserves explicit edits', () => {
    expect(legacyProfilePatch(legacy, { weight_kg: 68, goal: 'custom', updated_at: '2026-08-01T00:00:00Z' })).toEqual({
      units_pref: 'metric', height_cm: 180, age_years: 35, sex: 'male', activity_level: 'moderate',
    })
  })

  it('migrates a complete legacy profile once and reports readiness', async () => {
    const store = {
      getAfpProfile: vi.fn(async () => ({ units_pref: 'imperial', weight_kg: null, height_cm: null, age_years: null, activity_level: null, goal: 'maintain', updated_at: null })),
      getProfile: vi.fn(async () => legacy),
      setAfpProfile: vi.fn(async (_userId, patch) => ({ ...patch, updated_at: '2026-08-31T00:00:00Z' })),
    }
    const result = await ensureCanonicalAfpProfile(store, 7)
    expect(result).toMatchObject({ ready: true, migrated: true })
    expect(result.profile.goal).toBe('fat_loss')
    expect(store.setAfpProfile).toHaveBeenCalledTimes(1)
  })

  it('does not touch an already-ready canonical profile', async () => {
    const profile = { weight_kg: 70, height_cm: 175, age_years: 30, activity_level: 'light', goal: 'maintain' }
    const store = { getAfpProfile: vi.fn(async () => profile), getProfile: vi.fn(), setAfpProfile: vi.fn() }
    expect(isAfpProfileReady(profile)).toBe(true)
    expect(await ensureCanonicalAfpProfile(store, 1)).toEqual({ profile, ready: true, migrated: false })
    expect(store.getProfile).not.toHaveBeenCalled()
  })
})
