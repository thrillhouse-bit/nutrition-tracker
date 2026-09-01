import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JsonStore, DEFAULT_PROFILE } from '../server/db.js'
import { digestInviteCode } from '../server/alphaAccess.js'

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

describe('JsonStore alpha invitation redemption', () => {
  it('stores only a digest and allows exactly one concurrent claim', async () => {
    const file = path.join(dir, 'store.json')
    const s = new JsonStore(file)
    const plaintext = 'AlphaInvite01_abcdefghijklmnop'
    const digest = digestInviteCode(plaintext)
    const results = await Promise.allSettled([
      s.createUser({ email: 'alpha-one@example.test', password_hash: 'hash-one', legal_version: 'v1', invite_code_digest: digest }),
      s.createUser({ email: 'alpha-two@example.test', password_hash: 'hash-two', legal_version: 'v1', invite_code_digest: digest }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')[0].reason).toMatchObject({ status: 403, code: 'INVITE_UNAVAILABLE' })

    const raw = await fs.readFile(file, 'utf8')
    expect(raw).not.toContain(plaintext)
    const stored = JSON.parse(raw)
    expect(stored.alpha_invite_redemptions).toHaveLength(1)
    expect(stored.alpha_invite_redemptions[0].code_digest).toBe(digest)
  })

  it('does not make an invitation reusable after its account is deleted', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const digest = digestInviteCode('AlphaInvite02_abcdefghijklmnop')
    const user = await s.createUser({ email: 'alpha-delete@example.test', password_hash: 'hash', invite_code_digest: digest })
    await s.deleteUser(user.id)
    await expect(s.createUser({ email: 'alpha-reuse@example.test', password_hash: 'hash', invite_code_digest: digest }))
      .rejects.toMatchObject({ status: 403, code: 'INVITE_UNAVAILABLE' })
    const stored = JSON.parse(await fs.readFile(path.join(dir, 'store.json'), 'utf8'))
    expect(stored.alpha_invite_redemptions).toEqual([expect.objectContaining({ code_digest: digest, user_id: null })])
  })

  it('records current legal acceptance for an existing user', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const user = await s.createUser({ email: 'reconsent@example.test', password_hash: 'hash', legal_version: 'v1' })
    const accepted = await s.acceptLegalVersion(user.id, 'v2')
    expect(accepted).toMatchObject({ legal_version: 'v2' })
    expect(Date.parse(accepted.legal_accepted_at)).not.toBeNaN()
    expect(await s.getUserById(user.id)).toMatchObject({ legal_version: 'v2' })
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

  it('a re-run with a transient null for a day that scored before leaves the old score standing, not erased', async () => {
    // Regression for the production-verification audit (25 Aug 2026): the
    // first version of this method deleted EVERY requested day before
    // re-inserting, so a re-run that got a transient null for a day (Oura
    // rate-limited, a partial-outage response — the readiness endpoint still
    // returns an entry for every day in range, just with score: null) wiped
    // that day's previously-correct score and never put anything back.
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveOuraHistory(USER, [
      { day: '2026-08-01', score: 82 },
      { day: '2026-08-02', score: 75 }, // this is the day that will hiccup next run
      { day: '2026-08-03', score: 90 },
    ])
    const rerun = await s.saveOuraHistory(USER, [
      { day: '2026-08-01', score: 82 },
      { day: '2026-08-02', score: null }, // transient — NOT evidence the real value was wrong
      { day: '2026-08-03', score: 90 },
    ])
    expect(rerun).toBe(2) // only the two still-scored days were touched this run
    const all = await s.listOuraHistory(USER, '2026-08-01', '2026-08-03')
    expect(all.map((r) => r.day)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']) // 08-02 still present
    expect(all.find((r) => r.day === '2026-08-02').value).toBe(75) // and still its real score, not erased
  })
})

describe('JsonStore Oura workouts', () => {
  it('saves and lists workouts for a day, in start-time order', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const acct = await s.saveOuraAccount(USER, { access_token: 'a', refresh_token: 'b' })
    const n = await s.saveOuraWorkouts(acct.id, [
      { id: 'w2', day: '2026-08-24', activity: 'cycling', start_datetime: '2026-08-24T17:00:00+00:00' },
      { id: 'w1', day: '2026-08-24', activity: 'running', start_datetime: '2026-08-24T06:00:00+00:00' },
    ])
    expect(n).toBe(2)
    const rows = await s.listOuraWorkouts(acct.id, '2026-08-24')
    expect(rows.map((r) => r.oura_id)).toEqual(['w1', 'w2']) // earliest start first
  })

  it('re-saving the same oura_id upserts in place rather than duplicating (idempotent backfill re-run)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const acct = await s.saveOuraAccount(USER, { access_token: 'a', refresh_token: 'b' })
    await s.saveOuraWorkouts(acct.id, [{ id: 'w1', day: '2026-08-24', activity: 'running', calories: 400 }])
    // A re-run backfill (or Oura itself editing the workout) sends the same
    // id again, with a changed field.
    await s.saveOuraWorkouts(acct.id, [{ id: 'w1', day: '2026-08-24', activity: 'running', calories: 450 }])
    const rows = await s.listOuraWorkouts(acct.id, '2026-08-24')
    expect(rows).toHaveLength(1) // not 2 — same row, updated
    expect(rows[0].calories).toBe(450)
  })

  it('drops a workout with no id rather than storing it (nothing to dedupe on)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const acct = await s.saveOuraAccount(USER, { access_token: 'a', refresh_token: 'b' })
    const n = await s.saveOuraWorkouts(acct.id, [{ day: '2026-08-24', activity: 'running' }])
    expect(n).toBe(0)
    expect(await s.listOuraWorkouts(acct.id, '2026-08-24')).toEqual([])
  })

  it('keeps two different accounts\' workouts separate (control: cross-account isolation)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const acctA = await s.saveOuraAccount(USER, { access_token: 'a', refresh_token: 'b' })
    const acctB = await s.saveOuraAccount(2, { access_token: 'c', refresh_token: 'd' })
    await s.saveOuraWorkouts(acctA.id, [{ id: 'shared-id', day: '2026-08-24', activity: 'running' }])
    await s.saveOuraWorkouts(acctB.id, [{ id: 'shared-id', day: '2026-08-24', activity: 'cycling' }])
    expect((await s.listOuraWorkouts(acctA.id, '2026-08-24'))[0].activity).toBe('running')
    expect((await s.listOuraWorkouts(acctB.id, '2026-08-24'))[0].activity).toBe('cycling')
  })
})

