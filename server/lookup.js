// Nutrition data lookup, in the order the brief specifies:
//   1. Open Food Facts  (free, no key) — best for branded/packaged grocery items
//   2. USDA FoodData Central (free, needs FDC_API_KEY) — fallback for generic/
//      whole foods and a secondary barcode source (Branded GTIN/UPC search)
// The caller caches every hit in `foods`, so repeat scans never reach here.

const OFF_UA = 'NutritionTracker/0.1 (personal use; https://github.com/thrillhouse-bit/nutrition-tracker)'
const TIMEOUT_MS = 6000

async function getJSON(url, headers = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    return { ok: true, status: res.status, data: await res.json() }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err) }
  } finally {
    clearTimeout(t)
  }
}

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

// ---- Open Food Facts -----------------------------------------------------

function offServingBasis(product) {
  let size = n(product.serving_quantity)
  let unit = null
  const ss = (product.serving_size ?? '').toString()
  const m = ss.match(/([\d.,]+)\s*([a-zA-Zµ]+)/)
  if (m) {
    if (size == null) size = n(m[1].replace(',', '.'))
    unit = m[2].toLowerCase()
  }
  if (size != null && size > 0) return { size, unit: unit || 'g', per: 'serving' }
  return { size: 100, unit: 'g', per: '100g' }
}

// Resolve one nutriment to the serving basis. OFF exposes `<base>_serving` and
// `<base>_100g`; prefer the serving value, else scale the per-100g value.
function offResolve(nutriments, base, basis) {
  if (basis.per === 'serving') {
    const s = n(nutriments[`${base}_serving`])
    if (s != null) return s
    const h = n(nutriments[`${base}_100g`])
    if (h != null) return (h * basis.size) / 100
    return null
  }
  const h = n(nutriments[`${base}_100g`]) ?? n(nutriments[base])
  return h
}

export function normalizeOFF(product, barcode) {
  const nut = product.nutriments || {}
  const basis = offServingBasis(product)

  let calories = offResolve(nut, 'energy-kcal', basis)
  if (calories == null) {
    const kj = offResolve(nut, 'energy-kj', basis) ?? offResolve(nut, 'energy', basis)
    if (kj != null) calories = kj / 4.184
  }

  // OFF stores sodium in grams; fall back to salt (sodium = salt / 2.5).
  let sodium_g = offResolve(nut, 'sodium', basis)
  if (sodium_g == null) {
    const salt = offResolve(nut, 'salt', basis)
    if (salt != null) sodium_g = salt / 2.5
  }

  const name = (
    product.product_name || product.product_name_en || product.generic_name || ''
  ).trim()

  return {
    barcode: barcode || product.code || null,
    name: name || 'Unknown product',
    brand: (product.brands || '').split(',')[0].trim() || null,
    serving_size: round(basis.size, 2),
    serving_unit: basis.unit,
    calories: round(calories, 1),
    protein_g: round(offResolve(nut, 'proteins', basis), 2),
    carbs_g: round(offResolve(nut, 'carbohydrates', basis), 2),
    fat_g: round(offResolve(nut, 'fat', basis), 2),
    fiber_g: round(offResolve(nut, 'fiber', basis), 2),
    sugar_g: round(offResolve(nut, 'sugars', basis), 2),
    sodium_mg: sodium_g == null ? null : round(sodium_g * 1000, 1),
    source: 'openfoodfacts',
    raw_api_response: product,
  }
}

async function lookupOFF(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
  const { ok, data } = await getJSON(url, { 'User-Agent': OFF_UA })
  if (!ok || !data || data.status !== 1 || !data.product) return null
  const food = normalizeOFF(data.product, barcode)
  // A product row with a name but no calories/macros is not usefully "found".
  if (food.calories == null && food.protein_g == null && food.carbs_g == null) return null
  return food
}

// ---- USDA FoodData Central ----------------------------------------------

// Nutrient IDs in the FDC dataset.
const FDC = { kcal: 1008, protein: 1003, fat: 1004, carbs: 1005, fiber: 1079, sugar: 2000, sugarNLEA: 1063, sodium: 1093 }

function fdcAmount(food, id) {
  const row = (food.foodNutrients || []).find(
    (x) => x.nutrientId === id || x.nutrient?.id === id,
  )
  return row ? n(row.value ?? row.amount) : null
}

