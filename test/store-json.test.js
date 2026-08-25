import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JsonStore, DEFAULT_PROFILE } from '../server/db.js'

// JsonStore behavioral contract tests. The JSON store is the dev fallback for
// PgStore and the two must behave identically (routes only ever see `store`).
// Every personal-data method now takes userId as its first argument — these
// tests exercise a single fixed test user throughout (USER), since none of
// them are about cross-user isolation.
const USER = 1
let dir

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-store-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('JsonStore persist() after a failed write', () => {
  it('writes normally on the healthy path (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const food = await s.createFood({ name: 'Oats' })
    expect(food.id).toBe(1)
    // The write really landed on disk, not just in memory.
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'store.json'), 'utf8'))
    expect(onDisk.foods).toHaveLength(1)
  })

  it('recovers once the cause of a failed write is gone (queue not poisoned)', async () => {
    const good = path.join(dir, 'store.json')
    const s = new JsonStore(good)
    await s.createFood({ name: 'Oats' }) // healthy first write

    // Force exactly one write failure: writeFile onto a directory path fails.
    s.file = dir
    await expect(s.createFood({ name: 'Bad write' })).rejects.toThrow()

    // The cause is gone — the next persist must succeed, not replay the old
    // rejection forever.
    s.file = good
    const food = await s.createFood({ name: 'Rice' })
    expect(food.name).toBe('Rice')
    const onDisk = JSON.parse(await fs.readFile(good, 'utf8'))
    expect(onDisk.foods.map((f) => f.name)).toContain('Rice')
  })
})

describe('JsonStore logged_at timestamps match PgStore timestamptz semantics', () => {
  const day = { from: '2026-08-24T00:00:00.000Z', to: '2026-08-25T00:00:00.000Z' }

  async function seeded() {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const food = await s.createFood({ name: 'Bread', calories: 100 })
    return { s, food }
  }

  it('includes an offset-timezone timestamp that falls inside the UTC range', async () => {
    const { s, food } = await seeded()
    // 2026-08-25T02:00:00+05:00 === 2026-08-24T21:00:00Z — inside the window.
    // Postgres compares it as a timestamptz and returns it; a raw string
    // comparison sorts it after "2026-08-25T00:00:00.000Z" and drops it.
    await s.addEntry(USER, { food_id: food.id, logged_at: '2026-08-25T02:00:00+05:00' })
    const rows = await s.listEntries(USER, day)
    expect(rows).toHaveLength(1)
    expect(rows[0].logged_at).toBe('2026-08-24T21:00:00.000Z')
  })

  it('still excludes a timestamp genuinely outside the range (control)', async () => {
    const { s, food } = await seeded()
    // 2026-08-25T06:00:00+05:00 === 2026-08-25T01:00:00Z — outside the window.
    await s.addEntry(USER, { food_id: food.id, logged_at: '2026-08-25T06:00:00+05:00' })
    expect(await s.listEntries(USER, day)).toHaveLength(0)
  })

  it('keeps an already-UTC timestamp byte-for-byte (control)', async () => {
    const { s, food } = await seeded()
    const e = await s.addEntry(USER, { food_id: food.id, logged_at: '2026-08-24T12:00:00.000Z' })
    expect(e.logged_at).toBe('2026-08-24T12:00:00.000Z')
    expect(await s.listEntries(USER, day)).toHaveLength(1)
  })

  it('normalizes an offset timestamp set through updateEntry too', async () => {
    const { s, food } = await seeded()
    const e = await s.addEntry(USER, { food_id: food.id, logged_at: '2026-08-24T12:00:00.000Z' })
    // 23:59 in UTC-4 is 03:59Z the next day — the entry must move out of the window.
    await s.updateEntry(USER, e.id, { logged_at: '2026-08-24T23:59:00-04:00' })
    expect(await s.listEntries(USER, day)).toHaveLength(0)
    const next = await s.listEntries(USER, { from: '2026-08-25T00:00:00.000Z', to: '2026-08-26T00:00:00.000Z' })
    expect(next).toHaveLength(1)
    expect(next[0].logged_at).toBe('2026-08-25T03:59:00.000Z')
  })
})

