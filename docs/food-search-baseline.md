# Food search — baseline reproduction and root-cause analysis

26 Aug 2026. Branch `claude/food-search-pipeline-overhaul`, baselined against
`origin/main` at `8be1385` (which already contains the prior audit's
one-line "organic is a qualifier" fix, PR #91).

This document is the **before** state. Every number in it was measured, not
inferred. Nothing here uses "found eventually" as a success criterion: the
question throughout is *what does a user see at each moment*, including the
wrong intermediate states.

**How to re-run everything below**

```bash
cp /path/to/an/.env-with-FDC_API_KEY .env      # USDA key; OFF needs none
npm install
PORT=4788 SESSION_SECRET=devsecret node server/index.js &
API_TARGET=http://localhost:4788 npx vite --port 4789 --host 127.0.0.1 &
curl -s -c c.txt -X POST -H 'Content-Type: application/json' \
  -d '{"email":"dev@local.test","password":"devpassword123"}' \
  http://127.0.0.1:4788/api/auth/signup
curl -s -b c.txt -X PUT -H 'Content-Type: application/json' \
  -d '{"calories":2200,"protein_g":150,"carbs_g":220,"fat_g":70}' \
  http://127.0.0.1:4788/api/targets        # skips onboarding
node scripts/food-search-eval/run.mjs      # the Phase 5 corpus run
```

Browser evidence was captured with Playwright
(`chromium.launch({executablePath:'/opt/pw-browsers/chromium'})`) against that
dev server; the raw timelines are in `docs/food-search-evidence/*.json` and the
screenshots alongside them.

---

## 1. The six reported production behaviours — all six reproduced

| # | Reported production behaviour | Reproduced? | Evidence |
|---|---|---|---|
| 1 | "zucchini" briefly shows **No matches** before late results arrive | **Yes** | `01-premature-no-matches.png`, trace below |
| 2 | zucchini → banana → Greek yogurt in quick succession leaves the previous query's results under the new one | **Yes**, in two distinct forms | `05-…png`, `08-stale-commit.png` |
| 3 | "banana" ranks branded/high-calorie products and banana chips above a plain raw banana | **Yes** | live capture, §3 |
| 4 | "zucchini" ranks a branded **KMB** row above the generic USDA food | **Yes**, verbatim | live capture, §3 |
| 5 | Selecting a search result says "Scanned · USDA" and shows a barcode | **Yes** | `10-foodconfirm-says-scanned.png` |
| 6 | The no-results state suggests adding a USDA key although USDA is configured | **Yes** | §2.6 |

Production `/api/health`, fetched read-only 26 Aug 2026 14:44 UTC:

```
{"ok":true,"backend":"postgres","ocr":"not-configured","usda":"configured",...}
```

`usda: "configured"` — so #6 is advice to install something that is already
installed. (`/api/search` on production requires a session, so all search
measurements below are against the local dev server using the same code and
the same live USDA + Open Food Facts upstreams.)

### 1.1 Symptom 1 — "No matches" before anything has been requested

Browser, typing `zucchini` into a freshly opened search sheet:

```
 +~50ms   input="zucchini" visible=[]  noMatches=true   spinner=false   usdaKeyCopy=true
 +~150ms  input="zucchini" visible=[]  noMatches=true   spinner=false   usdaKeyCopy=true
 +~300ms  input="zucchini" visible=[]  noMatches=false  spinner=true
 settled  input="zucchini" visible=[ZUCCHINI, ZUCCHINI BAKE…, ZUCCHINI BREAD…]
```

For the first ~350 ms the user is told the food does not exist **and** told to
go configure a USDA key. No request has been issued at that point. Symptoms 1
and 6 are the same render path.

### 1.2 Symptom 2a — the previous query's results stay under the new query

Browser, `banana` settled, then the input replaced with `greek yogurt` in a
single change (as a real typist does — never passing through a sub-2-character
value):

```
  banana settled       q="banana"       showing=[Banana, baked | Banana, raw | Banana chips]
  +60ms                q="greek yogurt" showing=[Banana, baked | Banana, raw | Banana chips]  spinner=false
  +250ms               q="greek yogurt" showing=[Banana, baked | Banana, raw | Banana chips]  spinner=false
  +600ms               q="greek yogurt" showing=[Banana, baked | Banana, raw | Banana chips]  spinner=true
  settled              q="greek yogurt" showing=[GREEK YOGURT | GREEK YOGURT | GREEK YOGURT]
```

The first ~350 ms of that is the worst state available: a settled-looking list,
no spinner, wrong query. Nothing in the DOM marks those rows as stale.

### 1.3 Symptom 2b — an OLDER response *commits* under a NEWER query

Deterministic reproduction, synthetic responses fulfilled at an exact delay
(`docs/food-search-evidence/repro-trace-stale-commit.json`): `zucchini`
resolves 150 ms after its request starts; the query is switched to `banana`
50 ms before that, so `zucchini`'s response lands **inside** `banana`'s
350 ms debounce window, before `banana`'s request has started.

```
  + 654ms  after A(zucchini) lands   q="banana"  showing=[ZUCCHINI (stale)]  spinner=false
  >>> STALE COMMIT: YES
  + 1055ms t=880 (B in flight)       q="banana"  showing=[ZUCCHINI (stale)]  spinner=true
  + 5271ms after B(banana) lands     q="banana"  showing=[Banana, raw]
```

The input reads `banana`, the committed rows are zucchini's, and the spinner is
**off** — the UI presents one query's answer as another query's finished
result. This is the severe form of #2 and the existing sequence guard does not
stop it (§2.3).

---

## 2. Root causes — confirmed, with the before-state code

### RC-1 — "No matches" is rendered against a query that has not been searched yet

`src/components/SearchFood.jsx:104`

```jsx
{!busy && !error && q.trim().length >= 2 && !degraded && results.length === 0 && (
  <EmptyState title="No matches">
```

`busy` is only set inside the debounce callback:
`src/lib/debouncedSearch.js:34-37` — `timer = setTimeout(async () => { const id = ++seq; onStart?.() … }, delay)`. So for the whole 350 ms debounce
window (and on the first search of a session) `busy === false`,
`results.length === 0`, and the empty state renders. **The empty state is not
bound to the completion of anything.**

### RC-2 — committed results carry no record of which query produced them

`src/components/SearchFood.jsx:32-35`

```jsx
onResult: (body) => {
  setResults(body.results)
  setDegraded(!!body.degraded)
},
```

`results` is a bare array. The `useEffect` on `[q]` (`:41`) clears it **only**
when the query falls below 2 characters. A query change from one valid query to
another leaves the old rows mounted and unmarked. There is no
`resultsForQuery`, no generation counter in state, and no equality check
between the response's query and the current one.

### RC-3 — the stale-response guard is armed too late to cover the debounce window

`src/lib/debouncedSearch.js:32-47`

```js
search(query, { onStart, onResult, onError, onSettled } = {}) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const id = ++seq                 // <- sequence bumped only when a request STARTS
    …
    const results = await fetchFn(query)
    if (id !== seq) return           // stale only relative to a request that has started
```

`cancel()` (`:52`) clears the pending timer and nothing else — it does not bump
`seq` and cannot abort work already in flight. Between a query change and the
next request actually starting, `seq` is unchanged, so an in-flight response for
the *previous* query still satisfies `id === seq` and commits. That is exactly
the window §1.3 exploits. The same hole lets a request commit after the query
has been erased below the 2-character floor.

### RC-4 — no `AbortController` in the client fetch path at all

`src/api/client.js:4-8` builds every request as `fetch(path, {headers, ...options})`
with no `signal`, and `searchFoods: (q) => req('/search?q=…')` (`:40`) accepts no
options. A superseded search runs to completion against USDA and Open Food
Facts and its result is (at best) thrown away after the fact.

### RC-5 — `busy` is a single flag, not per-query state

`onSettled` (`debouncedSearch.js:45`) clears `busy` for whichever request settled
last. Combined with RC-3 this is what turns RC-1's flash into a *sustained*
wrong state: in §1.3 the spinner is off while the current query has no answer.

### RC-6 — "Scanned" is inferred from a data field, not from how the food was obtained

`src/components/FoodConfirm.jsx:84-85`

```jsx
// A barcode on the record means it came in through the scanner; say so.
const provenance = draft.barcode ? `Scanned · ${sourceLabel}` : sourceLabel
```

The premise is false. Every USDA **Branded** row carries `gtinUpc` and every
Open Food Facts row carries `code`:

- `server/lookup.js:148` `barcode: food.gtinUpc || requestedBarcode || null`
- `server/lookup.js:105` `barcode: barcode || product.code || null`
- `server/foodSearch/providers.js:59` `normalizeOFF(p, p.code || null)`

and `src/App.jsx:268` `const toConfirm = (food) => { setDraftFood(food); … }`
passes the search result through untouched. There is no `search_method` /
`origin` field anywhere in the pipeline. Measured in-browser: typing "zucchini"
and picking result #1 renders **`SCANNED · USDA`** and the barcode
`812997020233`.

### RC-7 — the empty state prescribes a fix for a condition it never checks

`src/components/SearchFood.jsx:106`

```jsx
Try manual entry instead — or, on the server, add a USDA key for better whole-food coverage.
```

`GET /api/search` returns `{results, degraded}` only (`server/index.js:266`);
USDA's configured state is known to the server (`providers.js:36` distinguishes
`skipped:'not_configured'`) and is thrown away before the response. Production
reports `usda: "configured"`. The advice is unconditional and, in production,
wrong.

