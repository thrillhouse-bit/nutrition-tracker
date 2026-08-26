// GOLDEN SET — the small list of common foods where an exact generic query MUST
// return the canonical generic food at rank 1. Every failure here is a
// BLOCKING failure, not a statistic to average away.
//
// Run against the REAL providers, so this is a live check of the deployed
// behaviour rather than a fixture replay. The hermetic version of the same
// assertions (against live rows pinned in test/fixtures/liveFoodRows.js) lives
// in test/foodSearchRank.test.js and runs in CI; this one catches the case
// where ranking is right but RETRIEVAL is not — a provider that did not answer
// cannot be ranked around, and that distinction is the whole reason the
// response now carries `canonicalCoverage`.
//
//   node scripts/food-search-eval/golden.mjs
//
// Exits non-zero if any golden query fails.
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchFoods } from '../../server/foodSearch/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'golden.json')

// A prepared/derived food is never the answer to a bare commodity query.
const DISH = /\b(bread|muffin|cake|cupcake|cookie|cookies|cracker|crackers|pie|pudding|split|nectar|juice|chips|dressing|sauce|soup|salad|sandwich|roll|syrup|candy|candies|snack|snacks|smoothie|dip|spread|oil|jerky|loaf|lunchmeat|gelato|ice cream|frozen yogurt|guacamole|sushi|fried|powder|dish)\b/i

const GOLDEN = [
  { query: 'zucchini', must: /zucchini/i, baseForm: /\braw\b/i },
  { query: 'banana', must: /banana/i, baseForm: /\braw\b/i, notAlso: /pepper|melon/i },
  { query: 'avocado', must: /avocado/i, baseForm: /\braw\b/i },
  { query: 'chicken breast', must: /chicken.*breast|breast.*chicken/i, baseForm: /\braw\b/i },
  { query: 'oatmeal', must: /oatmeal|oats/i, baseForm: /\b(nfs|plain|raw)\b/i },
  { query: 'salmon', must: /salmon/i, baseForm: /\b(nfs|raw)\b/i },
  { query: 'peanut butter', must: /peanut butter/i, baseForm: /^peanut butter\b/i },
]

const results = []
let failures = 0

for (const g of GOLDEN) {
  const outcome = await searchFoods(g.query)
  const top = outcome.results[0]
  const reasons = []
  if (!top) reasons.push('no results at all')
  else {
    if (top.datasetTier !== 'generic') reasons.push(`rank 1 is a ${top.datasetTier} product`)
    if (!g.must.test(top.name)) reasons.push('rank 1 does not name the queried food')
    if (!g.baseForm.test(top.name)) reasons.push('rank 1 is not the base form')
    if (DISH.test(top.name)) reasons.push('rank 1 is a prepared/derived food')
    if (g.notAlso && g.notAlso.test(top.name)) reasons.push('rank 1 is a different food sharing the word')
  }
  const pass = reasons.length === 0
  if (!pass) failures++
  results.push({
    query: g.query, pass, reasons,
    rank1: top ? { name: top.name, brand: top.brand || null, datasetTier: top.datasetTier, calories: top.calories, source: top.source } : null,
    // Retrieval health matters here: a golden failure caused by USDA's generic
    // pass not answering is a DIFFERENT problem from a ranking failure, and the
    // response says which.
    canonicalCoverage: outcome.canonicalCoverage,
    partial: outcome.partial,
    degraded: outcome.degraded,
    failedSources: outcome.sources.filter((s) => s.ok === false).map((s) => `${s.source}/${s.dataset}:${s.error}`),
    top5: outcome.results.slice(0, 5).map((f) => `${f.name}${f.brand ? ` [${f.brand}]` : ''} (${f.calories} kcal)`),
    latencyMs: outcome.totalLatencyMs,
  })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${g.query.padEnd(15)} ${top ? `${top.name}${top.brand ? ` [${top.brand}]` : ''}` : '(nothing)'}${reasons.length ? `   <- ${reasons.join('; ')}` : ''}`)
}

fs.writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), failures, total: GOLDEN.length, results }, null, 2))
console.log(`\n${GOLDEN.length - failures}/${GOLDEN.length} golden queries pass`)
console.log(`wrote ${OUT}`)
process.exit(failures === 0 ? 0 : 1)
