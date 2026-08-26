# Food search reliability overhaul — root cause and redesign

25 Aug 2026. A full rebuild of free-text food search (`GET /api/search`),
triggered by a real, reproduced failure: searching "zucchini" returned
mostly irrelevant results, and searching "courgette" or a one-letter typo
("zuccini") returned **nothing at all**.

## Root cause (reproduced with real request/response evidence)

The pre-existing pipeline (`searchByText` in `server/lookup.js`) queried USDA
FoodData Central first (only if `FDC_API_KEY` is set — it's optional and
commonly unset, per `.env.example`), and fell back to Open Food Facts only
when USDA returned fewer than 5 results. With no USDA key configured (the
common/default state, and the state of this sandbox), search for a raw
commodity food relies **100% on Open Food Facts** — a barcoded PACKAGED-
product database with no canonical "generic whole food" entries at all.

Real, captured evidence (`curl` against the live OFF API, then the actual
app code run directly — see the PR body for the full transcript):

```
GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=zucchini&...
-> count: 868, page_size: 15
```
Of the 15 returned products, only 3 contained "zucchini" anywhere in their
own name; the rest were French/German/Czech branded prepared foods
("Courgettes-Tomates cerises Cuisinées", "Ratatouille cuisinée", "Waffle",
"Borlotti Beans" with **no calorie data at all**). Running the app's own
`searchByText('zucchini')` directly confirmed the same 15 results reached
the client, ranked only by a plain name-substring heuristic that cannot
manufacture relevance the underlying data never had.

Two queries **failed completely** (zero results, not just poor ones):
```
searchByText('courgette') -> 0 results   (a pure English/French synonym gap)
searchByText('zuccini')   -> 0 results   (a single missing letter — zero typo tolerance)
```

This is the actual, load-bearing root cause: **not** a ranking bug alone
(the old `nameMatchTier` ranking was reasonable given its inputs — it put
"Zucchini Bio" at position 1 out of the 15 OFF results already), but a
**retrieval** problem — the pipeline had no synonym awareness, no typo
tolerance, and (most importantly) no dataset-restricted USDA pass that could
reliably surface a canonical generic entry like "Zucchini, raw" even when a
key *is* configured, because an unrestricted USDA query mixes ~400,000
Branded rows in with a few thousand Foundation/SR Legacy ones.

## The redesign

New module: `server/foodSearch/` (`normalize.js`, `rank.js`, `providers.js`,
`index.js`). `server/lookup.js` keeps only barcode lookup plus the shared
building blocks (`normalizeUSDA`, `normalizeOFF`, `usdaSearch`,
`offTextSearch`) both paths now call — one nutrient-mapping implementation,
not two.

**1. Normalization (`normalize.js`, pure, no I/O)**
- `normalizeText`: Unicode NFKD + strip diacritics, lowercase, collapse
  hyphens/underscores/slashes to spaces, drop other punctuation, collapse
  whitespace.
- `splitQualifiers`: recognizes form words (raw/cooked/frozen/grilled/
  canned/...) as modifiers, not identity — "zucchini raw" still matches a
  candidate named just "Zucchini" (the qualifier boosts rank when a
  candidate agrees, never gates the match).
- `synonymVariants`: a small, explicit, bidirectional table of genuinely
  equivalent food names (zucchini↔courgette, coke↔coca cola, oatmeal↔oats,
  yogurt↔yoghurt, and a dozen others) — not a general thesaurus, just the
  common cases a user reasonably expects to work.
- `correctTypo`: a small food-TERM vocabulary (no nutrition data — spelling
  correction only) used conservatively: a query is corrected only when it's
  within a small edit distance of **exactly one** vocabulary term; a tie is
  left uncorrected rather than guessed.

**2. Retrieval (`providers.js` + `index.js`)**
- USDA is now queried as **two separate passes**: `queryUsdaGeneric`
  (`dataType: Foundation, SR Legacy, Survey (FNDDS)` — canonical whole
  foods) and `queryUsdaBranded` (`dataType: Branded`), tagged
  `datasetTier: 'generic'`/`'branded'` respectively. This is what guarantees
  a "Zucchini, raw"-shaped entry gets a chance to be seen at all, rather
  than competing unrestricted against Branded volume.
- Every provider call for the primary query AND its synonym variants (bounded
  to 2 extra) runs **fully in parallel** (`Promise.all`), so trying more
  variants doesn't multiply latency.
- Typo correction is a **last resort**: tried only when the primary query and
  its synonyms together found nothing, never pre-emptively — a rare real
  food that merely resembles a common one's spelling is never silently
  replaced.
- Results are deduped (by barcode, else by name+source) and any candidate
  with **no usable nutrition data at all** (all of calories/protein/carbs/fat
  null — e.g. the real "Borlotti Beans" row captured live) is dropped, so it
  can never render as a fabricated "0 kcal" food.

**3. Ranking (`rank.js`, pure)**
Six tiers (lower = better), each candidate scored against every query
variant and given its BEST tier across all of them (so a result only
findable via a synonym is judged as a match for that term, not penalized for
lacking the original word): exact normalized match → same token set
reordered → prefix → all tokens present (phrase) → typo-tolerant/substring
→ no relation. Ties within a tier break on: non-branded dataset first,
more complete nutrition data first, qualifier agreement first, shorter name
first (a proxy for "the base food, not a compound branded product").

**4. Diagnostics and UX states**
`searchFoods()` returns per-provider `{source, dataset, query, ok, count,
latencyMs, error, skipped}` alongside the ranked results. `GET /api/search`
logs this (query text and counts/latency only — no user id or session data)
and returns `{results, degraded}` to the client; `degraded` is true only when
**every attempted** provider call genuinely failed (never true for an
unconfigured-but-optional USDA key, and never true for a real empty result).
A dev-only `GET /api/search/debug` (gated on `NODE_ENV !== 'production'`)
returns the full breakdown for inspecting ranking decisions without
exposing it in the production response contract.
`src/components/SearchFood.jsx` now shows five distinct states: idle (fewer
than 2 characters), loading, real results, a genuine "No matches" empty
state, and a distinct "Search is having trouble right now" state with a
Retry action — the typed query is preserved through every state, never
cleared on failure.

## What changed vs. what's untouched

**New**: `server/foodSearch/{normalize,rank,providers,index}.js`. **Removed**:
`rankByRelevance`/`nameMatchTier` from `server/lookup.js` (superseded).
**Changed**: `server/lookup.js` (extracted `offTextSearch`, exported
`usdaSearch`, removed `searchByText`), `server/index.js`'s `/api/search`
route (now calls the new pipeline, logs diagnostics, returns `degraded`; adds
dev-only `/api/search/debug`), `src/components/SearchFood.jsx` (new UX
states). **Untouched**: barcode lookup (`lookupByBarcode`,
`normalizeOFF`/`normalizeUSDA` themselves), the add/confirm-food flow
(`FoodConfirm.jsx`), food-ID handling, and every other route.

## Known limitations

- The synonym table and typo-correction vocabulary are both small and
  curated by design ("small, maintainable" per spec) — they cover the common
  cases surfaced by this investigation, not an exhaustive food ontology.
- Typo correction only fires when the primary query (and synonyms) found
  zero results; a query that returns a FEW poor matches is never
  auto-corrected, by design (conservative), which means a very sparse but
  non-empty result set won't get the typo-correction boost.
- USDA's own two dataset passes (generic/branded) are separate HTTP calls —
  doubles USDA request volume per search versus the old single unrestricted
  call. USDA's free tier (1,000 requests/hour) comfortably covers normal
  personal use; this is worth revisiting only if usage patterns change.
