import { describe, it, expect } from 'vitest'
import { PgStore, aggregateWorkoutRows } from '../server/db.js'

// PgStore has no integration-test harness in this environment (no
// DATABASE_URL, never has had one — see docs/PRODUCTION-VERIFICATION-AUDIT.md).
// These tests stub `.sql` directly (constructor sets it, ready() short-circuits
// once it's already set) so error-HANDLING logic can be proven without a real
// Postgres connection. They cannot prove the SQL itself is correct — only that
// a given driver error is translated the way the code claims.
describe('PgStore.createUser — concurrent-duplicate-signup race', () => {
  it('translates a Postgres unique-violation (23505) into a clean 409, not a raw 500', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => { const e = new Error('duplicate key value violates unique constraint "users_email_key"'); e.code = '23505'; throw e }
    await expect(store.createUser({ email: 'dup@example.com', password_hash: 'x' }))
      .rejects.toMatchObject({ status: 409, message: 'An account with that email already exists.' })
  })

  it('never fabricates the 409 for an unrelated DB error (control)', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => { const e = new Error('connection terminated unexpectedly'); e.code = '57P01'; throw e }
    // Passes through untouched — a genuinely different failure must not be
    // reported to the caller as if it were the duplicate-email case.
    await expect(store.createUser({ email: 'x@example.com', password_hash: 'x' }))
      .rejects.toMatchObject({ code: '57P01', message: 'connection terminated unexpectedly' })
  })

  it('returns the inserted row on the healthy path (control)', async () => {
    const store = new PgStore('postgres://unused')
    const row = { id: 1, email: 'new@example.com', created_at: '2026-08-25T00:00:00.000Z' }
    store.sql = () => [row]
    await expect(store.createUser({ email: 'new@example.com', password_hash: 'x' })).resolves.toEqual(row)
  })
})

describe('PgStore alpha invitation redemption', () => {
  it('creates the user and durable redemption in one database transaction', async () => {
    const store = new PgStore('postgres://unused')
    const row = { id: 9, email: 'alpha@example.test', legal_version: 'v1', legal_accepted_at: '2026-08-31T00:00:00.000Z' }
    const sql = () => []
    sql.transaction = async (build) => {
      const queries = build((strings, ...params) => ({ text: strings.join('?'), params }))
      expect(queries).toHaveLength(2)
      expect(queries[0].text).toMatch(/not exists[\s\S]*alpha_invite_redemptions/i)
      expect(queries[1].text).toMatch(/insert into alpha_invite_redemptions/i)
      return [[row], [{ code_digest: 'digest' }]]
    }
    store.sql = sql
    await expect(store.createUser({ email: row.email, password_hash: 'hash', legal_version: 'v1', invite_code_digest: 'digest' })).resolves.toEqual(row)
  })

  it('returns the same generic invitation error when the durable ledger already contains the digest', async () => {
    const store = new PgStore('postgres://unused')
    const sql = () => []
    sql.transaction = async () => [[], []]
    store.sql = sql
    await expect(store.createUser({ email: 'other@example.test', password_hash: 'hash', invite_code_digest: 'used-digest' }))
      .rejects.toMatchObject({ status: 403, code: 'INVITE_UNAVAILABLE', message: 'This invitation is invalid or has already been used.' })
  })
})

describe('PgStore.acceptLegalVersion', () => {
  it('returns the updated user without exposing credential fields', async () => {
    const store = new PgStore('postgres://unused')
    const row = { id: 1, email: 'person@example.test', legal_version: 'v2', legal_accepted_at: '2026-08-31T00:00:00.000Z' }
    store.sql = () => [row]
    await expect(store.acceptLegalVersion(1, 'v2')).resolves.toEqual(row)
  })
})

describe('PgStore.listWeightEntries — manual vs. Apple-sync merge', () => {
  it('a manual entry wins over an Apple-synced reading for the same day, never both', async () => {
    const store = new PgStore('postgres://unused')
    // listWeightEntries issues [manualRows, appleRows] via Promise.all, in
    // that argument order — awaited in that same order regardless of which
    // underlying query settles first, so a call counter reliably identifies
    // "the manual query" (1st) vs. "the apple query" (2nd).
    let n = 0
    store.sql = () => {
      n++
      return n === 1 ? [{ day: '2026-08-20', value: '79.9' }] : [{ day: '2026-08-20', value: '78.4' }]
    }
    const rows = await store.listWeightEntries(1, '2026-08-01', '2026-08-31')
    expect(rows).toEqual([{ day: '2026-08-20', kg: 79.9, source: 'manual' }])
  })

  it('an Apple-only day (no manual entry) is attributed to apple (control)', async () => {
    const store = new PgStore('postgres://unused')
    let n = 0
    store.sql = () => { n++; return n === 1 ? [] : [{ day: '2026-08-20', value: '78.4' }] }
    const rows = await store.listWeightEntries(1, '2026-08-01', '2026-08-31')
    expect(rows).toEqual([{ day: '2026-08-20', kg: 78.4, source: 'apple' }])
  })
})

