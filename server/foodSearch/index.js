// Free-text food search orchestration: normalize the query, fan out to every
// provider/dataset pass for the primary query plus a bounded number of synonym
// variants (fully in parallel — see runAll), fall back to a typo correction
// ONLY when that whole first pass found nothing, merge, rank, dedupe, drop
// nutrition-less junk, and return rich diagnostics alongside the results.
//
// The diagnostics are not decoration. Measured 26 Aug 2026
// (docs/food-search-baseline.md): NINE of the ten required queries had at least
// one genuinely failed provider call and ALL TEN returned degraded:false,
// because `degraded` only meant "every attempted provider failed". A search
// that lost USDA's entire canonical whole-food pass and answered from branded
// rows alone was indistinguishable, in its response, from a healthy one. That
// is this codebase's signature failure — reporting success while doing much
// less than it claims — so this module now answers three separate questions:
//
//   degraded            everything we tried failed; there is no answer here
//   partial             some of what we tried failed; this answer is incomplete
//   canonicalCoverage   did any source of CANONICAL WHOLE FOODS actually
//                       answer? 'ok' | 'missing' | 'unconfigured'
//
// `canonicalCoverage` is the one that maps to what a user notices: when it is
// 'missing', every generic row is gone and the list is branded packets, which
// is exactly production symptoms 3 and 4.
import { parseQuery } from './normalize.js'
import { rankResults } from './rank.js'
import { queryUsdaFoundation, queryUsdaSurvey, queryUsdaBranded, queryOFF } from './providers.js'
import { comparablePer100, usdaConfigured } from '../lookup.js'
import { normalizeText } from './normalize.js'

// Beyond the primary query, try at most this many synonym variants — bounds
// per-search request count/latency. Bidirectional synonym GROUPS in
// normalize.js are short by design, but this caps it regardless.
const MAX_VARIANTS = 2
const MAX_RESULTS = 20

// Whole-search ceiling. Each provider call already has its own 6s transport
// timeout (server/lookup.js), but Promise.all waits for the SLOWEST of up to
// twelve of them, so one hanging provider used to hold back a response that was
// otherwise complete. Past this, whatever has arrived is returned and the
// stragglers are reported as `error: 'timeout'` — a partial answer that says so
// beats a complete answer nobody waited for.
const DEFAULT_DEADLINE_MS = 8000

// A real barcode is authoritative — the SAME product returned by two providers
// (or two query variants against the same provider) is the same row.
function exactKey(item) {
  if (item.barcode) return `barcode:${item.barcode}`
  return null
}

// ...and without one, collapse on identity rather than on identity-plus-source.
// The old key included `source`, so the same food from USDA and from OFF never
// deduped, and four pack sizes of the same product (different barcodes, same
// name and brand) all survived into a 20-row list — measured live:
// "Coca Cola — Coca-Cola" x4, "GREEK YOGURT — Chobani, Inc." x2.
function identityKey(item) {
  const name = normalizeText(item.name || '')
  const brand = normalizeText(item.brand || '')
  return name ? `id:${brand}:${name}` : null
}

// Drops a candidate with NO usable nutrition data at all — matches the same
// completeness bar server/lookup.js's barcode path already applies. Without
// this, a result like a real live "Borlotti Beans" row with every macro null
// would render as a fabricated "0 kcal" food (fmt() coerces null to 0 for
// display) rather than being excluded as not usefully "found".
function hasUsableNutrition(item) {
  return item.calories != null || item.protein_g != null || item.carbs_g != null || item.fat_g != null
}

// Races one provider call against the search deadline. A timed-out call is
// reported, never silently dropped — a missing source and a source that found
// nothing are different facts.
function withDeadline(promise, deadlineAt, descriptor) {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) return Promise.resolve({ ...descriptor, ok: false, count: 0, items: [], latencyMs: 0, error: 'timeout' })
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ...descriptor, ok: false, count: 0, items: [], latencyMs: remaining, error: 'timeout' })
    }, remaining)
    promise.then((r) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }, (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...descriptor, ok: false, count: 0, items: [], latencyMs: 0, error: String(err?.message || err) })
    })
  })
}

// The four passes every query goes through. USDA's generic datasets are TWO
// separate calls because `Survey (FNDDS)` is rejected by USDA's own edge with a
// bare HTTP 400 about half the time and used to share a call with Foundation and
// SR Legacy — see providers.js.
const PASSES = [
  { fn: queryUsdaFoundation, source: 'usda', dataset: 'foundation', tier: 'generic' },
  { fn: queryUsdaSurvey, source: 'usda', dataset: 'survey', tier: 'generic' },
  { fn: queryUsdaBranded, source: 'usda', dataset: 'branded', tier: 'branded' },
  { fn: queryOFF, source: 'openfoodfacts', dataset: 'branded', tier: 'branded' },
]