describe('JsonStore Apple workout history (real training-load rows)', () => {
  // `duration_min`/`est_kcal` are the wire field names the iOS companion
  // actually sends (ios/Shared/HealthModel.swift's WorkoutValue.CodingKeys) —
  // these fixtures use the real shape, not a made-up one.
  it('sums same-day workout minutes and counts sessions, filtered by range', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [
      { metric: 'workout', value: { kind: 'run', duration_min: 30, est_kcal: 300, status: 'completed' } },
      { metric: 'workout', value: { kind: 'strength', duration_min: 20, est_kcal: 150, status: 'completed' } },
    ])
    await s.replaceAppleSignals(USER, '2026-08-24', [
      { metric: 'workout', value: { kind: 'ride', duration_min: 45, est_kcal: 500, status: 'completed' } },
    ])

    const all = await s.listAppleWorkoutHistory(USER, '2026-08-01', '2026-08-31')
    expect(all).toEqual([
      { day: '2026-08-20', minutes: 50, sessions: 2 },
      { day: '2026-08-24', minutes: 45, sessions: 1 },
    ])

    const narrowed = await s.listAppleWorkoutHistory(USER, '2026-08-21', '2026-08-31')
    expect(narrowed).toEqual([{ day: '2026-08-24', minutes: 45, sessions: 1 }])
  })

  it('counts a workout with no duration_min as a session without adding fabricated minutes (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [
      { metric: 'workout', value: { kind: 'walk', status: 'completed' } }, // no duration_min on this sample
    ])
    const all = await s.listAppleWorkoutHistory(USER, '2026-08-01', '2026-08-31')
    expect(all).toEqual([{ day: '2026-08-20', minutes: 0, sessions: 1 }])
  })

  it('ignores non-workout Apple signals on the same day (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [
      { metric: 'steps', value: 5000 },
      { metric: 'expenditure', value: 2000, extra: { active: 400 } },
    ])
    expect(await s.listAppleWorkoutHistory(USER, '2026-08-01', '2026-08-31')).toEqual([])
  })

  it('never mixes another user\'s workouts into the aggregate (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [{ metric: 'workout', value: { kind: 'run', duration_min: 30 } }])
    await s.replaceAppleSignals(2, '2026-08-20', [{ metric: 'workout', value: { kind: 'ride', duration_min: 90 } }])
    expect(await s.listAppleWorkoutHistory(USER, '2026-08-01', '2026-08-31')).toEqual([{ day: '2026-08-20', minutes: 30, sessions: 1 }])
    expect(await s.listAppleWorkoutHistory(2, '2026-08-01', '2026-08-31')).toEqual([{ day: '2026-08-20', minutes: 90, sessions: 1 }])
  })

  it('returns an empty array when nothing has synced (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.listAppleWorkoutHistory(USER, '2026-08-01', '2026-08-31')).toEqual([])
  })
})

