import { describe, it, expect, vi } from 'vitest'

vi.mock('../server/lookup.js', () => ({
  usdaSearch: vi.fn(),
  offTextSearch: vi.fn(),
  normalizeUSDA: (f) => ({ name: f.description, calories: f.cal ?? null, protein_g: null, carbs_g: null, fat_g: null, source: 'usda' }),
  normalizeOFF: (p) => ({ name: p.product_name || 'Unknown product', calories: p.cal ?? null, protein_g: null, carbs_g: null, fat_g: null, source: 'openfoodfacts', barcode: p.code || null }),
}))

const { usdaSearch, offTextSearch } = await import('../server/lookup.js')
const { queryUsdaGeneric, queryUsdaBranded, queryOFF } = await import('../server/foodSearch/providers.js')

describe('queryUsdaGeneric', () => {
  it('tags every item datasetTier:"generic" and reports ok:true with a count', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [{ description: 'Zucchini, raw', cal: 17 }] })
    const r = await queryUsdaGeneric('zucchini')
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    expect(r.items[0].datasetTier).toBe('generic')
    expect(r.source).toBe('usda')
    expect(r.dataset).toBe('generic')
    expect(typeof r.latencyMs).toBe('number')
  })
  it('queries the Foundation/SR Legacy/Survey dataType, never Branded', async () => {
    usdaSearch.mockResolvedValue({ configured: true, foods: [] })
    await queryUsdaGeneric('zucchini')
    expect(usdaSearch).toHaveBeenCalledWith('zucchini', expect.objectContaining({ dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'] }))
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
