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

app.get('/api/oura/summary', asyncH(async (req, res) => {
  const token = await resolveOuraToken()
  if (!token) return res.json({ configured: false, activity: null })
  const day = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? req.query.date
    : new Date().toISOString().slice(0, 10)
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
  res.redirect('/?oura=connected')
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
  const token = await resolveOuraToken()
  if (token) {
    const a = await ouraDailySummary(token, day)
    if (a && a.total_calories != null) {
      return res.json({ date: day, source: 'oura', out: a.total_calories, active_calories: a.active_calories, steps: a.steps })
    }
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
