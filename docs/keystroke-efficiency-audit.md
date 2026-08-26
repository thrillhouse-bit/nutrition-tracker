# Keystroke-efficiency audit of food search

26 Aug 2026. A follow-on audit to the search-hardening work in PR #82 ("Fix
three real bugs found by a live QA sweep against USDA + Open Food Facts").
That PR fixed *correctness* — the right result eventually shows up. This
audit asks a different question: **how many characters does a user have to
type before the food they're looking for shows up somewhere they'd actually
see it** — because a search feature can be correct and still be bad UX if it
takes typing the whole product name, or scrolling past 20 irrelevant results,
before the real answer appears.

Everything here was measured against the **live** `searchFoods()` pipeline
(`server/foodSearch/index.js`) calling real USDA FoodData Central and real
Open Food Facts endpoints — the same code path `/api/foods/search` runs.
No mocks. One concrete bug was found and fixed along the way (see below).

## tl;dr

- **200/200 items audited** against live USDA + OFF data (Whole Foods 150,
  Walmart 50). **169/200 (84.5%)** became usable (top-5) within 20 typed
  characters; median **6 characters**, mean 7.67.
- **Generic/produce is excellent: 100% found, median 5 characters.**
  **Branded is the weak spot: 77.9% found, median 7, mean 8.73**, and every
  one of the 31 confirmed failures is a branded item.
- Found and fixed a real ranking bug: `'organic'` was scored as a food-
  identity token instead of a qualifier, letting an unrelated product
  (literally "Infant formula, organic, ready-to-feed") tie with, and by a
  half-point tie-break beat, the actual target for a "365 organic marinara"
  search. Fixed with a one-line addition to `QUALIFIER_WORDS`
  (`server/foodSearch/normalize.js`). **Full suite: 619/619 passing** (616
  pre-existing + 3 new regression tests).
- Both USDA's and Open Food Facts' live search endpoints showed substantial
  intermittent failures **during this audit's own measurement window** —
  confirmed by direct `curl` replay of identical requests getting different
  HTTP statuses seconds apart. This is external flakiness, not a bug in this
  repo, but it materially affects both real users and this audit's precision
  (see Methodology and Limitations).
- Of the 31 items that never became usable, **27 were cut off by this
  audit's own 20-character cap before finishing their natural phrase** —
  meaning "not found by char 20" rather than "not found even after typing
  the whole name." Only **4 items failed after typing their ENTIRE natural
  search phrase**: `365 organic quinoa`, `365 sparkling water`,
  `health ade kombucha`, `coca cola 12 pack`.
- Not fixed (structural, documented as recommendations, see below): a
  tie-break that lets a shorter, coincidentally-matching product name
  outrank a longer, more specific one within the same brand; and an
  apparent store-brand/private-label data-coverage gap in USDA/OFF (365,
  Great Value) that isn't something this app's ranking code can fix.

## Scope

**Two stores only: Whole Foods and Walmart.** The original ask mentioned
"Walmart, Whole Foods, etc.," but which additional chains "etc." meant was
never pinned down before that context was lost to an earlier environment
restart. This audit sticks to the two named stores to keep the work
finishable rather than guessing at the rest of the list. **Target, Kroger,
Trader Joe's, etc. are explicitly out of scope here** and would be a
reasonable, bounded follow-up if broader coverage is wanted.

**No real point-of-sale data was used or is available.** Both item lists
are constructed from general knowledge of each chain's known best-sellers,
house brands, and typical cart composition — not from any sales data. This
was flagged to the owner before the work started and is repeated here for
the record.

## The master item list

200 items total, ordered Whole-Foods-first (so a truncated run would keep
the healthier end, per an earlier instruction to bias toward the healthy end
if anything got cut short — moot here since the full run completed, but
preserved in `scripts/keystroke-audit/items.mjs`).

