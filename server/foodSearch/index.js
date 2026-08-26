// Free-text food search orchestration: normalize the query, fan out to every
// provider/dataset pass for the primary query plus a bounded number of
// synonym variants (fully in parallel — see runAll), fall back to a typo
// correction ONLY when that whole first pass found nothing, merge + dedupe +
// drop nutrition-less junk, then rank. Returns rich diagnostics (per-source
// ok/count/latency/error) alongside the results so a caller can log them and
// tell a genuine provider failure apart from a genuine empty result — see
// docs/food-search.md for the full design and the "zucchini" root-cause
// evidence this replaces.
import { parseQuery } from './normalize.js'
import { rankResults } from './rank.js'
import { queryUsdaGeneric, queryUsdaBranded, queryOFF } from './providers.js'

// Beyond the primary query, try at most this many synonym variants — bounds
// per-search request count/latency. Bidirectional synonym GROUPS in
// normalize.js are short by design, but this caps it regardless.
const MAX_VARIANTS = 2
const MAX_RESULTS = 20

function dedupeKey(item) {
  // A real barcode is authoritative — the SAME product returned by two
  // providers (or two query variants against the same provider) is the same
  // row. Without one, fall back to name+source, since two providers rarely
  // agree on an internal id for the same generic food.
  if (item.barcode) return `barcode:${item.barcode}`
  return `name:${item.source}:${(item.name || '').toLowerCase().trim()}`
}

// Drops a candidate with NO usable nutrition data at all — matches the same
// completeness bar server/lookup.js's barcode path already applies. Without
// this, a result like a real live "Borlotti Beans" row with every macro
// null would render as a fabricated "0 kcal" food (fmt() coerces null to 0
// for display) rather than being excluded as not usefully "found".
function hasUsableNutrition(item) {
  return item.calories != null || item.protein_g != null || item.carbs_g != null || item.fat_g != null
}

async function runAll(queries, sourceReports, byKey) {
  const calls = queries.flatMap((q) => [queryUsdaGeneric(q), queryUsdaBranded(q), queryOFF(q)])
  const reports = await Promise.all(calls)
  for (const report of reports) {
    sourceReports.push(report)
    for (const item of report.items) {
      if (!hasUsableNutrition(item)) continue
      const key = dedupeKey(item)
      if (!byKey.has(key)) byKey.set(key, item)
    }
  }
}

export async function searchFoods(rawQuery) {
  const startedAt = Date.now()
  const parsed = parseQuery(rawQuery)
  if (!parsed.normalized) {
    return { results: [], degraded: false, sources: [], parsed, totalLatencyMs: Date.now() - startedAt }
  }

  const sourceReports = []
  const byKey = new Map()

  const primaryQueries = [parsed.normalized, ...parsed.variants.slice(0, MAX_VARIANTS)]
  await runAll(primaryQueries, sourceReports, byKey)

  // Typo correction is a LAST resort, tried only when the primary query (and
  // its synonyms) found genuinely nothing — never silently replacing a rare
  // real food that happens to resemble a common one's spelling.
  let usedCorrection = false
  if (byKey.size === 0 && parsed.corrected) {
    usedCorrection = true
    await runAll([parsed.corrected], sourceReports, byKey)
  }

  const merged = [...byKey.values()]
  const rankingVariants = [parsed.normalized, ...parsed.variants, ...(parsed.corrected ? [parsed.corrected] : [])]
  const results = rankResults(merged, rankingVariants).slice(0, MAX_RESULTS)

  // "Degraded" = every provider call that was actually ATTEMPTED (i.e. not
  // skipped for being unconfigured) came back a genuine failure. An
  // unconfigured USDA key is a normal, expected state — never "degraded" —
  // and a set of calls that all succeeded but returned zero items is a
  // genuine empty result, not a failure.
  const attempted = sourceReports.filter((r) => r.ok !== null)
  const degraded = attempted.length > 0 && attempted.every((r) => r.ok === false)

  return {
    results,
    degraded,
    usedCorrection,
    sources: sourceReports.map((r) => ({
      source: r.source, dataset: r.dataset, query: r.query, ok: r.ok,
      count: r.count, latencyMs: r.latencyMs, error: r.error || null, skipped: r.skipped || null,
    })),
    parsed: { normalized: parsed.normalized, tokens: parsed.tokens, variants: parsed.variants, corrected: parsed.corrected },
    totalLatencyMs: Date.now() - startedAt,
  }
}
