// Express API: proxies nutrition lookups (keeping keys server-side) and gates
// all reads/writes to the storage layer. The frontend only ever calls /api/*.
import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { store, backend } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { lookupByBarcode, searchByText } from './lookup.js'
import { parseLabel, ocrConfigured } from './ocr.js'
import {
  ouraConfigured,
  getToken as ouraToken,
  dailySummary as ouraDailySummary,
  activityRange as ouraActivityRange,
  oauthConfigured as ouraOAuthConfigured,
  signState as ouraSignState,
  verifyState as ouraVerifyState,
  authorizeUrl as ouraAuthorizeUrl,
  exchangeCode as ouraExchangeCode,
  fetchPersonalInfo as ouraPersonalInfo,
  validAccessToken as ouraValidAccessToken,
  expiryFrom as ouraExpiryFrom,
} from './integrations/oura.js'
import {
  garminConfigured,
  pkcePair as garminPkcePair,
  authorizeUrl as garminAuthorizeUrl,
  exchangeCode as garminExchangeCode,
  normalizeDaily as garminNormalizeDaily,
  expiryFrom as garminExpiryFrom,
} from './integrations/garmin.js'
import { computeAdjustedTargets, computeRecommendation } from './plan.js'
import { computeBaseline } from './planCalc.js'
import { allProviderStatuses, composeSignals } from './providers.js'

const app = express()
// Label photos are base64 — allow a generous body size.
app.use(express.json({ limit: '15mb' }))
app.use(cors())

const asyncH = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.status || 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: err.message || 'Server error' })
  })

// --- health ---------------------------------------------------------------
app.get('/api/health', asyncH(async (req, res) => {
  res.json({
    ok: true,
    backend, // 'postgres' | 'json-file'
    ocr: ocrConfigured() ? 'configured' : 'not-configured',
    usda: process.env.FDC_API_KEY ? 'configured' : 'not-configured',
    oura: ouraConfigured() ? 'legacy-token' : ouraOAuthConfigured() ? 'oauth' : 'not-configured',
    garmin: garminConfigured() ? 'oauth' : 'not-configured',
    time: new Date().toISOString(),
  })
}))

// --- barcode lookup (cache -> OFF -> USDA) ---------------------------------
app.get('/api/lookup/:barcode', asyncH(async (req, res) => {
  const barcode = String(req.params.barcode).trim()
  if (!/^\d{6,14}$/.test(barcode)) {
    return res.status(400).json({ error: 'Invalid barcode.' })
  }

  // 1. Local cache — repeat scans never hit the network.
  const cached = await store.getFoodByBarcode(barcode)
  if (cached) return res.json({ food: cached, cached: true })

  // 2. Open Food Facts, then USDA.
  const found = await lookupByBarcode(barcode)
  if (!found) {
    return res.status(404).json({ error: 'Product not found in Open Food Facts or USDA.', barcode })
  }

  // 3. Cache the hit so it's instant next time.
  const saved = await store.upsertFoodByBarcode(found)
  res.json({ food: saved, cached: false })
}))

// --- text search (produce / bulk / no barcode) ----------------------------
app.get('/api/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ results: [] })
  const results = await searchByText(q)
  res.json({ results })
}))

// --- label OCR (Claude vision) --------------------------------------------
app.post('/api/ocr', asyncH(async (req, res) => {
  const { imageBase64, mediaType } = req.body || {}
  const food = await parseLabel({ imageBase64, mediaType })
  res.json({ food })
}))

// --- foods ----------------------------------------------------------------
// Recently-logged foods, for one-tap re-logging.
app.get('/api/foods/recent', asyncH(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  res.json({ foods: await store.recentFoods(limit) })
}))

// Persist a food (manual entry, or an OCR/search result the user confirmed)
// so it can be referenced by log entries and re-used later.
app.post('/api/foods', asyncH(async (req, res) => {
  const body = req.body || {}
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'A food needs a name.' })
  }
  const food = body.barcode
    ? await store.upsertFoodByBarcode(body)
    : await store.createFood(body)
  res.status(201).json({ food })
}))