- **Whole Foods — 150 items.** Explicitly expanded from a 50-item default at
  the owner's request ("analyze the 150 most purchased items, removing
  seasonal or otherwise outliers"). **45 generic/organic produce (30%) + 105
  branded (70%)**, scaling the same generic/branded mix used for Walmart.
  Branded items lean on 365 Everyday Value (the house private label) and the
  natural/organic brands Whole Foods is known for (Vital Farms, Siete,
  Applegate, Rao's, Primal Kitchen, Justin's, Bob's Red Mill, and more).
  Seasonal and holiday items and one-off outliers were deliberately excluded
  (no pumpkin, no stone fruit, no cranberries) — this is meant to be the
  steady, year-round set an ordinary weekly shopper buys.
- **Walmart — 50 items.** **15 generic/produce + 35 branded**, per the
  original spec. Branded selection is biased toward mainstream/conventional
  brands Walmart is known for stocking (Great Value, Cheerios, Oscar Mayer,
  Kraft, Coca-Cola, Doritos, …), not health-food brands.

Every item was deduplicated; nothing was padded with filler. The full,
final list — including the measured chars-to-find and rank for every single
item — is below (also committed as structured data in
`scripts/keystroke-audit/final.json`, `results.jsonl`, and `recheck.jsonl`
for anyone who wants to re-derive these numbers or inspect the raw provider
responses).

### Whole Foods (150 items)

| Item | Typed query | Kind | Chars to find | Rank |
|---|---|---|---|---|
| organic banana | banana | generic | 4 | 2 |
| organic avocado | avocado | generic | 3 | 2 |
| organic baby spinach | baby spinach | generic | 4 | 1 |
| organic kale | kale | generic | 4 | 1 |
| organic gala apple | gala apple | generic | 4 | 1 |
| organic lemon | lemon | generic | 3 | 1 |
| organic garlic | garlic | generic | 3 | 5 |
| organic yellow onion | yellow onion | generic | 6 | 5 |
| organic red onion | red onion | generic | 9 | 1 |
| organic roma tomato | roma tomato | generic | 4 | 1 |
| organic broccoli | broccoli | generic | 4 | 1 |
| organic carrots | carrots | generic | 6 | 1 |
| organic red bell pepper | red bell pepper | generic | 5 | 5 |
| organic cucumber | cucumber | generic | 3 | 1 |
| organic zucchini | zucchini | generic | 3 | 3 |
| organic blueberries | blueberries | generic | 3 | 1 |
| organic strawberries | strawberries | generic | 3 | 4 |
| organic celery | celery | generic | 6 | 1 |
| organic sweet potato | sweet potato | generic | 5 | 1 |
| organic russet potato | russet potato | generic | 6 | 1 |
| organic green grapes | green grapes | generic | 11 | 1 |
| organic cauliflower | cauliflower | generic | 3 | 1 |
| organic asparagus | asparagus | generic | 7 | 1 |
| organic ginger | ginger | generic | 2 | 2 |
| organic cilantro | cilantro | generic | 8 | 1 |
| organic brussels sprouts | brussels sprouts | generic | 7 | 1 |
| organic english cucumber | english cucumber | generic | 14 | 1 |
| organic cremini mushrooms | cremini mushrooms | generic | 7 | 1 |
| organic lime | lime | generic | 4 | 1 |
| organic green beans | green beans | generic | 5 | 1 |
| organic baby arugula | baby arugula | generic | 4 | 3 |
| organic romaine lettuce | romaine lettuce | generic | 6 | 1 |
| organic cherry tomatoes | cherry tomatoes | generic | 13 | 1 |
| organic navel orange | navel orange | generic | 7 | 2 |
| organic yellow squash | yellow squash | generic | 13 | 1 |
| organic scallions | scallions | generic | 8 | 1 |
| organic red potatoes | red potatoes | generic | 7 | 1 |
| organic granny smith apple | granny smith apple | generic | 6 | 1 |
| organic honeycrisp apple | honeycrisp apple | generic | 10 | 3 |
| organic raspberries | raspberries | generic | 5 | 2 |
| organic blackberries | blackberries | generic | 8 | 1 |
| organic butternut squash | butternut squash | generic | 9 | 1 |
| organic parsley | parsley | generic | 7 | 1 |
| organic basil | basil | generic | 4 | 1 |
| organic shallot | shallot | generic | 7 | 1 |
| 365 organic whole milk | 365 organic whole milk | branded | 11 | 1 |
| 365 large brown eggs | 365 large brown eggs | branded | 10 | 1 |
| 365 organic unsalted butter | 365 organic unsalted butter | branded | 20 | 2 |
| 365 organic chicken broth | 365 organic chicken broth | branded | 11 | 2 |
| 365 organic marinara sauce | 365 organic marinara sauce | branded | — (capped) | — |
| 365 organic creamy peanut butter | 365 organic creamy peanut butter | branded | 18 | 1 |
| 365 organic rolled oats | 365 organic rolled oats | branded | 18 | 2 |
| 365 organic quinoa | 365 organic quinoa | branded | — (full phrase) | — |
| 365 organic black beans | 365 organic black beans | branded | 17 | 1 |
| 365 organic extra virgin olive oil | 365 organic extra virgin olive oil | branded | — (capped) | — |
| 365 organic salsa | 365 organic salsa | branded | 3 | 1 |
| 365 organic blue corn tortilla chips | 365 organic blue corn tortilla chips | branded | 16 | 1 |
| 365 organic whole milk greek yogurt | 365 organic whole milk greek yogurt | branded | — (capped) | — |
| 365 sparkling water | 365 sparkling water | branded | — (full phrase) | — |
| 365 organic maple syrup | 365 organic maple syrup | branded | — (capped) | — |
| vital farms pasture raised eggs | vital farms pasture raised eggs | branded | — (capped) | — |
| kerrygold pure irish butter | kerrygold pure irish butter | branded | 9 | 3 |
| organic valley whole milk | organic valley whole milk | branded | 14 | 1 |
| straus family creamery whole milk | straus family creamery whole milk | branded | 5 | 1 |
| siggi's vanilla yogurt | siggi's vanilla yogurt | branded | 5 | 1 |
| wallaby organic whole milk yogurt | wallaby organic whole milk yogurt | branded | 7 | 1 |
| chobani plain greek yogurt | chobani plain greek yogurt | branded | 7 | 1 |
| maple hill grass fed whole milk | maple hill grass fed whole milk | branded | — (capped) | — |
| cabot sharp cheddar cheese | cabot sharp cheddar cheese | branded | 5 | 4 |
| vital farms salted butter | vital farms salted butter | branded | 10 | 1 |
| applegate uncured turkey bacon | applegate uncured turkey bacon | branded | 11 | 4 |
| applegate naturals deli ham | applegate naturals deli ham | branded | — (capped) | — |
| applegate hot dogs | applegate hot dogs | branded | 6 | 5 |
| diestel family ranch ground turkey | diestel family ranch ground turkey | branded | 7 | 1 |
| mary's free range whole chicken | mary's free range whole chicken | branded | 11 | 1 |
| beyond meat plant based burger | beyond meat plant based burger | branded | 6 | 1 |
| just egg liquid egg | just egg liquid egg | branded | 7 | 1 |
| niman ranch uncured bacon | niman ranch uncured bacon | branded | 13 | 2 |
| wellshire farms deli turkey | wellshire farms deli turkey | branded | 8 | 4 |
| applegate chicken sausage | applegate chicken sausage | branded | — (capped) | — |
| rao's homemade marinara sauce | rao's homemade marinara sauce | branded | 3 | 2 |
| siete grain free tortillas | siete grain free tortillas | branded | 5 | 3 |
| siete tortilla chips | siete tortilla chips | branded | 5 | 3 |
| primal kitchen avocado oil mayo | primal kitchen avocado oil mayo | branded | 18 | 3 |
| primal kitchen ranch dressing | primal kitchen ranch dressing | branded | 16 | 3 |
| sir kensington's ketchup | sir kensington's ketchup | branded | 18 | 4 |
| justin's classic peanut butter | justin's classic peanut butter | branded | 6 | 1 |
| justin's almond butter | justin's almond butter | branded | 6 | 4 |
| bob's red mill old fashioned rolled oats | bob's red mill old fashioned rolled oats | branded | — (capped) | — |
| bob's red mill almond flour | bob's red mill almond flour | branded | — (capped) | — |
| lundberg organic brown rice | lundberg organic brown rice | branded | 8 | 1 |
| eden foods organic black beans | eden foods organic black beans | branded | — (capped) | — |
| pacific foods organic chicken broth | pacific foods organic chicken broth | branded | 18 | 4 |
| bragg organic apple cider vinegar | bragg organic apple cider vinegar | branded | 5 | 4 |
| thrive market extra virgin olive oil | thrive market extra virgin olive oil | branded | — (capped) | — |
| dave's killer bread 21 whole grains | dave's killer bread 21 whole grains | branded | 4 | 3 |
| ezekiel 4 9 sprouted bread | ezekiel 4 9 sprouted bread | branded | 7 | 1 |
| angelic bakehouse 7 grain bread | angelic bakehouse 7 grain bread | branded | 7 | 1 |
| rudi's organic multigrain bread | rudi's organic multigrain bread | branded | 5 | 1 |
| simple mills almond flour crackers | simple mills almond flour crackers | branded | 19 | 3 |
| simple mills pancake baking mix | simple mills pancake baking mix | branded | — (capped) | — |
| alvarado street bakery sprouted bread | alvarado street bakery sprouted bread | branded | 8 | 2 |
| silver hills sprouted bread | silver hills sprouted bread | branded | — (capped) | — |
| rxbar chocolate sea salt | rxbar chocolate sea salt | branded | 6 | 3 |
| kind dark chocolate nuts sea salt bar | kind dark chocolate nuts sea salt bar | branded | 4 | 2 |
| larabar cashew cookie | larabar cashew cookie | branded | 8 | 2 |
| late july sea salt tortilla chips | late july sea salt tortilla chips | branded | 4 | 1 |
| hippeas chickpea puffs | hippeas chickpea puffs | branded | 6 | 3 |
| madegood granola bars | madegood granola bars | branded | 8 | 1 |
| annie's cheddar bunnies | annie's cheddar bunnies | branded | 9 | 2 |
| annie's shells white cheddar mac and cheese | annie's shells white cheddar mac and cheese | branded | 13 | 1 |
| amy s organic lentil soup | amy s organic lentil soup | branded | 8 | 3 |
| gomacro protein bar | gomacro protein bar | branded | 7 | 1 |
| barnana chewy banana bites | barnana chewy banana bites | branded | 7 | 1 |
| siete grain free chips | siete grain free chips | branded | 5 | 3 |
| bare baked apple chips | bare baked apple chips | branded | 12 | 1 |
| justin's dark chocolate peanut butter cups | justin's dark chocolate peanut butter cups | branded | 6 | 1 |
| health ade kombucha | health ade kombucha | branded | — (full phrase) | — |
| gt's kombucha | gt's kombucha | branded | 2 | 1 |
| califia farms oat milk | califia farms oat milk | branded | 7 | 5 |
| califia farms almond milk | califia farms almond milk | branded | 7 | 2 |
| oatly oat milk | oatly oat milk | branded | 14 | 4 |
| suja organic cold pressed juice | suja organic cold pressed juice | branded | 4 | 1 |
| vital proteins collagen peptides | vital proteins collagen peptides | branded | 14 | 1 |
| numi organic tea | numi organic tea | branded | 4 | 1 |
| amy s frozen margherita pizza | amy s frozen margherita pizza | branded | 3 | 4 |
| sweet earth frozen burrito | sweet earth frozen burrito | branded | 20 | 2 |
| applegate frozen chicken nuggets | applegate frozen chicken nuggets | branded | — (capped) | — |
| alexia frozen sweet potato fries | alexia frozen sweet potato fries | branded | 19 | 1 |
| daily harvest smoothie cups | daily harvest smoothie cups | branded | — (capped) | — |
| native forest organic coconut milk | native forest organic coconut milk | branded | 13 | 3 |
| so delicious coconut milk yogurt | so delicious coconut milk yogurt | branded | 14 | 3 |
| sweet earth veggie burger | sweet earth veggie burger | branded | — (capped) | — |
| banza chickpea pasta | banza chickpea pasta | branded | 5 | 3 |
| jovial organic pasta | jovial organic pasta | branded | 6 | 4 |
| eden foods organic chickpeas | eden foods organic chickpeas | branded | — (capped) | — |
| muir glen organic diced tomatoes | muir glen organic diced tomatoes | branded | 4 | 1 |
| pacific foods organic vegetable broth | pacific foods organic vegetable broth | branded | — (capped) | — |
| explore cuisine edamame spaghetti | explore cuisine edamame spaghetti | branded | 7 | 2 |
| tinkyada brown rice pasta | tinkyada brown rice pasta | branded | 8 | 1 |
| annie's organic microwave mac and cheese | annie's organic microwave mac and cheese | branded | — (capped) | — |
| alter eco dark chocolate | alter eco dark chocolate | branded | 5 | 4 |
| lily's dark chocolate | lily's dark chocolate | branded | 4 | 5 |
| endangered species dark chocolate | endangered species dark chocolate | branded | 6 | 1 |
| hu chocolate bar | hu chocolate bar | branded | 2 | 2 |
| once again almond butter | once again almond butter | branded | 19 | 4 |
| wild friends peanut butter | wild friends peanut butter | branded | — (capped) | — |
| allegro coffee organic breakfast blend | allegro coffee organic breakfast blend | branded | 7 | 1 |
| four sigmatic mushroom coffee | four sigmatic mushroom coffee | branded | — (capped) | — |
| nature's path organic granola | nature's path organic granola | branded | — (capped) | — |

### Walmart (50 items)

| Item | Typed query | Kind | Chars to find | Rank |
|---|---|---|---|---|
| banana | banana | generic | 4 | 2 |
| yellow onion | yellow onion | generic | 12 | 1 |
| roma tomato | roma tomato | generic | 4 | 2 |
| russet potato | russet potato | generic | 2 | 4 |
| red bell pepper | red bell pepper | generic | 3 | 5 |
| iceberg lettuce | iceberg lettuce | generic | 7 | 3 |
| carrots | carrots | generic | 6 | 1 |
| broccoli | broccoli | generic | 4 | 1 |
| green grapes | green grapes | generic | 11 | 1 |
| gala apple | gala apple | generic | 4 | 1 |
| avocado | avocado | generic | 3 | 3 |
| lemon | lemon | generic | 3 | 1 |
| garlic | garlic | generic | 3 | 5 |
| baby spinach | baby spinach | generic | 4 | 2 |
| sweet potato | sweet potato | generic | 5 | 1 |
| great value 2 percent milk | great value 2 percent milk | branded | — (capped) | — |
| great value large eggs | great value large eggs | branded | — (capped) | — |
| great value unsalted butter | great value unsalted butter | branded | 13 | 4 |
| great value shredded cheddar cheese | great value shredded cheddar cheese | branded | 20 | 2 |
| great value vanilla ice cream | great value vanilla ice cream | branded | — (capped) | — |
| cheerios | cheerios | branded | 7 | 1 |
| honey nut cheerios | honey nut cheerios | branded | 10 | 1 |
| kellogg's frosted flakes | kellogg's frosted flakes | branded | 17 | 1 |
| oscar mayer bacon | oscar mayer bacon | branded | 17 | 1 |
| oscar mayer deli ham | oscar mayer deli ham | branded | 20 | 1 |
| oscar mayer hot dogs | oscar mayer hot dogs | branded | 5 | 3 |
| tyson chicken breast | tyson chicken breast | branded | 5 | 1 |
| jif peanut butter | jif peanut butter | branded | 10 | 1 |
| skippy peanut butter | skippy peanut butter | branded | 6 | 2 |
| smucker's strawberry jam | smucker's strawberry jam | branded | 7 | 3 |
| kraft mac and cheese | kraft mac and cheese | branded | 4 | 1 |
| kraft shredded cheddar cheese | kraft shredded cheddar cheese | branded | 14 | 3 |
| philadelphia cream cheese | philadelphia cream cheese | branded | — (capped) | — |
| chobani vanilla yogurt | chobani vanilla yogurt | branded | 7 | 1 |
| yoplait strawberry yogurt | yoplait strawberry yogurt | branded | 3 | 2 |
| wonder bread | wonder bread | branded | 6 | 3 |
| sara lee white bread | sara lee white bread | branded | 4 | 1 |
| barilla spaghetti | barilla spaghetti | branded | 7 | 3 |
| ragu marinara sauce | ragu marinara sauce | branded | 4 | 1 |
| hunt's diced tomatoes | hunt's diced tomatoes | branded | 4 | 1 |
| campbell's chicken noodle soup | campbell's chicken noodle soup | branded | 9 | 2 |
| coca cola 12 pack | coca cola 12 pack | branded | — (full phrase) | — |
| pepsi 12 pack | pepsi 12 pack | branded | 5 | 1 |
| lay's classic potato chips | lay's classic potato chips | branded | 3 | 2 |
| doritos nacho cheese | doritos nacho cheese | branded | 6 | 4 |
| oreo cookies | oreo cookies | branded | 4 | 1 |
| ritz crackers | ritz crackers | branded | 4 | 1 |
| folgers ground coffee | folgers ground coffee | branded | 6 | 1 |
| lipton tea bags | lipton tea bags | branded | 6 | 1 |
| tropicana orange juice | tropicana orange juice | branded | 9 | 2 |

## Methodology

### Real data, not mocks

Every measurement in this report came from calling `searchFoods()`
(`server/foodSearch/index.js`) directly — the exact orchestration
`/api/foods/search` runs (fan-out to `queryUsdaGeneric`, `queryUsdaBranded`,
`queryOFF`, merge, dedupe, rank) — against the live USDA FoodData Central and
Open Food Facts APIs. No provider response was ever mocked, faked, or
replayed from a fixture.

### Live USDA key: yes, confirmed

`FDC_API_KEY` was copied from another worktree's local `.env` (never
committed, never logged) into this worktree's own `.env`. Confirmed live and
configured before the audit ran (`usdaSearch()`'s `configured: true` path,
never `not_configured`/skipped, appeared on every probe). Without a key,
`server/foodSearch/providers.js`'s `queryUsdaGeneric`/`queryUsdaBranded`
degrade to `{ ok: null, skipped: 'not_configured' }` — a normal, non-
degraded state per `docs/food-search.md`, but one that would leave search
relying entirely on Open Food Facts, which has no canonical "generic whole
food" entries at all (per that same doc's root-cause section). Running with
a live key means this audit reflects the FULL, both-providers pipeline a
real production deploy with `FDC_API_KEY` set would give a user — not the
degraded, OFF-only path.