describe('JsonStore.replaceAppleSignals — replace, not append (replay idempotency)', () => {
  // This is what makes a replayed HAE/native-companion POST for the same day
  // naturally idempotent (see test/api-routes.test.js's HAE idempotency
  // test) — the name says "replace", but only a test proves it actually
  // deletes the day's old rows first rather than accumulating them.
  it('calling it twice for the same day with the same rows does not double the stored count', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const rows = [
      { metric: 'steps', value: 5000 },
      { metric: 'expenditure', value: 400 },
    ]
    const n1 = await s.replaceAppleSignals(USER, '2026-08-20', rows)
    expect(n1).toBe(2)
    const n2 = await s.replaceAppleSignals(USER, '2026-08-20', rows)
    expect(n2).toBe(2)
    expect(await s.listAppleSignals(USER, '2026-08-20')).toHaveLength(2) // still 2, not 4
  })

  it('replacing a smaller set for a day actually shrinks it, not just adds to it (control proving delete, not upsert-by-metric)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [
      { metric: 'steps', value: 5000 },
      { metric: 'expenditure', value: 400 },
      { metric: 'hrv', value: 55 },
    ])
    await s.replaceAppleSignals(USER, '2026-08-20', [{ metric: 'steps', value: 6000 }])
    const stored = await s.listAppleSignals(USER, '2026-08-20')
    expect(stored).toHaveLength(1)
    expect(stored[0].value).toBe(6000)
  })

  it('never touches another day\'s rows for the same user (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-19', [{ metric: 'steps', value: 1111 }])
    await s.replaceAppleSignals(USER, '2026-08-20', [{ metric: 'steps', value: 2222 }])
    await s.replaceAppleSignals(USER, '2026-08-20', [{ metric: 'steps', value: 3333 }])
    expect((await s.listAppleSignals(USER, '2026-08-19'))[0].value).toBe(1111)
    expect((await s.listAppleSignals(USER, '2026-08-20'))[0].value).toBe(3333)
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

describe('JsonStore body weight log', () => {
  it('round-trips saved days through listWeightEntries, filtered by range', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveWeightEntry(USER, '2026-08-01', 80.2)
    await s.saveWeightEntry(USER, '2026-08-02', 79.8)
    await s.saveWeightEntry(USER, '2026-08-03', 80.5)
    const all = await s.listWeightEntries(USER, '2026-08-01', '2026-08-03')
    expect(all).toEqual([
      { day: '2026-08-01', kg: 80.2, source: 'manual' },
      { day: '2026-08-02', kg: 79.8, source: 'manual' },
      { day: '2026-08-03', kg: 80.5, source: 'manual' },
    ])
    const narrowed = await s.listWeightEntries(USER, '2026-08-02', '2026-08-02')
    expect(narrowed).toEqual([{ day: '2026-08-02', kg: 79.8, source: 'manual' }])
  })

  it('re-logging the same day replaces it rather than duplicating (control: other days untouched)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveWeightEntry(USER, '2026-08-01', 80)
    await s.saveWeightEntry(USER, '2026-08-02', 79)
    await s.saveWeightEntry(USER, '2026-08-01', 81.4) // corrected the same day's reading
    const all = await s.listWeightEntries(USER, '2026-08-01', '2026-08-02')
    expect(all).toHaveLength(2) // not 3
    expect(all.find((r) => r.day === '2026-08-01').kg).toBe(81.4)
    expect(all.find((r) => r.day === '2026-08-02').kg).toBe(79) // untouched
  })

  it('deleteWeightEntry removes it and reports whether anything was actually deleted', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    expect(await s.deleteWeightEntry(USER, '2026-08-01')).toBe(false) // nothing to delete (control)
    await s.saveWeightEntry(USER, '2026-08-01', 80)
    expect(await s.deleteWeightEntry(USER, '2026-08-01')).toBe(true)
    expect(await s.listWeightEntries(USER, '2026-08-01', '2026-08-01')).toEqual([])
  })

  it('never mixes another user\'s entries into a range query (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveWeightEntry(USER, '2026-08-01', 80)
    await s.saveWeightEntry(2, '2026-08-01', 65)
    expect(await s.listWeightEntries(USER, '2026-08-01', '2026-08-01')).toEqual([{ day: '2026-08-01', kg: 80, source: 'manual' }])
    expect(await s.listWeightEntries(2, '2026-08-01', '2026-08-01')).toEqual([{ day: '2026-08-01', kg: 65, source: 'manual' }])
  })
})

