// Oura integration — pulls daily activity / energy expenditure so the app can
// show net calories (food in − activity out).
//
// Auth is a bearer token. Oura deprecated Personal Access Tokens in Dec 2025, so
// new tokens come from OAuth 2.0 (an existing PAT still works). This module is
// deliberately *token-agnostic*: every function takes a token, and getToken()
// is the single place that decides where it comes from. Today that's the
// OURA_TOKEN env var (one account); swapping in per-account OAuth tokens later
// means changing only getToken()/the caller, not the fetch + normalize code.
import crypto from 'node:crypto'

const BASE = 'https://api.ouraring.com/v2/usercollection'
const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize'
const TOKEN_URL = 'https://api.ouraring.com/oauth/token'
const SCOPES = 'email personal daily'
const TIMEOUT_MS = 8000

export function ouraConfigured() {
  return Boolean(process.env.OURA_TOKEN)
}

// The token source. The abstraction point for future multi-account OAuth.
export function getToken() {
  return process.env.OURA_TOKEN || null
}

async function ouraGet(path, token, params = {}) {
  const url = new URL(`${BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      const err = new Error('Oura token rejected (401). Reconnect / refresh the token.')
      err.status = 401
      throw err
    }
    if (!res.ok) {
      const err = new Error(`Oura API error (${res.status}).`)
      err.status = 502
      throw err
    }
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

const n = (v) => {
  if (v == null) return null // null/undefined stay null (Number(null) would be 0)
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

// Reduce one Oura daily_activity record to the fields the app uses. This is
// the ACTIVITY score (movement) — do not confuse with Readiness below; they
// are different Oura endpoints and, verified live, read differently on the
// same day. (This app previously did confuse them — see normalizeReadiness.)
export function normalizeActivity(record = {}) {
  return {
    day: record.day || null,
    total_calories: n(record.total_calories), // total daily expenditure (incl. BMR)
    active_calories: n(record.active_calories), // movement only
    steps: n(record.steps),
    score: n(record.score),
  }
}

// Reduce one Oura daily_readiness record — a genuinely different score from
// Activity's, combining sleep balance, HRV, resting heart rate, body
// temperature, and recovery. VERIFY: the `score` field name matches Oura API
// v2 docs, but unlike daily_activity (proven against this app's own live
// traffic), this endpoint hasn't been exercised against a captured response.
export function normalizeReadiness(record = {}) {
  return {
    day: record.day || null,
    score: n(record.score),
  }
}

// Oura's `sleep` endpoint returns one row per SESSION (naps included), not
// one per day — reduce a day's sessions to a single total. total_sleep_duration
// is in seconds; every other sleep signal in this app (Apple Health's) is in
// hours, so convert here rather than pushing a seconds->hours conversion onto
// every caller. Returns null (not 0) when there are no sessions, matching
// this file's null-means-no-reading convention elsewhere.
export function normalizeSleepSessions(rows = []) {
  const totalSeconds = rows.reduce((sum, r) => sum + (n(r.total_sleep_duration) || 0), 0)
  return totalSeconds > 0 ? totalSeconds / 3600 : null
}

// Shared day-window fetch: query an inclusive window that definitely
// contains `ymd`, then pick out only that day's rows client-side — Oura's
// end_date handling varies, so widening by a day and filtering here is more
// reliable than trusting the API to return exactly `ymd`. Returns an ARRAY
// (not a single record) because some endpoints (sleep) can have more than
// one row per day; callers that expect at most one just take rows[0].
async function fetchDailyRows(endpoint, token, ymd) {
  const end = new Date(`${ymd}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  const endYmd = end.toISOString().slice(0, 10)
  const body = await ouraGet(endpoint, token, { start_date: ymd, end_date: endYmd })
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.filter((r) => r.day === ymd)
}

async function fetchRangeRows(endpoint, token, fromYmd, toYmd) {
  const body = await ouraGet(endpoint, token, { start_date: fromYmd, end_date: toYmd })
  return Array.isArray(body?.data) ? body.data : []
}

// Activity summary for a single local calendar day (YYYY-MM-DD). Returns null if
// Oura has no record for that day yet (e.g. today, mid-morning).
export async function dailySummary(token, ymd) {
  const [match] = await fetchDailyRows('daily_activity', token, ymd)
  return match ? normalizeActivity(match) : null
}

// One day's worth of history per call is wasteful for a backfill — Oura's
// range query already returns every matched day in one response, so a
// multi-week pull is one request, not one per day.
export async function activityRange(token, fromYmd, toYmd) {
  const rows = await fetchRangeRows('daily_activity', token, fromYmd, toYmd)
  return rows.map(normalizeActivity)
}

// The actual Readiness score for a day (daily_readiness) — see
// normalizeReadiness for why this is a separate call from dailySummary.
// Readiness and Activity are different Oura endpoints that happen to share a
// 0-100 scale, which is exactly what let this app query the wrong one for
// both the live signal and the history backfill without ever throwing:
// daily_activity often returns a populated `score` too, so nothing failed,
// it just wasn't the number this app claimed to be showing.
export async function dailyReadiness(token, ymd) {
  const [match] = await fetchDailyRows('daily_readiness', token, ymd)
  return match ? normalizeReadiness(match) : null
}

export async function readinessRange(token, fromYmd, toYmd) {
  const rows = await fetchRangeRows('daily_readiness', token, fromYmd, toYmd)
  return rows.map(normalizeReadiness)
}

// Real sleep DURATION in hours for a day, from the session-level `sleep`
// endpoint (summed across sessions — naps count, same as a wearable's own
// daily total would). This is distinct from daily_sleep's 0-100 quality
// score, which this app doesn't currently surface.
export async function dailySleepHours(token, ymd) {
  const rows = await fetchDailyRows('sleep', token, ymd)
  return normalizeSleepSessions(rows)
}

// --- OAuth 2.0 (authorization code grant) ----------------------------------
// The proper path since PATs were deprecated, and what enables connecting more
// than one account (each person authorizes their own Oura account).

export function oauthConfigured() {
  return Boolean(
    process.env.OURA_CLIENT_ID && process.env.OURA_CLIENT_SECRET && process.env.OURA_REDIRECT_URI,
  )
}

// Stateless CSRF token: a random nonce signed (HMAC) with the client secret, so
// the callback verifies it without any server-side session store.
export function signState() {
  const nonce = crypto.randomBytes(16).toString('hex')
  const sig = crypto
    .createHmac('sha256', process.env.OURA_CLIENT_SECRET || '')
    .update(nonce)
    .digest('hex')
  return `${nonce}.${sig}`
}

export function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) return false
  const [nonce, sig] = state.split('.')
  const expected = crypto
    .createHmac('sha256', process.env.OURA_CLIENT_SECRET || '')
    .update(nonce)
    .digest('hex')
  const a = Buffer.from(sig || '', 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function authorizeUrl(state) {
  const u = new URL(AUTHORIZE_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', process.env.OURA_CLIENT_ID)
  u.searchParams.set('redirect_uri', process.env.OURA_REDIRECT_URI)
  u.searchParams.set('scope', SCOPES)
  u.searchParams.set('state', state)
  return u.toString()
}

async function postToken(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(`Oura token endpoint error (${res.status})${data?.error ? `: ${data.error}` : ''}`)
    err.status = res.status
    throw err
  }
  return data // { access_token, refresh_token, expires_in, token_type, scope }
}

export function exchangeCode(code) {
  return postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.OURA_REDIRECT_URI,
    client_id: process.env.OURA_CLIENT_ID,
    client_secret: process.env.OURA_CLIENT_SECRET,
  })
}

export function refreshAccessToken(refreshToken) {
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.OURA_CLIENT_ID,
    client_secret: process.env.OURA_CLIENT_SECRET,
  })
}

export async function fetchPersonalInfo(token) {
  try {
    return (await ouraGet('personal_info', token)) || null
  } catch {
    return null
  }
}

// expires_in seconds → an absolute ISO expiry.
export function expiryFrom(expiresIn) {
  return new Date(Date.now() + (Number(expiresIn) || 86400) * 1000).toISOString()
}

// Return a valid access token for a stored account, refreshing (and persisting
// via `persist`) when it's within a minute of expiry.
export async function validAccessToken(account, persist) {
  const exp = account.expires_at ? new Date(account.expires_at).getTime() : 0
  if (account.access_token && exp > Date.now() + 60000) return account.access_token
  const t = await refreshAccessToken(account.refresh_token)
  const tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || account.refresh_token,
    expires_at: expiryFrom(t.expires_in),
  }
  if (persist) await persist(tokens)
  return tokens.access_token
}
