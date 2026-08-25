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