// --- log entries ----------------------------------------------------------
app.get('/api/entries', asyncH(async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' })
  const entries = await store.listEntries({ from, to })
  res.json({ entries })
}))

// Log a food. Accepts either an existing food_id, or an inline `food` object
// (from a lookup/OCR/manual flow) which is persisted first, then logged.
app.post('/api/entries', asyncH(async (req, res) => {
  const { food_id, food, servings_consumed = 1, meal = null, logged_at = null } = req.body || {}

  let id = food_id
  if (!id) {
    if (!food || !food.name) return res.status(400).json({ error: 'Provide food_id or a food object.' })
    const saved = food.barcode
      ? await store.upsertFoodByBarcode(food)
      : await store.createFood(food)
    id = saved.id
  } else if (!(await store.getFood(id))) {
    return res.status(404).json({ error: 'food_id not found.' })
  }

  const entry = await store.addEntry({ food_id: id, servings_consumed, meal, logged_at })
  res.status(201).json({ entry })
}))

app.patch('/api/entries/:id', asyncH(async (req, res) => {
  const entry = await store.updateEntry(req.params.id, req.body || {})
  if (!entry) return res.status(404).json({ error: 'Entry not found.' })
  res.json({ entry })
}))

app.delete('/api/entries/:id', asyncH(async (req, res) => {
  const ok = await store.deleteEntry(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Entry not found.' })
  res.status(204).end()
}))

// --- daily targets --------------------------------------------------------
app.get('/api/targets', asyncH(async (req, res) => {
  res.json({ targets: await store.getLatestTargets() })
}))

app.put('/api/targets', asyncH(async (req, res) => {
  const targets = await store.setTargets(req.body || {})
  res.json({ targets })
}))

// --- biometric profile + calculated baseline -------------------------------
const PROFILE_ENUMS = {
  sex: ['male', 'female'],
  activity_level: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
  goal: ['maintain', 'lose_fat', 'build_muscle', 'endurance'],
  units_pref: ['imperial', 'metric'],
}
// height_cm/weight_kg/age_years — canonical storage is always metric; the
// client converts imperial input before it reaches this endpoint.
const PROFILE_NUMERIC_FIELDS = ['height_cm', 'weight_kg', 'age_years']

// Validates a PUT /api/profile body into a clean patch, or returns an error
// string. Unknown/undefined keys are left out of the patch entirely so a
// partial update (one field at a time) can't clobber fields the caller didn't
// send — store.setProfile does the actual merge.
function validateProfilePatch(body = {}) {
  const patch = {}
  for (const [key, allowed] of Object.entries(PROFILE_ENUMS)) {
    if (!(key in body)) continue
    const v = body[key]
    if (v === null && key !== 'units_pref') { patch[key] = null; continue } // units_pref always has a value
    if (!allowed.includes(v)) return { error: `${key} must be one of: ${allowed.join(', ')}${key === 'units_pref' ? '' : ', or null'}.` }
    patch[key] = v
  }
  for (const key of PROFILE_NUMERIC_FIELDS) {
    if (!(key in body)) continue
    const v = body[key]
    if (v === null) { patch[key] = null; continue }
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return { error: `${key} must be a positive number, or null.` }
    patch[key] = n
  }
  return { patch }
}

app.get('/api/profile', asyncH(async (req, res) => {
  res.json({ profile: await store.getProfile() })
}))

// Merge-saves the profile, then — only when every field computeBaseline needs
// is now present — recomputes the baseline and pushes it through the SAME
// mechanism EditTargets uses (store.setTargets), so Plan's baseline reflects
// it immediately with no separate wiring. An incomplete profile is still
// saved (so filling the form field by field works) but never touches
// targets: this app's "no silent target changes" principle means a half-
// filled form must never establish targets from guessed/missing inputs.
app.put('/api/profile', asyncH(async (req, res) => {
  const { patch, error } = validateProfilePatch(req.body || {})
  if (error) return res.status(400).json({ error })
  const profile = await store.setProfile(patch)
  const computedBaseline = computeBaseline(profile)
  if (computedBaseline) await store.setTargets(computedBaseline)
  res.json({ profile, computedBaseline })
}))

// Suggests an activity_level from recent step history — a SUGGESTION only,
// never written to the profile itself; the client decides whether to apply
// it (PUT /api/profile is the only write path).
// Bounds as specced: <5000 sedentary, 5000-7500 light, 7500-10000 moderate,
// 10000-12500 active, >12500 very_active. Each shared boundary (5000, 7500,
// 10000, 12500) belongs to the LOWER band, matching the "<5000"/">12500"
// wording at the two open ends.
function suggestFromAvgSteps(avg) {
  if (avg < 5000) return 'sedentary'
  if (avg <= 7500) return 'light'
  if (avg <= 10000) return 'moderate'
  if (avg <= 12500) return 'active'
  return 'very_active'
}

app.get('/api/profile/activity-suggestion', asyncH(async (req, res) => {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 9) // 10 days inclusive
  const history = await store.listOuraHistory(localYmd(start), localYmd(end))
  const steps = history.map((r) => Number(r.extra?.steps)).filter(Number.isFinite)
  if (!steps.length) return res.json({ suggested: null, basis: null })
  const avg = steps.reduce((a, b) => a + b, 0) / steps.length
  res.json({ suggested: suggestFromAvgSteps(avg), basis: `10-day avg steps: ${Math.round(avg)}` })
}))

