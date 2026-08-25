import { describe, it, expect } from 'vitest'
import { normalizeActivity, normalizeReadiness, normalizeSleepSessions } from '../server/integrations/oura.js'

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

describe('oura normalizeReadiness', () => {
  // Regression: this app used to relabel daily_activity's Activity score as
  // "readiness" — normalizeReadiness exists specifically to read the
  // daily_readiness endpoint's OWN score instead, a genuinely different
  // number on a real account.
  it('maps the daily_readiness score, independent of any activity fields', () => {
    const r = normalizeReadiness({ day: '2026-08-24', score: 91, temperature_deviation: -0.2, contributors: { hrv_balance: 88 } })
    expect(r).toEqual({ day: '2026-08-24', score: 91 })
  })

  it('coerces a missing score to null but keeps the day', () => {
    const r = normalizeReadiness({ day: '2026-08-24' })
    expect(r).toEqual({ day: '2026-08-24', score: null })
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
