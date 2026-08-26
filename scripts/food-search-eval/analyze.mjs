// Turns scripts/food-search-eval/results.jsonl into the Phase 5 metric set and
// writes a MACHINE-READABLE per-item failure list (failures.json) — aggregate
// percentages alone hide exactly the items a reviewer needs to look at.
//
//   node scripts/food-search-eval/analyze.mjs
//
// Generic and branded items are reported SEPARATELY throughout. Blending them
// is what let the prior audit's single headline number look healthy while every
// generic food in the golden set was wrong at rank 1.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS = path.join(__dirname, 'results.jsonl')
const FAILURES = path.join(__dirname, 'failures.json')
const SUMMARY = path.join(__dirname, 'summary.json')

// Deduped by key on read: results.jsonl is append-only and checkpointed, so a
// resumed run — or two runs accidentally overlapping, which happened once
// during this work — can write the same (item, probe) pair twice. Counting it
// twice would silently weight those items double.
const seenKeys = new Set()
const rows = fs.readFileSync(RESULTS, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  .filter((r) => (seenKeys.has(r.key) ? false : (seenKeys.add(r.key), true)))

const pct = (n, d) => (d ? (100 * n) / d : 0)
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null)

function metrics(subset) {
  const n = subset.length
  if (!n) return null
  const ranks = subset.map((r) => r.rank)
  const lat = subset.map((r) => r.latencyMs).sort((a, b) => a - b)
  return {
    probes: n,
    top1Pct: +pct(ranks.filter((r) => r === 1).length, n).toFixed(1),
    top3Pct: +pct(ranks.filter((r) => r !== null && r <= 3).length, n).toFixed(1),
    top5Pct: +pct(ranks.filter((r) => r !== null && r <= 5).length, n).toFixed(1),
    mrr: +(ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / n).toFixed(4),
    zeroResultPct: +pct(subset.filter((r) => r.resultCount === 0).length, n).toFixed(1),
    partialPct: +pct(subset.filter((r) => r.partial).length, n).toFixed(1),
    canonicalMissingPct: +pct(subset.filter((r) => r.canonicalCoverage === 'missing').length, n).toFixed(1),
    latencyP50Ms: quantile(lat, 0.5),
    latencyP95Ms: quantile(lat, 0.95),
  }
}

const byKind = (kind) => rows.filter((r) => r.kind === kind)
const full = rows.filter((r) => r.isFull)
const atPrefix = (len) => rows.filter((r) => !r.isFull && r.prefixLength === len)

