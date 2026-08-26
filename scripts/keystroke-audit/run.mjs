// Keystroke-efficiency audit runner. Calls the REAL server-side search
// orchestration (server/foodSearch/index.js -> searchFoods) directly — same
// code path /api/foods/search uses — against the real USDA FoodData Central
// + Open Food Facts APIs. No mocks.
//
// For each item in items.mjs, walks increasing left-to-right prefixes of its
// natural search phrase (matching how a user actually types), starting at 2
// chars (the app's own UI floor — SearchFood.jsx never searches below that),
// and records the first prefix length at which the target item appears
// within the "usable" threshold (top USABLE_RANK results, 1-indexed).
// Early-exits a per-item probe loop as soon as found. Caps at MAX_PREFIX
// characters to bound worst-case call volume (documented in the report).
//
// Rate limiting: the task's stated ceiling is USDA's advertised free-tier
// figure, 1000 requests/hour. This key's OWN `x-ratelimit-limit` response
// header reads 3600/hour, confirmed by direct curl immediately before this
// run (twice, minutes apart, both 3600 — not a fluke), so 900/hour (this
// script's first attempt) was needlessly slow: the first burst used exactly
// 900 calls and the very next raw request against the live API still showed
// x-ratelimit-remaining: 3596, i.e. this key's real budget had barely moved.
// Budgeted here at 3000/hour — comfortably under the MEASURED real ceiling
// with real margin, not the advertised default — so the remaining items
// finish in minutes rather than the ~2 hours a 900/hour pace would need. A
// rolling-window limiter tracks USDA calls (2 per probe: generic + branded
// tiers) and sleeps as needed before the next probe. Open Food Facts calls
// are paced incidentally by the same delay but are not the binding
// constraint (no published hard hourly cap, only "reasonable use").
//
// Resilience note (found live during setup, see docs/keystroke-efficiency-
// audit.md "Methodology"): USDA's own search endpoint intermittently returns
// a bare HTTP 400 (nginx-level, `x-nginx-intercept: portal-foods-search`) on
// byte-identical requests -- roughly half the time in a small manual sample.
// This is upstream flakiness, not a bug in this repo's request formation
// (confirmed by replaying the exact URL our own code builds and seeing both
// 200 and 400 on IDENTICAL requests seconds apart). Left uncorrected, that
// flakiness would inject pure noise into a keystroke-length measurement: a
// prefix could look like a "failure" at length N and a "success" at the
// (should be monotonically easier) length N+1 purely because of an unlucky
// upstream 400, not because of anything the ranking/retrieval code did. So
// this runner retries a whole searchFoods() call up to RETRY_LIMIT times
// when every attempted provider in the FIRST attempt looked like a genuine
// transient failure (ok:false, not a real empty ok:true/count:0) — never to
// paper over a real empty result, only to avoid crediting the search
// pipeline with a miss it didn't actually make.
//
// Checkpointed: results are appended to results.jsonl as each item
// completes, and a completed item is skipped on a re-run (so a killed/
// restarted process resumes rather than repeating work or losing it — see
// CLAUDE task note that the first attempt at this audit was lost to an
// environment restart).
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchFoods } from '../../server/foodSearch/index.js'
import { ITEMS, itemId } from './items.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = __dirname
const RESULTS_PATH = path.join(OUT_DIR, 'results.jsonl')
const LOG_PATH = path.join(OUT_DIR, 'run.log')

