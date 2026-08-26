// Relevance ranking for search results — the piece that decides which of
// several real candidates (all genuinely returned by a provider) is shown
// FIRST. Pure functions only, no I/O, fully unit-testable against hand-built
// candidate lists AND against the real captured provider rows in
// test/fixtures/liveFoodRows.js.
//
// A candidate is scored against every "variant" of the user's query (the
// original plus any synonym/typo alternates — see normalize.js) and takes
// whichever variant scores it best, so a result found only via a synonym query
// (e.g. an OFF product named "Courgettes...") is judged as a match for THAT
// term, not penalized for not containing the original word.
//
// Three things this layer learned on 26 Aug 2026, each from a live measurement
// (docs/food-search-baseline.md):
//
//   1. USDA writes canonical foods in INVERTED, comma-separated form —
//      "Squash, summer, green, zucchini, includes skin, raw" is the real
//      Foundation row for zucchini. The old tier ladder scored that a tier 3
//      (the query word appears somewhere) and a branded product literally
//      named "ZUCCHINI" a tier 0, so the branded row won by 500 points. That
//      is production symptom #4, verbatim. Comma-separated names are now
//      parsed as FACETS and matched at facet granularity.
//   2. Ties inside a tier were resolved by whatever order the provider
//      happened to return rows in. "Banana, baked" and "Banana, raw" both
//      scored EXACTLY 2000.5, and USDA listed baked first, so a user searching
//      "banana" got a 161 kcal baked banana at rank 1 and the raw one at 2.
//      Ranking must not depend on arrival order at all, so the final
//      comparator is the name itself.
//   3. There was no query-side notion of generic vs branded intent — only a
//      flat penalty on the candidate. So the only way to make "banana" work
//      was to make "Chobani vanilla" worse. The branded penalty is now
//      query-aware: a candidate whose BRAND is what the user typed is not
//      penalized for being branded.
import { normalizeText, tokenize, splitQualifiers, editDistance } from './normalize.js'

