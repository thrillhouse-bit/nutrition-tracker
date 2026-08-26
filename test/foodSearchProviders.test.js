import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../server/lookup.js', () => ({
  usdaSearch: vi.fn(),
  offTextSearch: vi.fn(),
  // The real reconciler, not a stub: it is what makes queryOFF endpoint-shape
  // agnostic, so mocking it away would test a pipeline the app never runs.
  offProducts: (data) => (Array.isArray(data?.products) ? data.products : Array.isArray(data?.hits) ? data.hits : [])
    .map((p) => (Array.isArray(p?.brands) ? { ...p, brands: p.brands.join(', ') } : p)),
  normalizeUSDA: (f) => ({ name: f.description, calories: f.cal ?? null, protein_g: null, carbs_g: null, fat_g: null, source: 'usda' }),
  normalizeOFF: (p) => ({ name: p.product_name || 'Unknown product', calories: p.cal ?? null, protein_g: null, carbs_g: null, fat_g: null, source: 'openfoodfacts', barcode: p.code || null }),
}))

const { usdaSearch, offTextSearch } = await import('../server/lookup.js')
const providers = await import('../server/foodSearch/providers.js')
const { queryUsdaFoundation, queryUsdaSurvey, queryUsdaBranded, queryOFF } = providers

// Call counts are load-bearing here (retry/fallback behaviour), so the mocks
// must not carry state between tests.
beforeEach(() => { vi.clearAllMocks() })

// The generic USDA pass is now TWO calls; these shape assertions apply to
// both, so they run against each in turn rather than against a single
// combined-dataType call that measured a ~50% failure rate.
describe.each([['queryUsdaFoundation'], ['queryUsdaSurvey']])('%s (generic pass)', (name) => {
  const queryUsdaGeneric = (...args) => providers[name](...args)
  it('tags every item datasetTier:"generic" and reports ok:true with a count', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [{ description: 'Zucchini, raw', cal: 17 }] })
    const r = await queryUsdaGeneric('zucchini')
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    expect(r.items[0].datasetTier).toBe('generic')
    expect(r.source).toBe('usda')
    expect(r.tier).toBe('generic')
    expect(typeof r.latencyMs).toBe('number')
  })
  it('queries a non-Branded whole-food dataType only', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [] })
    await queryUsdaGeneric('zucchini')
    const [, opts] = usdaSearch.mock.calls.at(-1)
    const dt = Array.isArray(opts.dataType) ? opts.dataType.join(',') : String(opts.dataType)
    expect(dt).not.toMatch(/Branded/)
    expect(dt).toMatch(/Foundation|SR Legacy|Survey/)
  })
  it('reports ok:null with skipped:"not_configured" when no FDC key is set (never a failure)', async () => {
    usdaSearch.mockResolvedValue({ configured: false, foods: [] })
    const r = await queryUsdaGeneric('zucchini')
    expect(r.ok).toBeNull()
    expect(r.skipped).toBe('not_configured')
    expect(r.count).toBe(0)
  })
  it('reports a genuine provider error as ok:false, distinct from zero configured/zero results, and FORWARDS the real error message', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [], error: 'HTTP 500' })
    const r = await queryUsdaGeneric('zucchini')
    expect(r.ok).toBe(false)
    // Real bug (26 Aug 2026): every failure collapsed to error:null regardless
    // of what usdaSearch actually reported, making a rate-limit indistinguishable
    // from a timeout from a genuine outage in the diagnostics.
    expect(r.error).toBe('HTTP 500')
  })
  it('reports ok:false (not an unhandled rejection) when the underlying call throws', async () => {
    usdaSearch.mockRejectedValue(new Error('network exploded'))
    const r = await queryUsdaGeneric('zucchini')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/network exploded/)
  })
})

describe('queryUsdaBranded', () => {
  it('tags items datasetTier:"branded" and queries dataType Branded', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [{ description: 'Brand X Zucchini Chips', cal: 500 }] })
    const r = await queryUsdaBranded('zucchini')
    expect(r.items[0].datasetTier).toBe('branded')
    expect(usdaSearch).toHaveBeenCalledWith('zucchini', expect.objectContaining({ dataType: 'Branded' }))
  })
})

