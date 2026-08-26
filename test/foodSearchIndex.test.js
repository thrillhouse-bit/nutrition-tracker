import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/foodSearch/providers.js', () => ({
  queryUsdaFoundation: vi.fn(),
  queryUsdaSurvey: vi.fn(),
  queryUsdaBranded: vi.fn(),
  queryOFF: vi.fn(),
}))

const { queryUsdaFoundation, queryUsdaSurvey, queryUsdaBranded, queryOFF } = await import('../server/foodSearch/providers.js')
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
  queryUsdaFoundation.mockImplementation((q) => Promise.resolve(skipped('usda', 'foundation', q)))
  queryUsdaSurvey.mockImplementation((q) => Promise.resolve(skipped('usda', 'survey', q)))
  queryUsdaBranded.mockImplementation((q) => Promise.resolve(skipped('usda', 'branded', q)))
  queryOFF.mockImplementation((q) => Promise.resolve(empty('openfoodfacts', 'branded', q)))
})

describe('searchFoods: empty/degenerate input', () => {
  it('returns no results for a blank query without calling any provider (control)', async () => {
    const r = await searchFoods('   ')
    expect(r.results).toEqual([])
    expect(queryUsdaFoundation).not.toHaveBeenCalled()
  })
})

describe('searchFoods: the "zucchini" fix, end to end', () => {
  it('surfaces the generic USDA whole-food result ahead of OFF branded noise', async () => {
    queryUsdaFoundation.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
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
    queryUsdaFoundation.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('courgette')
    // The primary query "courgette" itself found nothing generic, but its
    // synonym variant "zucchini" was ALSO queried in the same pass.
    expect(queryUsdaFoundation).toHaveBeenCalledWith('zucchini')
    expect(r.results.some((x) => x.name === 'Zucchini, raw')).toBe(true)
  })

  it('a typo ("zuccini") is corrected ONLY after the raw query (and its variants) found nothing', async () => {
    queryUsdaFoundation.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('zuccini')
    expect(r.usedCorrection).toBe(true)
    expect(queryUsdaFoundation).toHaveBeenCalledWith('zucchini') // the corrected term was tried
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
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(empty('usda', 'generic', q)))
    const r = await searchFoods('zucchini') // queries both "zucchini" and "courgette" (synonym) against OFF
    expect(r.results.filter((x) => x.barcode === '111')).toHaveLength(1)
  })
})

describe('searchFoods: distinguishing a real provider failure from a real empty result', () => {
  it('degraded:true when every attempted source genuinely failed', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(failed('usda', 'generic', q)))
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
    queryUsdaFoundation.mockImplementation((q) => q === 'zucchini' ? Promise.resolve(withItems('usda', 'generic', q, [ZUCCHINI])) : Promise.resolve(empty('usda', 'generic', q)))
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

// ---------------------------------------------------------------------------
// Pipeline overhaul, 26 Aug 2026. In the captured live baseline, NINE of the
// ten required queries had at least one genuinely failed provider call and ALL
// TEN returned degraded:false. "chicken breast" ran with USDA-generic at HTTP
// 400 AND Open Food Facts at HTTP 503 — one surviving provider, branded-only —
// and its response was structurally indistinguishable from a healthy one.
// That is this codebase's signature failure: reporting success while doing
// much less than it claims (docs/food-search-baseline.md RC-9).
// ---------------------------------------------------------------------------
const withTier = (source, dataset, tier, query, items, ok = true, error = null) =>
  ({ source, dataset, tier, query, ok, count: items.length, items, latencyMs: 1, error })

describe('searchFoods: partial failure is disclosed, never rounded up to success', () => {
  it('sets partial:true when some attempted providers failed and some succeeded', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [], false, 'HTTP 400')))
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(withTier('usda', 'branded', 'branded', q, [{ ...ZUCCHINI, name: 'ZUCCHINI', brand: 'KMB, LLC', datasetTier: 'branded' }])))
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, [], false, 'HTTP 503')))

    const r = await searchFoods('zucchini')
    expect(r.degraded).toBe(false) // not everything failed...
    expect(r.partial).toBe(true) // ...but this is NOT a complete answer
    expect(r.results.length).toBeGreaterThan(0) // and we still return what we have
  })

  it('CONTROL: partial:false when every attempted provider succeeded', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [ZUCCHINI])))
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(withTier('usda', 'branded', 'branded', q, [])))
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, [])))
    const r = await searchFoods('zucchini')
    expect(r.partial).toBe(false)
  })

  it('CONTROL: an unconfigured (skipped) provider is not a partial failure', async () => {
    // A missing optional USDA key is a normal state, not a fault.
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, [{ name: 'Zucchini Bio', calories: 17, protein_g: 1, carbs_g: 3, fat_g: 0.3, source: 'openfoodfacts', datasetTier: 'branded' }])))
    const r = await searchFoods('zucchini')
    expect(r.partial).toBe(false)
    expect(r.usdaConfigured).toBe(false)
  })

  it('reports canonicalCoverage:"missing" when every generic-dataset pass failed, even though branded answered', async () => {
    // This is exactly production symptoms 3 and 4: the ONLY source of
    // canonical whole foods was gone and the response said nothing.
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [], false, 'HTTP 400')))
    queryUsdaSurvey.mockImplementation((q) => Promise.resolve(withTier('usda', 'survey', 'generic', q, [], false, 'HTTP 400')))
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(withTier('usda', 'branded', 'branded', q, [{ name: 'ZUCCHINI', brand: 'KMB, LLC', calories: 21, protein_g: 1.1, carbs_g: 4.2, fat_g: 0, source: 'usda', datasetTier: 'branded' }])))
    const r = await searchFoods('zucchini')
    expect(r.canonicalCoverage).toBe('missing')
  })

  it('CONTROL: canonicalCoverage:"ok" when a generic pass answered', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [ZUCCHINI])))
    queryUsdaSurvey.mockImplementation((q) => Promise.resolve(withTier('usda', 'survey', 'generic', q, [], false, 'HTTP 400')))
    const r = await searchFoods('zucchini')
    expect(r.canonicalCoverage).toBe('ok')
  })

  it('canonicalCoverage:"unconfigured" is distinct from "missing" — no key is not a failure', async () => {
    const r = await searchFoods('zucchini') // defaults: everything USDA skipped
    expect(r.canonicalCoverage).toBe('unconfigured')
    expect(r.partial).toBe(false)
  })

  it('tells the caller whether USDA is configured, so the UI stops guessing', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [ZUCCHINI])))
    const r = await searchFoods('zucchini')
    expect(r.usdaConfigured).toBe(true)
  })
})

