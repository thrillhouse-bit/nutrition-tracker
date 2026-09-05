// Run against a disposable local database with schema.sql already applied:
// PG_TEST_URL=postgres://... PG_TEST_DRIVER=/absolute/path/to/pg/lib/index.js node test/pg-release-integration.mjs
// This executes PgStore's actual parameterized SQL; only the Neon HTTP
// transport is replaced with a local pg transport. Never use a live database.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { PgStore } from '../server/db.js'

const url = new URL(process.env.PG_TEST_URL || 'http://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local PostgreSQL only')
assert.ok(process.env.PG_TEST_DRIVER, 'Provide an external pg driver; do not modify app dependencies')
const { default: pg } = await import(pathToFileURL(process.env.PG_TEST_DRIVER).href)
const pool = new pg.Pool({ connectionString: url.href, max: 12 })
const query = (strings, values) => ({ text: strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, ''), values })
const sql = async (strings, ...values) => (await pool.query(query(strings, values))).rows
sql.transaction = async (build) => {
  const connection = await pool.connect()
  try {
    await connection.query('begin')
    const queries = build((strings, ...values) => query(strings, values))
    const results = []
    for (const statement of queries) results.push((await connection.query(statement)).rows)
    await connection.query('commit')
    return results
  } catch (error) {
    await connection.query('rollback')
    throw error
  } finally { connection.release() }
}
const store = new PgStore(url.href)
store.sql = sql
const suffix = `${Date.now()}-${process.pid}`
const created = []
try {
  const user = await store.createUser({ email: `one-${suffix}@example.test`, password_hash: 'test-only' })
  const other = await store.createUser({ email: `two-${suffix}@example.test`, password_hash: 'test-only' })
  created.push(user.id, other.id)
  const first = await store.setAfpProfile(user.id, { plan_mode: 'manual', eligibility_attested: false, manual_targets: { calories: 2100, protein_g: 120, carbs_g: 250, fat_g: 69 } })
  assert.equal(first.plan_mode, 'manual')
  assert.equal(first.manual_targets.calories, 2100)
  await Promise.all([store.setAfpProfile(user.id, { has_ckd_or_renal_condition: true }), store.setAfpProfile(user.id, { weight_kg: 71 })])
  const merged = await store.getAfpProfile(user.id)
  assert.equal(merged.has_ckd_or_renal_condition, true)
  assert.equal(Number(merged.weight_kg), 71)
  await Promise.all([store.setProfile(user.id, { accent: 'ruby' }), store.setProfile(user.id, { height_cm: 177 })])
  assert.equal((await store.getProfile(user.id)).accent, 'ruby')
  assert.equal(Number((await store.getProfile(user.id)).height_cm), 177)
  const plan = { engineVersion: 1, scienceVersion: 'test', inputSnapshot: {}, inputSnapshotHash: 'same-hash', plan: { ok: true } }
  const saved = await Promise.all(Array.from({ length: 10 }, () => store.saveAfpDailyPlan(user.id, '2026-09-04', plan)))
  assert.ok(saved.every((row) => Number(row.revision) === 1))
  assert.equal(Number((await store.saveAfpDailyPlan(user.id, '2026-09-04', { ...plan, inputSnapshotHash: 'changed' })).revision), 2)
  const water = await store.addWaterEntry(user.id, { amount_ml: 250, logged_at: '2026-09-04T12:00:00Z' })
  const bounds = { from: '2026-09-04T00:00:00Z', to: '2026-09-05T00:00:00Z' }
  assert.equal((await store.listWaterEntries(user.id, bounds)).length, 1)
  assert.equal((await store.listWaterEntries(other.id, bounds)).length, 0)
  assert.equal(await store.updateWaterEntry(other.id, water.id, { amount_ml: 999 }), null)
  assert.equal(await store.deleteWaterEntry(other.id, water.id), false)
  assert.equal(Number((await store.updateWaterEntry(user.id, water.id, { amount_ml: 350 })).amount_ml), 350)
  assert.equal((await store.exportUserData(user.id)).hydration_logs.length, 1)
  assert.equal((await store.exportUserData(other.id)).hydration_logs.length, 0)
  const attempts = await Promise.allSettled([1, 2].map((n) => store.createUser({ email: `invite-${n}-${suffix}@example.test`, password_hash: 'test-only', invite_code_digest: `digest-${suffix}` })))
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(attempts.find((result) => result.status === 'rejected').reason.code, 'INVITE_UNAVAILABLE')
  const redeemed = attempts.find((result) => result.status === 'fulfilled').value
  await store.deleteUser(redeemed.id)
  await assert.rejects(() => store.createUser({ email: `reuse-${suffix}@example.test`, password_hash: 'test-only', invite_code_digest: `digest-${suffix}` }), { code: 'INVITE_UNAVAILABLE' })
  await store.deleteUser(user.id)
  assert.equal((await sql`select * from water_entries where user_id = ${user.id}`).length, 0)
  assert.equal((await sql`select * from afp_profile where user_id = ${user.id}`).length, 0)
  console.log('PASS: real PostgreSQL first profile save, concurrent partial patches, idempotent plan revision, hydration isolation/export/cascade, concurrent invite redemption and no reuse after deletion')
} finally {
  for (const id of created) await store.deleteUser(id)
  await pool.end()
}