// --- wearables: Oura ------------------------------------------------------

// Resolve a usable access token: a legacy OURA_TOKEN wins (single account),
// else the first connected OAuth account (refreshing if near expiry).
async function resolveOuraToken() {
  if (ouraConfigured()) return ouraToken()
  if (!ouraOAuthConfigured()) return null
  const accounts = await store.listOuraAccounts()
  if (!accounts.length) return null
  const primary = accounts[0]
  return ouraValidAccessToken(primary, (t) => store.updateOuraTokens(primary.id, t))
}

// One-call historical pull (Oura's range query returns every matched day at
// once — no need to loop a day at a time) so Insights' "Readiness · Oura"
// slot has real history the moment an account connects, not just from today
// forward. Callers decide how to handle a failure — this never touches
// the connect flow's own success/failure.
async function backfillOuraHistory(token, days = 30) {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const rows = await ouraActivityRange(token, localYmd(start), localYmd(end))
  return store.saveOuraHistory(rows)
}

app.get('/api/oura/summary', asyncH(async (req, res) => {
  const token = await resolveOuraToken()
  if (!token) return res.json({ configured: false, activity: null })
  // Default to the SERVER-LOCAL day like every sibling endpoint (garmin/energy/
  // today). The old toISOString().slice(0,10) default was the UTC day, so for
  // part of every day this endpoint silently queried a different date than
  // /api/energy/summary on the same box.
  const day = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? req.query.date
    : localYmd()
  const activity = await ouraDailySummary(token, day)
  res.json({ configured: true, activity })
}))

// Begin OAuth: redirect the browser to Oura's consent screen.
app.get('/api/oura/connect', (req, res) => {
  if (!ouraOAuthConfigured()) return res.status(501).send('Oura OAuth is not configured on the server.')
  res.redirect(ouraAuthorizeUrl(ouraSignState()))
})

// OAuth callback: verify state, exchange the code, store the account, return.
app.get('/api/oura/callback', asyncH(async (req, res) => {
  const { code, state, error } = req.query
  if (error || !code || !ouraVerifyState(state)) return res.redirect('/?oura=error')
  const tokens = await ouraExchangeCode(String(code))
  const info = await ouraPersonalInfo(tokens.access_token)
  await store.saveOuraAccount({
    label: info?.email || info?.id || 'Oura account',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: ouraExpiryFrom(tokens.expires_in),
  })
  try {
    await backfillOuraHistory(tokens.access_token)
  } catch {
    // A successful connect must still read as connected even if the
    // historical pull hiccups — POST /api/oura/backfill can retry it.
  }
  res.redirect('/?oura=connected')
}))