describe('JsonStore Oura readiness history (backfill)', () => {
  it('round-trips saved days through listOuraHistory, filtered by range', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveOuraHistory(USER, [
      { day: '2026-08-01', score: 70, total_calories: 2100, active_calories: 400, steps: 8000 },
      { day: '2026-08-02', score: 75, total_calories: 2200, active_calories: 500, steps: 9000 },
      { day: '2026-08-03', score: 68, total_calories: 2000, active_calories: 350, steps: 7000 },
    ])
    const all = await s.listOuraHistory(USER, '2026-08-01', '2026-08-03')
    expect(all.map((r) => r.day)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(all[0].value).toBe(70)

    const narrowed = await s.listOuraHistory(USER, '2026-08-02', '2026-08-02')
    expect(narrowed).toHaveLength(1)
    expect(narrowed[0].day).toBe('2026-08-02')
  })

  it('re-saving a day replaces it rather than duplicating (control: other days untouched)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveOuraHistory(USER, [{ day: '2026-08-01', score: 70 }, { day: '2026-08-02', score: 75 }])
    await s.saveOuraHistory(USER, [{ day: '2026-08-01', score: 91 }]) // re-backfill overlapping one day
    const all = await s.listOuraHistory(USER, '2026-08-01', '2026-08-02')
    expect(all).toHaveLength(2) // not 3 — the old 2026-08-01 row was replaced, not duplicated
    expect(all.find((r) => r.day === '2026-08-01').value).toBe(91)
    expect(all.find((r) => r.day === '2026-08-02').value).toBe(75) // untouched
  })

  it('skips a day with no score rather than storing a null (control: valid days still saved)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const n = await s.saveOuraHistory(USER, [
      { day: '2026-08-01', score: null, total_calories: 2000 }, // Oura had no score that day
      { day: '2026-08-02', score: 80 },
    ])
    expect(n).toBe(1)
    const all = await s.listOuraHistory(USER, '2026-08-01', '2026-08-02')
    expect(all.map((r) => r.day)).toEqual(['2026-08-02'])
  })
})

describe('JsonStore manual workout input', () => {
  it('returns null when nothing has been set for that day (never throws)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.getManualWorkout(USER, '2026-08-25')).toBeNull()
  })

  it('round-trips a saved workout, and carries its recorded_at back out', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const workout = { label: 'Evening Run', shortLabel: 'run', kind: 'run', time: '5:30 PM', startHour: 17.5, endHour: null, durationMin: null, estKcal: null, status: 'planned' }
    await s.setManualWorkout(USER, '2026-08-25', workout)
    const got = await s.getManualWorkout(USER, '2026-08-25')
    expect(got.kind).toBe('run')
    expect(got.startHour).toBe(17.5)
    expect(typeof got.recorded_at).toBe('string') // stamped at save time
  })

  it('re-setting the same day replaces it rather than duplicating (control: other days/users untouched)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.setManualWorkout(USER, '2026-08-25', { kind: 'run', startHour: 17.5 })
    await s.setManualWorkout(USER, '2026-08-25', { kind: 'ride', startHour: 8 })
    await s.setManualWorkout(USER, '2026-08-26', { kind: 'swim', startHour: 7 })
    await s.setManualWorkout(2, '2026-08-25', { kind: 'hike', startHour: 9 }) // a different user, same day
    expect((await s.getManualWorkout(USER, '2026-08-25')).kind).toBe('ride') // replaced, not both present
    expect((await s.getManualWorkout(USER, '2026-08-26')).kind).toBe('swim') // untouched
    expect((await s.getManualWorkout(2, '2026-08-25')).kind).toBe('hike') // untouched, other user's own row
  })

  it('clearManualWorkout removes it and reports whether anything was actually cleared', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.clearManualWorkout(USER, '2026-08-25')).toBe(false) // nothing to clear (control)
    await s.setManualWorkout(USER, '2026-08-25', { kind: 'run', startHour: 17.5 })
    expect(await s.clearManualWorkout(USER, '2026-08-25')).toBe(true)
    expect(await s.getManualWorkout(USER, '2026-08-25')).toBeNull()
  })
})

