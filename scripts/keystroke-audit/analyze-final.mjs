import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const main = fs.readFileSync(path.join(__dirname, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
const recheck = fs.readFileSync(path.join(__dirname, 'recheck.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
const recheckById = new Map(recheck.map((r) => [r.id, r]))

// Build the FINAL, corrected per-item view: main run's result, replaced by
// the recheck's result only for the 36 items that were re-verified (and
// only when the recheck found something the main run missed).
const final = main.map((r) => {
  const rc = recheckById.get(r.id)
  if (!rc) return { ...r, correctedFrom: null }
  if (rc.foundAtLength != null) return { ...r, foundAtLength: rc.foundAtLength, rankAtFound: rc.rankAtFound, correctedFrom: 'noise-recovered' }
  return { ...r, correctedFrom: 'confirmed-not-found' }
})

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const n = s.length
  return n === 0 ? null : (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2)
}
function mean(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null }

function summarize(rows, label) {
  const found = rows.filter((r) => r.foundAtLength != null)
  const lens = found.map((r) => r.foundAtLength)
  console.log(`${label}: n=${rows.length}, found=${found.length} (${(100 * found.length / rows.length).toFixed(1)}%), median=${median(lens)}, mean=${mean(lens)?.toFixed(2)}, min/max=${lens.length ? Math.min(...lens) : '-'}/${lens.length ? Math.max(...lens) : '-'}`)
}

console.log('=== FINAL (post-recheck) ===')
summarize(final, 'ALL')
summarize(final.filter((r) => r.store === 'wholefoods'), 'Whole Foods')
summarize(final.filter((r) => r.store === 'walmart'), 'Walmart')
summarize(final.filter((r) => r.kind === 'generic'), 'Generic/produce')
summarize(final.filter((r) => r.kind === 'branded'), 'Branded')
summarize(final.filter((r) => r.store === 'wholefoods' && r.kind === 'generic'), 'WF generic')
summarize(final.filter((r) => r.store === 'wholefoods' && r.kind === 'branded'), 'WF branded')
summarize(final.filter((r) => r.store === 'walmart' && r.kind === 'generic'), 'Walmart generic')
summarize(final.filter((r) => r.store === 'walmart' && r.kind === 'branded'), 'Walmart branded')

const stillFailed = final.filter((r) => r.foundAtLength == null)
console.log(`\nConfirmed complete failures (post-recheck): ${stillFailed.length}/200`)
for (const r of stillFailed) console.log(`  ${r.store}/${r.kind} "${r.query}"`)

fs.writeFileSync(path.join(__dirname, 'final.json'), JSON.stringify(final, null, 1))
console.log('\nWrote final.json')