export function normalizeUSDA(food, requestedBarcode = null) {
  const label = food.labelNutrients // present on Branded foods, per serving
  if (label) {
    return {
      barcode: food.gtinUpc || requestedBarcode || null,
      name: (food.description || 'Unknown food').trim(),
      brand: (food.brandOwner || food.brandName || '').trim() || null,
      serving_size: n(food.servingSize) ?? 1,
      serving_unit: (food.servingSizeUnit || 'serving').toLowerCase(),
      calories: round(label.calories?.value, 1),
      protein_g: round(label.protein?.value, 2),
      carbs_g: round(label.carbohydrates?.value, 2),
      fat_g: round(label.fat?.value, 2),
      fiber_g: round(label.fiber?.value, 2),
      sugar_g: round(label.sugars?.value, 2),
      sodium_mg: round(label.sodium?.value, 1),
      source: 'usda',
      raw_api_response: food,
    }
  }
  // Foundation / SR Legacy / Survey: nutrients are per 100 g.
  return {
    barcode: food.gtinUpc || requestedBarcode || null,
    name: (food.description || 'Unknown food').trim(),
    brand: (food.brandOwner || food.brandName || '').trim() || null,
    serving_size: 100,
    serving_unit: 'g',
    calories: round(fdcAmount(food, FDC.kcal), 1),
    protein_g: round(fdcAmount(food, FDC.protein), 2),
    carbs_g: round(fdcAmount(food, FDC.carbs), 2),
    fat_g: round(fdcAmount(food, FDC.fat), 2),
    fiber_g: round(fdcAmount(food, FDC.fiber), 2),
    sugar_g: round(fdcAmount(food, FDC.sugar) ?? fdcAmount(food, FDC.sugarNLEA), 2),
    sodium_mg: round(fdcAmount(food, FDC.sodium), 1),
    source: 'usda',
    raw_api_response: food,
  }
}

// Exported (unlike before) so server/foodSearch/providers.js can issue its
// own dataType-scoped queries (Foundation/SR Legacy for generic whole foods,
// Branded separately) without duplicating the URL-building/fetch logic here.
// `dataType` may be a single string or an array (USDA's API accepts either;
// URLSearchParams needs it pre-joined for an array).
export async function usdaSearch(query, { dataType, pageSize = 15 } = {}) {
  const key = process.env.FDC_API_KEY
  if (!key) return { configured: false, foods: [] }
  const params = new URLSearchParams({ api_key: key, query, pageSize: String(pageSize) })
  if (dataType) params.set('dataType', Array.isArray(dataType) ? dataType.join(',') : dataType)
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`
  const { ok, status, data, error } = await getJSON(url)
  if (!ok) return { configured: true, foods: [], error: error || `HTTP ${status}` }
  if (!data?.foods) return { configured: true, foods: [] }
  return { configured: true, foods: data.foods }
}

async function lookupUSDA(barcode) {
  const { configured, foods } = await usdaSearch(barcode, { dataType: 'Branded', pageSize: 5 })
  if (!configured || !foods.length) return null
  // Prefer an exact UPC/GTIN match; UPCs are sometimes zero-padded differently.
  const exact = foods.find((f) => f.gtinUpc && f.gtinUpc.replace(/^0+/, '') === barcode.replace(/^0+/, ''))
  return normalizeUSDA(exact || foods[0], barcode)
}

// ---- Public API ----------------------------------------------------------

export async function lookupByBarcode(barcode) {
  const off = await lookupOFF(barcode)
  if (off) return off
  const usda = await lookupUSDA(barcode)
  if (usda) return usda
  return null
}

// Open Food Facts free-text search — extracted so server/foodSearch/
// providers.js can call it directly (with its own per-query diagnostics)
// rather than duplicating the URL/fetch. The legacy CGI search actually
// ranks by the query terms; the v2 /search endpoint is field-filter
// oriented and returns near-random hits for a bare term, so this uses
// cgi/search.pl. Returns the raw ok/data pair (not yet normalized or
// filtered) so the caller decides how to report a failure vs. zero hits.
export async function offTextSearch(query, { pageSize = 15 } = {}) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=code,product_name,brands,serving_size,serving_quantity,nutriments`
  return getJSON(url, { 'User-Agent': OFF_UA })
}

// searchByText (free-text food search — produce, bulk bins, no barcode) now
// lives in server/foodSearch/index.js: normalization, a synonym layer, typo
// tolerance, dataType-aware USDA querying, and relevance ranking that
// actually keeps a generic food ahead of branded/obscure noise. See
// docs/food-search.md for the full redesign and the "zucchini" root-cause
// evidence that drove it. normalizeOFF/normalizeUSDA/usdaSearch/
// offTextSearch above are the shared building blocks both that module and
// the barcode-lookup path here use — there is one nutrient-mapping
// implementation, not two.

function round(v, decimals = 2) {
  if (v == null) return null
  const x = Number(v)
  if (!Number.isFinite(x)) return null
  const p = 10 ** decimals
  return Math.round(x * p) / p
}
