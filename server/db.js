// Storage layer with one interface and two backends:
//
//   • PgStore   — Neon Postgres, used whenever DATABASE_URL is set. This is the
//                 cross-device sync path (check your log from phone + laptop).
//   • JsonStore — a local JSON file, used when DATABASE_URL is absent. Dev-only
//                 fallback so the whole app (scan → log → today → history) works
//                 with no account/credentials. NOT for production or multi-device.
//
// Multi-user: every method that touches personal data takes `userId` as its
// first argument and every mutation VERIFIES the row it's changing actually
// belongs to that user before touching it — an id alone is never enough
// (guessing another user's entry/account id must not let you read or change
// it). `foods` stays global/unscoped: it's a shared nutrition lookup cache
// (barcode -> product data), not personal data, so there's nothing to
// isolate per user there.
//
// Routes only ever call the exported `store`, so swapping backends is invisible
// to them. If you want to force Neon-only, delete JsonStore and throw when
// DATABASE_URL is missing.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_TARGETS = {
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 65,
  fiber_g: 30,
  sugar_g: null,
  sodium_mg: 2300,
}

// Per-user biometric profile — this is the "nothing saved yet" shape, never a
// 404: the calculator UI needs somewhere to start from even before the user
// has typed anything.
export const DEFAULT_PROFILE = {
  height_cm: null,
  weight_kg: null,
  sex: null,
  age_years: null,
  units_pref: 'imperial',
  activity_level: null,
  goal: null,
  updated_at: null,
}

const FOOD_FIELDS = [
  'barcode', 'name', 'brand', 'serving_size', 'serving_unit',
  'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg',
  'source', 'raw_api_response',
]

function pickFood(f = {}) {
  const out = {}
  for (const k of FOOD_FIELDS) out[k] = f[k] ?? null
  if (!out.source) out.source = 'manual'
  return out
}

// Aggregates raw Apple `workout` wearable_signals rows into one row per day
// — shared by PgStore.listAppleWorkoutHistory and JsonStore's sibling below.
// Unlike Oura readiness (one score a day by construction — saveOuraHistory
// deletes-then-inserts per day), a day can carry more than one completed
// workout (see wearable_signals' own schema comment), and composeSignals's
// "today" signal only keeps the LAST one for the plan engine — a load
// HISTORY that did the same would silently undercount a two-workout day, so
// this sums across every row for the day instead.
//
// `duration_min` is the wire field name the iOS companion actually sends
// (ios/Shared/HealthModel.swift's WorkoutValue.CodingKeys, confirmed against
// a real HKWorkout's duration) — minutes of activity is the only load figure
// genuinely derivable from a stored workout row; HealthKit hands us no
// strain/intensity score, so this reports "minutes trained", never an
// invented composite "load" unit. A row with no duration_min still counts as
// a session (sessions is a real count of workouts logged that day) but
// contributes 0 minutes rather than being dropped or fabricated.
export function aggregateWorkoutRows(rows) {
  const byDay = new Map()
  for (const r of rows) {
    if (r.day == null) continue
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day, minutes: 0, sessions: 0 })
    const bucket = byDay.get(r.day)
    const mins = Number(r.value?.duration_min)
    if (Number.isFinite(mins) && mins > 0) bucket.minutes += mins
    bucket.sessions += 1
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
}

// --------------------------------------------------------------------------
// Neon Postgres backend
// --------------------------------------------------------------------------
// Exported (unlike before) so a test can construct one directly and stub
// `.sql` to exercise error-handling logic (e.g. createUser's unique-violation
// catch) without a real DATABASE_URL — this environment has never had one.
export class PgStore {
  constructor(url) {
    this.url = url
    this.sql = null
  }

  async ready() {
    if (this.sql) return this.sql
    const { neon } = await import('@neondatabase/serverless')
    this.sql = neon(this.url)
    return this.sql
  }

  // --- users -----------------------------------------------------------------
  // The signup route already checks getUserByEmail first, but that leaves a
  // real race: two concurrent signups for the same email can both pass that
  // check before either inserts. Without this catch, the loser hit Postgres's
  // raw unique-violation error (23505) — no `.status`, so it fell through to
  // asyncH's generic 500 handler, which both returned an unhelpful 500 to the
  // client instead of 409 AND logged the raw driver error (its `detail` field
  // embeds the offending email) server-side (production-verification audit,
  // 25 Aug 2026 — flagged as a residual risk; already a named open item in
  // docs/qa-qc-report.md). JsonStore's createUser already throws this same
  // clean 409 defensively; this brings PgStore to parity.
  async createUser({ email, password_hash }) {
    const sql = await this.ready()
    try {
      const rows = await sql`
        insert into users (email, password_hash)
        values (${email}, ${password_hash})
        returning id, email, created_at`
      return rows[0]
    } catch (err) {
      if (err.code === '23505') {
        const dup = new Error('An account with that email already exists.')
        dup.status = 409
        throw dup
      }
      throw err
    }
  }

  // Includes password_hash — only for verifying a login, never sent to a client.
  async getUserByEmail(email) {
    const sql = await this.ready()
    const rows = await sql`select * from users where email = ${email} limit 1`
    return rows[0] || null
  }

  async getUserById(id) {
    const sql = await this.ready()
    const rows = await sql`select id, email, created_at from users where id = ${id} limit 1`
    return rows[0] || null
  }

  async countUsers() {
    const sql = await this.ready()
    const rows = await sql`select count(*)::int as n from users`
    return rows[0]?.n ?? 0
  }

  // The sole user's id, or null if there isn't exactly one — used only for
  // the legacy single-shared-token Apple ingest fallback (see index.js),
  // which can't identify a user beyond "there's only one it could be".
  async getSoleUserId() {
    const sql = await this.ready()
    const rows = await sql`select id from users limit 2`
    return rows.length === 1 ? rows[0].id : null
  }

  // Apple's companion has no session cookie, so it authenticates with a
  // per-user token stashed in integrations.apple.settings.ingest_token (set
  // by POST /api/apple/token) — this is the reverse lookup an incoming
  // ingest POST needs to find whose data it's carrying.
  async findUserIdByAppleIngestToken(token) {
    const sql = await this.ready()
    const rows = await sql`select user_id from integrations where provider = 'apple' and settings ->> 'ingest_token' = ${token} limit 1`
    return rows[0]?.user_id ?? null
  }

  // --- foods (global product cache — not user data) ---------------------------
  async getFoodByBarcode(barcode) {
    const sql = await this.ready()
    const rows = await sql`select * from foods where barcode = ${barcode} limit 1`
    return rows[0] || null
  }

  async getFood(id) {
    const sql = await this.ready()
    const rows = await sql`select * from foods where id = ${id} limit 1`
    return rows[0] || null
  }

  async createFood(food) {
    const sql = await this.ready()
    const f = pickFood(food)
    const rows = await sql`
      insert into foods
        (barcode, name, brand, serving_size, serving_unit, calories, protein_g,
         carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source, raw_api_response)
      values
        (${f.barcode}, ${f.name}, ${f.brand}, ${f.serving_size}, ${f.serving_unit},
         ${f.calories}, ${f.protein_g}, ${f.carbs_g}, ${f.fat_g}, ${f.fiber_g},
         ${f.sugar_g}, ${f.sodium_mg}, ${f.source},
         ${f.raw_api_response ? JSON.stringify(f.raw_api_response) : null})
      returning *`
    return rows[0]
  }

