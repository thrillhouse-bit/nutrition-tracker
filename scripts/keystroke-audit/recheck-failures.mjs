// Targeted re-verification of the 36 items the main run recorded as
// "complete failures". Motivation (see docs/keystroke-efficiency-audit.md
// Methodology): 25 of those 36 showed a provider genuinely erroring
// (ok:false) on their FINAL probe, yet the main run's retry policy — retry
// only when EVERY attempted provider failed — never fired once across the
// whole 200-item, 1739-probe run. That means a single flaky provider
// (usually Open Food Facts, sometimes one USDA tier) on the deciding probe
// was enough to record a "failure" that a slightly different retry policy
// might not have. This script re-runs just those 36 items with a wider
// retry trigger (ANY attempted provider failing, not just all of them) to
// get a cleaner read before the report calls something a genuine failure.
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchFoods } from '../../server/foodSearch/index.js'
import { ITEMS, itemId } from './items.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = path.join(__dirname, 'results.jsonl')
const RECHECK_PATH = path.join(__dirname, 'recheck.jsonl')

const USABLE_RANK = 5
const MIN_PREFIX = 2
const MAX_PREFIX = 20
const USDA_HOURLY_BUDGET = 3000
const RETRY_LIMIT = 2 // more generous for this small, targeted re-check

const usdaCallTimes = []
function recordUsdaCalls(n) { const now = Date.now(); for (let i = 0; i < n; i++) usdaCallTimes.push(now) }
async function waitForUsdaBudget(n) {
  const HOUR = 60 * 60 * 1000
  for (;;) {
    const now = Date.now()
    while (usdaCallTimes.length && now - usdaCallTimes[0] > HOUR) usdaCallTimes.shift()
    if (usdaCallTimes.length + n <= USDA_HOURLY_BUDGET) return
    await new Promise((r) => setTimeout(r, 5000))
  }
}

function hay(c) { return `${c.name || ''} ${c.brand || ''}`.toLowerCase() }
function isTargetMatch(c, item) {
  const h = hay(c)
  if (!item.match.every((k) => h.includes(k))) return false
  if (item.matchAny && !item.matchAny.some((g) => g.every((k) => h.includes(k)))) return false
  return true
}

async function probe(prefix) {
  await waitForUsdaBudget(2)
  recordUsdaCalls(2)
  let outcome = await searchFoods(prefix)
  let anyFailed = outcome.sources.some((s) => s.ok === false)
  let retries = 0
  while (anyFailed && retries < RETRY_LIMIT) {
    retries++
    await new Promise((r) => setTimeout(r, 1200))
    await waitForUsdaBudget(2)
    recordUsdaCalls(2)
    outcome = await searchFoods(prefix)
    anyFailed = outcome.sources.some((s) => s.ok === false)
  }
  return { outcome, retries, stillHasFailure: anyFailed }
}

async function auditItem(item) {
  const q = item.query
  const maxLen = Math.min(MAX_PREFIX, q.length)
  const record = {
    id: itemId(item), store: item.store, kind: item.kind, query: q,
    foundAtLength: null, rankAtFound: null, probesUsed: 0, retriesUsed: 0,
    exhausted: false, anyUnresolvedProviderFailure: false, lastProbe: null,
  }
  for (let len = MIN_PREFIX; len <= maxLen; len++) {
    const prefix = q.slice(0, len)
    const { outcome, retries, stillHasFailure } = await probe(prefix)
    record.probesUsed++
    record.retriesUsed += retries
    if (stillHasFailure) record.anyUnresolvedProviderFailure = true
    const rank = outcome.results.findIndex((r) => isTargetMatch(r, item))
    record.lastProbe = {
      prefix, resultCount: outcome.results.length,
      sources: outcome.sources.map((s) => ({ source: s.source, dataset: s.dataset, ok: s.ok, count: s.count, error: s.error })),
      top: outcome.results.slice(0, 5).map((r) => ({ name: r.name, brand: r.brand, source: r.source })),
    }
    if (rank !== -1 && rank < USABLE_RANK) {
      record.foundAtLength = len
      record.rankAtFound = rank + 1
      return record
    }
    if (len === maxLen) { record.exhausted = true; return record }
  }
  record.exhausted = true
  return record
}

async function main() {
  const mainResults = fs.readFileSync(RESULTS_PATH, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  const failedIds = new Set(mainResults.filter((r) => r.foundAtLength == null).map((r) => r.id))
  console.log(`Re-checking ${failedIds.size} items that failed in the main run.`)
  const toCheck = ITEMS.filter((it) => failedIds.has(itemId(it)))
  const out = []
  for (const item of toCheck) {
    const t0 = Date.now()
    const rec = await auditItem(item)
    out.push(rec)
    fs.appendFileSync(RECHECK_PATH, JSON.stringify(rec) + '\n')
    console.log(`${itemId(item)} -> ${rec.foundAtLength ? `found@${rec.foundAtLength} (rank ${rec.rankAtFound})` : 'still NOT FOUND'} [retries=${rec.retriesUsed}, unresolved failure=${rec.anyUnresolvedProviderFailure}] ${Date.now() - t0}ms`)
  }
  const flipped = out.filter((r) => r.foundAtLength != null)
  console.log(`\nOf ${out.length} re-checked: ${flipped.length} now found (were noise), ${out.length - flipped.length} confirmed still not found.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