describe('PgStore.saveOuraWorkouts', () => {
  it('skips a workout with no id or day without issuing a query for it (control: a valid one alongside it still saves)', async () => {
    const store = new PgStore('postgres://unused')
    let calls = 0
    store.sql = () => { calls++; return [] }
    const n = await store.saveOuraWorkouts(1, [
      { day: '2026-08-24', activity: 'running' }, // no id
      { id: 'w1' }, // no day
      { id: 'w2', day: '2026-08-24', activity: 'cycling' }, // valid
    ])
    expect(n).toBe(1) // only the valid row counted
    expect(calls).toBe(1) // and only the valid row ever reached `sql`
  })

  it('returns 0 without querying when every workout is malformed (control)', async () => {
    const store = new PgStore('postgres://unused')
    let calls = 0
    store.sql = () => { calls++; return [] }
    const n = await store.saveOuraWorkouts(1, [{ activity: 'running' }])
    expect(n).toBe(0)
    expect(calls).toBe(0)
  })
})

// Same stub-only limits as above: this proves the JS aggregation over
// whatever rows the query returns, not the SQL text itself.
describe('PgStore.listAppleWorkoutHistory', () => {
  it('sums same-day workout minutes and counts sessions from the returned rows', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => [
      { day: '2026-08-20', value: { kind: 'run', duration_min: 30, est_kcal: 300 } },
      { day: '2026-08-20', value: { kind: 'strength', duration_min: 20, est_kcal: 150 } },
      { day: '2026-08-24', value: { kind: 'ride', duration_min: 45, est_kcal: 500 } },
    ]
    await expect(store.listAppleWorkoutHistory(1, '2026-08-01', '2026-08-31')).resolves.toEqual([
      { day: '2026-08-20', minutes: 50, sessions: 2 },
      { day: '2026-08-24', minutes: 45, sessions: 1 },
    ])
  })

  it('returns an empty array for no rows (control)', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => []
    await expect(store.listAppleWorkoutHistory(1, '2026-08-01', '2026-08-31')).resolves.toEqual([])
  })
})

// Same stub-only limits as PgStore.listAppleWorkoutHistory above: proves the
// method issues a delete-then-insert sequence (never an upsert-by-metric,
// never skipping the delete on a repeat call) — not that the SQL text itself
// is well-formed against a real database. This is what makes a replayed HAE
// automation POST for the same day naturally idempotent at the store layer
// (see test/api-routes.test.js's HAE idempotency test, and JsonStore's twin
// of this test in test/store-json.test.js — both backends must agree).
describe('PgStore.replaceAppleSignals — replace, not append (replay idempotency)', () => {
  it('issues one delete followed by one insert per row', async () => {
    const store = new PgStore('postgres://unused')
    const calls = []
    store.sql = (strings) => { calls.push(String(strings[0]).trim().toLowerCase()); return [] }
    const n = await store.replaceAppleSignals(1, '2026-08-20', [
      { metric: 'steps', value: 5000 },
      { metric: 'expenditure', value: 400 },
    ])
    expect(n).toBe(2)
    expect(calls[0].startsWith('delete')).toBe(true)
    expect(calls.slice(1).every((c) => c.startsWith('insert'))).toBe(true)
    expect(calls).toHaveLength(3) // 1 delete + 2 inserts, not 2 upserts
  })

  it('a second call for the same day issues its OWN delete first, every time — never skipped on a repeat', async () => {
    const store = new PgStore('postgres://unused')
    let deletes = 0
    let inserts = 0
    store.sql = (strings) => {
      const head = String(strings[0]).trim().toLowerCase()
      if (head.startsWith('delete')) deletes++
      else if (head.startsWith('insert')) inserts++
      return []
    }
    await store.replaceAppleSignals(1, '2026-08-20', [{ metric: 'steps', value: 5000 }])
    await store.replaceAppleSignals(1, '2026-08-20', [{ metric: 'steps', value: 5000 }])
    expect(deletes).toBe(2) // one delete per call, so the day is cleared before the replay's row lands
    expect(inserts).toBe(2) // 1 row inserted each call, never 1 then 2 (accumulating)
  })
})

describe('PgStore Adaptive Fuel Plan profile', () => {
  it('merge-saves atomically in one statement, preserving concurrent fields', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => {
      return [{ weight_kg: 70, height_cm: 175, age_years: 30 }]
    }
    const p = await store.setAfpProfile(1, { age_years: 30 })
    expect(p.age_years).toBe(30)
    expect(p.weight_kg).toBe(70) // carried over from the existing row, not clobbered
  })

  it('uses a first-save-safe INSERT ON CONFLICT partial update, never a snapshot-blind CTE', async () => {
    const store = new PgStore('postgres://unused')
    let statement = ''
    store.sql = (strings) => {
      statement = strings.join('?')
      return [{ user_id: 1, age_years: 30, plan_mode: 'automatic' }]
    }
    await expect(store.setAfpProfile(1, { age_years: 30 })).resolves.toMatchObject({ user_id: 1, age_years: 30 })
    expect(statement).toMatch(/insert into afp_profile as p/i)
    expect(statement).toMatch(/on conflict \(user_id\) do update/i)
    expect(statement).not.toMatch(/with ensured/i)
    expect(statement).toMatch(/case when \? then excluded\.age_years else p\.age_years end/i)
  })
})