describe('JsonStore body weight log — merged with Apple Health sync', () => {
  const appleWeight = (day, kg) => ({
    metric: 'weight', value: kg, unit: 'kg',
    recorded_at: `${day}T08:00:00.000Z`, fetched_at: `${day}T08:00:00.000Z`,
  })

  it('an Apple-synced reading appears in the trend-weight window, attributed to apple', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [appleWeight('2026-08-20', 78.4)])
    const all = await s.listWeightEntries(USER, '2026-08-20', '2026-08-20')
    expect(all).toEqual([{ day: '2026-08-20', kg: 78.4, source: 'apple' }])
  })

  it('a manual entry for the same day wins over an Apple sync — not averaged, not both counted', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [appleWeight('2026-08-20', 78.4)])
    await s.saveWeightEntry(USER, '2026-08-20', 79.9) // the user corrects it by hand
    const all = await s.listWeightEntries(USER, '2026-08-20', '2026-08-20')
    expect(all).toHaveLength(1) // never both — that would double-count the day in the trend
    expect(all[0]).toEqual({ day: '2026-08-20', kg: 79.9, source: 'manual' })
  })

  it('order does not matter — a manual entry logged BEFORE a same-day Apple sync still wins (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveWeightEntry(USER, '2026-08-20', 79.9)
    await s.replaceAppleSignals(USER, '2026-08-20', [appleWeight('2026-08-20', 78.4)])
    const all = await s.listWeightEntries(USER, '2026-08-20', '2026-08-20')
    expect(all).toEqual([{ day: '2026-08-20', kg: 79.9, source: 'manual' }])
  })

  it('different days from each source both survive untouched (control: no cross-day interference)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveWeightEntry(USER, '2026-08-19', 80.0)
    await s.replaceAppleSignals(USER, '2026-08-20', [appleWeight('2026-08-20', 78.4)])
    const all = await s.listWeightEntries(USER, '2026-08-19', '2026-08-20')
    expect(all).toEqual([
      { day: '2026-08-19', kg: 80.0, source: 'manual' },
      { day: '2026-08-20', kg: 78.4, source: 'apple' },
    ])
  })

  it('deleting the manual entry lets that day\'s Apple sync show through, rather than leaving the day blank (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [appleWeight('2026-08-20', 78.4)])
    await s.saveWeightEntry(USER, '2026-08-20', 79.9)
    await s.deleteWeightEntry(USER, '2026-08-20')
    const all = await s.listWeightEntries(USER, '2026-08-20', '2026-08-20')
    expect(all).toEqual([{ day: '2026-08-20', kg: 78.4, source: 'apple' }]) // nothing lost — the apple reading was always there
  })

  it('"delete synced history" clears the Apple reading but leaves a manual entry on a different day untouched (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.replaceAppleSignals(USER, '2026-08-20', [appleWeight('2026-08-20', 78.4)])
    await s.saveWeightEntry(USER, '2026-08-21', 79.0)
    await s.clearSyncedHistory(USER)
    const all = await s.listWeightEntries(USER, '2026-08-19', '2026-08-22')
    expect(all).toEqual([{ day: '2026-08-21', kg: 79.0, source: 'manual' }])
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
    const ouraAcct = await s.saveOuraAccount(USER, { access_token: 'a', refresh_token: 'b' })
    await s.saveOuraWorkouts(ouraAcct.id, [{ id: 'w1', day: '2026-08-20', activity: 'running' }])

    const removed = await s.clearSyncedHistory(USER)
    expect(removed).toBe(4) // 1 oura readiness + 1 apple + 1 garmin daily + 1 oura workout

    expect(await s.listOuraHistory(USER, '2026-08-01', '2026-08-31')).toHaveLength(0)
    expect(await s.listAppleSignals(USER, '2026-08-20')).toHaveLength(0)
    expect(await s.getGarminDaily(acct.id, '2026-08-20')).toBeNull()
    expect(await s.listOuraWorkouts(ouraAcct.id, '2026-08-20')).toHaveLength(0)
  })

  it('never removes a manually-typed workout or logged weight — that is authored data, not synced from a wearable (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.setManualWorkout(USER, '2026-08-25', { kind: 'run', startHour: 17.5 })
    await s.saveWeightEntry(USER, '2026-08-25', 80)
    await s.saveOuraHistory(USER, [{ day: '2026-08-20', score: 70 }])
    await s.clearSyncedHistory(USER)
    expect((await s.getManualWorkout(USER, '2026-08-25')).kind).toBe('run')
    expect(await s.listWeightEntries(USER, '2026-08-25', '2026-08-25')).toEqual([{ day: '2026-08-25', kg: 80, source: 'manual' }])
  })

  it('never touches another user\'s synced records (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await s.saveOuraHistory(USER, [{ day: '2026-08-20', score: 70 }])
    await s.saveOuraHistory(2, [{ day: '2026-08-20', score: 60 }])
    const otherAcct = await s.saveGarminAccount(2, { access_token: 'x', refresh_token: 'y' })
    await s.upsertGarminDaily({ account_id: otherAcct.id, day: '2026-08-20', total_calories: 1800, active_calories: 200, steps: 3000 })
    const otherOuraAcct = await s.saveOuraAccount(2, { access_token: 'x', refresh_token: 'y' })
    await s.saveOuraWorkouts(otherOuraAcct.id, [{ id: 'w1', day: '2026-08-20', activity: 'running' }])

    await s.clearSyncedHistory(USER)

    expect(await s.listOuraHistory(2, '2026-08-01', '2026-08-31')).toHaveLength(1)
    expect(await s.getGarminDaily(otherAcct.id, '2026-08-20')).not.toBeNull()
    expect(await s.listOuraWorkouts(otherOuraAcct.id, '2026-08-20')).toHaveLength(1)
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

describe('JsonStore account export and hard deletion', () => {
  async function seededAccounts() {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const one = await s.createUser({ email: 'one@example.com', password_hash: 'hash-one', legal_version: 'v1' })
    const two = await s.createUser({ email: 'two@example.com', password_hash: 'hash-two', legal_version: 'v1' })
    const food = await s.createFood({ name: 'Shared oats', calories: 150, raw_api_response: { supplier: 'shared' } })
    await s.addEntry(one.id, { food_id: food.id, logged_at: '2026-08-20T12:00:00.000Z' })
    await s.addEntry(two.id, { food_id: food.id, logged_at: '2026-08-21T12:00:00.000Z' })
    await s.setTargets(one.id, { calories: 2100 })
    await s.setTargets(two.id, { calories: 1900 })
    await s.setProfile(one.id, { height_cm: 180 })
    await s.setProfile(two.id, { height_cm: 165 })
    await s.setIntegration(one.id, 'apple', { settings: { ingest_token: 'apple-secret-one', device: 'watch' } })
    await s.setIntegration(two.id, 'apple', { settings: { ingest_token: 'apple-secret-two', device: 'phone' } })
    const ouraOne = await s.saveOuraAccount(one.id, { access_token: 'oura-access-one', refresh_token: 'oura-refresh-one' })
    const ouraTwo = await s.saveOuraAccount(two.id, { access_token: 'oura-access-two', refresh_token: 'oura-refresh-two' })
    await s.saveOuraWorkouts(ouraOne.id, [{ id: 'one-workout', day: '2026-08-20', activity: 'running' }])
    await s.saveOuraWorkouts(ouraTwo.id, [{ id: 'two-workout', day: '2026-08-21', activity: 'cycling' }])
    const garminOne = await s.saveGarminAccount(one.id, { access_token: 'garmin-access-one', refresh_token: 'garmin-refresh-one', garmin_user_id: 'g-one' })
    const garminTwo = await s.saveGarminAccount(two.id, { access_token: 'garmin-access-two', refresh_token: 'garmin-refresh-two', garmin_user_id: 'g-two' })
    await s.upsertGarminDaily({ account_id: garminOne.id, day: '2026-08-20', steps: 10_000 })
    await s.upsertGarminDaily({ account_id: garminTwo.id, day: '2026-08-21', steps: 8_000 })
    await s.replaceAppleSignals(one.id, '2026-08-20', [{ metric: 'steps', value: 10_000 }])
    await s.replaceAppleSignals(two.id, '2026-08-21', [{ metric: 'steps', value: 8_000 }])
    await s.savePlan(one.id, '2026-08-20', { baseline: { calories: 2100 } })
    await s.savePlan(two.id, '2026-08-21', { baseline: { calories: 1900 } })
    await s.setAfpProfile(one.id, { weight_kg: 80 })
    await s.setAfpProfile(two.id, { weight_kg: 60 })
    await s.savePlannedWorkout(one.id, { date: '2026-08-20', sport: 'run', duration_min: 45, intensity: 'moderate' })
    await s.savePlannedWorkout(two.id, { date: '2026-08-21', sport: 'ride', duration_min: 60, intensity: 'easy' })
    await s.saveAfpDailyPlan(one.id, '2026-08-20', { engineVersion: 1, inputSnapshot: {}, plan: { target: 2100 } })
    await s.saveAfpDailyPlan(two.id, '2026-08-21', { engineVersion: 1, inputSnapshot: {}, plan: { target: 1900 } })
    return { s, one, two, food }
  }

  it('exports all account-owned categories without any credential/token keys or shared raw food cache', async () => {
    const { s, one } = await seededAccounts()
    const exported = await s.exportUserData(one.id)
    expect(exported.account.email).toBe('one@example.com')
    expect(exported.nutrition_logs).toHaveLength(1)
    expect(exported.wearable_data.oura_workouts[0].oura_id).toBe('one-workout')
    expect(exported.planning.workouts).toHaveLength(1)
    expect(exported.provider_connections.settings[0].settings).toEqual({ device: 'watch' })
    expect(exported.source_attribution.garmin).toBe('Garmin')

    const forbidden = new Set(['password_hash', 'access_token', 'refresh_token', 'ingest_token', 'raw_api_response'])
    const keys = []
    const visit = (value) => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) { keys.push(key); visit(child) }
    }
    visit(exported)
    expect(keys.filter((key) => forbidden.has(key))).toEqual([])
    expect(JSON.stringify(exported)).not.toContain('hash-one')
    expect(JSON.stringify(exported)).not.toContain('oura-access-one')
    expect(JSON.stringify(exported)).not.toContain('apple-secret-one')
  })

  it('deletes only one user and every owned record while preserving the other account and shared foods', async () => {
    const { s, one, two, food } = await seededAccounts()
    await expect(s.deleteUser(one.id)).resolves.toBe(true)
    expect(await s.getUserById(one.id)).toBeNull()
    expect(await s.getUserById(two.id)).toMatchObject({ email: 'two@example.com' })
    expect(await s.getFood(food.id)).toMatchObject({ name: 'Shared oats' })
    expect((await s.exportUserData(two.id)).nutrition_logs).toHaveLength(1)

    const disk = JSON.parse(await fs.readFile(path.join(dir, 'store.json'), 'utf8'))
    expect(disk.entries.some((row) => row.user_id === one.id)).toBe(false)
    expect(disk.targets.some((row) => row.user_id === one.id)).toBe(false)
    expect((disk.wearable_signals || []).some((row) => row.user_id === one.id)).toBe(false)
    expect((disk.planned_workouts || []).some((row) => row.user_id === one.id)).toBe(false)
    expect(Object.values(disk.integrations || {}).some((row) => row.user_id === one.id)).toBe(false)
    expect(Object.values(disk.daily_plans || {}).some((row) => row.user_id === one.id)).toBe(false)
    expect(Object.values(disk.afp_daily_plans || {}).some((row) => row.user_id === one.id)).toBe(false)
    expect(disk.foods).toHaveLength(1)
  })

  it('returns false without mutating the store when the user does not exist', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    await expect(s.deleteUser(999)).resolves.toBe(false)
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
