// Provider query wrappers for free-text food search. Every wrapper returns a
// UNIFORM diagnostic shape — { source, dataset, tier, query, ok, count, items,
// latencyMs, attempts, error, skipped } — regardless of which provider or
// dataset it hit, so the orchestration layer (index.js) never has to
// special-case a provider's own response shape, and so a source's FAILURE
// (ok:false) is always distinguishable from a source that genuinely found
// nothing (ok:true, count:0) or one that was never configured (ok:null,
// skipped:'not_configured').
//
// `items` are always already-normalized food objects (via lookup.js's
// normalizeUSDA/normalizeOFF) tagged with `datasetTier` ('generic' for USDA
// Foundation/SR Legacy/Survey — canonical whole foods — or 'branded' for USDA
// Branded and every Open Food Facts result, which is a barcoded-product
// database by construction). `tier` on the REPORT says the same thing about
// the pass as a whole, so index.js can answer "did any canonical-food source
// actually answer?" without inspecting items.
import { usdaSearch, offTextSearch, offProducts, normalizeUSDA, normalizeOFF } from '../lookup.js'

// Bounded retry for a transient upstream failure. This exists for one measured
// reason: USDA's `Survey (FNDDS)` dataType is rejected with a bare nginx
// `400 Bad Request` about half the time (11/20 identical requests, 26 Aug 2026
// — docs/food-search-baseline.md RC-8). Four different URL encodings of that
// value fail at the same rate and every request WITHOUT it succeeds 0/20
// failures, so this is an upstream quirk bound to one dataType value, not
// something this repo can form its way out of.
//
// Retries are only for a genuine failure (ok:false). An unconfigured key
// (ok:null) is a normal state and is never retried — retrying it would turn a
// free no-op into three.
const RETRY_BACKOFF_MS = 120

async function timed(source, dataset, tier, query, fn, { attempts = 1 } = {}) {
  const start = Date.now()
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await fn()
      last = { ...result, attempts: attempt }
      if (result.ok !== false) break // success, or a deliberate skip — done
    } catch (err) {
      last = { ok: false, count: 0, items: [], error: String(err?.message || err), attempts: attempt }
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt))
  }
  return { source, dataset, tier, query, latencyMs: Date.now() - start, ...last }
}

// USDA Foundation + SR Legacy — the canonical, non-branded whole-food datasets
// with the most complete nutrient panels. Queried WITHOUT `Survey (FNDDS)`: the
// three used to share one HTTP call, so Survey's ~50% failure rate took
// Foundation and SR Legacy down with it, and half of all searches lost the
// entire canonical candidate pool before ranking even ran. That is the direct
// cause of production symptoms 3 and 4.
export function queryUsdaFoundation(query, pageSize = 10, { signal, timeoutMs } = {}) {
  return timed('usda', 'foundation', 'generic', query, async () => {
    const { configured, foods, error } = await usdaSearch(query, { dataType: ['Foundation', 'SR Legacy'], pageSize, signal, timeoutMs })
    if (!configured) return { ok: null, count: 0, items: [], skipped: 'not_configured' }
    if (error) return { ok: false, count: 0, items: [], error }
    const items = foods.map((f) => ({ ...normalizeUSDA(f), datasetTier: 'generic' }))
    return { ok: true, count: items.length, items }
  }, { attempts: 2 })
}

// USDA Survey (FNDDS) — kept, and given its own call plus extra retries,
// because dropping it is not free: it is the only dataset carrying a usable
// canonical `Oatmeal, NFS`, `Avocado, raw`, `Fish, salmon, NFS` or bare
// `Peanut butter`. Foundation/SR Legacy answer "oatmeal" with oatmeal BREAD
// and oatmeal COOKIES. Three attempts against a measured ~55% per-attempt
// failure leaves roughly a 1-in-6 residual, which index.js then reports
// honestly as reduced canonical coverage rather than hiding.
export function queryUsdaSurvey(query, pageSize = 10, { signal, timeoutMs } = {}) {
  return timed('usda', 'survey', 'generic', query, async () => {
    const { configured, foods, error } = await usdaSearch(query, { dataType: 'Survey (FNDDS)', pageSize, signal, timeoutMs })
    if (!configured) return { ok: null, count: 0, items: [], skipped: 'not_configured' }
    if (error) return { ok: false, count: 0, items: [], error }
    const items = foods.map((f) => ({ ...normalizeUSDA(f), datasetTier: 'generic' }))
    return { ok: true, count: items.length, items }
  }, { attempts: 3 })
}

export function queryUsdaBranded(query, pageSize = 8, { signal, timeoutMs } = {}) {
  return timed('usda', 'branded', 'branded', query, async () => {
    const { configured, foods, error } = await usdaSearch(query, { dataType: 'Branded', pageSize, signal, timeoutMs })
    if (!configured) return { ok: null, count: 0, items: [], skipped: 'not_configured' }
    if (error) return { ok: false, count: 0, items: [], error }
    const items = foods.map((f) => ({ ...normalizeUSDA(f), datasetTier: 'branded' }))
    return { ok: true, count: items.length, items }
  }, { attempts: 2 })
}

// Open Food Facts. Tries the reliable search-a-licious endpoint first and only
// falls back to the legacy cgi one when it fails — measured 0/20 vs 9/20
// failures over the same queries. `endpoint` is reported so a diagnostic can
// tell "the good endpoint answered" from "we were on the fallback", which is
// the difference between a healthy day and one worth investigating.
export function queryOFF(query, pageSize = 15, { signal, timeoutMs } = {}) {
  return timed('openfoodfacts', 'branded', 'branded', query, async () => {
    let last = null
    for (const endpoint of ['search', 'cgi']) {
      const { ok, status, data, error } = await offTextSearch(query, { pageSize, endpoint, signal, timeoutMs })
      if (!ok) { last = { ok: false, count: 0, items: [], error: error || `HTTP ${status}`, endpoint }; continue }
      // offProducts, not `data.products`: the two endpoints disagree on the
      // envelope (`hits` vs `products`) and this layer must not care which one
      // answered.
      const items = offProducts(data)
        .map((p) => ({ ...normalizeOFF(p, p.code || null), datasetTier: 'branded' }))
        .filter((f) => f.name && f.name !== 'Unknown product')
      return { ok: true, count: items.length, items, endpoint }
    }
    return last
  })
}
