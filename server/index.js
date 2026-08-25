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
import {
  hashPassword,
  verifyPassword,
  attachUser,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
} from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { lookupByBarcode, searchByText } from './lookup.js'
import { parseLabel, ocrConfigured } from './ocr.js'
import { validateBody, FoodInputSchema, EntryCreateSchema, EntryPatchSchema, TargetsSchema } from './validation.js'
import {
  ouraConfigured,
  getToken as ouraToken,
  dailySummary as ouraDailySummary,
  activityRange as ouraActivityRange,
  readinessRange as ouraReadinessRange,
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
  fetchGarminUserId,
} from './integrations/garmin.js'
import { computeAdjustedTargets, computeRecommendation } from './plan.js'
import { computeBaseline } from './planCalc.js'
import { computeTrend } from './weightTrend.js'
import { computeNutritionRecoveryCorrelation } from './correlations.js'
import { allProviderStatuses, composeSignals } from './providers.js'

const app = express()
// Label photos are base64 — allow a generous body size.
app.use(express.json({ limit: '15mb' }))
// credentials:true so the session cookie survives a cross-origin dev setup
// (Vite on :5173 -> API on :3001). origin:true (reflecting any request's
// Origin) was "harmless in prod, where it's same-origin anyway" BEFORE there
// was a session cookie to reflect it TO — same-origin requests never consult
// CORS at all, so echoing an arbitrary origin with credentials only ever
// matters for a genuinely cross-origin caller, i.e. never a legitimate one in
// prod. Scope it to dev, where the cross-port convenience is real.
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : true, credentials: true }))
app.use(attachUser) // sets req.userId (or null) on every request; does not itself reject anything

// The native iOS/watch companion has no interactive login, so it can never
// carry a session cookie — it only ever has the per-user Apple ingest token
// (generated from the signed-in web app via POST /api/apple/token, pasted
// into the companion's settings). Before this existed, /api/today and
// friends were reachable with no auth at all; requireAuth below would now
// 401 every companion request outright, silently breaking the watch glance
// and background sync. Falling back to the SAME token here (via the
// already-defined resolveAppleIngestUser, hoisted below) means the token
// authenticates the companion for reads generally, not just the ingest POST
// — a reasonable extension of the trust it already carries (it already
// attributes ALL of that user's synced HealthKit data).
app.use((req, res, next) => {
  if (req.userId != null) return next()
  resolveAppleIngestUser(req)
    .then((uid) => { if (uid != null) req.userId = uid; next() })
    .catch(next)
})

const asyncH = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.status || 500
    // 4xx messages are ours (validation, "not found", etc.) and safe to
    // return as-is. A 500 means something unanticipated — often a raw
    // driver/DB error (a Postgres constraint name, a type-coercion
    // message) — so log the real thing server-side but send the client a
    // generic message instead of echoing it back.
    if (status >= 500) {
      console.error(err)
      return res.status(status).json({ error: 'Server error' })
    }
    res.status(status).json({ error: err.message || 'Server error' })
  })

// --- health (public — no auth, used by deploy/monitoring before anyone's signed in) ---
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

// What's actually running — GIT_SHA is baked in at `docker build` time (see
// Dockerfile / docker-compose*.yml's build.args); a deploy that doesn't set
// it (a bare `docker build .` with no --build-arg) reports 'unknown' rather
// than a stale or fabricated value. Before this, confirming a deploy meant
// comparing built asset bytes by hand.
app.get('/api/version', (req, res) => {
  res.json({ sha: process.env.GIT_SHA || 'unknown' })
})

// --- auth (public) ----------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

app.post('/api/auth/signup', asyncH(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  if (await store.getUserByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists.' })
  const password_hash = await hashPassword(password)
  const user = await store.createUser({ email, password_hash })
  // This box may already hold data logged before multi-user accounts existed
  // (entries, targets, connected integrations with no owner). The first
  // person to sign up on it is that data's only plausible owner — there's no
  // password to invent for an auto-created account, so migration waits for a
  // real signup rather than happening at boot. Only the very first account
  // qualifies: a second signup must never inherit the first user's history.
  if ((await store.countUsers()) === 1) {
    await store.migrateLegacyDataToUser(user.id)
  }
  setSessionCookie(res, user.id)
  res.status(201).json({ user: { id: user.id, email: user.email } })
}))