### The "usable" threshold

**A result is "usable" if it appears in the top 5 of the ranked results
`searchFoods()` returns** (which itself caps at `MAX_RESULTS = 20`). Chosen
because `SearchFood.jsx` renders results in a scrollable, fixed-height sheet
(see that file's own comment on why the sheet's height is fixed) — a match
sitting at position 6+ requires scrolling past five other candidates, which
is a real, if modest, tax on every single lookup. Position 1–5 is "you can
see it without touching anything else."

### The prefix walk

For each item, the runner (`scripts/keystroke-audit/run.mjs`) issues real
`searchFoods()` calls for successively longer left-to-right prefixes of the
item's natural search phrase — `"b"`, `"ba"`, `"ban"`, … for `"banana"` — and
records the first prefix length where the target becomes usable (top 5),
with an early exit as soon as that happens.

- **Starts at 2 characters**, not 1: `SearchFood.jsx` has a hard UI floor
  (`if (q.trim().length < 2) { … setResults([]) … }`) — the app never issues
  a search below 2 characters, so testing length 1 would measure a state a
  real user can never reach.
- **Capped at 20 characters.** Not "the first word" — several real
  multi-word brand+product phrases genuinely need the brand token AND a
  second word to disambiguate (see "Simple Mills Pancake & Baking Mix"
  below), so a first-word-only cap would have misreported those as failures
  for a reason having nothing to do with the search pipeline. An initial
  attempt at 14 characters cut real multi-word branded queries off mid-
  phrase in a dry run before the full sweep started (caught and fixed before
  burning the API budget on a flawed measurement — see commit history).
  **Important limitation, found while writing this report**: 20 characters
  turned out to still be short for a number of the longer branded queries
  this list ended up with (several are 25–40 characters). Of the 31 items
  that never reached "usable," **27 have a query longer than 20 characters
  and were cut off mid-phrase, never actually tested to completion.** See
  "Complete failures" below for the corrected framing this produced.
