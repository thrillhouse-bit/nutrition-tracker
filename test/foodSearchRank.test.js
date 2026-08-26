import { describe, it, expect } from 'vitest'
import { bestTierAcrossVariants, scoreCandidate, rankResults, brandOnlyQueryTokens, brandedQuerySignal } from '../server/foodSearch/rank.js'
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

// ---------------------------------------------------------------------------
// GOLDEN SET, 26 Aug 2026 — ranked against REAL provider rows (captured live,
// pinned in test/fixtures/liveFoodRows.js, regenerable with
// scripts/food-search-eval/capture-fixtures.mjs). Every one of these FAILED
// against the pre-overhaul ranker on this exact data; the live top-1 it
// produced is quoted in each case. A failure here is a blocking failure, not a
// statistic — an exact generic query MUST return the canonical generic food.
// ---------------------------------------------------------------------------
import { LIVE_ROWS } from './fixtures/liveFoodRows.js'
import { parseQuery } from '../server/foodSearch/normalize.js'

// Merge the three real provider pools exactly as server/foodSearch/index.js
// does, then rank with the same variant list it builds.
function rankLive(query) {
  const rows = LIVE_ROWS[query]
  if (!rows) throw new Error(`no captured rows for "${query}"`)
  const parsed = parseQuery(query)
  const merged = [...rows.usdaGeneric, ...rows.usdaBranded, ...rows.off]
  const variants = [parsed.normalized, ...parsed.variants, ...(parsed.corrected ? [parsed.corrected] : [])]
  return rankResults(merged, variants)
}

const DISH_WORDS = /\b(bread|muffin|cake|cupcake|cookie|cookies|cracker|crackers|pie|pudding|split|nectar|juice|chips|dressing|sauce|soup|salad|sandwich|roll|syrup|candy|candies|snack|snacks|smoothie|dip|spread|oil|jerky|loaf|lunchmeat|gelato|ice cream|frozen yogurt|guacamole|sushi|fried|powder)\b/i

// Each golden food: what rank 1 MUST look like, and what the pre-overhaul
// ranker actually produced on this same captured data.
const GOLDEN = [
  { q: 'zucchini',       must: /zucchini/i,      base: /\braw\b/i,          was: 'ZUCCHINI (KMB, LLC) / Zucchini, pickled' },
  { q: 'banana',         must: /banana/i,        base: /\braw\b/i,          was: 'Banana, baked (161 kcal)', notAlso: /pepper|melon/i },
  { q: 'avocado',        must: /avocado/i,       base: /\braw\b/i,          was: 'Avocado dressing (427 kcal)' },
  { q: 'chicken breast', must: /chicken.*breast|breast.*chicken/i, base: /\braw\b/i, was: 'CHICKEN BREAST (Giant Eagle, Inc.)' },
  { q: 'oatmeal',        must: /oatmeal|oats/i,  base: /\b(nfs|plain)\b/i,  was: 'Oatmeal, multigrain' },
  { q: 'salmon',         must: /salmon/i,        base: /\b(nfs|raw)\b/i,    was: 'SALMON (High Liner Foods)' },
  { q: 'peanut butter',  must: /peanut butter/i, base: /^peanut butter\b/i, was: 'PEANUT BUTTER (Reginald\'s Homemade, 600 kcal)' },
  { q: 'greek yogurt',   must: /greek/i,         base: /\bplain\b/i,        was: 'GREEK YOGURT (Ocean Spray, 467 kcal)' },
]

