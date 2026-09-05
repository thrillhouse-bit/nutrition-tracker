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
import { garminReleaseReady } from './integrations/garmin.js'

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

// Same 48h boundary freshnessOf already uses for "stale vs unavailable", and
// the number Apple's own providerStatus branch below has used for "stale vs
// disconnected" since before this file tracked Oura the same way — reused
// here rather than picking a new arbitrary threshold for Oura specifically.
const PROVIDER_STALE_HOURS = 48

// --- Oura sync observability (per user, persisted — not console-only) -----
// Closes a real gap: a token-refresh failure used to be swallowed with, at
// best, a console.error with no server-side trace and nothing an API could
// ever read back. `last_attempted_sync`/`last_sync_counts` live in
// integrations.settings (JSON, already on the table — no migration); the
// failure reason reuses integrations.error, an existing column that nothing
// had ever written to for any provider. See docs/oura-sync-runbook.md for how
// an investigation reads these back.

// Turns a thrown token-refresh/backfill error into a short, stable code —
// distinguishing "the grant is dead, reconnect" from "Oura's API had a bad
// moment" is exactly what a console.error's free-text message couldn't answer
// after the fact. postToken() (server/integrations/oura.js) sets `err.status`
// to Oura's OAuth token endpoint's own HTTP status; a network-level failure
// (DNS, timeout, connection refused) never gets a `.status` at all.
export function classifyOuraRefreshError(err) {
  const status = err?.status
  const msg = String(err?.message || err || '')
  if (status === 400 || status === 401 || /invalid_grant|invalid_client/i.test(msg)) return 'refresh_token_expired'
  if (status != null) return `oura_api_error_${status}`
  if (err?.name === 'AbortError' || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) return 'oura_api_unreachable'
  return 'oura_refresh_failed'
}

// Records one sync attempt (backfill or live-fetch token use), regardless of
// outcome — see the callers in server/index.js and realSignals below.
// `outcome.ok` clears any previously-recorded error (a later success is the
// only thing that should un-flag a past failure); `outcome.counts`, when
// given, is this attempt's { fetched, accepted, deduplicated } — see
// backfillOuraHistory's own comment for exactly what each counts.
// `outcome.synced` (only ever true from a completed backfill, never the live
// path) is what actually advances `last_synced_at` — a live read succeeding
// only proves the token still works, not that anything new was stored.
export async function recordOuraAttempt(store, userId, outcome) {
  const cur = await store.getIntegration(userId, 'oura')
  const nowIso = new Date().toISOString()
  const settings = { ...(cur.settings || {}), last_attempted_sync: nowIso }
  if (outcome.counts) settings.last_sync_counts = { ...outcome.counts, at: nowIso }
  const patch = { settings }
  if (outcome.ok) {
    patch.error = null
    if (outcome.synced) patch.last_synced_at = nowIso
  } else {
    patch.error = outcome.reason || 'oura_sync_failed'
  }
  return store.setIntegration(userId, 'oura', patch)
}

