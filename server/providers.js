// Provider abstraction for wearable "fueling" signals — Oura, Garmin, Apple.
//
// Each provider has metadata (how it connects, what it supplies) and an adapter
// that normalizes its raw data into ONE shared signal vocabulary with
// provenance (provider) and freshness (recorded_at vs fetched_at → fresh/stale/
// unavailable). The rest of the app (plan engine, endpoints, UI) is
// provider-agnostic: adding a provider means adding an adapter, not touching UI.
//
// Connect methods:
//   'oauth'  — Oura, Garmin: server-side OAuth (see integrations/oura.js,
//              integrations/garmin.js). Tokens never leave the server.
//   'ingest' — Apple Health: there is NO cloud API for HealthKit. Apple Watch /
//              Health data reaches us only from a native iOS companion app (or a
//              Health-export import) that POSTs normalized samples to
//              /api/apple/ingest. So Apple is push-in, like a webhook.
//
// When a provider has no real data, it runs in DEMO mode (clearly labelled),
// using a seeded evening-run scenario so the whole experience works with no
// accounts. Demo data must never be presented as a live connection.
import { ouraConfigured, oauthConfigured as ouraOAuthConfigured, getToken as ouraToken, dailySummary as ouraDailySummary, validAccessToken as ouraValidToken } from './integrations/oura.js'
import { garminConfigured } from './integrations/garmin.js'

export const PROVIDERS = {
  oura: { id: 'oura', name: 'Oura', connect: 'oauth', categories: ['sleep', 'readiness'] },
  garmin: { id: 'garmin', name: 'Garmin', connect: 'oauth', categories: ['workouts', 'training load', 'expenditure', 'steps'] },
  apple: { id: 'apple', name: 'Apple Health', connect: 'ingest', categories: ['workouts', 'active energy', 'exercise', 'sleep', 'heart rate'] },
}

// Per-metric provider preference when more than one source has data. `hrv` is
// context-only — it appears in the composed signals for explanation but the
// rules engine (server/plan.js) never reads it, so it can never change a target.
const PREFERENCE = {
  readiness: ['oura', 'garmin'],
  sleep: ['oura', 'apple', 'garmin'],
  workout: ['garmin', 'apple', 'oura'],
  expenditure: ['garmin', 'apple', 'oura'],
  steps: ['garmin', 'apple'],
  hrv: ['apple', 'oura'],
}

const HOURS = (ms) => ms / 3600000

// Freshness from when a sample was recorded (on the device/day) vs now.
export function freshnessOf(recordedAt, now = Date.now()) {
  if (!recordedAt) return 'unavailable'
  const age = HOURS(now - new Date(recordedAt).getTime())
  if (!Number.isFinite(age)) return 'unavailable'
  if (age <= 18) return 'fresh'
  if (age <= 48) return 'stale'
  // Older than 48h is unavailable, not stale: plan.js's usable() only excludes
  // 'unavailable', so returning 'stale' here let arbitrarily old readings keep
  // adjusting targets.
  return 'unavailable'
}

function sig(value, extra) {
  return { value, freshness: freshnessOf(extra.recorded_at), ...extra }
}

// --- demo scenario: an evening run ----------------------------------------
// Timestamps are relative to `now` so the scenario always reads as "today".
export function demoSignals(nowDate = new Date()) {
  const morning = new Date(nowDate); morning.setHours(7, 5, 0, 0)
  const fetched = nowDate.toISOString()
  const run = new Date(nowDate); run.setHours(17, 30, 0, 0)
  return {
    oura: {
      readiness: sig(82, { unit: 'score', provider: 'oura', recorded_at: morning.toISOString(), fetched_at: fetched, demo: true }),
      sleep: sig(7.4, { unit: 'h', score: 78, provider: 'oura', recorded_at: morning.toISOString(), fetched_at: fetched, demo: true }),
    },
    garmin: {
      workout: sig(
        { label: 'Evening Run', shortLabel: 'run', kind: 'run', time: '5:30 PM', startHour: 17.5, est_kcal: 520, status: 'planned' },
        { provider: 'garmin', recorded_at: fetched, fetched_at: fetched, demo: true },
      ),
      expenditure: sig(1820, { unit: 'kcal', active: 430, provider: 'garmin', recorded_at: fetched, fetched_at: fetched, demo: true }),
      steps: sig(4200, { unit: 'steps', provider: 'garmin', recorded_at: fetched, fetched_at: fetched, demo: true }),
    },
    apple: {
      expenditure: sig(1760, { unit: 'kcal', active: 405, provider: 'apple', recorded_at: fetched, fetched_at: fetched, demo: true }),
      steps: sig(4050, { unit: 'steps', provider: 'apple', recorded_at: fetched, fetched_at: fetched, demo: true }),
      sleep: sig(7.2, { unit: 'h', provider: 'apple', recorded_at: morning.toISOString(), fetched_at: fetched, demo: true }),
      hrv: sig(62, { unit: 'ms', provider: 'apple', recorded_at: morning.toISOString(), fetched_at: fetched, demo: true }),
    },
  }
}