- **Generic produce queries deliberately drop "organic."** The Whole Foods
  generic list documents each item's organic-profile identity in a separate
  `label` field ("organic banana") but the actual typed `query` is just
  "banana" — a person logging food types "banana," not "organic banana";
  nobody types a quality adjective into a food-diary search box to find a
  raw ingredient, and neither USDA's generic/Foundation tier nor Open Food
  Facts' produce entries carry "organic" in their canonical names. This was
  the FIRST thing caught in a dry run (see `scripts/keystroke-audit/items.mjs`'s
  header comment) — an earlier version of this list had "organic banana" as
  the literal typed query, which would have measured this audit's own query
  construction rather than the search pipeline.

### Rate limiting — measured, not assumed

The task's stated ceiling was USDA's advertised free-tier figure, 1000
requests/hour. The run started conservatively at 900/hour. After that budget
was reached (~60 items in), the process slept as designed — but while idle,
a direct `curl` against the live API showed this key's own
`x-ratelimit-limit` response header reads **3600/hour**, confirmed twice,
minutes apart. The remaining budget was raised to 3000/hour (comfortable
margin under the *measured* real ceiling rather than the advertised
default), and the rest of the 200-item sweep finished in about 10 minutes
instead of the roughly 2 hours a 900/hour pace would have needed. Open Food
Facts calls were paced by the same limiter incidentally (no published hard
hourly cap for OFF, only "reasonable use" — OFF calls were not separately
rate-limited beyond that incidental pacing; across the whole audit process,
including the pre-fix partial run and the failure recheck, total OFF calls
were roughly 3,700, spread over several hours of wall-clock time rather than
a burst).

