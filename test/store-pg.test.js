import { describe, it, expect } from 'vitest'
import { PgStore } from '../server/db.js'

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