// --- "actively syncing" transient state (Connections tab) ------------------
// In-memory only, per process, keyed by `${userId}:${providerId}` — true only
// for the duration of a live backfill call. Deliberately NOT persisted: this
// is a single-process Node server with no job queue, so a process restart
// mid-sync clears it along with the in-flight request itself, and the
// provider falls back to whatever `connected`/`stale` already reads from
// last_synced_at — never a flag stuck "syncing" forever, which would be the
// worse failure (see docs/oura-sync-runbook.md).
const syncingNow = new Set()
const syncKey = (userId, providerId) => `${userId}:${providerId}`
export function markSyncing(userId, providerId) { syncingNow.add(syncKey(userId, providerId)) }
export function clearSyncing(userId, providerId) { syncingNow.delete(syncKey(userId, providerId)) }
export function isSyncing(userId, providerId) { return syncingNow.has(syncKey(userId, providerId)) }

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
export const OURA_ACTIVITY_TO_KIND = {
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
  // Measurement time answers "which day is this data about?"; sync time
  // answers "did the provider successfully refresh it?". Only a live read
  // for the currently requested day may use freshness_at. Historical rows
  // remain dated by their measurement time, even if fetched now.
  return { value, freshness: freshnessOf(extra.freshness_at || extra.recorded_at), ...extra }
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
// status ∈ connected | syncing | stale | disconnected | not-configured |
// error | demo — the Connections screen's own STATE REFERENCE legend already
// anticipated `syncing`/`error` glyphs before anything here ever emitted
// them. `not-configured` is env-level (nobody on this server CAN connect —
// same fact /api/health already reports per-provider as 'not-configured'),
// distinct from `demo` (this user specifically never connected, but the
// server could accept one) and from `disconnected` (configured, but this
// user turned off the demo fallback and hasn't connected). A provider can be
// not-configured AND still show demo data (`demo` field independent of
// `status` — ProviderRow's isDemo check reads `provider.demo`, not the
// status string, for exactly this reason).
export async function providerStatus(store, userId, id, nowDate = new Date()) {
  const meta = PROVIDERS[id]
  const settings = await store.getIntegration(userId, id)
  const demoAllowed = settings?.demo !== false

  if (id === 'oura') {
    const configured = ouraConfigured(userId) || ouraOAuthConfigured()
    // Sync-observability fields (see recordOuraAttempt) — surfaced on every
    // branch below, not just `connected`/`stale`, so a caller always sees the
    // full attempt history even if, say, an operator turns OAuth off after a
    // period of it working.
    const obs = {
      last_attempted_sync: settings?.settings?.last_attempted_sync || null,
      last_sync_counts: settings?.settings?.last_sync_counts || null,
      sync_error: settings?.error || null,
    }
    if (!configured) return { ...meta, ...obs, status: 'not-configured', demo: demoAllowed, last_synced_at: null }
    const oauthAccounts = ouraOAuthConfigured() ? await store.listOuraAccounts(userId) : []
    const accounts = oauthAccounts.length ? oauthAccounts : (ouraConfigured(userId) ? [{ id: 'legacy' }] : [])
    if (!accounts.length) return { ...meta, ...obs, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null }
    if (isSyncing(userId, id)) return { ...meta, ...obs, status: 'syncing', demo: false, last_synced_at: settings?.last_synced_at || null }
    const lastSynced = settings?.last_synced_at || null
    const ageH = lastSynced ? HOURS(nowDate.getTime() - new Date(lastSynced).getTime()) : Infinity
    return { ...meta, ...obs, status: ageH <= PROVIDER_STALE_HOURS ? 'connected' : 'stale', demo: false, last_synced_at: lastSynced }
  }
  if (id === 'garmin') {
    if (!garminReleaseReady()) return { ...meta, status: 'not-configured', demo: demoAllowed, last_synced_at: null }
    const accounts = await store.listGarminAccounts(userId)
    if (!accounts.length) return { ...meta, status: demoAllowed ? 'demo' : 'disconnected', demo: demoAllowed, last_synced_at: null }
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
async function realSignals(store, userId, id, queryDate, nowDate, isRequestedCurrentDay) {
  const day = ymd(queryDate)
  try {
    if (id === 'oura') {
      let token = null
      let account = null // stays null on the legacy single-token path — no account row to key workouts on
      if (ouraOAuthConfigured()) {
        account = (await store.listOuraAccounts(userId))[0]
        if (account) {
          try {
            token = await ouraValidToken(account, (t) => store.updateOuraTokens(userId, account.id, t))
          } catch (err) {
            // A refresh failure here used to propagate straight to this
            // function's own outer try/catch (return {}) with zero trace —
            // composeSignals then showed nothing for this user's readiness/
            // sleep/expenditure and there was no way afterward to tell
            // "refresh token expired or revoked" from "Oura API unreachable"
            // apart. Persisted (not just logged) so a later investigation —
            // via GET /api/connections or docs/oura-sync-runbook.md — has
            // something to read; last_attempted_sync moves too, since this
            // genuinely was an attempt, unlike the common case just below
            // where the cached token is still valid and nothing was tried.
            // last_synced_at is untouched — a live read proves the token
            // still works, never that anything new landed in storage.
            const reason = classifyOuraRefreshError(err)
            console.error(`[oura] token refresh failed for user ${userId} (account ${account.id}): ${err?.message || err}`)
            await recordOuraAttempt(store, userId, { ok: false, reason }).catch((e) => {
              console.error(`[oura-sync-observability] failed to persist live-path attempt for user ${userId}: ${e.message}`)
            })
          }
        }
      }
      // A failed OAuth refresh must not silently switch identity to a legacy
      // token. The bound fallback is only for users without an OAuth account.
      if (!account && ouraConfigured(userId)) token = ouraToken(userId)
      if (!token) return {}
      const rec = `${day}T07:00:00`
      const fetchedAt = nowDate.toISOString()
      // Freshness is about a successful fetch for the caller's current local
      // day, not the UTC/server calendar day. Historical measurements retain
      // their recorded date as provenance.
      const freshnessAt = isRequestedCurrentDay ? fetchedAt : null
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
          unit: 'score', provider: 'oura', recorded_at: rec, fetched_at: fetchedAt, freshness_at: freshnessAt, demo: false,
          contributors: readiness.contributors,
          temperature_deviation: readiness.temperature_deviation,
          temperature_trend_deviation: readiness.temperature_trend_deviation,
        })
      }
      if (sleepHours != null) {
        out.sleep = sig(sleepHours, {
          unit: 'h', provider: 'oura', recorded_at: rec, fetched_at: fetchedAt, freshness_at: freshnessAt, demo: false,
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
        out.expenditure = sig(activity.total_calories, { unit: 'kcal', active: activity.active_calories, provider: 'oura', recorded_at: `${day}T12:00:00`, fetched_at: fetchedAt, freshness_at: freshnessAt, demo: false })
      }
      if (activity?.steps != null) {
        out.steps = sig(activity.steps, { unit: 'steps', provider: 'oura', recorded_at: `${day}T12:00:00`, fetched_at: fetchedAt, freshness_at: freshnessAt, demo: false })
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
// OAuth at all — checking only ouraConfigured()/garminReleaseReady() (server-
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
    if (!(ouraConfigured(userId) || ouraOAuthConfigured())) return true
    const accounts = ouraOAuthConfigured() ? await store.listOuraAccounts(userId) : []
    return accounts.length === 0 && !ouraConfigured(userId)
  }
  if (id === 'garmin') {
    if (!garminReleaseReady()) return true
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
export async function composeSignals(store, nowDate = new Date(), userId, queryDate = nowDate, { isRequestedCurrentDay } = {}) {
  const settings = {}
  for (const id of Object.keys(PROVIDERS)) settings[id] = await store.getIntegration(userId, id)
  const demo = demoSignals(nowDate)

  // Gather per-provider signals: real first, else demo (if allowed & enabled).
  const perProvider = {}
  for (const id of Object.keys(PROVIDERS)) {
    if (settings[id]?.enabled === false) { perProvider[id] = {}; continue }
    const real = await realSignals(store, userId, id, queryDate, nowDate, isRequestedCurrentDay ?? ymd(queryDate) === ymd(nowDate))
    if (Object.keys(real).length) perProvider[id] = real
    else if (settings[id]?.demo !== false && (await neverConnected(store, userId, id, settings[id]))) perProvider[id] = demo[id] || {}
    else perProvider[id] = {}
  }

  // Merge per metric: ANY provider's real (non-demo) value outranks ANY
  // provider's demo value, regardless of PREFERENCE order — only fall back to
  // demo when no provider in the list has real data for that metric. This is
  // two passes rather than one so PREFERENCE order still breaks ties WITHIN
  // each pass (two demo providers, or — hypothetically — two real ones,
  // still resolve by the existing preference order).
  //
  // Before this, a single pass took the first non-null value in PREFERENCE
  // order with no real/demo distinction, so a provider listed earlier that
  // was merely in default demo mode (never connected) pre-empted a
  // correctly-connected, later-listed provider's real data outright — e.g.
  // `workout: ['garmin', 'apple', 'oura']` let Garmin's canned "Evening Run"
  // win over a real, connected Oura account's actual workout every single
  // time, purely because Garmin sorts first, never because Garmin's demo was
  // in any sense a better answer. Confirmed live: `garmin: "not-configured"`,
  // `oura: "oauth"`, yet Workouts showed the fixed demo scenario.
  const out = {}
  for (const [metric, order] of Object.entries(PREFERENCE)) {
    let chosen = null
    for (const id of order) {
      const s = perProvider[id]?.[metric]
      if (s && s.value != null && s.demo !== true) { chosen = s; break }
    }
    if (!chosen) {
      for (const id of order) {
        const s = perProvider[id]?.[metric]
        if (s && s.value != null) { chosen = s; break }
      }
    }
    out[metric] = chosen
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
