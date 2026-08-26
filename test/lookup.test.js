import { describe, it, expect } from 'vitest'
import { normalizeOFF, normalizeUSDA, comparablePer100 } from '../server/lookup.js'
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

  // Real data captured live 26 Aug 2026 during root-cause tracing (see
  // docs/serving-sizes.md): a serving_size string with a leading descriptive
  // word before the parenthetical weight used to make the naive "first
  // number + letters" regex grab the word instead of the weight.
  it('extracts the parenthetical gram weight instead of a leading quantity word (real Pringles data)', () => {
    const f = normalizeOFF({
      product_name: 'Original Potato Crisps',
      serving_size: '1 serving (28 g)',
      serving_quantity: 28,
      nutriments: { 'energy-kcal_serving': 150 },
    })
    expect(f.serving_size).toBe(28)
    expect(f.serving_unit).toBe('g') // NOT "serving"
  })

  it('extracts the parenthetical mL volume instead of a leading quantity word (real Diet Coke data)', () => {
    const f = normalizeOFF({
      product_name: 'Diet Coke',
      serving_size: '1 can (354.9 mL)',
      serving_quantity: 354.9,
      nutriments: { 'energy-kcal_serving': 0 },
    })
    expect(f.serving_size).toBe(354.9)
    expect(f.serving_unit).toBe('ml') // NOT "can"
  })

  it('still falls back to the loose match when no recognized mass/volume unit is present anywhere', () => {
    const f = normalizeOFF({
      product_name: 'Bulk Bin Item',
      serving_size: '1 scoop',
      nutriments: { 'energy-kcal_serving': 80 },
    })
    expect(f.serving_size).toBe(1)
    expect(f.serving_unit).toBe('scoop')
  })
})

describe('comparablePer100 (search-result comparison figure)', () => {
  it('computes calories per 100g for a gram-based serving', () => {
    expect(comparablePer100({ calories: 28, serving_size: 28, serving_unit: 'g' }))
      .toEqual({ basis: 'g', calories: 100 })
  })

  it('computes calories per 100ml for a millilitre-based serving', () => {
    expect(comparablePer100({ calories: 42, serving_size: 354.9, serving_unit: 'ml' }))
      .toEqual({ basis: 'ml', calories: Math.round((42 / 354.9) * 100) })
  })

  it('converts weight ounces to grams (not fluid ounces to mL)', () => {
    // 1 oz = 28.3495 g; 100 kcal per oz -> ~352.8 kcal/100g
    const r = comparablePer100({ calories: 100, serving_size: 1, serving_unit: 'oz' })
    expect(r.basis).toBe('g')
    expect(r.calories).toBe(Math.round((100 / 28.3495) * 100))
  })

  it('returns null for a unit with no reliable weight/volume equivalence', () => {
    expect(comparablePer100({ calories: 150, serving_size: 1, serving_unit: 'serving' })).toBeNull()
    expect(comparablePer100({ calories: 150, serving_size: 1, serving_unit: 'cup' })).toBeNull()
  })

  it('returns null when calories or serving size is missing', () => {
    expect(comparablePer100({ calories: null, serving_size: 100, serving_unit: 'g' })).toBeNull()
    expect(comparablePer100({ calories: 100, serving_size: 0, serving_unit: 'g' })).toBeNull()
    expect(comparablePer100({ calories: 100, serving_size: 100, serving_unit: null })).toBeNull()
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

  it('surfaces householdServingFullText as display-only context, defaulting to null', () => {
    const withText = normalizeUSDA({
      description: 'Greek Yogurt', servingSize: 170, servingSizeUnit: 'g',
      householdServingFullText: '1 container', labelNutrients: { calories: { value: 120 } },
    })
    expect(withText.household_serving).toBe('1 container')

    const without = normalizeUSDA({
      description: 'Greek Yogurt', servingSize: 170, servingSizeUnit: 'g',
      labelNutrients: { calories: { value: 120 } },
    })
    expect(without.household_serving).toBeNull()
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

  // REPLACES an assertion that the tiebreak within a tier is each source's own
  // order (a stable sort). That property was measured to be the cause of
  // production symptom #3 on 26 Aug 2026: "Banana, baked" and "Banana, raw"
  // scored EXACTLY 2000.5 and USDA listed baked first, so a bare "banana" put a
  // 161 kcal baked banana at rank 1. Provider listing order is not a relevance
  // signal, and depending on it makes rank 1 unreproducible from one call to
  // the next. The tiebreak is now the name, which is deterministic and
  // independent of arrival order — see server/foodSearch/rank.js's rankResults
  // and the shuffled-pool assertions in test/foodSearchRank.test.js.
  it('breaks a within-tier tie deterministically, NOT by the order the source returned rows in', () => {
    // Same tier (prefix) and same token count, so nothing but the tiebreak can
    // decide the order.
    const rows = [{ name: 'Egg Salad' }, { name: 'Egg Sandwich' }, { name: 'Egg Muffin' }]
    const forwards = rankResults(rows, ['egg']).map((r) => r.name)
    const backwards = rankResults([...rows].reverse(), ['egg']).map((r) => r.name)
    expect(forwards).toEqual(backwards)
    expect(forwards).toEqual(['Egg Muffin', 'Egg Salad', 'Egg Sandwich'])
  })
})

describe('normalizeUSDA: Foundation energy (nutrient 2047/2048, not 1008)', () => {
  // Confirmed live 26 Aug 2026 against
  // /fdc/v1/foods/search?dataType=Foundation&query=chicken%20breast: the row
  // "Chicken, breast, boneless, skinless, raw" carries NO nutrient 1008 at
  // all. Its energy is 2047 "Energy (Atwater General Factors)" = 106 kcal and
  // 2048 "Energy (Atwater Specific Factors)" = 112 kcal. Reading only 1008
  // returned calories:null for USDA's most canonical dataset, and the UI's
  // fmt() paints null as a confident "0 kcal".
  const FOUNDATION_ROW = {
    description: 'Chicken, breast, boneless, skinless, raw',
    foodNutrients: [
      { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 22.5 },
      { nutrientId: 2047, nutrientName: 'Energy (Atwater General Factors)', unitName: 'KCAL', value: 106 },
      { nutrientId: 2048, nutrientName: 'Energy (Atwater Specific Factors)', unitName: 'KCAL', value: 112 },
    ],
  }

  it('falls back to the Atwater energy nutrients when 1008 is absent', () => {
    expect(normalizeUSDA(FOUNDATION_ROW).calories).toBe(112) // specific factors: USDA's more accurate figure
  })

  it('CONTROL: nutrient 1008 still wins when it IS present', () => {
    const withPrimary = { ...FOUNDATION_ROW, foodNutrients: [{ nutrientId: 1008, unitName: 'KCAL', value: 165 }, ...FOUNDATION_ROW.foodNutrients] }
    expect(normalizeUSDA(withPrimary).calories).toBe(165)
  })

  it('CONTROL: a row with no energy nutrient at all still reports null, never a fabricated 0', () => {
    const noEnergy = { description: 'Lunchmeat, chicken breast, sliced', foodNutrients: [{ nutrientId: 1003, unitName: 'G', value: 17 }] }
    expect(normalizeUSDA(noEnergy).calories).toBeNull()
  })

  it('never reads a kJ figure as if it were kcal', () => {
    const kj = { description: 'Something', foodNutrients: [{ nutrientId: 1008, nutrientName: 'Energy', unitName: 'kJ', value: 700 }] }
    expect(normalizeUSDA(kj).calories).toBeNull()
  })
})
