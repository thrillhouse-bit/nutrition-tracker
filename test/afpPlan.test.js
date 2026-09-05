import { describe, it, expect, vi } from 'vitest'
import { addDaysToYmd, dedupeSessions, gatherSyncedSessions, getOrComputeAfpPlan, profileRowToEngineInput, plannedRowToSession, withCanonicalPlannedWorkout } from '../server/afp/plan.js'
import { DEFAULT_AFP_PROFILE } from '../server/db.js'

const fullProfileRow = {
  ...DEFAULT_AFP_PROFILE, weight_kg: 70, height_cm: 175, age_years: 30, sex: 'male', equation_stratum: 'men', eligibility_attested: true, activity_level: 'sedentary', goal: 'maintain',
}

function fakeStore(overrides = {}) {
  return {
    getAfpProfile: vi.fn(async () => fullProfileRow),
    getPlannedWorkoutsForDay: vi.fn(async () => []),
    listOuraAccounts: vi.fn(async () => []),
    listOuraWorkouts: vi.fn(async () => []),
    listAppleSignals: vi.fn(async () => []),
    getAfpDailyPlan: vi.fn(async () => null),
    saveAfpDailyPlan: vi.fn(async (userId, date, row) => ({ user_id: userId, date, ...row })),
    ...overrides,
  }
}

