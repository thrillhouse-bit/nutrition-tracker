import 'dotenv/config'
import { searchFoods } from '../../server/foodSearch/index.js'

const q = process.argv[2] || 'ban'
const t0 = Date.now()
const out = await searchFoods(q)
console.log('query:', q, 'latency:', Date.now()-t0, 'ms')
console.log('degraded:', out.degraded)
console.log('sources:', out.sources.map(s => `${s.source}/${s.dataset}: ok=${s.ok} count=${s.count} skipped=${s.skipped||''} err=${s.error||''}`))
console.log('top results:')
for (const r of out.results.slice(0,8)) {
  console.log(' -', r.name, '|', r.brand || '(no brand)', '|', r.source, r.datasetTier)
}
