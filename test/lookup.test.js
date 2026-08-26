import { describe, it, expect } from 'vitest'
import { normalizeOFF, normalizeUSDA } from '../server/lookup.js'
import { rankResults } from '../server/foodSearch/rank.js'

describe('normalizeOFF', () => {
  it('uses per-serving values when a serving is defined', () => {
    const f = normalizeOFF(
      {
        product_name: 'Test Bar',
        brands: 'BrandA, BrandB',
        serving_size: '30 g',
        serving_quantity: 30,
        nutriments: {
          'energy-kcal_serving': 150,
          'energy-kcal_100g': 500,
          proteins_serving: 5,
          carbohydrates_serving: 20,
          fat_serving: 6,
          fiber_serving: 2,
          sugars_serving: 10,
          sodium_serving: 0.1, // grams
        },
      },
      '3017620422003',
    )
    expect(f.name).toBe('Test Bar')
    expect(f.brand).toBe('BrandA') // first brand only
    expect(f.serving_size).toBe(30)
    expect(f.serving_unit).toBe('g')
    expect(f.calories).toBe(150) // serving value, not the 100g value
    expect(f.protein_g).toBe(5)
    expect(f.sodium_mg).toBe(100) // 0.1 g -> 100 mg
    expect(f.source).toBe('openfoodfacts')
  })

  it('falls back to per-100g when no serving is defined', () => {
    const f = normalizeOFF({
      product_name: 'Milk',
      nutriments: { 'energy-kcal_100g': 64, proteins_100g: 3.4, fat_100g: 3.6, sodium_100g: 0.05 },
    })
    expect(f.serving_size).toBe(100)
    expect(f.serving_unit).toBe('g')
    expect(f.calories).toBe(64)
    expect(f.sodium_mg).toBe(50)
  })

  it('derives sodium from salt when sodium is absent', () => {
    const f = normalizeOFF({
      product_name: 'Chips',
      serving_size: '25 g',
      serving_quantity: 25,
      nutriments: { 'energy-kcal_serving': 130, salt_serving: 0.25 },
    })
    expect(f.sodium_mg).toBe(100) // 0.25 g salt / 2.5 = 0.1 g sodium -> 100 mg
  })

  it('derives kcal from kJ when kcal is absent', () => {
    const f = normalizeOFF({ product_name: 'X', nutriments: { 'energy-kj_100g': 2092 } })
    expect(f.calories).toBe(500) // 2092 / 4.184
  })
})

describe('normalizeUSDA', () => {
  it('reads Branded labelNutrients (per serving)', () => {
    const f = normalizeUSDA({
      description: 'Greek Yogurt',
      brandOwner: 'Chobani',
      servingSize: 170,
      servingSizeUnit: 'g',
      gtinUpc: '0123',
      labelNutrients: {
        calories: { value: 120 },
        protein: { value: 15 },
        fat: { value: 0 },
        carbohydrates: { value: 9 },
        fiber: { value: 0 },
        sugars: { value: 4 },
        sodium: { value: 65 },
      },
    })
    expect(f.name).toBe('Greek Yogurt')
    expect(f.brand).toBe('Chobani')
    expect(f.serving_size).toBe(170)
    expect(f.calories).toBe(120)
    expect(f.protein_g).toBe(15)
    expect(f.sodium_mg).toBe(65)
    expect(f.barcode).toBe('0123')
    expect(f.source).toBe('usda')
  })

  it('reads Foundation foodNutrients (per 100 g) by nutrient id', () => {
    const f = normalizeUSDA({
      description: 'Banana, raw',
      foodNutrients: [
        { nutrientId: 1008, value: 89 },
        { nutrientId: 1003, value: 1.1 },
        { nutrientId: 1005, value: 22.8 },
        { nutrientId: 1004, value: 0.3 },
        { nutrientId: 1079, value: 2.6 },
        { nutrientId: 2000, value: 12.2 },
        { nutrientId: 1093, value: 1 },
      ],
    })
    expect(f.serving_size).toBe(100)
    expect(f.serving_unit).toBe('g')
    expect(f.calories).toBe(89)
    expect(f.carbs_g).toBe(22.8)
    expect(f.fiber_g).toBe(2.6)
    expect(f.sugar_g).toBe(12.2)
    expect(f.sodium_mg).toBe(1)
  })
})

// Ranking itself now lives in server/foodSearch/rank.js (rankResults) — see
// test/foodSearchRank.test.js for its full unit coverage. These three cases
// are kept here (against the new implementation) as a direct regression
// check against the exact live bug that motivated the original ranking fix:
// searching "egg" surfaced "Egg Drop Soup"/"Deviled Eggs" ahead of plain
// "Egg", reported live 25 Aug 2026.
describe('rankResults (regression: plain "egg" must lead dish names)', () => {
  it('ranks a plain "Egg" first against a realistic mix of dishes and an ingredient-only hit', () => {
    const rows = [
      { name: 'Egg Drop Soup' },
      { name: 'Deviled Eggs' },
      // Matched by OFF via its ingredients_text ("egg white powder"), not its
      // own product name — this is the "term only in the ingredient list"
      // case the fix must sink to the back.
      { name: 'Trail Mix' },
      { name: 'Egg Salad Sandwich' },
      { name: 'Egg' },
    ]
    const ranked = rankResults(rows, ['egg'])
    expect(ranked[0].name).toBe('Egg') // exact match must lead
    expect(ranked.map((r) => r.name)).not.toContain(undefined)
    // The ingredient-only hit (no "egg" anywhere in its own name) sinks to
    // the very back, behind every row that actually names an egg food.
    expect(ranked[ranked.length - 1].name).toBe('Trail Mix')
  })

  it('tiers exact > prefix > whole word > substring > name-mismatch, case-insensitively', () => {
    const rows = [
      { name: 'Bacon and Egg Casserole' }, // whole word "egg", not a prefix
      { name: 'Preggo Sauce' }, // "egg" is a mid-word substring, no word boundary
      { name: 'Trail Mix' }, // no "egg" anywhere in the name
      { name: 'Eggplant Parmesan' }, // prefix
      { name: 'EGG' }, // exact match, different case
    ]
    const ranked = rankResults(rows, ['Egg'])
    expect(ranked.map((r) => r.name)).toEqual([
      'EGG',
      'Eggplant Parmesan',
      'Bacon and Egg Casserole',
      'Preggo Sauce',
      'Trail Mix',
    ])
  })

  it('keeps each source\'s own order as the tiebreak within a tier (stable sort)', () => {
    // Same tier (prefix) AND same token-count (so the "shorter name" secondary
    // tiebreak — see rank.js — doesn't itself decide the order here), which
    // isolates the stable-sort property being tested.
    const rows = [{ name: 'Egg Salad' }, { name: 'Egg Sandwich' }, { name: 'Egg Muffin' }]
    const ranked = rankResults(rows, ['egg'])
    expect(ranked.map((r) => r.name)).toEqual(['Egg Salad', 'Egg Sandwich', 'Egg Muffin'])
  })
})