describe('addDaysToYmd', () => {
  it('adds a day within the same month', () => {
    expect(addDaysToYmd('2026-08-24', 1)).toBe('2026-08-25')
  })
  it('rolls over a month boundary', () => {
    expect(addDaysToYmd('2026-08-31', 1)).toBe('2026-09-01')
  })
  it('rolls over a year boundary', () => {
    expect(addDaysToYmd('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('handles a leap-day boundary correctly (2028 is a leap year)', () => {
    expect(addDaysToYmd('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysToYmd('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('profileRowToEngineInput', () => {
  it('coerces numeric strings/decimals (as Postgres numeric columns round-trip) into real numbers', () => {
    const input = profileRowToEngineInput({ weight_kg: '70.5', height_cm: '175', age_years: '30', sex: 'female', activity_level: 'light', goal: 'maintain' })
    expect(input.weightKg).toBe(70.5)
    expect(typeof input.heightCm).toBe('number')
  })
  it('null sex/body_fat_pct pass through as null, not zero or a guess (control)', () => {
    const input = profileRowToEngineInput({ weight_kg: 70, sex: null, body_fat_pct: null })
    expect(input.sex).toBeNull()
    expect(input.bodyFatPct).toBeNull()
  })
})

describe('plannedRowToSession', () => {
  it('maps a stored row into the engine\'s session shape', () => {
    const s = plannedRowToSession({ sport: 'run', intensity: 'hard', duration_min: '60', distance_km: '10', is_key_session: true, is_race: false, carb_loading_opt_in: false })
    expect(s).toEqual({ sport: 'run', intensity: 'hard', durationMin: 60, distanceKm: 10, isKeySession: true, isRace: false, carbLoadingOptIn: false })
  })
})

describe('withCanonicalPlannedWorkout', () => {
  const planned = [{ sport: 'run', intensity: 'hard', duration_min: 60, start_time: '06:30', is_key_session: true, is_race: false }]

  it('surfaces the canonical planned session in Today when no completed workout exists', () => {
    const result = withCanonicalPlannedWorkout({ readiness: { value: 80 } }, planned, new Date('2026-08-25T12:00:00Z'))
    expect(result.workout).toMatchObject({
      provider: 'manual', demo: false,
      value: { label: 'Morning Run', kind: 'run', intensity: 'hard', time: '6:30 AM', durationMin: 60, status: 'planned' },
    })
  })

  it('replaces a legacy manual or demo workout with the canonical session', () => {
    const legacy = { workout: { provider: 'manual', demo: false, value: { kind: 'walk' } } }
    expect(withCanonicalPlannedWorkout(legacy, planned).workout.value.kind).toBe('run')
  })

  it('never overwrites a real completed wearable workout', () => {
    const real = { workout: { provider: 'oura', demo: false, value: { kind: 'ride' } } }
    expect(withCanonicalPlannedWorkout(real, planned)).toBe(real)
  })
})

describe('gatherSyncedSessions', () => {
  it('returns an empty list when no provider has an account/data (control)', async () => {
    const store = fakeStore()
    expect(await gatherSyncedSessions(store, 1, '2026-08-25')).toEqual([])
  })

  it('includes a real Oura workout, mapped through the activity->kind vocabulary, duration derived from start/end', async () => {
    const store = fakeStore({
      listOuraAccounts: vi.fn(async () => [{ id: 5 }]),
      listOuraWorkouts: vi.fn(async () => [{ activity: 'running', intensity: 'hard', calories: 500, distance: 8000, start_datetime: '2026-08-25T06:00:00Z', end_datetime: '2026-08-25T07:00:00Z' }]),
    })
    const sessions = await gatherSyncedSessions(store, 1, '2026-08-25')
    expect(sessions).toEqual([{ sport: 'run', intensity: 'hard', durationMin: 60, distanceKm: 8, provider: 'oura', startAt: '2026-08-25T06:00:00Z' }])
  })

  it('includes an Apple-synced workout signal, defaulting intensity to moderate (HealthKit has none)', async () => {
    const store = fakeStore({
      listAppleSignals: vi.fn(async () => [{ metric: 'workout', value: { kind: 'ride', duration_min: 45 } }, { metric: 'steps', value: 8000 }]),
    })
    const sessions = await gatherSyncedSessions(store, 1, '2026-08-25')
    expect(sessions).toMatchObject([{ sport: 'ride', intensity: 'moderate', durationMin: 45, distanceKm: null, provider: 'apple' }])
  })

  it('combines Oura and Apple sessions for the same day', async () => {
    const store = fakeStore({
      listOuraAccounts: vi.fn(async () => [{ id: 5 }]),
      listOuraWorkouts: vi.fn(async () => [{ activity: 'running', calories: 500, start_datetime: '2026-08-25T06:00:00Z', end_datetime: '2026-08-25T06:45:00Z' }]),
      listAppleSignals: vi.fn(async () => [{ metric: 'workout', value: { kind: 'strength', duration_min: 30 } }]),
    })
    const sessions = await gatherSyncedSessions(store, 1, '2026-08-25')
    expect(sessions.map((s) => s.sport)).toEqual(['run', 'strength'])
  })

  it('a failing Oura call does not prevent Apple sessions from being gathered (resilience)', async () => {
    const store = fakeStore({
      listOuraAccounts: vi.fn(async () => { throw new Error('oura down') }),
      listAppleSignals: vi.fn(async () => [{ metric: 'workout', value: { kind: 'walk', duration_min: 20 } }]),
    })
    const sessions = await gatherSyncedSessions(store, 1, '2026-08-25')
    expect(sessions).toMatchObject([{ sport: 'walk', intensity: 'moderate', durationMin: 20, distanceKm: null, provider: 'apple' }])
  })
})

describe('dedupeSessions', () => {
  it('deduplicates near-identical provider mirrors and preserves the documented Oura precedence', () => {
    const sessions = dedupeSessions([
      { sport: 'run', durationMin: 60, provider: 'apple', startAt: '2026-08-25T06:03:00Z' },
      { sport: 'run', durationMin: 55, provider: 'oura', startAt: '2026-08-25T06:00:00Z' },
    ])
    expect(sessions).toEqual([expect.objectContaining({ provider: 'oura', durationMin: 55 })])
  })
})

describe('getOrComputeAfpPlan — the freeze-a-past-day reconciliation rule', () => {
  it('TODAY always recomputes, even when a snapshot already exists for it', async () => {
    const store = fakeStore({
      getAfpDailyPlan: vi.fn(async () => ({ date: '2026-08-25', plan: { targets: { calories: 999 } } })),
    })
    const { row, recomputed } = await getOrComputeAfpPlan(store, 1, '2026-08-25', { today: '2026-08-25' })
    expect(recomputed).toBe(true)
    expect(store.saveAfpDailyPlan).toHaveBeenCalledTimes(1)
    expect(row.plan.targets.calories).not.toBe(999) // a fresh compute, not the stale stored figure
  })

  it('a PAST day with an existing snapshot returns the FROZEN row without recomputing (no live mutation)', async () => {
    const frozen = { date: '2026-08-20', plan: { targets: { calories: 1800 } }, overrides: null }
    const store = fakeStore({ getAfpDailyPlan: vi.fn(async () => frozen) })
    const { row, recomputed } = await getOrComputeAfpPlan(store, 1, '2026-08-20', { today: '2026-08-25' })
    expect(recomputed).toBe(false)
    expect(row).toBe(frozen)
    expect(store.saveAfpDailyPlan).not.toHaveBeenCalled()
  })

  it('a PAST day with NO existing snapshot computes and saves once (first-ever view of that day)', async () => {
    const store = fakeStore({ getAfpDailyPlan: vi.fn(async () => null) })
    const { row, recomputed } = await getOrComputeAfpPlan(store, 1, '2026-08-20', { today: '2026-08-25' })
    expect(recomputed).toBe(true)
    expect(row.plan.ok).toBe(true)
  })

  it('forceRecompute explicitly overrides the freeze on a past day (the one escape hatch)', async () => {
    const frozen = { date: '2026-08-20', plan: { targets: { calories: 1800 } } }
    const store = fakeStore({ getAfpDailyPlan: vi.fn(async () => frozen) })
    const { recomputed } = await getOrComputeAfpPlan(store, 1, '2026-08-20', { today: '2026-08-25', forceRecompute: true })
    expect(recomputed).toBe(true)
    expect(store.saveAfpDailyPlan).toHaveBeenCalledTimes(1)
  })

  it('an existing day-specific override survives a same-day recompute', async () => {
    const store = fakeStore({
      getAfpDailyPlan: vi.fn(async () => ({ date: '2026-08-25', overrides: { calories: 2500 }, plan: {} })),
    })
    const { row } = await getOrComputeAfpPlan(store, 1, '2026-08-25', { today: '2026-08-25' })
    expect(row.plan.targets.calories).toBeGreaterThan(2500)
    expect(row.overrides).toEqual({ calories: 2500 })
  })

  it('does not write a new revision when the canonical input hash is unchanged', async () => {
    const store = fakeStore()
    const first = await getOrComputeAfpPlan(store, 1, '2026-08-25', { today: '2026-08-25' })
    store.getAfpDailyPlan.mockResolvedValue(first.row)
    const second = await getOrComputeAfpPlan(store, 1, '2026-08-25', { today: '2026-08-25' })
    expect(second.row).toEqual(first.row)
    expect(store.saveAfpDailyPlan).toHaveBeenCalledTimes(1)
  })

  it('fails closed for an unattested/incomplete profile without throwing', async () => {
    const store = fakeStore({ getAfpProfile: vi.fn(async () => ({})) })
    const { row } = await getOrComputeAfpPlan(store, 1, '2026-08-25', { today: '2026-08-25' })
    expect(row.plan.ok).toBe(false)
    expect(row.plan).toMatchObject({ code: 'missing_profile' })
    expect(row.plan.missing).toEqual(expect.arrayContaining(['weightKg', 'heightCm', 'ageYears']))
  })
})