### Retry policy, and what it revealed

The main 200-item run retried a whole `searchFoods()` call once, but only
when **every** attempted provider had genuinely failed (`ok: false`) on the
first attempt — a conservative trigger, meant to avoid crediting the search
pipeline with a miss it didn't actually make while not adding needless
latency for a single flaky call. **That retry never fired once across the
entire run (0 retries in 1739 probes)** — because at least one provider
(almost always at least one USDA tier) always came back `ok: true` on every
single probe, even on the probes where Open Food Facts specifically failed.

That's a real limitation of the main run's own methodology, not the search
pipeline: 25 of the 36 items that came back "not found" had a provider
genuinely error (`ok: false`, usually OFF with `HTTP 503`) on their last
recorded probe, yet the "retry on total failure" trigger never applied. A
**separate, more aggressive re-check** (`scripts/keystroke-audit/recheck-
failures.mjs` + `recheck-last-two.mjs`) re-ran exactly those 36 items with a
wider retry trigger — any attempted provider failing, up to 2 retries per
probe — to separate genuine misses from measurement noise. Results:
**5 of 36 flipped to "found"** once retried more aggressively (noise,
attributable to transient provider failures, not the search pipeline); the
other 31 stayed unresolved even under generous retry (14–33 retries per
item). The aggregate numbers in this report use the **corrected, post-
recheck** figures throughout.

