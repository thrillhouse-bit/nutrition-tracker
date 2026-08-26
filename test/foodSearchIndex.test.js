import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/foodSearch/providers.js', () => ({
  queryUsdaGeneric: vi.fn(),
  queryUsdaBranded: vi.fn(),
  queryOFF: vi.fn(),
}))

const { queryUsdaGeneric, queryUsdaBranded, queryOFF } = await import('../server/foodSearch/providers.js')
const { searchFoods } = await import('../server/foodSearch/index.js')

const skipped = (source, dataset, query) => ({ source, dataset, query, ok: null, count: 0, items: [], latencyMs: 1, skipped: 'not_configured' })
const empty = (source, dataset, query) => ({ source, dataset, query, ok: true, count: 0, items: [], latencyMs: 1 })
const failed = (source, dataset, query) => ({ source, dataset, query, ok: false, count: 0, items: [], latencyMs: 1, error: 'boom' })
const withItems = (source, dataset, query, items) => ({ source, dataset, query, ok: true, count: items.length, items, latencyMs: 1 })

const ZUCCHINI = { name: 'Zucchini, raw', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, source: 'usda', datasetTier: 'generic' }

beforeEach(() => {
  vi.clearAllMocks()
  // Default: nothing configured/found anywhere, unless a test overrides it —
  // keeps every test explicit about what it's asserting.
  queryUsdaGeneric.mockImplementation((q) => Promise.resolve(skipped('usda', 'generic', q)))
  queryUsdaBranded.mockImplementation((q) => Promise.resolve(skipped('usda', 'branded', q)))
  queryOFF.mockImplementation((q) => Promise.resolve(empty('openfoodfacts', 'branded', q)))
})

describe('searchFoods: empty/degenerate input', () => {
  it('returns no results for a blank query without calling any provider (control)', async () => {
    const r = await searchFoods('   ')
    expect(r.results).toEqual([])
    expect(queryUsdaGeneric).not.toHaveBeenCalled()
  })
})

describe('searchFoods: the "zucchini" fix, end to end', () => {
  it('surfaces the generic USDA whole-food result ahead of OFF branded noise', async () => {
    queryUsdaGeneric.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
    queryOFF.mockImplementation((q) => q === 'zucchini'
      ? Promise.resolve(withItems('openfoodfacts', 'branded', q, [
        { name: 'Courgettes-Tomates cerises Cuisinées', calories: 37, protein_g: 1, carbs_g: 3.2, fat_g: 1.9, source: 'openfoodfacts', datasetTier: 'branded' },
        { name: 'Waffle', calories: 160, protein_g: 4, carbs_g: 20, fat_g: 7, source: 'openfoodfacts', datasetTier: 'branded' },
      ]))
      : Promise.resolve(empty('openfoodfacts', 'branded', q)))

    const r = await searchFoods('zucchini')
    expect(r.results[0].name).toBe('Zucchini, raw')
    expect(r.degraded).toBe(false)
  })

  it('"courgette" (a pure synonym) also finds the zucchini entry via the variant query', async () => {
    queryUsdaGeneric.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('courgette')
    // The primary query "courgette" itself found nothing generic, but its
    // synonym variant "zucchini" was ALSO queried in the same pass.
    expect(queryUsdaGeneric).toHaveBeenCalledWith('zucchini')
    expect(r.results.some((x) => x.name === 'Zucchini, raw')).toBe(true)
  })

  it('a typo ("zuccini") is corrected ONLY after the raw query (and its variants) found nothing', async () => {
    queryUsdaGeneric.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('zuccini')
    expect(r.usedCorrection).toBe(true)
    expect(queryUsdaGeneric).toHaveBeenCalledWith('zucchini') // the corrected term was tried
    expect(r.results[0].name).toBe('Zucchini, raw')
  })

  it('does NOT try a typo correction when the primary query already found something (conservative)', async () => {
    queryOFF.mockImplementation((q) => Promise.resolve(withItems('openfoodfacts', 'branded', q, [{ name: 'Some Real Product', calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, source: 'openfoodfacts' }])))
    const r = await searchFoods('banana') // a real, correctly-spelled query with results
    expect(r.usedCorrection).toBe(false)
  })
})

describe('searchFoods: dropping nutrition-less junk', () => {
  it('excludes a candidate with every macro null rather than rendering a fabricated 0 kcal', async () => {
    queryOFF.mockImplementation((q) => Promise.resolve(withItems('openfoodfacts', 'branded', q, [
      { name: 'Borlotti Beans', calories: null, protein_g: null, carbs_g: null, fat_g: null, source: 'openfoodfacts' },
      { name: 'Real Food', calories: 100, protein_g: 5, carbs_g: 10, fat_g: 2, source: 'openfoodfacts' },
    ])))
    const r = await searchFoods('beans')
    expect(r.results.map((x) => x.name)).toEqual(['Real Food'])
  })
})

describe('searchFoods: deduplication', () => {
  it('dedupes the same barcode returned by two different query variants', async () => {
    queryOFF.mockImplementation((q) => Promise.resolve(withItems('openfoodfacts', 'branded', q, [
      { name: 'Zucchini Bio', calories: 17, protein_g: 1, carbs_g: 3, fat_g: 0.3, source: 'openfoodfacts', barcode: '111' },
    ])))
    queryUsdaGeneric.mockImplementation((q) => Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('zucchini') // queries both "zucchini" and "courgette" (synonym) against OFF
    expect(r.results.filter((x) => x.barcode === '111')).toHaveLength(1)
  })
})

describe('searchFoods: distinguishing a real provider failure from a real empty result', () => {
  it('degraded:true when every attempted source genuinely failed', async () => {
    queryUsdaGeneric.mockImplementation((q) => Promise.resolve(failed('usda', 'generic', q)))
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(failed('usda', 'branded', q)))
    queryOFF.mockImplementation((q) => Promise.resolve(failed('openfoodfacts', 'branded', q)))
    const r = await searchFoods('zucchini')
    expect(r.degraded).toBe(true)
    expect(r.results).toEqual([])
  })

  it('degraded:false when sources succeed but genuinely find nothing (control)', async () => {
    const r = await searchFoods('xyzzyplughdoesnotexist')
    expect(r.degraded).toBe(false)
    expect(r.results).toEqual([])
  })

  it('degraded:false when USDA is simply unconfigured and OFF succeeds with zero results (control: unconfigured is not a failure)', async () => {
    const r = await searchFoods('zucchini')
    expect(r.degraded).toBe(false)
  })

  it('degraded:false when at least one source succeeds even if others fail (partial failure is not degraded)', async () => {
    queryOFF.mockImplementation((q) => Promise.resolve(failed('openfoodfacts', 'branded', q)))
    queryUsdaGeneric.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('zucchini')
    expect(r.degraded).toBe(false)
    expect(r.results[0].name).toBe('Zucchini, raw')
  })
})

describe('searchFoods: diagnostics shape', () => {
  it('reports per-source query/ok/count/latency for every call made', async () => {
    const r = await searchFoods('zucchini')
    expect(r.sources.length).toBeGreaterThan(0)
    for (const s of r.sources) {
      expect(s).toHaveProperty('source')
      expect(s).toHaveProperty('query')
      expect(s).toHaveProperty('ok')
      expect(s).toHaveProperty('count')
      expect(s).toHaveProperty('latencyMs')
    }
  })
  it('includes the normalized query and any variants/correction tried', async () => {
    const r = await searchFoods('Zuccini')
    expect(r.parsed.normalized).toBe('zuccini')
    expect(r.parsed.corrected).toBe('zucchini')
  })
})
