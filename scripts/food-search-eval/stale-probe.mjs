// Measures INCORRECT STALE-RESPONSE COMMITS against the running app. This is
// the one metric in the Phase 5 set that must be exactly zero: the whole
// point of the overhaul is that a response for query A can never be presented
// as the answer to query B.
//
// It cannot be measured from the server — it is a client-state property — so
// this drives the real UI in Chromium and makes the question unambiguous by
// replacing /api/search with synthetic responses whose result names EMBED the
// query that produced them:
//
//     GET /api/search?q=banana   ->   [{ name: "RESULT-FOR[banana]" }]
//
// Any row visible on screen whose embedded query is not the query in the input
// is, by construction, a stale commit. Latencies are randomized across a range
// that straddles the 350ms debounce, so the run includes the three orderings
// that matter: a response landing while its own query is still current, one
// landing after a newer request has started, and one landing INSIDE the newer
// query's debounce window — the last of which is the race that was reproduced
// in production and which the old sequence guard did not cover
// (docs/food-search-baseline.md §1.3).
//
//   node scripts/food-search-eval/stale-probe.mjs [switches] [baseUrl]
import { chromium } from '/home/user/nutrition-tracker-afp/node_modules/playwright/index.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SWITCHES = Number(process.argv[2] || 60)
const BASE = process.argv[3] || 'http://127.0.0.1:4789'
const OUT = path.join(__dirname, 'stale-probe.json')

const QUERIES = ['zucchini', 'banana', 'greek yogurt', 'salmon', 'oatmeal', 'avocado', 'chicken breast', 'peanut butter', 'coca cola', 'broccoli', 'almond butter', 'cheddar']
const TAG = (q) => `RESULT-FOR[${q}]`
const embeddedQuery = (name) => name.match(/^RESULT-FOR\[(.+)\]$/)?.[1] ?? null

// Straddles the 350ms debounce deliberately: below it, at it, and well past it.
const LATENCIES = [40, 120, 250, 340, 360, 500, 900, 1600, 2500]
const pick = (a) => a[Math.floor(Math.random() * a.length)]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const requests = []
await page.route('**/api/search**', async (route) => {
  const q = new URL(route.request().url()).searchParams.get('q') || ''
  const delay = pick(LATENCIES)
  requests.push({ q, delay, at: Date.now() })
  await new Promise((r) => setTimeout(r, delay))
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results: [{ name: TAG(q), calories: 100, serving_size: 100, serving_unit: 'g', source: 'usda' }],
      degraded: false, partial: false, usdaConfigured: true, canonicalCoverage: 'ok', providers: [], query: q,
    }),
  })
})

await page.goto(BASE, { waitUntil: 'networkidle' })
{
  const body = await page.textContent('body')
  if (/Sign in|Create account/i.test(body)) {
    await page.fill('input[type="email"]', 'dev@local.test')
    await page.fill('input[type="password"]', 'devpassword123')
    await page.locator('button', { hasText: /Sign in|Log in/i }).first().click()
    await page.waitForTimeout(2000)
  }
}
await page.locator('button', { hasText: /Log food/i }).first().click()
await page.waitForTimeout(600)
await page.locator('button', { hasText: /Search foods/i }).first().click()
await page.waitForTimeout(400)

// Sample the DOM continuously in the page, so a wrong state that exists for a
// single frame is still caught — polling from Node would miss it.
await page.evaluate(() => {
  window.__samples = []
  window.__sampler = setInterval(() => {
    const input = document.querySelector('input[aria-label="Search foods"]')
    // Deliberately NOT scoped to the post-overhaul markup: the same selector
    // has to work against the pre-fix component so this probe can be run in
    // its firing state as well as its non-firing one (see --control below).
    // Only rows carrying the synthetic RESULT-FOR[...] tag are counted, so a
    // broad selector cannot manufacture a false positive.
    const rows = [...document.querySelectorAll('div.font-medium')]
      .map((n) => n.textContent)
      .filter((t) => /^RESULT-FOR\[/.test(t))
    window.__samples.push({ t: Date.now(), q: input ? input.value.trim() : '', rows })
  }, 12)
})

const input = page.locator('input[aria-label="Search foods"]')
const switches = []
for (let i = 0; i < SWITCHES; i++) {
  const q = pick(QUERIES)
  await input.fill(q)
  switches.push({ i, q, at: Date.now() })
  // A dwell time that also straddles the debounce: sometimes the user moves on
  // before a request even starts, sometimes mid-flight, sometimes after.
  await page.waitForTimeout(pick([80, 200, 330, 380, 600, 1200, 2600]))
}
await page.waitForTimeout(4000) // let everything in flight land

const samples = await page.evaluate(() => { clearInterval(window.__sampler); return window.__samples })

const violations = []
for (const s of samples) {
  for (const row of s.rows) {
    const belongsTo = embeddedQuery(row)
    if (belongsTo === null) continue // not one of our synthetic rows
    if (belongsTo !== s.q) violations.push({ at: s.t, inputValue: s.q, rowBelongsTo: belongsTo, row })
  }
}

const finalState = samples[samples.length - 1]
const report = {
  measuredAt: new Date().toISOString(),
  querySwitches: SWITCHES,
  searchRequests: requests.length,
  domSamples: samples.length,
  samplesWithRowsRendered: samples.filter((s) => s.rows.length).length,
  staleCommits: violations.length,
  distinctStaleCommits: [...new Set(violations.map((v) => `${v.inputValue}<-${v.rowBelongsTo}`))],
  finalInputValue: finalState?.q ?? null,
  finalRows: finalState?.rows ?? [],
  finalStateMatchesFinalQuery: (finalState?.rows ?? []).every((r) => embeddedQuery(r) === null || embeddedQuery(r) === finalState.q),
  // A probe that never sees a rendered row cannot report a violation. Recorded
  // so a zero can be told apart from a blind run.
  probeCouldHaveSeenAViolation: samples.some((s) => s.rows.length > 0),
  examples: violations.slice(0, 10),
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2))

console.log(`query switches:              ${report.querySwitches}`)
console.log(`search requests issued:      ${report.searchRequests}`)
console.log(`DOM samples (12ms interval): ${report.domSamples}  (${report.samplesWithRowsRendered} with rows rendered)`)
console.log(`INCORRECT STALE COMMITS:     ${report.staleCommits}`)
console.log(`final state matches query:   ${report.finalStateMatchesFinalQuery}`)
if (report.staleCommits) console.log('examples:', JSON.stringify(report.examples, null, 2))
console.log(`\nwrote ${OUT}`)

await browser.close()
process.exit(report.staleCommits === 0 && report.finalStateMatchesFinalQuery ? 0 : 1)