describe('queryOFF', () => {
  it('filters out a product with no usable name ("Unknown product")', async () => {
    offTextSearch.mockResolvedValue({ ok: true, data: { products: [{ product_name: '', code: '123' }, { product_name: 'Zucchini Bio', code: '456' }] } })
    const r = await queryOFF('zucchini')
    expect(r.items).toHaveLength(1)
    expect(r.items[0].name).toBe('Zucchini Bio')
    expect(r.items[0].datasetTier).toBe('branded')
  })
  it('reports ok:false when the OFF request itself fails', async () => {
    offTextSearch.mockResolvedValue({ ok: false, data: null })
    const r = await queryOFF('zucchini')
    expect(r.ok).toBe(false)
    expect(r.count).toBe(0)
  })
  it('forwards the real error message when OFF reports one, distinct from a plain HTTP status', async () => {
    offTextSearch.mockResolvedValue({ ok: false, status: 0, data: null, error: 'AbortError: timeout' })
    const r = await queryOFF('zucchini')
    expect(r.error).toBe('AbortError: timeout')
  })
  it('synthesizes an HTTP-status error when OFF fails with no error message (e.g. a plain 503)', async () => {
    offTextSearch.mockResolvedValue({ ok: false, status: 503, data: null })
    const r = await queryOFF('zucchini')
    expect(r.error).toBe('HTTP 503')
  })
  it('handles a malformed (non-array products) response without throwing (control)', async () => {
    offTextSearch.mockResolvedValue({ ok: true, data: {} })
    const r = await queryOFF('zucchini')
    expect(r.ok).toBe(true)
    expect(r.items).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Pipeline overhaul, 26 Aug 2026. Measured against the live USDA API, n=20
// identical requests per dataType (docs/food-search-baseline.md RC-8):
//
//   Foundation,SR Legacy,Survey (FNDDS)  ->  10/20 HTTP 400   (the shipped call)
//   Survey (FNDDS)          alone        ->  11/20 HTTP 400
//   Foundation,SR Legacy                 ->   0/20
//   Branded                              ->   0/20
//
// The 400 is a bare nginx rejection bound to the `Survey (FNDDS)` VALUE — four
// different URL encodings of it all fail at the same rate — not to request
// formation and not to general upstream flakiness. Because all three datasets
// shared one HTTP call, Survey's ~50% failure took Foundation and SR Legacy
// down with it, so half of all searches lost the entire canonical whole-food
// candidate pool. Survey cannot simply be dropped: it is the only dataset with
// a usable `Oatmeal, NFS`, `Avocado, raw` or bare `Peanut butter`.
// ---------------------------------------------------------------------------


describe('the generic USDA pass is split so one dataset\'s failure cannot take the others down', () => {
  it('queryUsdaFoundation asks for Foundation + SR Legacy and NOTHING else', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [] })
    await queryUsdaFoundation('zucchini')
    const [, opts] = usdaSearch.mock.calls.at(-1)
    const dt = Array.isArray(opts.dataType) ? opts.dataType.join(',') : String(opts.dataType)
    expect(dt).toMatch(/Foundation/)
    expect(dt).toMatch(/SR Legacy/)
    expect(dt).not.toMatch(/Survey/) // the ~50%-failing value must not ride along
    expect(dt).not.toMatch(/Branded/)
  })

  it('queryUsdaSurvey asks for Survey (FNDDS) on its own', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [] })
    await queryUsdaSurvey('oatmeal')
    const [, opts] = usdaSearch.mock.calls.at(-1)
    const dt = Array.isArray(opts.dataType) ? opts.dataType.join(',') : String(opts.dataType)
    expect(dt).toBe('Survey (FNDDS)')
  })

  it('both generic passes tag their items generic and report tier:"generic"', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [{ description: 'Oatmeal, NFS', cal: 76 }] })
    for (const fn of [queryUsdaFoundation, queryUsdaSurvey]) {
      const r = await fn('oatmeal')
      expect(r.items[0].datasetTier).toBe('generic')
      expect(r.tier).toBe('generic')
    }
  })

  it('a failing Survey call leaves the Foundation call\'s results untouched (the whole point of the split)', async () => {
    usdaSearch.mockImplementation((q, { dataType }) => {
      const dt = Array.isArray(dataType) ? dataType.join(',') : String(dataType)
      if (dt.includes('Survey')) return Promise.resolve({ configured: true, foods: [], error: 'HTTP 400' })
      return Promise.resolve({ configured: true, foods: [{ description: 'Bananas, raw', cal: 89 }] })
    })
    const [survey, foundation] = await Promise.all([queryUsdaSurvey('banana'), queryUsdaFoundation('banana')])
    expect(survey.ok).toBe(false)
    expect(foundation.ok).toBe(true)
    expect(foundation.items).toHaveLength(1)
  })
})