// --- provider status (Connections tab) ------------------------------------
// status ∈ connected | stale | disconnected | error | demo
export async function providerStatus(store, id, nowDate = new Date()) {
  const meta = PROVIDERS[id]
  const settings = await store.getIntegration(id)
  const demoAllowed = settings?.demo !== false

  if (id === 'oura') {
    const configured = ouraConfigured() || ouraOAuthConfigured()
    if (!configured) return { ...meta, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null }
    const accounts = ouraOAuthConfigured() ? await store.listOuraAccounts() : (ouraConfigured() ? [{ id: 'legacy' }] : [])
    if (!accounts.length) return { ...meta, status: 'disconnected', demo: false, last_synced_at: null }
    return { ...meta, status: 'connected', demo: false, last_synced_at: settings?.last_synced_at || null }
  }
  if (id === 'garmin') {
    if (!garminConfigured()) return { ...meta, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null }
    const accounts = await store.listGarminAccounts()
    if (!accounts.length) return { ...meta, status: 'disconnected', demo: false, last_synced_at: null }
    const daily = await store.getGarminDaily(accounts[0].id, ymd(nowDate)).catch(() => null)
    const status = daily ? 'connected' : 'stale'
    return { ...meta, status, demo: false, last_synced_at: settings?.last_synced_at || null }
  }
  if (id === 'apple') {
    // Apple has no OAuth account; "connected" means the companion synced today's
    // HealthKit data. permissions.available < requested → partial (some
    // categories returned no data — never presented as "denied").
    const perms = settings?.settings?.permissions || null
    const partial = !!(perms?.requested?.length && (perms.available?.length || 0) < perms.requested.length)
    const has = (await store.listAppleSignals?.(ymd(nowDate)))?.length
    const lastSync = settings?.last_synced_at || null
    if (has) return { ...meta, status: 'connected', demo: false, last_synced_at: lastSync, permissions: perms, partial }
    // Synced before but nothing today: stale if the last sync was recent, else
    // disconnected. Only fall back to demo when the companion never connected.
    if (settings?.connected_at) {
      const ageH = lastSync ? HOURS(nowDate.getTime() - new Date(lastSync).getTime()) : Infinity
      return { ...meta, status: ageH <= 48 ? 'stale' : 'disconnected', demo: false, last_synced_at: lastSync, permissions: perms, partial }
    }
    return { ...meta, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null, permissions: perms }
  }
  return { ...meta, status: 'disconnected', demo: false }
}

export async function allProviderStatuses(store, nowDate = new Date()) {
  return Promise.all(Object.keys(PROVIDERS).map((id) => providerStatus(store, id, nowDate)))
}

// --- real per-provider signals (best-effort) ------------------------------
async function realSignals(store, id, nowDate) {
  const day = ymd(nowDate)
  try {
    if (id === 'oura') {
      let token = null
      if (ouraConfigured()) token = ouraToken()
      else if (ouraOAuthConfigured()) {
        const a = (await store.listOuraAccounts())[0]
        if (a) token = await ouraValidToken(a, (t) => store.updateOuraTokens(a.id, t))
      }
      if (!token) return {}
      const a = await ouraDailySummary(token, day) // network
      if (!a) return {}
      const rec = `${day}T07:00:00`
      const out = {}
      if (a.readiness != null || a.score != null) out.readiness = sig(a.score ?? a.readiness, { unit: 'score', provider: 'oura', recorded_at: rec, fetched_at: nowDate.toISOString(), demo: false })
      return out
    }
    if (id === 'garmin') {
      const acct = (await store.listGarminAccounts())[0]
      if (!acct) return {}
      const row = await store.getGarminDaily(acct.id, day)
      if (!row) return {}
      const rec = nowDate.toISOString()
      const out = {}
      if (row.total_calories != null) out.expenditure = sig(row.total_calories, { unit: 'kcal', active: row.active_calories, provider: 'garmin', recorded_at: rec, fetched_at: rec, demo: false })
      if (row.steps != null) out.steps = sig(row.steps, { unit: 'steps', provider: 'garmin', recorded_at: rec, fetched_at: rec, demo: false })
      return out
    }
    if (id === 'apple') {
      const rows = (await store.listAppleSignals?.(day)) || []
      const out = {}
      for (const r of rows) out[r.metric] = sig(r.value, { unit: r.unit, provider: 'apple', recorded_at: r.recorded_at, fetched_at: r.fetched_at, demo: false, ...r.extra })
      return out
    }
  } catch {
    return {}
  }
  return {}
}

// Demo may only stand in for a provider that was never configured/connected —
// the same predicate providerStatus uses to report `status: 'demo'`. Falling
// back to demo whenever a provider merely had no data *today* fed the plan a
// seeded evening run for a really-connected account whose watch hadn't synced
// yet, while the Connections tab said stale, demo: false.
function neverConnected(id, settings) {
  if (id === 'oura') return !(ouraConfigured() || ouraOAuthConfigured())
  if (id === 'garmin') return !garminConfigured()
  if (id === 'apple') return !settings?.connected_at
  return false
}

// --- compose one signal per metric, respecting provenance + toggles -------
export async function composeSignals(store, nowDate = new Date()) {
  const settings = {}
  for (const id of Object.keys(PROVIDERS)) settings[id] = await store.getIntegration(id)
  const demo = demoSignals(nowDate)

  // Gather per-provider signals: real first, else demo (if allowed & enabled).
  const perProvider = {}
  for (const id of Object.keys(PROVIDERS)) {
    if (settings[id]?.enabled === false) { perProvider[id] = {}; continue }
    const real = await realSignals(store, id, nowDate)
    if (Object.keys(real).length) perProvider[id] = real
    else if (settings[id]?.demo !== false && neverConnected(id, settings[id])) perProvider[id] = demo[id] || {}
    else perProvider[id] = {}
  }

  const out = {}
  for (const [metric, order] of Object.entries(PREFERENCE)) {
    for (const id of order) {
      const s = perProvider[id]?.[metric]
      if (s && s.value != null) { out[metric] = s; break }
    }
    if (!out[metric]) out[metric] = null
  }
  return out
}

// Local YYYY-MM-DD (server tz), matching the rest of the app's day grouping.
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
