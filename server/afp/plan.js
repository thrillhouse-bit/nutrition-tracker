// Adaptive Fuel Plan — orchestration layer between the store and the pure
// engine (server/afp/engine.js). This module does I/O (reads/writes the
// store) so it is NOT pure — the engine stays pure and independently
// testable; this is what wires real profile/workout/wearable rows into the
// engine's input shape and persists its output.
import { computeAdaptivePlan, ENGINE_VERSION } from './engine.js'
import { OURA_ACTIVITY_TO_KIND } from '../providers.js'

// 'YYYY-MM-DD' + N days, using server-local calendar-day arithmetic (same
// convention as server/index.js's dayRange) — Date#setDate correctly rolls
// over month/year boundaries, so this is safe at the end of any month.
export function addDaysToYmd(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function profileRowToEngineInput(row = {}) {
  return {
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    heightCm: row.height_cm != null ? Number(row.height_cm) : null,
    ageYears: row.age_years != null ? Number(row.age_years) : null,
    sex: row.sex || null,
    bodyFatPct: row.body_fat_pct != null ? Number(row.body_fat_pct) : null,
    activityLevel: row.activity_level || null,
    goal: row.goal || 'maintain',
    weeklyChangeKg: row.weekly_change_kg != null ? Number(row.weekly_change_kg) : null,
    calorieAdjustment: row.calorie_adjustment != null ? Number(row.calorie_adjustment) : null,
    isPregnantOrPostpartum: !!row.is_pregnant_or_postpartum,
    hasEdRiskFlag: !!row.has_ed_risk_flag,
  }
}

export function plannedRowToSession(row) {
  return {
    sport: row.sport,
    intensity: row.intensity,
    durationMin: Number(row.duration_min),
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    isKeySession: !!row.is_key_session,
    isRace: !!row.is_race,
    carbLoadingOptIn: !!row.carb_loading_opt_in,
  }
}

function ouraWorkoutToSession(w) {
  return {
    sport: OURA_ACTIVITY_TO_KIND[String(w.activity || '').toLowerCase()] || 'workout',
    intensity: w.intensity === 'hard' || w.intensity === 'easy' ? w.intensity : 'moderate',
    durationMin: w.start_datetime && w.end_datetime
      ? Math.max(0, Math.round((new Date(w.end_datetime) - new Date(w.start_datetime)) / 60000))
      : 0,
    distanceKm: w.distance != null ? Number(w.distance) / 1000 : null, // Oura reports meters
    calories: w.calories != null ? Number(w.calories) : null,
    provider: 'oura',
  }
}

function appleSignalToSession(row) {
  const v = row.value || {}
  return {
    sport: v.kind || 'workout',
    intensity: 'moderate', // HealthKit gives no intensity field to derive this from
    durationMin: Number(v.duration_min) || 0,
    distanceKm: null,
    calories: null, // HealthKit workout ingestion carries no per-workout energy today
    provider: 'apple',
  }
}

// Every real completed workout for `day`, across whichever providers are
// connected — used for the day's ENERGY only when present (see
// engine.reconcileSessions); a provider with nothing for the day simply
// contributes no sessions, never an error.
export async function gatherSyncedSessions(store, userId, day) {
  const sessions = []
  try {
    const ouraAccounts = await store.listOuraAccounts?.(userId)
    const account = ouraAccounts?.[0]
    if (account && typeof store.listOuraWorkouts === 'function') {
      const rows = await store.listOuraWorkouts(account.id, day)
      for (const w of rows) sessions.push(ouraWorkoutToSession(w))
    }
  } catch { /* Oura unavailable today must not fail the whole plan */ }
  try {
    if (typeof store.listAppleSignals === 'function') {
      const rows = await store.listAppleSignals(userId, day)
      for (const r of rows) if (r.metric === 'workout') sessions.push(appleSignalToSession(r))
    }
  } catch { /* Apple unavailable today must not fail the whole plan */ }
  return sessions
}

async function computeAndSave(store, userId, date) {
  const profileRow = await store.getAfpProfile(userId)
  const profile = profileRowToEngineInput(profileRow)

  const plannedRows = await store.getPlannedWorkoutsForDay(userId, date)
  const planned = plannedRows.map(plannedRowToSession)
  const synced = await gatherSyncedSessions(store, userId, date)

  const nextDate = addDaysToYmd(date, 1)
  const nextPlannedRows = await store.getPlannedWorkoutsForDay(userId, nextDate)
  const nextDaySessions = nextPlannedRows.map(plannedRowToSession)

  // A day-specific override, once set, survives a recompute of that SAME day
  // (e.g. a synced workout landing later today) — it's a correction to the
  // day's plan, not a one-time discard.
  const existing = await store.getAfpDailyPlan(userId, date)
  const overrides = existing?.overrides || null

  const plan = computeAdaptivePlan({ profile, plannedSessions: planned, syncedSessions: synced, nextDaySessions, overrides })
  const inputSnapshot = { profile, planned: plannedRows, synced, nextDaySessions: nextPlannedRows, overrides }
  return store.saveAfpDailyPlan(userId, date, { engineVersion: ENGINE_VERSION, inputSnapshot, plan, overrides })
}

// The reconciliation rule: TODAY always recomputes from current data (a
// synced workout landing mid-morning, a profile edit, a body-weight log all
// take effect immediately). A PAST day, once it has a saved snapshot, is
// FROZEN — later wearable data must never silently rewrite what its plan
// said at the time. `forceRecompute` is the one explicit escape hatch (e.g.
// correcting a data-entry mistake) — see PATCH /api/afp/plan/:date/recompute.
export async function getOrComputeAfpPlan(store, userId, date, { today, forceRecompute = false } = {}) {
  const isToday = date === today
  if (!isToday && !forceRecompute) {
    const existing = await store.getAfpDailyPlan(userId, date)
    if (existing) return { row: existing, recomputed: false }
  }
  const row = await computeAndSave(store, userId, date)
  return { row, recomputed: true }
}