// Re-run the history backfill for an already-connected account (the normal
// path only fires this once, at connect time).
app.post('/api/oura/backfill', asyncH(async (req, res) => {
  const token = await resolveOuraToken()
  if (!token) return res.status(400).json({ error: 'No Oura account connected.' })
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30))
  const saved = await backfillOuraHistory(token, days)
  res.json({ ok: true, days, daysSaved: saved })
}))

// Connected accounts (tokens stripped) + config state, for the settings UI.
app.get('/api/oura/accounts', asyncH(async (req, res) => {
  const accounts = (await store.listOuraAccounts()).map((a) => ({
    id: a.id, label: a.label, expires_at: a.expires_at, created_at: a.created_at,
  }))
  res.json({ oauth: ouraOAuthConfigured(), legacy: ouraConfigured(), accounts })
}))

app.delete('/api/oura/accounts/:id', asyncH(async (req, res) => {
  const ok = await store.deleteOuraAccount(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Account not found.' })
  res.status(204).end()
}))

// --- wearables: Garmin (data-in, OAuth 2.0 PKCE + push webhook) ------------
// PKCE verifiers must be recalled at the callback but never leave the server;
// stash them in-memory keyed by `state`, short TTL. (Single-process personal
// app — fine; a restart mid-connect just means retrying the connect.)
const garminPkce = new Map()

app.get('/api/garmin/connect', (req, res) => {
  if (!garminConfigured()) return res.status(501).send('Garmin OAuth is not configured on the server.')
  const state = crypto.randomBytes(16).toString('hex')
  const { verifier, challenge } = garminPkcePair()
  garminPkce.set(state, { verifier, exp: Date.now() + 10 * 60 * 1000 })
  res.redirect(garminAuthorizeUrl({ state, challenge }))
})

app.get('/api/garmin/callback', asyncH(async (req, res) => {
  const { code, state, error } = req.query
  const entry = garminPkce.get(String(state || ''))
  garminPkce.delete(String(state || ''))
  if (error || !code || !entry || entry.exp < Date.now()) return res.redirect('/?garmin=error')
  const tokens = await garminExchangeCode({ code: String(code), verifier: entry.verifier })
  await store.saveGarminAccount({
    label: 'Garmin account',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: garminExpiryFrom(tokens.expires_in),
  })
  res.redirect('/?garmin=connected')
}))

// Garmin PUSHES daily summaries here (its data model is webhook, not pull).
// Body shape (VERIFY): { dailies: [ { calendarDate, activeKilocalories, bmrKilocalories, steps, ... } ] }
app.post('/api/garmin/webhook', asyncH(async (req, res) => {
  const dailies = Array.isArray(req.body?.dailies) ? req.body.dailies : []
  const accounts = await store.listGarminAccounts()
  const accountId = accounts[0]?.id // single-account personal app
  if (accountId) {
    for (const d of dailies) {
      // Skip malformed elements instead of throwing: a 500 here makes Garmin
      // retry the whole batch and loses the valid summaries around the junk.
      if (!d || typeof d !== 'object') continue
      const norm = garminNormalizeDaily(d)
      if (norm.day) await store.upsertGarminDaily({ account_id: accountId, ...norm, raw: d })
    }
  }
  res.status(200).json({ received: dailies.length }) // 200 fast so Garmin doesn't retry
}))

app.get('/api/garmin/accounts', asyncH(async (req, res) => {
  const accounts = (await store.listGarminAccounts()).map((a) => ({
    id: a.id, label: a.label, expires_at: a.expires_at, created_at: a.created_at,
  }))
  res.json({ oauth: garminConfigured(), accounts })
}))

app.delete('/api/garmin/accounts/:id', asyncH(async (req, res) => {
  const ok = await store.deleteGarminAccount(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Account not found.' })
  res.status(204).end()
}))

// Stored Garmin expenditure for a day (served from pushed data, not a live pull).
app.get('/api/garmin/summary', asyncH(async (req, res) => {
  const accounts = await store.listGarminAccounts()
  if (!accounts.length) return res.json({ configured: garminConfigured(), activity: null })
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const row = await store.getGarminDaily(accounts[0].id, day)
  const activity = row
    ? { day: row.day, total_calories: row.total_calories, active_calories: row.active_calories, steps: row.steps }
    : null
  res.json({ configured: true, activity })
}))

// --- unified daily views --------------------------------------------------
const NUTRIENT_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg']

// Server's local calendar date, matching how the UI groups days.
function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayRange(ymd) {
  const start = new Date(`${ymd}T00:00:00`) // server-local day
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

// Nutrition totals vs. targets for a day — used by the Garmin Connect IQ watch app.
app.get('/api/today/summary', asyncH(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const { from, to } = dayRange(date)
  const entries = await store.listEntries({ from, to })
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]))
  for (const e of entries) {
    const s = Number(e.servings_consumed) || 0
    for (const k of NUTRIENT_KEYS) totals[k] += (Number(e.food?.[k]) || 0) * s
  }
  const targets = await store.getLatestTargets()
  const remaining = { calories: targets?.calories != null ? Number(targets.calories) - totals.calories : null }
  res.json({ date, totals, targets, remaining })
}))

