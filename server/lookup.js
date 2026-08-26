// Nutrition data lookup, in the order the brief specifies:
//   1. Open Food Facts  (free, no key) — best for branded/packaged grocery items
//   2. USDA FoodData Central (free, needs FDC_API_KEY) — fallback for generic/
//      whole foods and a secondary barcode source (Branded GTIN/UPC search)
// The caller caches every hit in `foods`, so repeat scans never reach here.

const OFF_UA = 'NutritionTracker/0.1 (personal use; https://github.com/thrillhouse-bit/nutrition-tracker)'
const TIMEOUT_MS = 6000

async function getJSON(url, headers = {}, { timeoutMs = TIMEOUT_MS, signal } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  // A caller-supplied signal (the search layer's own deadline) has to compose
  // with the per-request one, not replace it — otherwise a provider that hangs
  // past its own ceiling is only interrupted if the caller happened to set a
  // shorter deadline.
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    return { ok: true, status: res.status, data: await res.json() }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err) }
  } finally {
    clearTimeout(t)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

// ---- Open Food Facts -----------------------------------------------------

// Recognized mass/volume units only — deliberately narrower than the old
// "any number followed by any letters" match, which grabbed the leading
// quantity word instead of the real weight whenever OFF's serving_size
// string reads "1 serving (28 g)" or "1 can (354.9 ml)": the naive regex's
// first number+letters run is "1"+"serving"/"1"+"can", not the parenthetical
// weight — reproduced live against real OFF data (Pringles UPC
// 038000138416 -> "28 serving"; Diet Coke UPC 049000028911 -> "354.9 can").
const MASS_VOLUME_RE = /([\d.,]+)\s*(kg|mg|g|l|ml|fl\s?oz|oz|lb)\b/i

function offServingBasis(product) {
  let size = n(product.serving_quantity)
  let unit = null

  const ss = (product.serving_size ?? '').toString()
  // The real weight/volume, when present, is almost always the qualifier in
  // parentheses ("1 serving (28 g)") — check there first so a leading
  // quantity word never shadows it.
  const parenMatch = ss.match(/\(([^)]*)\)/)
  const strict = (parenMatch && parenMatch[1].match(MASS_VOLUME_RE)) || ss.match(MASS_VOLUME_RE)
  if (strict) {
    if (size == null) size = n(strict[1].replace(',', '.'))
    unit = strict[2].toLowerCase().replace(/\s+/, '')
  } else {
    // No recognized mass/volume unit anywhere in the string — fall back to
    // the loose "first number + word" match rather than reporting nothing,
    // even though the resulting unit (e.g. "serving", "cup", "piece") isn't
    // one we can compare or convert.
    const loose = ss.match(/([\d.,]+)\s*([a-zA-Zµ]+)/)
    if (loose) {
      if (size == null) size = n(loose[1].replace(',', '.'))
      unit = loose[2].toLowerCase()
    }
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

// Foundation rows very often carry NO nutrient 1008 at all. They report energy
// as 2048 "Energy (Atwater Specific Factors)" and 2047 "Energy (Atwater General
// Factors)" instead — confirmed live 26 Aug 2026 against
// /fdc/v1/foods/search?dataType=Foundation for "chicken breast", where
// "Chicken, breast, boneless, skinless, raw" has 2047=106 and 2048=112 kcal and
// no 1008. Reading only 1008 meant USDA's single most canonical dataset came
// back with calories:null, which the UI's fmt() then paints as a confident
// "0 kcal" — a fabricated number, the same failure hasUsableNutrition exists to
// prevent, one field further down. Specific factors are USDA's more accurate
// figure, so they are preferred over the general ones when 1008 is absent.
const FDC_ENERGY_FALLBACKS = [2048, 2047]

function fdcAmount(food, id) {
  const row = (food.foodNutrients || []).find(
    (x) => x.nutrientId === id || x.nutrient?.id === id,
  )
  return row ? n(row.value ?? row.amount) : null
}

// kcal only — never a kJ figure silently treated as kcal.
function fdcEnergyKcal(food) {
  const rows = food.foodNutrients || []
  const isKcal = (r) => String(r.unitName ?? r.nutrient?.unitName ?? 'KCAL').toUpperCase() === 'KCAL'
  const primary = rows.find((x) => (x.nutrientId === FDC.kcal || x.nutrient?.id === FDC.kcal) && isKcal(x))
  if (primary) return n(primary.value ?? primary.amount)
  for (const id of FDC_ENERGY_FALLBACKS) {
    const row = rows.find((x) => (x.nutrientId === id || x.nutrient?.id === id) && isKcal(x))
    if (row) return n(row.value ?? row.amount)
  }
  return null
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
      // Real-world serving description ("1 cup diced", "1 container") —
      // display-only context alongside the gram/unit amount above, not a
      // second source of truth: never persisted, never fed into any macro
      // math, just shown next to the amount so a "170 g" result also reads
      // as "1 container" where USDA's Branded data happens to say so.
      household_serving: (food.householdServingFullText || '').trim() || null,
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
    calories: round(fdcEnergyKcal(food), 1),
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
export async function usdaSearch(query, { dataType, pageSize = 15, timeoutMs, signal } = {}) {
  const key = process.env.FDC_API_KEY
  if (!key) return { configured: false, foods: [] }
  const params = new URLSearchParams({ api_key: key, query, pageSize: String(pageSize) })
  if (dataType) params.set('dataType', Array.isArray(dataType) ? dataType.join(',') : dataType)
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`
  const { ok, status, data, error } = await getJSON(url, {}, { timeoutMs, signal })
  if (!ok) return { configured: true, foods: [], error: error || `HTTP ${status}` }
  if (!data?.foods) return { configured: true, foods: [] }
  return { configured: true, foods: data.foods }
}

// Whether an FDC key is present at all. The search layer needs this to tell a
// normal unconfigured state apart from a failure, and the UI needs it so the
// empty state stops advising people to install a key they already have —
// production reported usda:"configured" while the app said otherwise (see
// docs/food-search-baseline.md RC-7).
export function usdaConfigured() {
  return Boolean(process.env.FDC_API_KEY)
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

// Open Food Facts free-text search. Two endpoints, because the legacy one is
// measurably unreliable and the modern one is measurably not (20 identical
// queries, 700ms apart, 26 Aug 2026 — docs/food-search-baseline.md RC-10):
//
//   world.openfoodfacts.org/cgi/search.pl   9/20 HTTP 503   p50 549ms
//   search.openfoodfacts.org/search         0/20            p50 166ms
//
// The 503s are not a pacing problem (a single call after 20s idle still 503'd)
// and a burst of three — which one user search issues, primary plus two
// synonym variants — measured 3/3 503. `api/v2/search` also 503s and is
// field-filter oriented rather than term-ranked, so it is not a candidate.
//
// `endpoint: 'search'` (default) is search-a-licious; 'cgi' is the legacy one,
// kept as a fallback rather than deleted — two independent endpoints failing
// together is much rarer than either failing alone, and the fallback costs
// nothing on the ~100% of calls where the primary answers.
//
// Returns the raw ok/data pair (not yet normalized or filtered) so the caller
// decides how to report a failure vs. zero hits. The two endpoints disagree on
// the response envelope (`hits` vs `products`) and on the `brands` type (array
// vs comma-joined string); both are reconciled here so normalizeOFF — shared
// with the barcode path — keeps seeing exactly one product shape.
const OFF_FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments'

export async function offTextSearch(query, { pageSize = 15, endpoint = 'search', timeoutMs, signal } = {}) {
  const url = endpoint === 'cgi'
    ? `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${OFF_FIELDS}`
    : `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=${pageSize}&fields=${OFF_FIELDS}`
  const res = await getJSON(url, { 'User-Agent': OFF_UA }, { timeoutMs, signal })
  if (!res.ok) return res
  return { ...res, data: { products: offProducts(res.data) } }
}

// Normalizes either envelope into the `products` array normalizeOFF expects.
export function offProducts(data) {
  const rows = Array.isArray(data?.products) ? data.products : Array.isArray(data?.hits) ? data.hits : []
  return rows.map((p) => (Array.isArray(p?.brands) ? { ...p, brands: p.brands.join(', ') } : p))
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

// Search results can carry wildly different native serving bases (30 g vs
// 170 g vs "1 serving") with no cross-provider standardization (see
// docs/food-search.md and docs/serving-sizes.md) — this doesn't standardize
// anything, it computes an EXTRA, purely comparative figure so a person
// browsing a result list can tell at a glance which candidate is calorie-
// dense without doing the arithmetic themselves. Deliberately narrow: only
// mass or volume units with a known, unambiguous conversion factor are
// handled; a unit like "serving"/"cup"/"piece"/"can" has no reliable weight
// equivalence, so this returns null rather than inventing one. "oz" alone
// means the WEIGHT ounce (28.3495 g); "fl oz"/"floz" (normalized by the
// parser above) means the fluid ounce (29.5735 mL) — conflating the two
// would silently misstate every oz-labeled solid food's comparison figure.
const MASS_TO_G = { mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592 }
const VOLUME_TO_ML = { ml: 1, l: 1000, floz: 29.5735 }

export function comparablePer100(food) {
  const { calories, serving_size, serving_unit } = food || {}
  if (calories == null || !(serving_size > 0) || !serving_unit) return null
  const unit = serving_unit.toLowerCase()
  if (MASS_TO_G[unit] != null) {
    const grams = serving_size * MASS_TO_G[unit]
    return { basis: 'g', calories: round((calories / grams) * 100, 0) }
  }
  if (VOLUME_TO_ML[unit] != null) {
    const ml = serving_size * VOLUME_TO_ML[unit]
    return { basis: 'ml', calories: round((calories / ml) * 100, 0) }
  }
  return null
}
