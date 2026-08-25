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