  // Cache a looked-up product so repeat scans skip the API. Barcode is unique;
  // on conflict we return the row already stored. Uses a single atomic
  // INSERT ... ON CONFLICT DO NOTHING rather than a separate check-then-
  // insert — two concurrent lookups for a brand-new barcode (a double-tap
  // logging the same scan, or the offline outbox replaying a queued entry
  // at the same moment as a live re-scan) would otherwise both see "not
  // found" and both try to insert, and the loser would crash on the
  // schema's unique constraint instead of just getting the winner's row.
  async upsertFoodByBarcode(food) {
    if (!food.barcode) return this.createFood(food)
    const sql = await this.ready()
    const f = pickFood(food)
    const rows = await sql`
      insert into foods
        (barcode, name, brand, serving_size, serving_unit, calories, protein_g,
         carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source, raw_api_response)
      values
        (${f.barcode}, ${f.name}, ${f.brand}, ${f.serving_size}, ${f.serving_unit},
         ${f.calories}, ${f.protein_g}, ${f.carbs_g}, ${f.fat_g}, ${f.fiber_g},
         ${f.sugar_g}, ${f.sodium_mg}, ${f.source},
         ${f.raw_api_response ? JSON.stringify(f.raw_api_response) : null})
      on conflict (barcode) do nothing
      returning *`
    if (rows[0]) return rows[0]
    // Lost the race — a concurrent insert already claimed this barcode.
    return this.getFoodByBarcode(food.barcode)
  }

  // --- log entries (user-owned) -----------------------------------------------
  async listEntries(userId, { from, to }) {
    const sql = await this.ready()
    return sql`
      select e.id, e.food_id, e.logged_at, e.servings_consumed, e.meal,
             row_to_json(f) as food
      from log_entries e
      join foods f on f.id = e.food_id
      where e.user_id = ${userId} and e.logged_at >= ${from} and e.logged_at < ${to}
      order by e.logged_at asc`
  }

  async addEntry(userId, { food_id, servings_consumed = 1, meal = null, logged_at = null }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into log_entries (user_id, food_id, servings_consumed, meal, logged_at)
      values (${userId}, ${food_id}, ${servings_consumed}, ${meal},
              coalesce(${logged_at}::timestamptz, now()))
      returning id`
    return this.getEntry(userId, rows[0].id)
  }

  // Scoped by user_id so this can never return another user's entry even if
  // they guess a valid id.
  async getEntry(userId, id) {
    const sql = await this.ready()
    const rows = await sql`
      select e.id, e.food_id, e.logged_at, e.servings_consumed, e.meal,
             row_to_json(f) as food
      from log_entries e join foods f on f.id = e.food_id
      where e.id = ${id} and e.user_id = ${userId} limit 1`
    return rows[0] || null
  }

  async updateEntry(userId, id, patch) {
    const sql = await this.ready()
    // Only servings / meal / logged_at are user-editable on an entry.
    const cur = await this.getEntry(userId, id)
    if (!cur) return null // not found, or owned by someone else — same response either way
    const servings = patch.servings_consumed ?? cur.servings_consumed
    const meal = patch.meal !== undefined ? patch.meal : cur.meal
    const loggedAt = patch.logged_at ?? cur.logged_at
    await sql`
      update log_entries
      set servings_consumed = ${servings}, meal = ${meal}, logged_at = ${loggedAt}
      where id = ${id} and user_id = ${userId}`
    return this.getEntry(userId, id)
  }

  async deleteEntry(userId, id) {
    const sql = await this.ready()
    const rows = await sql`delete from log_entries where id = ${id} and user_id = ${userId} returning id`
    return rows.length > 0
  }

  // Distinct foods you've logged before, most-recently-logged first, with how
  // many times each was logged — powers one-tap re-logging.
  async recentFoods(userId, limit = 20) {
    const sql = await this.ready()
    return sql`
      select f.*, max(e.logged_at) as last_logged, count(*)::int as times_logged
      from log_entries e
      join foods f on f.id = e.food_id
      where e.user_id = ${userId}
      group by f.id
      order by max(e.logged_at) desc
      limit ${limit}`
  }

  // --- daily targets (versioned, per user) ------------------------------------
  async getLatestTargets(userId) {
    const sql = await this.ready()
    const rows = await sql`
      select * from daily_targets where user_id = ${userId}
      order by effective_from desc, id desc limit 1`
    return rows[0] || { ...DEFAULT_TARGETS }
  }

  async setTargets(userId, t) {
    const sql = await this.ready()
    const m = { ...DEFAULT_TARGETS, ...t }
    const rows = await sql`
      insert into daily_targets
        (user_id, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg)
      values (${userId}, ${m.calories}, ${m.protein_g}, ${m.carbs_g}, ${m.fat_g},
              ${m.fiber_g}, ${m.sugar_g}, ${m.sodium_mg})
      returning *`
    return rows[0]
  }

  // See JsonStore's sibling method for why this exists separately from
  // getLatestTargets, which always returns a non-null default.
  async hasTargets(userId) {
    const sql = await this.ready()
    const rows = await sql`select 1 from daily_targets where user_id = ${userId} limit 1`
    return rows.length > 0
  }

  // --- biometric profile (one row per user, user_id IS the primary key) ------
  async getProfile(userId) {
    const sql = await this.ready()
    const rows = await sql`
      select height_cm, weight_kg, sex, age_years, units_pref, activity_level, goal, updated_at
      from profile where user_id = ${userId} limit 1`
    return rows[0] || { ...DEFAULT_PROFILE }
  }

  // Merges the patch into whatever's stored — a user filling the form field
  // by field must not lose earlier fields. updated_at is always server-set,
  // never taken from the caller.
  async setProfile(userId, patch) {
    const sql = await this.ready()
    const m = { ...(await this.getProfile(userId)), ...patch }
    const rows = await sql`
      insert into profile (user_id, height_cm, weight_kg, sex, age_years, units_pref, activity_level, goal, updated_at)
      values (${userId}, ${m.height_cm}, ${m.weight_kg}, ${m.sex}, ${m.age_years}, ${m.units_pref}, ${m.activity_level}, ${m.goal}, now())
      on conflict (user_id) do update set
        height_cm = excluded.height_cm, weight_kg = excluded.weight_kg, sex = excluded.sex,
        age_years = excluded.age_years, units_pref = excluded.units_pref,
        activity_level = excluded.activity_level, goal = excluded.goal, updated_at = excluded.updated_at
      returning height_cm, weight_kg, sex, age_years, units_pref, activity_level, goal, updated_at`
    return rows[0]
  }

  // --- Oura OAuth accounts (per user). Tokens are stored so the server can
  // fetch and refresh; never exposed to the client.
  async listOuraAccounts(userId) {
    const sql = await this.ready()
    return sql`select * from oura_accounts where user_id = ${userId} order by id asc`
  }

  // Every connected Oura account, across every user — for the scheduled
  // re-sync pass (server/index.js), which has no single user in context.
  async listAllOuraAccounts() {
    const sql = await this.ready()
    return sql`select * from oura_accounts order by user_id asc, id asc`
  }

  async saveOuraAccount(userId, { label, access_token, refresh_token, expires_at }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into oura_accounts (user_id, label, access_token, refresh_token, expires_at)
      values (${userId}, ${label}, ${access_token}, ${refresh_token}, ${expires_at})
      returning *`
    return rows[0]
  }

