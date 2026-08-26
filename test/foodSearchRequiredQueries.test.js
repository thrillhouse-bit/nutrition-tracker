// End-to-end proof, at the orchestration layer, for the exact query list the
// redesign was required to fix. Provider responses here are modeled on REAL
// captured evidence (see docs/food-search.md's root-cause section — the
// "zucchini"/"courgette"/"zuccini" fixtures reproduce the actual live
// Open Food Facts payloads fetched during root-cause tracing) plus
// representative USDA-shaped rows for the generic-food pass, so this proves
// the FULL pipeline (normalize -> synonym/typo expansion -> multi-provider
// fan-out -> merge/dedupe -> rank), not just one layer in isolation.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/foodSearch/providers.js', () => ({
  queryUsdaFoundation: vi.fn(),
  queryUsdaSurvey: vi.fn(),
  queryUsdaBranded: vi.fn(),
  queryOFF: vi.fn(),
}))

const { queryUsdaFoundation, queryUsdaSurvey, queryUsdaBranded, queryOFF } = await import('../server/foodSearch/providers.js')
const { searchFoods } = await import('../server/foodSearch/index.js')

const ok = (source, dataset, query, items) => ({ source, dataset, query, ok: true, count: items.length, items, latencyMs: 5 })
const empty = (source, dataset, query) => ok(source, dataset, query, [])

// A small USDA-generic fixture per canonical food — mirrors what a real
// Foundation/SR Legacy row normalizes to via server/lookup.js's
// normalizeUSDA (description -> name, per-100g macros).
const USDA_GENERIC = {
  zucchini: { name: 'Zucchini, raw', calories: 17, protein_g: 1.21, carbs_g: 3.11, fat_g: 0.32, source: 'usda', datasetTier: 'generic' },
  'chicken breast': { name: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.57, source: 'usda', datasetTier: 'generic' },
  banana: { name: 'Bananas, raw', calories: 89, protein_g: 1.09, carbs_g: 22.84, fat_g: 0.33, source: 'usda', datasetTier: 'generic' },
  oatmeal: { name: 'Oats', calories: 389, protein_g: 16.89, carbs_g: 66.27, fat_g: 6.9, source: 'usda', datasetTier: 'generic' },
  'greek yogurt': { name: 'Yogurt, Greek, plain, nonfat', calories: 59, protein_g: 10.19, carbs_g: 3.6, fat_g: 0.4, source: 'usda', datasetTier: 'generic' },
}

// Real OFF branded noise, captured live during root-cause tracing for the
// "zucchini" query (see docs/food-search.md) — used to prove the fix keeps
// the generic result on top even with this exact noisy payload present.
const OFF_ZUCCHINI_NOISE = [
  { name: 'Courgettes-Tomates cerises Cuisinées', calories: 37, protein_g: 1, carbs_g: 3.2, fat_g: 1.9, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'veggie mix zucchini & bulgur', calories: 90, protein_g: 3, carbs_g: 15, fat_g: 2, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'Zucchini Bio', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'Borlotti Beans', calories: null, protein_g: 8, carbs_g: 20, fat_g: 0.5, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'Waffle', calories: 160, protein_g: 4, carbs_g: 20, fat_g: 7, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'Cuketové pyré extra', calories: 68, protein_g: 1, carbs_g: 12, fat_g: 0.2, source: 'openfoodfacts', datasetTier: 'branded' },
]

const OFF_COKE = [
  { name: 'Coke Zero', calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'Coke Original Taste', calories: 42, protein_g: 0, carbs_g: 10.6, fat_g: 0, source: 'openfoodfacts', datasetTier: 'branded' },
  { name: 'Diet coke', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'openfoodfacts', datasetTier: 'branded' },
]

// Default: nothing configured/found anywhere unless a test wires it up.
beforeEach(() => {
  vi.clearAllMocks()
  queryUsdaFoundation.mockImplementation((q) => Promise.resolve(empty('usda', 'foundation', q)))
  queryUsdaSurvey.mockImplementation((q) => Promise.resolve(empty('usda', 'survey', q)))
  queryUsdaBranded.mockImplementation((q) => Promise.resolve(empty('usda', 'branded', q)))
  queryOFF.mockImplementation((q) => Promise.resolve(empty('openfoodfacts', 'branded', q)))
})

