import { describe, it, expect } from 'vitest'
import { bestTierAcrossVariants, scoreCandidate, rankResults } from '../server/foodSearch/rank.js'
import { normalizeText, tokenize, splitQualifiers } from '../server/foodSearch/normalize.js'

// Mirror rank.js's internal parseVariant via normalize.js's own public API —
// bestTierAcrossVariants takes pre-parsed variants, so build them the same
// way rank.js does internally for these focused tier tests.
function parseVariant(str) {
  const normalized = normalizeText(str)
  const tokens = tokenize(normalized)
  const { base, qualifiers } = splitQualifiers(tokens)
  return { normalized, tokens, baseTokens: base, qualifiers }
}

describe('bestTierAcrossVariants', () => {
  it('tier 0: exact normalized match', () => {
    expect(bestTierAcrossVariants('Zucchini', [parseVariant('zucchini')]).tier).toBe(0)
  })
  it('tier 1: same tokens, different order', () => {
    expect(bestTierAcrossVariants('Breast, Chicken', [parseVariant('chicken breast')]).tier).toBe(1)
  })
  it('tier 2: candidate name starts with the query', () => {
    expect(bestTierAcrossVariants('Zucchini Bio', [parseVariant('zucchini')]).tier).toBe(2)
  })
  it('tier 2: candidate\'s base tokens start with the query\'s base tokens (qualifier in query, absent from name)', () => {
    expect(bestTierAcrossVariants('Zucchini', [parseVariant('zucchini raw')]).tier).toBe(2)
  })
  it('tier 3: every query token present somewhere in the name, out of prefix position', () => {
    expect(bestTierAcrossVariants('Organic Greek Yogurt Plain', [parseVariant('greek yogurt')]).tier).toBe(3)
  })
  it('tier 4: a single-letter typo in the candidate name, not the query', () => {
    expect(bestTierAcrossVariants('Zuchini Chips', [parseVariant('zucchini')]).tier).toBe(4)
  })
  it('tier 5: no textual relation between query and name at all', () => {
    expect(bestTierAcrossVariants('Borlotti Beans', [parseVariant('zucchini')]).tier).toBe(5)
  })
  it('takes the BEST tier across multiple variants (a synonym query rescues an otherwise-tier-5 candidate)', () => {
    const variants = [parseVariant('zucchini'), parseVariant('courgette')]
    const r = bestTierAcrossVariants('Courgettes en rondelles', variants)
    expect(r.tier).toBeLessThanOrEqual(3) // matches well under the "courgette" variant
  })
  it('"organic" alone is NOT enough for a tier <= 4 match — it is a qualifier, not an identity token (see rank.js scoreCandidate test for the live-reproduced bug this guards)', () => {
    const r = bestTierAcrossVariants('Infant formula, organic, ready-to-feed', [parseVariant('365 organic marinara')])
    expect(r.tier).toBe(5)
  })
})