const USABLE_RANK = 5 // "usable" = within the top 5 results (see report for rationale)
const MIN_PREFIX = 2 // app never searches below 2 chars (SearchFood.jsx)
// Cap on prefix length probed. NOT "first word" (several real multi-word
// brand+product phrases need the brand token AND a second word to
// disambiguate — a first-word-only cap would misreport those as failures
// for a reason that has nothing to do with the search pipeline). 20 chars
// is a generous typing budget — nobody reasonably expects to need to type
// more before something usable shows up — while still bounding worst-case
// call volume for items that never resolve. An early dry run with a 14-char
// cap cut several legitimate multi-word branded queries off mid-phrase
// before they'd had a fair chance; 20 was chosen after seeing that.
const MAX_PREFIX = 20
const USDA_HOURLY_BUDGET = 3000 // margin under this key's MEASURED real 3600/hour ceiling (see comment above)
const RETRY_LIMIT = 1 // one retry of a whole searchFoods() call on apparent transient failure

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`
  console.log(stamped)
  fs.appendFileSync(LOG_PATH, stamped + '\n')
}

// --- rate limiter: rolling-hour window over USDA call timestamps ----------
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
    log(`  [rate-limit] ${usdaCallTimes.length}/${USDA_HOURLY_BUDGET} USDA calls in trailing hour; sleeping ${Math.ceil(waitMs / 1000)}s`)
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 5 * 60 * 1000)))
  }
}

// --- matching ---------------------------------------------------------------
function hay(candidate) {
  return `${candidate.name || ''} ${candidate.brand || ''}`.toLowerCase()
}
function isTargetMatch(candidate, item) {
  const h = hay(candidate)
  if (!item.match.every((k) => h.includes(k))) return false
  if (item.matchAny && !item.matchAny.some((group) => group.every((k) => h.includes(k)))) return false
  return true
}

// One probe: run the real searchFoods() pipeline for this prefix, with one
// retry if the FIRST attempt looks like pure transient provider failure
// (every attempted source ok:false) rather than a genuine empty/negative
// result.
async function probe(prefix) {
  // Rate-limit check belongs HERE, per actual network call, not once per
  // item — a per-item-only check would let a long per-item probe loop (up
  // to 19 probes at the current MAX_PREFIX) blow through the hourly budget
  // between item-level checks. Every call into searchFoods() (initial
  // attempt or retry) goes through this gate first.
  await waitForUsdaBudget(2)
  recordUsdaCalls(2) // usda generic + usda branded, always attempted regardless of key config (skipped ones don't hit the network, but we count conservatively before knowing)
  let outcome = await searchFoods(prefix)
  const attempted = outcome.sources.filter((s) => s.ok !== null)
  const allFailed = attempted.length > 0 && attempted.every((s) => s.ok === false)
  let retried = false
  if (allFailed && RETRY_LIMIT > 0) {
    retried = true
    await new Promise((r) => setTimeout(r, 1500))
    await waitForUsdaBudget(2)
    recordUsdaCalls(2)
    outcome = await searchFoods(prefix)
  }
  return { outcome, retried }
}

async function auditItem(item) {
  const q = item.query
  const maxLen = Math.min(MAX_PREFIX, q.length)
  const record = {
    id: itemId(item), store: item.store, kind: item.kind, query: q,
    foundAtLength: null, rankAtFound: null, totalResultsAtFound: null,
    probesUsed: 0, retriesUsed: 0, exhausted: false,
    lastProbe: null, // full diagnostic dump of the LAST probe tried (found or not) for debuggability
  }
  for (let len = MIN_PREFIX; len <= maxLen; len++) {
    const prefix = q.slice(0, len)
    const { outcome, retried } = await probe(prefix)
    record.probesUsed++
    if (retried) record.retriesUsed++
    const rank = outcome.results.findIndex((r) => isTargetMatch(r, item))
    record.lastProbe = {
      prefix, degraded: outcome.degraded,
      resultCount: outcome.results.length,
      sources: outcome.sources.map((s) => ({ source: s.source, dataset: s.dataset, ok: s.ok, count: s.count, error: s.error, skipped: s.skipped })),
      top: outcome.results.slice(0, 8).map((r) => ({ name: r.name, brand: r.brand, source: r.source })),
    }
    if (rank !== -1 && rank < USABLE_RANK) {
      record.foundAtLength = len
      record.rankAtFound = rank + 1 // 1-indexed for the report
      record.totalResultsAtFound = outcome.results.length
      return record
    }
    // Fully typed the natural phrase (or hit the cap) and still not usable.
    if (len === maxLen) {
      record.exhausted = true
      return record
    }
  }
  record.exhausted = true
  return record
}

function loadCompleted() {
  if (!fs.existsSync(RESULTS_PATH)) return new Set()
  const lines = fs.readFileSync(RESULTS_PATH, 'utf8').split('\n').filter(Boolean)
  const ids = new Set()
  for (const line of lines) {
    try { ids.add(JSON.parse(line).id) } catch { /* skip corrupt line */ }
  }
  return ids
}

async function main() {
  const completed = loadCompleted()
  log(`Starting run. ${completed.size} items already completed (resuming). ${ITEMS.length} total.`)
  let done = completed.size
  for (const item of ITEMS) {
    const id = itemId(item)
    if (completed.has(id)) continue
    const t0 = Date.now()
    const record = await auditItem(item)
    const ms = Date.now() - t0
    fs.appendFileSync(RESULTS_PATH, JSON.stringify(record) + '\n')
    done++
    log(`[${done}/${ITEMS.length}] ${id} -> ${record.foundAtLength ? `found@${record.foundAtLength} (rank ${record.rankAtFound})` : 'NOT FOUND'} in ${record.probesUsed} probes, ${ms}ms`)
  }
  log('Run complete.')
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err}`)
  process.exit(1)
})
