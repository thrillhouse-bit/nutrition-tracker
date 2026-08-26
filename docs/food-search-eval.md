# Food search — evaluation

26 Aug 2026. What replaced the keystroke-efficiency headline, why, and the
before/after numbers. The defects themselves are in
`docs/food-search-baseline.md`; the design is in `docs/food-search.md`.

## What is measured, and what the old metric could not see

The prior audit's headline was **keystroke efficiency**: the prefix length at
which a target item appears somewhere in the **top five**, capped at 20
characters. On its own terms it was a fair measurement, and it drove a real fix.
It is also blind to every one of the six behaviours production reported:

- it never looks at **rank 1**, so `Avocado dressing` (427 kcal) above
  `Avocado, raw` scores as a success;
- it calls `searchFoods()` directly, so no **client-state** defect — the stale
  results, the premature "No matches", the mislabelled provenance — is visible
  to it at all;
- it **retries provider failures away** as noise, which is how a 50 % failure
  rate on the canonical-food pass survived a 200-item sweep. Its own
  `results.jsonl` line 1 records `usda/generic … "ok":false,"error":"HTTP 400"`
  and scores that probe a pass.

The replacement measures rank, honesty and client behaviour:

| metric | why |
|---|---|
| top-1 / top-3 / top-5, and MRR | rank 1 is what a person actually taps |
| zero-result rate | "found nothing" is a distinct failure from "found the wrong thing" |
| p50 / p95 search latency | the search round trip; the 350 ms input debounce sits on top of every figure |
| generic and branded **separately** | blending them hides one behind the other |
| prefixes of 2, 3, 4, 5 chars **and** the complete query | how a person actually types |
| **incorrect stale-response commits** | must be exactly zero |
| the **golden set** | a blocking gate, not a statistic |

## Harness

| file | what it does |
|---|---|
| `scripts/food-search-eval/run.mjs` | the 200-item corpus against REAL providers, no mocks. Reuses the prior audit's item list verbatim (`scripts/keystroke-audit/items.mjs`) so the two are comparable. Checkpointed and rate-limited. |
| `scripts/food-search-eval/analyze.mjs` | the metric set above, plus a machine-readable `failures.json` naming every item that fails and why |
| `scripts/food-search-eval/golden.mjs` | the blocking golden set, run live |
| `scripts/food-search-eval/stale-probe.mjs` | incorrect stale commits, measured against the running app |
| `scripts/food-search-eval/report.mjs` | generates the comparison table below from the two summary artifacts |
| `scripts/food-search-eval/capture-fixtures.mjs` | refreshes `test/fixtures/liveFoodRows.js` from live providers |

"Before" figures come from running the **same** harness against a git worktree
at this branch's base commit — same items, same providers, same matcher, the
pre-overhaul pipeline.

## The golden set — the blocking gate

Seven common foods where an exact generic query MUST return the canonical
generic food at rank 1. Run live, against real providers.

