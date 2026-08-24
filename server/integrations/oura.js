// Oura integration — pulls daily activity / energy expenditure so the app can
// show net calories (food in − activity out).
//
// Auth is a bearer token. Oura deprecated Personal Access Tokens in Dec 2025, so
// new tokens come from OAuth 2.0 (an existing PAT still works). This module is
// deliberately *token-agnostic*: every function takes a token, and getToken()
// is the single place that decides where it comes from. Today that's the
// OURA_TOKEN env var (one account); swapping in per-account OAuth tokens later
// means changing only getToken()/the caller, not the fetch + normalize code.
const BASE = 'https://api.ouraring.com/v2/usercollection'
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
