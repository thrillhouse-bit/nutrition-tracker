import { describe, it, expect } from 'vitest'
import { normalizeActivity } from '../server/integrations/oura.js'

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
