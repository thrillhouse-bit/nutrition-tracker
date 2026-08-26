// One-off completion of the recheck for the final 2 of 36 items (the
// original recheck-failures.mjs has no resume logic and would have re-run
// all 36 from scratch — this targets just what's missing instead).
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchFoods } from '../../server/foodSearch/index.js'
import { ITEMS, itemId } from './items.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECHECK_PATH = path.join(__dirname, 'recheck.jsonl')

const USABLE_RANK = 5
const MIN_PREFIX = 2
const MAX_PREFIX = 20
const RETRY_LIMIT = 2

function hay(c) { return `${c.name || ''} ${c.brand || ''}`.toLowerCase() }
function isTargetMatch(c, item) {
  const h = hay(c)
  if (!item.match.every((k) => h.includes(k))) return false
  if (item.matchAny && !item.matchAny.some((g) => g.every((k) => h.includes(k)))) return false
  return true
}

async function probe(prefix) {
  let outcome = await searchFoods(prefix)
  let anyFailed = outcome.sources.some((s) => s.ok === false)
  let retries = 0
  while (anyFailed && retries < RETRY_LIMIT) {
    retries++
    await new Promise((r) => setTimeout(r, 1200))
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

const remaining = ['walmart:philadelphia cream cheese', 'walmart:coca cola 12 pack']
for (const id of remaining) {
  const item = ITEMS.find((it) => itemId(it) === id)
  const rec = await auditItem(item)
  fs.appendFileSync(RECHECK_PATH, JSON.stringify(rec) + '\n')
  console.log(`${id} -> ${rec.foundAtLength ? `found@${rec.foundAtLength} (rank ${rec.rankAtFound})` : 'still NOT FOUND'} [retries=${rec.retriesUsed}]`)
}
