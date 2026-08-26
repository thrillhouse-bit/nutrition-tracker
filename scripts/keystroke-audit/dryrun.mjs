import 'dotenv/config'
import { searchFoods } from '../../server/foodSearch/index.js'
import { ITEMS } from './items.mjs'

function hay(c) { return `${c.name || ''} ${c.brand || ''}`.toLowerCase() }
function isTargetMatch(c, item) {
  const h = hay(c)
  if (!item.match.every((k) => h.includes(k))) return false
  if (item.matchAny && !item.matchAny.some((g) => g.every((k) => h.includes(k)))) return false
  return true
}

const sampleIdx = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [0, 1, 45, 100, 150, 151, 165, 199]

for (const idx of sampleIdx) {
  const item = ITEMS[idx]
  console.log(`\n=== [${idx}] ${item.store}/${item.kind}: "${item.query}" ===`)
  const maxLen = Math.min(20, item.query.length)
  for (let len = 2; len <= maxLen; len++) {
    const prefix = item.query.slice(0, len)
    const t0 = Date.now()
    const out = await searchFoods(prefix)
    const ms = Date.now() - t0
    const rank = out.results.findIndex((r) => isTargetMatch(r, item))
    const srcSummary = out.sources.map(s => `${s.source[0]}${s.dataset[0]}:${s.ok===null?'skip':s.ok?'ok'+s.count:'FAIL'}`).join(' ')
    console.log(`  len=${len} "${prefix}" (${ms}ms) [${srcSummary}] rank=${rank===-1?'—':rank+1}/${out.results.length}${rank!==-1 && rank<5 ? '  <-- USABLE' : ''}`)
    if (rank !== -1 && rank < 5) break
    if (len === maxLen) console.log('  (exhausted, not found)')
  }
}