  async updateOuraTokens(userId, id, { access_token, refresh_token, expires_at }) {
    const sql = await this.ready()
    await sql`
      update oura_accounts
      set access_token = ${access_token}, refresh_token = ${refresh_token}, expires_at = ${expires_at}
      where id = ${id} and user_id = ${userId}`
  }

  async deleteOuraAccount(userId, id) {
    const sql = await this.ready()
    const rows = await sql`delete from oura_accounts where id = ${id} and user_id = ${userId} returning id`
    return rows.length > 0
  }

  // --- Garmin OAuth accounts (per user) + pushed daily summaries (Garmin's
  // model is webhook push, so we store what it sends and serve `summary` from
  // the store). garmin_user_id is GARMIN's own opaque id for the connected
  // account (fetched right after token exchange — see integrations/garmin.js)
  // so an incoming webhook push, which carries no session of ours, can still
  // be routed to the right local user.
  async listGarminAccounts(userId) {
    const sql = await this.ready()
    return sql`select * from garmin_accounts where user_id = ${userId} order by id asc`
  }

  async saveGarminAccount(userId, { label, access_token, refresh_token, expires_at, garmin_user_id }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into garmin_accounts (user_id, label, access_token, refresh_token, expires_at, garmin_user_id)
      values (${userId}, ${label}, ${access_token}, ${refresh_token}, ${expires_at}, ${garmin_user_id || null})
      returning *`
    return rows[0]
  }

  async findGarminAccountByGarminUserId(garminUserId) {
    const sql = await this.ready()
    const rows = await sql`select * from garmin_accounts where garmin_user_id = ${garminUserId} limit 1`
    return rows[0] || null
  }

  async updateGarminTokens(userId, id, { access_token, refresh_token, expires_at }) {
    const sql = await this.ready()
    await sql`
      update garmin_accounts
      set access_token = ${access_token}, refresh_token = ${refresh_token}, expires_at = ${expires_at}
      where id = ${id} and user_id = ${userId}`
  }

  async deleteGarminAccount(userId, id) {
    const sql = await this.ready()
    const rows = await sql`delete from garmin_accounts where id = ${id} and user_id = ${userId} returning id`
    return rows.length > 0
  }

  // account_id already transitively scopes this to one user's account (the
  // webhook resolves account_id via garmin_user_id before calling this), so
  // no separate userId parameter here.
  async upsertGarminDaily({ account_id, day, total_calories, active_calories, steps, raw }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into garmin_dailies (account_id, day, total_calories, active_calories, steps, raw)
      values (${account_id}, ${day}, ${total_calories}, ${active_calories}, ${steps},
              ${raw ? JSON.stringify(raw) : null})
      on conflict (account_id, day) do update set
        total_calories = excluded.total_calories,
        active_calories = excluded.active_calories,
        steps = excluded.steps,
        raw = excluded.raw
      returning *`
    return rows[0]
  }

  async getGarminDaily(account_id, day) {
    const sql = await this.ready()
    const rows = await sql`select * from garmin_dailies where account_id = ${account_id} and day = ${day} limit 1`
    return rows[0] || null
  }