describe('searchFoods: one slow provider cannot hold the whole answer', () => {
  it('returns what it has when a provider exceeds the search deadline, and marks it partial', async () => {
    vi.useFakeTimers()
    try {
      queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [ZUCCHINI])))
      queryOFF.mockImplementation(() => new Promise(() => {})) // never settles
      const p = searchFoods('zucchini', { deadlineMs: 1000 })
      await vi.advanceTimersByTimeAsync(1200)
      const r = await p
      expect(r.results[0].name).toBe('Zucchini, raw')
      expect(r.partial).toBe(true)
      expect(r.sources.some((s) => s.error === 'timeout')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('CONTROL: a fast search does not wait for the deadline and is not marked partial', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [ZUCCHINI])))
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(withTier('usda', 'branded', 'branded', q, [])))
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, [])))
    const started = Date.now()
    const r = await searchFoods('zucchini', { deadlineMs: 5000 })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(r.partial).toBe(false)
  })
})

describe('searchFoods: near-duplicate rows do not eat the result list', () => {
  it('collapses rows with the same name AND brand that differ only by barcode', async () => {
    // Measured live in one 20-row list: "Coca Cola — Coca-Cola" x4 and
    // "GREEK YOGURT — Chobani, Inc." x2 (docs/food-search-baseline.md RC-14).
    const cokes = ['42105220', '5449000000286', '5449000130389', '5449000028921'].map((barcode, i) => ({
      name: 'Coca Cola', brand: 'Coca-Cola', barcode, calories: 105 + i, protein_g: 0, carbs_g: 10.6, fat_g: 0,
      source: 'openfoodfacts', datasetTier: 'branded',
    }))
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, cokes)))
    const r = await searchFoods('coca cola')
    expect(r.results.filter((f) => /^coca cola$/i.test(f.name) && f.brand === 'Coca-Cola')).toHaveLength(1)
  })

  it('CONTROL: genuinely different products from the same brand both survive', async () => {
    const rows = [
      { name: 'Coca Cola Zero', brand: 'Coca-Cola', barcode: '1', calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'openfoodfacts', datasetTier: 'branded' },
      { name: 'Coca Cola', brand: 'Coca-Cola', barcode: '2', calories: 105, protein_g: 0, carbs_g: 10.6, fat_g: 0, source: 'openfoodfacts', datasetTier: 'branded' },
    ]
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, rows)))
    const r = await searchFoods('coca cola')
    expect(r.results).toHaveLength(2)
  })

  it('collapses the SAME food returned by two different providers', async () => {
    const shared = { name: 'Zucchini', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, datasetTier: 'branded' }
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(withTier('usda', 'branded', 'branded', q, [{ ...shared, brand: 'Acme', source: 'usda' }])))
    queryOFF.mockImplementation((q) => Promise.resolve(withTier('openfoodfacts', 'branded', 'branded', q, [{ ...shared, brand: 'Acme', source: 'openfoodfacts' }])))
    const r = await searchFoods('zucchini')
    expect(r.results).toHaveLength(1)
  })

  it('the surviving representative of a duplicate group is the best-RANKED one, not the first fetched', async () => {
    queryUsdaBranded.mockImplementation((q) => Promise.resolve(withTier('usda', 'branded', 'branded', q, [
      { name: 'Zucchini', brand: 'Acme', calories: 17, protein_g: null, carbs_g: null, fat_g: null, source: 'usda', datasetTier: 'branded' },
    ])))
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [
      { name: 'Zucchini', brand: 'Acme', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, source: 'usda', datasetTier: 'generic' },
    ])))
    const r = await searchFoods('zucchini')
    expect(r.results).toHaveLength(1)
    expect(r.results[0].datasetTier).toBe('generic') // the complete, non-branded one won
  })
})

describe('searchFoods: results carry their own provenance', () => {
  it('tags every result search_method:"text_search"', async () => {
    queryUsdaFoundation.mockImplementation((q) => Promise.resolve(withTier('usda', 'foundation', 'generic', q, [ZUCCHINI])))
    const r = await searchFoods('zucchini')
    expect(r.results[0].search_method).toBe('text_search')
  })
})
