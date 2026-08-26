// Query normalization, tokenization, a small synonym layer, and conservative
// typo correction. Pure string functions only — no I/O, fully unit-testable
// without a network call, and everything downstream (retrieval, ranking)
// consumes this module's output rather than the raw user string, so the
// definition of "what the query means" only ever lives in one place.

// Trim, lowercase, Unicode-normalize (NFKD splits a letter from its
// diacritic, e.g. "é" -> "e" + a combining accent) and strip the combining
// marks, then collapse hyphens/underscores/slashes to spaces (so "stir-fry"
// tokenizes the same as "stir fry") and drop remaining punctuation.
export function normalizeText(raw) {
  return String(raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(normalized) {
  return normalized.length ? normalized.split(' ').filter(Boolean) : []
}

// Words that describe FORM, not the food's identity. Recognized so a query
// like "zucchini raw" still matches a candidate named just "Zucchini" (the
// qualifier boosts rank when a candidate agrees with it — see rank.js — it
// never GATES a match), and so they don't get treated as part of the food's
// name when computing token-set equality.
// 'organic' added after a live reproduction during the keystroke-efficiency
// audit (see docs/keystroke-efficiency-audit.md): searching "365 organic
// marinara" (Whole Foods' own house brand) against real USDA data never
// surfaced the actual marinara sauce usably — "Infant formula, organic,
// ready-to-feed" outranked "Sauce, pasta, spaghetti/marinara, ready-to-
// serve" (score 4001.5 vs 4002), because with 'organic' treated as a core
// identity token, BOTH tied at tier 4 purely on sharing that one common
// word, and the tie then broke on shorter-name — rewarding the coincidental
// match over the specific one. Reproduced directly against rank.js with
// those exact two USDA rows before this fix. Same mechanism as the existing
// FORM qualifiers below: 'organic' is a near-universal descriptor across
// USDA/OFF entries (there's no such thing as "organic" identity — a food is
// still itself with or without it), so it belongs in the small
// qualifier-agreement bonus, not in the tokens that decide whether two
// foods are the same food.
export const QUALIFIER_WORDS = new Set([
  'raw', 'cooked', 'fresh', 'frozen', 'grilled', 'canned', 'baked', 'roasted',
  'boiled', 'steamed', 'dried', 'diced', 'sliced', 'whole', 'plain', 'ripe',
  'organic',
])

export function splitQualifiers(tokens) {
  const base = []
  const qualifiers = []
  for (const t of tokens) (QUALIFIER_WORDS.has(t) ? qualifiers : base).push(t)
  return { base, qualifiers }
}

// A SMALL, maintainable table of genuinely equivalent food names — regional
// or language variants of the SAME food (zucchini/courgette), not a general
// thesaurus. Bidirectional: naming any member of a group returns every OTHER
// member as a variant to also try. This is intentionally short; it exists to
// cover the common cases a user would reasonably expect to just work, not to
// be an exhaustive food ontology.
export const SYNONYM_GROUPS = [
  ['zucchini', 'courgette'],
  ['eggplant', 'aubergine'],
  ['cilantro', 'coriander'],
  ['garbanzo bean', 'garbanzo beans', 'chickpea', 'chickpeas'],
  ['scallion', 'scallions', 'spring onion', 'spring onions', 'green onion', 'green onions'],
  ['coke', 'coca cola', 'coca-cola'],
  ['soda', 'pop', 'soft drink'],
  ['yogurt', 'yoghurt'],
  // USDA's own canonical generic name for the product is "Oats" (dry) — a
  // real gap caught by testing "oatmeal" against real provider data: without
  // this pair, "oatmeal" has no textual relation at all to "Oats" (they
  // don't share a prefix or a small edit distance), so the generic result
  // scored WORSE than an unrelated branded "Oatmeal Squares" product.
  ['oatmeal', 'oats'],
  ['arugula', 'rocket'],
  ['shrimp', 'shrimps', 'prawn', 'prawns'],
  ['bell pepper', 'bell peppers', 'capsicum', 'capsicums'],
  ['ground beef', 'minced beef', 'beef mince'],
  // No 'french fries' <-> 'chips' pair: synonymVariants substitutes ANY
  // single token anywhere in a query, so this pair (a real regional synonym
  // for bare "chips") ALSO fired on every "___ chips" compound noun where
  // "chips" means an entirely different food (tortilla chips, potato chips,
  // kale chips) -- reproduced live 26 Aug 2026: "siete tortilla chips"
  // spun off "siete tortilla french fries" as an equally-tried variant,
  // flooding results with unrelated fast-food fries. The per-token
  // substitution mechanism has no way to scope a pair to bare single-word
  // queries only, so this one is dropped rather than special-cased.
  ['cookie', 'cookies', 'biscuit', 'biscuits'],
  ['fizzy drink', 'carbonated drink', 'soda'],
]

const SYNONYM_MAP = (() => {
  const m = new Map()
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      const others = group.filter((t) => t !== term)
      m.set(term, [...(m.get(term) || []), ...others])
    }
  }
  return m
})()

