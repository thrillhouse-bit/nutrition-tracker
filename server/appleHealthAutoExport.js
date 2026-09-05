// Adapter for "Health Auto Export" (a third-party App Store app) as an
// alternative Apple Health ingest path to the custom native companion in
// ios/. Same destination (POST /api/apple/ingest's internal sample shape —
// see ios/Shared/HealthModel.swift for the canonical contract), different
// source: this translates HAE's own JSON export format (documented at
// https://github.com/Lybron/health-auto-export/wiki/API-Export---JSON-Format)
// into { date, samples[] } instead of requiring a from-scratch Xcode build.
//
// Built from HAE's PUBLISHED schema docs, not a payload captured from a real
// device (no iPhone available to generate one) — the workout and aggregated-
// sleep shapes are well-documented and mapped with confidence; the generic
// per-metric "metrics" array (steps/active energy/HRV/resting HR) is less
// certain, so this tries several plausible field-name variants and reports
// anything it can't map in `unmapped` (see mapHealthAutoExportPayload's
// return) rather than silently dropping it — that list is exactly what's
// needed to patch the mapping quickly once a real export is tested.

const WORKOUT_KIND_MAP = {
  running: 'run', run: 'run',
  cycling: 'ride', ride: 'ride', biking: 'ride',
  swimming: 'swim', swim: 'swim',
  rowing: 'row', row: 'row',
  walking: 'walk', walk: 'walk',
  hiking: 'hike', hike: 'hike',
  'traditional strength training': 'strength', 'functional strength training': 'strength', strength: 'strength',
  'high intensity interval training': 'hiit', hiit: 'hiit',
  'core training': 'strength', 'flexibility': 'mobility', yoga: 'mobility', pilates: 'mobility',
  'mixed cardio': 'cardio', cardio: 'cardio', elliptical: 'cardio', 'stair climbing': 'cardio',
}

function mapWorkoutKind(name) {
  if (!name) return 'workout'
  const key = String(name).toLowerCase().trim()
  return WORKOUT_KIND_MAP[key] || 'workout'
}

