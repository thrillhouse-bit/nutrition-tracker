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

// Reduce one Oura daily_activity record to the fields the app uses.
export function normalizeActivity(record = {}) {
  return {
    day: record.day || null,
    total_calories: n(record.total_calories), // total daily expenditure (incl. BMR)
    active_calories: n(record.active_calories), // movement only
    steps: n(record.steps),
    score: n(record.score),
  }
}

// Activity summary for a single local calendar day (YYYY-MM-DD). Returns null if
// Oura has no record for that day yet (e.g. today, mid-morning).
export async function dailySummary(token, ymd) {
  // Query an inclusive window that definitely contains `ymd`, then pick it out;
  // Oura's end_date handling varies, so widen by a day and filter.
  const end = new Date(`${ymd}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  const endYmd = end.toISOString().slice(0, 10)

  const body = await ouraGet('daily_activity', token, { start_date: ymd, end_date: endYmd })
  const rows = Array.isArray(body?.data) ? body.data : []
  const match = rows.find((r) => r.day === ymd) || null
  return match ? normalizeActivity(match) : null
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