| query | before | after |
|---|---|---|
| zucchini | `ZUCCHINI` [KMB, LLC] — branded packet | `Squash, zucchini, baby, raw` |
| banana | `Banana, baked` (161 kcal) | `Banana, raw` |
| avocado | `Avocado dressing` (427 kcal) | `Avocado, raw` |
| chicken breast | `Chicken breast tenders, breaded, uncooked` | `Chicken, breast, meat and skin, raw` |
| oatmeal | `Oatmeal, multigrain` | `Oatmeal, NFS` |
| salmon | `Salmon salad` | `Fish, salmon, NFS` |
| peanut butter | `PEANUT BUTTER` [Reginald's Homemade] | `Peanut butter` |

**0 / 7 before → 7 / 7 after**, and stable across four consecutive live runs.
Artifacts: `golden.before-fix.json`, `golden.json`.

## Incorrect stale-response commits — the metric that must be zero

Measured against the running app by `stale-probe.mjs`, which replaces
`/api/search` with synthetic responses whose result names embed the query that
produced them (`RESULT-FOR[banana]`) and samples the DOM every 12 ms while a
script types dozens of query switches at latencies straddling the debounce. Any
rendered row whose embedded query is not the query in the input is, by
construction, a stale commit.

| | query switches | DOM samples with rows rendered | stale commits |
|---|---|---|---|
| before (pre-fix client, restored from git) | 50 | 3,620 | **2,615 (72.2 %)** |
| after | 80 | 2,730 | **0** |

The probe is proven in **both** states — a counter that has only ever read zero
is indistinguishable from one that cannot see anything. The pre-fix client was
restored afterwards and verified byte-identical with `cmp`.

## A caution about the corpus's generic numbers

The corpus's **generic top-1 is 98.3 % before and after**. That is not evidence
the generic ranking was already right; it is evidence the corpus cannot see the
defect. Its match criterion for "banana" is the substring `["banana"]`, so
against the pre-fix pipeline it scored all of these as rank-1 successes:

```
banana    -> Banana, baked        rank 1  PASS
avocado   -> Avocado dressing     rank 1  PASS
zucchini  -> Zucchini, pickled    rank 1  PASS
```

This is the same blindness the keystroke headline had, one level down, and it
is exactly why the golden set exists as a separate blocking gate. **The corpus
measures retrieval and coarse relevance; the golden set measures canonical
correctness.** Neither replaces the other.

## Before / after

<!-- BEGIN GENERATED: node scripts/food-search-eval/report.mjs -->
<!-- generated by scripts/food-search-eval/report.mjs -->
Corpus: 200 items (60 generic / 140 branded), 993 probes after, 993 before.
Every latency figure is the SEARCH round trip. A user additionally waits the 350 ms input debounce before the request starts.

### Complete query

| | top-1 | top-3 | top-5 | MRR | zero-result | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **generic** before | 98.3% | 100% | 100% | 0.9917 | 0% | 429ms | 998ms |
| **generic** after | **98.3%** | 100% | 100% | 0.9917 | 0% | 606ms | 1346ms |
| generic change | 0% | 0% | 0% | 0 | 0% | +177ms | +348ms |
| **branded** before | 30.7% | 35.7% | 38.6% | 0.3701 | 0% | 479ms | 899ms |
| **branded** after | **60.7%** | 61.4% | 61.4% | 0.6167 | 0% | 695ms | 1183ms |
| branded change | +30% | +25.7% | +22.8% | +0.2 | 0% | +216ms | +284ms |
| **all** before | 51% | 55% | 57% | 0.5566 | 0% | 457ms | 943ms |
| **all** after | **72%** | 73% | 73% | 0.7292 | 0% | 687ms | 1247ms |
| all change | +21% | +18% | +16% | +0.2 | 0% | +230ms | +304ms |

Targets NO PROVIDER RETURNED — no ranking can move these: before 33 branded / 0 generic; after 43 branded / 0 generic.

### Complete query, excluding targets no provider returned

| | top-1 | top-3 | top-5 | MRR | zero-result | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **generic** before | 98.3% | 100% | 100% | 0.9917 | 0% | 429ms | 998ms |
| **generic** after | **98.3%** | 100% | 100% | 0.9917 | 0% | 606ms | 1346ms |
| generic change | 0% | 0% | 0% | 0 | 0% | +177ms | +348ms |
| **branded** before | 40.2% | 46.7% | 50.5% | 0.4842 | 0% | 483ms | 899ms |
| **branded** after | **87.6%** | 88.7% | 88.7% | 0.8901 | 0% | 700ms | 1171ms |
| branded change | +47.4% | +42% | +38.2% | +0.4 | 0% | +217ms | +272ms |
| **all** before | 61.1% | 65.9% | 68.3% | 0.6665 | 0% | 459ms | 943ms |
| **all** after | **91.7%** | 93% | 93% | 0.9289 | 0% | 687ms | 1259ms |
| all change | +30.6% | +27.1% | +24.7% | +0.3 | 0% | +228ms | +316ms |

### Prefix of 2 characters

| | top-1 | top-3 | top-5 | MRR | zero-result | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **generic** before | 0% | 1.7% | 5% | 0.0186 | 1.7% | 412ms | 1001ms |
| **generic** after | **0%** | 1.7% | 1.7% | 0.0191 | 0% | 414ms | 919ms |
| generic change | 0% | 0% | -3.3% | 0 | -1.7% | +2ms | -82ms |
| **branded** before | 0.7% | 1.4% | 1.4% | 0.0107 | 2.9% | 394ms | 1033ms |
| **branded** after | **0.7%** | 1.4% | 1.4% | 0.0095 | 0% | 439ms | 915ms |
| branded change | 0% | 0% | 0% | 0 | -2.9% | +45ms | -118ms |
| **all** before | 0.5% | 1.5% | 2.5% | 0.0131 | 2.5% | 399ms | 1001ms |
| **all** after | **0.5%** | 1.5% | 1.5% | 0.0124 | 0% | 438ms | 915ms |
| all change | 0% | 0% | -1% | 0 | -2.5% | +39ms | -86ms |

### Prefix of 3 characters

| | top-1 | top-3 | top-5 | MRR | zero-result | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **generic** before | 8.3% | 13.3% | 21.7% | 0.1297 | 3.3% | 358ms | 1153ms |
| **generic** after | **5%** | 11.7% | 20% | 0.1192 | 1.7% | 439ms | 1189ms |
| generic change | -3.3% | -1.6% | -1.7% | 0 | -1.6% | +81ms | +36ms |
| **branded** before | 1.4% | 4.3% | 5% | 0.0323 | 7.9% | 345ms | 821ms |
| **branded** after | **1.4%** | 2.9% | 3.6% | 0.026 | 5.7% | 433ms | 932ms |
| branded change | 0% | -1.4% | -1.4% | 0 | -2.2% | +88ms | +111ms |
| **all** before | 3.5% | 7% | 10% | 0.0615 | 6.5% | 356ms | 922ms |
| **all** after | **2.5%** | 5.5% | 8.5% | 0.0539 | 4.5% | 433ms | 946ms |
| all change | -1% | -1.5% | -1.5% | 0 | -2% | +77ms | +24ms |

### Prefix of 4 characters

| | top-1 | top-3 | top-5 | MRR | zero-result | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **generic** before | 19% | 27.6% | 29.3% | 0.2445 | 8.6% | 364ms | 722ms |
| **generic** after | **15.5%** | 25.9% | 27.6% | 0.2168 | 5.2% | 471ms | 1234ms |
| generic change | -3.5% | -1.7% | -1.7% | 0 | -3.4% | +107ms | +512ms |
| **branded** before | 7.9% | 12.1% | 12.9% | 0.1036 | 17.1% | 358ms | 930ms |
| **branded** after | **5%** | 9.3% | 12.9% | 0.0886 | 16.4% | 440ms | 1099ms |
| branded change | -2.9% | -2.8% | 0% | 0 | -0.7% | +82ms | +169ms |
| **all** before | 11.1% | 16.7% | 17.7% | 0.1449 | 14.6% | 358ms | 804ms |
| **all** after | **8.1%** | 14.1% | 17.2% | 0.1261 | 13.1% | 447ms | 1184ms |
| all change | -3% | -2.6% | -0.5% | 0 | -1.5% | +89ms | +380ms |

### Prefix of 5 characters

| | top-1 | top-3 | top-5 | MRR | zero-result | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **generic** before | 18.2% | 23.6% | 25.5% | 0.2196 | 20% | 400ms | 1255ms |
| **generic** after | **21.8%** | 34.5% | 34.5% | 0.2827 | 10.9% | 504ms | 1471ms |
| generic change | +3.6% | +10.9% | +9% | +0.1 | -9.1% | +104ms | +216ms |
| **branded** before | 8.6% | 16.4% | 20.7% | 0.1339 | 19.3% | 413ms | 826ms |
| **branded** after | **6.4%** | 15.7% | 20.7% | 0.1217 | 12.1% | 458ms | 1008ms |
| branded change | -2.2% | -0.7% | 0% | 0 | -7.2% | +45ms | +182ms |
| **all** before | 11.3% | 18.5% | 22.1% | 0.1581 | 19.5% | 413ms | 871ms |
| **all** after | **10.8%** | 21% | 24.6% | 0.1671 | 11.8% | 463ms | 1084ms |
| all change | -0.5% | +2.5% | +2.5% | 0 | -7.7% | +50ms | +213ms |

### Time to first useful result (target reaches the top 5)

| | items reaching top 5 | characters typed p50 | p95 | search p50 | p95 |
|---|---|---|---|---|---|
| **generic** before | 60 | 5 | 16 | 382ms | 945ms |
| **generic** after | **60** | 5 | 16 | 516ms | 1234ms |
| **branded** before | 68 | 17 | 33 | 459ms | 977ms |
| **branded** after | **96** | 22 | 35 | 664ms | 1127ms |
| **all** before | 128 | 5 | 30 | 418ms | 973ms |
| **all** after | **156** | 12 | 34 | 601ms | 1140ms |

Items never reaching the top 5 at any probe: **72 before -> 44 after.**
<!-- END GENERATED -->

## The per-item trade-off, item by item

Aggregates hide direction of travel, so here is the whole corpus resolved
per item, complete query, before vs after:

| | items |
|---|---|
| target's rank **improved** | **39** |
| target's rank unchanged | 97 |
| target's rank **worsened** | **10** |
| target **newly returned** (was absent) | **11** — ten of them at rank 1 |
| target **no longer returned** (was present) | **21** |

The 11 newly-returned items are almost all brands the old Open Food Facts
endpoint never surfaced (`justin's almond butter`, `rxbar chocolate sea salt`,
`hippeas chickpea puffs`, `siete grain free chips`, `four sigmatic mushroom
coffee`), and they arrive at rank 1.

The 21 no-longer-returned items are the real cost, and they are named rather
than averaged away: `365 organic unsalted butter`, `365 organic marinara
sauce`, `365 organic rolled oats`, `365 organic extra virgin olive oil`,
`365 sparkling water`, `applegate hot dogs`, `wellshire farms deli turkey`,
`applegate chicken sausage`, `rao's homemade marinara sauce`, `simple mills
pancake baking mix`, `madegood granola bars`, `amy's organic lentil soup`,
`gomacro protein bar`, `oatly oat milk`, `amy's frozen margherita pizza`,
`once again almond butter`, `allegro coffee organic breakfast blend`,
`great value large eggs`, `oscar mayer bacon`, `kraft shredded cheddar cheese`,
`ragu marinara sauce`. Seventeen of the 21 were at rank 7 or deeper before —
present, but not usefully. Four were shallow (`wellshire farms deli turkey` and
`amy's organic lentil soup` at 1, `once again almond butter` and `allegro
coffee` at 2) and those are a genuine regression.

## Where it still falls short

Named here rather than averaged away; every item is in `failures.json`.

1. **Multi-word store-house-brand queries.** Most of the 21 losses above are
   this: the target is still in the candidate pool but falls past the
   20-result cap now that canonical generic foods rank properly. Measured
   rather than assumed — `365 organic rolled oats` sat at rank 61 of a 79-row
   pool. Reading the brand from the leading words of the NAME as well as the
   `brand` field recovered part of it (`365 organic rolled oats` 61 → 34,
   `kraft shredded cheddar cheese` 6 → 3, `oatly oat milk` 21 → 11, `ragu
   marinara sauce` 39 → 26), but `sara lee white bread` sits at exactly 20 and
   several remain below the cap. Raising MAX_RESULTS would paper over it; the
   right fix is a stronger brand signal, and that is not done.

2. **Targets no provider returns at all.** Store house brands USDA and Open
   Food Facts do not carry. **Zero generic targets are missing**, in either run.

3. **Latency got worse: p50 +230 ms, p95 +304 ms.** Four provider passes
   instead of three (USDA's generic datasets are two calls now), plus bounded
   retries on the ~55 %-failing Survey pass. That is the price of the canonical
   coverage the whole generic fix depends on, and it is paid on every search.
   Mitigations in place: all passes run in parallel, there is an 8 s
   whole-search deadline that returns what has arrived rather than waiting, and
   the client shows an honest pending state throughout. Not mitigated: there is
   no server-side result cache, so a repeated query pays full price again. A
   short-TTL keyed cache is the obvious next step and was deliberately not
   added here — an unmeasured cache is how one query's results end up served
   for another.

4. **Short prefixes are, and should be, weak.** At 2–3 characters the corpus is
   mostly misses in both the before and after runs. A two-letter prefix does
   not identify a food, and a system that appeared confident there would be
   guessing. What matters is that the states shown while the answer is not yet
   knowable are honest, which the client work covers.

5. **`365 organic marinara`** — the query the prior audit's one-line fix was
   built around — still puts USDA restaurant-ravioli rows above
   `Sauce, pasta, spaghetti/marinara, ready-to-serve`. All three are weak
   tier-4 matches; neither provider carries a Whole Foods 365 marinara. The
   prior fix's own regression test still passes.

6. **USDA's `Survey (FNDDS)` dataType still fails ~12 % of searches** after
   three attempts (it fails ~55 % per attempt upstream). That no longer removes
   the canonical pool — Foundation/SR Legacy answer separately, and
   `canonicalCoverage` was `missing` on **zero** of the corpus probes — but it
   does mean a minority of searches see a slightly smaller Survey contribution,
   and the response says so via `partial`.