function num(v) {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

// HAE timestamps are "yyyy-MM-dd HH:mm:ss Z" — a literal local wall-clock
// time plus an offset (e.g. "2026-08-26 07:15:00 -0700"), NOT a UTC instant
// to be reinterpreted in the server's own timezone. Parsing the wall-clock
// portion preserves the local display hour/day, while the normalized offset
// preserves the actual instant for ordering and retry identity. Undated or
// offset-free points are skipped rather than assigned the server's timezone.
function parseLocalWallClock(str) {
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})$/)
  if (!m) return null
  const offset = m[7] === 'Z' ? 'Z' : m[7].replace(/([+-]\d{2}):?(\d{2})/, '$1:$2')
  const instant = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`
  if (!Number.isFinite(Date.parse(instant))) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  return { y, mo, d, h, mi, s, instant, hourFloat: h + mi / 60 + s / 3600, ymd: `${m[1]}-${m[2]}-${m[3]}` }
}

function isoFromWallClock(w) {
  if (!w) return null
  return w.instant
}

// HAE reports energy as {qty, units} — units is usually "kcal" but the
// export can be configured for kJ; convert defensively rather than assume.
function kcalFrom(energyObj) {
  if (!energyObj || energyObj.qty == null) return null
  const qty = num(energyObj.qty)
  if (qty == null) return null
  const unit = String(energyObj.units || 'kcal').toLowerCase()
  if (unit.includes('kj')) return qty / 4.184
  return qty
}

function mapWorkouts(workouts) {
  if (!Array.isArray(workouts)) return []
  const samples = []
  for (const w of workouts) {
    const start = parseLocalWallClock(w.start)
    const end = parseLocalWallClock(w.end)
    if (!start) continue
    const durationMin = num(w.duration) != null ? num(w.duration) / 60
      : (end ? (Date.parse(end.instant) - Date.parse(start.instant)) / 60000 : null)
    const kind = mapWorkoutKind(w.name)
    const label = w.name ? String(w.name) : 'Workout'
    samples.push({
      metric: 'workout',
      day: start.ymd,
      value: {
        label,
        shortLabel: kind,
        kind,
        time: null, // display formatting is the server's job elsewhere; not required here
        startHour: start.hourFloat,
        endHour: end ? end.hourFloat : (durationMin != null ? start.hourFloat + durationMin / 60 : null),
        duration_min: durationMin,
        est_kcal: kcalFrom(w.activeEnergyBurned) ?? kcalFrom(w.totalEnergy),
        status: 'completed',
      },
      unit: null,
      recorded_at: isoFromWallClock(start),
      fetched_at: new Date().toISOString(),
      extra: null,
    })
  }
  return samples
}

// HAE's "aggregated sleep" shape (per its wiki): one object per day with
// totalSleep/asleep/inBed and a core/deep/rem stage breakdown, in hours.
function mapSleep(sleepEntries) {
  if (!Array.isArray(sleepEntries)) return []
  const samples = []
  for (const s of sleepEntries) {
    const hours = num(s.asleep) ?? num(s.totalSleep)
    if (hours == null) continue
    const start = parseLocalWallClock(s.sleepStart)
    if (!start) continue
    samples.push({
      metric: 'sleep',
      day: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : (parseLocalWallClock(s.sleepEnd)?.ymd || start.ymd),
      value: hours,
      unit: 'h',
      recorded_at: isoFromWallClock(start) || new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      extra: {
        ...(num(s.core) != null ? { core_h: num(s.core) } : {}),
        ...(num(s.deep) != null ? { deep_h: num(s.deep) } : {}),
        ...(num(s.rem) != null ? { rem_h: num(s.rem) } : {}),
      },
    })
  }
  return samples
}

// Generic scalar metrics (steps, active energy, HRV, resting HR) — HAE's
// "metrics" array entries are keyed by a human-readable name with a `data`
// array of {date, qty} points; tries the plausible name variants below and
// takes the latest point independently for each local day. The guided setup
// requires daily aggregation for cumulative steps/energy values.
const SCALAR_METRIC_ALIASES = {
  steps: ['step_count', 'steps', 'stepcount'],
  expenditure: ['active_energy', 'activeenergy', 'active_energy_burned'],
  hrv: ['heart_rate_variability', 'hrv', 'heart_rate_variability_sdnn'],
  resting_hr: ['resting_heart_rate', 'restingheartrate', 'resting_hr'],
}

function normalizeMetricName(name) {
  return String(name || '').toLowerCase().replace(/[\s-]+/g, '_')
}

function mapScalarMetrics(metrics) {
  if (!Array.isArray(metrics)) return { samples: [], unmapped: [] }
  const samples = []
  const unmapped = []
  for (const m of metrics) {
    const normalized = normalizeMetricName(m.name)
    const targetKey = Object.keys(SCALAR_METRIC_ALIASES).find((k) => SCALAR_METRIC_ALIASES[k].includes(normalized))
    const points = Array.isArray(m.data) ? m.data : []
    if (!targetKey) {
      if (points.length) unmapped.push(m.name)
      continue
    }
    const byDay = new Map()
    for (const point of points) {
      const clock = parseLocalWallClock(point.date)
      if (!clock || num(point.qty) == null) continue
      const previous = byDay.get(clock.ymd)
      if (!previous || Date.parse(clock.instant) >= Date.parse(previous.clock.instant)) byDay.set(clock.ymd, { point, clock })
    }
    for (const { point: latest, clock: local } of byDay.values()) {
    samples.push({
      metric: targetKey,
      day: local.ymd,
      value: num(latest.qty),
      unit: m.units || null,
      recorded_at: isoFromWallClock(local) || new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      extra: null,
    })
    }
  }
  return { samples, unmapped }
}

// Full translation: Health Auto Export's { data: { metrics, workouts,
// sleepAnalysis? } } body -> this app's { date, samples[] } ingest shape.
// `date` is derived from whatever samples actually carry a day, defaulting
// to the caller-supplied fallback (typically the server's own local today)
// when nothing does.
export function mapHealthAutoExportPayload(body, fallbackDay) {
  const data = body?.data || {}
  const workoutSamples = mapWorkouts(data.workouts)
  const sleepSamples = mapSleep(data.sleepAnalysis || data.sleep)
  const { samples: scalarSamples, unmapped } = mapScalarMetrics(data.metrics)
  const samples = [...workoutSamples, ...sleepSamples, ...scalarSamples]

  const firstDay = samples.map((s) => s.day).find(Boolean)
  const day = firstDay || fallbackDay

  return { date: day, samples, unmapped }
}