  // --- integrations (per user per provider status/settings) -------------------
  async getIntegration(userId, provider) {
    const sql = await this.ready()
    const rows = await sql`select * from integrations where user_id = ${userId} and provider = ${provider} limit 1`
    return rows[0] || { user_id: userId, provider, enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} }
  }

  async setIntegration(userId, provider, patch) {
    const sql = await this.ready()
    const m = { ...(await this.getIntegration(userId, provider)), ...patch }
    const rows = await sql`
      insert into integrations (user_id, provider, enabled, demo, connected_at, last_synced_at, error, settings)
      values (${userId}, ${provider}, ${m.enabled}, ${m.demo}, ${m.connected_at}, ${m.last_synced_at}, ${m.error}, ${JSON.stringify(m.settings || {})})
      on conflict (user_id, provider) do update set
        enabled = excluded.enabled, demo = excluded.demo, connected_at = excluded.connected_at,
        last_synced_at = excluded.last_synced_at, error = excluded.error, settings = excluded.settings
      returning *`
    return rows[0]
  }

  // --- Apple Health signals (per user, ingested by a native companion) -------
  async listAppleSignals(userId, day) {
    const sql = await this.ready()
    return sql`select provider, metric, recorded_at, fetched_at, value, unit, extra from wearable_signals where user_id = ${userId} and provider = 'apple' and day = ${day}`
  }

  async replaceAppleSignals(userId, day, rows) {
    const sql = await this.ready()
    await sql`delete from wearable_signals where user_id = ${userId} and provider = 'apple' and day = ${day}`
    for (const r of rows) {
      await sql`insert into wearable_signals (user_id, provider, metric, day, recorded_at, fetched_at, value, unit, extra)
        values (${userId}, 'apple', ${r.metric}, ${day}, ${r.recorded_at}, ${r.fetched_at}, ${JSON.stringify(r.value ?? null)}, ${r.unit || null}, ${r.extra ? JSON.stringify(r.extra) : null})`
    }
    return rows.length
  }

  // Real per-day training-load history for Insights' Training Load chart —
  // ranged like listOuraHistory below, but a day can hold more than one
  // completed workout, so the rows are aggregated (see aggregateWorkoutRows
  // above) rather than returned one-per-day the way readiness rows are.
  async listAppleWorkoutHistory(userId, fromYmd, toYmd) {
    const sql = await this.ready()
    const rows = await sql`select day, value from wearable_signals where user_id = ${userId} and provider = 'apple' and metric = 'workout' and day between ${fromYmd} and ${toYmd} order by day`
    return aggregateWorkoutRows(rows)
  }

  // --- Manual workout input (per user per day) --------------------------------
  // No new table: wearable_signals already models "one signal, one provider,
  // one day" — provider='manual' fits exactly, no schema change needed. This
  // is how a user without a connected wearable still gets a real (non-demo)
  // workout signal into the SAME composeSignals pipeline every other
  // provider feeds — see providers.js.
  async getManualWorkout(userId, day) {
    const sql = await this.ready()
    const rows = await sql`select value, recorded_at from wearable_signals where user_id = ${userId} and provider = 'manual' and metric = 'workout' and day = ${day} limit 1`
    return rows[0] ? { ...rows[0].value, recorded_at: rows[0].recorded_at } : null
  }

  async setManualWorkout(userId, day, workout) {
    const sql = await this.ready()
    const nowIso = new Date().toISOString()
    await sql`delete from wearable_signals where user_id = ${userId} and provider = 'manual' and metric = 'workout' and day = ${day}`
    await sql`insert into wearable_signals (user_id, provider, metric, day, recorded_at, fetched_at, value)
      values (${userId}, 'manual', 'workout', ${day}, ${nowIso}, ${nowIso}, ${JSON.stringify(workout)})`
    return workout
  }

  async clearManualWorkout(userId, day) {
    const sql = await this.ready()
    const rows = await sql`delete from wearable_signals where user_id = ${userId} and provider = 'manual' and metric = 'workout' and day = ${day} returning day`
    return rows.length > 0
  }

  // --- Oura readiness history (backfilled once after connect, per user;
  // wearable_signals was designed to hold "any provider we persist rather
  // than fetch live", per its own schema comment — reused here rather than a
  // parallel table.
  async saveOuraHistory(userId, rows) {
    const sql = await this.ready()
    // Only touch days that actually have a score this run. A re-run backfill
    // can get a transient null for a day that scored fine before (Oura
    // rate-limited, a partial-outage response — the readiness endpoint still
    // returns an entry for every day in range, just with score: null); if
    // every requested day were deleted first regardless of whether the new
    // row has a score, a re-run during exactly that hiccup would silently
    // erase a previously-correct value instead of leaving it alone. Proven
    // live 25 Aug 2026 (production-verification audit): a second backfill
    // with 08-02 flipped to score:null deleted 08-02's real 75 and never put
    // anything back. Days with no score this run are left untouched, not
    // deleted — whatever was already stored (from an earlier successful run,
    // or nothing) stands.
    const scoredDays = [...new Set(rows.filter((r) => r.day != null && r.score != null).map((r) => r.day))]
    for (const day of scoredDays) {
      await sql`delete from wearable_signals where user_id = ${userId} and provider = 'oura' and metric = 'readiness' and day = ${day}`
    }
    let n = 0
    for (const r of rows) {
      if (r.day == null || r.score == null) continue // nothing to show without a score
      // extra also carries readiness's own contributors/temperature fields
      // (the audit's named three: hrv_balance, resting_heart_rate,
      // body_temperature — contributor SCORES, never relabeled as raw
      // biometrics — plus the genuinely raw temperature_deviation/
      // temperature_trend_deviation in °C) and the day's sleep_score
      // (daily_sleep's 0-100 quality score, a different Oura endpoint from
      // the sleep-DURATION signal) — all fetched in the same backfill sweep
      // as the readiness score this row is keyed on, same reasoning as
      // steps/calories already being here.
      const extra = {
        total_calories: r.total_calories, active_calories: r.active_calories, steps: r.steps,
        contributors: r.contributors || null,
        temperature_deviation: r.temperature_deviation ?? null,
        temperature_trend_deviation: r.temperature_trend_deviation ?? null,
        sleep_score: r.sleep_score ?? null,
      }
      await sql`insert into wearable_signals (user_id, provider, metric, day, recorded_at, fetched_at, value, unit, extra)
        values (${userId}, 'oura', 'readiness', ${r.day}, ${`${r.day}T12:00:00.000Z`}, ${new Date().toISOString()}, ${JSON.stringify(r.score)}, 'score', ${JSON.stringify(extra)})`
      n++
    }
    return n
  }

  // `extra` carries the steps/total_calories/active_calories/contributors/
  // temperature/sleep_score snapshot saved alongside each day's readiness
  // score (see saveOuraHistory) — selected here too so this matches
  // JsonStore's return shape, which returns the whole stored row. GET
  // /api/profile/activity-suggestion reads extra.steps; narrowing this
  // select to day/value only would silently starve it on the Postgres
  // backend while JsonStore kept working (the exact PgStore/JsonStore drift
  // shape this codebase has been bitten by before).
  async listOuraHistory(userId, fromYmd, toYmd) {
    const sql = await this.ready()
    return sql`select day, value, extra from wearable_signals where user_id = ${userId} and provider = 'oura' and metric = 'readiness' and day between ${fromYmd} and ${toYmd} order by day`
  }

  // --- Oura workouts (per connected account, see schema.sql's oura_workouts
  // comment) — upserted on (account_id, oura_id) so a re-run backfill or an
  // Oura-side edit updates the same row instead of duplicating it. Returns
  // the count actually saved, matching saveOuraHistory's return shape.
  async saveOuraWorkouts(accountId, workouts) {
    const sql = await this.ready()
    let n = 0
    for (const w of workouts) {
      if (w.id == null || w.day == null) continue
      await sql`
        insert into oura_workouts (account_id, oura_id, day, activity, intensity, source, label, calories, distance, start_datetime, end_datetime, raw)
        values (${accountId}, ${w.id}, ${w.day}, ${w.activity}, ${w.intensity}, ${w.source}, ${w.label},
                ${w.calories}, ${w.distance}, ${w.start_datetime}, ${w.end_datetime}, ${JSON.stringify(w)})
        on conflict (account_id, oura_id) do update set
          day = excluded.day, activity = excluded.activity, intensity = excluded.intensity,
          source = excluded.source, label = excluded.label, calories = excluded.calories,
          distance = excluded.distance, start_datetime = excluded.start_datetime,
          end_datetime = excluded.end_datetime, raw = excluded.raw`
      n++
    }
    return n
  }

  // Every workout attributed to `day` for one account, earliest start first
  // — composeSignals picks the first as the day's primary workout signal
  // (matching the single-workout-per-day shape every other provider's
  // `workout` slot already assumes), but all of them are retained here for
  // a future multi-workout view.
  async listOuraWorkouts(accountId, day) {
    const sql = await this.ready()
    return sql`select * from oura_workouts where account_id = ${accountId} and day = ${day} order by start_datetime asc nulls last, id asc`
  }

  // --- Body weight log (per user per day) — same "no new table" reasoning
  // as manual workout above: provider='manual', metric='weight', one row per
  // user per day, delete-then-insert (the same idempotency shape
  // saveOuraHistory established for this table, so re-logging the same day
  // replaces rather than duplicates).
  async saveWeightEntry(userId, day, kg) {
    const sql = await this.ready()
    const nowIso = new Date().toISOString()
    await sql`delete from wearable_signals where user_id = ${userId} and provider = 'manual' and metric = 'weight' and day = ${day}`
    await sql`insert into wearable_signals (user_id, provider, metric, day, recorded_at, fetched_at, value, unit)
      values (${userId}, 'manual', 'weight', ${day}, ${nowIso}, ${nowIso}, ${JSON.stringify(kg)}, 'kg')`
    return { day, kg }
  }

  // Merges the user's own typed-in readings with any Apple Health
  // bodyMass sync for the same window — a smart-scale reading (via the iOS
  // companion, provider='apple') is just as real a weight signal as a
  // manual one, so trend-weight should see either. A day with BOTH is not
  // averaged or added: manual wins outright, so a deliberate correction (the
  // user re-weighing, or fixing a bad auto-read) is never silently
  // overridden by a later sync, and no day can double-count toward the
  // trend by counting both. Every entry now says which it was.
  async listWeightEntries(userId, fromYmd, toYmd) {
    const sql = await this.ready()
    const [manualRows, appleRows] = await Promise.all([
      sql`select day, value from wearable_signals where user_id = ${userId} and provider = 'manual' and metric = 'weight' and day between ${fromYmd} and ${toYmd}`,
      sql`select day, value from wearable_signals where user_id = ${userId} and provider = 'apple' and metric = 'weight' and day between ${fromYmd} and ${toYmd}`,
    ])
    const byDay = new Map()
    for (const r of appleRows) byDay.set(r.day, { day: r.day, kg: Number(r.value), source: 'apple' })
    for (const r of manualRows) byDay.set(r.day, { day: r.day, kg: Number(r.value), source: 'manual' }) // manual wins a same-day conflict
    return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  }

  async deleteWeightEntry(userId, day) {
    const sql = await this.ready()
    const rows = await sql`delete from wearable_signals where user_id = ${userId} and provider = 'manual' and metric = 'weight' and day = ${day} returning day`
    return rows.length > 0
  }

  // --- Clear synced history (Connections page's "Delete synced history") ----
  // See JsonStore's sibling method for why this excludes provider='manual'
  // and leaves the OAuth accounts (oura_accounts/garmin_accounts) untouched.
  async clearSyncedHistory(userId) {
    const sql = await this.ready()
    const signals = await sql`delete from wearable_signals where user_id = ${userId} and (provider = 'oura' or provider = 'apple') returning id`
    const garmin = await sql`
      delete from garmin_dailies using garmin_accounts
      where garmin_dailies.account_id = garmin_accounts.id and garmin_accounts.user_id = ${userId}
      returning garmin_dailies.id`
    const ouraWorkouts = await sql`
      delete from oura_workouts using oura_accounts
      where oura_workouts.account_id = oura_accounts.id and oura_accounts.user_id = ${userId}
      returning oura_workouts.id`
    return signals.length + garmin.length + ouraWorkouts.length
  }

  // --- daily plans (per user snapshot of baseline/adjusted targets + rationale)
  async getPlan(userId, date) {
    const sql = await this.ready()
    const rows = await sql`select * from daily_plans where user_id = ${userId} and date = ${date} limit 1`
    return rows[0] || null
  }

  async savePlan(userId, date, plan) {
    const sql = await this.ready()
    const rows = await sql`
      insert into daily_plans (user_id, date, baseline, adjusted, rationale, signal_snapshot, rules_version)
      values (${userId}, ${date}, ${JSON.stringify(plan.baseline || {})}, ${JSON.stringify(plan.adjusted || {})},
              ${JSON.stringify(plan.rationale || [])}, ${JSON.stringify(plan.signal_snapshot || {})}, ${plan.rulesVersion || 1})
      on conflict (user_id, date) do update set
        baseline = excluded.baseline, adjusted = excluded.adjusted, rationale = excluded.rationale,
        signal_snapshot = excluded.signal_snapshot, rules_version = excluded.rules_version, generated_at = now()
      returning *`
    return rows[0]
  }

  // One-time boot migration: if pre-multi-user data exists (rows with no
  // user_id — the columns didn't exist before tonight) it would already have
  // failed the NOT NULL constraint on insert, so a fresh `create table` never
  // has this problem. This exists for the ALTER-TABLE path on a database that
  // already had the old single-tenant schema applied — this function IS that
  // migration (an UPDATE-based backfill in application code); there is no
  // separate migrate.sql file in this repo.
  async migrateLegacyDataToUser(userId) {
    const sql = await this.ready()
    await sql`update log_entries set user_id = ${userId} where user_id is null`
    await sql`update daily_targets set user_id = ${userId} where user_id is null`
    await sql`update oura_accounts set user_id = ${userId} where user_id is null`
    await sql`update garmin_accounts set user_id = ${userId} where user_id is null`
    await sql`update wearable_signals set user_id = ${userId} where user_id is null`
    await sql`update daily_plans set user_id = ${userId} where user_id is null`
    // integrations/profile have user_id as part of their primary key, so a
    // pre-migration row can't exist with it null — nothing to backfill there.
  }
}