describe('JsonStore clearSyncedHistory (Connections "Delete synced history")', () => {
  it('removes Oura + Apple wearable_signals and Garmin dailies for the user, and reports how many', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveOuraHistory(USER, [{ day: '2026-08-20', score: 70 }])
    await s.replaceAppleSignals(USER, '2026-08-20', [
      { metric: 'steps', value: 5000, recorded_at: '2026-08-20T00:00:00.000Z', fetched_at: '2026-08-20T00:00:00.000Z' },
    ])
    const acct = await s.saveGarminAccount(USER, { access_token: 'a', refresh_token: 'b' })
    await s.upsertGarminDaily({ account_id: acct.id, day: '2026-08-20', total_calories: 2000, active_calories: 300, steps: 4000 })

    const removed = await s.clearSyncedHistory(USER)
    expect(removed).toBe(3) // 1 oura + 1 apple + 1 garmin daily

    expect(await s.listOuraHistory(USER, '2026-08-01', '2026-08-31')).toHaveLength(0)
    expect(await s.listAppleSignals(USER, '2026-08-20')).toHaveLength(0)
    expect(await s.getGarminDaily(acct.id, '2026-08-20')).toBeNull()
  })

  it('never removes a manually-typed workout — that is authored data, not synced from a wearable (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.setManualWorkout(USER, '2026-08-25', { kind: 'run', startHour: 17.5 })
    await s.saveOuraHistory(USER, [{ day: '2026-08-20', score: 70 }])
    await s.clearSyncedHistory(USER)
    expect((await s.getManualWorkout(USER, '2026-08-25')).kind).toBe('run')
  })

  it('never touches another user\'s synced records (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveOuraHistory(USER, [{ day: '2026-08-20', score: 70 }])
    await s.saveOuraHistory(2, [{ day: '2026-08-20', score: 60 }])
    const otherAcct = await s.saveGarminAccount(2, { access_token: 'x', refresh_token: 'y' })
    await s.upsertGarminDaily({ account_id: otherAcct.id, day: '2026-08-20', total_calories: 1800, active_calories: 200, steps: 3000 })

    await s.clearSyncedHistory(USER)

    expect(await s.listOuraHistory(2, '2026-08-01', '2026-08-31')).toHaveLength(1)
    expect(await s.getGarminDaily(otherAcct.id, '2026-08-20')).not.toBeNull()
  })

  it('returns 0 and does not throw when there is nothing to remove (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.clearSyncedHistory(USER)).toBe(0)
  })
})

describe('JsonStore hasTargets (onboarding gate)', () => {
  it('is false before anything is ever saved, even though getLatestTargets already returns a non-null default', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.hasTargets(USER)).toBe(false)
    // The exact fallback this test exists to distinguish from a real save.
    expect((await s.getLatestTargets(USER)).calories).toBe(2000)
  })

  it('flips to true the moment setTargets is called, and stays scoped to the one user (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.setTargets(USER, { calories: 1800 })
    expect(await s.hasTargets(USER)).toBe(true)
    expect(await s.hasTargets(2)).toBe(false) // a different user's onboarding is untouched
  })
})

describe('JsonStore biometric profile (singleton)', () => {
  it('returns the all-null default when nothing has been saved yet (never throws/404s)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.getProfile(USER)).toEqual(DEFAULT_PROFILE)
  })

  it('setProfile merges a patch into what is already stored — earlier fields survive', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.setProfile(USER, { height_cm: 180, weight_kg: 80 })
    const after = await s.setProfile(USER, { sex: 'male', age_years: 40 }) // a second, later field-by-field save
    expect(after).toMatchObject({ height_cm: 180, weight_kg: 80, sex: 'male', age_years: 40 })
  })

  it('sets updated_at itself on every save, ignoring any value the caller passes', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const saved = await s.setProfile(USER, { height_cm: 180, updated_at: '1999-01-01T00:00:00.000Z' })
    expect(saved.updated_at).not.toBe('1999-01-01T00:00:00.000Z')
    expect(new Date(saved.updated_at).toString()).not.toBe('Invalid Date')
  })

  it('persists to disk and round-trips through a fresh JsonStore instance', async () => {
    const file = path.join(dir, 'store.json')
    const s = new JsonStore(file)
    await s.setProfile(USER, { height_cm: 175, weight_kg: 70, sex: 'female', age_years: 33, activity_level: 'active', goal: 'endurance' })
    const reopened = new JsonStore(file)
    expect(await reopened.getProfile(USER)).toMatchObject({ height_cm: 175, weight_kg: 70, sex: 'female', age_years: 33, activity_level: 'active', goal: 'endurance' })
  })
})
