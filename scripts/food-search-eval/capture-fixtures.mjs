// Regenerates test/fixtures/liveFoodRows.js from the REAL USDA + Open Food
// Facts APIs. Needs FDC_API_KEY (see .env.example). Not part of `vitest run` —
// the suite reads the pinned output so CI stays hermetic; this script exists so
// the fixture can be honestly refreshed rather than hand-edited.
//
//   node scripts/food-search-eval/capture-fixtures.mjs
//
// USDA's `Survey (FNDDS)` dataType fails with a bare nginx 400 roughly half the
// time (measured 11/20 — see docs/food-search-baseline.md RC-8), so every USDA
// call here retries; that is a property of the upstream, not of this script.
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { usdaSearch, normalizeUSDA, normalizeOFF } from '../../server/lookup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'test', 'fixtures', 'liveFoodRows.js')
const UA = 'NutritionTracker/0.1 (personal use; https://github.com/thrillhouse-bit/nutrition-tracker)'

// Seven golden generic foods + one deliberately BRANDED query, so the fixture
// can prove both directions of the generic/branded intent split.
const QUERIES = ['zucchini', 'banana', 'avocado', 'chicken breast', 'oatmeal', 'salmon', 'peanut butter', 'greek yogurt', 'chobani vanilla']

async function usdaTry(query, dataType, pageSize) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await usdaSearch(query, { dataType, pageSize })
    if (!r.error && r.foods?.length) return r.foods
    await new Promise((res) => setTimeout(res, 400))
  }
  return []
}

async function offTry(query, pageSize) {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=${pageSize}&fields=code,product_name,brands,serving_size,serving_quantity,nutriments`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) {
      const data = await res.json()
      // search-a-licious returns `brands` as an ARRAY; normalizeOFF expects the
      // comma-joined string shape the rest of OFF's API uses.
      return (data.hits || []).map((h) => ({ ...h, brands: Array.isArray(h.brands) ? h.brands.join(', ') : h.brands }))
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return []
}

const slim = (f) => ({
  name: f.name, brand: f.brand ?? null, barcode: f.barcode ?? null,
  serving_size: f.serving_size ?? null, serving_unit: f.serving_unit ?? null,
  calories: f.calories ?? null, protein_g: f.protein_g ?? null,
  carbs_g: f.carbs_g ?? null, fat_g: f.fat_g ?? null,
  source: f.source, datasetTier: f.datasetTier,
})

const out = {}
for (const q of QUERIES) {
  const foundation = await usdaTry(q, 'Foundation,SR Legacy', 6)
  const survey = await usdaTry(q, 'Survey (FNDDS)', 6)
  const branded = await usdaTry(q, 'Branded', 6)
  const off = await offTry(q, 6)
  out[q] = {
    usdaGeneric: [...foundation, ...survey].map((f) => slim({ ...normalizeUSDA(f), datasetTier: 'generic' })),
    usdaBranded: branded.map((f) => slim({ ...normalizeUSDA(f), datasetTier: 'branded' })),
    off: off.map((p) => slim({ ...normalizeOFF(p, p.code || null), datasetTier: 'branded' })),
  }
  console.log(`${q}: generic=${out[q].usdaGeneric.length} branded=${out[q].usdaBranded.length} off=${out[q].off.length}`)
}

const header = `// Live provider rows captured 26 Aug 2026 from the REAL USDA FoodData Central
// (Foundation + SR Legacy + Survey/FNDDS, and Branded) and Open Food Facts
// APIs, with server/lookup.js's own normalizeUSDA/normalizeOFF applied — i.e.
// exactly the objects server/foodSearch/index.js merges and ranks. Pinned here
// rather than fetched at test time so the suite stays hermetic and
// deterministic, matching this repo's existing "live-reproduced bug" fixture
// convention (see test/foodSearchRank.test.js and
// test/foodSearchRequiredQueries.test.js).
//
// Regenerate with: node scripts/food-search-eval/capture-fixtures.mjs
// (needs FDC_API_KEY). Do not hand-edit — the point is that these are the real
// rows, including the awkward ones: USDA's inverted canonical names
// ("Squash, summer, green, zucchini, includes skin, raw"), branded rows whose
// whole description is the bare query word ("ZUCCHINI"), and prepared dishes
// that share every query token ("Bread, zucchini").
export const LIVE_ROWS = `
fs.writeFileSync(OUT, header + JSON.stringify(out, null, 2) + '\n')
console.log(`\nwrote ${OUT}`)