// Alternate normalized query strings worth also trying — e.g. "zucchini"
// also tries "courgette". Both a whole-query match ("coca cola" -> "coke")
// and a single-token swap within a longer query are supported.
export function synonymVariants(normalized) {
  const variants = new Set()
  if (SYNONYM_MAP.has(normalized)) {
    for (const alt of SYNONYM_MAP.get(normalized)) variants.add(alt)
  }
  const tokens = tokenize(normalized)
  for (let i = 0; i < tokens.length; i++) {
    const alts = SYNONYM_MAP.get(tokens[i])
    if (!alts) continue
    for (const alt of alts) {
      variants.add([...tokens.slice(0, i), alt, ...tokens.slice(i + 1)].join(' '))
    }
  }
  variants.delete(normalized)
  return [...variants]
}

// Levenshtein edit distance. Inputs here are always short query/vocabulary
// terms, so the classic O(len(a)*len(b)) DP table is plenty fast — this is
// never run against a large corpus, only against a short fixed vocabulary
// (see correctTypo) or between two already-short strings (see rank.js).
export function editDistance(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev = curr
  }
  return prev[n]
}

// A small vocabulary of common food TERMS (no nutrition data attached — this
// is spelling-correction only) used to conservatively correct an apparent
// typo. Conservative on purpose: a query is only corrected when it is close
// to EXACTLY ONE vocabulary term (ties are left uncorrected, matching the
// spec's "typo-tolerant but conservative enough that a query doesn't return
// unrelated foods above the right one" — guessing wrong here is worse than
// not guessing) and only when it isn't already an exact vocabulary hit.
export const COMMON_FOOD_TERMS = [
  'zucchini', 'courgette', 'banana', 'bananas', 'oatmeal', 'chicken', 'chicken breast',
  'yogurt', 'yoghurt', 'greek yogurt', 'broccoli', 'spinach', 'avocado', 'almond', 'almonds',
  'salmon', 'tuna', 'rice', 'quinoa', 'lentils', 'chickpeas', 'blueberry', 'blueberries',
  'strawberry', 'strawberries', 'potato', 'potatoes', 'sweet potato', 'tomato', 'tomatoes',
  'cucumber', 'lettuce', 'spaghetti', 'pasta', 'bread', 'cheese', 'butter', 'eggplant',
  'cauliflower', 'asparagus', 'mushroom', 'mushrooms', 'peanut butter', 'coca cola', 'coke',
  'apple', 'apples', 'orange', 'oranges', 'carrot', 'carrots', 'onion', 'onions', 'garlic',
  'egg', 'eggs', 'milk', 'oats', 'walnut', 'walnuts', 'turkey', 'shrimp', 'beef', 'pork',
]

export function correctTypo(normalized) {
  if (!normalized || COMMON_FOOD_TERMS.includes(normalized)) return null
  const maxDist = normalized.length > 6 ? 2 : 1
  let best = null
  let bestDist = Infinity
  let tiesAtBest = 0
  for (const term of COMMON_FOOD_TERMS) {
    const d = editDistance(normalized, term)
    if (d > maxDist) continue
    if (d < bestDist) { best = term; bestDist = d; tiesAtBest = 1 }
    else if (d === bestDist && term !== best) tiesAtBest++
  }
  return tiesAtBest === 1 ? best : null
}

// Full parse of one user query: everything both the retrieval layer (which
// alternate strings to also query) and the ranking layer (what "matches"
// means) need, computed once.
export function parseQuery(raw) {
  const normalized = normalizeText(raw)
  const tokens = tokenize(normalized)
  const { base, qualifiers } = splitQualifiers(tokens)
  const variants = normalized ? synonymVariants(normalized) : []
  const corrected = normalized ? correctTypo(normalized) : null
  return { raw, normalized, tokens, baseTokens: base, qualifiers, variants, corrected }
}