describe('rankResults: golden set — an exact generic query returns the canonical generic food at rank 1', () => {
  for (const { q, must, base, was, notAlso } of GOLDEN) {
    it(`"${q}" ranks a canonical generic food first (was: ${was})`, () => {
      const top = rankLive(q)[0]
      expect(top, `no results at all for "${q}"`).toBeTruthy()
      expect(top.datasetTier, `top result for "${q}" is ${top.name} [${top.brand}]`).toBe('generic')
      expect(top.name, `top result for "${q}" is ${top.name}`).toMatch(must)
      expect(top.name, `top result for "${q}" is ${top.name} — not a base form`).toMatch(base)
      expect(top.name, `top result for "${q}" is a prepared dish: ${top.name}`).not.toMatch(DISH_WORDS)
      if (notAlso) expect(top.name).not.toMatch(notAlso)
    })
  }

  it('the canonical answer is not merely present — it beats every branded row with the bare query as its whole name', () => {
    // "ZUCCHINI" (KMB, LLC) is a real live row whose entire description IS the
    // query, i.e. a tier-0 exact match. The canonical USDA row is
    // "Squash, summer, green, zucchini, includes skin, raw" — a tier-3 match
    // under the pre-overhaul ladder. This is production symptom #4.
    const ranked = rankLive('zucchini')
    const kmb = ranked.findIndex((f) => f.brand === 'KMB, LLC')
    const canonical = ranked.findIndex((f) => f.datasetTier === 'generic' && /zucchini/i.test(f.name) && /\braw\b/i.test(f.name))
    expect(canonical).toBeGreaterThanOrEqual(0)
    expect(kmb).toBeGreaterThanOrEqual(0) // the branded row is still THERE, just not first
    expect(canonical).toBeLessThan(kmb)
  })

  it('a derived product never outranks the base food it is derived from', () => {
    const ranked = rankLive('banana')
    const raw = ranked.findIndex((f) => /banana/i.test(f.name) && /\braw\b/i.test(f.name) && !/pepper|melon/i.test(f.name))
    const chips = ranked.findIndex((f) => /banana chips/i.test(f.name))
    const baked = ranked.findIndex((f) => /banana, baked/i.test(f.name))
    expect(raw).toBeGreaterThanOrEqual(0)
    expect(chips).toBeGreaterThan(raw)
    expect(baked).toBeGreaterThan(raw)
  })
})

describe('rankResults: branded intent is preserved, not sacrificed to the generic fix', () => {
  it('"chobani vanilla" ranks a Chobani vanilla product first', () => {
    // The control for the golden set above: a gate that only ever prefers
    // generic foods is indistinguishable from a wall. This query names a
    // brand, and the answer must respect that.
    const top = rankLive('chobani vanilla')[0]
    const hay = `${top.name} ${top.brand || ''}`.toLowerCase()
    expect(hay, `top result was ${top.name} [${top.brand}]`).toMatch(/chobani/)
    expect(hay).toMatch(/vanilla/)
  })

  it('"chobani vanilla" does NOT return a generic vanilla dessert first', () => {
    const top = rankLive('chobani vanilla')[0]
    expect(top.name).not.toMatch(/gelato|ice cream|wafer|pie|cookie/i)
  })

  it('an exactly-named branded product still wins when the query names it and no generic food matches', () => {
    const ranked = rankResults([
      { name: 'Squash, summer, green, zucchini, includes skin, raw', datasetTier: 'generic', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3 },
      { name: 'Rao\'s Homemade Marinara Sauce', brand: "Rao's Homemade", datasetTier: 'branded', calories: 100, protein_g: 2, carbs_g: 8, fat_g: 7 },
    ], ['raos marinara'])
    expect(ranked[0].brand).toBe("Rao's Homemade")
  })
})