async function runAll(queries, sourceReports, candidates, deadlineAt) {
  const calls = queries.flatMap((q) =>
    PASSES.map((p) => withDeadline(p.fn(q), deadlineAt, { source: p.source, dataset: p.dataset, tier: p.tier, query: q })))
  const reports = await Promise.all(calls)
  for (const report of reports) {
    sourceReports.push(report)
    for (const item of report.items || []) {
      if (!hasUsableNutrition(item)) continue
      candidates.push(item)
    }
  }
}

// Dedupe AFTER ranking, not before: the surviving representative of a duplicate
// group should be the best-scoring one, not whichever provider happened to
// answer first. (Pre-ranking dedupe kept the first arrival, which is the same
// arrival-order dependence rank.js was fixed to remove.)
function dedupeRanked(ranked) {
  const seen = new Set()
  const out = []
  for (const item of ranked) {
    const keys = [exactKey(item), identityKey(item)].filter(Boolean)
    if (keys.some((k) => seen.has(k))) continue
    keys.forEach((k) => seen.add(k))
    out.push(item)
  }
  return out
}

export async function searchFoods(rawQuery, { deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
  const startedAt = Date.now()
  const deadlineAt = startedAt + deadlineMs
  const parsed = parseQuery(rawQuery)
  if (!parsed.normalized) {
    return {
      results: [], degraded: false, partial: false, usedCorrection: false,
      usdaConfigured: usdaConfigured(), canonicalCoverage: usdaConfigured() ? 'ok' : 'unconfigured',
      sources: [], parsed, query: '', totalLatencyMs: Date.now() - startedAt,
    }
  }

  const sourceReports = []
  const candidates = []

  // The corrected spelling is queried ALONGSIDE the typed one, not only when
  // the typed one found nothing. That gate looked conservative and was in fact
  // just unreachable: measured live 26 Aug 2026, "zuccini" returns four real
  // Open Food Facts products whose own names are misspelled the same way
  // ("Zuccini — Clever", "zuccini fritter — Woolworths"), so `candidates.length
  // === 0` was never true and the correction never ran — the exact query the
  // redesign was required to fix. The conservatism that matters lives in
  // correctTypo() itself: a query is corrected only when it is within a small
  // edit distance of EXACTLY ONE vocabulary term and is not already an exact
  // vocabulary hit. Beyond that, both spellings are searched and ranking
  // decides, which cannot silently replace a rare real food — that food's own
  // rows are still in the pool, scored against the query as typed.
  const usedCorrection = Boolean(parsed.corrected)
  const primaryQueries = [
    parsed.normalized,
    ...parsed.variants.slice(0, MAX_VARIANTS),
    ...(parsed.corrected ? [parsed.corrected] : []),
  ]
  await runAll(primaryQueries, sourceReports, candidates, deadlineAt)

  const rankingVariants = [parsed.normalized, ...parsed.variants, ...(parsed.corrected ? [parsed.corrected] : [])]
  const ranked = dedupeRanked(rankResults(candidates, rankingVariants)).slice(0, MAX_RESULTS)

  // per100 is a purely comparative, display-only figure — see comparablePer100's
  // own comment. search_method rides with each result so the confirm screen can
  // say how the food was FOUND instead of inferring it from whether a barcode
  // happens to be present, which is how a typed search came to read
  // "Scanned · USDA" in production.
  const results = ranked.map((food) => ({ ...food, per100: comparablePer100(food), search_method: 'text_search' }))

  // "Attempted" excludes calls skipped for being unconfigured — a missing
  // optional USDA key is a normal, expected state, never a fault.
  const attempted = sourceReports.filter((r) => r.ok !== null)
  const failed = attempted.filter((r) => r.ok === false)
  const degraded = attempted.length > 0 && failed.length === attempted.length
  const partial = failed.length > 0 && failed.length < attempted.length

  // Derived from what this search actually DID — at least one USDA call was
  // attempted rather than skipped — not from a second, independent read of the
  // environment. An observable effect, per the house rule: if the key were
  // present but every USDA pass were being skipped for some other reason, the
  // honest answer for the UI is still "USDA did not contribute".
  const usdaAttempted = sourceReports.some((r) => r.source === 'usda' && r.ok !== null)

  const genericPasses = sourceReports.filter((r) => r.tier === 'generic')
  const canonicalCoverage = genericPasses.some((r) => r.ok === true)
    ? 'ok'
    : genericPasses.every((r) => r.ok === null)
      ? 'unconfigured'
      : 'missing'

  return {
    results,
    degraded,
    partial,
    usedCorrection,
    usdaConfigured: usdaAttempted,
    canonicalCoverage,
    query: parsed.normalized,
    sources: sourceReports.map((r) => ({
      source: r.source, dataset: r.dataset, tier: r.tier, query: r.query, ok: r.ok,
      count: r.count, latencyMs: r.latencyMs, attempts: r.attempts ?? 1,
      endpoint: r.endpoint || null, error: r.error || null, skipped: r.skipped || null,
    })),
    parsed: { normalized: parsed.normalized, tokens: parsed.tokens, variants: parsed.variants, corrected: parsed.corrected },
    totalLatencyMs: Date.now() - startedAt,
  }
}
