// Food-search evaluation runner. Calls the REAL server-side orchestration
// (server/foodSearch/index.js -> searchFoods) against the REAL USDA FoodData
// Central + Open Food Facts APIs. No mocks — same code path GET /api/search
// uses.
//
// This REPLACES the prior audit's "character 20" keystroke-efficiency headline
// (scripts/keystroke-audit/), which could not see any of the six reported
// production behaviours: it only asked whether the target appeared in the top
// FIVE at some prefix length, so "Avocado dressing" (427 kcal) above
// "Avocado, raw" scored as a success, and it treated provider failures as noise
// to retry away rather than as the defect they were. See
// docs/food-search-baseline.md §4.
//
// It reuses that audit's 200-item master list verbatim
// (scripts/keystroke-audit/items.mjs) so the two are comparable where a
// comparison is meaningful, and measures instead:
//
//   * rank of the target: top-1 / top-3 / top-5 rate, and mean reciprocal rank
//   * zero-result rate
//   * p50 / p95 search latency
//   * GENERIC and BRANDED items reported separately, never blended
//   * every item at prefixes of 2, 3, 4, 5 characters AND the complete query
//
// Stale-response commits are a CLIENT property and cannot be measured from
// here; they are measured against the running app by
// scripts/food-search-eval/stale-probe.mjs, and the target is exactly zero.
//
// Checkpointed to results.jsonl: a completed (item, prefix) pair is skipped on
// a re-run, so a killed process resumes rather than repeating work.
//
//   node scripts/food-search-eval/run.mjs            # full run
//   node scripts/food-search-eval/run.mjs --limit 10 # smoke test
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchFoods } from '../../server/foodSearch/index.js'
import { ITEMS, itemId } from '../keystroke-audit/items.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = path.join(__dirname, 'results.jsonl')
const LOG_PATH = path.join(__dirname, 'run.log')

// Prefix lengths probed, plus the complete query. A prefix at or beyond the
// query's own length is the complete query and is not probed twice.
const PREFIXES = [2, 3, 4, 5]

// USDA's advertised free tier is 1000/hour; this key's own
// `x-ratelimit-limit` header reads 3600/hour. The prior audit budgeted 3000
// against that figure and this script inherited it — but the header is not a
// trailing-hour counter: `x-ratelimit-remaining` read 3599 immediately after
// roughly 5,000 calls, so it resets on a far shorter window than an hour.
//
// The measurement that actually matters: across 1,759 probes in two full
// corpus runs (before and after), ZERO rate-limit responses were observed —
// every provider failure was the Survey dataType's HTTP 400 or an Open Food
// Facts 503. The 3000/hour ceiling was costing ~50 minutes of sleep per run to
// respect a limit that was never hit. Raised, with the limiter KEPT as a
// backstop rather than removed: if the real ceiling ever bites, a run should
// slow down rather than fail.
const USDA_HOURLY_BUDGET = 9000
// Three USDA passes per query (foundation, survey, branded); retries can add
// more, so this is a floor and the limiter is deliberately conservative.
const USDA_CALLS_PER_QUERY = 3

const args = process.argv.slice(2)
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`
  console.log(stamped)
  fs.appendFileSync(LOG_PATH, stamped + '\n')
}

// --- rate limiter: rolling-hour window over USDA call timestamps ------------
const usdaCallTimes = []
function recordUsdaCalls(n) {
  const now = Date.now()
  for (let i = 0; i < n; i++) usdaCallTimes.push(now)
}
async function waitForUsdaBudget(nextCallCount) {
  const HOUR = 60 * 60 * 1000
  for (;;) {
    const now = Date.now()
    while (usdaCallTimes.length && now - usdaCallTimes[0] > HOUR) usdaCallTimes.shift()
    if (usdaCallTimes.length + nextCallCount <= USDA_HOURLY_BUDGET) return
    const waitMs = HOUR - (now - usdaCallTimes[0]) + 250
    log(`  [rate-limit] ${usdaCallTimes.length}/${USDA_HOURLY_BUDGET} USDA calls in the trailing hour; sleeping ${Math.ceil(waitMs / 1000)}s`)
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 5 * 60 * 1000)))
  }
}

// --- matching ---------------------------------------------------------------
const hay = (c) => `${c.name || ''} ${c.brand || ''}`.toLowerCase()
function isTargetMatch(candidate, item) {
  const h = hay(candidate)
  if (!item.match.every((k) => h.includes(k))) return false
  if (item.matchAny && !item.matchAny.some((group) => group.every((k) => h.includes(k)))) return false
  return true
}

// --- one probe --------------------------------------------------------------
async function probe(query, item) {
  // Variants and a typo correction each add another fan-out, so charge the
  // limiter for a worst case rather than the best one.
  await waitForUsdaBudget(USDA_CALLS_PER_QUERY * 2)
  const startedAt = Date.now()
  const outcome = await searchFoods(query)
  const latencyMs = Date.now() - startedAt
  recordUsdaCalls(outcome.sources.filter((s) => s.source === 'usda' && s.ok !== null).reduce((n, s) => n + (s.attempts || 1), 0))

  const idx = outcome.results.findIndex((c) => isTargetMatch(c, item))
  return {
    query,
    latencyMs,
    rank: idx === -1 ? null : idx + 1,
    resultCount: outcome.results.length,
    degraded: outcome.degraded,
    partial: outcome.partial,
    canonicalCoverage: outcome.canonicalCoverage,
    top5: outcome.results.slice(0, 5).map((f) => ({ name: f.name, brand: f.brand || null, source: f.source, datasetTier: f.datasetTier || null, calories: f.calories })),
    failedSources: outcome.sources.filter((s) => s.ok === false).map((s) => `${s.source}/${s.dataset}:${s.error}`),
  }
}

// --- main -------------------------------------------------------------------
const done = new Set()
if (fs.existsSync(RESULTS_PATH)) {
  for (const line of fs.readFileSync(RESULTS_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { done.add(JSON.parse(line).key) } catch {}
  }
  log(`resuming: ${done.size} (item, probe) pairs already recorded`)
}

const items = ITEMS.slice(0, LIMIT === Infinity ? undefined : LIMIT)
log(`starting: ${items.length} items x up to ${PREFIXES.length + 1} probes`)

let n = 0
for (const item of items) {
  const id = itemId(item)
  // Prefixes shorter than the query, then the complete query itself.
  const queries = [...new Set([...PREFIXES.filter((p) => p < item.query.length).map((p) => item.query.slice(0, p)), item.query])]
  for (const q of queries) {
    const key = `${id}|${q}`
    if (done.has(key)) continue
    const isFull = q === item.query
    const r = await probe(q, item)
    fs.appendFileSync(RESULTS_PATH, JSON.stringify({ key, id, store: item.store, kind: item.kind, label: item.label, fullQuery: item.query, prefixLength: q.length, isFull, ...r }) + '\n')
    n++
    if (n % 25 === 0) log(`  ${n} probes recorded (latest: ${id} @ "${q}" -> rank ${r.rank ?? 'MISS'}, ${r.latencyMs}ms)`)
  }
}
log(`done: ${n} new probes this run`)