describe('rankResults: qualifiers and brand words are handled deliberately', () => {
  const pool = [
    { name: 'Bananas, raw', datasetTier: 'generic', calories: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3 },
    { name: 'Bananas, dehydrated, or banana powder', datasetTier: 'generic', calories: 346, protein_g: 3.9, carbs_g: 88.3, fat_g: 1.8 },
    { name: 'Banana, baked', datasetTier: 'generic', calories: 161, protein_g: 1.5, carbs_g: 40, fat_g: 0.4 },
  ]

  it('a bare query prefers the BASE form over any prepared form', () => {
    expect(rankResults(pool, ['banana'])[0].name).toBe('Bananas, raw')
  })

  it('CONTROL: asking for the prepared form gets the prepared form', () => {
    expect(rankResults(pool, ['banana baked'])[0].name).toBe('Banana, baked')
  })

  it('"organic" stays a qualifier, not an identity token (regression on the prior audit\'s fix)', () => {
    const ranked = rankResults([
      { name: 'Infant formula, organic, ready-to-feed', datasetTier: 'generic', calories: 66, protein_g: 1.4, carbs_g: 7.2, fat_g: 3.5 },
      { name: 'Sauce, pasta, spaghetti/marinara, ready-to-serve', datasetTier: 'generic', calories: 60, protein_g: 1.6, carbs_g: 9.1, fat_g: 1.8 },
    ], ['365 organic marinara'])
    expect(ranked[0].name).toMatch(/marinara/)
  })

  it('a form qualifier in the query is honoured across the whole set (raw vs cooked)', () => {
    const p = [
      { name: 'Squash, summer, zucchini, includes skin, cooked, boiled, drained', datasetTier: 'generic', calories: 15, protein_g: 1.1, carbs_g: 2.7, fat_g: 0.2 },
      { name: 'Squash, summer, green, zucchini, includes skin, raw', datasetTier: 'generic', calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_g: 0.3 },
    ]
    expect(rankResults(p, ['zucchini cooked'])[0].name).toMatch(/cooked/)
    expect(rankResults(p, ['zucchini raw'])[0].name).toMatch(/raw/)
  })

  it('a brand word in the query does not demote that brand (no blanket branded penalty when the brand was asked for)', () => {
    const p = [
      { name: 'Yogurt, Greek, plain, nonfat', datasetTier: 'generic', calories: 59, protein_g: 10.2, carbs_g: 3.6, fat_g: 0.4 },
      { name: 'Vanilla Blended Greek Yogurt', brand: 'Chobani', datasetTier: 'branded', calories: 120, protein_g: 12, carbs_g: 16, fat_g: 0 },
    ]
    expect(rankResults(p, ['chobani vanilla'])[0].brand).toBe('Chobani')
    // ...and the control: with no brand named, the generic wins again.
    expect(rankResults(p, ['greek yogurt'])[0].datasetTier).toBe('generic')
  })
})

describe('rankResults: the winner does not depend on the order providers happened to return rows', () => {
  // RC-11. "Banana, baked" and "Banana, raw" both scored EXACTLY 2000.5 under
  // the pre-overhaul scorer (tier 2, generic, 4/4 nutrients, 1 extra token),
  // so the stable sort handed rank 1 to whichever USDA listed first. Measured
  // live: "Banana, baked" (161 kcal) at rank 1, "Banana, raw" at rank 2.
  const shuffles = [
    (a) => a,
    (a) => [...a].reverse(),
    (a) => [a[a.length - 1], ...a.slice(0, -1)],
  ]

  for (const q of ['zucchini', 'banana', 'avocado', 'oatmeal', 'salmon', 'greek yogurt', 'chicken breast', 'peanut butter']) {
    it(`"${q}" picks the same rank-1 result whatever order the pool arrives in`, () => {
      const rows = LIVE_ROWS[q]
      const parsed = parseQuery(q)
      const variants = [parsed.normalized, ...parsed.variants, ...(parsed.corrected ? [parsed.corrected] : [])]
      const pool = [...rows.usdaGeneric, ...rows.usdaBranded, ...rows.off]
      const winners = new Set(shuffles.map((s) => rankResults(s(pool), variants)[0].name))
      expect([...winners], `rank 1 changed with input order: ${[...winners].join(' vs ')}`).toHaveLength(1)
    })
  }
})

describe('rankResults: a query word that exists only as a BRAND is not a generic query', () => {
  // Found by the 200-item corpus run, and it is the mirror image of the defect
  // the golden set covers: "justins almond butter" put the generic
  // "Almond butter, creamy" at rank 1 and Justin's own jar at rank 11, because
  // the branded row matched MORE of the query (3 tokens of 3, tier 3) but lost
  // to a generic row matching fewer (tier 4) once the flat branded penalty was
  // added. "justins" appears in no canonical food's name — that is the proof
  // the generic answer is not what was asked for, and it needs no brand list.
  const POOL = [
    { name: 'Almond butter, creamy', datasetTier: 'generic', calories: 614, protein_g: 21, carbs_g: 19, fat_g: 56 },
    { name: 'Almond butter, plain, with salt added', datasetTier: 'generic', calories: 614, protein_g: 21, carbs_g: 19, fat_g: 56 },
    { name: "Justin's Classic Almond Butter", brand: "Justin's", datasetTier: 'branded', calories: 190, protein_g: 7, carbs_g: 6, fat_g: 17 },
  ]

  it('"justins almond butter" ranks the brand\'s own jar first', () => {
    expect(rankResults(POOL, ['justins almond butter'])[0].brand).toBe("Justin's")
  })

  it('CONTROL: "almond butter" with no brand word still ranks the canonical generic first', () => {
    const top = rankResults(POOL, ['almond butter'])[0]
    expect(top.datasetTier).toBe('generic')
    expect(top.name).toMatch(/almond butter/i)
  })

  it('CONTROL: a brand word that a canonical food also uses grants no relief', () => {
    // "banana" is a food word, not a brand word, even though a real Open Food
    // Facts row is branded "Fresh Banana". A generic candidate's name carries
    // it, so it is not brand-only and the branded penalty stands.
    const pool = [
      { name: 'Bananas, raw', datasetTier: 'generic', calories: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3 },
      { name: 'Banana', brand: 'Fresh Banana', datasetTier: 'branded', calories: 95, protein_g: 1, carbs_g: 23, fat_g: 0.3 },
    ]
    expect(rankResults(pool, ['banana'])[0].datasetTier).toBe('generic')
  })

  it('brandOnlyQueryTokens names exactly the words no canonical food in the pool uses', () => {
    const variants = [parseQuery('justins almond butter')].map((p) => ({
      normalized: p.normalized, tokens: p.tokens, baseTokens: p.baseTokens, qualifiers: p.qualifiers,
    }))
    const stems = brandOnlyQueryTokens(POOL, variants)
    expect([...stems]).toEqual(['justin'])
  })
})