// --------------------------------------------------------------------------
// Local JSON-file backend (dev fallback)
// --------------------------------------------------------------------------
// Exported so tests can instantiate it against a scratch file instead of
// mutating the real dev store the `store` singleton points at.
export class JsonStore {
  constructor(file) {
    this.file = file
    this.data = null
    this.writing = Promise.resolve()
  }

  async load() {
    if (this.data) return this.data
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      this.data = JSON.parse(raw)
    } catch (err) {
      // ENOENT (no file yet — a fresh install) is the only case that should
      // silently start empty. Anything else (a corrupt/truncated JSON parse
      // failure, a permissions error) is not a fresh install and must not be
      // treated as one — that would silently wipe every user's data on the
      // next persist(). Fail loudly instead so it gets noticed and the file
      // can be recovered/inspected rather than quietly replaced.
      if (err.code !== 'ENOENT') {
        console.error(`[nutrition-tracker] Failed to read/parse ${this.file} — refusing to silently start from an empty store. Fix or remove the file to continue.`, err)
        throw err
      }
      this.data = { foods: [], entries: [], targets: [], users: [], seq: { food: 0, entry: 0, target: 0, user: 0 } }
    }
    // Older on-disk stores predate `users`/per-row user_id — nothing to
    // migrate automatically here (unlike a real ALTER TABLE, a missing key
    // just reads as undefined/absent, which every method below already
    // treats as "no owner" and filters out safely). migrateLegacyDataToUser
    // exists for symmetry with PgStore and for the same explicit one-time
    // backfill path.
    this.data.users = this.data.users || []
    this.data.seq = this.data.seq || {}
    this.data.seq.user = this.data.seq.user || 0
    return this.data
  }

  async persist() {
    // Serialize writes so concurrent mutations don't clobber the file. Chain
    // onto BOTH outcomes of the previous write: chaining only onto success
    // poisons the queue after a single failed write — every later persist
    // re-rejects with the old error even once its cause is gone.
    const write = async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      // Write to a temp file and rename over the real one, rather than
      // writeFile-ing the live path directly — rename is a single atomic
      // directory-entry swap on POSIX, so a crash/OOM-kill/container
      // restart mid-write leaves either the old complete file or the new
      // complete file, never a truncated one.
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, JSON.stringify(this.data, null, 2))
      await fs.rename(tmp, this.file)
    }
    this.writing = this.writing.then(write, write)
    return this.writing
  }

  // --- users -------------------------------------------------------------
  async createUser({ email, password_hash }) {
    const d = await this.load()
    if (d.users.find((u) => u.email === email)) {
      const err = new Error('An account with that email already exists.')
      err.status = 409
      throw err
    }
    const row = { id: ++d.seq.user, email, password_hash, created_at: new Date().toISOString() }
    d.users.push(row)
    await this.persist()
    return { id: row.id, email: row.email, created_at: row.created_at }
  }

  async getUserByEmail(email) {
    const d = await this.load()
    return d.users.find((u) => u.email === email) || null
  }

  async getUserById(id) {
    const d = await this.load()
    const u = d.users.find((u) => u.id === Number(id))
    return u ? { id: u.id, email: u.email, created_at: u.created_at } : null
  }

  async countUsers() {
    const d = await this.load()
    return d.users.length
  }

  async getSoleUserId() {
    const d = await this.load()
    return d.users.length === 1 ? d.users[0].id : null
  }

  async findUserIdByAppleIngestToken(token) {
    const d = await this.load()
    for (const row of Object.values(d.integrations || {})) {
      if (row.provider === 'apple' && row.settings?.ingest_token === token) return row.user_id
    }
    return null
  }

  // --- foods (global product cache) ---------------------------------------
  async getFoodByBarcode(barcode) {
    const d = await this.load()
    return d.foods.find((f) => f.barcode && f.barcode === barcode) || null
  }

  async getFood(id) {
    const d = await this.load()
    return d.foods.find((f) => f.id === Number(id)) || null
  }

  async createFood(food) {
    const d = await this.load()
    const f = pickFood(food)
    f.id = ++d.seq.food
    f.created_at = new Date().toISOString()
    d.foods.push(f)
    await this.persist()
    return f
  }

  // Same race this method's PgStore twin guards against, different
  // mechanism: `load()` and `persist()` are each an `await` boundary, so a
  // check-then-create split across two separately-awaited calls
  // (getFoodByBarcode, then createFood) lets two concurrent callers both
  // observe "not found" and both push a row for the same barcode — nothing
  // enforces uniqueness in this backend. Doing the find-then-push here in
  // one synchronous stretch, after a single `await load()`, closes that
  // window: nothing else can run between the check and the push.
  async upsertFoodByBarcode(food) {
    if (!food.barcode) return this.createFood(food)
    const d = await this.load()
    const existing = d.foods.find((f) => f.barcode && f.barcode === food.barcode)
    if (existing) return existing
    const f = pickFood(food)
    f.id = ++d.seq.food
    f.created_at = new Date().toISOString()
    d.foods.push(f)
    await this.persist()
    return f
  }

  #withFood(entry) {
    const food = this.data.foods.find((f) => f.id === entry.food_id) || null
    return { ...entry, food }
  }

  async listEntries(userId, { from, to }) {
    const d = await this.load()
    return d.entries
      .filter((e) => e.user_id === Number(userId) && e.logged_at >= from && e.logged_at < to)
      .sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1))
      .map((e) => this.#withFood(e))
  }

  // Store logged_at in UTC ISO form, matching what Postgres's timestamptz cast
  // does. listEntries compares these as strings, so an offset-form timestamp
  // (e.g. "…T02:00:00+05:00") stored verbatim sorts wrongly against the UTC
  // range bounds and silently drops entries PgStore would return.
  #utcIso(ts) {
    const d = new Date(ts)
    return isNaN(d) ? ts : d.toISOString()
  }

  async addEntry(userId, { food_id, servings_consumed = 1, meal = null, logged_at = null }) {
    const d = await this.load()
    const entry = {
      id: ++d.seq.entry,
      user_id: Number(userId),
      food_id: Number(food_id),
      servings_consumed: Number(servings_consumed),
      meal: meal || null,
      logged_at: logged_at ? this.#utcIso(logged_at) : new Date().toISOString(),
      created_at: new Date().toISOString(),
    }
    d.entries.push(entry)
    await this.persist()
    return this.#withFood(entry)
  }

  async getEntry(userId, id) {
    const d = await this.load()
    const entry = d.entries.find((e) => e.id === Number(id) && e.user_id === Number(userId))
    return entry ? this.#withFood(entry) : null
  }

  async updateEntry(userId, id, patch) {
    const d = await this.load()
    const entry = d.entries.find((e) => e.id === Number(id) && e.user_id === Number(userId))
    if (!entry) return null // not found, or owned by someone else — same response either way
    if (patch.servings_consumed !== undefined) entry.servings_consumed = Number(patch.servings_consumed)
    if (patch.meal !== undefined) entry.meal = patch.meal || null
    if (patch.logged_at !== undefined) entry.logged_at = patch.logged_at ? this.#utcIso(patch.logged_at) : patch.logged_at
    await this.persist()
    return this.#withFood(entry)
  }

  async deleteEntry(userId, id) {
    const d = await this.load()
    const i = d.entries.findIndex((e) => e.id === Number(id) && e.user_id === Number(userId))
    if (i === -1) return false
    d.entries.splice(i, 1)
    await this.persist()
    return true
  }

  async recentFoods(userId, limit = 20) {
    const d = await this.load()
    const agg = new Map()
    for (const e of d.entries) {
      if (e.user_id !== Number(userId)) continue
      const a = agg.get(e.food_id) || { food_id: e.food_id, last_logged: e.logged_at, times_logged: 0 }
      a.times_logged += 1
      if (e.logged_at > a.last_logged) a.last_logged = e.logged_at
      agg.set(e.food_id, a)
    }
    return [...agg.values()]
      .sort((x, y) => (x.last_logged < y.last_logged ? 1 : -1))
      .slice(0, limit)
      .map((a) => {
        const f = d.foods.find((f) => f.id === a.food_id)
        return f ? { ...f, last_logged: a.last_logged, times_logged: a.times_logged } : null
      })
      .filter(Boolean)
  }

  async getLatestTargets(userId) {
    const d = await this.load()
    const mine = d.targets.filter((t) => t.user_id === Number(userId))
    if (!mine.length) return { ...DEFAULT_TARGETS }
    return mine[mine.length - 1]
  }

  // getLatestTargets always returns SOMETHING (DEFAULT_TARGETS when nothing
  // was ever saved) so Today/Plan always have numbers to render — but that
  // fallback erases the difference between "chose 2000 kcal" and "never set
  // anything, got the hardcoded default silently." This is that distinction,
  // for the one place it matters: whether onboarding still needs to run.
  async hasTargets(userId) {
    const d = await this.load()
    return d.targets.some((t) => t.user_id === Number(userId))
  }

  async setTargets(userId, t) {
    const d = await this.load()
    const row = {
      id: ++d.seq.target,
      user_id: Number(userId),
      ...DEFAULT_TARGETS,
      ...t,
      effective_from: new Date().toISOString(),
    }
    d.targets.push(row)
    await this.persist()
    return row
  }

  // --- biometric profile (one entry per user) -------------------------------
  async getProfile(userId) {
    const d = await this.load()
    d.profiles = d.profiles || {}
    const p = d.profiles[userId]
    return p ? { ...p } : { ...DEFAULT_PROFILE }
  }

  async setProfile(userId, patch) {
    const d = await this.load()
    d.profiles = d.profiles || {}
    const cur = d.profiles[userId] || { ...DEFAULT_PROFILE }
    // updated_at is always server-set, never taken from the caller — same
    // contract as PgStore's `now()`.
    const m = { ...cur, ...patch, updated_at: new Date().toISOString() }
    d.profiles[userId] = m
    await this.persist()
    return { ...m }
  }

  async listOuraAccounts(userId) {
    const d = await this.load()
    return (d.oura_accounts || []).filter((a) => a.user_id === Number(userId))
  }

  async listAllOuraAccounts() {
    const d = await this.load()
    return [...(d.oura_accounts || [])]
  }

  async saveOuraAccount(userId, { label, access_token, refresh_token, expires_at }) {
    const d = await this.load()
    d.oura_accounts = d.oura_accounts || []
    d.seq.oura = (d.seq.oura || 0) + 1
    const row = {
      id: d.seq.oura,
      user_id: Number(userId),
      label: label || null,
      access_token,
      refresh_token,
      expires_at: expires_at || null,
      created_at: new Date().toISOString(),
    }
    d.oura_accounts.push(row)
    await this.persist()
    return row
  }

  async updateOuraTokens(userId, id, { access_token, refresh_token, expires_at }) {
    const d = await this.load()
    const a = (d.oura_accounts || []).find((x) => x.id === Number(id) && x.user_id === Number(userId))
    if (!a) return
    a.access_token = access_token
    a.refresh_token = refresh_token
    a.expires_at = expires_at
    await this.persist()
  }

  async deleteOuraAccount(userId, id) {
    const d = await this.load()
    const i = (d.oura_accounts || []).findIndex((x) => x.id === Number(id) && x.user_id === Number(userId))
    if (i === -1) return false
    d.oura_accounts.splice(i, 1)
    await this.persist()
    return true
  }

  async listGarminAccounts(userId) {
    const d = await this.load()
    return (d.garmin_accounts || []).filter((a) => a.user_id === Number(userId))
  }

  async saveGarminAccount(userId, { label, access_token, refresh_token, expires_at, garmin_user_id }) {
    const d = await this.load()
    d.garmin_accounts = d.garmin_accounts || []
    d.seq.garmin = (d.seq.garmin || 0) + 1
    const row = {
      id: d.seq.garmin,
      user_id: Number(userId),
      label: label || null,
      access_token,
      refresh_token,
      expires_at: expires_at || null,
      garmin_user_id: garmin_user_id || null,
      created_at: new Date().toISOString(),
    }
    d.garmin_accounts.push(row)
    await this.persist()
    return row
  }

  async findGarminAccountByGarminUserId(garminUserId) {
    const d = await this.load()
    return (d.garmin_accounts || []).find((x) => x.garmin_user_id === garminUserId) || null
  }

  async updateGarminTokens(userId, id, { access_token, refresh_token, expires_at }) {
    const d = await this.load()
    const a = (d.garmin_accounts || []).find((x) => x.id === Number(id) && x.user_id === Number(userId))
    if (!a) return
    a.access_token = access_token
    a.refresh_token = refresh_token
    a.expires_at = expires_at
    await this.persist()
  }

  async deleteGarminAccount(userId, id) {
    const d = await this.load()
    const i = (d.garmin_accounts || []).findIndex((x) => x.id === Number(id) && x.user_id === Number(userId))
    if (i === -1) return false
    d.garmin_accounts.splice(i, 1)
    await this.persist()
    return true
  }

  async upsertGarminDaily({ account_id, day, total_calories, active_calories, steps, raw }) {
    const d = await this.load()
    d.garmin_dailies = d.garmin_dailies || []
    let row = d.garmin_dailies.find((x) => x.account_id === Number(account_id) && x.day === day)
    if (!row) {
      row = { account_id: Number(account_id), day }
      d.garmin_dailies.push(row)
    }
    row.total_calories = total_calories ?? null
    row.active_calories = active_calories ?? null
    row.steps = steps ?? null
    row.raw = raw ?? null
    await this.persist()
    return row
  }

  async getGarminDaily(account_id, day) {
    const d = await this.load()
    return (d.garmin_dailies || []).find((x) => x.account_id === Number(account_id) && x.day === day) || null
  }

  async getIntegration(userId, provider) {
    const d = await this.load()
    const key = `${userId}:${provider}`
    return (d.integrations || {})[key] || { user_id: Number(userId), provider, enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} }
  }

  async setIntegration(userId, provider, patch) {
    const d = await this.load()
    d.integrations = d.integrations || {}
    const key = `${userId}:${provider}`
    const m = { ...(d.integrations[key] || { user_id: Number(userId), provider, enabled: true, demo: true, settings: {} }), ...patch, user_id: Number(userId), provider }
    d.integrations[key] = m
    await this.persist()
    return m
  }

  async listAppleSignals(userId, day) {
    const d = await this.load()
    return (d.wearable_signals || []).filter((s) => s.user_id === Number(userId) && s.provider === 'apple' && s.day === day)
  }

  async replaceAppleSignals(userId, day, rows) {
    const d = await this.load()
    d.wearable_signals = (d.wearable_signals || []).filter((s) => !(s.user_id === Number(userId) && s.provider === 'apple' && s.day === day))
    for (const r of rows) {
      d.wearable_signals.push({
        user_id: Number(userId), provider: 'apple', metric: r.metric, day,
        recorded_at: r.recorded_at || null, fetched_at: r.fetched_at || null,
        value: r.value ?? null, unit: r.unit || null, extra: r.extra || null,
      })
    }
    await this.persist()
    return rows.length
  }

  // See PgStore.listAppleWorkoutHistory for why this aggregates (a day can
  // carry more than one completed workout) instead of returning raw rows.
  async listAppleWorkoutHistory(userId, fromYmd, toYmd) {
    const d = await this.load()
    const uid = Number(userId)
    const rows = (d.wearable_signals || [])
      .filter((s) => s.user_id === uid && s.provider === 'apple' && s.metric === 'workout' && s.day >= fromYmd && s.day <= toYmd)
    return aggregateWorkoutRows(rows)
  }

  // --- Manual workout input (per user per day) — see PgStore's sibling
  // methods for why this reuses wearable_signals rather than a new table.
  async getManualWorkout(userId, day) {
    const d = await this.load()
    const row = (d.wearable_signals || []).find((s) => s.user_id === Number(userId) && s.provider === 'manual' && s.metric === 'workout' && s.day === day)
    return row ? { ...row.value, recorded_at: row.recorded_at } : null
  }

  async setManualWorkout(userId, day, workout) {
    const d = await this.load()
    d.wearable_signals = (d.wearable_signals || []).filter((s) => !(s.user_id === Number(userId) && s.provider === 'manual' && s.metric === 'workout' && s.day === day))
    const nowIso = new Date().toISOString()
    d.wearable_signals.push({ user_id: Number(userId), provider: 'manual', metric: 'workout', day, recorded_at: nowIso, fetched_at: nowIso, value: workout, unit: null, extra: null })
    await this.persist()
    return workout
  }

  async clearManualWorkout(userId, day) {
    const d = await this.load()
    const before = (d.wearable_signals || []).length
    d.wearable_signals = (d.wearable_signals || []).filter((s) => !(s.user_id === Number(userId) && s.provider === 'manual' && s.metric === 'workout' && s.day === day))
    await this.persist()
    return d.wearable_signals.length < before
  }

  async saveOuraHistory(userId, rows) {
    const d = await this.load()
    d.wearable_signals = d.wearable_signals || []
    const uid = Number(userId)
    // See PgStore.saveOuraHistory for why this is scoredDays, not every
    // requested day: a re-run's transient null must not erase a
    // previously-correct score for that day.
    const scoredDays = [...new Set(rows.filter((r) => r.day != null && r.score != null).map((r) => r.day))]
    d.wearable_signals = d.wearable_signals.filter(
      (s) => !(s.user_id === uid && s.provider === 'oura' && s.metric === 'readiness' && scoredDays.includes(s.day)),
    )
    let n = 0
    const now = new Date().toISOString()
    for (const r of rows) {
      if (r.day == null || r.score == null) continue
      // See PgStore.saveOuraHistory for what extra now carries beyond
      // steps/calories: contributors (scores, never relabeled as raw
      // biometrics), the raw temperature_deviation/temperature_trend_
      // deviation (°C), and the day's daily_sleep score.
      d.wearable_signals.push({
        user_id: uid, provider: 'oura', metric: 'readiness', day: r.day,
        recorded_at: `${r.day}T12:00:00.000Z`, fetched_at: now,
        value: r.score, unit: 'score',
        extra: {
          total_calories: r.total_calories, active_calories: r.active_calories, steps: r.steps,
          contributors: r.contributors || null,
          temperature_deviation: r.temperature_deviation ?? null,
          temperature_trend_deviation: r.temperature_trend_deviation ?? null,
          sleep_score: r.sleep_score ?? null,
        },
      })
      n++
    }
    await this.persist()
    return n
  }

  async listOuraHistory(userId, fromYmd, toYmd) {
    const d = await this.load()
    const uid = Number(userId)
    return (d.wearable_signals || [])
      .filter((s) => s.user_id === uid && s.provider === 'oura' && s.metric === 'readiness' && s.day >= fromYmd && s.day <= toYmd)
      .sort((a, b) => (a.day < b.day ? -1 : 1))
  }

  // --- Oura workouts (JsonStore mirror of PgStore's oura_workouts table) —
  // one array of plain objects, upserted on (account_id, oura_id).
  async saveOuraWorkouts(accountId, workouts) {
    const d = await this.load()
    d.oura_workouts = d.oura_workouts || []
    const aid = Number(accountId)
    let n = 0
    for (const w of workouts) {
      if (w.id == null || w.day == null) continue
      let row = d.oura_workouts.find((x) => x.account_id === aid && x.oura_id === w.id)
      if (!row) {
        row = { account_id: aid, oura_id: w.id }
        d.oura_workouts.push(row)
      }
      Object.assign(row, {
        day: w.day, activity: w.activity, intensity: w.intensity, source: w.source, label: w.label,
        calories: w.calories, distance: w.distance, start_datetime: w.start_datetime, end_datetime: w.end_datetime,
        raw: w,
      })
      n++
    }
    await this.persist()
    return n
  }

  async listOuraWorkouts(accountId, day) {
    const d = await this.load()
    const aid = Number(accountId)
    return (d.oura_workouts || [])
      .filter((x) => x.account_id === aid && x.day === day)
      .sort((a, b) => (a.start_datetime || '').localeCompare(b.start_datetime || ''))
  }

  // --- Body weight log (per user per day) — see PgStore's sibling methods
  // for why this reuses wearable_signals rather than a new table.
  async saveWeightEntry(userId, day, kg) {
    const d = await this.load()
    d.wearable_signals = d.wearable_signals || []
    const uid = Number(userId)
    d.wearable_signals = d.wearable_signals.filter((s) => !(s.user_id === uid && s.provider === 'manual' && s.metric === 'weight' && s.day === day))
    const nowIso = new Date().toISOString()
    d.wearable_signals.push({ user_id: uid, provider: 'manual', metric: 'weight', day, recorded_at: nowIso, fetched_at: nowIso, value: kg, unit: 'kg', extra: null })
    await this.persist()
    return { day, kg }
  }

  // See PgStore.listWeightEntries for why manual and Apple-synced readings
  // are merged here (and manual wins a same-day conflict, never averaged
  // or double-counted).
  async listWeightEntries(userId, fromYmd, toYmd) {
    const d = await this.load()
    const uid = Number(userId)
    const inWindow = (s, provider) => s.user_id === uid && s.provider === provider && s.metric === 'weight' && s.day >= fromYmd && s.day <= toYmd
    const byDay = new Map()
    for (const s of (d.wearable_signals || []).filter((s) => inWindow(s, 'apple'))) byDay.set(s.day, { day: s.day, kg: Number(s.value), source: 'apple' })
    for (const s of (d.wearable_signals || []).filter((s) => inWindow(s, 'manual'))) byDay.set(s.day, { day: s.day, kg: Number(s.value), source: 'manual' })
    return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  }

  async deleteWeightEntry(userId, day) {
    const d = await this.load()
    const uid = Number(userId)
    const before = (d.wearable_signals || []).length
    d.wearable_signals = (d.wearable_signals || []).filter((s) => !(s.user_id === uid && s.provider === 'manual' && s.metric === 'weight' && s.day === day))
    await this.persist()
    return d.wearable_signals.length < before
  }

  // --- Clear synced history (Connections page's "Delete synced history") ----
  // Removes cached wearable RECORDS (Oura/Apple wearable_signals rows, Garmin
  // daily summaries) without touching the OAuth accounts themselves — that's
  // the separate, existing disconnect action. Scoped to exactly what the
  // button's own copy promises: "Oura, Garmin, and Apple Health records
  // synced to this app" — provider='manual' (the user's own typed-in
  // workout) is deliberately excluded, since that's authored data, not
  // something synced from a wearable.
  async clearSyncedHistory(userId) {
    const d = await this.load()
    const uid = Number(userId)
    const beforeSignals = (d.wearable_signals || []).length
    d.wearable_signals = (d.wearable_signals || []).filter(
      (s) => !(s.user_id === uid && (s.provider === 'oura' || s.provider === 'apple')),
    )
    const signalsRemoved = beforeSignals - d.wearable_signals.length

    const garminAccountIds = new Set((d.garmin_accounts || []).filter((a) => a.user_id === uid).map((a) => a.id))
    const beforeGarmin = (d.garmin_dailies || []).length
    d.garmin_dailies = (d.garmin_dailies || []).filter((g) => !garminAccountIds.has(g.account_id))
    const garminRemoved = beforeGarmin - d.garmin_dailies.length

    const ouraAccountIds = new Set((d.oura_accounts || []).filter((a) => a.user_id === uid).map((a) => a.id))
    const beforeOuraWorkouts = (d.oura_workouts || []).length
    d.oura_workouts = (d.oura_workouts || []).filter((w) => !ouraAccountIds.has(w.account_id))
    const ouraWorkoutsRemoved = beforeOuraWorkouts - d.oura_workouts.length

    await this.persist()
    return signalsRemoved + garminRemoved + ouraWorkoutsRemoved
  }

  async getPlan(userId, date) {
    const d = await this.load()
    return (d.daily_plans || {})[`${userId}:${date}`] || null
  }

  async savePlan(userId, date, plan) {
    const d = await this.load()
    d.daily_plans = d.daily_plans || {}
    const row = {
      user_id: Number(userId), date, baseline: plan.baseline || {}, adjusted: plan.adjusted || {},
      rationale: plan.rationale || [], signal_snapshot: plan.signal_snapshot || {},
      rules_version: plan.rulesVersion || 1, generated_at: new Date().toISOString(),
    }
    d.daily_plans[`${userId}:${date}`] = row
    await this.persist()
    return row
  }

  // Symmetry with PgStore — a fresh JsonStore file never has legacy
  // (ownerless) rows in the first place, so this is a no-op there, but keeps
  // the interface identical for anything that calls it unconditionally.
  async migrateLegacyDataToUser(userId) {
    const d = await this.load()
    const uid = Number(userId)
    for (const e of d.entries) if (e.user_id == null) e.user_id = uid
    for (const t of d.targets) if (t.user_id == null) t.user_id = uid
    for (const a of d.oura_accounts || []) if (a.user_id == null) a.user_id = uid
    for (const a of d.garmin_accounts || []) if (a.user_id == null) a.user_id = uid
    for (const s of d.wearable_signals || []) if (s.user_id == null) s.user_id = uid
    if (d.profile && !d.profiles) {
      // Pre-multi-user single `profile` object -> this user's entry.
      d.profiles = { [uid]: d.profile }
      delete d.profile
    }
    if (d.daily_plans && !Array.isArray(d.daily_plans)) {
      // Pre-multi-user daily_plans was keyed by date alone; re-key by
      // `${userId}:${date}` so getPlan/savePlan's lookup keeps working.
      const rekeyed = {}
      for (const [date, plan] of Object.entries(d.daily_plans)) {
        if (date.includes(':')) { rekeyed[date] = plan; continue } // already migrated
        rekeyed[`${uid}:${date}`] = { ...plan, user_id: uid }
      }
      d.daily_plans = rekeyed
    }
    await this.persist()
  }
}

function makeStore() {
  const url = process.env.DATABASE_URL
  if (url) {
    return { store: new PgStore(url), backend: 'postgres' }
  }
  const file = path.join(__dirname, '.data', 'store.json')
  return { store: new JsonStore(file), backend: 'json-file' }
}

export const { store, backend } = makeStore()