describe('scoreCandidate', () => {
  const base = { name: 'Zucchini', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3 }

  it('a better tier always outranks a worse tier regardless of other factors', () => {
    const exact = { ...base, name: 'Zucchini' }
    const branded = { ...base, name: 'Zucchini Chips Deluxe Brand', datasetTier: 'branded' }
    expect(scoreCandidate(exact, ['zucchini'])).toBeLessThan(scoreCandidate(branded, ['zucchini']))
  })

  it('within the same tier, a non-branded candidate outranks a branded one', () => {
    const generic = { ...base, name: 'Zucchini', datasetTier: 'generic' }
    const branded = { ...base, name: 'Zucchini', datasetTier: 'branded' }
    expect(scoreCandidate(generic, ['zucchini'])).toBeLessThan(scoreCandidate(branded, ['zucchini']))
  })

  it('within the same tier, more complete nutrition data outranks missing data', () => {
    const complete = { ...base }
    const incomplete = { name: 'Zucchini', calories: 17, protein_g: null, carbs_g: null, fat_g: null }
    expect(scoreCandidate(complete, ['zucchini'])).toBeLessThan(scoreCandidate(incomplete, ['zucchini']))
  })

  it('a qualifier-agreeing name outranks a qualifier-silent one at the same tier', () => {
    const raw = { ...base, name: 'Zucchini Raw' }
    const plain = { ...base, name: 'Zucchini Bio' }
    // Both are tier 2 (prefix) for query "zucchini raw"; "raw" agreement wins.
    expect(scoreCandidate(raw, ['zucchini raw'])).toBeLessThan(scoreCandidate(plain, ['zucchini raw']))
  })

  it('a shorter, cleaner name outranks a longer one at the same tier (generic-over-compound proxy)', () => {
    const short = { ...base, name: 'Zucchini' }
    const long = { ...base, name: 'Zucchini Organic Fresh Value Pack' }
    expect(scoreCandidate(short, ['zucchini'])).toBeLessThan(scoreCandidate(long, ['zucchini']))
  })

  // Real, reproduced bug (26 Aug 2026): a Branded product's OWN description
  // sometimes exactly equals a bare query word while being a totally
  // different food (a peanut-butter spread literally named "BANANA", onion
  // BREAD, orange Jell-O, a taco-seasoning "TOMATO"). A tier-0 exact match
  // used to always win regardless of dataset, burying the correct generic
  // answer (typically tier 2, a prefix match) several places down.
  it('a near-exact generic match outranks an exact-match branded product that is a different food', () => {
    const wrongExactBranded = { ...base, name: 'Banana', datasetTier: 'branded', calories: 312 } // real: a peanut-butter spread
    const correctGeneric = { ...base, name: 'Bananas, raw', datasetTier: 'generic', calories: 89 }
    expect(scoreCandidate(correctGeneric, ['banana'])).toBeLessThan(scoreCandidate(wrongExactBranded, ['banana']))
  })

  it('an exact-match branded product still beats a WEAK (non-prefix) generic match', () => {
    const exactBranded = { ...base, name: 'Banana', datasetTier: 'branded' }
    const weakGeneric = { ...base, name: 'Fruit medley with banana pieces', datasetTier: 'generic' } // tier 3 (phrase), not a prefix
    expect(scoreCandidate(exactBranded, ['banana'])).toBeLessThan(scoreCandidate(weakGeneric, ['banana']))
  })

  // Real, reproduced bug (26 Aug 2026, found during the keystroke-efficiency
  // audit — see docs/keystroke-efficiency-audit.md): searching "365 organic
  // marinara" (Whole Foods' own house brand) against live USDA data never
  // surfaced an actual marinara sauce usably. Before 'organic' joined
  // QUALIFIER_WORDS, it counted as a core identity token, so "Infant
  // formula, organic, ready-to-feed" tied at tier 4 with "Sauce, pasta,
  // spaghetti/marinara, ready-to-serve" purely on sharing that one common
  // word — and the tie then broke on shorter-name, scoring the infant
  // formula (4001.5) ahead of the actual marinara sauce (4002). These are
  // the exact two rows captured live.
  it('"organic" alone does not manufacture a tie with an unrelated product (365 organic marinara)', () => {
    const unrelated = { ...base, name: 'Infant formula, organic, ready-to-feed', datasetTier: 'generic', calories: 60, protein_g: 1, carbs_g: 8, fat_g: 3 }
    const correct = { ...base, name: 'Sauce, pasta, spaghetti/marinara, ready-to-serve', datasetTier: 'generic', calories: 45, protein_g: 1.5, carbs_g: 7, fat_g: 1.5 }
    expect(scoreCandidate(correct, ['365 organic marinara'])).toBeLessThan(scoreCandidate(unrelated, ['365 organic marinara']))
  })
})

describe('rankResults', () => {
  it('reproduces the real "zucchini" failure case correctly: the on-topic generic result outranks branded noise', () => {
    const results = [
      { name: 'Courgettes-Tomates cerises Cuisinées', calories: 37, protein_g: 1, carbs_g: 3.2, fat_g: 1.9, datasetTier: 'branded' },
      { name: 'veggie mix zucchini & bulgur', calories: 90, protein_g: 3, carbs_g: 15, fat_g: 2, datasetTier: 'branded' },
      { name: 'Zucchini Bio', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3, datasetTier: 'branded' },
      { name: 'Borlotti Beans', calories: null, protein_g: 8, carbs_g: 20, fat_g: 0.5, datasetTier: 'branded' },
      { name: 'Waffle', calories: 160, protein_g: 4, carbs_g: 20, fat_g: 7, datasetTier: 'branded' },
    ]
    const ranked = rankResults(results, ['zucchini', 'courgette'])
    expect(ranked[0].name).toBe('Zucchini Bio')
    expect(ranked.map((r) => r.name)).not.toContain(undefined)
    // The wholly-unrelated "Waffle" and "Borlotti Beans" must not outrank the
    // on-topic zucchini results.
    const waffleIdx = ranked.findIndex((r) => r.name === 'Waffle')
    const zucchiniIdx = ranked.findIndex((r) => r.name === 'Zucchini Bio')
    expect(zucchiniIdx).toBeLessThan(waffleIdx)
  })

  it('a fuzzy typo match never outranks an exact match for the corrected term', () => {
    const results = [
      { name: 'Zuchini Chips (typo in the product name itself)', calories: 500, protein_g: 5, carbs_g: 60, fat_g: 25 },
      { name: 'Zucchini', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3 },
    ]
    const ranked = rankResults(results, ['zucchini'])
    expect(ranked[0].name).toBe('Zucchini')
  })

  it('is stable: equal-score candidates keep their original relative order', () => {
    const results = [
      { name: 'Banana', calories: 89, protein_g: 1, carbs_g: 23, fat_g: 0.3 },
      { name: 'Banana', calories: 90, protein_g: 1, carbs_g: 23, fat_g: 0.3 },
    ]
    const ranked = rankResults(results, ['banana'])
    expect(ranked[0].calories).toBe(89)
  })

  it('handles an empty results array (control)', () => {
    expect(rankResults([], ['zucchini'])).toEqual([])
  })
})