describe('PgStore hydration log', () => {
  it('normalizes numeric output and scopes every read/mutation to the account', async () => {
    const store = new PgStore('postgres://unused')
    const statements = []
    store.sql = (strings) => {
      statements.push(strings.join('?'))
      return [{ id: 4, amount_ml: '500', logged_at: '2026-09-04T00:00:00.000Z' }]
    }
    await expect(store.listWaterEntries(7, { from: '2026-09-04T00:00:00.000Z', to: '2026-09-05T00:00:00.000Z' }))
      .resolves.toEqual([expect.objectContaining({ amount_ml: 500 })])
    await store.updateWaterEntry(7, 4, { amount_ml: 600 })
    await store.deleteWaterEntry(7, 4)
    expect(statements.every((text) => /user_id\s*=\s*\?/i.test(text))).toBe(true)
  })
})

describe('PgStore Adaptive Fuel Plan planned workouts', () => {
  it('an update with no matching (id, user_id) row returns null (control: isolation enforced in the WHERE clause)', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => [] // no row matched id+user_id
    const result = await store.savePlannedWorkout(2, { id: 7, date: '2026-08-25', sport: 'run', duration_min: 30, intensity: 'easy' })
    expect(result).toBeNull()
  })

  it('deletePlannedWorkout returns false when nothing matched (control)', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => []
    expect(await store.deletePlannedWorkout(2, 7)).toBe(false)
  })

  it('deletePlannedWorkout returns true when a row was actually removed', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => [{ id: 7 }]
    expect(await store.deletePlannedWorkout(1, 7)).toBe(true)
  })
})

describe('PgStore.deleteUser', () => {
  it('reports whether the account row was actually deleted', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => [{ id: 12 }]
    await expect(store.deleteUser(12)).resolves.toBe(true)
  })

  it('returns false for a missing account', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => []
    await expect(store.deleteUser(999)).resolves.toBe(false)
  })
})

describe('PgStore Adaptive Fuel Plan daily plan snapshots', () => {
  it('uses a hash-guarded upsert so identical concurrent inputs return the existing revision', async () => {
    const store = new PgStore('postgres://unused')
    let query = ''
    store.sql = (strings) => {
      query = Array.from(strings).join('?')
      return [{ user_id: 1, date: '2026-08-25', revision: 4, input_snapshot_hash: 'same-hash' }]
    }
    const row = await store.saveAfpDailyPlan(1, '2026-08-25', {
      engineVersion: 2, scienceVersion: 'afp-science-2026.1', inputSnapshot: {}, inputSnapshotHash: 'same-hash', plan: { ok: true },
    })
    expect(row.revision).toBe(4)
    expect(query).toMatch(/revision = afp_daily_plans\.revision \+ case when afp_daily_plans\.input_snapshot_hash is distinct from excluded\.input_snapshot_hash then 1 else 0 end/i)
    expect(query).toMatch(/returning \*/i)
  })

  it('setAfpDailyPlanOverrides returns null when no plan row exists for that day (control)', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => []
    expect(await store.setAfpDailyPlanOverrides(1, '2026-08-25', { calories: 2500 })).toBeNull()
  })

  it('setAfpDailyPlanOverrides returns the updated row when one exists', async () => {
    const store = new PgStore('postgres://unused')
    store.sql = () => [{ user_id: 1, date: '2026-08-25', overrides: { calories: 2500 }, plan: { targets: { calories: 2000 } } }]
    const r = await store.setAfpDailyPlanOverrides(1, '2026-08-25', { calories: 2500 })
    expect(r.overrides).toEqual({ calories: 2500 })
    expect(r.plan.targets.calories).toBe(2000)
  })
})

// aggregateWorkoutRows is the shared helper both PgStore and JsonStore call —
// unit-tested directly here since it carries the actual load-figure logic
// (both stores above are really just proving they wire it up).
describe('aggregateWorkoutRows', () => {
  it('treats a missing/non-finite duration_min as a zero-minute session, not a dropped one', () => {
    const rows = [
      { day: '2026-08-20', value: { kind: 'walk' } }, // no duration_min at all
      { day: '2026-08-20', value: { kind: 'run', duration_min: 'not-a-number' } },
      { day: '2026-08-20', value: { kind: 'ride', duration_min: 25 } },
    ]
    expect(aggregateWorkoutRows(rows)).toEqual([{ day: '2026-08-20', minutes: 25, sessions: 3 }])
  })

  it('skips a row with no day rather than grouping it under "undefined" (control)', () => {
    expect(aggregateWorkoutRows([{ value: { duration_min: 10 } }])).toEqual([])
  })
})