describe('a transient provider failure is retried, not accepted', () => {
  it('retries the Survey pass and succeeds on a later attempt', async () => {
    let attempt = 0
    usdaSearch.mockImplementation(() => {
      attempt++
      return attempt < 3
        ? Promise.resolve({ configured: true, foods: [], error: 'HTTP 400' })
        : Promise.resolve({ configured: true, foods: [{ description: 'Oatmeal, NFS', cal: 76 }] })
    })
    const r = await queryUsdaSurvey('oatmeal')
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    expect(r.attempts).toBeGreaterThan(1)
  })

  it('gives up honestly rather than retrying forever, and reports the LAST real error', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [], error: 'HTTP 400' })
    const r = await queryUsdaSurvey('oatmeal')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/400/)
    expect(r.attempts).toBeLessThanOrEqual(4)
  })

  it('CONTROL: a call that succeeds first time is not retried', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [{ description: 'Bananas, raw', cal: 89 }] })
    const r = await queryUsdaFoundation('banana')
    expect(r.attempts).toBe(1)
    expect(usdaSearch).toHaveBeenCalledTimes(1)
  })

  it('an UNCONFIGURED key is not a transient failure and is never retried', async () => {
    usdaSearch.mockResolvedValue({ configured: false, foods: [] })
    const r = await queryUsdaSurvey('oatmeal')
    expect(r.ok).toBeNull()
    expect(r.skipped).toBe('not_configured')
    expect(usdaSearch).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Open Food Facts. Measured over the same 20 queries, 700ms apart
// (docs/food-search-baseline.md RC-10):
//   world.openfoodfacts.org/cgi/search.pl   ->  9/20 HTTP 503, p50 549ms
//   search.openfoodfacts.org/search         ->  0/20,          p50 166ms
// The 503s are not paced away (a single call after 20s idle still 503'd) and a
// burst of three — which one user search issues, primary + 2 synonym variants
// — measured 3/3 503.
// ---------------------------------------------------------------------------
describe('queryOFF: the reliable endpoint first, the legacy one as a fallback', () => {
  it('calls the search-a-licious endpoint first', async () => {
    offTextSearch.mockResolvedValue({ ok: true, status: 200, data: { hits: [{ code: '1', product_name: 'Zucchini', cal: 17 }] } })
    await queryOFF('zucchini')
    const [, opts] = offTextSearch.mock.calls[0]
    expect(opts.endpoint).toBe('search')
  })

  it('falls back to the legacy cgi endpoint when the primary one fails, and says which it used', async () => {
    offTextSearch.mockImplementation((q, { endpoint }) =>
      endpoint === 'search'
        ? Promise.resolve({ ok: false, status: 503, data: null })
        : Promise.resolve({ ok: true, status: 200, data: { products: [{ code: '2', product_name: 'Zucchini Bio', cal: 17 }] } }))
    const r = await queryOFF('zucchini')
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    expect(r.endpoint).toBe('cgi')
  })

  it('reports a genuine failure only when BOTH endpoints fail', async () => {
    offTextSearch.mockResolvedValue({ ok: false, status: 503, data: null })
    const r = await queryOFF('zucchini')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/503/)
  })

  it('CONTROL: the fallback is not used when the primary endpoint answers', async () => {
    offTextSearch.mockResolvedValue({ ok: true, status: 200, data: { hits: [{ code: '1', product_name: 'Zucchini', cal: 17 }] } })
    const r = await queryOFF('zucchini')
    expect(r.endpoint).toBe('search')
    expect(offTextSearch).toHaveBeenCalledTimes(1)
  })

  it('reads the search-a-licious `hits` shape as well as the legacy `products` shape', async () => {
    offTextSearch.mockResolvedValue({ ok: true, status: 200, data: { hits: [{ code: '3', product_name: 'Banana', cal: 89 }] } })
    const r = await queryOFF('banana')
    expect(r.count).toBe(1)
    expect(r.items[0].name).toBe('Banana')
  })
})