// Crude singular/plural fold, enough for food names. USDA writes "Bananas,
// raw" and "Avocados, raw, California" while people type "banana"/"avocado";
// without this the canonical row loses its facet match to a bare plural.
//
// The `-es` cases are split out deliberately: a blanket "strip -es" turns
// "cookies" into "cooki", which silently stopped DERIVED_FOOD_WORDS from
// recognizing it — "Cookies, oatmeal, with raisins" then scored 1081 against
// the canonical "Oatmeal, NFS" at 980 and sat at rank 3 for "oatmeal". Only
// the endings where English actually inserts an -e are folded that way; every
// word set below also carries both forms, so a stem miss is not load-bearing.
export function stem(token) {
  if (token.length > 4 && /(?:s|x|z|ch|sh|o)es$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

// Membership on the raw token OR its stem — see stem()'s note. Nothing here
// should depend on the stemmer getting an irregular plural right.
const inSet = (token, set) => set.has(token) || set.has(stem(token))

// USDA's canonical descriptions are comma-separated facets, most-general
// first: "Fish, salmon, NFS", "Yogurt, Greek, plain, nonfat". Splitting on the
// comma is what lets "salmon" match the food's identity rather than counting as
// "a word that appears somewhere in a longer string".
export function facetsOf(nameNormalizedNoCommas, rawName) {
  return String(rawName || '')
    .split(',')
    .map((part) => normalizeText(part))
    .filter(Boolean)
}

// Words that mark a candidate as a DIFFERENT, derived food rather than a form
// of the queried one: "Bread, zucchini" is bread, "Avocado dressing" is
// dressing, "Fish oil, salmon" is oil. Deliberately a short, general list in
// the same spirit as normalize.js's QUALIFIER_WORDS — not a per-food alias
// table. It only ever fires when the QUERY does not contain the word too, so
// searching "banana bread" or "avocado oil" is unaffected.
//
// Category words (beverage/beverages/drink/dessert) are deliberately ABSENT:
// USDA files real drinks under "Beverages, ...", so penalizing that word would
// demote the correct answer to every drink query.
export const DERIVED_FOOD_WORDS = new Set([
  'bread', 'muffin', 'cake', 'cupcake', 'cookie', 'cookies', 'cracker', 'crackers',
  'pie', 'pudding', 'split', 'nectar', 'juice', 'chips', 'crisps', 'dressing',
  'sauce', 'soup', 'salad', 'sandwich', 'roll', 'rolls', 'wrap', 'taco', 'burrito',
  'pizza', 'syrup', 'jam', 'jelly', 'candy', 'candies', 'snack', 'snacks', 'bar',
  'smoothie', 'shake', 'dip', 'spread', 'oil', 'jerky', 'loaf', 'bake', 'patty',
  'nugget', 'tender', 'tenders', 'lunchmeat', 'sausage', 'casserole', 'stew',
  'curry', 'fries', 'powder', 'flour', 'cereal', 'granola', 'gelato', 'waffle',
  'pancake', 'pastry', 'donut', 'doughnut', 'brownie', 'pretzel', 'popcorn',
  'custard', 'mousse', 'tart', 'scone',
])

// A preparation the user did not ask for. "Banana, baked" is still a banana,
// so this is a nudge (it must never bury a food the way DERIVED_FOOD_WORDS
// does) — but a bare query means the base food, not one particular cooking
// method chosen for you.
export const PREPARATION_WORDS = new Set([
  'cooked', 'baked', 'fried', 'boiled', 'steamed', 'grilled', 'roasted', 'canned',
  'frozen', 'dried', 'dehydrated', 'smoked', 'pickled', 'breaded', 'stewed',
  'sauteed', 'toasted', 'microwaved', 'rotisserie', 'drained', 'prepared',
  'marinated', 'seasoned', 'sweetened', 'blanched', 'braised', 'poached',
  'creamed', 'candied', 'pureed', 'mashed', 'brined', 'cured',
])

// Markers that a row IS the base form. "NFS" is USDA Survey's own "not further
// specified" — its canonical, unqualified entry for a food, and the reason
// Survey cannot be dropped despite failing ~50% of the time upstream.
export const BASE_FORM_WORDS = new Set(['raw', 'nfs', 'plain', 'unprepared', 'fresh'])

const hasWordFrom = (tokens, set) => tokens.some((t) => inSet(t, set))

// Lower tier = better match. Computed against one query variant's own
// {tokens, baseTokens, qualifiers}.
//   0 — candidate name normalizes to exactly the query
//   1 — the candidate's name IDENTIFIES the query: either its own tokens are
//       exactly the query's (in any order), or the query's tokens are exactly
//       covered by whole comma-separated facets of the name, with any further
//       facets being extra specificity ("Squash, summer, green, zucchini,
//       includes skin, raw" for "zucchini"; "Chicken, breast, boneless,
//       skinless, raw" for "chicken breast")
//   2 — candidate name starts with the query, or its base tokens start with
//       the query's base tokens in order (a prefix match)
//   3 — every one of the query's base tokens appears somewhere in the name
//       (a phrase/all-tokens match, order-independent)
//   4 — the query's base tokens are a small edit distance from the
//       candidate's own tokens (typo-tolerant), or at least one base token
//       appears as a plain substring of the name
//   5 — no textual relation between the query and the candidate's own name
//       (it was returned by a provider matching some OTHER field — brand,
//       ingredients, category)
function tierFor(nameTokens, nameNormalized, nameFacets, variant) {
  const { normalized, tokens, baseTokens } = variant
  if (!normalized) return 5
  if (nameNormalized === normalized) return 0

  const sortedName = [...nameTokens].sort()
  const sortedQuery = [...tokens].sort()
  if (tokens.length && sortedName.length === sortedQuery.length && sortedName.every((t, i) => t === sortedQuery[i])) return 1

  // Facet identity: collect every whole facet whose tokens are all part of the
  // query, and require their union to be the WHOLE query. Matching against the
  // query's full token set (not its base tokens) is deliberate — it keeps
  // "Zucchini" a prefix match for "zucchini raw" rather than promoting it to a
  // full identity match for a form the row does not claim.
  if (tokens.length && nameFacets.length > 1) {
    const queryStems = new Set(tokens.map(stem))
    const covered = new Set()
    for (const facet of nameFacets) {
      const facetStems = tokenize(facet).map(stem)
      if (facetStems.length && facetStems.every((t) => queryStems.has(t))) facetStems.forEach((t) => covered.add(t))
    }
    if (covered.size === queryStems.size) return 1
  }

  if (nameNormalized.startsWith(normalized)) return 2
  if (baseTokens.length && nameTokens.slice(0, baseTokens.length).join(' ') === baseTokens.join(' ')) return 2

  if (baseTokens.length && baseTokens.every((t) => nameTokens.includes(t))) return 3

  if (baseTokens.length && nameTokens.length) {
    for (const qt of baseTokens) {
      if (qt.length < 4) continue // too short for edit-distance tolerance to stay conservative
      for (const nt of nameTokens) {
        if (editDistance(qt, nt) <= (qt.length > 6 ? 2 : 1)) return 4
      }
    }
    if (baseTokens.some((t) => nameNormalized.includes(t))) return 4
  }
  return 5
}

function parseVariant(str) {
  const normalized = normalizeText(str)
  const tokens = tokenize(normalized)
  const { base, qualifiers } = splitQualifiers(tokens)
  return { normalized, tokens, baseTokens: base, qualifiers }
}

// `queryVariants` is an array of raw strings (the primary query plus
// synonym/typo variants) — pre-parsed once per search, not per candidate.
export function bestTierAcrossVariants(name, variants) {
  const nameNormalized = normalizeText(name || '')
  const nameTokens = tokenize(nameNormalized)
  const nameFacets = facetsOf(nameNormalized, name)
  let best = 5
  let bestVariant = variants[0]
  for (const v of variants) {
    const t = tierFor(nameTokens, nameNormalized, nameFacets, v)
    if (t < best) { best = t; bestVariant = v }
    if (best === 0) break
  }
  return { tier: best, variant: bestVariant, nameTokens, nameNormalized, nameFacets }
}

const NUTRIENT_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g']
function completenessCount(candidate) {
  return NUTRIENT_KEYS.filter((k) => candidate[k] != null).length
}

// A Branded product's OWN description sometimes exactly equals a bare query
// word while being a completely different food — reproduced live 26 Aug 2026:
// "banana" surfaces a peanut-butter spread literally named "BANANA"; "zucchini"
// surfaces "ZUCCHINI" (KMB, LLC), a barcoded packet. This penalty is what keeps
// a canonical whole food ahead of them. It is sized to bridge exactly one tier
// step with margin (a tier-1 facet-identity generic at 1000 must beat a tier-0
// branded exact match) — no larger, because an oversized penalty is what makes
// genuinely branded queries wrong.
const BRANDED_PENALTY = 1500

// ...and when the user TYPED the brand, being branded is the point. Reduced
// rather than removed: two Chobani products still sort against each other on
// everything else, and a generic food that also matches stays competitive.
const BRAND_MATCH_PENALTY = 100

// A derived product masquerading as the base food ("Bread, zucchini" for
// "zucchini"). Big enough to outrank the whole tier-1/tier-2 band, because
// these rows match the query's words perfectly and are simply not the food.
const DISH_PENALTY = 1800

// A preparation the user did not ask for. Deliberately much smaller: a baked
// banana is still a banana, it just is not what a bare "banana" means.
const PREP_PENALTY = 300
const BASE_FORM_BONUS = 20

// Each further identity facet beyond the query is extra specificity the user
// did not ask for ("Avocado, Hass, peeled, raw" vs "Avocado, raw"). Small — it
// orders the canonical band, it must never reorder across it.
const EXTRA_FACET_COST = 40

// Does this candidate's BRAND, on its own, account for the whole query? True
// for "coca cola" against a product branded "Coca-Cola"; false for "banana"
// against one branded "fairtrade".
export function brandCoversQuery(candidate, variants) {
  if (!candidate.brand) return false
  const brandStems = new Set(tokenize(normalizeText(candidate.brand)).map(stem))
  return variants.some((v) => v.baseTokens.length && v.baseTokens.every((t) => brandStems.has(stem(t))))
}

// Query-level intent, derived from the candidate pool rather than from a
// hardcoded brand list: is the query itself a BRAND NAME?
//
// This exists because of a regression found while fixing the generic case.
// USDA files branded drinks under generic-looking descriptions —
// "Beverages, COCA-COLA, POWERADE, lemon-lime flavored, ready-to-drink" is a
// GENERIC-tier row whose facet "COCA-COLA" exactly covers the query "coca
// cola", so the facet-identity rule promoted a lemon-lime Powerade to rank 1
// for a Coke search (measured live 26 Aug 2026). Textually that row is
// indistinguishable from "Squash, summer, green, zucchini, includes skin, raw"
// matching "zucchini"; what separates them is the rest of the pool.
//
// BOTH thresholds are measured, not chosen. Distinct brands whose brand field
// covers the WHOLE query, and that share of the branded candidates, over live
// searches on 26 Aug 2026:
//
//   coca cola                                    4 brands   ratio 0.84
//   chicken breast                               2          0.15
//   banana / avocado / salmon / peanut butter    1          0.10-0.25
//   zucchini / oatmeal / greek yogurt / chobani  0          0.00
//
// The three-brand floor alongside the ratio is what stops a single Open Food
// Facts row branded "Fresh Banana" from turning "banana" into a brand query: a
// one-row pool trivially scores ratio 1.00. A control test pins exactly that,
// and it caught this rule when the floor was missing.
const BRANDED_QUERY_RATIO = 0.5
const BRANDED_QUERY_MIN_BRANDS = 3

export function brandedQuerySignal(candidates, variants) {
  const branded = candidates.filter((c) => c.datasetTier === 'branded')
  if (!branded.length) return { ratio: 0, distinctBrands: 0, isBrandQuery: false }
  const covering = branded.filter((c) => brandCoversQuery(c, variants))
  const distinctBrands = new Set(covering.map((c) => normalizeText(c.brand))).size
  const ratio = covering.length / branded.length
  return { ratio, distinctBrands, isBrandQuery: ratio >= BRANDED_QUERY_RATIO && distinctBrands >= BRANDED_QUERY_MIN_BRANDS }
}

// Query words that exist ONLY as a brand in this result set — no canonical
// whole food in the pool has them in its name. "califia", "justins" and
// "ezekiel" are brand-only; "banana", "almond" and "butter" are not.
//
// Added after the 200-item corpus run showed the mirror image of the defect the
// golden set covers: "justins almond butter" put the generic "Almond butter,
// creamy" at rank 1 and Justin's own jar at rank 11, and "califia farms almond
// milk" did the same — the branded row matched MORE of the query (3 tokens of
// 3, tier 3) yet lost to a generic row matching fewer (tier 4) once the flat
// branded penalty was added. A brand-only word in the query is proof that the
// generic answer is not the thing that was asked for, and it needs no list.
export function brandOnlyQueryTokens(candidates, variants) {
  const genericStems = new Set()
  for (const c of candidates) {
    if (c.datasetTier === 'branded') continue
    for (const t of tokenize(normalizeText(c.name || ''))) genericStems.add(stem(t))
  }
  const queryStems = new Set(variants.flatMap((v) => v.baseTokens).map(stem))
  const out = new Set()
  for (const c of candidates) {
    if (!c.brand) continue
    for (const t of tokenize(normalizeText(c.brand))) {
      const st = stem(t)
      if (queryStems.has(st) && !genericStems.has(st)) out.add(st)
    }
  }
  return out
}

const brandCarriesAny = (candidate, stems) => {
  if (!candidate.brand || !stems.size) return false
  return tokenize(normalizeText(candidate.brand)).some((t) => stems.has(stem(t)))
}

export function scoreCandidate(candidate, queryVariants, { isBrandQuery = false, brandOnlyStems = new Set() } = {}) {
  const variants = queryVariants.map(parseVariant)
  const nameMatch = bestTierAcrossVariants(candidate.name, variants)
  const { nameTokens, nameFacets } = nameMatch
  let { tier, variant } = nameMatch

  // Query-aware branded handling: score the candidate's brand and name TOGETHER
  // as well, and if that reads better AND the brand is what supplied the
  // missing query words, the user named this brand — rank it as the product it
  // is rather than penalizing it for being one.
  let brandedPenalty = candidate.datasetTier === 'branded' ? BRANDED_PENALTY : 0
  if (candidate.brand && candidate.datasetTier === 'branded') {
    const withBrand = bestTierAcrossVariants(`${candidate.brand} ${candidate.name}`, variants)
    const brandStems = new Set(tokenize(normalizeText(candidate.brand)).map(stem))
    const nameStems = new Set(nameTokens.map(stem))
    const brandSuppliedAWord = withBrand.variant.tokens.some((t) => brandStems.has(stem(t)) && !nameStems.has(stem(t)))
    if (withBrand.tier < tier && brandSuppliedAWord) {
      tier = withBrand.tier
      variant = withBrand.variant
      brandedPenalty = BRAND_MATCH_PENALTY
    } else if (isBrandQuery && brandCoversQuery(candidate, variants)) {
      // The query names this brand and the pool agrees the query IS a brand —
      // being branded is the answer, not a fault to be penalized.
      brandedPenalty = BRAND_MATCH_PENALTY
    } else if (brandCarriesAny(candidate, brandOnlyStems)) {
      // The query carries a word that exists only as a brand in this pool, and
      // this candidate is that brand. Penalizing it for being branded would be
      // penalizing it for being the thing that was asked for.
      brandedPenalty = BRAND_MATCH_PENALTY
    }
  }

  let score = tier * 1000 + brandedPenalty

  // The dish/preparation/base-form signals only apply to candidates the tier
  // ladder already treats as BEING the queried food (tier <= 2). Below that the
  // tier gap dominates anyway, and applying a 1800-point dish penalty to a
  // loose tier-3 match would demote real answers for queries that legitimately
  // name a prepared food ("raos marinara" -> "Rao's Homemade Marinara Sauce").
  if (tier <= 2) {
    const queryStems = new Set(variant.tokens.map(stem))
    const unaskedDish = nameTokens.some((t) => inSet(t, DERIVED_FOOD_WORDS) && !queryStems.has(stem(t)))
    if (unaskedDish) score += DISH_PENALTY

    const unaskedPrep = nameTokens.some((t) => inSet(t, PREPARATION_WORDS) && !variant.tokens.includes(t))
    if (unaskedPrep) score += PREP_PENALTY

    if (!variant.qualifiers.length && hasWordFrom(nameTokens, BASE_FORM_WORDS)) score -= BASE_FORM_BONUS

    // Facets beyond the query that are neither a preparation, a base-form
    // marker, nor a dish word (those are already charged above) are extra
    // identity the user did not ask for.
    if (nameFacets.length > 1) {
      const extra = nameFacets.filter((facet) => {
        const t = tokenize(facet).map(stem)
        if (!t.length) return false
        if (t.every((x) => queryStems.has(x))) return false
        return !t.some((x) => inSet(x, PREPARATION_WORDS) || inSet(x, BASE_FORM_WORDS) || inSet(x, DERIVED_FOOD_WORDS))
      })
      score += extra.length * EXTRA_FACET_COST
    }
  }

  score += (NUTRIENT_KEYS.length - completenessCount(candidate)) * 5

  const allQualifiers = new Set(variants.flatMap((v) => v.qualifiers))
  if (allQualifiers.size) {
    const agrees = [...allQualifiers].some((q) => nameTokens.includes(q))
    if (!agrees) score += 3
  }

  const extraTokens = Math.max(0, nameTokens.length - variant.tokens.length)
  score += extraTokens * 0.5

  return score
}

// Sorts by ascending score, then by name. The name comparator is not
// cosmetic: before it, two candidates scoring identically kept whatever order
// the providers returned them in, so rank 1 for "banana" was decided by USDA's
// own listing order ("Banana, baked" ahead of "Banana, raw" — production
// symptom #3). A deterministic, input-order-independent result is a property
// the test suite asserts by shuffling the pool.
export function rankResults(results, queryVariants) {
  const variants = queryVariants.length ? queryVariants : ['']
  // Both signals are properties of the QUERY AND ITS ANSWERS together, so they
  // are computed once over the whole pool rather than per candidate.
  const parsed = variants.map(parseVariant)
  const { isBrandQuery } = brandedQuerySignal(results, parsed)
  const brandOnlyStems = brandOnlyQueryTokens(results, parsed)
  return [...results]
    .map((r) => ({ r, s: scoreCandidate(r, variants, { isBrandQuery, brandOnlyStems }) }))
    .sort((a, b) => a.s - b.s || String(a.r.name || '').localeCompare(String(b.r.name || '')))
    .map((x) => x.r)
}