describe('rankResults: a query word that exists only as a BRAND is not a generic query', () => {
  // The mirror image of the golden set, found by the 200-item corpus run:
  // "justins almond butter" put the generic "Almond butter, creamy" at rank 1
  // and Justin's own jar at rank 11, and "califia farms almond milk" did the
  // same. The branded row matched MORE of the query (3 tokens of 3, tier 3)
  // yet lost to a generic row matching fewer (tier 4) once the flat branded
  // penalty was added. "justins" appears in no canonical food's name — that is
  // the proof the generic answer is not what was asked for.
  const POOL = [
    { name: 'Almond butter, creamy', datasetTier: 'generic', calories: 614, protein_g: 21, carbs_g: 19, fat_g: 56 },
    { name: 'Almond butter, plain, with salt added', datasetTier: 'generic', calories: 614, protein_g: 21, carbs_g: 19, fat_g: 56 },
    { name: "Justin's Classic Almond Butter", brand: "Justin's", datasetTier: 'branded', calories: 190, protein_g: 7, carbs_g: 6, fat_g: 17 },
  ]
  const asVariants = (q) => { const p = parseQuery(q); return [{ normalized: p.normalized, tokens: p.tokens, baseTokens: p.baseTokens, qualifiers: p.qualifiers }] }

  it('"justins almond butter" ranks the brand\'s own jar first', () => {
    expect(rankResults(POOL, ['justins almond butter'])[0].brand).toBe("Justin's")
  })

  it('CONTROL: "almond butter" with no brand word still ranks the canonical generic first', () => {
    const top = rankResults(POOL, ['almond butter'])[0]
    expect(top.datasetTier).toBe('generic')
    expect(top.name).toMatch(/almond butter/i)
  })

  it('brandOnlyQueryTokens names exactly the words no canonical food in the pool uses', () => {
    expect([...brandOnlyQueryTokens(POOL, asVariants('justins almond butter'))]).toEqual(['justin'])
    expect([...brandOnlyQueryTokens(POOL, asVariants('almond butter'))]).toEqual([])
  })
})