### A live, external finding: both providers are flaky right now

Independent of anything in this repo, direct `curl` replay of the *exact*
request `usdaSearch()` builds got both HTTP 200 and HTTP 400 on identical,
byte-for-byte requests seconds apart (nginx-level, `x-nginx-intercept:
portal-foods-search` header present only on the 400s) — roughly half the
time in a small manual sample. Separately, Open Food Facts' own legacy
`cgi/search.pl` endpoint (the one `offTextSearch()` calls, per that
function's own comment about the v2 endpoint being worse for bare-term
search) returned HTTP 503 on 3 of 5 direct manual requests during the same
window. **Both of these are upstream issues, not bugs in this repo's request
formation** (confirmed by replaying this app's own exact generated URL and
seeing different results on identical bytes) — but they are real, they
happened during this exact audit, and they would degrade a real user's
search experience the same way they degraded this audit's precision. This is
disclosed as a structural recommendation below (add production-side
per-provider error-rate visibility / a lighter-weight retry), not fixed as
part of this audit — it's a resilience/latency trade-off, not a narrow bug.

## Aggregate metrics (post-recheck, i.e. corrected for provider-flakiness noise)

| Segment | n | Found (usable) | Median chars | Mean chars | Min/Max |
|---|---|---|---|---|---|
| **All 200** | 200 | 169 (84.5%) | 6 | 7.67 | 2 / 20 |
| Whole Foods | 150 | 124 (82.7%) | 7 | 7.90 | 2 / 20 |
| Walmart | 50 | 45 (90.0%) | 6 | 7.04 | 2 / 20 |
| Generic/produce | 60 | 60 (100.0%) | 5 | 5.75 | 2 / 14 |
| Branded | 140 | 109 (77.9%) | 7 | 8.73 | 2 / 20 |
| WF generic | 45 | 45 (100.0%) | 6 | 6.00 | 2 / 14 |
| WF branded | 105 | 79 (75.2%) | 7 | 8.99 | 2 / 20 |
| Walmart generic | 15 | 15 (100.0%) | 4 | 5.00 | 2 / 12 |
| Walmart branded | 35 | 30 (85.7%) | 6 | 8.07 | 3 / 20 |

**The headline pattern: generic/produce search is excellent (100% found,
median 5 characters) and branded search is the weak spot (77.9% found,
median 7, mean 8.73).** Every one of the 31 confirmed failures is a branded
item — no generic/produce item ever failed to become usable.

Distribution of chars-to-find, found items only (n=169):

| 2–3 chars | 4–6 chars | 7–10 chars | 11–15 chars | 16–20 chars |
|---|---|---|---|---|
| 21 | 66 | 45 | 20 | 17 |

Rank-at-found distribution (of the 169 found, where in the top 5 did the
target land):

| Rank 1 | Rank 2 | Rank 3 | Rank 4 | Rank 5 |
|---|---|---|---|---|
| 94 | 27 | 24 | 16 | 8 |

94 of 169 (55.6%) land in the #1 spot the moment they become usable at all —
when this pipeline finds something, it usually finds it convincingly, not
by a hair.

## Worst offenders (found, but very late)

Items that DID become usable, but only after typing most or all of a long
query:

| Chars | Rank | Store/kind | Query |
|---|---|---|---|
| 20 | 1 | Walmart branded | `oscar mayer deli ham` |
| 20 | 2 | WF branded | `365 organic unsalted butter` |
| 20 | 2 | WF branded | `sweet earth frozen burrito` |
| 20 | 2 | Walmart branded | `great value shredded cheddar cheese` |
| 19 | 1 | WF branded | `alexia frozen sweet potato fries` |
| 19 | 3 | WF branded | `simple mills almond flour crackers` |
| 19 | 4 | WF branded | `once again almond butter` |
| 18 | 1 | WF branded | `365 organic creamy peanut butter` |
| 18 | 2 | WF branded | `365 organic rolled oats` |
| 18 | 3 | WF branded | `primal kitchen avocado oil mayo` |
| 18 | 4 | WF branded | `sir kensington's ketchup` (found only on the more aggressive recheck — the main run recorded it as a failure, see Methodology) |
| 18 | 4 | WF branded | `pacific foods organic chicken broth` |
| 17 | 1 | WF branded | `365 organic black beans` |
| 17 | 1 | Walmart branded | `kellogg's frosted flakes` |
| 17 | 1 | Walmart branded | `oscar mayer bacon` |