// Unified energy expenditure ("out") for a day: Oura preferred, Garmin fallback.
app.get('/api/energy/summary', asyncH(async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  // Oura preferred — but a failing Oura (API down, refresh rejected) must fall
  // through to Garmin, not turn the whole unified read into a 500. The fallback
  // is this endpoint's entire purpose.
  try {
    const token = await resolveOuraToken()
    if (token) {
      const a = await ouraDailySummary(token, day)
      if (a && a.total_calories != null) {
        return res.json({ date: day, source: 'oura', out: a.total_calories, active_calories: a.active_calories, steps: a.steps })
      }
    }
  } catch {
    // fall through to Garmin
  }
  const gaccts = await store.listGarminAccounts()
  if (gaccts.length) {
    const row = await store.getGarminDaily(gaccts[0].id, day)
    if (row && row.total_calories != null) {
      return res.json({ date: day, source: 'garmin', out: row.total_calories, active_calories: row.active_calories, steps: row.steps })
    }
  }
  res.json({ date: day, source: null, out: null, active_calories: null, steps: null })
}))

// --- fueling intelligence -------------------------------------------------
function sumIntake(entries) {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]))
  for (const e of entries) {
    const s = Number(e.servings_consumed) || 0
    for (const k of NUTRIENT_KEYS) totals[k] += (Number(e.food?.[k]) || 0) * s
  }
  return totals
}

// Which signal categories the user allows to influence the plan.
async function planInfluence() {
  const row = await store.getIntegration('plan')
  return { readiness: true, sleep: true, workouts: true, ...(row.settings?.influence || {}) }
}

async function buildPlan(date, nowDate) {
  const baseline = await store.getLatestTargets()
  const signals = await composeSignals(store, nowDate)
  const influence = await planInfluence()
  const { adjusted, rationale, rulesVersion } = computeAdjustedTargets(baseline, signals, { influence })
  return { date, baseline, adjusted, rationale, signals, influence, rulesVersion }
}

async function todayComposite(date, nowDate, bounds = null) {
  const plan = await buildPlan(date, nowDate)
  const { from, to } = bounds || dayRange(date)
  const entries = await store.listEntries({ from, to })
  const intake = sumIntake(entries)
  const nowHour = nowDate.getHours() + nowDate.getMinutes() / 60
  const recommendation = computeRecommendation({
    baseline: plan.baseline, adjusted: plan.adjusted, intake, signals: plan.signals, nowHour, influence: plan.influence,
  })
  // Snapshot the plan so "why?" is reproducible for the day.
  await store.savePlan(date, { baseline: plan.baseline, adjusted: plan.adjusted, rationale: plan.rationale, signal_snapshot: plan.signals, rulesVersion: plan.rulesVersion })
  return { date, intake, baseline: plan.baseline, adjusted: plan.adjusted, rationale: plan.rationale, signals: plan.signals, recommendation, entries, generatedAt: nowDate.toISOString() }
}