// A well-formed but arbitrary salt:hash pair, matching hashPassword's shape
// (16-byte salt, 64-byte hash, both hex) — used only to make verifyPassword
// perform a real scrypt computation when the account doesn't exist at all.
const NO_SUCH_USER_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`

app.post('/api/auth/login', asyncH(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const user = await store.getUserByEmail(email)
  // Same response body whether the email doesn't exist or the password is
  // wrong — a distinct "no such account" message would let anyone enumerate
  // which emails are registered. That protection is only real if the two
  // paths also take the same TIME: scrypt is deliberately slow, so a login
  // for an unknown email returning instantly (skipping it) while a known
  // email with a wrong password takes tens of milliseconds is itself an
  // oracle — always run the same hash comparison either way.
  const ok = await verifyPassword(password, user?.password_hash || NO_SUCH_USER_HASH)
  if (!user || !ok) return res.status(401).json({ error: 'Incorrect email or password.' })
  setSessionCookie(res, user.id)
  res.json({ user: { id: user.id, email: user.email } })
}))

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

// Read-only "am I signed in" check — the client calls this on boot to decide
// login screen vs. app shell. Never gated by requireAuth: it has to answer
// truthfully for a signed-OUT caller too.
app.get('/api/auth/me', asyncH(async (req, res) => {
  if (req.userId == null) return res.json({ user: null })
  const user = await store.getUserById(req.userId)
  res.json({ user: user ? { id: user.id, email: user.email } : null })
}))

// Everything below this line requires a signed-in user, EXCEPT the handful of
// routes registered again individually further down with their own auth
// handling (OAuth connect/callback, the Garmin webhook, and Apple ingest,
// which is gated by its own per-user ingest token instead of a session —
// none of those are ordinary XHRs from the logged-in SPA, so a blanket 401
// JSON response would be either wrong (webhook/ingest have no session at
// all) or a broken-looking page (an OAuth redirect getting a JSON body
// instead of being sent back to login).
const requireAuthRouter = express.Router()
requireAuthRouter.use(requireAuth)
app.use('/api', requireAuthRouter)

// --- barcode lookup (cache -> OFF -> USDA) ---------------------------------
requireAuthRouter.get('/lookup/:barcode', asyncH(async (req, res) => {
  const barcode = String(req.params.barcode).trim()
  if (!/^\d{6,14}$/.test(barcode)) {
    return res.status(400).json({ error: 'Invalid barcode.' })
  }

  // 1. Local cache — repeat scans never hit the network. (foods is a shared,
  // unscoped lookup cache — see db.js — so this benefits every user.)
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
requireAuthRouter.get('/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ results: [] })
  const results = await searchByText(q)
  res.json({ results })
}))

// --- label OCR (Claude vision) --------------------------------------------
requireAuthRouter.post('/ocr', asyncH(async (req, res) => {
  const { imageBase64, mediaType } = req.body || {}
  const food = await parseLabel({ imageBase64, mediaType })
  res.json({ food })
}))

// --- foods ----------------------------------------------------------------
// Recently-logged foods, for one-tap re-logging.
requireAuthRouter.get('/foods/recent', asyncH(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  res.json({ foods: await store.recentFoods(req.userId, limit) })
}))

// Persist a food (manual entry, or an OCR/search result the user confirmed)
// so it can be referenced by log entries and re-used later. foods is a
// shared cache (see db.js) — creating one isn't a per-user write.
requireAuthRouter.post('/foods', validateBody(FoodInputSchema), asyncH(async (req, res) => {
  const body = req.body
  const food = body.barcode
    ? await store.upsertFoodByBarcode(body)
    : await store.createFood(body)
  res.status(201).json({ food })
}))

// --- log entries ----------------------------------------------------------
requireAuthRouter.get('/entries', asyncH(async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' })
  const entries = await store.listEntries(req.userId, { from, to })
  res.json({ entries })
}))

// Log a food. Accepts either an existing food_id, or an inline `food` object
// (from a lookup/OCR/manual flow) which is persisted first, then logged.
requireAuthRouter.post('/entries', validateBody(EntryCreateSchema), asyncH(async (req, res) => {
  const { food_id, food, servings_consumed = 1, meal = null, logged_at = null } = req.body

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

  const entry = await store.addEntry(req.userId, { food_id: id, servings_consumed, meal, logged_at })
  res.status(201).json({ entry })
}))

requireAuthRouter.patch('/entries/:id', validateBody(EntryPatchSchema), asyncH(async (req, res) => {
  const entry = await store.updateEntry(req.userId, req.params.id, req.body)
  if (!entry) return res.status(404).json({ error: 'Entry not found.' })
  res.json({ entry })
}))

requireAuthRouter.delete('/entries/:id', asyncH(async (req, res) => {
  const ok = await store.deleteEntry(req.userId, req.params.id)
  if (!ok) return res.status(404).json({ error: 'Entry not found.' })
  res.status(204).end()
}))

// --- daily targets --------------------------------------------------------
// hasTargets tells the client whether these are real, chosen numbers or the
// silent DEFAULT_TARGETS fallback — the signal the onboarding gate uses to
// decide whether a signed-in user still needs to be walked through it.
requireAuthRouter.get('/targets', asyncH(async (req, res) => {
  const [targets, hasTargets] = await Promise.all([store.getLatestTargets(req.userId), store.hasTargets(req.userId)])
  res.json({ targets, hasTargets })
}))

requireAuthRouter.put('/targets', validateBody(TargetsSchema), asyncH(async (req, res) => {
  const targets = await store.setTargets(req.userId, req.body)
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

requireAuthRouter.get('/profile', asyncH(async (req, res) => {
  res.json({ profile: await store.getProfile(req.userId) })
}))

// Merge-saves the profile, then — only when every field computeBaseline needs
// is now present — recomputes the baseline and pushes it through the SAME
// mechanism EditTargets uses (store.setTargets), so Plan's baseline reflects
// it immediately with no separate wiring. An incomplete profile is still
// saved (so filling the form field by field works) but never touches
// targets: this app's "no silent target changes" principle means a half-
// filled form must never establish targets from guessed/missing inputs.
requireAuthRouter.put('/profile', asyncH(async (req, res) => {
  const { patch, error } = validateProfilePatch(req.body || {})
  if (error) return res.status(400).json({ error })
  const profile = await store.setProfile(req.userId, patch)
  const computedBaseline = computeBaseline(profile)
  if (computedBaseline) await store.setTargets(req.userId, computedBaseline)
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

requireAuthRouter.get('/profile/activity-suggestion', asyncH(async (req, res) => {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 9) // 10 days inclusive
  const history = await store.listOuraHistory(req.userId, localYmd(start), localYmd(end))
  const steps = history.map((r) => Number(r.extra?.steps)).filter(Number.isFinite)
  if (!steps.length) return res.json({ suggested: null, basis: null })
  const avg = steps.reduce((a, b) => a + b, 0) / steps.length
  res.json({ suggested: suggestFromAvgSteps(avg), basis: `10-day avg steps: ${Math.round(avg)}` })
}))

// --- wearables: Oura ------------------------------------------------------

// Resolve a usable access token for THIS user: a legacy OURA_TOKEN wins (it's
// a single static env-var PAT, so it's necessarily shared across every user
// on this box — the same tradeoff a personal-use single-account token always
// had), else that user's own connected OAuth account (refreshing if near
// expiry).
async function resolveOuraToken(userId) {
  if (ouraConfigured()) return ouraToken()
  if (!ouraOAuthConfigured()) return null
  const accounts = await store.listOuraAccounts(userId)
  if (!accounts.length) return null
  const primary = accounts[0]
  return ouraValidAccessToken(primary, (t) => store.updateOuraTokens(userId, primary.id, t))
}

// One-call historical pull (Oura's range query returns every matched day at
// once — no need to loop a day at a time) so Insights' "Readiness · Oura"
// slot has real history the moment an account connects, not just from today
// forward. Callers decide how to handle a failure — this never touches
// the connect flow's own success/failure.
//
// Two Oura endpoints, merged by day: readiness supplies the score this
// history exists to track (previously this used activityRange's score,
// which is the ACTIVITY score, not Readiness — the same mislabeling
// providers.js's realSignals had for the live "today" value, and which
// silently produced either a wrong number or nothing at all — rows with a
// null activity score get filtered out downstream — depending on the
// account's data); activity supplies the total_calories/active_calories/
// steps context that store.saveOuraHistory has always stored alongside the
// score (and that GET /api/profile/activity-suggestion reads back out of
// `extra.steps`) — still worth keeping even though it's no longer the
// headline number, so dropping activityRange entirely (as a from-scratch fix
// would) would have silently starved that endpoint instead. Must call
// readinessRange (daily_readiness), never activityRange (daily_activity)
// alone for the score — they're different Oura endpoints with different
// scores that happen to share a 0-100 scale, which is exactly what let this
// function store the wrong one as "readiness" for a long time without ever
// throwing.
async function backfillOuraHistory(userId, token, days = 30) {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const fromYmd = localYmd(start), toYmd = localYmd(end)
  const [activity, readiness] = await Promise.all([
    ouraActivityRange(token, fromYmd, toYmd),
    ouraReadinessRange(token, fromYmd, toYmd),
  ])
  const activityByDay = new Map(activity.map((r) => [r.day, r]))
  const rows = readiness.map((r) => {
    const a = activityByDay.get(r.day)
    return {
      day: r.day,
      score: r.score,
      total_calories: a?.total_calories ?? null,
      active_calories: a?.active_calories ?? null,
      steps: a?.steps ?? null,
    }
  })
  const missingDays = rows.filter((r) => r.score == null).map((r) => r.day)
  if (missingDays.length) {
    // Named, not just counted: which days is what an operator needs to tell
    // "Oura genuinely has nothing for these dates" from "something's wrong
    // with the request window" — a bare count reads the same either way.
    console.warn(`[oura-backfill] user ${userId}: no readiness score from Oura for ${missingDays.length}/${rows.length} day(s): ${missingDays.join(', ')}`)
  }
  return store.saveOuraHistory(userId, rows)
}

requireAuthRouter.get('/oura/summary', asyncH(async (req, res) => {
  const token = await resolveOuraToken(req.userId)
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

// Begin OAuth: redirect the browser to Oura's consent screen. This is a
// top-level navigation (an <a href>, not an XHR), so it's registered on
// `app` directly rather than the auto-401-JSON requireAuthRouter — an
// unauthenticated hit here should bounce to login, not show a raw JSON body.
// Pins which local user initiated the connect (keyed by the state nonce)
// rather than depending solely on the session cookie surviving the redirect
// round-trip to Oura and back — see the matching Garmin PKCE map below for
// the same reasoning.
const ouraConnectPending = new Map() // nonce -> { userId, exp }

app.get('/api/oura/connect', (req, res) => {
  if (req.userId == null) return res.redirect('/?error=not_signed_in')
  if (!ouraOAuthConfigured()) return res.status(501).send('Oura OAuth is not configured on the server.')
  const state = ouraSignState()
  const nonce = state.split('.')[0]
  ouraConnectPending.set(nonce, { userId: req.userId, exp: Date.now() + 10 * 60 * 1000 })
  res.redirect(ouraAuthorizeUrl(state))
})

// OAuth callback: verify state, exchange the code, store the account, return.
app.get('/api/oura/callback', asyncH(async (req, res) => {
  const { code, state, error } = req.query
  if (error || !code || !ouraVerifyState(state)) return res.redirect('/?oura=error')
  const nonce = String(state).split('.')[0]
  const pending = ouraConnectPending.get(nonce)
  ouraConnectPending.delete(nonce)
  const userId = pending && pending.exp >= Date.now() ? pending.userId : req.userId
  if (userId == null) return res.redirect('/?oura=error') // no session AND no pinned initiator — can't attribute this connection to anyone
  const tokens = await ouraExchangeCode(String(code))
  const info = await ouraPersonalInfo(tokens.access_token)
  await store.saveOuraAccount(userId, {
    label: info?.email || info?.id || 'Oura account',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: ouraExpiryFrom(tokens.expires_in),
  })
  try {
    await backfillOuraHistory(userId, tokens.access_token)
  } catch (err) {
    // A successful connect must still read as connected even if the
    // historical pull hiccups — POST /api/oura/backfill can retry it. But
    // silence here must not mean invisible: this exact catch block once
    // swallowed a wrong-endpoint bug (activityRange instead of
    // readinessRange) for hours with zero signal that anything was wrong.
    console.error(`[oura-connect-backfill] user ${userId} failed: ${err.message}`)
  }
  res.redirect('/?oura=connected')
}))

// Re-run the history backfill for an already-connected account (the normal
// path only fires this once, at connect time).
requireAuthRouter.post('/oura/backfill', asyncH(async (req, res) => {
  const token = await resolveOuraToken(req.userId)
  if (!token) return res.status(400).json({ error: 'No Oura account connected.' })
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30))
  const saved = await backfillOuraHistory(req.userId, token, days)
  res.json({ ok: true, days, daysSaved: saved })
}))

// Connected accounts (tokens stripped) + config state, for the settings UI.
requireAuthRouter.get('/oura/accounts', asyncH(async (req, res) => {
  const accounts = (await store.listOuraAccounts(req.userId)).map((a) => ({
    id: a.id, label: a.label, expires_at: a.expires_at, created_at: a.created_at,
  }))
  res.json({ oauth: ouraOAuthConfigured(), legacy: ouraConfigured(), accounts })
}))

requireAuthRouter.delete('/oura/accounts/:id', asyncH(async (req, res) => {
  const ok = await store.deleteOuraAccount(req.userId, req.params.id)
  if (!ok) return res.status(404).json({ error: 'Account not found.' })
  res.status(204).end()
}))

// --- wearables: Garmin (data-in, OAuth 2.0 PKCE + push webhook) ------------
// PKCE verifiers must be recalled at the callback but never leave the server;
// stash them in-memory keyed by `state`, short TTL, alongside which local
// user initiated the connect (mirrors ouraConnectPending above — same
// reasoning: don't depend solely on the session cookie surviving the
// redirect round-trip to Garmin and back).
const garminPkce = new Map()

app.get('/api/garmin/connect', (req, res) => {
  if (req.userId == null) return res.redirect('/?error=not_signed_in')
  if (!garminConfigured()) return res.status(501).send('Garmin OAuth is not configured on the server.')
  const state = crypto.randomBytes(16).toString('hex')
  const { verifier, challenge } = garminPkcePair()
  garminPkce.set(state, { verifier, userId: req.userId, exp: Date.now() + 10 * 60 * 1000 })
  res.redirect(garminAuthorizeUrl({ state, challenge }))
})

app.get('/api/garmin/callback', asyncH(async (req, res) => {
  const { code, state, error } = req.query
  const entry = garminPkce.get(String(state || ''))
  garminPkce.delete(String(state || ''))
  if (error || !code || !entry || entry.exp < Date.now()) return res.redirect('/?garmin=error')
  const tokens = await garminExchangeCode({ code: String(code), verifier: entry.verifier })
  // VERIFY (see integrations/garmin.js): the id fetched here is what a later
  // PUSHED webhook uses to route back to this account — there's no session
  // on an incoming webhook to resolve the user from otherwise.
  const garminUserId = await fetchGarminUserId(tokens.access_token)
  await store.saveGarminAccount(entry.userId, {
    label: 'Garmin account',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: garminExpiryFrom(tokens.expires_in),
    garmin_user_id: garminUserId,
  })
  res.redirect('/?garmin=connected')
}))

// Garmin PUSHES daily summaries here (its data model is webhook, not pull) —
// no session, no cookie: Garmin is a server calling us directly. Each pushed
// "daily" carries Garmin's OWN opaque userId (VERIFY against partner docs),
// which we match against garmin_accounts.garmin_user_id (captured at connect
// time — see the callback above) to find which of OUR users it belongs to.
// A daily with no matching account, or no garmin_user_id in the payload at
// all, is skipped rather than guessed at — attributing pushed data to the
// wrong user would be a real cross-user data leak, not just a display bug.
// Body shape (VERIFY): { dailies: [ { userId, calendarDate, activeKilocalories, bmrKilocalories, steps, ... } ] }
app.post('/api/garmin/webhook', asyncH(async (req, res) => {
  const dailies = Array.isArray(req.body?.dailies) ? req.body.dailies : []
  const accountCache = new Map() // garmin_user_id -> account | null, avoid a lookup per daily in one batch
  for (const d of dailies) {
    // Skip malformed elements instead of throwing: a 500 here makes Garmin
    // retry the whole batch and loses the valid summaries around the junk.
    if (!d || typeof d !== 'object' || !d.userId) continue
    let account = accountCache.get(d.userId)
    if (account === undefined) {
      account = await store.findGarminAccountByGarminUserId(d.userId)
      accountCache.set(d.userId, account)
    }
    if (!account) continue // no local account claims this Garmin user id
    const norm = garminNormalizeDaily(d)
    if (norm.day) await store.upsertGarminDaily({ account_id: account.id, ...norm, raw: d })
  }
  res.status(200).json({ received: dailies.length }) // 200 fast so Garmin doesn't retry
}))

requireAuthRouter.get('/garmin/accounts', asyncH(async (req, res) => {
  const accounts = (await store.listGarminAccounts(req.userId)).map((a) => ({
    id: a.id, label: a.label, expires_at: a.expires_at, created_at: a.created_at,
  }))
  res.json({ oauth: garminConfigured(), accounts })
}))

requireAuthRouter.delete('/garmin/accounts/:id', asyncH(async (req, res) => {
  const ok = await store.deleteGarminAccount(req.userId, req.params.id)
  if (!ok) return res.status(404).json({ error: 'Account not found.' })
  res.status(204).end()
}))

// Stored Garmin expenditure for a day (served from pushed data, not a live pull).
requireAuthRouter.get('/garmin/summary', asyncH(async (req, res) => {
  const accounts = await store.listGarminAccounts(req.userId)
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

// Calendar-day math anchored to a client-supplied UTC offset (Date#
// getTimezoneOffset() convention: minutes to ADD to local time to reach
// UTC) instead of the server's own OS timezone — /insights is the one
// place left that computed "today"/day-buckets purely server-side
// (localYmd/dayRange above are still server-local; they're used by other
// routes not touched by this fix). Only ever does UTC-getter/setter
// arithmetic on a shifted instant, so it never depends on where the
// process happens to be running.
function ymdAtOffset(date, offsetMinutes) {
  const shifted = new Date(date.getTime() - offsetMinutes * 60000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}
// The UTC instant of local midnight, `daysDelta` days from `refDate`, for a
// clock at `offsetMinutes`.
function localMidnightAtOffset(refDate, offsetMinutes, daysDelta = 0) {
  const shifted = new Date(refDate.getTime() - offsetMinutes * 60000)
  shifted.setUTCHours(0, 0, 0, 0)
  shifted.setUTCDate(shifted.getUTCDate() + daysDelta)
  return new Date(shifted.getTime() + offsetMinutes * 60000)
}

// Nutrition totals vs. targets for a day — used by the Garmin Connect IQ watch app.
requireAuthRouter.get('/today/summary', asyncH(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const { from, to } = dayRange(date)
  const entries = await store.listEntries(req.userId, { from, to })
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]))
  for (const e of entries) {
    const s = Number(e.servings_consumed) || 0
    for (const k of NUTRIENT_KEYS) totals[k] += (Number(e.food?.[k]) || 0) * s
  }
  const targets = await store.getLatestTargets(req.userId)
  const remaining = { calories: targets?.calories != null ? Number(targets.calories) - totals.calories : null }
  res.json({ date, totals, targets, remaining })
}))

// Unified energy expenditure ("out") for a day: Oura preferred, Garmin fallback.
requireAuthRouter.get('/energy/summary', asyncH(async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  // Oura preferred — but a failing Oura (API down, refresh rejected) must fall
  // through to Garmin, not turn the whole unified read into a 500. The fallback
  // is this endpoint's entire purpose.
  try {
    const token = await resolveOuraToken(req.userId)
    if (token) {
      const a = await ouraDailySummary(token, day)
      if (a && a.total_calories != null) {
        return res.json({ date: day, source: 'oura', out: a.total_calories, active_calories: a.active_calories, steps: a.steps })
      }
    }
  } catch {
    // fall through to Garmin
  }
  const gaccts = await store.listGarminAccounts(req.userId)
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

// Which signal categories the user allows to influence the plan. Stored as a
// pseudo-provider ('plan') in the per-user integrations table — reuses the
// existing settings-jsonb mechanism rather than a dedicated table for one
// small object.
async function planInfluence(userId) {
  const row = await store.getIntegration(userId, 'plan')
  return { readiness: true, sleep: true, workouts: true, ...(row.settings?.influence || {}) }
}

async function buildPlan(userId, date, nowDate) {
  const baseline = await store.getLatestTargets(userId)
  const signals = await composeSignals(store, nowDate, userId)
  const influence = await planInfluence(userId)
  const { adjusted, rationale, rulesVersion } = computeAdjustedTargets(baseline, signals, { influence })
  return { date, baseline, adjusted, rationale, signals, influence, rulesVersion }
}

async function todayComposite(userId, date, nowDate, bounds = null) {
  const plan = await buildPlan(userId, date, nowDate)
  const { from, to } = bounds || dayRange(date)
  const entries = await store.listEntries(userId, { from, to })
  const intake = sumIntake(entries)
  const nowHour = nowDate.getHours() + nowDate.getMinutes() / 60
  const recommendation = computeRecommendation({
    baseline: plan.baseline, adjusted: plan.adjusted, intake, signals: plan.signals, nowHour, influence: plan.influence,
  })
  // Snapshot the plan so "why?" is reproducible for the day.
  await store.savePlan(userId, date, { baseline: plan.baseline, adjusted: plan.adjusted, rationale: plan.rationale, signal_snapshot: plan.signals, rulesVersion: plan.rulesVersion })
  return { date, intake, baseline: plan.baseline, adjusted: plan.adjusted, rationale: plan.rationale, signals: plan.signals, recommendation, entries, generatedAt: nowDate.toISOString() }
}

// Composite for the Today screen (context + recommendation + progress + log).
// The client may pass its own local-day bounds (the same from/to contract as
// /api/entries): the server's local midnight is not the user's, and without
// this the composite intake/recommendation silently disagreed with the entry
// list the client fetches for the very same calendar day.
requireAuthRouter.get('/today', asyncH(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const { from, to } = req.query
  const bounds =
    typeof from === 'string' && typeof to === 'string' && !isNaN(Date.parse(from)) && !isNaN(Date.parse(to))
      ? { from, to }
      : null
  res.json(await todayComposite(req.userId, date, new Date(), bounds))
}))

// Plan for a day: baseline vs. adjusted targets + rationale + signals used.
requireAuthRouter.get('/plan/today', asyncH(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? req.query.date : localYmd()
  const plan = await buildPlan(req.userId, date, new Date())
  await store.savePlan(req.userId, date, { baseline: plan.baseline, adjusted: plan.adjusted, rationale: plan.rationale, signal_snapshot: plan.signals, rulesVersion: plan.rulesVersion })
  res.json(plan)
}))

// --- manual workout input ---------------------------------------------------
// The "smart" plan adjustments (server/plan.js) only ever ran off a
// connected wearable's auto-detected workout — someone without Garmin/Apple
// connected, or whose device hasn't detected today's session yet, could
// never get a real (non-demo) workout-driven adjustment at all. This lets
// the user state their own plan directly; providers.js's composeSignals
// treats it as an unconditional override for the `workout` metric.
const WORKOUT_KINDS = ['run', 'ride', 'swim', 'row', 'walk', 'hike', 'strength', 'hiit', 'cardio', 'mobility', 'workout']

// Matches the iOS companion's own time-of-day label convention
// (HealthKitManager.label(startHour:kind:)) so a workout reads the same —
// "Evening Run" — whether it came from Apple Health or was typed in here.
function partOfDay(hour) {
  if (hour < 5) return 'Night'
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  if (hour < 21) return 'Evening'
  return 'Night'
}
function formatHour12(hourFloat) {
  const h = Math.floor(hourFloat)
  const m = Math.round((hourFloat - h) * 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

requireAuthRouter.put('/plan/workout', asyncH(async (req, res) => {
  const { kind, time, duration_min } = req.body || {}
  if (!WORKOUT_KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of: ${WORKOUT_KINDS.join(', ')}` })
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return res.status(400).json({ error: 'time must be HH:MM, 24h, local.' })
  const [hh, mm] = String(time).split(':').map(Number)
  const startHour = hh + mm / 60
  const duration = Number(duration_min)
  const hasDuration = Number.isFinite(duration) && duration > 0
  const kindLabel = kind[0].toUpperCase() + kind.slice(1)
  const workout = {
    label: `${partOfDay(startHour)} ${kindLabel}`,
    shortLabel: kind,
    kind,
    time: formatHour12(startHour),
    startHour,
    endHour: hasDuration ? startHour + duration / 60 : null,
    durationMin: hasDuration ? duration : null,
    estKcal: null,
    status: 'planned',
  }
  const saved = await store.setManualWorkout(req.userId, localYmd(), workout)
  res.json({ workout: saved })
}))