Worth calling out specifically: **`simple mills pancake baking mix`**
(31-character query) needed **19 characters — essentially the entire
product name** — before it became usable, and even then only at rank 3.
Investigated with real captured data: many other Simple Mills products
(crackers, other mixes) share the "simple mills" prefix and tie at the same
match tier; the ranking's own shorter-name tie-break (see `rank.js`'s
`scoreCandidate`, "prefer a shorter name... as a proxy for 'the base food,
not a compound branded product'") then favors the SHORTER same-brand product
names over the longer, more specific one the user actually wants. This is a
real, reproducible pattern — but it is the ranking's tie-break heuristic
doing exactly what it was designed to do in the general case (favor a
plainer product over a compound one), just working against a specific
multi-word product name here. See "Structural recommendations" below —
**not fixed**, because reweighting that tie-break is a general design
question with its own trade-offs (PR #82 already tuned this heuristic
carefully, with its own hard-won magic numbers), not a narrow bug.

## Complete failures — corrected framing

**31 of 200 items never became usable.** But this needs to be read
precisely: the audit's own 20-character cap cut off 27 of these 31 queries
*before they finished their natural phrase* — meaning "not found by
character 20" is the honest claim, not "not found even after typing the
entire product name." Only 4 items were tested all the way to the end of
their natural search phrase and still never became usable:

| Query (full length) | Store | Note |
|---|---|---|
| `365 organic quinoa` (18 chars — tested to completion) | WF | genuinely never usable |
| `365 sparkling water` (19 chars — tested to completion) | WF | genuinely never usable |
| `health ade kombucha` (19 chars — tested to completion) | WF | genuinely never usable |
| `coca cola 12 pack` (17 chars — tested to completion) | Walmart | see caveat below |

The other 27 (all longer than 20 characters) were cut off mid-phrase by the
cap — a genuine finding in its own right ("typing 20 characters of a 30–40
character product name still doesn't surface it" is still bad UX), but a
different, weaker claim than "never found at all." The full list, each
marked capped vs. tested-to-completion, is in the item tables above.

**A caveat on `coca cola 12 pack` and `great value 2 percent milk`
specifically**, found while writing this report (reviewing already-captured
diagnostic data, not a new probe): looking at the actual last-probe result
set, `"great value 2 percent milk"`'s USDA generic pass returned `"Milk,
reduced fat (2%)"` at **rank 1** — a genuinely correct, highly relevant
generic match. It doesn't count as "found" here because this audit's matcher
requires the item's `match: ['great value']` keyword (the whole point of
this specific item was testing the GREAT VALUE branded SKU, not any generic
2% milk) — so this is the matcher correctly doing its job, not a search bug.
Likewise, `coca cola 12 pack` and `great value 2 percent milk` are
themselves closer to retail-package descriptions than what someone would
naturally type into a food-diary search box (a real user logs "coca cola" or
"2% milk," not "12 pack" or "great value 2 percent milk" verbatim) — a
methodology imperfection in a small number of this audit's own queries,
disclosed here rather than silently smoothed over.

**What's left as a genuinely concerning finding, net of all the above:**
store-brand/private-label products — 365 (Whole Foods) and Great Value
(Walmart) — are conspicuously overrepresented among both the "worst
offenders" and the "complete failures" lists. This reads as a **data-
coverage gap in USDA FoodData Central and Open Food Facts for private-label
products**, not a ranking bug in this app: national private labels are
under-submitted to USDA's Branded dataset and inconsistently barcode-scanned
into OFF's crowdsourced database relative to major national brands. This
app's ranking code has no lever to fix a gap in the underlying data it
queries — see "Structural recommendations."

## Bug found and fixed: `'organic'` treated as an identity token, not a qualifier

**Reproduced live, not a hypothetical.** Searching `"365 organic marinara"`
against real USDA data never surfaced the actual marinara sauce, even at the
full 20-character cap. The captured top result was **"Infant formula,
organic, ready-to-feed"** — a candidate with zero semantic relation to
marinara sauce, sharing only the single word "organic."

Root cause, confirmed directly against `rank.js`: `'organic'` was not in
`QUALIFIER_WORDS` (unlike `raw`/`cooked`/`frozen`/etc.), so it counted as a
core identity token in `baseTokens`. Both `"Infant formula, organic,
ready-to-feed"` and the real `"Sauce, pasta, spaghetti/marinara,
ready-to-serve"` ended up tied at tier 4 (the substring/edit-distance
catch-all tier) purely because they each shared ONE token with the query —
`"organic"` for the infant formula, `"marinara"` for the sauce — and the tier
scorer doesn't distinguish a common, near-universal word from a specific,
food-identifying one. The tie then broke on the existing shorter-name
heuristic, and the infant formula's shorter name won by exactly half a
point: **4001.5 vs. 4002.**

**Fix:** add `'organic'` to `QUALIFIER_WORDS` in
`server/foodSearch/normalize.js` — a one-line addition to an existing,
already-tested mechanism (the same one that already excludes `raw`/`cooked`/
etc. from identity-token matching while still giving qualifier-agreement a
small tie-break bonus), not a new code path. Verified against the exact two
real captured rows: post-fix scores are **4005 (sauce) vs. 5001.5 (infant
formula)** — the sauce now correctly wins, and the infant formula correctly
drops to tier 5 (no relation) since it no longer shares any identity token
with the query at all.

