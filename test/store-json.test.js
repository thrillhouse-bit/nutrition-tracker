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

describe('JsonStore upsertFoodByBarcode', () => {
  it('creates a new row on the first lookup, reuses it on the second (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const first = await s.upsertFoodByBarcode({ barcode: '111', name: 'Oats' })
    const second = await s.upsertFoodByBarcode({ barcode: '111', name: 'Oats (different name, ignored)' })
    expect(second.id).toBe(first.id)
    expect(second.name).toBe('Oats') // the stored row wins, not the second caller's data
  })

  // Two concurrent scans of a barcode that's never been cached before — a
  // double-tap on the confirm screen, or the offline outbox replaying a
  // queued log at the same moment as a live re-scan. Before this fix, both
  // calls independently awaited getFoodByBarcode (saw "not found"), then
  // both awaited createFood, producing two rows sharing one barcode.
  it('does not create two rows when two upserts for the same new barcode race', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    // Pre-load so both calls skip disk I/O and race on pure microtask
    // scheduling instead — with a cold store, the first call's real
    // fs.readFile happens to serialize the two enough to mask the bug this
    // targets. Loaded first, it reproduces every run (verified against the
    // pre-fix code: 2 rows, mismatched ids).
    await s.load()
    const [a, b] = await Promise.all([
      s.upsertFoodByBarcode({ barcode: '222', name: 'Racer A' }),
      s.upsertFoodByBarcode({ barcode: '222', name: 'Racer B' }),
    ])
    expect(a.id).toBe(b.id)
    const data = await s.load()
    expect(data.foods.filter((f) => f.barcode === '222')).toHaveLength(1)
  })
})