### RC-8 — the canonical-food provider pass fails ~50% of the time (and takes the other two datasets down with it)

`server/foodSearch/providers.js:35`

```js
const { configured, foods, error } = await usdaSearch(query, {
  dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'], pageSize })
```

Measured directly against `api.nal.usda.gov`, n=20 identical requests each:

| `dataType` | failures | rate |
|---|---|---|
| `Foundation,SR Legacy,Survey (FNDDS)` (current) | 10/20 | **50 %** |
| `Survey (FNDDS)` alone | 11/20 | **55 %** |
| `Foundation,SR Legacy` | 0/20 | 0 % |
| `Foundation` alone | 0/6 | 0 % |
| `SR Legacy` alone | 0/6 | 0 % |
| `Branded` | 0/20 | 0 % |
| no `dataType` | 0/6 | 0 % |

The failure is a bare nginx `400 Bad Request` and it is **bound to the
`Survey (FNDDS)` value**, not to request formation and not to general upstream
flakiness. Four different encodings of that value were tried
(`Survey+%28FNDDS%29`, `Survey%20%28FNDDS%29`, `Survey%20(FNDDS)`,
`Survey+(FNDDS)`) and all fail at the same ~50 % rate, while every request
without it succeeds. This **corrects** the prior audit's recorded conclusion
(`scripts/keystroke-audit/run.mjs:29-37`) that USDA "intermittently returns a
bare HTTP 400 on byte-identical requests" — the requests were not equivalent;
one dataType value was poisoning the call.

