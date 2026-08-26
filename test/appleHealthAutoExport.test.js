// Tests for the Health Auto Export -> internal ingest-sample translation.
// The workout/sleep shapes are built from HAE's published wiki schema
// (https://github.com/Lybron/health-auto-export/wiki/API-Export---JSON-Format),
// not a payload captured from a real device — these fixtures mirror that
// documented schema as closely as possible; see appleHealthAutoExport.js's
// own header comment for the honest caveat on the generic scalar-metrics path.
import { describe, it, expect } from 'vitest'
import { mapHealthAutoExportPayload } from '../server/appleHealthAutoExport.js'

describe('mapHealthAutoExportPayload — workouts', () => {
  it('maps a running workout to the internal WorkoutValue shape, kcal from activeEnergyBurned', () => {
    const body = {
      data: {
        workouts: [{
          name: 'Running',
          start: '2026-08-26 07:00:00 -0700',
          end: '2026-08-26 07:42:00 -0700',
          duration: 2520, // 42 min, in seconds
          activeEnergyBurned: { qty: 410, units: 'kcal' },
        }],
      },
    }
    const { date, samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(date).toBe('2026-08-26')
    expect(samples).toHaveLength(1)
    const s = samples[0]
    expect(s.metric).toBe('workout')
    expect(s.value.kind).toBe('run')
    expect(s.value.label).toBe('Running')
    expect(s.value.startHour).toBeCloseTo(7, 5)
    expect(s.value.duration_min).toBe(42)
    expect(s.value.est_kcal).toBe(410)
    expect(s.value.status).toBe('completed')
  })

  it('converts kJ to kcal when HAE reports energy in kJ', () => {
    const body = { data: { workouts: [{ name: 'Cycling', start: '2026-08-26 08:00:00 +0000', activeEnergyBurned: { qty: 1672, units: 'kJ' } }] } }
    const { samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples[0].value.est_kcal).toBeCloseTo(1672 / 4.184, 2)
  })

  it('falls back to computing duration from start/end when duration is absent', () => {
    const body = { data: { workouts: [{ name: 'Walking', start: '2026-08-26 06:00:00 +0000', end: '2026-08-26 06:30:00 +0000' }] } }
    const { samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples[0].value.duration_min).toBeCloseTo(30, 5)
  })

  it('maps an unrecognized workout name to the generic "workout" kind rather than dropping it', () => {
    const body = { data: { workouts: [{ name: 'Kickboxing', start: '2026-08-26 06:00:00 +0000' }] } }
    const { samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples[0].value.kind).toBe('workout')
    expect(samples[0].value.label).toBe('Kickboxing') // the real name is preserved for display
  })

  it('preserves local wall-clock hour regardless of the UTC offset in the timestamp', () => {
    // 7am in a -0700 zone is a very different UTC hour than 7am in +0900 —
    // the point is that BOTH read as startHour 7, not shifted to the
    // server's own timezone.
    const west = mapHealthAutoExportPayload({ data: { workouts: [{ name: 'Running', start: '2026-08-26 07:00:00 -0700' }] } }, '2026-08-25')
    const east = mapHealthAutoExportPayload({ data: { workouts: [{ name: 'Running', start: '2026-08-26 07:00:00 +0900' }] } }, '2026-08-25')
    expect(west.samples[0].value.startHour).toBeCloseTo(7, 5)
    expect(east.samples[0].value.startHour).toBeCloseTo(7, 5)
  })
})

describe('mapHealthAutoExportPayload — sleep', () => {
  it('maps aggregated sleep to hours-asleep, with stage breakdown in extra', () => {
    const body = {
      data: {
        sleepAnalysis: [{
          date: '2026-08-26',
          totalSleep: 7.8,
          asleep: 7.1,
          inBed: 7.8,
          core: 3.5,
          deep: 1.2,
          rem: 2.4,
          sleepStart: '2026-08-25 23:15:00 -0700',
          sleepEnd: '2026-08-26 06:20:00 -0700',
        }],
      },
    }
    const { samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    const sleep = samples.find((s) => s.metric === 'sleep')
    expect(sleep.value).toBe(7.1) // prefers "asleep" (actual sleep time) over "totalSleep" (includes awake-in-bed)
    expect(sleep.unit).toBe('h')
    expect(sleep.extra).toEqual({ core_h: 3.5, deep_h: 1.2, rem_h: 2.4 })
  })

  it('falls back to totalSleep when asleep is absent', () => {
    const body = { data: { sleepAnalysis: [{ date: '2026-08-26', totalSleep: 6.5, sleepStart: '2026-08-25 23:00:00 +0000' }] } }
    const { samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples.find((s) => s.metric === 'sleep').value).toBe(6.5)
  })
})

describe('mapHealthAutoExportPayload — generic scalar metrics', () => {
  it('maps steps, active energy, HRV, and resting HR from the metrics array, taking the latest point', () => {
    const body = {
      data: {
        metrics: [
          { name: 'step_count', units: 'steps', data: [{ date: '2026-08-26 08:00:00 +0000', qty: 3000 }, { date: '2026-08-26 14:00:00 +0000', qty: 8200 }] },
          { name: 'active_energy', units: 'kcal', data: [{ date: '2026-08-26 14:00:00 +0000', qty: 640 }] },
          { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-08-26 07:00:00 +0000', qty: 55 }] },
          { name: 'resting_heart_rate', units: 'bpm', data: [{ date: '2026-08-26 07:00:00 +0000', qty: 58 }] },
        ],
      },
    }
    const { samples, unmapped } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples.find((s) => s.metric === 'steps').value).toBe(8200) // latest point, not the first
    expect(samples.find((s) => s.metric === 'expenditure').value).toBe(640)
    expect(samples.find((s) => s.metric === 'hrv').value).toBe(55)
    expect(samples.find((s) => s.metric === 'resting_hr').value).toBe(58)
    expect(unmapped).toEqual([])
  })

  it('reports an unrecognized metric name in `unmapped` rather than silently dropping it', () => {
    const body = { data: { metrics: [{ name: 'some_new_metric_apple_added', units: 'x', data: [{ date: '2026-08-26 08:00:00 +0000', qty: 1 }] }] } }
    const { samples, unmapped } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples).toEqual([])
    expect(unmapped).toEqual(['some_new_metric_apple_added'])
  })

  it('is tolerant of case/spacing variants in metric names', () => {
    const body = { data: { metrics: [{ name: 'Step Count', data: [{ date: '2026-08-26 08:00:00 +0000', qty: 5000 }] }] } }
    const { samples } = mapHealthAutoExportPayload(body, '2026-08-25')
    expect(samples.find((s) => s.metric === 'steps').value).toBe(5000)
  })
})

describe('mapHealthAutoExportPayload — malformed/empty input (control)', () => {
  it('never throws on a missing data key, an empty body, or non-array fields', () => {
    expect(() => mapHealthAutoExportPayload({}, '2026-08-25')).not.toThrow()
    expect(() => mapHealthAutoExportPayload({ data: {} }, '2026-08-25')).not.toThrow()
    expect(() => mapHealthAutoExportPayload({ data: { workouts: 'not-an-array', metrics: null } }, '2026-08-25')).not.toThrow()
    expect(mapHealthAutoExportPayload({}, '2026-08-25').samples).toEqual([])
  })

  it('falls back to the caller-supplied day when nothing in the payload carries a date', () => {
    const { date } = mapHealthAutoExportPayload({ data: {} }, '2026-08-25')
    expect(date).toBe('2026-08-25')
  })
})
