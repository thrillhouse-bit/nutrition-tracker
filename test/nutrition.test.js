import { describe, it, expect } from 'vitest'
import { entryNutrient, entryIncomplete, sumEntries, dayBounds, num, fmt } from '../src/lib/nutrition.js'

describe('nutrition math', () => {
  const food = { calories: 100, protein_g: 5, carbs_g: 20, fat_g: 3, fiber_g: 2, sugar_g: 8, sodium_mg: 150 }

  it('scales a nutrient by servings consumed', () => {
    expect(entryNutrient({ food, servings_consumed: 2 }, 'calories')).toBe(200)
    expect(entryNutrient({ food, servings_consumed: 0.5 }, 'protein_g')).toBe(2.5)
  })

  // A food with no recorded value for a nutrient (never filled in via Manual
  // Entry, or never reported by a looked-up product) is a genuinely unknown
  // quantity, not a verified 0 — entryNutrient must say so by returning
  // `null` rather than silently coercing it, or a "0 kcal" render becomes
  // indistinguishable from a real zero-calorie food (e.g. black coffee).
  it('treats a food with no recorded value as unknown (null), not 0', () => {
    expect(entryNutrient({ food: {}, servings_consumed: 3 }, 'calories')).toBe(null)
    expect(entryNutrient({ food: { calories: null }, servings_consumed: 1 }, 'calories')).toBe(null)
  })

  // A food explicitly recorded at 0 (the user typed "0", or a real
  // zero-calorie item) is a known value and must NOT be flagged/treated as
  // missing — only a genuinely-absent value is.
  it('does not treat an explicit 0 as missing', () => {
    expect(entryNutrient({ food: { calories: 0 }, servings_consumed: 1 }, 'calories')).toBe(0)
    expect(entryIncomplete({ food: { calories: 0 }, servings_consumed: 1 })).toBe(false)
  })

  describe('entryIncomplete', () => {
    it('flags an entry whose food has no recorded calories', () => {
      expect(entryIncomplete({ food: { name: 'egg' }, servings_consumed: 1 })).toBe(true)
      expect(entryIncomplete({ food: { name: 'egg', calories: null }, servings_consumed: 1 })).toBe(true)
    })
    it('does not flag a fully-specified entry', () => {
      expect(entryIncomplete({ food, servings_consumed: 1 })).toBe(false)
    })
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

  // An entry with no recorded nutrition must not drag the day's totals down
  // as if it were a verified zero: the total reflects only the entries that
  // actually have a known value for that nutrient, and a mix of known +
  // unknown entries still sums correctly instead of throwing or NaN-ing.
  it('excludes entries with no recorded value from the totals, rather than counting them as 0', () => {
    const incomplete = { food: { name: 'egg' }, servings_consumed: 1 } // every nutrient blank
    const totals = sumEntries([{ food, servings_consumed: 1 }, incomplete])
    expect(totals.calories).toBe(100)
    expect(totals.protein_g).toBe(5)
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
