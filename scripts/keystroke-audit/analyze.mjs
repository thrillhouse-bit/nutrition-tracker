import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const lines = fs.readFileSync(path.join(__dirname, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const n = s.length
  if (n === 0) return null
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

function summarize(rows, label) {
  const found = rows.filter((r) => r.foundAtLength != null)
  const failed = rows.filter((r) => r.foundAtLength == null)
  const lens = found.map((r) => r.foundAtLength)
  console.log(`\n=== ${label} (n=${rows.length}) ===`)
  console.log(`  found: ${found.length}/${rows.length} (${(100 * found.length / rows.length).toFixed(1)}%)`)
  console.log(`  median chars-to-find: ${median(lens)}`)
  console.log(`  mean chars-to-find:   ${mean(lens)?.toFixed(2)}`)
  console.log(`  min/max: ${Math.min(...lens)}/${Math.max(...lens)}`)
  console.log(`  complete failures (never found by cap): ${failed.length}`)
  return { found, failed, lens }
}

console.log('OVERALL')
summarize(lines, 'ALL')
summarize(lines.filter((r) => r.store === 'wholefoods'), 'Whole Foods')
summarize(lines.filter((r) => r.store === 'walmart'), 'Walmart')
summarize(lines.filter((r) => r.kind === 'generic'), 'Generic/produce')
summarize(lines.filter((r) => r.kind === 'branded'), 'Branded')
summarize(lines.filter((r) => r.store === 'wholefoods' && r.kind === 'generic'), 'WF generic')
summarize(lines.filter((r) => r.store === 'wholefoods' && r.kind === 'branded'), 'WF branded')
summarize(lines.filter((r) => r.store === 'walmart' && r.kind === 'generic'), 'Walmart generic')
summarize(lines.filter((r) => r.store === 'walmart' && r.kind === 'branded'), 'Walmart branded')

// Distribution buckets
console.log('\n=== Distribution of chars-to-find (found items only) ===')
const found = lines.filter((r) => r.foundAtLength != null)
const buckets = { '2-3': 0, '4-6': 0, '7-10': 0, '11-15': 0, '16-20': 0 }
for (const r of found) {
  const l = r.foundAtLength
  if (l <= 3) buckets['2-3']++
  else if (l <= 6) buckets['4-6']++
  else if (l <= 10) buckets['7-10']++
  else if (l <= 15) buckets['11-15']++
  else buckets['16-20']++
}
console.log(buckets)

// Worst offenders: found, but very late (top 10 by foundAtLength, then by probesUsed)
console.log('\n=== Worst offenders (found, but very late) ===')
const worst = [...found].sort((a, b) => b.foundAtLength - a.foundAtLength).slice(0, 20)
for (const r of worst) console.log(`  ${r.foundAtLength}ch (rank ${r.rankAtFound}) — ${r.store}/${r.kind} "${r.query}"`)

// Complete failures
console.log('\n=== Complete failures (never usable within cap) ===')
const failures = lines.filter((r) => r.foundAtLength == null)
for (const r of failures) {
  const lastOk = r.lastProbe?.sources?.some((s) => s.ok === false)
  console.log(`  ${r.store}/${r.kind} "${r.query}" (${r.probesUsed} probes)${lastOk ? '  [a provider failed on the LAST probe — see note]' : ''}`)
}
console.log(`\nTotal complete failures: ${failures.length}/200`)
const failuresWithProviderIssue = failures.filter((r) => r.lastProbe?.sources?.some((s) => s.ok === false))
console.log(`Of those, failures where a provider genuinely errored on the final probe: ${failuresWithProviderIssue.length}`)

// Rank distribution among found items
console.log('\n=== Rank-at-found distribution ===')
const rankCounts = {}
for (const r of found) rankCounts[r.rankAtFound] = (rankCounts[r.rankAtFound] || 0) + 1
console.log(rankCounts)

// probes / retries
const totalProbes = lines.reduce((s, r) => s + r.probesUsed, 0)
const totalRetries = lines.reduce((s, r) => s + (r.retriesUsed || 0), 0)
console.log(`\nTotal probes issued: ${totalProbes} (~${totalProbes * 2} USDA calls + ~${totalProbes} OFF calls)`)
console.log(`Total retries triggered (all attempted providers failed): ${totalRetries}`)