Because all three datasets share one HTTP call, Survey's ~50 % failure removes
**Foundation and SR Legacy too**. Half of all searches therefore lose the entire
canonical whole-food candidate pool before ranking runs. This is the direct
cause of symptoms 3 and 4.

Survey cannot simply be dropped: it is the only dataset with a usable canonical
`Oatmeal, NFS`, `Avocado, raw` and plain `Peanut butter` (Foundation/SR Legacy
return oatmeal *bread* and *cookies* for "oatmeal"). It has to be its own,
separately-retried call.

### RC-9 — `degraded` is all-or-nothing, so partial failure is reported as success

`server/foodSearch/index.js:88-89`

```js
const attempted = sourceReports.filter((r) => r.ok !== null)
const degraded = attempted.length > 0 && attempted.every((r) => r.ok === false)
```

In the captured baseline of the ten required queries, **nine had at least one
genuinely failed provider call and all ten returned `degraded: false`.**
"chicken breast" ran with USDA-generic at HTTP 400 *and* Open Food Facts at
HTTP 503 — one surviving provider, branded-only — and reported complete
success. This is the "reports success while doing nothing" shape: the response
is structurally indistinguishable from a healthy one.

### RC-10 — the Open Food Facts endpoint fails 45 % of the time

`server/lookup.js:232` uses the legacy `cgi/search.pl`. Measured over the same
20 queries, 700 ms apart:

