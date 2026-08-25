import { describe, it, expect } from 'vitest'
import { normalizeActivity, normalizeReadiness, normalizeSleepSessions, normalizeSleepScore, normalizeWorkout } from '../server/integrations/oura.js'

describe('oura normalizeActivity', () => {
  it('maps the daily_activity fields the app uses', () => {
    const r = normalizeActivity({
      day: '2026-08-24',
      score: 82,
      active_calories: 512,
      total_calories: 2450,
      steps: 9231,
      class_5_min: 'ignored',
    })
    expect(r).toEqual({
      day: '2026-08-24',
      total_calories: 2450,
      active_calories: 512,
      steps: 9231,
      score: 82,
    })
  })

  it('coerces missing / non-numeric values to null but keeps the day', () => {
    const r = normalizeActivity({ day: '2026-08-24', total_calories: null, steps: 'x' })
    expect(r.day).toBe('2026-08-24')
    expect(r.total_calories).toBeNull()
    expect(r.active_calories).toBeNull()
    expect(r.steps).toBeNull()
  })
})

// Separate from normalizeActivity on purpose: daily_activity and
// daily_readiness are different Oura endpoints with their own scores. This
// app once conflated them — the readiness backfill and the live "today"
// signal both queried daily_activity and stored its score as "readiness" —
// which silently produced either the wrong number or nothing at all
// depending on the account (see the comment on readinessRange). A shape
// this close to normalizeActivity's is exactly what let that slip past
// review; keeping the two tested separately is the guard against it
// happening again.
describe('oura normalizeReadiness', () => {
  it('maps the daily_readiness score, independent of any activity fields', () => {
    const r = normalizeReadiness({ day: '2026-08-24', score: 91, activity_score_lookalike: 55 })
    expect(r.day).toBe('2026-08-24')
    expect(r.score).toBe(91)
  })

  it('retains the three named contributors as SCORES, never relabeled as raw biometrics, plus the raw temperature deviations', () => {
    const r = normalizeReadiness({
      day: '2026-08-24',
      score: 91,
      temperature_deviation: -0.2,
      temperature_trend_deviation: -0.1,
      contributors: { hrv_balance: 88, resting_heart_rate: 76, body_temperature: 95, sleep_balance: 60 },
    })
    expect(r.contributors).toEqual({ hrv_balance: 88, resting_heart_rate: 76, body_temperature: 95 }) // sleep_balance not one of the three asked for — dropped, not silently included
    expect(r.temperature_deviation).toBe(-0.2)
    expect(r.temperature_trend_deviation).toBe(-0.1)
  })

  it('coerces a missing/non-numeric score to null but keeps the day', () => {
    expect(normalizeReadiness({ day: '2026-08-24' }).score).toBeNull()
    expect(normalizeReadiness({ day: '2026-08-24', score: 'x' }).score).toBeNull()
  })

  it('coerces missing contributors/temperature to null rather than throwing on an absent contributors object', () => {
    const r = normalizeReadiness({ day: '2026-08-24', score: 50 })
    expect(r.contributors).toEqual({ hrv_balance: null, resting_heart_rate: null, body_temperature: null })
    expect(r.temperature_deviation).toBeNull()
    expect(r.temperature_trend_deviation).toBeNull()
  })
})

describe('oura normalizeSleepSessions', () => {
  it('sums total_sleep_duration across a day\'s sessions and converts seconds to hours', () => {
    const hours = normalizeSleepSessions([
      { total_sleep_duration: 6 * 3600 }, // main sleep, 6h
      { total_sleep_duration: 0.5 * 3600 }, // a nap, 30m
    ])
    expect(hours).toBeCloseTo(6.5, 5)
  })

  it('returns null (not 0) when there are no sessions, matching this file\'s no-reading convention', () => {
    expect(normalizeSleepSessions([])).toBeNull()
  })
})

describe('oura normalizeSleepScore', () => {
  it('maps the daily_sleep score — a different endpoint/number from sleep-duration above', () => {
    expect(normalizeSleepScore({ day: '2026-08-24', score: 78 })).toEqual({ day: '2026-08-24', score: 78 })
  })

  it('coerces a missing score to null', () => {
    expect(normalizeSleepScore({ day: '2026-08-24' })).toEqual({ day: '2026-08-24', score: null })
  })
})

describe('oura normalizeWorkout', () => {
  it('maps every documented workout field', () => {
    const r = normalizeWorkout({
      id: 'abc-123', day: '2026-08-24', activity: 'running', intensity: 'moderate', source: 'autodetected',
      label: null, calories: 412.5, distance: 5230.1,
      start_datetime: '2026-08-24T17:30:00+00:00', end_datetime: '2026-08-24T18:15:00+00:00',
    })
    expect(r).toEqual({
      id: 'abc-123', day: '2026-08-24', activity: 'running', intensity: 'moderate', source: 'autodetected',
      label: null, calories: 412.5, distance: 5230.1,
      start_datetime: '2026-08-24T17:30:00+00:00', end_datetime: '2026-08-24T18:15:00+00:00',
    })
  })

  it('coerces id to a string so a numeric Oura id still dedupes/upserts consistently', () => {
    expect(normalizeWorkout({ id: 12345, day: '2026-08-24' }).id).toBe('12345')
    expect(typeof normalizeWorkout({ id: 12345, day: '2026-08-24' }).id).toBe('string')
  })

  it('coerces a missing id or day to null (workoutsRange then drops the row)', () => {
    expect(normalizeWorkout({ day: '2026-08-24' }).id).toBeNull()
    expect(normalizeWorkout({ id: 'x' }).day).toBeNull()
  })
})
