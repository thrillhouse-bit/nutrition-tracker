import { describe, it, expect } from 'vitest'
import { entryNutrient, sumEntries, dayBounds, num, fmt } from '../src/lib/nutrition.js'

describe('nutrition math', () => {
  const food = { calories: 100, protein_g: 5, carbs_g: 20, fat_g: 3, fiber_g: 2, sugar_g: 8, sodium_mg: 150 }

  it('scales a nutrient by servings consumed', () => {
    expect(entryNutrient({ food, servings_consumed: 2 }, 'calories')).toBe(200)
    expect(entryNutrient({ food, servings_consumed: 0.5 }, 'protein_g')).toBe(2.5)
  })

  it('treats a missing nutrient as 0, not NaN', () => {
    expect(entryNutrient({ food: {}, servings_consumed: 3 }, 'calories')).toBe(0)
  })

  it('sums nutrients across entries', () => {
    const totals = sumEntries([
      { food, servings_consumed: 1 },
      { food, servings_consumed: 2 },
    ])
    expect(totals.calories).toBe(300)
    expect(totals.protein_g).toBe(15)
    expect(totals.sodium_mg).toBe(450)
  })

  it('returns zeroed totals for an empty log', () => {
    const totals = sumEntries([])
    expect(totals.calories).toBe(0)
    expect(totals.fiber_g).toBe(0)
  })
})

describe('dayBounds', () => {
  it('spans exactly one local day', () => {
    const { from, to } = dayBounds(new Date('2026-08-24T13:45:00'))
    const ms = new Date(to) - new Date(from)
    expect(ms).toBe(24 * 60 * 60 * 1000)
    expect(new Date(from).getHours()).toBe(0)
  })
})

describe('helpers', () => {
  it('num coerces safely', () => {
    expect(num('12.5')).toBe(12.5)
    expect(num(null)).toBe(0)
    expect(num('abc')).toBe(0)
  })
  it('fmt respects decimals', () => {
    expect(fmt(1234.567, 0)).toBe('1,235')
    expect(fmt(5.25, 1)).toBe('5.3')
  })
})