// Composite for the Today screen (context + recommendation + progress + log).
// The client may pass its own local-day bounds (the same from/to contract as
// /api/entries): the server's local midnight is not the user's, and without
// this the composite intake/recommendation silently disagreed with the entry
// list the client fetches for the very same calendar day.
app.get('/api/today', asyncH(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const { from, to } = req.query
  const bounds =
    typeof from === 'string' && typeof to === 'string' && !isNaN(Date.parse(from)) && !isNaN(Date.parse(to))
      ? { from, to }
      : null
  res.json(await todayComposite(date, new Date(), bounds))
}))

// Plan for a day: baseline vs. adjusted targets + rationale + signals used.
app.get('/api/plan/today', asyncH(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const plan = await buildPlan(date, new Date())
  await store.savePlan(date, { baseline: plan.baseline, adjusted: plan.adjusted, rationale: plan.rationale, signal_snapshot: plan.signals, rulesVersion: plan.rulesVersion })
  res.json(plan)
}))

// Composed wearable signals (one per metric) with provenance + freshness.
app.get('/api/signals', asyncH(async (req, res) => {
  const now = new Date()
  res.json({ date: localYmd(now), signals: await composeSignals(store, now) })
}))

// Connections: provider statuses (incl. demo) + the plan-influence toggles.
app.get('/api/connections', asyncH(async (req, res) => {
  const providers = await allProviderStatuses(store)
  const withEnabled = []
  for (const p of providers) {
    const s = await store.getIntegration(p.id)
    withEnabled.push({ ...p, enabled: s.enabled !== false })
  }
  res.json({ providers: withEnabled, influence: await planInfluence() })
}))

app.put('/api/connections/influence', asyncH(async (req, res) => {
  const cur = await planInfluence()
  const b = req.body || {}
  const influence = {
    readiness: b.readiness != null ? !!b.readiness : cur.readiness,
    sleep: b.sleep != null ? !!b.sleep : cur.sleep,
    workouts: b.workouts != null ? !!b.workouts : cur.workouts,
  }
  const row = await store.getIntegration('plan')
  await store.setIntegration('plan', { settings: { ...(row.settings || {}), influence } })
  res.json({ influence })
}))

app.put('/api/connections/:provider', asyncH(async (req, res) => {
  const id = req.params.provider
  if (!['oura', 'garmin', 'apple'].includes(id)) return res.status(404).json({ error: 'Unknown provider.' })
  const patch = {}
  if (req.body?.enabled != null) patch.enabled = !!req.body.enabled
  if (req.body?.demo != null) patch.demo = !!req.body.demo
  const row = await store.setIntegration(id, patch)
  res.json({ provider: id, enabled: row.enabled !== false, demo: row.demo !== false })
}))

// The HealthKit categories the companion may read (minimum fueling context).
// HRV / resting HR are context-only and never drive a target change.
const APPLE_CATEGORIES = ['workouts', 'activeEnergy', 'exercise', 'sleep', 'hrv', 'restingHR', 'steps']
// Map ingested metric keys back to their HealthKit category, so "available"
// permissions can be inferred from which metrics actually arrived.
const APPLE_METRIC_CATEGORY = {
  workout: 'workouts', expenditure: 'activeEnergy', active_energy: 'activeEnergy',
  exercise: 'exercise', exercise_minutes: 'exercise', sleep: 'sleep',
  hrv: 'hrv', resting_hr: 'restingHR', steps: 'steps',
}

// Record which HealthKit categories the companion could read. HealthKit hides
// read-denials by design, so we NEVER record "denied" — only "requested" and
// "available" (a category is available when its data arrived or the companion
// reports it authorized). Missing data reads as unavailable, not refused.
function normalizeApplePermissions(p, rows) {
  const clean = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => APPLE_CATEGORIES.includes(x)))] : [])
  const fromRows = [...new Set(rows.map((r) => APPLE_METRIC_CATEGORY[r.metric]).filter(Boolean))]
  const available = clean(p?.available).length ? clean(p?.available) : fromRows
  const requested = clean(p?.requested).length ? clean(p?.requested) : available
  return { requested, available, updated_at: new Date().toISOString() }
}

