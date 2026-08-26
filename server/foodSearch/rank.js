// Relevance ranking for search results — the piece that decides which of
// several real candidates (all genuinely returned by a provider) is shown
// FIRST. Pure functions only, no I/O, fully unit-testable against
// hand-built candidate lists.
//
// A candidate is scored against every "variant" of the user's query (the
// original plus any synonym/typo alternates — see normalize.js) and takes
// whichever variant scores it best, so a result found only via a synonym
// query (e.g. an OFF product named "Courgettes...") is judged as a match
// for THAT term, not penalized for not containing the original word.
import { normalizeText, tokenize, splitQualifiers, editDistance } from './normalize.js'

// Lower tier = better match. Computed against one query variant's own
// {tokens, baseTokens, qualifiers}.
//   0 — candidate name normalizes to exactly the query
//   1 — candidate's own (non-qualifier) tokens are exactly the query's base
//       tokens, in any order (e.g. "chicken breast" vs "breast, chicken")
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
function tierFor(nameTokens, nameNormalized, variant) {
  const { normalized, tokens, baseTokens } = variant
  if (!normalized) return 5
  if (nameNormalized === normalized) return 0

  const sortedName = [...nameTokens].sort()
  const sortedQuery = [...tokens].sort()
  if (tokens.length && sortedName.length === sortedQuery.length && sortedName.every((t, i) => t === sortedQuery[i])) return 1

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
  let best = 5
  let bestVariant = variants[0]
  for (const v of variants) {
    const t = tierFor(nameTokens, nameNormalized, v)
    if (t < best) { best = t; bestVariant = v }
    if (best === 0) break
  }
  return { tier: best, variant: bestVariant, nameTokens, nameNormalized }
}

const NUTRIENT_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g']
function completenessCount(candidate) {
  return NUTRIENT_KEYS.filter((k) => candidate[k] != null).length
}

// A single numeric score, lower = better — combines the tier (dominant
// signal) with secondary tie-breakers: prefer a non-branded dataset when
// the source distinguishes one (USDA's Foundation/SR Legacy/Survey vs.
// Branded — see providers.js), prefer more complete nutrition data, prefer
// a name that agrees with any form qualifier the user typed (a candidate
// named "raw" ranks slightly ahead of one that doesn't when the user asked
// for "raw"), and prefer a shorter name (fewer extra tokens beyond the
// query) as a proxy for "the base food, not a compound branded product."
// A Branded product's OWN description sometimes exactly equals a bare query
// word while being a completely different food — reproduced live 26 Aug 2026:
// searching "banana" surfaces a peanut-butter spread literally named
// "BANANA" (tier 0); "onion" surfaces onion BREAD (foodCategory "Breads &
// Buns"); "orange" surfaces orange-flavored Jell-O; "tomato" surfaces a taco-
// seasoning mix. A flat +40 branded penalty can never outweigh the ×1000
// tier gap, so these wrong exact matches always buried the correct generic
// answer ("Bananas, raw" etc., typically tier 2 — a prefix match) several
// places down. BRANDED_PENALTY bridges exactly the tier-0-to-tier-2 gap
// (2000) with margin, so a near-exact-or-better generic/Foundation
// candidate (tier <= 2) now outranks an exact-match Branded one — but a
// Branded exact match still beats a WEAK generic match (tier >= 3, where the
// gap this penalty doesn't bridge), and two same-tier candidates still
// resolve by tier first, this penalty second, exactly as before.
const BRANDED_PENALTY = 2500

export function scoreCandidate(candidate, queryVariants) {
  const variants = queryVariants.map(parseVariant)
  const { tier, variant, nameTokens } = bestTierAcrossVariants(candidate.name, variants)

  let score = tier * 1000

  if (candidate.datasetTier === 'branded') score += BRANDED_PENALTY

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

// Sorts (stable — ties keep each source's own original relative order,
// which is still the best signal available once every other factor is
// equal) by ascending score. `queryVariants` should include the primary
// query string itself.
export function rankResults(results, queryVariants) {
  const variants = queryVariants.length ? queryVariants : ['']
  return [...results]
    .map((r) => ({ r, s: scoreCandidate(r, variants) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.r)
}