describe('required queries: an appropriate edible result leads (or is clearly present)', () => {
  it('zucchini -> "Zucchini, raw" (or equivalent) leads, real branded noise present but outranked', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'zucchini' ? ok('usda', 'generic', q, [USDA_GENERIC.zucchini]) : empty('usda', 'generic', q)))
    queryOFF.mockImplementation((q) => Promise.resolve(q === 'zucchini' ? ok('openfoodfacts', 'branded', q, OFF_ZUCCHINI_NOISE) : empty('openfoodfacts', 'branded', q)))
    const r = await searchFoods('zucchini')
    expect(r.results[0].name).toBe('Zucchini, raw')
  })

  it('courgette -> the zucchini-equivalent result is found via the synonym variant', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'zucchini' ? ok('usda', 'generic', q, [USDA_GENERIC.zucchini]) : empty('usda', 'generic', q)))
    const r = await searchFoods('courgette')
    expect(r.results[0].name).toBe('Zucchini, raw')
  })

  it('zucchini raw -> a raw zucchini result leads, with the qualifier agreement not required to find it at all', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(ok('usda', 'generic', q, [USDA_GENERIC.zucchini])))
    const r = await searchFoods('zucchini raw')
    expect(r.results[0].name).toBe('Zucchini, raw')
  })

  it('chicken breast -> a plain chicken breast leads', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'chicken breast' ? ok('usda', 'generic', q, [USDA_GENERIC['chicken breast']]) : empty('usda', 'generic', q)))
    queryOFF.mockImplementation((q) => Promise.resolve(q === 'chicken breast' ? ok('openfoodfacts', 'branded', q, [
      { name: 'Chargrilled British Chicken Breast Slices', calories: 106, protein_g: 20, carbs_g: 1, fat_g: 2, source: 'openfoodfacts', datasetTier: 'branded' },
    ]) : empty('openfoodfacts', 'branded', q)))
    const r = await searchFoods('chicken breast')
    expect(r.results[0].name).toMatch(/chicken.*breast/i)
  })

  it('banana -> a plain banana leads over "Banana chips"', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'banana' ? ok('usda', 'generic', q, [USDA_GENERIC.banana]) : empty('usda', 'generic', q)))
    queryOFF.mockImplementation((q) => Promise.resolve(q === 'banana' ? ok('openfoodfacts', 'branded', q, [
      { name: 'Banana chips', calories: 528, protein_g: 2, carbs_g: 60, fat_g: 30, source: 'openfoodfacts', datasetTier: 'branded' },
    ]) : empty('openfoodfacts', 'branded', q)))
    const r = await searchFoods('banana')
    expect(r.results[0].name).toBe('Bananas, raw')
  })

  it('oatmeal -> a plain oats/oatmeal result leads', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'oatmeal' ? ok('usda', 'generic', q, [USDA_GENERIC.oatmeal]) : empty('usda', 'generic', q)))
    queryOFF.mockImplementation((q) => Promise.resolve(q === 'oatmeal' ? ok('openfoodfacts', 'branded', q, [
      { name: 'Oatmeal Squares', calories: 220, protein_g: 4, carbs_g: 40, fat_g: 3, source: 'openfoodfacts', datasetTier: 'branded' },
    ]) : empty('openfoodfacts', 'branded', q)))
    const r = await searchFoods('oatmeal')
    expect(r.results[0].name).toBe('Oats')
  })

  it('greek yogurt -> a plain Greek yogurt leads', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'greek yogurt' ? ok('usda', 'generic', q, [USDA_GENERIC['greek yogurt']]) : empty('usda', 'generic', q)))
    const r = await searchFoods('greek yogurt')
    expect(r.results[0].name).toMatch(/greek/i)
  })

  it('coke / Coca-Cola -> a real cola result is clearly present at the top', async () => {
    queryOFF.mockImplementation((q) => Promise.resolve(['coke', 'coca cola', 'coca-cola'].includes(q) ? ok('openfoodfacts', 'branded', q, OFF_COKE) : empty('openfoodfacts', 'branded', q)))
    const cokeResult = await searchFoods('coke')
    expect(cokeResult.results[0].name).toMatch(/coke/i)
    const colaResult = await searchFoods('Coca-Cola')
    expect(colaResult.results.some((r) => /coke|coca cola/i.test(r.name))).toBe(true)
  })
})

describe('required queries: typo tolerance without letting irrelevant results outrank the correct food', () => {
  it('"zuccini" (typo) still surfaces zucchini, ranked above wholly unrelated noise', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(q === 'zucchini' ? ok('usda', 'generic', q, [USDA_GENERIC.zucchini]) : empty('usda', 'generic', q)))
    queryOFF.mockImplementation((q) => Promise.resolve(q === 'zucchini' ? ok('openfoodfacts', 'branded', q, OFF_ZUCCHINI_NOISE) : empty('openfoodfacts', 'branded', q)))
    const r = await searchFoods('zuccini')
    expect(r.usedCorrection).toBe(true)
    expect(r.results[0].name).toBe('Zucchini, raw')
    // The wholly-unrelated "Waffle" (real OFF noise for this exact query,
    // captured live) must not outrank it.
    const waffleIdx = r.results.findIndex((x) => x.name === 'Waffle')
    const zucchiniIdx = r.results.findIndex((x) => x.name === 'Zucchini, raw')
    if (waffleIdx !== -1) expect(zucchiniIdx).toBeLessThan(waffleIdx)
  })
})