requireAuthRouter.get('/plan/workout', asyncH(async (req, res) => {
  res.json({ workout: await store.getManualWorkout(req.userId, localYmd()) })
}))

requireAuthRouter.delete('/plan/workout', asyncH(async (req, res) => {
  const ok = await store.clearManualWorkout(req.userId, localYmd())
  res.status(ok ? 204 : 404).end()
}))

// Body weight log — one entry per day. `day` defaults to today (same
// pattern as /oura/summary's date param); logging twice for the same day
// overwrites rather than adding a second reading (store.saveWeightEntry is
// delete-then-insert, same idempotency shape as the Oura history backfill).
requireAuthRouter.put('/weight', asyncH(async (req, res) => {
  const { kg, day } = req.body || {}
  const n = Number(kg)
  if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'kg must be a positive number.' })
  const useDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day)) ? day : localYmd()
  const entry = await store.saveWeightEntry(req.userId, useDay, n)
  res.json({ entry })
}))

requireAuthRouter.delete('/weight/:day', asyncH(async (req, res) => {
  const ok = await store.deleteWeightEntry(req.userId, req.params.day)
  res.status(ok ? 204 : 404).end()
}))

// Composed wearable signals (one per metric) with provenance + freshness.
requireAuthRouter.get('/signals', asyncH(async (req, res) => {
  const now = new Date()
  res.json({ date: localYmd(now), signals: await composeSignals(store, now, req.userId) })
}))

