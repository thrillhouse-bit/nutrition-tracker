import { describe, it, expect } from 'vitest'
import { normalizeActivity, normalizeReadiness } from '../server/integrations/oura.js'

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
  it('maps only day + score — no activity fields to carry over', () => {
    const r = normalizeReadiness({ day: '2026-08-24', score: 91, contributors: { hrv_balance: 88 } })
    expect(r).toEqual({ day: '2026-08-24', score: 91 })
  })

  it('coerces a missing/non-numeric score to null but keeps the day', () => {
    const r = normalizeReadiness({ day: '2026-08-24', score: 'x' })
    expect(r).toEqual({ day: '2026-08-24', score: null })
  })
})