| endpoint | failures | p50 | p95 |
|---|---|---|---|
| `world.openfoodfacts.org/cgi/search.pl` (current) | **9/20 (45 %)** | 549 ms | 1158 ms |
| `search.openfoodfacts.org/search` | **0/20 (0 %)** | 166 ms | 778 ms |

Failures are HTTP 503 with no `Retry-After`, and they are not paced away: a
single call after a 20 s idle still 503'd. Worse, the fan-out issues up to
three *concurrent* cgi calls per user search (primary + 2 synonym variants);
a burst of 3 measured 3/3 503. `api/v2/search` also 503s and, per
`docs/food-search.md`, does not rank by search terms anyway.

### RC-11 — same-tier ties fall through to provider order, so the canonical food loses to a prepared dish

`server/foodSearch/rank.js:105-125`. For the query `banana`:

| candidate | tier | branded | completeness | qualifier | extra tokens | **score** |
|---|---|---|---|---|---|---|
| `Banana, baked` | 2 (prefix) | no | 4/4 | n/a | 1 | **2000.5** |
| `Banana, raw` | 2 (prefix) | no | 4/4 | n/a | 1 | **2000.5** |

An exact tie, broken by the stable sort — i.e. by whatever order USDA
returned. Live capture: `Banana, baked` (161 kcal) first, `Banana, raw` second,
`Banana chips` (519 kcal) third. Same mechanism, same day:

- `avocado` → **`Avocado dressing` (427 kcal)** at rank 1, above `Avocado, raw`
- `oatmeal` → `Oatmeal, multigrain` above `Oatmeal, NFS`

Nothing in the scorer knows that "raw"/"NFS"/plain is the *base* form of a food
and "baked"/"dressing"/"pudding" is a different food.

### RC-12 — USDA's canonical names are inverted, and the tier ladder punishes exactly that shape

The real Foundation row for zucchini is
`Squash, summer, green, zucchini, includes skin, raw`. The query token is not a
prefix and the token sets do not match, so `tierFor` (`rank.js:28-52`) lands it
at **tier 3 → 3000**. A branded product literally named `ZUCCHINI` is tier 0,
and `BRANDED_PENALTY = 2500` (`rank.js:103`) was deliberately sized to bridge
"tier 0 to tier 2" only — so it scores **2500** and wins. That is symptom 4,
verbatim, and it survives even when RC-8's provider call succeeds:

```
$ curl -b c.txt 'localhost:4788/api/search?q=zucchini'      # generic pass DID succeed
1 Zucchini, pickled      usda
2 ZUCCHINI  (KMB, LLC)   usda   barcode 812997020233
3 Bread, zucchini        usda
4 Muffin, zucchini       usda
```

### RC-13 — there is no generic-vs-branded *query intent* signal

Nothing in `normalize.js` or `rank.js` inspects the query to decide whether the
user is naming a commodity food or a specific product. The only branded signal
is `BRANDED_PENALTY`, a flat constant applied to the *candidate* regardless of
what was asked. "banana" and "Chobani vanilla" are ranked by identical rules;
there is no way to prefer canonical foods for the first without also demoting
the correct answer to the second.

### RC-14 — dedup cannot collapse near-identical rows

`server/foodSearch/index.js:21-28` keys on `barcode` first, else
`name:${source}:${name}`. Two pack sizes of the same product have different
barcodes and both survive; and because `source` is in the fallback key, the
same food from USDA and from OFF never dedupes. Measured in a single 20-row
result list:

- `coca cola` → `Coca Cola — Coca-Cola` ×4
- `greek yogurt` → `GREEK YOGURT — Chobani, Inc.` ×2