// Connections: provider statuses (incl. demo) + the plan-influence toggles.
requireAuthRouter.get('/connections', asyncH(async (req, res) => {
  const providers = await allProviderStatuses(store, req.userId)
  const withEnabled = []
  for (const p of providers) {
    const s = await store.getIntegration(req.userId, p.id)
    withEnabled.push({ ...p, enabled: s.enabled !== false })
  }
  res.json({ providers: withEnabled, influence: await planInfluence(req.userId) })
}))

requireAuthRouter.put('/connections/influence', asyncH(async (req, res) => {
  const cur = await planInfluence(req.userId)
  const b = req.body || {}
  const influence = {
    readiness: b.readiness != null ? !!b.readiness : cur.readiness,
    sleep: b.sleep != null ? !!b.sleep : cur.sleep,
    workouts: b.workouts != null ? !!b.workouts : cur.workouts,
  }
  const row = await store.getIntegration(req.userId, 'plan')
  await store.setIntegration(req.userId, 'plan', { settings: { ...(row.settings || {}), influence } })
  res.json({ influence })
}))

// Deletes cached wearable records (Oura/Apple/Garmin) without touching the
// OAuth accounts — see store.clearSyncedHistory for exactly what's in scope.
requireAuthRouter.delete('/connections/history', asyncH(async (req, res) => {
  const removed = await store.clearSyncedHistory(req.userId)
  res.json({ removed })
}))

