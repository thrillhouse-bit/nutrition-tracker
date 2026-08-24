// Garmin Health API integration (data-in) — OAuth 2.0 PKCE + push webhook.
//
// IMPORTANT, read before relying on this:
//  1. The Garmin Connect Developer Program (which gates the Health API) is
//     partner-approval-only and was ON HOLD as of 2026 — you may be unable to
//     obtain credentials right now. This code is "ready when approved".
//  2. Garmin's Health API is PUSH-based: after a user authorizes, Garmin POSTs
//     daily summaries to a webhook you register (there is a `backfill` request
//     for history, but no on-demand "today" pull like Oura). So the flow is:
//     connect (PKCE) → Garmin pushes `dailies` to POST /api/garmin/webhook →
//     we store them → /api/garmin/summary serves the stored day.
//  3. The exact endpoint URLs and payload field names below are the documented
//     shapes but are behind the partner portal — every constant marked VERIFY
//     must be checked against the Garmin partner docs once you have access.
import crypto from 'node:crypto'

// VERIFY all four against the Garmin partner docs (OAuth2 PKCE spec + Health API).
const AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm' // VERIFY
const TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token' // VERIFY
const WELLNESS_BASE = 'https://apis.garmin.com/wellness-api/rest' // VERIFY
const SCOPES = 'HEALTH_READ' // VERIFY — scope name(s)

export function garminConfigured() {
  return Boolean(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET && process.env.GARMIN_REDIRECT_URI)
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// PKCE: a high-entropy verifier and its S256 challenge. The verifier is secret
// and must be recalled at the callback (kept server-side, keyed by `state`).
export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(48)) // 43–128 chars
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function authorizeUrl({ state, challenge }) {
  const u = new URL(AUTHORIZE_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', process.env.GARMIN_CLIENT_ID)
  u.searchParams.set('redirect_uri', process.env.GARMIN_REDIRECT_URI)
  u.searchParams.set('scope', SCOPES)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
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
    const err = new Error(`Garmin token endpoint error (${res.status})${data?.error ? `: ${data.error}` : ''}`)
    err.status = res.status
    throw err
  }
  return data // { access_token, refresh_token, expires_in, ... }
}

export function exchangeCode({ code, verifier }) {
  return postToken({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: process.env.GARMIN_REDIRECT_URI,
    client_id: process.env.GARMIN_CLIENT_ID,
    client_secret: process.env.GARMIN_CLIENT_SECRET,
  })
}

export function refreshAccessToken(refreshToken) {
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.GARMIN_CLIENT_ID,
    client_secret: process.env.GARMIN_CLIENT_SECRET,
  })
}

export function expiryFrom(expiresIn) {
  return new Date(Date.now() + (Number(expiresIn) || 86400) * 1000).toISOString()
}

const n = (v) => {
  if (v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

// Normalize one Garmin "daily" summary into the app's shape. Garmin splits
// expenditure into active + BMR; total daily expenditure is their sum.
// Field names (calendarDate/activeKilocalories/bmrKilocalories/steps) are the
// documented Health API "dailies" fields — VERIFY against the partner schema.
export function normalizeDaily(record = {}) {
  const active = n(record.activeKilocalories)
  const bmr = n(record.bmrKilocalories)
  const total = active == null && bmr == null ? null : (active || 0) + (bmr || 0)
  return {
    day: record.calendarDate || null,
    total_calories: total,
    active_calories: active,
    steps: n(record.steps),
  }
}

// Request historical dailies for a window (used once after connect, since the
// live model is push). VERIFY the path/params.
export async function backfillDailies(token, startSec, endSec) {
  const url = `${WELLNESS_BASE}/backfill/dailies?summaryStartTimeInSeconds=${startSec}&summaryEndTimeInSeconds=${endSec}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = new Error(`Garmin backfill error (${res.status}).`)
    err.status = res.status
    throw err
  }
  return res.json().catch(() => null)
}

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