describe('rankResults: "is the query a brand name?" needs more than one branded row to say yes', () => {
  // This control caught the rule when it was ratio-only. A pool containing ONE
  // branded row whose brand happens to include the food word scores ratio 1.00,
  // which turned "banana" into a brand query and put a barcoded packet above
  // "Bananas, raw". The measured separation (live, 26 Aug 2026) is in distinct
  // brands as well as share: coca cola 4 brands / 0.84, everything else <= 2
  // brands / <= 0.25.
  const ONE_BRANDED_ROW = [
    { name: 'Bananas, raw', datasetTier: 'generic', calories: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3 },
    { name: 'Banana', brand: 'Fresh Banana', datasetTier: 'branded', calories: 95, protein_g: 1, carbs_g: 23, fat_g: 0.3 },
  ]
  const MANY_BRANDS = [
    { name: 'Beverages, COCA-COLA, POWERADE, lemon-lime flavored, ready-to-drink', datasetTier: 'generic', calories: 32, protein_g: 0, carbs_g: 8, fat_g: 0 },
    { name: 'Coca Cola', brand: 'Coca-Cola', datasetTier: 'branded', calories: 42, protein_g: 0, carbs_g: 10.6, fat_g: 0 },
    { name: 'Coca Cola Zero', brand: 'Coke Zero', datasetTier: 'branded', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    { name: 'Coca-Cola Classic', brand: 'Coca Cola USA Operations', datasetTier: 'branded', calories: 39, protein_g: 0, carbs_g: 10, fat_g: 0 },
    { name: 'Diet Coca Cola', brand: 'Coca-Cola Company', datasetTier: 'branded', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  ]
  const asVariants = (q) => { const p = parseQuery(q); return [{ normalized: p.normalized, tokens: p.tokens, baseTokens: p.baseTokens, qualifiers: p.qualifiers }] }

  it('CONTROL: one branded row scoring ratio 1.00 is NOT a brand query', () => {
    const sig = brandedQuerySignal(ONE_BRANDED_ROW, asVariants('banana'))
    expect(sig.ratio).toBe(1)
    expect(sig.distinctBrands).toBe(1)
    expect(sig.isBrandQuery).toBe(false)
    expect(rankResults(ONE_BRANDED_ROW, ['banana'])[0].datasetTier).toBe('generic')
  })

  it('several distinct brands carrying the whole query IS a brand query', () => {
    const sig = brandedQuerySignal(MANY_BRANDS, asVariants('coca cola'))
    expect(sig.distinctBrands).toBeGreaterThanOrEqual(3)
    expect(sig.isBrandQuery).toBe(true)
  })

  it('and it puts the actual Coke above the generic row that merely MENTIONS Coca-Cola', () => {
    // "Beverages, COCA-COLA, POWERADE, lemon-lime flavored" is a real generic
    // USDA row whose facet "COCA-COLA" exactly covers the query. It is a
    // lemon-lime sports drink.
    const top = rankResults(MANY_BRANDS, ['coca cola'])[0]
    expect(top.datasetTier).toBe('branded')
    expect(top.name).not.toMatch(/powerade/i)
  })
})

describe('rankResults: a store house brand lives in the NAME, not the brand field', () => {
  // Measured on the 200-item corpus: 23 branded targets that the pre-fix
  // pipeline returned (mostly at ranks 8-19) fell past the 20-result cap once
  // canonical generic foods started ranking properly. They were still in the
  // candidate pool — "365 organic rolled oats" sat at rank 61 of 79 — so this
  // is the generic fix crowding them out, not a retrieval loss.
  //
  // The brand-only relief could not help them because it keyed on the `brand`
  // field alone: USDA files "365 EVERYDAY VALUE, ORGANIC INSTANT OATMEAL" with
  // brandOwner "Whole Foods Market, Inc.", so "365" — the thing a shopper
  // actually types — appears nowhere but the description.
  const POOL = [
    { name: 'Oats, raw', datasetTier: 'generic', calories: 379, protein_g: 13, carbs_g: 68, fat_g: 6.5 },
    { name: 'Oatmeal, NFS', datasetTier: 'generic', calories: 76, protein_g: 3, carbs_g: 12, fat_g: 1.5 },
    { name: 'Cereals, QUAKER, Instant Oatmeal Organic, Regular', datasetTier: 'generic', calories: 371, protein_g: 13, carbs_g: 68, fat_g: 7 },
    { name: '365 EVERYDAY VALUE, ORGANIC ROLLED OATS', brand: 'Whole Foods Market, Inc.', datasetTier: 'branded', calories: 375, protein_g: 13, carbs_g: 67, fat_g: 6 },
  ]

  it('"365 organic rolled oats" surfaces the 365 product, not generic oats', () => {
    const top = rankResults(POOL, ['365 organic rolled oats'])[0]
    expect(`${top.name} ${top.brand || ''}`).toMatch(/365/)
  })

  it('CONTROL: "rolled oats" with no house-brand word still ranks a canonical generic first', () => {
    expect(rankResults(POOL, ['rolled oats'])[0].datasetTier).toBe('generic')
  })

  it('CONTROL: "oatmeal" is unaffected — the canonical base form still leads', () => {
    expect(rankResults(POOL, ['oatmeal'])[0].name).toBe('Oatmeal, NFS')
  })
})