requireAuthRouter.put('/connections/:provider', asyncH(async (req, res) => {
  const id = req.params.provider
  if (!['oura', 'garmin', 'apple'].includes(id)) return res.status(404).json({ error: 'Unknown provider.' })
  const patch = {}
  if (req.body?.enabled != null) patch.enabled = !!req.body.enabled
  if (req.body?.demo != null) patch.demo = !!req.body.demo
  const row = await store.setIntegration(req.userId, id, patch)
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

// A per-user Apple ingest token, generated on demand — the iOS companion has
// no interactive login (it's a background sync, not a browser), so it can't
// carry a session cookie the way the SPA does. The legacy single global
// APPLE_INGEST_TOKEN env var still works too (checked first) for a
// single-owner deploy that hasn't generated a per-user token — but it's
// necessarily shared across every user on the box, same tradeoff as the
// legacy Oura PAT above.
requireAuthRouter.post('/apple/token', asyncH(async (req, res) => {
  const row = await store.getIntegration(req.userId, 'apple')
  const token = crypto.randomBytes(24).toString('hex')
  await store.setIntegration(req.userId, 'apple', { settings: { ...(row.settings || {}), ingest_token: token } })
  res.json({ token })
}))

// Apple Health ingest: a native HealthKit companion / Health export POSTs
// normalized samples here (there is no Apple cloud API). No session — the
// companion authenticates with its own per-user token (see POST
// /api/apple/token above) instead, checked against every user's stored
// integrations.apple.settings.ingest_token to find whose data this is. The
// legacy global APPLE_INGEST_TOKEN, if set, is checked first and — being a
// single shared secret — can't identify a user on its own; it's accepted
// only when exactly one user account exists on the box, so it still can't be
// silently misattributed once a second person signs up.
// Same timing-safe-compare pattern as auth.js's session-token check — a
// plain === here would leak how many leading bytes of a guessed token are
// correct via response latency.
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

async function resolveAppleIngestUser(req) {
  const presented = req.get('x-ingest-token')
  if (!presented) return null
  const legacy = process.env.APPLE_INGEST_TOKEN
  if (legacy && timingSafeStringEqual(presented, legacy)) {
    // A shared single secret can only be attributed while it's unambiguous —
    // once a second account exists, getSoleUserId() returns null and this
    // falls through to the per-user lookup below (which the legacy token
    // won't match, since it was never stored as anyone's ingest_token).
    return store.getSoleUserId()
  }
  return store.findUserIdByAppleIngestToken(presented)
}

app.post('/api/apple/ingest', asyncH(async (req, res) => {
  const userId = await resolveAppleIngestUser(req)
  if (userId == null) {
    return res.status(401).json({ error: 'Invalid ingest token.' })
  }
  // A valid token proves who the companion is, not that this user still
  // wants it syncing — the Connections tab's "enabled" toggle is supposed
  // to be the actual off switch. Honor it here rather than only on read.
  const integration = await store.getIntegration(userId, 'apple')
  if (integration.enabled === false) {
    return res.status(403).json({ error: 'Apple Health is disabled for this account.' })
  }
  const { date, samples, permissions } = req.body || {}
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : localYmd()
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
  const n = await store.replaceAppleSignals(userId, day, rows)
  const cur = await store.getIntegration(userId, 'apple')
  const perms = normalizeApplePermissions(permissions, rows)
  await store.setIntegration(userId, 'apple', {
    connected_at: cur.connected_at || nowIso,
    last_synced_at: nowIso,
    settings: { ...(cur.settings || {}), permissions: perms },
  })
  res.json({ ingested: n, day, permissions: perms })
}))

// Insights: nutrition trends over a window; signal correlations flagged as
// insufficient-data until enough history exists (never causal/medical copy).
requireAuthRouter.get('/insights', asyncH(async (req, res) => {
  const window = [7, 14, 30].includes(Number(req.query.window)) ? Number(req.query.window) : 7
  // Bucket by the CLIENT's calendar day, not the server's — the client
  // sends its own UTC offset (see api.insights() in src/api/client.js); a
  // missing/invalid value falls back to the server's own offset, which
  // reproduces the old (server-local) behavior rather than erroring for a
  // caller that hasn't been updated. Without this, two entries logged the
  // same real-world evening could land in different day buckets whenever
  // the server's TZ (commonly UTC in production) disagrees with the
  // user's, inflating trackedDays and fragmenting daily totals.
  const tzOffsetMinutes = Number.isFinite(Number(req.query.tzOffsetMinutes)) ? Number(req.query.tzOffsetMinutes) : new Date().getTimezoneOffset()
  const now = new Date()
  const start = localMidnightAtOffset(now, tzOffsetMinutes, -(window - 1))
  const end = localMidnightAtOffset(now, tzOffsetMinutes, 1)
  const entries = await store.listEntries(req.userId, { from: start.toISOString(), to: end.toISOString() })
  const targets = await store.getLatestTargets(req.userId)

  const byDay = new Map()
  for (const e of entries) {
    const key = ymdAtOffset(new Date(e.logged_at), tzOffsetMinutes)
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

  const windowStartYmd = ymdAtOffset(start, tzOffsetMinutes)
  const windowEndYmd = ymdAtOffset(new Date(end - 1), tzOffsetMinutes)
  const ouraReadiness = (await store.listOuraHistory?.(req.userId, windowStartYmd, windowEndYmd)) || []

  // The trend must be computed over ALL history up to the window's end, not
  // just the entries inside the window — an EMA re-seeded fresh at the
  // window's start would show a different trend value for the same day
  // depending on which window (7/14/30) happens to be selected, which is
  // exactly the kind of silently-inconsistent number this app's own history
  // (see CLAUDE-notes-style incidents elsewhere) keeps warning about.
  // Sliced back down to the window only after computing over the full history.
  const allWeightEntries = (await store.listWeightEntries?.(req.userId, '0001-01-01', windowEndYmd)) || []
  const weight = computeTrend(allWeightEntries).filter((e) => e.day >= windowStartYmd)

  // Training load: real per-day minutes trained, aggregated from Apple
  // Health workout sessions (store.listAppleWorkoutHistory — see server/db.js
  // for why a day sums rather than keeps only the latest workout). Windowed
  // the same way as ouraReadiness above, not the weight trend's full-history
  // computation — there's no smoothed trend here, just the raw per-day totals.
  const workoutHistory = (await store.listAppleWorkoutHistory?.(req.userId, windowStartYmd, windowEndYmd)) || []
  const workoutLoad = workoutHistory.map((r) => ({ date: r.day, minutes: r.minutes, sessions: r.sessions }))

  // { date, score } is the shape both the response's ouraReadiness field and
  // the correlation join want — computed once and reused rather than mapped
  // twice (and re-diverging the way the old hardcoded `correlations` block
  // never had to agree with anything).
  const ouraReadinessOut = ouraReadiness.map((r) => ({ date: r.day, score: Number(r.value) })).filter((r) => Number.isFinite(r.score))

  res.json({
    window,
    insufficientData: tracked < 3,
    nutrition: { trackedDays: tracked, consistency: window ? tracked / window : 0, avgCalories: avg('calories'), avgProtein: avg('protein_g'), onTargetDays },
    days,
    ouraReadiness: ouraReadinessOut,
    weight,
    workoutLoad,
    // See server/correlations.js for the join key (protein_g -> next-day
    // readiness), the sample-size/effect-size thresholds, and why both must
    // pass before this reports available:true.
    correlations: computeNutritionRecoveryCorrelation(days, ouraReadinessOut),
  })
}))

// --- scheduled Oura re-sync ------------------------------------------------
// Oura history only ever gets backfilled at connect time (or by manually
// hitting POST /api/oura/backfill) — nothing keeps it current after that, so
// Insights' readiness trend and the activity-level suggestion (both read
// from wearable_signals, not a live call) quietly go stale a day after
// connecting. This runs a small trailing-window backfill for every
// connected account on a timer, so the stored history stays current without
// anyone having to remember to re-trigger it. A short window, not the full
// 30/90-day connect-time pull — Oura's own data can lag a day or two behind
// real time, so re-covering the last few days catches anything that wasn't
// final yet on a prior pass; older history never needs re-fetching.
const OURA_RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
const OURA_RESYNC_WINDOW_DAYS = 3

async function resyncAllOuraAccounts() {
  const accounts = await store.listAllOuraAccounts()
  for (const account of accounts) {
    try {
      const token = await ouraValidAccessToken(account, (t) => store.updateOuraTokens(account.user_id, account.id, t))
      await backfillOuraHistory(account.user_id, token, OURA_RESYNC_WINDOW_DAYS)
    } catch (err) {
      // One account's failure (an expired/revoked refresh token, a transient
      // Oura outage) must not stop the rest of the batch from syncing.
      console.error(`[oura-resync] account ${account.id} (user ${account.user_id}) failed: ${err.message}`)
    }
  }
}

// Guarded on ouraOAuthConfigured() so a box with no Oura app registered never
// schedules pointless polling, and on !process.env.VITEST so the test suite
// (which sets these env vars in test/oura-oauth.test.js to exercise the OAuth
// flow) never arms a real network timer mid-run. `.unref()` is a second,
// independent safeguard: even if this guard were ever bypassed, an unref'd
// timer still can't keep the process alive past its natural exit.
if (ouraOAuthConfigured() && !process.env.VITEST) {
  setTimeout(resyncAllOuraAccounts, 60 * 1000).unref() // shortly after boot, not immediately at import
  setInterval(resyncAllOuraAccounts, OURA_RESYNC_INTERVAL_MS).unref()
}

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
