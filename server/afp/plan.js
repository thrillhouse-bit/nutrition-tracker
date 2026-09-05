// Adaptive Fuel Plan — orchestration layer between the store and the pure
// engine (server/afp/engine.js). This module does I/O (reads/writes the
// store) so it is NOT pure — the engine stays pure and independently
// testable; this is what wires real profile/workout/wearable rows into the
// engine's input shape and persists its output.
import crypto from 'node:crypto'
import { computeAdaptivePlan, ENGINE_VERSION, reconcileMacroTargets } from './engine.js'
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
  const eerSex = row.equation_stratum === 'men' ? 'male' : row.equation_stratum === 'women' ? 'female' : null
  return {
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    heightCm: row.height_cm != null ? Number(row.height_cm) : null,
    ageYears: row.age_years != null ? Number(row.age_years) : null,
    // Do not forward the legacy `sex` profile field to NASEM. This keeps the
    // EER stratum a conscious, separately-stored selection.
    sex: eerSex,
    eerSex,
    bodyFatPct: row.body_fat_pct != null ? Number(row.body_fat_pct) : null,
    // This is deliberately not derived from `sex`: NASEM's two observed
    // strata require an explicit calculation selection (or `unsure`).
    equationStratum: row.equation_stratum || null,
    activityLevel: row.activity_level || null,
    goal: row.goal || 'maintain',
    planMode: row.plan_mode || 'automatic',
    eligibilityAttested: row.eligibility_attested === true,
    weeklyChangeKg: row.weekly_change_kg != null ? Number(row.weekly_change_kg) : null,
    calorieAdjustment: row.calorie_adjustment != null ? Number(row.calorie_adjustment) : null,
    isPregnantOrPostpartum: !!row.is_pregnant_or_postpartum,
    isLactating: !!row.is_lactating,
    hasCkdOrRenalCondition: !!row.has_ckd_or_renal_condition,
    hasEdRiskFlag: !!row.has_ed_risk_flag,
    hasClinicianPrescribedDiet: !!row.has_clinician_prescribed_diet,
    hasMajorIllnessOrGlucoseLoweringMeds: !!row.has_major_illness_or_glucose_lowering_meds,
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

function formatTime12(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null
  const [hour, minute] = value.split(':').map(Number)
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function partOfDay(hour) {
  if (hour < 5) return 'Night'
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  if (hour < 21) return 'Evening'
  return 'Night'
}

// Planned sessions live in the same canonical store that sets AFP's training
// energy. Surface the leading session to Today/recommendations too so a person
// never enters a workout in Plan that the daily loop then ignores. A real
// completed wearable signal still wins; an old manual signal or demo does not.
export function withCanonicalPlannedWorkout(signals = {}, plannedRows = [], nowDate = new Date()) {
  const existing = signals.workout
  if (existing && !existing.demo && existing.provider !== 'manual') return signals
  if (!plannedRows.length) return signals

  const selected = [...plannedRows].sort((a, b) => {
    const priorityA = a.is_key_session || a.is_race ? 0 : 1
    const priorityB = b.is_key_session || b.is_race ? 0 : 1
    if (priorityA !== priorityB) return priorityA - priorityB
    return (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
  })[0]
  const startHour = selected.start_time
    ? Number(selected.start_time.slice(0, 2)) + Number(selected.start_time.slice(3, 5)) / 60
    : null
  const sportLabel = selected.sport[0].toUpperCase() + selected.sport.slice(1)
  const label = startHour == null ? sportLabel : `${partOfDay(startHour)} ${sportLabel}`
  const recorded = nowDate.toISOString()
  return {
    ...signals,
    workout: {
      value: {
        label,
        shortLabel: selected.sport,
        kind: selected.sport,
        intensity: selected.intensity,
        time: formatTime12(selected.start_time),
        startHour,
        endHour: startHour == null ? null : startHour + Number(selected.duration_min) / 60,
        durationMin: Number(selected.duration_min),
        status: 'planned',
      },
      provider: 'manual',
      freshness: 'fresh',
      recorded_at: recorded,
      fetched_at: recorded,
      demo: false,
    },
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
    provider: 'oura',
    startAt: w.start_datetime || null,
  }
}

function appleSignalToSession(row) {
  const v = row.value || {}
  return {
    sport: v.kind || 'workout',
    intensity: 'moderate', // HealthKit gives no intensity field to derive this from
    durationMin: Number(v.duration_min) || 0,
    distanceKm: null,
    provider: 'apple',
    startAt: v.start_datetime || row.recorded_at || null,
  }
}

function garminWorkoutToSession(w) {
  return {
    sport: w.sport || w.activity_type || 'workout',
    intensity: w.intensity === 'hard' || w.intensity === 'easy' ? w.intensity : 'moderate',
    durationMin: Number(w.duration_min ?? w.durationMin) || 0,
    distanceKm: w.distance_km != null ? Number(w.distance_km) : null,
    provider: 'garmin',
    startAt: w.start_datetime || w.startTime || null,
  }
}

// A source may mirror a completed session from another wearable. Deduplicate
// only when both sources provide a concrete start instant plus same kind and
// duration; never use daily caloric totals as a pseudo-session.
const SYNC_SOURCE_PRECEDENCE = Object.freeze({ oura: 0, apple: 1, garmin: 2 })
const DUPLICATE_START_TOLERANCE_MS = 5 * 60 * 1000
const DUPLICATE_DURATION_TOLERANCE_MIN = 10

// Prefer the first source in the explicit precedence order when two providers
// report the same sport within five minutes and within ten duration minutes.
// Start-less rows are intentionally never deduplicated: guessing would risk
// deleting distinct workouts.
export function dedupeSessions(sessions) {
  const ordered = [...sessions].sort((a, b) => (SYNC_SOURCE_PRECEDENCE[a.provider] ?? 99) - (SYNC_SOURCE_PRECEDENCE[b.provider] ?? 99))
  const retained = []
  for (const session of ordered) {
    const start = session.startAt ? new Date(session.startAt).getTime() : NaN
    const duplicate = Number.isFinite(start) && retained.some((kept) => {
      const keptStart = kept.startAt ? new Date(kept.startAt).getTime() : NaN
      return Number.isFinite(keptStart)
        && kept.sport === session.sport
        && Math.abs(keptStart - start) <= DUPLICATE_START_TOLERANCE_MS
        && Math.abs((Number(kept.durationMin) || 0) - (Number(session.durationMin) || 0)) <= DUPLICATE_DURATION_TOLERANCE_MIN
    })
    if (!duplicate) retained.push(session)
  }
  return retained
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
  try {
    // Current Garmin storage has daily aggregates only; consume Garmin only
    // when a future store exposes concrete workouts. Its daily calories must
    // never be treated as an AFP exercise-energy override.
    if (typeof store.listGarminWorkouts === 'function') {
      const rows = await store.listGarminWorkouts(userId, day)
      for (const w of rows) sessions.push(garminWorkoutToSession(w))
    }
  } catch { /* Garmin unavailable today must not fail the whole plan */ }
  return dedupeSessions(sessions)
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function manualPlan(profileRow, overrides) {
  const targets = profileRow.manual_targets
  if (!targets || !['calories', 'protein_g', 'carbs_g', 'fat_g'].every((key) => Number.isFinite(Number(targets[key])) && Number(targets[key]) >= 0)) {
    return { ok: false, code: 'manual_targets_required', mode: profileRow.plan_mode }
  }
  // Manual/clinician targets are recorded, never completed or adjusted by
  // the automatic engine. The only transformation is macro arithmetic
  // validation, so a contradictory entry cannot masquerade as a target.
  const merged = { ...targets, ...(overrides || {}) }
  const coherent = reconcileMacroTargets(merged)
  if (coherent.calories !== Number(merged.calories) || coherent.fat_g !== Number(merged.fat_g)) {
    return { ok: false, code: 'incoherent_manual_targets', mode: profileRow.plan_mode }
  }
  return { ok: true, mode: profileRow.plan_mode, targets: coherent, computedTargets: coherent, source: 'manual' }
}

export function afpInputSnapshotHash(snapshot) {
  return crypto.createHash('sha256').update(stableJson(snapshot)).digest('hex')
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

  const plan = (profileRow.plan_mode || 'automatic') === 'automatic'
    ? computeAdaptivePlan({ profile, plannedSessions: planned, syncedSessions: synced, nextDaySessions, overrides })
    : manualPlan(profileRow, overrides)
  const inputSnapshot = { profile, planned: plannedRows, synced, nextDaySessions: nextPlannedRows, overrides }
  const inputSnapshotHash = afpInputSnapshotHash(inputSnapshot)
  // A recomputation with identical canonical inputs is a read-equivalent
  // operation. Returning the existing row prevents needless revision churn.
  if ((existing?.input_snapshot_hash ?? existing?.inputSnapshotHash) === inputSnapshotHash) return existing
  // The engine owns the science registry/version; retain a conservative
  // marker for old snapshots while the persisted envelope is upgraded.
  const scienceVersion = plan.scienceVersion || 'unversioned'
  return store.saveAfpDailyPlan(userId, date, { engineVersion: plan.engineVersion || ENGINE_VERSION, scienceVersion, inputSnapshot, inputSnapshotHash, plan, overrides })
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
