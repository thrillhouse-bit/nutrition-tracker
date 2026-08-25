import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JsonStore, DEFAULT_AFP_PROFILE } from '../server/db.js'

const USER = 1
const OTHER = 2
let dir

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-afp-store-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

function store() {
  return new JsonStore(path.join(dir, 'store.json'))
}

describe('JsonStore Adaptive Fuel Plan profile', () => {
  it('returns the documented default shape before anything is saved (never a 404)', async () => {
    const s = store()
    expect(await s.getAfpProfile(USER)).toEqual(DEFAULT_AFP_PROFILE)
  })

  it('merge-saves a partial patch without clobbering fields already set', async () => {
    const s = store()
    await s.setAfpProfile(USER, { weight_kg: 70, height_cm: 175 })
    const p = await s.setAfpProfile(USER, { age_years: 30 })
    expect(p.weight_kg).toBe(70)
    expect(p.height_cm).toBe(175)
    expect(p.age_years).toBe(30)
    expect(p.updated_at).not.toBeNull()
  })

  it('keeps two users\' profiles fully separate (control: isolation)', async () => {
    const s = store()
    await s.setAfpProfile(USER, { weight_kg: 70 })
    await s.setAfpProfile(OTHER, { weight_kg: 90 })
    expect((await s.getAfpProfile(USER)).weight_kg).toBe(70)
    expect((await s.getAfpProfile(OTHER)).weight_kg).toBe(90)
  })

  it('server always sets updated_at — a caller-supplied value is ignored', async () => {
    const s = store()
    const p = await s.setAfpProfile(USER, { weight_kg: 70, updated_at: '2000-01-01T00:00:00.000Z' })
    expect(p.updated_at).not.toBe('2000-01-01T00:00:00.000Z')
  })
})

describe('JsonStore Adaptive Fuel Plan planned workouts', () => {
  it('creates a session with no id supplied, assigning one', async () => {
    const s = store()
    const row = await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', duration_min: 45, intensity: 'moderate' })
    expect(row.id).toBeDefined()
    expect(row.sport).toBe('run')
  })

  it('lists a day\'s sessions ordered by start_time, sessions with no start_time last', async () => {
    const s = store()
    await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'strength', duration_min: 30, intensity: 'moderate' })
    await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', start_time: '06:00', duration_min: 45, intensity: 'easy' })
    const rows = await s.getPlannedWorkoutsForDay(USER, '2026-08-25')
    expect(rows.map((r) => r.sport)).toEqual(['run', 'strength'])
  })

  it('lists across a date range in date order', async () => {
    const s = store()
    await s.savePlannedWorkout(USER, { date: '2026-08-26', sport: 'ride', duration_min: 60, intensity: 'moderate' })
    await s.savePlannedWorkout(USER, { date: '2026-08-24', sport: 'run', duration_min: 40, intensity: 'easy' })
    const rows = await s.listPlannedWorkouts(USER, '2026-08-01', '2026-08-31')
    expect(rows.map((r) => r.date)).toEqual(['2026-08-24', '2026-08-26'])
  })

  it('updates an existing session by id, in place (not a duplicate)', async () => {
    const s = store()
    const created = await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', duration_min: 30, intensity: 'easy' })
    const updated = await s.savePlannedWorkout(USER, { id: created.id, date: '2026-08-25', sport: 'run', duration_min: 60, intensity: 'hard' })
    expect(updated.duration_min).toBe(60)
    expect(updated.intensity).toBe('hard')
    const rows = await s.getPlannedWorkoutsForDay(USER, '2026-08-25')
    expect(rows).toHaveLength(1)
  })

  it('refuses to update a session belonging to a different user (returns null, no mutation)', async () => {
    const s = store()
    const created = await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', duration_min: 30, intensity: 'easy' })
    const result = await s.savePlannedWorkout(OTHER, { id: created.id, date: '2026-08-25', sport: 'ride', duration_min: 99, intensity: 'hard' })
    expect(result).toBeNull()
    const stillOwners = await s.getPlannedWorkoutsForDay(USER, '2026-08-25')
    expect(stillOwners[0].sport).toBe('run') // untouched
    expect(stillOwners[0].duration_min).toBe(30)
  })

  it('deletes a session the caller owns', async () => {
    const s = store()
    const created = await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', duration_min: 30, intensity: 'easy' })
    expect(await s.deletePlannedWorkout(USER, created.id)).toBe(true)
    expect(await s.getPlannedWorkoutsForDay(USER, '2026-08-25')).toEqual([])
  })

  it('refuses to delete another user\'s session (control: isolation)', async () => {
    const s = store()
    const created = await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', duration_min: 30, intensity: 'easy' })
    expect(await s.deletePlannedWorkout(OTHER, created.id)).toBe(false)
    expect(await s.getPlannedWorkoutsForDay(USER, '2026-08-25')).toHaveLength(1)
  })

  it('supports a double-session day: two sessions on the same date both persist', async () => {
    const s = store()
    await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', start_time: '06:00', duration_min: 40, intensity: 'easy', is_double_session: true })
    await s.savePlannedWorkout(USER, { date: '2026-08-25', sport: 'run', start_time: '17:00', duration_min: 50, intensity: 'moderate', is_double_session: true })
    expect(await s.getPlannedWorkoutsForDay(USER, '2026-08-25')).toHaveLength(2)
  })
})