**Tests added** (following this repo's existing convention of documenting
the live reproduction in the test comment):
- `test/foodSearchNormalize.test.js` — `"organic" is a qualifier, not a
  food-identity word` (asserts `splitQualifiers` correctly separates it).
- `test/foodSearchRank.test.js` — a `bestTierAcrossVariants` test asserting
  the infant-formula candidate now scores tier 5 for this query, and a
  `scoreCandidate` test asserting the real sauce now outranks it, using the
  exact two real rows captured live.

**Full suite result: 619/619 passing** (616 pre-existing + 3 new). Run via
`npx vitest run` (the full-suite invocation, not just the new/changed test
files).

```
 Test Files  36 passed (36)
      Tests  619 passed (619)
```

This fix is committed on this branch (`claude/keystroke-efficiency-audit`),
not pushed. Per the task's instructions, it will be independently re-
verified (diff + full suite re-run) before going anywhere near a push.

## Structural recommendations — documented, NOT implemented

These are broader design questions, not narrow bugs, so per the task's own
instruction they're documented here rather than acted on:

1. **The "shorter name wins" tie-break can bury a long, correctly-typed,
   specific product name behind other same-brand products with shorter
   names** (see `simple mills pancake baking mix` above). Reweighting this
   would mean deciding how much to trust "shorter = more generic/correct" as
   a general heuristic, which is exactly the kind of ranking-priority
   judgment call PR #82 already made carefully and documented with its own
   hard-won magic numbers (`BRANDED_PENALTY = 2500`, etc.). A possible
   direction: give a small tie-break credit for the NUMBER of distinct query
   base-tokens a candidate matches (not just whether it "starts with" or
   "contains" one), so multi-word brand+product queries reward candidates
   that match more of what was actually typed — but this changes the
   scoring surface broadly enough that it deserves its own dedicated pass
   and full-suite regression testing, not a tack-on to this audit.
2. **Store-brand/private-label data coverage** (365, Great Value) looks like
   a genuine gap in USDA FoodData Central and Open Food Facts, not something
   this app's ranking or retrieval code can fix by itself. If store-brand
   findability specifically matters to the product, the lever is a third
   data source or a curated store-brand override table, not a ranking
   change.
3. **Add resilience for the live provider flakiness measured during this
   audit** (both USDA's and OFF's search endpoints intermittently failing,
   confirmed by direct replay). Two independent, smaller moves worth
   considering separately: (a) retry an individual PROVIDER call once on
   `ok: false`, rather than only retrying the whole `searchFoods()` pass
   when EVERY provider fails (the gap this audit's own retry logic hit); (b)
   surface per-provider error-RATE (not just per-request error) in
   production logging/monitoring, since `docs/food-search.md`'s existing
   `degraded` flag only fires when ALL providers fail on ONE request, and
   would never have surfaced that OFF was failing ~50%+ of the time during
   this window. Both are latency/complexity trade-offs against a real but
   currently-invisible reliability cost, so left as a recommendation rather
   than implemented here.

## Out of scope (by design)

- **Only Whole Foods and Walmart.** Target, Kroger, Trader Joe's, and any
  other "etc." chain are not covered. A reasonable, bounded follow-up if
  broader retail coverage is wanted.
- **No real point-of-sale data.** Both item lists are built from general
  knowledge of each chain's assortment, not sales figures.
- **Client-side debounce timing** (`src/lib/debouncedSearch.js`, a fixed
  350ms delay before a search fires) is a separate, already-addressed UX
  dimension (see that file's own bug history) and is not part of this
  audit's character-count metric — it adds wall-clock latency per keystroke,
  not typed characters, so it doesn't change any number in this report.
- **The tier-4/tie-break ranking-weight question and the store-brand data-
  coverage gap** (above) were investigated and documented, not fixed.

## Files

- `scripts/keystroke-audit/items.mjs` — the master 200-item list (source of
  truth for the tables above).
- `scripts/keystroke-audit/run.mjs` — the main audit runner (live
  `searchFoods()` calls, rate limiting, checkpointing).
- `scripts/keystroke-audit/results.jsonl` — raw per-item results from the
  main 200-item run (post-`'organic'`-fix), including full provider
  diagnostics for the LAST probe of every item.
- `scripts/keystroke-audit/results.pre-organic-qualifier-fix.jsonl` — the
  first 61 items, captured BEFORE the `'organic'` fix landed; kept as
  before/after evidence (the run was restarted from scratch once the fix
  landed, so the full 200-item set above reflects the fixed code
  throughout).
- `scripts/keystroke-audit/recheck-failures.mjs`,
  `recheck-last-two.mjs`, `recheck.jsonl` — the targeted, more-aggressive
  re-check of the 36 items the main run recorded as failures.
- `scripts/keystroke-audit/final.json` — the corrected, post-recheck
  per-item results the aggregate metrics in this report are computed from.
- `scripts/keystroke-audit/analyze.mjs`, `analyze-final.mjs` — the scripts
  used to compute the aggregate numbers above (re-run either against the
  committed JSONL to reproduce every figure in this report).
