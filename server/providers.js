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
import { ouraConfigured, oauthConfigured as ouraOAuthConfigured, getToken as ouraToken, dailySummary as ouraDailySummary, dailyReadiness as ouraDailyReadiness, dailySleepHours as ouraDailySleepHours, dailySleepScore as ouraDailySleepScore, validAccessToken as ouraValidToken } from './integrations/oura.js'
import { garminConfigured } from './integrations/garmin.js'

// `categories` is human-readable metadata only — nothing in this codebase
// reads it at runtime (grepped: zero references outside this file). It
// still needs to stay honest, because it's the one place a future reader
// (or another lane) would check "what does this provider actually give us"
// without re-deriving it from realSignals/garmin.js/oura.js. Garmin's
// previously listed 'workouts' and 'training load' — neither is true for a
// real connected Garmin account: real Garmin workout detection was never
// built (only demo data ever populates it). Insights' "Training load" chart
// is no longer the empty skeleton this comment once described elsewhere —
// a parallel change wired it to real data — but that data comes from Apple
// Health workouts (store.aggregateWorkoutRows), never from Garmin, so the
// distinction this comment exists to make still holds. See
// docs/garmin-capability-matrix.md for the full per-metric status and what
// each would need to become real for Garmin specifically.
export const PROVIDERS = {
  oura: { id: 'oura', name: 'Oura', connect: 'oauth', categories: ['readiness', 'sleep', 'expenditure', 'steps', 'workouts'] },
  garmin: { id: 'garmin', name: 'Garmin', connect: 'oauth', categories: ['expenditure', 'steps'] },
  apple: { id: 'apple', name: 'Apple Health', connect: 'ingest', categories: ['workouts', 'active energy', 'exercise', 'sleep', 'heart rate', 'body weight'] },
}

// Per-metric provider preference when more than one source has data. `hrv` is
// context-only — it appears in the composed signals for explanation but the
// rules engine (server/plan.js) never reads it, so it can never change a target.
const PREFERENCE = {
  readiness: ['oura', 'garmin'],
  sleep: ['oura', 'apple', 'garmin'],
  workout: ['garmin', 'apple', 'oura'],
  expenditure: ['garmin', 'apple', 'oura'],
  steps: ['garmin', 'apple', 'oura'],
  hrv: ['apple', 'oura'],
}

const HOURS = (ms) => ms / 3600000

