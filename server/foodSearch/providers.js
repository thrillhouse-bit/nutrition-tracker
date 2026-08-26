// Provider query wrappers for free-text food search. Every wrapper returns a
// UNIFORM diagnostic shape — { source, dataset, query, ok, count, items,
// latencyMs, error, skipped } — regardless of which provider or dataset it
// hit, so the orchestration layer (index.js) never has to special-case a
// provider's own response shape, and so a source's FAILURE (ok:false) is
// always distinguishable from a source that genuinely found nothing
// (ok:true, count:0) or a source that was never configured (ok:null,
// skipped:'not_configured').
//
// `items` are always already-normalized food objects (via lookup.js's
// normalizeUSDA/normalizeOFF) tagged with `datasetTier` ('generic' for
// USDA Foundation/SR Legacy/Survey — canonical whole foods — or 'branded'
// for USDA Branded and every Open Food Facts result, which is a
// barcoded-product database by construction).
import { usdaSearch, offTextSearch, normalizeUSDA, normalizeOFF } from '../lookup.js'

async function timed(source, dataset, query, fn) {
  const start = Date.now()
  try {
    const result = await fn()
    return { source, dataset, query, latencyMs: Date.now() - start, ...result }
  } catch (err) {
    return { source, dataset, query, latencyMs: Date.now() - start, ok: false, count: 0, items: [], error: String(err?.message || err) }
  }
}

// USDA Foundation + SR Legacy + Survey (FNDDS) — the canonical, non-branded
// whole-food datasets. Queried as its OWN pass (never merged into a single
// unrestricted USDA call) so a flood of Branded packaged products can never
// crowd "Zucchini, raw" out of a shared page-size budget before ranking
// even runs — see docs/food-search.md for why an unrestricted query risks
// exactly that.
export function queryUsdaGeneric(query, pageSize = 10) {
  return timed('usda', 'generic', query, async () => {
    const { configured, foods, error } = await usdaSearch(query, { dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'], pageSize })
    if (!configured) return { ok: null, count: 0, items: [], skipped: 'not_configured' }
    if (error) return { ok: false, count: 0, items: [], error }
    const items = foods.map((f) => ({ ...normalizeUSDA(f), datasetTier: 'generic' }))
    return { ok: true, count: items.length, items }
  })
}

export function queryUsdaBranded(query, pageSize = 8) {
  return timed('usda', 'branded', query, async () => {
    const { configured, foods, error } = await usdaSearch(query, { dataType: 'Branded', pageSize })
    if (!configured) return { ok: null, count: 0, items: [], skipped: 'not_configured' }
    if (error) return { ok: false, count: 0, items: [], error }
    const items = foods.map((f) => ({ ...normalizeUSDA(f), datasetTier: 'branded' }))
    return { ok: true, count: items.length, items }
  })
}

export function queryOFF(query, pageSize = 15) {
  return timed('openfoodfacts', 'branded', query, async () => {
    const { ok, status, data, error } = await offTextSearch(query, { pageSize })
    if (!ok) return { ok: false, count: 0, items: [], error: error || `HTTP ${status}` }
    const products = Array.isArray(data?.products) ? data.products : []
    const items = products
      .map((p) => ({ ...normalizeOFF(p, p.code || null), datasetTier: 'branded' }))
      .filter((f) => f.name && f.name !== 'Unknown product')
    return { ok: true, count: items.length, items }
  })
}