### RC-15 — no overall deadline, no partial-results path

`server/foodSearch/index.js:41` `const reports = await Promise.all(calls)` waits
for the slowest of up to nine provider calls, each with its own 6 s ceiling
(`server/lookup.js:8`). One hanging provider holds back a response that is
otherwise complete, and nothing in the response says which calls were still
outstanding. There is no server-side or client-side search deadline.

### Cache layer — checked, and it is not the bug

The only cache in the search path is the PWA runtime cache
(`vite.config.js:26-38`): `NetworkFirst` over `/api/*` GETs. Cache keys are full
URLs, so `?q=banana` and `?q=zucchini` cannot collide — **no cross-query
contamination is possible**, and the app is single-account per browser profile
so there is no cross-user path either. Its one real hazard is
`networkTimeoutSeconds: 5`: on a slow network it will serve a *previous*
response for the *same* query without saying so. There is no server-side search
cache at all.

---

## 3. Baseline relevance — the ten required queries, live data

Captured 26 Aug 2026 against live USDA + OFF (raw JSON:
`docs/food-search-evidence/baseline-queries.json`). "GOLDEN" marks a query
where a canonical generic food must be rank 1.

| query | rank-1 result | correct? | degraded flag | provider calls that actually failed |
|---|---|---|---|---|
| zucchini **GOLDEN** | `ZUCCHINI` — KMB, LLC (branded, barcode) | **no** | `false` | usda/generic 400, off 503 ×2 |
| banana **GOLDEN** | `Banana, baked` (161 kcal) | **no** | `false` | off 503 |
| greek yogurt | `GREEK YOGURT` — Ocean Spray (467 kcal) | **no** | `false` | off 503 ×2, usda/generic 400 |
| chicken breast **GOLDEN** | `CHICKEN BREAST` — Giant Eagle (branded) | **no** | `false` | usda/generic 400, off 503 |
| oatmeal **GOLDEN** | `Oatmeal, multigrain` | **no** | `false` | usda/generic 400 (variant) |
| avocado **GOLDEN** | `Avocado dressing` (427 kcal) | **no** | `false` | — (all three OK) |
| salmon **GOLDEN** | `SALMON` — High Liner Foods (branded) | **no** | `false` | usda/generic 400, off 503 |
| peanut butter **GOLDEN** | `PEANUT BUTTER` — Reginald's (600 kcal) | **no** | `false` | usda/generic 400 |
| coca-cola (branded) | `Coca Cola` — Coca-Cola | **yes** | `false` | usda/generic 400, off 503 ×2 |
| zuccini (typo) | `ZUCCHINI` — KMB, LLC | **no** | `false` | usda/generic 400 ×2, off 503 |

**Golden set: 0 / 7 correct at rank 1.** Branded intent (`coca-cola`) is the one
query the pipeline gets right. Ten of ten searches reported `degraded: false`;
nine of ten had a genuinely failed provider call inside them.

Note that `avocado` failed with **all three providers healthy** — proof that
RC-11/RC-12 are real ranking defects and not merely downstream of RC-8/RC-10.

---

## 4. What the prior audit's headline metric could not see

The merged audit's headline was "character 20" keystroke efficiency — the
prefix length at which a target appears in the top 5. Every one of the six
reported production behaviours is invisible to that metric:

- it never looks at rank 1, only "within top 5", so `Avocado dressing` above
  `Avocado, raw` scores as a success;
- it calls `searchFoods()` directly, so it cannot see any client state bug
  (symptoms 1, 2, 5, 6 are all client-side or client/server contract);
- it treats a provider failure as noise to be retried away
  (`run.mjs:37-46`) rather than as the defect it is, which is how a 50 %
  failure of the canonical-food pass survived a 200-item sweep;
- and its own captured data contains the evidence — `results.jsonl` line 1 shows
  `usda/generic … "ok":false,"error":"HTTP 400"` for `bana` — recorded, and
  scored as a pass.

The replacement metric set is in `docs/food-search-eval.md`.
