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

---

# Pipeline overhaul — 26 Aug 2026

The redesign above fixed **retrieval**: it added the dataType-scoped USDA
passes, a synonym layer, and typo tolerance, and it was right about all three.
It did not fix the pipeline, and six behaviours remained in production. The
full reproduction, root-cause evidence and before/after numbers are in
`docs/food-search-baseline.md`; this section records what changed and why, so
the two documents read as one history rather than two designs.

## What the earlier work could not see

The prior evaluation's headline metric was keystroke efficiency — the prefix
length at which a target appears in the **top five**. That metric is blind to
every one of the reported behaviours: it never looks at rank 1 (so
"Avocado dressing", 427 kcal, above "Avocado, raw" scores as a success), it
calls `searchFoods()` directly (so no client-state defect is visible to it),
and it retries provider failures away as noise rather than treating them as the
defect. Its own captured data contains a `usda/generic … "ok":false,"error":
"HTTP 400"` line — recorded, and scored as a pass.

## Retrieval: two measured provider defects

**USDA's `Survey (FNDDS)` dataType is rejected ~50% of the time** by USDA's own
edge, with a bare nginx `400 Bad Request`. Measured n=20 per variant: the
shipped `Foundation,SR Legacy,Survey (FNDDS)` call failed 10/20;
`Survey (FNDDS)` alone 11/20; `Foundation,SR Legacy` 0/20; `Branded` 0/20; no
`dataType` 0/20. Four different URL encodings of the value all fail at the same
rate, so this is not request formation — which **corrects** the earlier
conclusion that USDA "intermittently returns a bare HTTP 400 on byte-identical
requests". The requests were not equivalent; one dataType value was poisoning
the call, and because all three datasets shared it, Survey's failure took
Foundation and SR Legacy with it. Half of all searches therefore lost the entire
canonical whole-food candidate pool before ranking ran.

Survey cannot simply be dropped — it is the only dataset with a usable
`Oatmeal, NFS`, `Avocado, raw`, `Fish, salmon, NFS` or bare `Peanut butter`
(Foundation/SR Legacy answer "oatmeal" with oatmeal *bread* and *cookies*). So
it is its own call, with three attempts; Foundation/SR Legacy and Branded get
two.

**Open Food Facts' `cgi/search.pl` fails 45% of the time.** Measured over 20
queries 700 ms apart: 9/20 HTTP 503, p50 549 ms — and not paced away (a single
call after 20 s idle still 503'd), with a burst of three (what one user search
issued) measuring 3/3. `search.openfoodfacts.org` measured 0/20 at p50 166 ms
over the same queries and is now the primary, with the legacy endpoint kept as
a fallback.

Separately, `normalizeUSDA` was reading energy only from nutrient 1008.
Foundation rows frequently carry none, reporting energy as 2048/2047 (Atwater
specific/general factors) instead — so USDA's most canonical dataset came back
`calories: null` and the UI painted a confident `0 kcal`.

## Honesty: three facts where there was one

`degraded` meant "every attempted provider failed", so a search that lost the
canonical pass and answered from branded rows alone looked identical to a
healthy one. In the captured baseline, **nine of ten required queries had a
genuinely failed provider call and all ten returned `degraded: false`.** The
response now carries `degraded`, `partial`, and `canonicalCoverage`
(`ok` / `missing` / `unconfigured`), plus `usdaConfigured` and the echoed
`query`. The UI renders a partial-failure note above whatever results it does
have, and the "add a USDA key" advice is gated on `usdaConfigured` — production
reported `usda: "configured"` while the app told people to add one.

There is also a whole-search deadline: what has arrived is returned, and
stragglers are reported as `error: 'timeout'` rather than holding an otherwise
complete answer.

## Ranking: three defects, two of them symmetrical

1. **USDA writes canonical foods inverted and comma-separated.** The real
   Foundation row for zucchini is `Squash, summer, green, zucchini, includes
   skin, raw` — tier 3 under the old ladder, while a branded packet named
   `ZUCCHINI` was tier 0. Names are now parsed as **facets**, and a query
   covered exactly by whole facets is a tier-1 identity match.
2. **Within-tier ties fell to provider order.** `Banana, baked` and
   `Banana, raw` both scored exactly 2000.5; USDA listed baked first. The
   tiebreak is now the name, and a test shuffles the pool to prove rank 1 does
   not move.
3. **There was no query-side generic/branded intent** — only a flat penalty on
   the candidate, so making "banana" right could only be done by making
   "Chobani vanilla" wrong. Two pool-derived signals replace it, neither
   needing a list to maintain: a query is a **brand query** when several
   distinct candidate brands cover the whole query (measured separation: coca
   cola 4 brands / 0.84 share, everything else ≤2 / ≤0.25), and a query word
   that appears in a candidate's **brand** but in no canonical food's **name**
   is brand-only, which is what makes `justins almond butter` return Justin's
   jar rather than generic almond butter.

Alongside these, three small word sets — `DERIVED_FOOD_WORDS`,
`PREPARATION_WORDS`, `BASE_FORM_WORDS` — separate "a different food that shares
the query's words" (`Bread, zucchini`, `Avocado dressing`, `Fish oil, salmon`)
from "a form of the queried food" (`Banana, baked`) from "the base food"
(`Oatmeal, NFS`). They apply **only at tier ≤ 2**, and only when the query
itself lacks the word, so `banana bread`, `avocado oil` and `raos marinara`
are unaffected.

Dedupe moved **after** ranking and is keyed on identity rather than
identity-plus-source, so the surviving representative of a duplicate group is
the best-scoring one rather than whichever provider answered first.

## Client: the state machine

Every rendered state now belongs to exactly one query. Previously the rendered
state was four loose pieces (`results`, `busy`, `error`, `degraded`) bound to
nothing, which produced two of the six behaviours: "No matches" rendered during
the 350 ms debounce before any request existed, and the previous query's rows
stayed mounted under the new one.

The generation guard is owned by the **query**, not the request. It used to be
bumped when a request started, which did not cover the debounce window in
between — so a response for the old query could still commit under the new one,
reproduced in a real browser with the input reading `banana`, the rows reading
zucchini's, and the spinner off. Superseded requests are now genuinely
**aborted** through `AbortController`, and `SearchFood` additionally checks the
response's query against the live one before committing.

`FoodConfirm` reads a carried `search_method` instead of inferring "Scanned"
from the presence of a barcode. That inference was false: every USDA Branded row
carries `gtinUpc` and every OFF row carries `code`, so most branded text-search
hits have one, and typing "zucchini" produced `SCANNED · USDA` with a barcode.
Each flow entry point (`scan`, `search`, `label`, `manual`, `recent`) now tags
its own method, and an untagged record claims nothing rather than claiming a
scan.

## Evaluation

`scripts/food-search-eval/` replaces the keystroke headline:
`run.mjs` (real providers, prefixes 2–5 and the complete query, checkpointed,
USDA-rate-limited), `analyze.mjs` (top-1/3/5, MRR, zero-result rate, p50/p95,
generic and branded reported separately, plus a machine-readable
`failures.json`), `golden.mjs` (the blocking golden set, run live), and
`stale-probe.mjs` (incorrect stale commits against the running app — proven in
both its firing and non-firing state: 0 on the fixed client, 2615 of 3620
rendered samples on the pre-fix one).