// Time to first useful result: walking a person's own typing, the probe at
// which the target first lands in the top 5 — and how long THAT search took.
// The 350 ms input debounce sits on top of every figure here.
const items = new Map()
for (const r of rows) {
  if (!items.has(r.id)) items.set(r.id, [])
  items.get(r.id).push(r)
}
const firstUseful = []
const neverUseful = []
for (const [id, probes] of items) {
  const ordered = [...probes].sort((a, b) => (a.isFull ? 1 : 0) - (b.isFull ? 1 : 0) || a.prefixLength - b.prefixLength)
  const hit = ordered.find((p) => p.rank !== null && p.rank <= 5)
  if (hit) firstUseful.push({ id, kind: hit.kind, prefixLength: hit.prefixLength, isFull: hit.isFull, latencyMs: hit.latencyMs })
  else neverUseful.push({ id, kind: ordered[0]?.kind ?? null, label: ordered[0]?.label ?? null, fullQuery: ordered[0]?.fullQuery ?? null })
}
function ttfur(kind) {
  const subset = kind ? firstUseful.filter((f) => f.kind === kind) : firstUseful
  const lat = subset.map((f) => f.latencyMs).sort((a, b) => a - b)
  const chars = subset.map((f) => f.prefixLength).sort((a, b) => a - b)
  return {
    itemsReachingTop5: subset.length,
    searchLatencyP50Ms: quantile(lat, 0.5),
    searchLatencyP95Ms: quantile(lat, 0.95),
    charactersTypedP50: quantile(chars, 0.5),
    charactersTypedP95: quantile(chars, 0.95),
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalProbes: rows.length,
  distinctItems: items.size,
  note: 'Every latency figure is the SEARCH round trip. A user additionally waits the 350 ms input debounce before the request starts.',
  completeQuery: {
    all: metrics(full),
    generic: metrics(full.filter((r) => r.kind === 'generic')),
    branded: metrics(full.filter((r) => r.kind === 'branded')),
  },
  byPrefixLength: Object.fromEntries([2, 3, 4, 5].map((len) => [len, {
    all: metrics(atPrefix(len)),
    generic: metrics(atPrefix(len).filter((r) => r.kind === 'generic')),
    branded: metrics(atPrefix(len).filter((r) => r.kind === 'branded')),
  }])),
  timeToFirstUsefulResult: { all: ttfur(null), generic: ttfur('generic'), branded: ttfur('branded') },
  itemsNeverReachingTop5: neverUseful.length,
  corpusSplit: { generic: new Set(byKind('generic').map((r) => r.id)).size, branded: new Set(byKind('branded').map((r) => r.id)).size },
}

// --- per-item failures ------------------------------------------------------
// A failure is the COMPLETE query not putting the target at rank 1 — the
// standard the prior audit's "somewhere in the top 5 at some prefix" metric
// could not express. Each entry carries what actually came back, so a reviewer
// can judge whether it is a ranking fault, a provider gap, or an item whose
// target simply is not in either database.
const failures = full
  .filter((r) => r.rank !== 1)
  .map((r) => ({
    id: r.id, kind: r.kind, store: r.store, label: r.label, query: r.fullQuery,
    rank: r.rank,
    verdict: r.rank === null
      ? (r.resultCount === 0 ? 'no results at all' : 'target absent from the 20 returned results')
      : `target at rank ${r.rank}, not 1`,
    resultCount: r.resultCount,
    partial: r.partial,
    canonicalCoverage: r.canonicalCoverage,
    failedSources: r.failedSources,
    latencyMs: r.latencyMs,
    top5: r.top5,
  }))
  .sort((a, b) => (a.rank === null ? 0 : 1) - (b.rank === null ? 0 : 1) || String(a.id).localeCompare(String(b.id)))

fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2))
fs.writeFileSync(FAILURES, JSON.stringify({ generatedAt: summary.generatedAt, completeQueryProbes: full.length, failures: failures.length, items: failures }, null, 2))

const line = (label, m) => m && console.log(
  `  ${label.padEnd(9)} n=${String(m.probes).padStart(4)}  top1 ${String(m.top1Pct).padStart(5)}%  top3 ${String(m.top3Pct).padStart(5)}%  top5 ${String(m.top5Pct).padStart(5)}%  MRR ${m.mrr.toFixed(3)}  zero ${String(m.zeroResultPct).padStart(4)}%  p50 ${m.latencyP50Ms}ms  p95 ${m.latencyP95Ms}ms`)

console.log(`\n${rows.length} probes over ${items.size} items (${summary.corpusSplit.generic} generic / ${summary.corpusSplit.branded} branded)\n`)
console.log('COMPLETE QUERY')
line('all', summary.completeQuery.all)
line('generic', summary.completeQuery.generic)
line('branded', summary.completeQuery.branded)
for (const len of [2, 3, 4, 5]) {
  console.log(`\nPREFIX ${len} CHARS`)
  line('all', summary.byPrefixLength[len].all)
  line('generic', summary.byPrefixLength[len].generic)
  line('branded', summary.byPrefixLength[len].branded)
}
console.log('\nTIME TO FIRST USEFUL RESULT (target in top 5; + 350ms debounce for the user)')
for (const [k, v] of Object.entries(summary.timeToFirstUsefulResult)) {
  console.log(`  ${k.padEnd(9)} items ${String(v.itemsReachingTop5).padStart(3)}  chars p50 ${v.charactersTypedP50} p95 ${v.charactersTypedP95}  search p50 ${v.searchLatencyP50Ms}ms p95 ${v.searchLatencyP95Ms}ms`)
}
console.log(`\nitems never reaching top 5 at any probe: ${neverUseful.length}`)
console.log(`complete-query failures (target not at rank 1): ${failures.length} / ${full.length}`)
console.log(`\nwrote ${SUMMARY}\nwrote ${FAILURES}`)