// Oura's own `activity` strings (its taxonomy runs to 40+ values — VERIFY
// against a real connected account's actual traffic; this list covers the
// common ones, not confirmed exhaustive) mapped onto this app's own
// workout-kind vocabulary (WORKOUT_KINDS, server/index.js), so an Oura
// workout drives plan.js's isEndurance() the same way a manually-entered or
// Garmin/Apple workout of the same real-world kind would. Anything not
// listed here falls back to the generic 'workout' kind rather than guessing
// — a wrong specific kind (e.g. calling a hike a run) would silently change
// which plan rule fires; 'workout' never triggers the endurance carb bump,
// which is the safe default when the mapping is uncertain.
const OURA_ACTIVITY_TO_KIND = {
  running: 'run', cycling: 'ride', biking: 'ride', swimming: 'swim', rowing: 'row',
  walking: 'walk', hiking: 'hike', strength_training: 'strength', weightlifting: 'strength',
  hiit: 'hiit', core_training: 'strength', cardio: 'cardio', yoga: 'mobility',
  pilates: 'mobility', stretching: 'mobility',
}

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
export async function providerStatus(store, userId, id, nowDate = new Date()) {
  const meta = PROVIDERS[id]
  const settings = await store.getIntegration(userId, id)
  const demoAllowed = settings?.demo !== false

  if (id === 'oura') {
    const configured = ouraConfigured() || ouraOAuthConfigured()
    if (!configured) return { ...meta, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null }
    const accounts = ouraOAuthConfigured() ? await store.listOuraAccounts(userId) : (ouraConfigured() ? [{ id: 'legacy' }] : [])
    if (!accounts.length) return { ...meta, status: 'disconnected', demo: false, last_synced_at: null }
    return { ...meta, status: 'connected', demo: false, last_synced_at: settings?.last_synced_at || null }
  }
  if (id === 'garmin') {
    if (!garminConfigured()) return { ...meta, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null }
    const accounts = await store.listGarminAccounts(userId)
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
    const has = (await store.listAppleSignals?.(userId, ymd(nowDate)))?.length
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

export async function allProviderStatuses(store, userId, nowDate = new Date()) {
  return Promise.all(Object.keys(PROVIDERS).map((id) => providerStatus(store, userId, id, nowDate)))
}

// --- real per-provider signals (best-effort) ------------------------------
async function realSignals(store, userId, id, queryDate, nowDate) {
  const day = ymd(queryDate)
  try {
    if (id === 'oura') {
      let token = null
      let account = null // stays null on the legacy single-token path — no account row to key workouts on
      if (ouraConfigured()) token = ouraToken()
      else if (ouraOAuthConfigured()) {
        account = (await store.listOuraAccounts(userId))[0]
        if (account) token = await ouraValidToken(account, (t) => store.updateOuraTokens(userId, account.id, t))
      }
      if (!token) return {}
      const rec = `${day}T07:00:00`
      const fetchedAt = nowDate.toISOString()
      const out = {}
      // Four calls in parallel: daily_activity (expenditure/steps —
      // previously fetched and then DISCARDED here, even though Garmin/
      // Apple's equivalent fallback slots for these metrics list 'oura' as
      // a candidate), daily_readiness (the actual Readiness score — this
      // used to be daily_activity's score relabeled, a real bug: verified
      // live, a person's Activity and Readiness scores read differently on
      // the same day), sleep (real duration in hours, matching every other
      // provider's sleep shape), and daily_sleep (the separate 0-100 sleep
      // QUALITY score — same demo shape already anticipated a `score` field
      // on the sleep signal; this is what actually populates it for real
      // data). One endpoint having no data yet today (e.g. readiness not
      // scored until first movement) must not blank out the others.
      const [activity, readiness, sleepHours, sleepScore] = await Promise.all([
        ouraDailySummary(token, day).catch(() => null),
        ouraDailyReadiness(token, day).catch(() => null),
        ouraDailySleepHours(token, day).catch(() => null),
        ouraDailySleepScore(token, day).catch(() => null),
      ])
      if (readiness?.score != null) {
        // contributors are 1-100 sub-SCORES (never raw biometrics) and
        // temperature_deviation/temperature_trend_deviation are the
        // genuinely raw °C values — see normalizeReadiness's own comment for
        // why these stay distinct. Both ride along on the readiness signal
        // itself rather than a separate composed metric: they're properties
        // OF that one reading, not an independent thing a plan-influence
        // toggle could switch off on its own.
        out.readiness = sig(readiness.score, {
          unit: 'score', provider: 'oura', recorded_at: rec, fetched_at: fetchedAt, demo: false,
          contributors: readiness.contributors,
          temperature_deviation: readiness.temperature_deviation,
          temperature_trend_deviation: readiness.temperature_trend_deviation,
        })
      }
      if (sleepHours != null) {
        out.sleep = sig(sleepHours, {
          unit: 'h', provider: 'oura', recorded_at: rec, fetched_at: fetchedAt, demo: false,
          score: sleepScore?.score ?? null,
        })
      }
      if (activity?.total_calories != null) {
        // recorded_at anchored to the QUERIED day (noon, same reasoning as
        // `rec` above), not the live fetch moment — viewing a past day fetches
        // its data fresh right now, but the data itself is however old that
        // day is; stamping recorded_at as "now" would make freshnessOf read
        // a 5-day-old day's expenditure as "fresh" and let plan.js treat it
        // as a live signal. fetched_at stays the real fetch moment — that
        // metadata genuinely is about when we made this API call.
        out.expenditure = sig(activity.total_calories, { unit: 'kcal', active: activity.active_calories, provider: 'oura', recorded_at: `${day}T12:00:00`, fetched_at: fetchedAt, demo: false })
      }
      if (activity?.steps != null) {
        out.steps = sig(activity.steps, { unit: 'steps', provider: 'oura', recorded_at: `${day}T12:00:00`, fetched_at: fetchedAt, demo: false })
      }
      // Real workout detection — stored, not live-fetched (oura_workouts is
      // kept current by the same daily backfill/resync that already covers
      // readiness/sleep/activity, so this avoids a 5th live Oura call on
      // every /api/today). Picks the day's earliest-starting workout as the
      // single "today" signal, matching the one-workout-per-day shape every
      // other provider's `workout` slot already assumes; every workout that
      // day is still retained in oura_workouts for a future multi-workout
      // view. No account row (legacy single-token path) means no workouts —
      // there's nowhere to have stored them.
      //
      // "walking" is filtered out before picking a candidate (owner, 25 Aug
      // 2026): Oura logs an ordinary walk as its own workout the same as a
      // run or a ride, but a walk isn't a fueling-relevant session — showing
      // Plan's "Meal timing" a pre-fuel/recovery-fuel node for every walk
      // would be noise the user has to mentally filter on every visit, not
      // a real signal. Every OTHER Oura activity kind still counts; this is
      // a name-specific exclusion, not a demotion of low-intensity activity
      // generally (a filtered-out day still falls through to the next
      // workout that day, if any, exactly as if the walk had never been
      // logged — never a fabricated substitute).
      if (account && typeof store.listOuraWorkouts === 'function') {
        const workouts = await store.listOuraWorkouts(account.id, day).catch(() => [])
        const w = workouts.find((x) => String(x.activity || '').toLowerCase() !== 'walking')
        if (w) {
          const kind = OURA_ACTIVITY_TO_KIND[String(w.activity || '').toLowerCase()] || 'workout'
          const start = w.start_datetime ? new Date(w.start_datetime) : null
          const end = w.end_datetime ? new Date(w.end_datetime) : null
          const startHour = start && !isNaN(start) ? start.getHours() + start.getMinutes() / 60 : null
          out.workout = sig(
            {
              label: w.label || (w.activity ? w.activity[0].toUpperCase() + w.activity.slice(1).replace(/_/g, ' ') : 'Workout'),
              shortLabel: kind,
              kind,
              time: start && !isNaN(start) ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
              startHour,
              endHour: end && !isNaN(end) ? end.getHours() + end.getMinutes() / 60 : null,
              durationMin: start && end && !isNaN(start) && !isNaN(end) ? Math.round((end - start) / 60000) : null,
              estKcal: w.calories,
              status: 'completed',
            },
            { provider: 'oura', recorded_at: w.start_datetime || fetchedAt, fetched_at: fetchedAt, demo: false },
          )
        }
      }
      return out
    }
    if (id === 'garmin') {
      const acct = (await store.listGarminAccounts(userId))[0]
      if (!acct) return {}
      const row = await store.getGarminDaily(acct.id, day)
      if (!row) return {}
      // recorded_at anchored to the QUERIED day (see the matching Oura
      // comment above) — was nowDate.toISOString(), which made a past day's
      // expenditure/steps read as freshly recorded just for being fetched now.
      const rec = `${day}T12:00:00`
      const fetchedAt = nowDate.toISOString()
      const out = {}
      if (row.total_calories != null) out.expenditure = sig(row.total_calories, { unit: 'kcal', active: row.active_calories, provider: 'garmin', recorded_at: rec, fetched_at: fetchedAt, demo: false })
      if (row.steps != null) out.steps = sig(row.steps, { unit: 'steps', provider: 'garmin', recorded_at: rec, fetched_at: fetchedAt, demo: false })
      return out
    }
    if (id === 'apple') {
      const rows = (await store.listAppleSignals?.(userId, day)) || []
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
//
// Must check THIS USER's own account, not just whether the server can do
// OAuth at all — checking only ouraConfigured()/garminConfigured() (server-
// wide: are the app's own client id/secret set) meant that the moment ANY
// user connected a real Oura account, the server counted as "configured" for
// EVERY user, so every other, never-connected user's oura branch stopped
// counting as neverConnected — realSignals returned {} (no token) and demo
// was skipped too, leaving them with nothing for readiness/sleep at all,
// while the Connections tab correctly kept reporting Oura as available to
// connect. providerStatus (above) already got this right per-user; this now
// asks the same question the same way, so demo and status can't drift again.
async function neverConnected(store, userId, id, settings) {
  if (id === 'oura') {
    if (!(ouraConfigured() || ouraOAuthConfigured())) return true
    const accounts = ouraOAuthConfigured() ? await store.listOuraAccounts(userId) : [{ id: 'legacy' }]
    return accounts.length === 0
  }
  if (id === 'garmin') {
    if (!garminConfigured()) return true
    return (await store.listGarminAccounts(userId)).length === 0
  }
  if (id === 'apple') return !settings?.connected_at
  return false
}

// --- compose one signal per metric, respecting provenance + toggles -------
// `queryDate` (defaults to `nowDate`) is which day's REAL provider data to
// read — /api/today passes the day the user is actually viewing here, so
// navigating to a past/future day shows that day's readiness/sleep/workout
// instead of always today's (owner, 25 Aug 2026: signals stayed pinned to
// "now" regardless of which day Today's prev/next arrows had navigated to).
// `nowDate` still governs the DEMO scenario (demoSignals) and every
// fetched_at stamp below — demo is a canned "what it looks like connected"
// preview that was never meant to vary by day, and fetched_at genuinely is
// "when we made this API call" metadata, distinct from which day the DATA
// itself is about.
export async function composeSignals(store, nowDate = new Date(), userId, queryDate = nowDate) {
  const settings = {}
  for (const id of Object.keys(PROVIDERS)) settings[id] = await store.getIntegration(userId, id)
  const demo = demoSignals(nowDate)

  // Gather per-provider signals: real first, else demo (if allowed & enabled).
  const perProvider = {}
  for (const id of Object.keys(PROVIDERS)) {
    if (settings[id]?.enabled === false) { perProvider[id] = {}; continue }
    const real = await realSignals(store, userId, id, queryDate, nowDate)
    if (Object.keys(real).length) perProvider[id] = real
    else if (settings[id]?.demo !== false && (await neverConnected(store, userId, id, settings[id]))) perProvider[id] = demo[id] || {}
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

  // A manually-entered workout (server/db.js's getManualWorkout — no
  // connected-wearable concept, so it isn't one of PROVIDERS/PREFERENCE's
  // candidates above) always wins the `workout` slot when present. This is
  // deliberately unconditional, not just a fallback for "no wearable data":
  // it's how someone with no Garmin/Apple connection gets a real (non-demo)
  // workout signal at all, and even for a connected wearable, the user
  // telling Plan directly "I'm running at 5:30" is more current than
  // whatever the device auto-detected or hasn't detected yet.
  const manual = await store.getManualWorkout?.(userId, ymd(nowDate))
  if (manual) {
    const { recorded_at, ...workoutValue } = manual
    out.workout = sig(workoutValue, { unit: null, provider: 'manual', recorded_at, fetched_at: recorded_at, demo: false })
  }

  return out
}

// Local YYYY-MM-DD (server tz), matching the rest of the app's day grouping.
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