describe('JsonStore Adaptive Fuel Plan daily plan snapshots', () => {
  it('returns null for a day with no saved plan (control)', async () => {
    const s = store()
    expect(await s.getAfpDailyPlan(USER, '2026-08-25')).toBeNull()
  })

  it('saves and retrieves a full snapshot', async () => {
    const s = store()
    const saved = await s.saveAfpDailyPlan(USER, '2026-08-25', {
      engineVersion: 1, inputSnapshot: { profile: { weightKg: 70 } }, plan: { targets: { calories: 2200 } },
    })
    expect(saved.engine_version).toBe(1)
    const fetched = await s.getAfpDailyPlan(USER, '2026-08-25')
    expect(fetched.plan.targets.calories).toBe(2200)
    expect(fetched.input_snapshot.profile.weightKg).toBe(70)
  })

  it('overwrites (not accumulates) on a re-save for the same day (today\'s live recompute path)', async () => {
    const s = store()
    await s.saveAfpDailyPlan(USER, '2026-08-25', { engineVersion: 1, inputSnapshot: {}, plan: { targets: { calories: 2000 } } })
    await s.saveAfpDailyPlan(USER, '2026-08-25', { engineVersion: 1, inputSnapshot: {}, plan: { targets: { calories: 2400 } } })
    const fetched = await s.getAfpDailyPlan(USER, '2026-08-25')
    expect(fetched.plan.targets.calories).toBe(2400)
  })

  it('keeps two users\' plans for the same date fully separate (control: isolation)', async () => {
    const s = store()
    await s.saveAfpDailyPlan(USER, '2026-08-25', { engineVersion: 1, inputSnapshot: {}, plan: { targets: { calories: 2000 } } })
    await s.saveAfpDailyPlan(OTHER, '2026-08-25', { engineVersion: 1, inputSnapshot: {}, plan: { targets: { calories: 3000 } } })
    expect((await s.getAfpDailyPlan(USER, '2026-08-25')).plan.targets.calories).toBe(2000)
    expect((await s.getAfpDailyPlan(OTHER, '2026-08-25')).plan.targets.calories).toBe(3000)
  })

  it('setAfpDailyPlanOverrides returns null when no plan exists yet for that day (control)', async () => {
    const s = store()
    expect(await s.setAfpDailyPlanOverrides(USER, '2026-08-25', { calories: 2500 })).toBeNull()
  })

  it('setAfpDailyPlanOverrides updates ONLY the overrides field, leaving the computed plan/snapshot untouched', async () => {
    const s = store()
    await s.saveAfpDailyPlan(USER, '2026-08-25', {
      engineVersion: 1, inputSnapshot: { profile: { weightKg: 70 } }, plan: { targets: { calories: 2000 } },
    })
    const updated = await s.setAfpDailyPlanOverrides(USER, '2026-08-25', { calories: 2600 })
    expect(updated.overrides).toEqual({ calories: 2600 })
    expect(updated.plan.targets.calories).toBe(2000) // the engine's own figure survives, unclobbered
    expect(updated.input_snapshot.profile.weightKg).toBe(70)
  })

  it('clearing overrides (passing null) removes them without touching the plan', async () => {
    const s = store()
    await s.saveAfpDailyPlan(USER, '2026-08-25', { engineVersion: 1, inputSnapshot: {}, plan: { targets: { calories: 2000 } }, overrides: { calories: 2600 } })
    const cleared = await s.setAfpDailyPlanOverrides(USER, '2026-08-25', null)
    expect(cleared.overrides).toBeNull()
    expect(cleared.plan.targets.calories).toBe(2000)
  })
})
