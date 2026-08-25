# QA/QC report

Ongoing quality audit of this repo (product name "Fuel"; repo name
`nutrition-tracker` predates the rebrand — that mismatch is known and
accepted, not tracked here). Each pass is read-only research plus, where
safe, direct fixes; large/risky items (auth, OAuth, `schema.sql`, payment,
the wearable provider abstraction, data-model changes) are reported only,
never touched directly by this process. Design/aesthetic opinions that
aren't objectively broken are listed separately for the owner to route
manually — see [`docs/PWA-RESPONSIVE-REPORT.md`](./PWA-RESPONSIVE-REPORT.md)
for the existing responsive/accessibility audit, which already covers touch
targets, overflow, zoom, and the app's required UI states; this report
doesn't repeat that ground.

## Open items

| Severity | Area | Description | Status |
|---|---|---|---|
| Critical | Privacy policy | Privacy policy states the app has "no user accounts and no login" and doesn't collect passwords — the app has a mandatory multi-user login with hashed passwords | Reported (2026-08-25) |
| Critical | Privacy policy | Biometric profile data (height, weight, age, sex, activity level, goal) is collected and stored but not disclosed anywhere in the privacy policy | Reported (2026-08-25) |
| Critical | README | "Single user, no accounts" (README's headline claim) is contradicted by a mandatory, self-service multi-user login gate with no guest/demo mode | Reported (2026-08-25) |
| High | Legal pages | Apple Health is a fully shipped data-collection path (native iOS companion → `POST /api/apple/ingest`) with zero disclosure in either legal page | Reported (2026-08-25) |
| High | Apple integration | `POST /api/apple/token` (generates the iOS companion's sync token) is undocumented in README and has no UI affordance in Connections — the integration isn't usable end-to-end through the app itself | Reported (2026-08-25) |
| Medium | Insights.jsx | Hardcodes "Oura"/"Garmin" in two section headers instead of reading the actually-connected provider (Plan.jsx already does this correctly) | Reported (2026-08-25) |
| Medium | Search (OFF) | Search depends on Open Food Facts' legacy `cgi/search.pl` endpoint, which returned intermittent 503s during this pass (reproduced independently of the app) | Reported (2026-08-25) |
| Info | Live deploy | `GET /api/health` on the live site reports `backend: "json-file"` — no `DATABASE_URL` configured in production, so data lives in the container's local store, not Neon | Reported (2026-08-25) |
| Info | Live deploy | Live site hasn't redeployed since before this session's first pass (identical ETag/Last-Modified across all three passes today) — now 12 merged commits behind `main`, including the SEO/robots.txt fix | Reported (2026-08-25) |
| — | SEO metadata | Missing `<meta name="description">`, no `robots.txt` | Merged (2026-08-25, PR #18) |
| — | Accessibility | Search-foods input had no accessible name (placeholder only) | Merged (2026-08-25, PR #19) |
| — | Connections copy | "Delete synced history" footer described working functionality; button admits it's not wired up | Merged (2026-08-25, PR #20) |
| — | Legal pages | Garmin described as "(planned)" / "later" though the integration is actually built | Merged (2026-08-25, PR #21) |
| — | Terminology | Today's third context cell said "Training" (elsewhere "Workouts"); Insights caption said "recovery" next to a "Readiness" header | Merged (2026-08-25, PR #22) |
| — | README copy | README quoted the disclosure label as "Why?"; actual component text is "Why this?" | Merged (2026-08-25, PR #23) |
| High | Deploy config | Non-Docker deploy path (`npm start`, README's own documented option) never sets `NODE_ENV=production` — session cookie ships without `Secure` and CORS reflects any origin | Reported (2026-08-25) |
| High | JSON-file store | `persist()` writes the whole file in place, no temp-file+rename; a crash mid-write corrupts it, and `load()`'s catch treats corruption the same as "fresh install" — silent total data loss, no log line | Reported (2026-08-25) |
| High | Garmin webhook | `POST /api/garmin/webhook` has no signature/shared-secret verification — spoofable wearable-data injection if a `garmin_user_id` ever leaks | Reported (2026-08-25) |
| High | Apple ingest token | Legacy `APPLE_INGEST_TOKEN` compared with plain `===`, not `crypto.timingSafeEqual` — same bug class already fixed for login, missed here | Reported (2026-08-25) |
| High | Today.jsx | The "Intake so far" calorie numeral (38px) renders larger than the focal recommendation's own title (29px) — contradicts README's "single focal recommendation" design intent | Reported (2026-08-25) |
| Medium | Apple ingest token | Doubles as a bearer credential for the *entire* authenticated API (not just ingest) if it leaks — a deliberate tradeoff per the code's own comment, worth explicit owner sign-off | Reported (2026-08-25) |
| Medium | Input validation | `zod` is a dependency but is only used to validate OCR *output*, never HTTP input — `PUT /api/targets` has zero server-side validation; several other mutating routes are similarly unchecked | Reported (2026-08-25) |
| Medium | `upsertFoodByBarcode` | TOCTOU race between the existence check and the insert; Postgres surfaces a raw unique-violation error, the JSON store has no uniqueness backstop at all and can silently create duplicate barcode rows | Reported (2026-08-25) |
| Medium | Signup | Concurrent signups with the same email leak a raw Postgres constraint-violation message instead of the intended 409 (JsonStore already handles this correctly; Postgres doesn't) | Reported (2026-08-25) |
| Medium | Garmin OAuth | `refreshAccessToken`/`validAccessToken` are fully implemented but never called anywhere — dead code, so there's no automated recovery if a Garmin token needs refreshing to keep the webhook subscription alive | Reported (2026-08-25) |
| Medium | Apple integration | Toggling "Apple Health" off in Connections doesn't stop `/api/apple/ingest` from accepting writes — the enabled flag isn't checked on the write path | Reported (2026-08-25) |
| Medium | Error handling | The generic `asyncH` catch-all returns raw `err.message` to the client on every 500, including raw DB driver errors (compounds the two findings above) | Reported (2026-08-25) |
| Medium | Provider abstraction | README's "adding a provider means adding an adapter" claim doesn't fully hold: `providers.js` has three separate provider-name branches (registry, preference map, `providerStatus`/`realSignals`/`neverConnected`) that each need a new case, and Apple has no dedicated `server/integrations/apple.js` — its logic lives inline in `index.js` | Reported (2026-08-25) |
| Medium | Insights.jsx | Nutrition-trend day-bucketing (`/api/insights`) computes calendar days using the **server's** local timezone, not the client's — unlike `/api/today` and `/api/entries`, which correctly use client-supplied bounds (see `src/lib/nutrition.js`'s own comment: "no server-side timezone config is needed"). Verified live: two entries logged 3 hours apart, meant to represent one evening, were split into two separate tracked days by `/api/insights` when the server runs in UTC (the deployed default) and the entries straddle UTC midnight | Reported (2026-08-25) |
| Medium | Onboarding | A fresh signup drops straight into an empty Today with no baseline-setup prompt and no mention that a demo scenario exists to explore — `Auth.jsx`'s own comment says "there is no tour or guest mode" | Reported (2026-08-25) |
| Medium | Auth | No "forgot password" / account-recovery path exists anywhere in `Auth.jsx` — a self-service-signup user who forgets their password has no in-app recourse | Reported (2026-08-25) |
| Low | schema.sql | No `CHECK` constraints on numeric ranges (`servings_consumed`, `calories`, etc.) — combined with the validation gap above, nothing stops negative or absurd values from being persisted | Reported (2026-08-25) |
| Low | schema.sql | No composite `(user_id, logged_at)` index for the dominant query pattern used by `/entries`, `/today`, `/insights` — two single-column indexes instead | Reported (2026-08-25) |
| Low | Today.jsx | Day-navigation (‹ ›) is the only frequent control anchored at the very top of a tall screen, a one-handed-reach soft spot distinct from the touch-target-size issues already tracked in the responsive report | Reported (2026-08-25) |
| Info | `src/api/client.js` | `api.history()` calls `/api/history`, a route that doesn't exist anywhere in `server/index.js` — dead client method, would 404 if ever invoked | Reported (2026-08-25) |
| — | Error/empty-state copy | `LabelScan`/`SearchFood` errors told the user to set a server env var instead of suggesting an in-app fallback | Merged (2026-08-25, PR #26) |
| — | Sheet component | The food-confirm step had no visible close button (tied to a `title` prop it doesn't pass) | Merged (2026-08-25, PR #27) |
| — | Cancel buttons | Three different visual styles for the same "back out" action across FoodConfirm/SmartPlanForm/Plan | Merged (2026-08-25, PR #28) |
| — | Connections toggles | Per-provider toggles gave no "saving…" feedback, unlike identical toggles elsewhere on the same page | Merged (2026-08-25, PR #29) |
| — | Connections | Disconnecting a wearable account fired on one tap with no confirmation | Merged (2026-08-25, PR #30) |
| — | Delete entry | Deleting a logged entry fired on one tap with no confirmation and no undo | Merged (2026-08-25, PR #31) |

## 2026-08-25 — First pass

Full exhaustive audit: content accuracy, functional QA (real browser
click-through, Chromium via Playwright), technical QA (console/network,
a11y basics, PWA/service-worker), cross-page consistency, SEO/metadata, and
a live-site-vs-default-branch drift check. Pulled latest before starting;
confirmed no drift from the other session's commits before opening each PR.

### Live-site drift check

No drift. `https://omnifuelapp.tech`'s built asset hashes
(`index-CXdOse7y.js`, `index-oHTl-r6x.css`) exactly matched a fresh
`npm run build` of `main` at commit `aa62b87` (the HEAD at pass start).
`GET /api/health` on the live site: `{"ok":true,"backend":"json-file",
"ocr":"not-configured","usda":"not-configured","oura":"oauth",
"garmin":"not-configured"}` — see the Info item above re: `json-file`
backend in production.

### Findings — merged (small/unambiguous/low-risk)

1. **SEO metadata** (PR #18) — `index.html` had no meta description;
   added one. No `robots.txt` existed; added one disallowing all crawling
   (personal, auth-gated app, not meant for public indexing).
2. **Accessibility** (PR #19) — the "Search foods" input
   (`SearchFood.jsx`) had a placeholder but no accessible name. Added
   `aria-label="Search foods"`, matching the existing convention for
   unlabeled inputs elsewhere (`SmartPlanForm.jsx`'s height fields).
3. **Content accuracy** (PR #20) — Connections' footer described
   "Delete synced history" as functional ("Removes the Oura, Garmin, and
   Apple Health records synced to this app...") while the button itself,
   once clicked, reveals it's not wired to an endpoint. Reworded the
   always-visible copy to say so upfront.
4. **Content accuracy** (PR #21) — both legal pages still described
   Garmin as a future/planned integration ("(planned) Garmin", "once
   available", "and later Garmin"); the Garmin data-in integration is
   actually built and wired end-to-end (gated on Garmin's partner-approval
   program for API access, not on being written). `legal/README.md`
   itself flagged this exact tension as a known follow-up. Reworded three
   spots across both files.
5. **Cross-page consistency** (PR #22) — Today's third context cell was
   labeled "Training" while Connections' influence toggle, Plan, and
   README all say "Workouts" for the same signal category; renamed to
   match. Insights' readiness-placeholder caption said "Mist band ·
   recovery" directly under a "Readiness · Oura" header; renamed to
   "readiness".
6. **Content accuracy** (PR #23) — README quoted the next-action
   disclosure as **"Why?"** in three places; the actual component
   (`ui.jsx`'s `Why`, used as-is on Today) defaults to **"Why this?"**.
   Plan's distinct "Why this changed" (for explaining a *change*, not a
   recommendation) was left as-is. Updated the three README quotes.

All six merged after `npm test` (146/146 passing throughout) and a manual
re-verification of the specific behavior changed; rebased onto current
`main` immediately before each merge (no drift from the other session
during this pass).

### Findings — reported only (large/structural/risky, or product decisions)

**Critical — Privacy policy vs. actual data collection.** The privacy
policy (`legal/privacy-policy.html:164,223`) states the app has *"no user
accounts and no login"* and doesn't collect *"names, passwords, or profile
information."* This is false: `server/auth.js` hashes and stores passwords
(scrypt), `server/index.js`'s `POST /api/auth/signup` is open self-service
registration, and `server/db.js` has a `users` table storing `email` +
`password_hash`. Separately, a per-user `profile` table (height, weight,
sex, age, activity level, goal — `server/db.js:255-277`, populated via
`SmartPlanForm.jsx`) is never mentioned in §2 ("Information we collect") at
all. Both are genuine legal-disclosure gaps, not stale wording — the
policy needs a real rewrite of what's collected, how deletion works now
that accounts exist, and the biometric-data category. Not something to
patch superficially; recommend owner review before editing.

**Critical — README's core positioning claim.** README.md:6-7 says
*"Single user, no accounts, every 'premium' feature just on."*
`src/App.jsx:307-316` gates the entire app behind a mandatory login;
`src/components/Auth.jsx`'s own code comment says *"there is no tour or
guest mode — just sign in or create the one account this device will
use."* Signup is fully open (no invite/admin gate), so it's not even
"single owner" — it's ordinary multi-tenant signup. This is presumably
already known (multi-user auth was a deliberate recent addition — see git
history), recorded here only so it's tracked alongside the two privacy-policy
items above, which are new.

**High — Apple Health undisclosed in legal pages.** README documents a
fully shipped native iOS/watchOS companion that POSTs HealthKit samples
(workouts, active energy, exercise, sleep, HRV, resting heart rate) to
`POST /api/apple/ingest`. Neither legal page mentions Apple Health
anywhere (`grep -i apple` on both returns only CSS false-positives) — the
third-parties list, the wearable-data section, and the international-
transfers list all name only Oura and Garmin.

**High — Apple integration has no UI path.** `server/index.js:755-760`
exposes `POST /api/apple/token`, which generates the per-user token the
iOS companion needs to authenticate. It's not in README's API table, and
`Connections.jsx`'s Apple panel explains what's read and how storage works
but has no button or link to actually generate/copy this token — a user
following the app's own UI has no way to pair the companion.

**Medium — Insights hardcodes provider names.** `Insights.jsx:187,222`
label two charts `"Readiness · Oura"` and `"Training load · Garmin"`
unconditionally, while `Plan.jsx:165-166` and `Today.jsx` correctly read
`signals.readiness.provider` / `signals.workout.provider` and render
whichever wearable actually supplied the data. Someone using only Apple
Health or only Garmin for readiness would see a chart permanently labeled
"Oura." Fixing this means sourcing the label dynamically the way Plan.jsx
already does — a small change, but a behavior change to a component
outside today's low-risk copy-only fixes, so left for the owner or a
follow-up pass.

**Medium — Search endpoint reliability.** `server/lookup.js` queries Open
Food Facts' legacy `cgi/search.pl` endpoint for text search (chosen over
the v2 API specifically because v2 doesn't rank by query relevance — see
the code comment at `lookup.js:226-229`). During this pass, a text search
for "banana" returned zero results in the app; direct `curl` against the
same OFF endpoint — using the app's own compliant User-Agent header, so
this wasn't a headers or environment issue — returned an HTTP 503 "Page
temporarily unavailable" response independent of the app entirely. A
retest of "chicken breast" against the same endpoint succeeded minutes
earlier, so this looks like real intermittent flakiness in OFF's legacy
search endpoint rather than a one-off. Worth considering retry/backoff or
a fallback path, but that's a behavior change to core search, not a
copy fix — reported rather than patched.

**Info — Live deploy backend.** The production site's `GET /api/health`
reports `"backend":"json-file"` — no `DATABASE_URL` is configured on the
live host, so data lives in the container's local JSON store rather than
Neon Postgres. Flagging in case this is unintentional, since the README
itself calls the JSON store "a dev convenience only."

### Verified — no issue found

- **Demo labeling.** README's "demo data is always clearly labelled as
  demo and never presented as a live connection" promise holds up in
  practice: Today's context strip shows "SAMPLE SIGNALS · NOT A LIVE
  SYNC" plus a "DEMO DATA" badge on every cell, and every Connections
  provider row shows "DEMO DATA — NOT A LIVE CONNECTION."
- **Insights insufficient-data state** renders correctly and matches
  README's description ("You've logged 1 of the last 7 days. Trends
  appear once at least 3 days are logged.").
- **Barcode digit-entry fallback** (no camera in this environment) works
  end-to-end: entered a real UPC, got a correct Open Food Facts match
  through to the log-confirmation screen.
- **Manual entry** flow works end-to-end (form → Continue → confirm →
  Add to log).
- **Service worker** registers and activates correctly on a production
  build (`npm run build && npm start`); the manifest link and all
  referenced PWA icon files (192/512/maskable/SVG/apple-touch) resolve.
- **Plan baseline editing**, **Connections per-signal toggles**
  (Sleep/Workouts/Heart-rate & HRV, with visible ON/OFF text — not color
  alone), and the **Connections state-reference legend** (shape + word,
  never color alone) all work and read as designed.
- **Viewport meta** correctly omits `maximum-scale`/`user-scalable=no`
  (avoids the WCAG 1.4.4 pinch-zoom trap) — confirmed via the code
  comment and by testing pinch-zoom still works.
- No dead-end screens: the bottom nav renders on every signed-in screen
  across all 5 tabs; every sheet has an explicit close affordance.
- No typos, placeholder/lorem-ipsum text, or TODO markers found in any
  user-facing copy across `src/components/*.jsx`.

### Untestable in this environment

- **Google Fonts.** `fonts.googleapis.com` CSS requests failed with
  `net::ERR_CONNECTION_RESET` in this sandbox's headless Chromium, while
  directly reachable (HTTP 200) via `curl` from the same host with the
  same network path. This looks like a sandbox/proxy artifact specific to
  Chromium's network stack in this environment, not a reproducible live
  defect — noting per instructions rather than silently skipping it.
  Worth a spot-check from a real browser/network if it recurs.
- **OAuth connect flows** (Oura/Garmin "Connect" buttons, Apple companion
  pairing) — not exercised end-to-end; doing so needs real provider
  credentials, which is out of scope for this pass (and OAuth code itself
  is in the do-not-touch category regardless).

### Design — deferred

None newly identified this pass beyond what's already tracked in
[`docs/PWA-RESPONSIVE-REPORT.md`](./PWA-RESPONSIVE-REPORT.md) (two
sub-44px secondary text links left at AA instead of AAA sizing, and a
200%-zoom reflow follow-up for the Plan table). No new aesthetic-only
findings from this pass.

## 2026-08-25 — Expanded-scope pass

A scope-expansion request (fired via this process's own scheduled trigger)
asked for four additional dimensions on top of the first pass: UI/UX
heuristic review, architecture review, backend/API design + security
review, and multi-week simulated usage testing. Parallelized the first
three across background agents; built a direct-API seeding harness for the
fourth. Pulled latest before starting (no drift from the first pass).

### UI/UX heuristic review

Full findings and file:line evidence are in the Open Items table above and
the six merged PRs. Two items worth calling out specifically:

- **False positive caught and discarded.** The review flagged Today.jsx as
  rendering a bare, broken-looking "0 / 0 kcal" for a fresh signup with "no
  baseline set," reasoning from the client code alone. Verified directly
  against a brand-new signup's `GET /api/today` response: the server always
  returns `DEFAULT_TARGETS` (2000 kcal / 150g protein / etc.) when no
  explicit targets row exists, so `calTarget` is never actually 0 in
  practice. No fix made — the finding didn't reproduce. Recorded here so a
  future pass doesn't waste time re-verifying the same claim.
- **Deferred, not fixed:** the Today calorie-numeral-vs-recommendation
  hierarchy issue (High, needs a type-scale decision, not a copy fix), no
  onboarding orientation after signup (Medium, a real gap but a product
  decision about what to show), no forgot-password flow (Medium, needs a
  real auth change), and day-nav one-handed reach (Low, no easy fix without
  a new control or a gesture). All four are in the Open Items table.

### Architecture review

Verified two of README's specific claims hold: the frontend never talks to
Open Food Facts/USDA/Anthropic directly (only relative `/api/*` calls), and
no API key/secret is ever referenced client-side (grepped for
`import.meta.env`, `VITE_`, and key/token patterns — zero hits outside
`server/`). The provider-adapter abstraction claim does **not** fully hold
(see Open Items) — `server/plan.js` and the UI components genuinely never
special-case a provider name (this is where the claim is meant to matter
most, and it's true there), but `server/providers.js` itself has three
provider-name branches, and Apple has no dedicated adapter file. Full
findings (dual-persistence divergence, concurrent-write races, error-
handling consistency) are in the Open Items table.

### Backend/API design + security review

Re-verified the prior security pass's two fixes (CORS, login timing oracle)
are both still holding correctly. Found the same timing-oracle bug class
was not extended to the Apple ingest token's legacy-token comparison, plus
a genuinely unauthenticated Garmin webhook, several unvalidated mutating
routes despite `zod` being available, and a handful of concurrency/schema
gaps. Full findings in the Open Items table — all reported only, none
touched (auth/OAuth/schema.sql are explicitly out of scope for direct edits
in this project's QA process).

### Multi-week simulated usage testing

Built a seeding harness (`sim_harness.mjs`, direct `POST /api/entries` calls
with backdated `logged_at` timestamps against the local dev server — not
committed to the repo, a throwaway QA tool) and ran several synthetic
personas:

- **Consistent logger** (10 days, 3 meals/day): `avgCalories` and
  `trackedDays` at the 7/14/30-day windows all computed correctly
  (1700 kcal/day average, exactly matching the seeded data; `trackedDays`
  correctly capped at how many days actually had entries within each
  window).
- **Boundary test** (the `insufficientData: tracked < 3` threshold): exactly
  2 tracked days → `insufficientData: true`; exactly 3 → `false`. Matches
  the UI copy ("Trends appear once at least 3 days are logged") precisely
  — no off-by-one.
- **UTC-midnight-straddling entries** — this is what surfaced the
  Insights timezone bug listed as a Medium item in Open Items above. Two
  entries 3 hours apart, meant to represent a single evening for any user
  west of UTC, were bucketed into two separate calendar days
  (`2026-08-24`: 600 kcal, `2026-08-25`: 200 kcal) purely because they
  straddled the *server's* UTC midnight, not the user's. Confirmed the
  user-visible symptom too: Insights showed "You've logged 2 of the last 7
  days" for what was, for the intended persona, one day of eating.
- **Demo-integrity check**: logged real food while a provider's demo flag
  stayed on — confirmed the demo flag doesn't flip and Today's signals
  still correctly report `demo: true`. No corruption of demo-vs-real
  labeling as real data accumulates.
- **Streak/recency logic**: not applicable — grepped the codebase and
  confirmed there is no streak feature anywhere to test.
- **Stale-wearable-data detection timing**: not re-tested live (would need
  real OAuth credentials to simulate a genuinely stale connected account
  realistically). Read `server/providers.js`'s `freshnessOf` instead
  (fresh ≤18h, stale ≤48h, else unavailable, with a documented rationale
  for the 48h cutoff) — logic is sound and already covered by
  `test/providers.test.js`; no new finding.

### Untestable in this environment (additional)

- **Garmin/Oura live OAuth connect flows, Apple companion pairing** — not
  exercised end-to-end; needs real provider credentials.
- **Disconnect-confirm fix (PR #30)** — verified by code review and a
  clean-render check on the Connections page, not a full live click-through
  of the confirm/disconnect sequence itself, since that only renders once
  an OAuth account is actually connected (same credential limitation as
  above).

### Design — deferred (this pass)

No new pure-taste findings. The Today calorie-numeral hierarchy item is
listed under Open Items as a "High, larger fix" usability bug rather than
here, since the UI/UX review's brief was explicit that a hierarchy problem
which actively misleads about what's important is a usability bug, not a
taste preference — it's deferred from *fixing* (needs a type-scale
decision) but not from the main findings.

## 2026-08-25 — Check-in pass (recurring)

Re-invoked via the recurring audit routine. Pulled latest `main`: no new
commits since the expanded-scope pass earlier today (still at `0017ca5`).
The other session's in-progress PR #25 (`Fix db:init: neon() driver has no
sql.query()`) remains open/unmerged, so nothing on the repo side had
changed to re-verify — none of the "Reported" items in Open Items could
have been resolved without a new commit landing, and a spot-check of a
few (Insights' hardcoded provider names, the Apple ingest timing-unsafe
compare) confirmed they're still present as described. `npm test` still
146/146.

One new finding: the live site (`https://omnifuelapp.tech`) has not
redeployed since before this session started — identical `ETag`/
`Last-Modified` across all three passes today, and `robots.txt` still
returns the SPA shell rather than the file merged in PR #18. Live is now
12 commits behind `main`. Added as an Info item above; likely just means
the deploy pipeline hasn't run yet, not a defect in the repo.

Nothing else new or changed. Next pass: re-check whether PR #25 merged,
and re-verify the live site has caught up.