// Apple Health ingest: a native HealthKit companion / Health export POSTs
// normalized samples here (there is no Apple cloud API). Token-gated if
// APPLE_INGEST_TOKEN is set.
app.post('/api/apple/ingest', asyncH(async (req, res) => {
  const token = process.env.APPLE_INGEST_TOKEN
  if (token && req.get('x-ingest-token') !== token) return res.status(401).json({ error: 'Invalid ingest token.' })
  const { date, samples, permissions } = req.body || {}
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : localYmd()
  // Keep only well-formed samples; a metric name is required and everything
  // else is optional. Absent metrics are simply not stored (never inferred as
  // denied). Timestamps default to now so a minimal client still works.
  const nowIso = new Date().toISOString()
  const rows = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && typeof s.metric === 'string' && s.metric)
    .map((s) => ({
      metric: s.metric,
      value: s.value ?? null,
      unit: s.unit || null,
      recorded_at: s.recorded_at || nowIso,
      fetched_at: s.fetched_at || nowIso,
      extra: s.extra && typeof s.extra === 'object' ? s.extra : null,
    }))
  const n = await store.replaceAppleSignals(day, rows)
  const cur = await store.getIntegration('apple')
  const perms = normalizeApplePermissions(permissions, rows)
  await store.setIntegration('apple', {
    connected_at: cur.connected_at || nowIso,
    last_synced_at: nowIso,
    settings: { ...(cur.settings || {}), permissions: perms },
  })
  res.json({ ingested: n, day, permissions: perms })
}))

// Insights: nutrition trends over a window; signal correlations flagged as
// insufficient-data until enough history exists (never causal/medical copy).
app.get('/api/insights', asyncH(async (req, res) => {
  const window = [7, 14, 30].includes(Number(req.query.window)) ? Number(req.query.window) : 7
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (window - 1))
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1)
  const entries = await store.listEntries({ from: start.toISOString(), to: end.toISOString() })
  const targets = await store.getLatestTargets()

  const byDay = new Map()
  for (const e of entries) {
    const key = localYmd(new Date(e.logged_at))
    if (!byDay.has(key)) byDay.set(key, sumIntake([]))
    const t = byDay.get(key)
    const s = Number(e.servings_consumed) || 0
    for (const k of NUTRIENT_KEYS) t[k] += (Number(e.food?.[k]) || 0) * s
  }
  const days = [...byDay.entries()].map(([date, totals]) => ({ date, totals })).sort((a, b) => (a.date < b.date ? -1 : 1))
  const tracked = days.length
  const avg = (k) => (tracked ? Math.round(days.reduce((a, d) => a + d.totals[k], 0) / tracked) : null)
  const calTarget = Number(targets?.calories) || 0
  const onTargetDays = calTarget ? days.filter((d) => Math.abs(d.totals.calories - calTarget) <= calTarget * 0.1).length : 0

  const ouraReadiness = (await store.listOuraHistory?.(localYmd(start), localYmd(new Date(end - 1)))) || []

  res.json({
    window,
    insufficientData: tracked < 3,
    nutrition: { trackedDays: tracked, consistency: window ? tracked / window : 0, avgCalories: avg('calories'), avgProtein: avg('protein_g'), onTargetDays },
    days,
    ouraReadiness: ouraReadiness.map((r) => ({ date: r.day, score: Number(r.value) })).filter((r) => Number.isFinite(r.score)),
    correlations: {
      available: false,
      note: 'Recovery/training correlations need several days of retained wearable history — connect a provider and revisit after a few days.',
    },
  })
}))

// In production (or any time a build exists) the same process serves the
// built PWA alongside the API, so one container/host handles everything and
// the frontend's relative /api calls are same-origin. In dev, Vite serves the
// app and proxies /api here instead.
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback for any non-/api GET.
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

const PORT = Number(process.env.PORT || 3001)
app.listen(PORT, () => {
  console.log(`[nutrition-tracker] API on http://localhost:${PORT}  (storage: ${backend})`)
  if (backend === 'json-file') {
    console.log('[nutrition-tracker] No DATABASE_URL set — using local JSON store (dev fallback).')
  }
})

export default app
