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
import { inviteUnavailableError } from './alphaAccess.js'
import {
  isIdempotentRpgSaveRetry,
  normalizeRpgSave,
  normalizeRpgSaveHistoryRow,
} from './rpgSave.js'

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

// Neon can return numeric columns as strings while JSON storage preserves
// numbers. Keep the public hydration/export contract backend-independent.
const normalizeWaterEntry = (entry) => entry && ({ ...entry, amount_ml: Number(entry.amount_ml) })
export const DEFAULT_HYDRATION_PREFERENCES = { goal_ml: null, unit: 'ml', quick_add_ml: [250, 500, 750] }
const normalizeHydrationPreferences = (row) => row ? ({ goal_ml: row.goal_ml == null ? null : Number(row.goal_ml), unit: row.unit, quick_add_ml: [...row.quick_add_ml].map(Number) }) : ({ ...DEFAULT_HYDRATION_PREFERENCES, quick_add_ml: [...DEFAULT_HYDRATION_PREFERENCES.quick_add_ml] })

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
  accent: 'cobalt',
  updated_at: null,
}

// Adaptive Fuel Plan's own profile default — a separate, independently-
// versioned shape from DEFAULT_PROFILE above (see schema.sql's afp_profile
// comment for why this is a wholly separate table).
export const DEFAULT_AFP_PROFILE = {
  units_pref: 'imperial',
  age_years: null,
  height_cm: null,
  weight_kg: null,
  sex: null,
  body_fat_pct: null,
  equation_stratum: null,
  activity_level: null,
  goal: 'maintain',
  plan_mode: 'automatic',
  eligibility_attested: false,
  // Entered only for manual/clinician modes. These values are never derived
  // from the automatic AFP equation.
  manual_targets: null,
  weekly_change_kg: null,
  calorie_adjustment: null,
  is_pregnant_or_postpartum: false,
  is_lactating: false,
  has_ckd_or_renal_condition: false,
  has_ed_risk_flag: false,
  has_clinician_prescribed_diet: false,
  has_major_illness_or_glucose_lowering_meds: false,
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

function exportFood(f) {
  if (!f) return null
  const { raw_api_response, ...safe } = f
  return safe
}

function exportIntegration(row) {
  if (!row) return row
  const { ingest_token, ...settings } = row.settings || {}
  return { ...row, settings }
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
  async createUser({ email, password_hash, legal_version = null, invite_code_digest = null }) {
    const sql = await this.ready()
    try {
      if (invite_code_digest) {
        // The non-interactive Neon transaction still executes these in order.
        // The first query creates no user when the durable ledger already has
        // the digest; the second records a successful claim. Any uniqueness
        // failure aborts both queries, so concurrent requests cannot strand a
        // user or redeem one code twice.
        const [createdRows, redemptionRows] = await sql.transaction((txn) => [
          txn`
            insert into users (email, password_hash, legal_version, legal_accepted_at, invite_code_digest)
            select ${email}, ${password_hash}, ${legal_version}, ${legal_version ? new Date().toISOString() : null}, ${invite_code_digest}
            where not exists (
              select 1 from alpha_invite_redemptions where code_digest = ${invite_code_digest}
            )
            returning id, email, legal_version, legal_accepted_at, created_at`,
          txn`
            insert into alpha_invite_redemptions (code_digest, user_id)
            select ${invite_code_digest}, id from users where invite_code_digest = ${invite_code_digest}
            returning code_digest`,
        ])
        if (!createdRows[0] || !redemptionRows[0]) throw inviteUnavailableError()
        return createdRows[0]
      }
      const rows = await sql`
        insert into users (email, password_hash, legal_version, legal_accepted_at)
        values (${email}, ${password_hash}, ${legal_version}, ${legal_version ? new Date().toISOString() : null})
        returning id, email, legal_version, legal_accepted_at, created_at`
      return rows[0]
    } catch (err) {
      if (err.code === 'INVITE_UNAVAILABLE' || (err.code === '23505' && invite_code_digest)) {
        throw inviteUnavailableError()
      }
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
    const rows = await sql`select id, email, legal_version, legal_accepted_at, session_version, created_at from users where id = ${id} limit 1`
    return rows[0] || null
  }

  async createPasswordRecoveryChallenge({ user_id, start_token_digest, oauth_state_digest, expires_at }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into password_recovery_challenges (user_id, start_token_digest, oauth_state_digest, expires_at)
      values (${user_id}, ${start_token_digest}, ${oauth_state_digest}, ${expires_at})
      returning id, user_id, start_token_digest, oauth_state_digest, expires_at, verified_at, consumed_at`
    return rows[0]
  }

  async pruneExpiredPasswordRecoveries() {
    const sql = await this.ready()
    const rows = await sql`delete from password_recovery_challenges where expires_at <= now() returning id`
    return rows.length
  }

  async getPasswordRecoveryByStartToken(startTokenDigest) {
    const sql = await this.ready()
    const rows = await sql`select * from password_recovery_challenges where start_token_digest = ${startTokenDigest} limit 1`
    return rows[0] || null
  }

  async getPasswordRecoveryByOauthState(oauthStateDigest) {
    const sql = await this.ready()
    const rows = await sql`select * from password_recovery_challenges where oauth_state_digest = ${oauthStateDigest} limit 1`
    return rows[0] || null
  }

  async activatePasswordRecovery(id, recoveryTokenDigest, expiresAt) {
    const sql = await this.ready()
    const rows = await sql`
      update password_recovery_challenges
      set recovery_token_digest = ${recoveryTokenDigest}, verified_at = now(), expires_at = ${expiresAt}
      where id = ${id} and user_id is not null and verified_at is null and recovery_token_digest is null and consumed_at is null and expires_at > now()
      returning id`
    return Boolean(rows[0])
  }

  async consumePasswordRecovery(recoveryTokenDigest, passwordHash) {
    const sql = await this.ready()
    const rows = await sql`
      with claimed as (
        update password_recovery_challenges
        set consumed_at = now()
        where recovery_token_digest = ${recoveryTokenDigest}
          and verified_at is not null and consumed_at is null and expires_at > now()
        returning user_id
      )
      , updated_user as (
        update users set password_hash = ${passwordHash}, session_version = session_version + 1
        where id = (select user_id from claimed)
        returning id, email, legal_version, legal_accepted_at, session_version, created_at
      ), cleared_apple as (
        update integrations set settings = settings - 'ingest_token'
        where user_id = (select id from updated_user) and provider = 'apple'
      )
      select * from updated_user`
    return rows[0] || null
  }

  async acceptLegalVersion(userId, legalVersion) {
    const sql = await this.ready()
    const rows = await sql`
      update users set legal_version = ${legalVersion}, legal_accepted_at = now()
      where id = ${userId}
      returning id, email, legal_version, legal_accepted_at, created_at`
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

  // --- hydration log (user-owned) -------------------------------------------
  async getHydrationPreferences(userId) {
    const sql = await this.ready()
    const rows = await sql`select goal_ml, unit, quick_add_ml from hydration_preferences where user_id = ${userId}`
    return normalizeHydrationPreferences(rows[0])
  }
  async setHydrationPreferences(userId, preferences) {
    const sql = await this.ready()
    const initial = { ...DEFAULT_HYDRATION_PREFERENCES, ...preferences }
    const rows = await sql`insert into hydration_preferences (user_id, goal_ml, unit, quick_add_ml)
      values (${userId}, ${initial.goal_ml}, ${initial.unit}, ${JSON.stringify(initial.quick_add_ml)}::jsonb)
      on conflict (user_id) do update set
      goal_ml = case when ${Object.hasOwn(preferences, 'goal_ml')} then excluded.goal_ml else hydration_preferences.goal_ml end,
      unit = case when ${Object.hasOwn(preferences, 'unit')} then excluded.unit else hydration_preferences.unit end,
      quick_add_ml = case when ${Object.hasOwn(preferences, 'quick_add_ml')} then excluded.quick_add_ml else hydration_preferences.quick_add_ml end,
      updated_at = now()
      returning goal_ml, unit, quick_add_ml`
    return normalizeHydrationPreferences(rows[0])
  }
  async listWaterEntries(userId, { from, to }) {
    const sql = await this.ready()
    const rows = await sql`select id, amount_ml, logged_at, created_at from water_entries
      where user_id = ${userId} and logged_at >= ${from} and logged_at < ${to}
      order by logged_at asc, id asc`
    return rows.map(normalizeWaterEntry)
  }
  async addWaterEntry(userId, { amount_ml, logged_at = null }) {
    const sql = await this.ready()
    const rows = await sql`insert into water_entries (user_id, amount_ml, logged_at)
      values (${userId}, ${amount_ml}, coalesce(${logged_at}::timestamptz, now())) returning *`
    return normalizeWaterEntry(rows[0])
  }
  async updateWaterEntry(userId, id, patch) {
    const sql = await this.ready()
    const rows = await sql`update water_entries set
      amount_ml = coalesce(${patch.amount_ml ?? null}, amount_ml),
      logged_at = coalesce(${patch.logged_at ?? null}::timestamptz, logged_at)
      where id = ${id} and user_id = ${userId} returning *`
    return rows[0] ? normalizeWaterEntry(rows[0]) : null
  }
  async deleteWaterEntry(userId, id) {
    const sql = await this.ready()
    const rows = await sql`delete from water_entries where id = ${id} and user_id = ${userId} returning id`
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
      select height_cm, weight_kg, sex, age_years, units_pref, activity_level, goal, accent, updated_at
      from profile where user_id = ${userId} limit 1`
    return rows[0] || { ...DEFAULT_PROFILE }
  }

  // Merges the patch into whatever's stored — a user filling the form field
  // by field must not lose earlier fields. updated_at is always server-set,
  // never taken from the caller.
  async setProfile(userId, patch) {
    const sql = await this.ready()
    // Do not read-merge-write here: two devices saving different profile
    // fields can otherwise both snapshot stale data and the later full row
    // overwrites (for example) a just-saved accent. The conflict branch only
    // changes columns explicitly present in this patch.
    const m = { ...DEFAULT_PROFILE, ...patch }
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key)
    const rows = await sql`
      insert into profile (user_id, height_cm, weight_kg, sex, age_years, units_pref, activity_level, goal, accent, updated_at)
      values (${userId}, ${m.height_cm}, ${m.weight_kg}, ${m.sex}, ${m.age_years}, ${m.units_pref}, ${m.activity_level}, ${m.goal}, ${m.accent || 'cobalt'}, now())
      on conflict (user_id) do update set
        height_cm = case when ${has('height_cm')} then excluded.height_cm else profile.height_cm end,
        weight_kg = case when ${has('weight_kg')} then excluded.weight_kg else profile.weight_kg end,
        sex = case when ${has('sex')} then excluded.sex else profile.sex end,
        age_years = case when ${has('age_years')} then excluded.age_years else profile.age_years end,
        units_pref = case when ${has('units_pref')} then excluded.units_pref else profile.units_pref end,
        activity_level = case when ${has('activity_level')} then excluded.activity_level else profile.activity_level end,
        goal = case when ${has('goal')} then excluded.goal else profile.goal end,
        accent = case when ${has('accent')} then excluded.accent else profile.accent end,
        updated_at = excluded.updated_at
      returning height_cm, weight_kg, sex, age_years, units_pref, activity_level, goal, accent, updated_at`
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

  async saveOuraAccount(userId, { label, oura_user_id = null, access_token, refresh_token, expires_at }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into oura_accounts (user_id, label, oura_user_id, access_token, refresh_token, expires_at)
      values (${userId}, ${label}, ${oura_user_id}, ${access_token}, ${refresh_token}, ${expires_at})
      on conflict (oura_user_id) where oura_user_id is not null do update set
        label = excluded.label, access_token = excluded.access_token,
        refresh_token = excluded.refresh_token, expires_at = excluded.expires_at
      where oura_accounts.user_id = excluded.user_id
      returning *`
    if (!rows[0]) throw Object.assign(new Error('This Oura account is already linked.'), { status: 409 })
    return rows[0]
  }

  async setOuraUserId(userId, id, ouraUserId) {
    const sql = await this.ready()
    try {
      const rows = await sql`update oura_accounts set oura_user_id = ${ouraUserId} where id = ${id} and user_id = ${userId} and oura_user_id is null returning id`
      return Boolean(rows[0])
    } catch (err) {
      if (err.code === '23505') return false
      throw err
    }
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
    const m = { enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {}, ...patch }
    const rows = await sql`
      insert into integrations (user_id, provider, enabled, demo, connected_at, last_synced_at, error, settings)
      values (${userId}, ${provider}, ${m.enabled}, ${m.demo}, ${m.connected_at}, ${m.last_synced_at}, ${m.error}, ${JSON.stringify(m.settings || {})})
      on conflict (user_id, provider) do update set
        enabled = case when ${Object.hasOwn(patch, 'enabled')} then excluded.enabled else integrations.enabled end,
        demo = case when ${Object.hasOwn(patch, 'demo')} then excluded.demo else integrations.demo end,
        connected_at = case when ${Object.hasOwn(patch, 'connected_at')} then excluded.connected_at else integrations.connected_at end,
        last_synced_at = case when ${Object.hasOwn(patch, 'last_synced_at')} then excluded.last_synced_at else integrations.last_synced_at end,
        error = case when ${Object.hasOwn(patch, 'error')} then excluded.error else integrations.error end,
        settings = coalesce(integrations.settings, '{}'::jsonb) || excluded.settings
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

  // Independent exporter automations send partial days. Serialize per user,
  // replacing only the metric/day or the same workout instant, never siblings.
  async mergeAppleSignals(userId, day, rows) {
    if (!rows.length) return 0
    const sql = await this.ready()
    await sql.transaction((tx) => [
      tx`select pg_advisory_xact_lock(74123, ${Number(userId)}::integer)`,
      ...rows.flatMap((r) => [
        tx`delete from wearable_signals where user_id = ${userId} and provider = 'apple' and day = ${day} and metric = ${r.metric}
          and ((${r.metric} <> 'workout' and recorded_at <= ${r.recorded_at}::timestamptz) or (${r.metric} = 'workout' and recorded_at = ${r.recorded_at}::timestamptz))`,
        tx`insert into wearable_signals (user_id, provider, metric, day, recorded_at, fetched_at, value, unit, extra)
          select ${userId}, 'apple', ${r.metric}, ${day}::date, ${r.recorded_at}::timestamptz, ${r.fetched_at}::timestamptz, ${JSON.stringify(r.value ?? null)}::jsonb, ${r.unit || null}, ${r.extra ? JSON.stringify(r.extra) : null}::jsonb
          where ${r.metric} = 'workout' or not exists (select 1 from wearable_signals where user_id = ${userId} and provider = 'apple' and day = ${day} and metric = ${r.metric} and recorded_at > ${r.recorded_at}::timestamptz)`,
      ]),
    ])
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

  async listTrainingWorkouts(userId, provider, fromYmd, toYmd) {
    const sql = await this.ready()
    if (provider === 'oura') return sql`select w.* from oura_workouts w join oura_accounts a on a.id = w.account_id where a.user_id = ${userId} and w.day between ${fromYmd} and ${toYmd} order by w.day, w.start_datetime`
    if (provider === 'apple') return sql`select * from wearable_signals where user_id = ${userId} and provider = 'apple' and metric = 'workout' and day between ${fromYmd} and ${toYmd} order by day, recorded_at`
    // Garmin currently supplies daily summaries, not verified workout rows.
    // Never transform daily energy/steps into invented training sessions.
    return []
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

  // --- Adaptive Fuel Plan: profile (one row per user) ------------------------
  async getAfpProfile(userId) {
    const sql = await this.ready()
    const rows = await sql`select * from afp_profile where user_id = ${userId} limit 1`
    return { ...DEFAULT_AFP_PROFILE, ...(rows[0] || {}) }
  }

  // One INSERT ... ON CONFLICT statement handles both first save and partial
  // concurrent updates. Do not use an insert-then-update CTE here: PostgreSQL
  // data-modifying CTEs share one snapshot, so the update cannot see its own
  // just-inserted row on a first save.
  async setAfpProfile(userId, patch) {
    const sql = await this.ready()
    const incoming = patch || {}
    const m = { ...DEFAULT_AFP_PROFILE, ...incoming }
    const has = (key) => Object.prototype.hasOwnProperty.call(incoming, key)
    const rows = await sql`
      insert into afp_profile as p (
        user_id, units_pref, age_years, height_cm, weight_kg, sex, body_fat_pct, equation_stratum,
        activity_level, goal, plan_mode, eligibility_attested, manual_targets, weekly_change_kg,
        calorie_adjustment, is_pregnant_or_postpartum, is_lactating, has_ckd_or_renal_condition,
        has_ed_risk_flag, has_clinician_prescribed_diet, has_major_illness_or_glucose_lowering_meds, updated_at
      ) values (
        ${userId}, ${m.units_pref}, ${m.age_years}, ${m.height_cm}, ${m.weight_kg}, ${m.sex}, ${m.body_fat_pct}, ${m.equation_stratum},
        ${m.activity_level}, ${m.goal}, ${m.plan_mode}, ${m.eligibility_attested}, ${m.manual_targets ? JSON.stringify(m.manual_targets) : null}, ${m.weekly_change_kg},
        ${m.calorie_adjustment}, ${m.is_pregnant_or_postpartum}, ${m.is_lactating}, ${m.has_ckd_or_renal_condition},
        ${m.has_ed_risk_flag}, ${m.has_clinician_prescribed_diet}, ${m.has_major_illness_or_glucose_lowering_meds}, now()
      ) on conflict (user_id) do update set
        units_pref = case when ${has('units_pref')} then excluded.units_pref else p.units_pref end,
        age_years = case when ${has('age_years')} then excluded.age_years else p.age_years end,
        height_cm = case when ${has('height_cm')} then excluded.height_cm else p.height_cm end,
        weight_kg = case when ${has('weight_kg')} then excluded.weight_kg else p.weight_kg end,
        sex = case when ${has('sex')} then excluded.sex else p.sex end,
        body_fat_pct = case when ${has('body_fat_pct')} then excluded.body_fat_pct else p.body_fat_pct end,
        equation_stratum = case when ${has('equation_stratum')} then excluded.equation_stratum else p.equation_stratum end,
        activity_level = case when ${has('activity_level')} then excluded.activity_level else p.activity_level end,
        goal = case when ${has('goal')} then excluded.goal else p.goal end,
        plan_mode = case when ${has('plan_mode')} then excluded.plan_mode else p.plan_mode end,
        eligibility_attested = case when ${has('eligibility_attested')} then excluded.eligibility_attested else p.eligibility_attested end,
        manual_targets = case when ${has('manual_targets')} then excluded.manual_targets else p.manual_targets end,
        weekly_change_kg = case when ${has('weekly_change_kg')} then excluded.weekly_change_kg else p.weekly_change_kg end,
        calorie_adjustment = case when ${has('calorie_adjustment')} then excluded.calorie_adjustment else p.calorie_adjustment end,
        is_pregnant_or_postpartum = case when ${has('is_pregnant_or_postpartum')} then excluded.is_pregnant_or_postpartum else p.is_pregnant_or_postpartum end,
        is_lactating = case when ${has('is_lactating')} then excluded.is_lactating else p.is_lactating end,
        has_ckd_or_renal_condition = case when ${has('has_ckd_or_renal_condition')} then excluded.has_ckd_or_renal_condition else p.has_ckd_or_renal_condition end,
        has_ed_risk_flag = case when ${has('has_ed_risk_flag')} then excluded.has_ed_risk_flag else p.has_ed_risk_flag end,
        has_clinician_prescribed_diet = case when ${has('has_clinician_prescribed_diet')} then excluded.has_clinician_prescribed_diet else p.has_clinician_prescribed_diet end,
        has_major_illness_or_glucose_lowering_meds = case when ${has('has_major_illness_or_glucose_lowering_meds')} then excluded.has_major_illness_or_glucose_lowering_meds else p.has_major_illness_or_glucose_lowering_meds end,
        updated_at = now()
      returning p.*`
    return rows[0]
  }

  // --- Adaptive Fuel Plan: planned workouts (many per user per day) ----------
  async listPlannedWorkouts(userId, fromYmd, toYmd) {
    const sql = await this.ready()
    return sql`select * from planned_workouts where user_id = ${userId} and date between ${fromYmd} and ${toYmd} order by date asc, start_time asc nulls last, id asc`
  }

  async getPlannedWorkoutsForDay(userId, day) {
    return this.listPlannedWorkouts(userId, day, day)
  }

  // Creates a new session (no `id` on the input) or updates an existing one
  // the caller owns (an `id` for a row belonging to a DIFFERENT user updates
  // nothing — `where id = ... and user_id = ...` — so guessing another
  // user's id can never read or change their plan).
  async savePlannedWorkout(userId, w) {
    const sql = await this.ready()
    if (w.id != null) {
      const rows = await sql`
        update planned_workouts set
          date = ${w.date}, sport = ${w.sport}, start_time = ${w.start_time ?? null},
          duration_min = ${w.duration_min}, intensity = ${w.intensity}, distance_km = ${w.distance_km ?? null},
          is_key_session = ${!!w.is_key_session}, is_double_session = ${!!w.is_double_session},
          is_race = ${!!w.is_race}, carb_loading_opt_in = ${!!w.carb_loading_opt_in}, notes = ${w.notes ?? null}
        where id = ${w.id} and user_id = ${userId}
        returning *`
      return rows[0] || null
    }
    const rows = await sql`
      insert into planned_workouts (
        user_id, date, sport, start_time, duration_min, intensity, distance_km,
        is_key_session, is_double_session, is_race, carb_loading_opt_in, notes
      )
      values (
        ${userId}, ${w.date}, ${w.sport}, ${w.start_time ?? null}, ${w.duration_min}, ${w.intensity}, ${w.distance_km ?? null},
        ${!!w.is_key_session}, ${!!w.is_double_session}, ${!!w.is_race}, ${!!w.carb_loading_opt_in}, ${w.notes ?? null}
      )
      returning *`
    return rows[0]
  }

  async deletePlannedWorkout(userId, id) {
    const sql = await this.ready()
    const rows = await sql`delete from planned_workouts where id = ${id} and user_id = ${userId} returning id`
    return rows.length > 0
  }

  // --- Adaptive Fuel Plan: daily plan snapshots -------------------------------
  async getAfpDailyPlan(userId, date) {
    const sql = await this.ready()
    const rows = await sql`select * from afp_daily_plans where user_id = ${userId} and date = ${date} limit 1`
    return rows[0] || null
  }

  async saveAfpDailyPlan(userId, date, { engineVersion, scienceVersion = 'unversioned', inputSnapshot, inputSnapshotHash = '', plan, overrides = null }) {
    const sql = await this.ready()
    const rows = await sql`
      insert into afp_daily_plans (user_id, date, engine_version, science_version, revision, calculated_at, input_snapshot, input_snapshot_hash, plan, overrides)
      values (${userId}, ${date}, ${engineVersion}, ${scienceVersion}, 1, now(), ${JSON.stringify(inputSnapshot)}, ${inputSnapshotHash}, ${JSON.stringify(plan)}, ${overrides ? JSON.stringify(overrides) : null})
      on conflict (user_id, date) do update set
        engine_version = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then excluded.engine_version else afp_daily_plans.engine_version end,
        science_version = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then excluded.science_version else afp_daily_plans.science_version end,
        revision = afp_daily_plans.revision + case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then 1 else 0 end,
        calculated_at = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then now() else afp_daily_plans.calculated_at end,
        input_snapshot = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then excluded.input_snapshot else afp_daily_plans.input_snapshot end,
        input_snapshot_hash = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then excluded.input_snapshot_hash else afp_daily_plans.input_snapshot_hash end,
        plan = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then excluded.plan else afp_daily_plans.plan end,
        overrides = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then excluded.overrides else afp_daily_plans.overrides end,
        generated_at = case when afp_daily_plans.input_snapshot_hash is distinct from excluded.input_snapshot_hash then now() else afp_daily_plans.generated_at end
      returning *`
    return rows[0]
  }

  // Updates ONLY the overrides column of an already-computed day — never
  // touches engine_version/input_snapshot/plan, and never touches
  // afp_profile's own defaults (see docs/adaptive-fuel-plan.md). Returns null
  // if that day has no computed plan yet — the caller (server/index.js)
  // computes one first, which is the only path that can create the row.
  async setAfpDailyPlanOverrides(userId, date, overrides) {
    const sql = await this.ready()
    const rows = await sql`
      update afp_daily_plans set overrides = ${overrides ? JSON.stringify(overrides) : null}
      where user_id = ${userId} and date = ${date}
      returning *`
    return rows[0] || null
  }

  // --- Oathbearer RPG save ---------------------------------------------------
  async getRpgSave(userId) {
    const sql = await this.ready()
    const rows = await sql`
      select payload, game_schema_version, revision, created_at, updated_at
      from rpg_saves where user_id = ${userId} limit 1`
    return normalizeRpgSave(rows[0])
  }

  async putRpgSave(userId, input) {
    const sql = await this.ready()
    let rows
    if (input.expectedRevision === 0) {
      rows = await sql`
        with saved as (
          insert into rpg_saves (user_id, payload, game_schema_version, revision)
          values (${userId}, ${JSON.stringify(input.payload)}::jsonb, ${input.gameSchemaVersion}, 1)
          on conflict (user_id) do nothing
          returning payload, game_schema_version, revision, created_at, updated_at
        ), pruned as (
          delete from rpg_save_history
          where user_id = ${userId} and exists (select 1 from saved) and revision in (
            select revision from rpg_save_history where user_id = ${userId}
            order by revision desc offset 19
          )
        ), history as (
          insert into rpg_save_history (user_id, revision, payload, game_schema_version, created_at, saved_at)
          select ${userId}, revision, payload, game_schema_version, created_at, updated_at from saved
        )
        select payload, game_schema_version, revision, created_at, updated_at from saved`
    } else {
      rows = await sql`
        with saved as (
          update rpg_saves
          set payload = ${JSON.stringify(input.payload)}::jsonb,
              game_schema_version = ${input.gameSchemaVersion},
              revision = revision + 1,
              updated_at = now()
          where user_id = ${userId} and revision = ${input.expectedRevision}
          returning payload, game_schema_version, revision, created_at, updated_at
        ), pruned as (
          delete from rpg_save_history
          where user_id = ${userId} and exists (select 1 from saved) and revision in (
            select revision from rpg_save_history where user_id = ${userId}
            order by revision desc offset 19
          )
        ), history as (
          insert into rpg_save_history (user_id, revision, payload, game_schema_version, created_at, saved_at)
          select ${userId}, revision, payload, game_schema_version, created_at, updated_at from saved
        )
        select payload, game_schema_version, revision, created_at, updated_at from saved`
    }
    if (rows[0]) return { outcome: 'written', save: normalizeRpgSave(rows[0]) }
    // A write can lose a race after its optimistic check. Read the winner's
    // current row after the atomic INSERT/UPDATE so conflicts always report
    // the authoritative revision, not a stale pre-write snapshot.
    const current = await this.getRpgSave(userId)
    if (isIdempotentRpgSaveRetry(current, input)) return { outcome: 'idempotent', save: current }
    return { outcome: 'conflict', save: current }
  }

  async listRpgSaveHistory(userId) {
    const sql = await this.ready()
    const rows = await sql`
      select revision, game_schema_version, created_at, saved_at
      from rpg_save_history where user_id = ${userId}
      order by revision desc limit 20`
    return rows.map((row) => normalizeRpgSaveHistoryRow(row))
  }

  async restoreRpgSave(userId, { revision, expectedRevision }) {
    const sql = await this.ready()
    const rows = await sql`
      with restored as (
        update rpg_saves current_save
        set payload = historical.payload,
            game_schema_version = historical.game_schema_version,
            revision = current_save.revision + 1,
            updated_at = now()
        from rpg_save_history historical
        where current_save.user_id = ${userId}
          and current_save.revision = ${expectedRevision}
          and historical.user_id = ${userId}
          and historical.revision = ${revision}
        returning current_save.payload, current_save.game_schema_version, current_save.revision,
                  current_save.created_at, current_save.updated_at
      ), pruned as (
        delete from rpg_save_history
        where user_id = ${userId} and exists (select 1 from restored) and revision in (
          select revision from rpg_save_history where user_id = ${userId}
          order by revision desc offset 19
        )
      ), history as (
        insert into rpg_save_history (user_id, revision, payload, game_schema_version, created_at, saved_at)
        select ${userId}, revision, payload, game_schema_version, created_at, updated_at from restored
      )
      select payload, game_schema_version, revision, created_at, updated_at from restored`
    if (rows[0]) return { outcome: 'written', save: normalizeRpgSave(rows[0]) }
    const current = await this.getRpgSave(userId)
    if (!current || current.revision !== expectedRevision) return { outcome: 'conflict', save: current }
    const history = await this.listRpgSaveHistory(userId)
    return history.some((entry) => entry.revision === revision)
      ? { outcome: 'conflict', save: current }
      : { outcome: 'not_found', save: current }
  }

  // Complete account-owned data export. Credentials, OAuth tokens, Apple
  // ingest tokens, password hashes, and the shared food lookup cache are
  // deliberately excluded. Nutrition values used by a log entry are joined
  // in so the export remains intelligible without exposing the global cache.
  async exportUserData(userId) {
    const sql = await this.ready()
    const [
      accountRows,
      nutritionLogs,
      hydrationLogs,
      targetHistory,
      profileRows,
      ouraConnections,
      ouraWorkouts,
      garminConnections,
      garminDailies,
      integrations,
      wearableSignals,
      dailyPlans,
      afpProfileRows,
      plannedWorkouts,
      afpDailyPlans,
      rpgSaveRows,
      rpgHistoryRows,
    ] = await Promise.all([
      sql`select id, email, legal_version, legal_accepted_at, created_at from users where id = ${userId}`,
      sql`select e.id, e.food_id, e.logged_at, e.servings_consumed, e.meal, e.created_at,
                 f.name as food_name, f.brand as food_brand, f.barcode as food_barcode,
                 f.serving_size, f.serving_unit, f.calories, f.protein_g, f.carbs_g,
                 f.fat_g, f.fiber_g, f.sugar_g, f.sodium_mg, f.source as food_source
          from log_entries e join foods f on f.id = e.food_id
          where e.user_id = ${userId} order by e.logged_at asc, e.id asc`,
      sql`select id, amount_ml, logged_at, created_at from water_entries where user_id = ${userId} order by logged_at asc, id asc`,
      sql`select * from daily_targets where user_id = ${userId} order by effective_from asc, id asc`,
      sql`select * from profile where user_id = ${userId}`,
      sql`select id, label, expires_at, created_at from oura_accounts where user_id = ${userId} order by id asc`,
      sql`select w.* from oura_workouts w join oura_accounts a on a.id = w.account_id where a.user_id = ${userId} order by w.day asc, w.id asc`,
      sql`select id, label, garmin_user_id, expires_at, created_at from garmin_accounts where user_id = ${userId} order by id asc`,
      sql`select d.* from garmin_dailies d join garmin_accounts a on a.id = d.account_id where a.user_id = ${userId} order by d.day asc, d.id asc`,
      sql`select user_id, provider, enabled, demo, connected_at, last_synced_at, error,
                 settings - 'ingest_token' as settings
          from integrations where user_id = ${userId} order by provider asc`,
      sql`select * from wearable_signals where user_id = ${userId} order by day asc, id asc`,
      sql`select * from daily_plans where user_id = ${userId} order by date asc`,
      sql`select * from afp_profile where user_id = ${userId}`,
      sql`select * from planned_workouts where user_id = ${userId} order by date asc, start_time asc nulls last, id asc`,
      sql`select * from afp_daily_plans where user_id = ${userId} order by date asc`,
      sql`select payload, game_schema_version, revision, created_at, updated_at from rpg_saves where user_id = ${userId}`,
      sql`select revision, payload, game_schema_version, created_at, saved_at from rpg_save_history where user_id = ${userId} order by revision asc`,
    ])
    return {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      exclusions: ['password and session credentials', 'provider OAuth and ingest tokens', 'shared food lookup cache'],
      source_attribution: { garmin: 'Garmin', oura: 'Oura', apple: 'Apple Health (device-originated)' },
      account: accountRows[0] || null,
      nutrition_logs: nutritionLogs,
      hydration_logs: hydrationLogs.map(normalizeWaterEntry),
      hydration_preferences: await this.getHydrationPreferences(userId),
      target_history: targetHistory,
      profile: profileRows[0] || null,
      provider_connections: { oura: ouraConnections, garmin: garminConnections, settings: integrations },
      wearable_data: { signals: wearableSignals, oura_workouts: ouraWorkouts, garmin_dailies: garminDailies },
      planning: {
        legacy_daily_plans: dailyPlans,
        adaptive_profile: afpProfileRows[0] || null,
        workouts: plannedWorkouts,
        daily_plans: afpDailyPlans,
      },
      rpg_save: normalizeRpgSave(rpgSaveRows[0]),
      rpg_save_history: rpgHistoryRows.map((row) => normalizeRpgSaveHistoryRow(row, { includePayload: true })),
    }
  }

  async deleteUser(userId) {
    const sql = await this.ready()
    const rows = await sql`delete from users where id = ${userId} returning id`
    return rows.length > 0
  }

  // Ownerless pre-account rows must never be assigned to a signup. Operators
  // may run this explicit cleanup before enabling invites; it is deliberately
  // a deletion, not a guessed attribution.
  async countUnownedLegacyRows() {
    const sql = await this.ready()
    const rows = await sql`select (select count(*) from log_entries where user_id is null) + (select count(*) from daily_targets where user_id is null) + (select count(*) from oura_accounts where user_id is null) + (select count(*) from garmin_accounts where user_id is null) + (select count(*) from wearable_signals where user_id is null) + (select count(*) from daily_plans where user_id is null) as count`
    return Number(rows[0]?.count || 0)
  }
  async cleanupUnownedLegacyRows() {
    const sql = await this.ready()
    await sql`delete from log_entries where user_id is null`; await sql`delete from daily_targets where user_id is null`
    await sql`delete from oura_accounts where user_id is null`; await sql`delete from garmin_accounts where user_id is null`
    await sql`delete from wearable_signals where user_id is null`; await sql`delete from daily_plans where user_id is null`
    return this.countUnownedLegacyRows()
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
    this.userCreation = Promise.resolve()
    this.rpgSaveWrites = Promise.resolve()
    this.passwordRecoveryWrites = Promise.resolve()
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
      this.data = { foods: [], entries: [], water_entries: [], targets: [], users: [], alpha_invite_redemptions: [], seq: { food: 0, entry: 0, water: 0, target: 0, user: 0 } }
    }
    // Older on-disk stores predate `users`/per-row user_id — nothing to
    // migrate automatically here (unlike a real ALTER TABLE, a missing key
    // just reads as undefined/absent, which every method below already
    // treats as "no owner" and filters out safely). migrateLegacyDataToUser
    // exists for symmetry with PgStore and for the same explicit one-time
    // backfill path.
    this.data.users = this.data.users || []
    this.data.alpha_invite_redemptions = this.data.alpha_invite_redemptions || []
    this.data.password_recovery_challenges = this.data.password_recovery_challenges || []
    this.data.rpg_saves = this.data.rpg_saves || {}
    this.data.rpg_save_history = this.data.rpg_save_history || {}
    this.data.water_entries = this.data.water_entries || []
    this.data.seq = this.data.seq || {}
    this.data.seq.user = this.data.seq.user || 0
    this.data.seq.password_recovery = this.data.seq.password_recovery || 0
    this.data.seq.water = this.data.seq.water || 0
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
  async createUser({ email, password_hash, legal_version = null, invite_code_digest = null }) {
    // Signup is the one JSON mutation that has two independent uniqueness
    // keys (email and invitation digest). Serialize the complete check + push
    // + durable write so simultaneous requests against a fresh file cannot
    // both pass before either redemption becomes visible.
    const create = async () => {
      const d = await this.load()
      if (invite_code_digest && d.alpha_invite_redemptions.some((row) => row.code_digest === invite_code_digest)) {
        throw inviteUnavailableError()
      }
      if (d.users.find((u) => u.email === email)) {
        const err = new Error('An account with that email already exists.')
        err.status = 409
        throw err
      }
      const now = new Date().toISOString()
      const row = {
        id: ++d.seq.user,
        email,
        password_hash,
        legal_version,
        legal_accepted_at: legal_version ? now : null,
        invite_code_digest: invite_code_digest || null,
        session_version: 1,
        created_at: now,
      }
      d.users.push(row)
      if (invite_code_digest) {
        d.alpha_invite_redemptions.push({ code_digest: invite_code_digest, user_id: row.id, redeemed_at: now })
      }
      await this.persist()
      return { id: row.id, email: row.email, created_at: row.created_at }
    }
    const operation = this.userCreation.then(create, create)
    this.userCreation = operation.then(() => undefined, () => undefined)
    return operation
  }

  async getUserByEmail(email) {
    const d = await this.load()
    return d.users.find((u) => u.email === email) || null
  }

  async getUserById(id) {
    const d = await this.load()
    const u = d.users.find((u) => u.id === Number(id))
    return u ? { id: u.id, email: u.email, legal_version: u.legal_version || null, legal_accepted_at: u.legal_accepted_at || null, session_version: Number(u.session_version) || 1, created_at: u.created_at } : null
  }

  async createPasswordRecoveryChallenge({ user_id, start_token_digest, oauth_state_digest, expires_at }) {
    const d = await this.load()
    const row = { id: ++d.seq.password_recovery, user_id: user_id == null ? null : Number(user_id), start_token_digest, oauth_state_digest, recovery_token_digest: null, expires_at, verified_at: null, consumed_at: null, created_at: new Date().toISOString() }
    d.password_recovery_challenges.push(row)
    await this.persist()
    return { ...row }
  }

  async pruneExpiredPasswordRecoveries() {
    const d = await this.load()
    const before = d.password_recovery_challenges.length
    d.password_recovery_challenges = d.password_recovery_challenges.filter((row) => Date.parse(row.expires_at) > Date.now())
    if (d.password_recovery_challenges.length !== before) await this.persist()
    return before - d.password_recovery_challenges.length
  }

  async getPasswordRecoveryByStartToken(startTokenDigest) {
    const d = await this.load()
    return d.password_recovery_challenges.find((row) => row.start_token_digest === startTokenDigest) || null
  }

  async getPasswordRecoveryByOauthState(oauthStateDigest) {
    const d = await this.load()
    return d.password_recovery_challenges.find((row) => row.oauth_state_digest === oauthStateDigest) || null
  }

  async activatePasswordRecovery(id, recoveryTokenDigest, expiresAt) {
    const operation = async () => {
      const d = await this.load()
      const row = d.password_recovery_challenges.find((item) => item.id === Number(id))
      if (!row || row.user_id == null || row.verified_at || row.recovery_token_digest || row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return false
      row.recovery_token_digest = recoveryTokenDigest
      row.verified_at = new Date().toISOString()
      row.expires_at = expiresAt
      await this.persist()
      return true
    }
    const pending = this.passwordRecoveryWrites.then(operation, operation)
    this.passwordRecoveryWrites = pending.then(() => undefined, () => undefined)
    return pending
  }

  async consumePasswordRecovery(recoveryTokenDigest, passwordHash) {
    const operation = async () => {
      const d = await this.load()
      const row = d.password_recovery_challenges.find((item) => item.recovery_token_digest === recoveryTokenDigest)
      if (!row || !row.verified_at || row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return null
      const user = d.users.find((item) => item.id === Number(row.user_id))
      if (!user) return null
      row.consumed_at = new Date().toISOString()
      user.password_hash = passwordHash
      user.session_version = (Number(user.session_version) || 1) + 1
      const appleKey = `${user.id}:apple`
      const apple = d.integrations?.[appleKey]
      if (apple?.settings) {
        const { ingest_token, ...settings } = apple.settings
        apple.settings = settings
      }
      await this.persist()
      return { id: user.id, email: user.email, legal_version: user.legal_version || null, legal_accepted_at: user.legal_accepted_at || null, session_version: user.session_version, created_at: user.created_at }
    }
    const pending = this.passwordRecoveryWrites.then(operation, operation)
    this.passwordRecoveryWrites = pending.then(() => undefined, () => undefined)
    return pending
  }

  async acceptLegalVersion(userId, legalVersion) {
    const d = await this.load()
    const u = d.users.find((row) => row.id === Number(userId))
    if (!u) return null
    u.legal_version = legalVersion
    u.legal_accepted_at = new Date().toISOString()
    await this.persist()
    return { id: u.id, email: u.email, legal_version: u.legal_version, legal_accepted_at: u.legal_accepted_at, created_at: u.created_at }
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

  async getHydrationPreferences(userId) {
    const d = await this.load()
    return normalizeHydrationPreferences(d.hydration_preferences?.[Number(userId)])
  }
  async setHydrationPreferences(userId, preferences) {
    const d = await this.load()
    d.hydration_preferences ||= {}
    d.hydration_preferences[Number(userId)] = normalizeHydrationPreferences({ ...normalizeHydrationPreferences(d.hydration_preferences[Number(userId)]), ...preferences })
    await this.persist()
    return normalizeHydrationPreferences(d.hydration_preferences[Number(userId)])
  }
  async listWaterEntries(userId, { from, to }) {
    const d = await this.load(); const uid = Number(userId)
    const start = this.#utcIso(from); const end = this.#utcIso(to)
    return d.water_entries.filter((entry) => entry.user_id === uid && entry.logged_at >= start && entry.logged_at < end)
      .sort((a, b) => String(a.logged_at).localeCompare(String(b.logged_at)) || a.id - b.id)
  }
  async addWaterEntry(userId, { amount_ml, logged_at = null }) {
    const d = await this.load()
    const row = { id: ++d.seq.water, user_id: Number(userId), amount_ml: Number(amount_ml), logged_at: logged_at ? this.#utcIso(logged_at) : new Date().toISOString(), created_at: new Date().toISOString() }
    d.water_entries.push(row); await this.persist(); return { ...row }
  }
  async updateWaterEntry(userId, id, patch) {
    const d = await this.load(); const row = d.water_entries.find((entry) => entry.id === Number(id) && entry.user_id === Number(userId))
    if (!row) return null
    if (patch.amount_ml !== undefined) row.amount_ml = Number(patch.amount_ml)
    if (patch.logged_at !== undefined) row.logged_at = this.#utcIso(patch.logged_at)
    await this.persist(); return { ...row }
  }
  async deleteWaterEntry(userId, id) {
    const d = await this.load(); const index = d.water_entries.findIndex((entry) => entry.id === Number(id) && entry.user_id === Number(userId))
    if (index < 0) return false
    d.water_entries.splice(index, 1); await this.persist(); return true
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

  async saveOuraAccount(userId, { label, oura_user_id = null, access_token, refresh_token, expires_at }) {
    const d = await this.load()
    d.oura_accounts = d.oura_accounts || []
    const canonical = oura_user_id ? d.oura_accounts.find((row) => row.oura_user_id === oura_user_id) : null
    if (canonical && canonical.user_id !== Number(userId)) throw Object.assign(new Error('This Oura account is already linked.'), { status: 409 })
    if (canonical) {
      Object.assign(canonical, { label: label || null, access_token, refresh_token, expires_at: expires_at || null })
      await this.persist()
      return canonical
    }
    d.seq.oura = (d.seq.oura || 0) + 1
    const row = {
      id: d.seq.oura,
      user_id: Number(userId),
      label: label || null,
      oura_user_id,
      access_token,
      refresh_token,
      expires_at: expires_at || null,
      created_at: new Date().toISOString(),
    }
    d.oura_accounts.push(row)
    await this.persist()
    return row
  }

  async setOuraUserId(userId, id, ouraUserId) {
    const d = await this.load()
    if ((d.oura_accounts || []).some((row) => row.oura_user_id === ouraUserId && row.user_id !== Number(userId))) return false
    const account = (d.oura_accounts || []).find((row) => row.id === Number(id) && row.user_id === Number(userId) && !row.oura_user_id)
    if (!account) return false
    account.oura_user_id = ouraUserId
    await this.persist()
    return true
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
    m.settings = { ...(d.integrations[key]?.settings || {}), ...(patch.settings || {}) }
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

  async mergeAppleSignals(userId, day, rows) {
    if (!rows.length) return 0
    const d = await this.load()
    for (const r of rows) {
      if (r.metric !== 'workout' && (d.wearable_signals || []).some((s) => s.user_id === Number(userId) && s.provider === 'apple' && s.day === day && s.metric === r.metric && Date.parse(s.recorded_at) > Date.parse(r.recorded_at))) continue
      d.wearable_signals = (d.wearable_signals || []).filter((s) => !(s.user_id === Number(userId) && s.provider === 'apple' && s.day === day && s.metric === r.metric && (r.metric !== 'workout' || new Date(s.recorded_at).getTime() === new Date(r.recorded_at).getTime())))
      d.wearable_signals.push({ ...r, user_id: Number(userId), provider: 'apple', day })
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

  async listTrainingWorkouts(userId, provider, fromYmd, toYmd) {
    const d = await this.load()
    const inRange = r => r.day >= fromYmd && r.day <= toYmd
    if (provider === 'oura') {
      const ids = new Set((d.oura_accounts || []).filter(a => a.user_id === Number(userId)).map(a => a.id))
      return (d.oura_workouts || []).filter(r => ids.has(r.account_id) && inRange(r))
    }
    if (provider === 'apple') return (d.wearable_signals || []).filter(r => r.user_id === Number(userId) && r.provider === 'apple' && r.metric === 'workout' && inRange(r))
    return []
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

  // --- Adaptive Fuel Plan: profile (JsonStore mirror of PgStore's afp_profile)
  async getAfpProfile(userId) {
    const d = await this.load()
    d.afp_profiles = d.afp_profiles || {}
    const p = d.afp_profiles[userId]
    return { ...DEFAULT_AFP_PROFILE, ...(p || {}) }
  }

  async setAfpProfile(userId, patch) {
    const d = await this.load()
    d.afp_profiles = d.afp_profiles || {}
    const cur = d.afp_profiles[userId] || { ...DEFAULT_AFP_PROFILE }
    const m = { ...cur, ...patch, updated_at: new Date().toISOString() }
    d.afp_profiles[userId] = m
    await this.persist()
    return { ...m }
  }

  // --- Adaptive Fuel Plan: planned workouts -----------------------------------
  async listPlannedWorkouts(userId, fromYmd, toYmd) {
    const d = await this.load()
    const uid = Number(userId)
    // '~' sorts after any real 'HH:MM' string under plain UTF-16 code-unit
    // comparison (never localeCompare, whose punctuation collation is not
    // guaranteed to order '~' after digits) — matching PgStore's `order by
    // ... start_time asc nulls last`: a session with no fixed start time
    // lists last, not first.
    const timeKey = (w) => w.start_time || '~'
    return (d.planned_workouts || [])
      .filter((w) => w.user_id === uid && w.date >= fromYmd && w.date <= toYmd)
      .sort((a, b) => (a.date === b.date ? (timeKey(a) < timeKey(b) ? -1 : timeKey(a) > timeKey(b) ? 1 : 0) : a.date < b.date ? -1 : 1))
      .map((w) => ({ ...w }))
  }

  async getPlannedWorkoutsForDay(userId, day) {
    return this.listPlannedWorkouts(userId, day, day)
  }

  async savePlannedWorkout(userId, w) {
    const d = await this.load()
    d.planned_workouts = d.planned_workouts || []
    const uid = Number(userId)
    const fields = {
      date: w.date, sport: w.sport, start_time: w.start_time ?? null, duration_min: w.duration_min,
      intensity: w.intensity, distance_km: w.distance_km ?? null, is_key_session: !!w.is_key_session,
      is_double_session: !!w.is_double_session, is_race: !!w.is_race,
      carb_loading_opt_in: !!w.carb_loading_opt_in, notes: w.notes ?? null,
    }
    if (w.id != null) {
      const row = d.planned_workouts.find((x) => x.id === Number(w.id) && x.user_id === uid)
      if (!row) return null // not found, or belongs to a different user
      Object.assign(row, fields)
      await this.persist()
      return { ...row }
    }
    d.seq.planned_workout = (d.seq.planned_workout || 0) + 1
    const row = { id: d.seq.planned_workout, user_id: uid, created_at: new Date().toISOString(), ...fields }
    d.planned_workouts.push(row)
    await this.persist()
    return { ...row }
  }

  async deletePlannedWorkout(userId, id) {
    const d = await this.load()
    const uid = Number(userId)
    const before = (d.planned_workouts || []).length
    d.planned_workouts = (d.planned_workouts || []).filter((w) => !(w.id === Number(id) && w.user_id === uid))
    await this.persist()
    return d.planned_workouts.length < before
  }

  // --- Adaptive Fuel Plan: daily plan snapshots --------------------------------
  async getAfpDailyPlan(userId, date) {
    const d = await this.load()
    return (d.afp_daily_plans || {})[`${userId}:${date}`] || null
  }

  async saveAfpDailyPlan(userId, date, { engineVersion, scienceVersion = 'unversioned', inputSnapshot, inputSnapshotHash = '', plan, overrides = null }) {
    const d = await this.load()
    d.afp_daily_plans = d.afp_daily_plans || {}
    const existing = d.afp_daily_plans[`${userId}:${date}`]
    const now = new Date().toISOString()
    const row = {
      user_id: Number(userId), date, engine_version: engineVersion, input_snapshot: inputSnapshot,
      input_snapshot_hash: inputSnapshotHash, science_version: scienceVersion,
      revision: (Number(existing?.revision) || 0) + 1, calculated_at: now,
      plan, overrides, generated_at: now,
    }
    d.afp_daily_plans[`${userId}:${date}`] = row
    await this.persist()
    return row
  }

  async setAfpDailyPlanOverrides(userId, date, overrides) {
    const d = await this.load()
    d.afp_daily_plans = d.afp_daily_plans || {}
    const key = `${userId}:${date}`
    const row = d.afp_daily_plans[key]
    if (!row) return null
    row.overrides = overrides
    await this.persist()
    return { ...row }
  }

  // --- Oathbearer RPG save ---------------------------------------------------
  async getRpgSave(userId) {
    const d = await this.load()
    return normalizeRpgSave(d.rpg_saves?.[Number(userId)])
  }

  async putRpgSave(userId, input) {
    const run = async () => {
      const d = await this.load()
      const uid = Number(userId)
      const current = d.rpg_saves?.[uid] || null
      if (current) {
        if (current.revision !== input.expectedRevision) {
          const save = normalizeRpgSave(current)
          return isIdempotentRpgSaveRetry(save, input)
            ? { outcome: 'idempotent', save }
            : { outcome: 'conflict', save }
        }
      } else if (input.expectedRevision !== 0) {
        return { outcome: 'conflict', save: null }
      }
      const now = new Date().toISOString()
      const row = {
        user_id: uid,
        payload: structuredClone(input.payload),
        game_schema_version: input.gameSchemaVersion,
        revision: current ? current.revision + 1 : 1,
        created_at: current?.created_at || now,
        updated_at: now,
      }
      d.rpg_saves[uid] = row
      const history = d.rpg_save_history[uid] || []
      history.push(structuredClone({
        user_id: uid,
        revision: row.revision,
        payload: row.payload,
        game_schema_version: row.game_schema_version,
        created_at: row.created_at,
        saved_at: row.updated_at,
      }))
      d.rpg_save_history[uid] = history
        .sort((a, b) => b.revision - a.revision)
        .slice(0, 20)
      await this.persist()
      return { outcome: 'written', save: normalizeRpgSave(row) }
    }
    // Serialize the compare + mutation, not only the disk write. Otherwise
    // two simultaneous updates could both observe the same revision and both
    // claim success before the persist queue ever sees them.
    const result = this.rpgSaveWrites.then(run, run)
    this.rpgSaveWrites = result.then(() => undefined, () => undefined)
    return result
  }

  async listRpgSaveHistory(userId) {
    const d = await this.load()
    return (d.rpg_save_history?.[Number(userId)] || [])
      .slice()
      .sort((a, b) => b.revision - a.revision)
      .slice(0, 20)
      .map((row) => normalizeRpgSaveHistoryRow(row))
  }

  async restoreRpgSave(userId, { revision, expectedRevision }) {
    const run = async () => {
      const d = await this.load()
      const uid = Number(userId)
      const current = d.rpg_saves?.[uid] || null
      if (!current || current.revision !== expectedRevision) {
        return { outcome: 'conflict', save: normalizeRpgSave(current) }
      }
      const historical = (d.rpg_save_history?.[uid] || []).find((row) => row.revision === revision)
      if (!historical) return { outcome: 'not_found', save: normalizeRpgSave(current) }
      const now = new Date().toISOString()
      const row = {
        user_id: uid,
        payload: structuredClone(historical.payload),
        game_schema_version: historical.game_schema_version,
        revision: current.revision + 1,
        created_at: current.created_at,
        updated_at: now,
      }
      d.rpg_saves[uid] = row
      const history = d.rpg_save_history[uid] || []
      history.push(structuredClone({
        user_id: uid,
        revision: row.revision,
        payload: row.payload,
        game_schema_version: row.game_schema_version,
        created_at: row.created_at,
        saved_at: row.updated_at,
      }))
      d.rpg_save_history[uid] = history
        .sort((a, b) => b.revision - a.revision)
        .slice(0, 20)
      await this.persist()
      return { outcome: 'written', save: normalizeRpgSave(row) }
    }
    const result = this.rpgSaveWrites.then(run, run)
    this.rpgSaveWrites = result.then(() => undefined, () => undefined)
    return result
  }

  async exportUserData(userId) {
    const d = await this.load()
    const uid = Number(userId)
    const account = d.users.find((u) => u.id === uid)
    const safeAccount = account ? {
      id: account.id,
      email: account.email,
      legal_version: account.legal_version ?? null,
      legal_accepted_at: account.legal_accepted_at ?? null,
      created_at: account.created_at,
    } : null
    const nutritionLogs = d.entries
      .filter((entry) => entry.user_id === uid)
      .map((entry) => ({ ...entry, food: exportFood(d.foods.find((food) => food.id === entry.food_id)) }))
      .sort((a, b) => String(a.logged_at).localeCompare(String(b.logged_at)))
    const hydrationLogs = (d.water_entries || []).filter((entry) => entry.user_id === uid)
      .sort((a, b) => String(a.logged_at).localeCompare(String(b.logged_at)))
    const ouraAccountIds = new Set((d.oura_accounts || []).filter((a) => a.user_id === uid).map((a) => a.id))
    const garminAccountIds = new Set((d.garmin_accounts || []).filter((a) => a.user_id === uid).map((a) => a.id))
    const ouraConnections = (d.oura_accounts || [])
      .filter((a) => a.user_id === uid)
      .map(({ access_token, refresh_token, ...safe }) => safe)
    const garminConnections = (d.garmin_accounts || [])
      .filter((a) => a.user_id === uid)
      .map(({ access_token, refresh_token, ...safe }) => safe)
    const integrations = Object.values(d.integrations || {})
      .filter((row) => row.user_id === uid)
      .map(exportIntegration)
    const byUser = (row) => row.user_id === uid
    const valuesForUser = (object = {}) => Object.values(object).filter(byUser)
    return {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      exclusions: ['password and session credentials', 'provider OAuth and ingest tokens', 'shared food lookup cache'],
      source_attribution: { garmin: 'Garmin', oura: 'Oura', apple: 'Apple Health (device-originated)' },
      account: safeAccount,
      nutrition_logs: nutritionLogs,
      hydration_logs: hydrationLogs,
      hydration_preferences: normalizeHydrationPreferences(d.hydration_preferences?.[uid]),
      target_history: d.targets.filter(byUser),
      profile: d.profiles?.[uid] || null,
      provider_connections: { oura: ouraConnections, garmin: garminConnections, settings: integrations },
      wearable_data: {
        signals: (d.wearable_signals || []).filter(byUser),
        oura_workouts: (d.oura_workouts || []).filter((row) => ouraAccountIds.has(row.account_id)),
        garmin_dailies: (d.garmin_dailies || []).filter((row) => garminAccountIds.has(row.account_id)),
      },
      planning: {
        legacy_daily_plans: valuesForUser(d.daily_plans),
        adaptive_profile: d.afp_profiles?.[uid] || null,
        workouts: (d.planned_workouts || []).filter(byUser),
        daily_plans: valuesForUser(d.afp_daily_plans),
      },
      rpg_save: normalizeRpgSave(d.rpg_saves?.[uid]),
      rpg_save_history: (d.rpg_save_history?.[uid] || [])
        .slice()
        .sort((a, b) => a.revision - b.revision)
        .map((row) => normalizeRpgSaveHistoryRow(row, { includePayload: true })),
    }
  }

  async deleteUser(userId) {
    const d = await this.load()
    const uid = Number(userId)
    if (!d.users.some((u) => u.id === uid)) return false
    const ouraAccountIds = new Set((d.oura_accounts || []).filter((a) => a.user_id === uid).map((a) => a.id))
    const garminAccountIds = new Set((d.garmin_accounts || []).filter((a) => a.user_id === uid).map((a) => a.id))
    d.users = d.users.filter((u) => u.id !== uid)
    for (const redemption of d.alpha_invite_redemptions || []) {
      if (redemption.user_id === uid) redemption.user_id = null
    }
    d.entries = d.entries.filter((row) => row.user_id !== uid)
    d.water_entries = (d.water_entries || []).filter((row) => row.user_id !== uid)
    if (d.hydration_preferences) delete d.hydration_preferences[uid]
    d.targets = d.targets.filter((row) => row.user_id !== uid)
    d.oura_accounts = (d.oura_accounts || []).filter((row) => row.user_id !== uid)
    d.oura_workouts = (d.oura_workouts || []).filter((row) => !ouraAccountIds.has(row.account_id))
    d.garmin_accounts = (d.garmin_accounts || []).filter((row) => row.user_id !== uid)
    d.garmin_dailies = (d.garmin_dailies || []).filter((row) => !garminAccountIds.has(row.account_id))
    d.wearable_signals = (d.wearable_signals || []).filter((row) => row.user_id !== uid)
    d.planned_workouts = (d.planned_workouts || []).filter((row) => row.user_id !== uid)
    if (d.rpg_saves) delete d.rpg_saves[uid]
    if (d.rpg_save_history) delete d.rpg_save_history[uid]
    for (const name of ['profiles', 'afp_profiles']) {
      if (d[name]) delete d[name][uid]
    }
    for (const name of ['integrations', 'daily_plans', 'afp_daily_plans']) {
      for (const [key, row] of Object.entries(d[name] || {})) {
        if (row.user_id === uid) delete d[name][key]
      }
    }
    await this.persist()
    return true
  }

  async countUnownedLegacyRows() {
    const d = await this.load()
    return [...(d.entries || []), ...(d.targets || []), ...(d.oura_accounts || []), ...(d.garmin_accounts || []), ...(d.wearable_signals || []), ...Object.values(d.daily_plans || {})].filter((row) => row?.user_id == null).length
  }
  async cleanupUnownedLegacyRows() {
    const d = await this.load()
    for (const key of ['entries', 'targets', 'oura_accounts', 'garmin_accounts', 'wearable_signals']) d[key] = (d[key] || []).filter((row) => row.user_id != null)
    for (const [key, row] of Object.entries(d.daily_plans || {})) if (row?.user_id == null) delete d.daily_plans[key]
    await this.persist(); return 0
  }
}

function makeStore() {
  const url = process.env.DATABASE_URL
  if (url) {
    return { store: new PgStore(url), backend: 'postgres' }
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_EPHEMERAL_STORAGE !== 'true') {
    throw new Error(
      'DATABASE_URL is required in production. Refusing to start with the disposable JSON store. ' +
      'Set ALLOW_EPHEMERAL_STORAGE=true only for an intentionally disposable preview.',
    )
  }
  const file = path.join(__dirname, '.data', 'store.json')
  return { store: new JsonStore(file), backend: 'json-file' }
}

export const { store, backend } = makeStore()
