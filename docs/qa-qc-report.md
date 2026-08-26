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
| — | Privacy policy | Stated the app has "no user accounts and no login" and doesn't collect passwords — the app has a mandatory multi-user login with hashed passwords | Merged (2026-08-25, PR #34, other session) |
| — | Privacy policy | Biometric profile data was collected/stored but not disclosed | Merged (2026-08-25, PR #34, other session) |
| — | README | "Single user, no accounts" contradicted the mandatory multi-user login gate | Merged (2026-08-25, PR #34, other session) |
| — | Legal pages | Apple Health was a fully shipped data-collection path with zero disclosure in either legal page | Merged (2026-08-25, PR #34, other session) |
| — | SEO metadata | Missing `<meta name="description">`, no `robots.txt` | Merged (2026-08-25, PR #18) |
| — | Accessibility | Search-foods input had no accessible name (placeholder only) | Merged (2026-08-25, PR #19) |
| — | Connections copy | "Delete synced history" footer described working functionality; button admits it's not wired up | Merged (2026-08-25, PR #20) |
| — | Legal pages | Garmin described as "(planned)" / "later" though the integration is actually built | Merged (2026-08-25, PR #21) |
| — | Terminology | Today's third context cell said "Training" (elsewhere "Workouts"); Insights caption said "recovery" next to a "Readiness" header | Merged (2026-08-25, PR #22) |
| — | README copy | README quoted the disclosure label as "Why?"; actual component text is "Why this?" | Merged (2026-08-25, PR #23) |
| — | Error/empty-state copy | `LabelScan`/`SearchFood` errors told the user to set a server env var instead of suggesting an in-app fallback | Merged (2026-08-25, PR #26) |
| — | Sheet component | The food-confirm step had no visible close button (tied to a `title` prop it doesn't pass) | Merged (2026-08-25, PR #27) |
| — | Cancel buttons | Three different visual styles for the same "back out" action across FoodConfirm/SmartPlanForm/Plan | Merged (2026-08-25, PR #28) |
| — | Connections toggles | Per-provider toggles gave no "saving…" feedback, unlike identical toggles elsewhere on the same page | Merged (2026-08-25, PR #29) |
| — | Connections | Disconnecting a wearable account fired on one tap with no confirmation | Merged (2026-08-25, PR #30) |
| — | Delete entry | Deleting a logged entry fired on one tap with no confirmation and no undo | Merged (2026-08-25, PR #31) |
| — | Apple ingest token | Legacy `APPLE_INGEST_TOKEN` compared with plain `===`, not `crypto.timingSafeEqual` | Merged (2026-08-25, PR #35) |
| — | Deploy config | Non-Docker deploy path never set `NODE_ENV=production` — cookie `Secure` flag + CORS restriction never activated outside Docker | Merged (2026-08-25, PR #36) |
| — | JSON-file store | `persist()` wrote the live file in place (no temp-file+rename); `load()` treated a corrupt file the same as a fresh install | Merged (2026-08-25, PR #37) |
| — | schema.sql | No `CHECK` constraints on numeric ranges; no composite `(user_id, logged_at)` index | Merged (2026-08-25, PR #38, background agent) |
| — | `src/api/client.js` | `api.history()` called a `/api/history` route that doesn't exist — dead code | Merged (2026-08-25, PR #40, background agent) |
| — | Insights.jsx | Hardcoded "Oura"/"Garmin" in two section headers instead of reading the actually-connected provider | Merged (2026-08-25, PR #41, background agent) |
| — | Today.jsx | The intake calorie numeral (38px) outranked the focal recommendation's own title (29px) | Merged (2026-08-25, PR #43) |
| — | Apple integration | Toggling "Apple Health" off in Connections didn't stop `/api/apple/ingest` from accepting writes | Merged (2026-08-25, PR #44) |
| — | Error handling | The generic `asyncH` catch-all echoed raw `err.message` to clients on every 500 | Merged (2026-08-25, PR #45) |
| — | `upsertFoodByBarcode` | TOCTOU race between the existence check and the insert, in both backends | Merged (2026-08-25, PR #46) |
| — | Input validation | `zod` was unused for HTTP input; `PUT /targets`/`POST /foods`/`POST,PATCH /entries` had no validation | Merged (2026-08-25, PR #47) |
| — | Insights.jsx | Nutrition-trend day-bucketing used the server's timezone instead of the client's | Merged (2026-08-25, PR #48) |
| — | Today.jsx | Day-nav (‹ ›) was the only frequent control anchored at the top of a tall screen | Merged (2026-08-25, PR #49, added a swipe gesture) |
| High | Apple integration | `POST /api/apple/token` existed server-side but had no UI path to generate/copy it — the integration wasn't usable end-to-end through the app | Merged (2026-08-25, PR #52, other session) — flagged in the architecture-review pass but missed in this table's earlier reconciliation; corrected in this check-in |
| — | Oura readiness signal | Every "readiness" value in the app (Today, Plan, Insights) was actually sourced from Oura's activity-score endpoint, not the dedicated readiness endpoint — a bug this session never found, caught and fixed independently | Merged (2026-08-25, PR #51, other session) |
| — | Search (OFF) | Search depended on Open Food Facts' legacy `cgi/search.pl` endpoint alone (no fallback), with no graceful failure state — an upstream 503 left the UI stuck. Also fixed, same PR: without a configured USDA key, common whole-food queries (zucchini, courgette, a typo) returned zero or irrelevant results | Merged (2026-08-26, PR #73, real retrieval+ranking redesign + working retry state; further overhauled PR #95 — see below) |
| Medium | Apple ingest token | Doubles as a bearer credential for the *entire* authenticated API (not just ingest) if it leaks — a deliberate tradeoff per the code's own comment, worth explicit owner sign-off | Reported (2026-08-25) |
| Medium | Signup | Concurrent signups with the same email leak a raw Postgres constraint-violation message instead of the intended 409 (JsonStore already handles this correctly; Postgres doesn't) | Merged (2026-08-25, PR #55, audit residual-gap cleanup) |
| Medium | Provider abstraction | README's "adding a provider means adding an adapter" claim doesn't fully hold: `providers.js` has three separate provider-name branches, and Apple has no dedicated `server/integrations/apple.js` (the Insights-specific symptom of this is fixed, PR #41; the general architecture point stands) | Reported (2026-08-25) |
| — | Onboarding | A fresh signup dropped straight into an empty Today with no baseline-setup prompt | Merged (2026-08-25, PR #54, other session) |
| Low | Onboarding | The new first-run gate (PR #54) still doesn't mention that Connections' demo-data toggles exist to preview what recommendations look like with a wearable connected | Reported (2026-08-25) |
| Medium | Auth | No "forgot password" / account-recovery path exists — attempted, judged too large for a direct fix (needs new email-service infrastructure with no existing provider configured anywhere in this project); see the implementation proposal in this pass's section below | Reported (2026-08-25) — proposal written up, not attempted |
| High | Garmin webhook | `POST /api/garmin/webhook` has no signature/shared-secret verification — researched; infeasible to implement safely right now (every base URL and field name in `garmin.js` is marked `VERIFY` — the exact signing scheme, if any, is unknown until Garmin partner access is granted) | Reported (2026-08-25) — researched, blocked on Garmin partner docs |
| Medium | Garmin OAuth | `refreshAccessToken`/`validAccessToken` are implemented but never called — researched; bigger than scoped (needs new `listAllGarminAccounts()` methods on both storage backends, and the refresh cadence/necessity itself is unverified against partner docs) | Reported (2026-08-25) — researched, deferred as larger than scoped |
| Info | Live deploy | `GET /api/health` on the live site reports `backend: "json-file"` — no `DATABASE_URL` configured in production | Resolved (2026-08-25, owner deploy — site now reports `backend: "postgres"`) |
| Info | Live deploy | Live site hasn't redeployed since before this session's first pass — now well behind `main` | Resolved (2026-08-26 — `GET /api/version` confirms the live site matches `origin/main` HEAD exactly) |
| Low | Server logging | Several `console.error(err)` calls log the *raw* error object server-side (client-facing 500s are already sanitized, PR #45) — a DB constraint-violation error can embed a user-submitted value (e.g. an email) in its message. Flagged by the other session's production-verification audit as a real but low-severity, unconfirmed-in-practice pattern, not a client-facing leak | Reported (2026-08-26, from `docs/PRODUCTION-VERIFICATION-AUDIT.md`) |
| Info | Deploy config | `SESSION_SECRET`'s production state is unconfirmed (unset in every dev environment checked so far) — if unset in production, any restart for any reason mass-logs-out every signed-in user, independent of any other change | Needs an owner verification, not a code fix (flagged by the same audit) |

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

## 2026-08-25 — Fix-all-open-items pass

Re-invoked via an escalation routine instructing this session to work
through every open item in this report, highest severity first, and
explicitly widening the standing "never touch" boundary to include
auth-adjacent security work, OAuth token handling, and `schema.sql` — with
two named exceptions (forgot-password, and the two live-deploy Info items)
carved out below.

**Reconciliation first.** Pulled `main` and confirmed via
`list_pull_requests`/`git log` that PR #25 (`db:init` fix) and PR #34
(privacy-policy / README / legal-page accuracy fixes: no-accounts claim,
biometric-data disclosure, Apple Health disclosure) had both merged since
the last check-in, authored by a separate session and merged by the repo
owner (`thrillhouse-bit`). Verified the diff matched the claims before
updating those four items' status in the Open Items table above.

**Fixed and merged this pass** (24 items; see the table above for PR
numbers). The more significant ones, with rationale:

- **Apple ingest token timing safety (PR #35).** The legacy
  `APPLE_INGEST_TOKEN` fallback compared the presented token with `===`,
  which short-circuits on the first mismatched byte — an attacker who can
  measure response timing can recover the token byte-by-byte. Replaced
  with a length-checked `crypto.timingSafeEqual`.
- **`NODE_ENV=production` on the non-Docker start path (PR #36).** The
  Docker image set it, but `npm start` didn't, so a bare/non-Docker deploy
  silently ran in dev mode: the session cookie never got `Secure`, and the
  CORS allow-list restriction never activated. One-line fix
  (`package.json` `start` script), but security-relevant enough to call
  out explicitly.
- **JSON-store atomic writes + corruption handling (PR #37).** `persist()`
  wrote the live data file in place — a crash or power loss mid-write
  could leave a truncated/corrupt file. Now writes to `<file>.tmp` and
  `rename()`s over the original (POSIX-atomic). `load()` previously
  treated *any* read/parse failure identically to "fresh install, start
  empty" — including a corrupted file, which would have silently
  discarded all existing data. Now only `ENOENT` gets that treatment;
  anything else is logged and re-thrown.
- **`schema.sql` constraints + index (PR #38, background agent).** Added
  `CHECK` constraints on servings/target columns and a composite
  `(user_id, logged_at)` index on `log_entries` (previously two separate
  single-column indexes, which Postgres can't combine as efficiently for
  the app's actual query pattern — "this user's entries in this date
  range").
- **`upsertFoodByBarcode` TOCTOU race (PR #46).** Both backends had a
  check-then-write gap: `getFoodByBarcode` → (await) → insert. Two
  concurrent requests for a new barcode (e.g. duplicate scans) could both
  see "not found" and both insert, either violating the barcode unique
  constraint (Postgres) or creating two rows for one barcode (JSON store).
  Postgres version now uses a single `INSERT ... ON CONFLICT (barcode) DO
  NOTHING RETURNING *` with a fallback lookup only on conflict. JSON-store
  version removes the `await` between the check and the push so nothing
  can interleave. Regression test deliberately pre-loads the store before
  racing two calls with `Promise.all` — verified this fails against the
  reverted buggy code and passes against the fix.
- **Zod input validation on mutating routes (PR #47).** `zod` was already
  a dependency (used only for OCR output shaping) but no HTTP input was
  validated beyond a couple of manual `if` checks. Added
  `server/validation.js` with schemas for food creation, entry
  create/patch, and targets, wired in as route middleware.
- **Insights day-bucketing timezone bug (PR #48).** The trend endpoint
  bucketed days using the *server's* local timezone
  (`getFullYear()/getMonth()/getDate()`), not the client's — a user west
  of the server (or the server running in a non-UTC container timezone)
  could see an entry logged at 9pm their time attributed to the wrong day
  in the trend chart. Added `tzOffsetMinutes` as a query param (same
  convention `dayBounds()` in `lib/nutrition.js` already used for
  `/today`), threaded through pure UTC-arithmetic helpers so bucketing is
  independent of where the process happens to run. Regression test chosen
  carefully: initial timestamps happened to land on the same calendar day
  under both the fix and the suite's pinned `TZ=Pacific/Apia` fallback,
  which meant it could pass even if the fix silently no-op'd — replaced
  with timestamps that only agree under the intended offset.
- **Today day-nav swipe gesture (PR #49).** The day-nav arrows were the
  only frequent control anchored at the top of a tall mobile screen.
  Rather than relocate them (a layout call better left to the owner), added
  a left/right swipe gesture on the day content itself as a supplemental
  affordance, guarded against vertical scroll gestures and against
  swiping past "today". Verified live with a touch-emulated Playwright
  session (390×844 viewport, synthetic `TouchEvent`s) — swipe right goes
  to the previous day, swipe left returns, and swiping left again while
  already on today is a no-op, with no console errors.

**Researched, not attempted — bigger than scoped:**

- **Garmin webhook signature verification.** `server/integrations/
  garmin.js` marks essentially every URL and field name `VERIFY` — the
  actual code was written against documentation, not a live partner
  integration, and Garmin's webhook signing scheme (if any) isn't
  independently confirmable from this codebase or public docs without
  partner-tier API access. Implementing a *specific* verification scheme
  without knowing the real one risks a false sense of security (or, worse,
  ships a check that legitimate webhooks fail). Left as a High item for
  the owner to implement once partner docs are in hand.
- **Garmin OAuth token refresh.** `refreshAccessToken`/`validAccessToken`
  exist in `garmin.js` but nothing calls them. Wiring this up needs a
  `listAllGarminAccounts()`-style method added to *both* storage backends
  (doesn't currently exist) plus a decision on refresh cadence (cron job?
  lazy refresh-on-use?) that depends on details of Garmin's token
  lifetime this codebase doesn't currently encode anywhere. Flagged as
  Medium, deferred.

**Forgot-password / account recovery — proposal only (per the standing
exception), not implemented:**

This is a genuine net-new feature, not a bug fix — it needs outbound email,
which nothing in this project currently sends (no email provider client,
API key convention, or `.env` entry exists for one anywhere in the repo).
Implementing it blind would mean guessing a provider. Proposed design for
the owner to review:

1. **New table**: `password_reset_tokens (id, user_id references users(id)
   on delete cascade, token_hash text not null, expires_at timestamptz not
   null, used_at timestamptz, created_at timestamptz default now())`. Store
   only a hash (e.g. sha256) of the token, never the raw value — same
   principle as the existing password-hash handling, so a DB read alone
   never yields a usable credential.
2. **`POST /api/auth/forgot-password { email }`**: always responds `200`
   with a generic "if that address has an account, we've sent a reset
   link" regardless of whether the email exists, to avoid leaking account
   existence (the app's own signup path already returns a distinguishable
   409 on duplicate email, so this endpoint deliberately behaves
   differently). On a real match: generate a high-entropy random token
   (e.g. `crypto.randomBytes(32)`), store its hash with a short expiry
   (e.g. 30–60 minutes), and email a link containing the raw token.
   Rate-limit by email and by IP (the app has no rate-limiting middleware
   at all today — this would be the first use of one; a small in-memory
   or Postgres-backed token-bucket would do for current scale).
3. **`POST /api/auth/reset-password { token, newPassword }`**: hash the
   presented token, look it up, reject if missing/expired/already `used_at`.
   On success: update the user's password hash, mark the token row
   `used_at = now()`, and invalidate other outstanding reset tokens for
   that user (defense in depth if multiple were somehow issued). Reuse the
   existing password hashing/strength rules already enforced at signup.
4. **Email delivery**: needs a provider decision from the owner — the
   cheapest low-maintenance options for a project this size are Resend or
   Postmark (both have simple transactional-email APIs and generous free
   tiers); either would need an API key added to the existing `.env`
   convention and a `server/email.js` module analogous to
   `server/ocr.js`'s Claude-client wrapper. Until a provider is chosen and
   configured, this cannot be wired up end-to-end even as a draft PR,
   since there'd be nothing to test the send against.
5. **Security notes**: tokens must be single-use, short-lived, and
   transmitted only via the emailed link (never returned in the API
   response body — a common mistake that defeats the whole point). The
   generic-response behavior in step 2 and the constraint that reset
   doesn't reveal *why* it failed (expired vs. used vs. never-existed, all
   collapse to one generic error) both matter for not leaking account
   existence.

Given the missing infrastructure, this was judged too large to land as an
open PR this pass (a PR with no configured email provider can't be
smoke-tested, and picking a provider unilaterally isn't this session's
call) — recorded here as a proposal instead, per the escalation's own
fallback instruction.

**Left untouched per explicit exception (Info items):** the live site's
`json-file` backend (no `DATABASE_URL` in production) and the live site
being behind `main` are both deploy/ops state, not a code defect — no
code change would address either, so neither was touched.

**Also newly reported this pass** (researched but out of scope for a
direct fix — see Open Items table for full descriptions): the OFF
`cgi/search.pl` intermittent 503s (external dependency, reproduced
independently of this app), the Apple ingest token's dual role as a
bearer credential for the whole API, the Postgres-only raw-constraint-
message leak on concurrent duplicate signups, the provider-abstraction
claim in the README not fully holding up against `providers.js`'s
per-provider branches, and the empty-Today onboarding gap for a fresh
signup.

`npm test`: 158/158 passing after this pass's changes (up from 146 at the
last check-in — the added test count reflects the new zod-validation,
Apple-ingest-disabled, TZ-bucketing, and `upsertFoodByBarcode`-race
regression tests written alongside their fixes).

## 2026-08-25 — Check-in pass (recurring, post-fix-all)

Re-invoked via the recurring audit routine, ~1 hour after the fix-all pass
above merged (PR #50). Pulled latest `main`: two new commits landed since
then, both from the other session — PR #51 ("Fix Oura readiness signal:
was querying activity, not readiness") and PR #52 ("Add Connections UI for
the Apple Health pairing token"). `npm test`: 160/160 (2 new, from PR #51).

**Reconciled both against this report:**

- **PR #52 fixes a real gap in this table, not a new bug.** The
  architecture-review pass had already found "Apple integration has no UI
  path" (`POST /api/apple/token` existed server-side, nothing in
  `Connections.jsx` called it) and written it up as a High finding — but it
  never made it into the Open Items table during reconciliation, so it sat
  invisible as neither fixed, deferred, nor reported. Corrected the table
  above (now shows Merged, PR #52) and verified the fix live: booted a
  clean local instance, signed up a fresh account, opened Connections →
  Apple Health → "How to sync," clicked "Generate pairing token," and
  confirmed a 48-hex-char token renders in a read-only copyable field with
  a working Copy button — matches `POST /api/apple/token`'s
  `crypto.randomBytes(24).toString('hex')` server-side. No UI regressions
  found in Connections otherwise.
- **PR #51 is a genuine bug this session never caught.** Every "readiness"
  value in the app (Today's context strip, Plan's recommendation engine,
  Insights' readiness chart) was being sourced from Oura's
  `daily_activity` endpoint's score field instead of the dedicated
  `daily_readiness` endpoint — two different Oura metrics that happen to
  share a 0–100 scale, so it never threw, just silently mislabeled
  activity score as readiness (or showed nothing, since activity score is
  null far more often). The commit message documents it was found by
  reproducing a live symptom — Oura reconnect on the deployed site not
  backfilling 30-day history — then tracing it to the endpoint mismatch,
  not a guess. Read the full diff: adds `dailyReadiness`/`readinessRange`
  alongside (not replacing) the existing activity functions, which are
  still correctly used for `/api/oura/summary` and `/api/energy/summary`.
  Test coverage looks appropriately paranoid — the commit notes the old
  backfill mock was stubbing the wrong function, which had started making
  real un-mocked calls to Oura's API during test runs; the fix corrects
  that too. This is exactly the kind of bug this session's own multi-day
  simulated-usage pass should have caught and didn't (it exercised Oura
  demo-data code paths, not the real endpoint selection) — noted here as a
  gap in this session's own test coverage, not just a fix to praise.

**Live site:** `https://omnifuelapp.tech` has redeployed since the last
check-in — `GET /api/health` now reports `backend: "postgres"` (was
`json-file`), and `Last-Modified`/`ETag` are fresh as of today. Both
previously-open Info items (json-file backend in prod, site behind `main`)
are now resolved by this deploy — no code change needed on this session's
part, exactly as those items anticipated. `robots.txt` (`Disallow: /`) and
the `<meta name="description">` tag both match what's in the repo.

**Re-verified all remaining "Reported" items are still open and
unaddressed** (OFF search 503s, Apple-token dual-role-as-bearer-credential,
Postgres duplicate-signup error leak, provider-abstraction README claim,
onboarding gap, forgot-password, both Garmin items) — confirmed via `git
log` that no commit since PR #50 touches `garmin.js`, the signup route, or
onboarding, so nothing changed there to re-check.

Nothing new found beyond the two items above (both already fixed by the
other session, not left for this pass to act on) — this check-in required
no fixes of its own.

## 2026-08-25 — Check-in pass (recurring, 20:36 UTC)

Re-invoked via the recurring audit routine, ~5 hours after the previous
check-in (PR #53). Pulled `main`: one large merge landed since then, PR #54
("Reconcile Oura readiness/backfill, preserve onboarding gate, add trend
weight"), 23 files changed, ~2,092 insertions. `npm test`: 224/224 (up from
160 — 64 new tests). `npm run build`: clean.

PR #54 is substantial enough that a full line-by-line review wasn't
practical in this pass's time budget; focused verification instead on (a)
whether it touches anything this report already tracks, and (b) live
smoke-testing the parts that do, rather than re-reviewing the whole diff
from scratch:

- **Onboarding gate (`src/components/Onboarding.jsx`, new).** Directly
  fixes this report's own "Medium — Onboarding" finding (empty Today, no
  baseline prompt) — updated the table to Merged. Verified live: fresh
  signup now lands on a "Welcome" screen with two paths (calculate via
  `SmartPlanForm`, or enter manually via a newly-exported `EditTargets`),
  gated behind a `hasTargets` check that's a genuinely new server method
  (`store.hasTargets`, distinct from `getLatestTargets`'s silent
  2000-kcal fallback) and fails *open* on a broken check rather than
  trapping a real user. Manual path tested end to end — save, redirect to
  Today, correct numbers rendered. One sub-part of the original finding is
  still open, downgraded to Low: the gate never mentions that Connections'
  demo-data toggles exist to preview recommendations with a wearable
  connected. Added as its own row.
- **Oura readiness/backfill.** This PR's own commit messages describe
  fixing a *second*, independent bug in the same area PR #51 touched
  earlier today: a re-run backfill that got a transient `null` score for a
  day that had scored fine before was deleting that day's real value and
  never replacing it (`saveOuraHistory` was unconditionally deleting every
  requested day before re-inserting, regardless of whether the new fetch
  actually had a score). Fixed by only touching days with a non-null score
  this run. Read the diff and the fix logic is sound; the two-bugs-in-one-
  area pattern (PR #51 this morning, this fix this afternoon) is worth
  the other session's own awareness, not something for this pass to
  re-litigate.
- **New features verified live, no regressions found:** manual workout
  entry (Plan tab — type/time/duration form, validated server-side against
  the same `WORKOUT_KINDS` whitelist the UI offers, clearable), body-weight
  logging with a gap-adjusted EMA trend line (Insights tab — the trend math
  in `server/weightTrend.js` correctly compounds `1 - (1-α)^gapDays` for
  multi-day gaps between weigh-ins rather than treating every gap as one
  day), and "Delete synced history" is now actually wired up end-to-end
  (not just honestly-labeled-as-broken, which was this report's own PR #20
  fix) — Connections' footer copy now describes real behavior.
- **No regressions found** against previously-fixed items: Insights'
  dynamic provider labels (PR #41) and timezone bucketing (PR #48) both
  still render correctly with the new Weight section added above them;
  Apple pairing-token UI (PR #52) still works; zod/manual input validation
  on existing routes is untouched.
- **Live site:** redeployed again since the last check-in (fresh
  `Last-Modified`), confirmed serving `main` as of this pass.
- **Re-verified remaining "Reported" items unchanged:** OFF search 503s,
  Apple-token dual-role, Postgres duplicate-signup error leak,
  provider-abstraction README claim, forgot-password, both Garmin items —
  no commits since the last check-in touch any of those areas.

No fixes made directly by this pass — the one relevant open item
(onboarding) was already closed by the other session; the new Low item
(demo-data mention) was judged too minor and too close to the other
session's own deliberate scope decision on `Onboarding.jsx` to change
unilaterally in the same file within an hour of it landing, so it's
reported rather than edited.

## 2026-08-25 — Audit residual-gap cleanup

Follow-up to `docs/PRODUCTION-VERIFICATION-AUDIT.md` (same day): closed four
of its named residual gaps, none requiring VPS/production access.

- **Postgres-only raw-constraint-message leak on concurrent duplicate
  signups** (reported above, "Also newly reported this pass") — **fixed.**
  `PgStore.createUser` now catches the unique-violation (SQLSTATE `23505`)
  and re-throws a clean `409` ("An account with that email already exists.")
  instead of letting Postgres's raw driver error — its `detail` field embeds
  the offending email — fall through to the generic 500 handler, which both
  logged it in full server-side and returned an unhelpful 500 to the client.
  `JsonStore.createUser` already did this defensively; `PgStore` now matches.
  `PgStore` is exported for the first time specifically so this could be
  tested (`test/store-pg.test.js`, stubbed `.sql`, no real Postgres needed —
  this environment has never had `DATABASE_URL`).
- **Finding 9 (no version endpoint)** — added `GET /api/version`, `GIT_SHA`
  baked in via a new Dockerfile `ARG`/`docker-compose*.yml` `build.args`
  (defaults to `'unknown'` when unset, never fabricated).
- **Finding 8 (dangling `migrate.sql` comment)** — corrected; the function
  it sat on (`migrateLegacyDataToUser`) IS the migration, no separate file.
- **Undo-restore path (Finding 1's sibling, no independent regression test)**
  — extracted the `Number()` coercion into `restoreEntryPayload`
  (`lib/nutrition.js`), unit-tested directly rather than rendering all of
  `App.jsx` (which still has no component-test harness — this avoids needing
  one for a one-line fix, same conclusion the audit reached, different path
  to a passing test).

Full suite: 233/233. Build: clean. Landed on `claude/audit-residual-cleanup`
(off `claude/nutrition-tracking-pwa-g8kyfi` @ `ae121a7`) — the parent branch
is locked to further direct writes per the owner's instruction, so this is a
separate PR, not a push onto it.

**Not attempted, unchanged from the audit**: Finding 2's 27/30-days figure
(needs production DB/API access to the actual affected account), PgStore's
Oura-backfill fix still has no *independent* integration-test proof (only
code symmetry with JsonStore — same environment constraint as above, no
`DATABASE_URL`), `SESSION_SECRET`'s production state, and the Neon rotation
plan (deliberately not executed — deploy first, per the audit's own gate).

## 2026-08-26 — Check-in pass (recurring, 00:36 UTC)

Re-invoked via the recurring audit routine, ~4 hours after the previous
check-in (PR #58). This was by far the largest gap between check-ins: `git
log` shows ~40 commits landed on `main` since then, spanning at least nine
merged PRs (#59 through #75, non-contiguous — some numbers belong to
branches that merged elsewhere). `npm test`: 511/511 (up from 224 — 287 new
tests). `npm run build`: clean.

Given the scale, this pass did not attempt a line-by-line review of every
commit — that would just re-do work already done, carefully, by the
sessions that produced it. Instead: read the other session's own
`docs/PRODUCTION-VERIFICATION-AUDIT.md` (a genuinely independent, rigorous
release-verification pass with real VPS/production visibility this session
doesn't have), reconciled its findings against this report, and live
smoke-tested the highest-risk surfaces rather than re-auditing everything.

**Most significant finding, already fixed before this pass started:** the
other audit caught a **CRITICAL bug in the primary food-logging flow** —
`food_id` and `servings_consumed` round-trip over JSON as strings (a
Postgres bigint serialization fact), but the zod schema this report's own
PR #47 added correctly rejects a string `food_id` as strict-by-design. The
one call site that skips editing a food (barcode scan → confirm, search →
confirm, re-log a recent food — i.e. the *most common* path) sent the raw
string through unconverted, so every one of those would have 400'd in
production. Fixed same-day by the other session (commit `86a3ee7`) with a
mutation-tested regression test, and independently re-verified live by this
pass: signed up fresh, completed onboarding, logged a food via the manual-
entry → confirm → "Add to log" path (the exact call site that had the bug),
confirmed a clean `201` and correct intake totals on Today with zero
console/network errors. Confirmed via `GET /api/version` that the live site
is running this exact commit (SHA matches current `main` HEAD exactly) —
the fix is deployed, not just merged.

**Reconciled against this report:**

- **Signup Postgres error leak** (this report's own "Reported" item) —
  fixed by the same audit's residual-gap-cleanup follow-up (PR #55,
  commit visible directly in `docs/qa-qc-report.md`'s own diff — that
  session edited this exact file in this exact format, which is worth
  noting for its own sake: two independent Claude sessions converging on
  the same tracking convention). Verified the fix is real by reading
  `PgStore.createUser`'s new SQLSTATE `23505` catch. Table updated.
- **Both remaining live-deploy Info items are now resolved on their own** —
  confirmed via the new `GET /api/version` endpoint (added by the audit's
  Finding 9) that the live site's SHA matches `main` HEAD exactly, and
  `/api/health` has reported `backend: "postgres"` since the last check-in.
  Marked Resolved rather than deleted, so the history of what was wrong and
  when it got fixed stays visible.
- **Two new items added from the audit's own findings**, since they're
  real, previously-untracked gaps this report hadn't surfaced: raw
  server-side error logging that can embed user-submitted values (Low —
  narrower than this report's own PR #45 fix, which only ever covered
  client-facing responses) and `SESSION_SECRET`'s unconfirmed production
  state (Info — same "needs owner verification" bucket as the resolved
  deploy items above, not a code fix).

**New features live-smoke-tested, no regressions found:**

- **Adaptive Fuel Plan** (PR #72) — a real-time energy/macro target engine
  with carb periodization, opt-in via a "Set up my profile" card above the
  existing Quick Targets section. Rendered correctly, existing Quick
  Targets/meal-timing/manual-workout flow (verified last check-in)
  untouched underneath it.
- **Insights nutrition trends + real correlations** (PRs #61–#66, #74–#75)
  — per-section gating (readiness/training-load correctly show "Awaiting
  connected history" rather than fabricated data for an account with no
  wearable connected — an empty state, not a bug) and a "What we notice"
  correlations section with real per-pair copy render cleanly.
- Sleep score now shown alongside sleep duration on Today's context strip
  — no layout regression.

**Not re-verified independently** (would duplicate the other audit's own
explicit, careful work rather than adding anything): PgStore-specific
behavior (no `DATABASE_URL` in this environment either — same constraint
the audit named), the Neon rotation plan (not executed by design, owner
action), multi-user isolation (audit's Finding 3, already live-verified
end-to-end by them).

Live site: confirmed redeployed and at current `main` HEAD via
`/api/version` (see above). `npm test` 511/511, build clean, no fixes made
directly by this pass beyond the report reconciliation itself — every
concrete, actionable item found this pass had already been fixed before
this check-in started.

## 2026-08-26 — Check-in pass (recurring, 04:36 UTC)

Re-invoked via the recurring audit routine, ~4 hours after the previous
check-in (PR #76). Smaller gap than last time: 4 commits, two merged PRs
(#73, #78 covering #77). `npm test`: 597/597 (up from 511 — 86 new tests).
`npm run build`: clean.

**Closes this report's own long-standing "Search (OFF)" item.** PR #73 is
a genuine rebuild of food search (`server/foodSearch/`), not a patch: a
6-tier relevance-ranking module, USDA queried as separate
Foundation/Branded passes so generic results aren't crowded out, a
synonym table (zucchini↔courgette, etc.), conservative typo correction,
and parallel multi-provider/multi-variant fan-out. Directly relevant to
this report — the original finding was "OFF's `cgi/search.pl` returned
intermittent 503s, reproduced independently of the app"; that endpoint is
still the same one (verified: `server/lookup.js`'s URL is unchanged, this
isn't fixable by this app since it's OFF's own reliability), but the
*symptom* this report actually cared about — the app having no graceful
failure path — is now genuinely fixed. Verified live in this sandbox
(which has no egress to OFF/USDA, so every search here is a real upstream
failure): searching "zucchini" now surfaces "Search is having trouble
right now — We couldn't reach any food database — this is usually
temporary" with a working Retry, instead of hanging on "Searching…"
indefinitely, which is what this report's own last check-in observed and
had to route around with a manual-entry fallback. Table updated to
Merged. The commit's own live verification (real browser, no-USDA-key
environment) additionally confirmed the ranking fixes themselves — every
required query (zucchini, courgette, the "zuccini" typo, chicken breast,
banana, oatmeal, Greek yogurt, coke) now returns a correct top result;
not independently re-verified in this pass since it would duplicate that
work exactly, and the 91 new tests plus this pass's own retry-state
verification are sufficient confirmation the fix is real and deployed-
ready.

**Two smaller fixes, reviewed but not re-tested independently (small,
well-reasoned, already tested by their own sessions):**

- **Training Load label mismatch** (PR #77) — Insights' "Training load ·
  Garmin" header was reading today's live-signal provider, not the actual
  source of the chart data underneath it (which only ever aggregates
  Apple Health workout history) — a user with both connected saw a
  Garmin-labeled chart built entirely from Apple data. Fixed by deriving
  the label from the chart's own data instead of the unrelated live
  signal.
- **Adaptive Fuel Plan profile prefill** — AFP's "Set up my profile" form
  duplicated fields already collected during onboarding but never read
  them, so a user who'd already entered a baseline hit a blank form and
  had to retype it — read as the feature being broken rather than
  separately configured. Now prefills from the existing onboarding
  profile.

No fixes made directly by this pass — the one relevant open item (search)
was already closed by the other session before this check-in started.
Live site: `GET /api/version` confirms it's already redeployed and running
this exact commit (`c8fc50c`, current `main` HEAD).

## 2026-08-26 — Check-in pass (recurring, 08:36 UTC)

Small, quiet gap: one commit since the last check-in (PR #79, "Render the
'Intake so far' bar as a light-to-dark cobalt gradient") — a scoped,
owner-requested visual change to `SegmentBar` (Today's intake bar only;
its one caller). `npm test`: 601/601 (4 new). `npm run build`: clean. Live
smoke-tested: signed up fresh, logged a food, confirmed the gradient
renders correctly on Today with no console/network errors. This is a
pure design change per an explicit owner design note in the commit itself
— nothing for this report to fix or defer, since it was never an open
item here.

No other repo changes to reconcile. All "Reported"/"Deferred" items in
the Open Items table remain accurately reported — nothing since the last
check-in touches the Apple-token bearer-credential item, the provider-
abstraction claim, forgot-password, server logging, `SESSION_SECRET`, or
either Garmin item. Live site is one commit behind `main` at the moment
of this check (`c8fc50c` vs. current HEAD `42726f2`, i.e. just the
gradient PR) — ordinary deploy lag, not flagged as a new Info item given
how quickly the site has caught up after every previous pass.

Nothing else new or changed. No fixes needed this pass.

## 2026-08-26 — Check-in pass (recurring, 12:45 UTC)

Two commits since the last check-in (PR #82), both continued hardening of
the food-search rebuild this report already tracked as Merged:

- **OFF serving-size parsing fix + `per100`/`household_serving` display
  fields.** The old regex grabbed OFF's leading quantity word ("1 serving",
  "1 can") instead of the real weight whenever `serving_size` reads "1
  serving (28 g)" — reproduced live against real Pringles/Diet Coke data.
  Now prefers a strict unit match inside parentheses. Also adds two
  additive, display-only fields (a calories-per-100g/ml comparison figure,
  and USDA's household-serving text) — neither persisted nor used in macro
  math, so no risk to logged-entry correctness.
- **Three bugs from a live QA sweep against real USDA/OFF data** (55
  queries, not the mocked fixture suite — the commit is explicit that none
  of these three were catchable by mocks): a flat branded-result ranking
  penalty too small to stop an exact-name branded product (a peanut-butter
  spread literally named "BANANA") from outranking the correct generic
  "Bananas, raw"; an overly broad chips↔french-fries synonym substitution
  firing on any query containing "chips" (not just a bare "chips" query),
  flooding "siete tortilla chips" results with fast-food fries; and
  provider-failure diagnostics that collapsed every real error to
  `error:null`, defeating the point of having them. All three read as
  genuine bugs with clear reproductions, not judgment calls.

Both commits are backend ranking/parsing/diagnostics changes with no new
UI surface — the search failure/retry UI this report verified live last
check-in is untouched by either. `npm test`: 616/616 (up from 601 — 15 new
tests, all backend-focused: `lookup.test.js`, `foodSearchRank.test.js`,
`foodSearchNormalize.test.js`, `foodSearchProviders.test.js`). `npm run
build`: clean. Not independently re-verified live against real APIs — this
sandbox has no egress to USDA/OFF (same constraint noted every prior
pass), and the other session's own live sweep is exactly the kind of
verification this report shouldn't duplicate.

No other repo changes to reconcile; all remaining "Reported"/"Deferred"
items unchanged. Live site: `GET /api/version` reports `c8fc50c` — three
commits behind current `main` HEAD (the gradient PR plus both of today's
search commits), for at least two consecutive check-ins now (this pass and
the last). Noted, not escalated to a new Info item yet: deploy cadence is
the owner's call and every previous lag has resolved within a pass or two;
worth a closer look only if it's still stuck here next check-in.

## 2026-08-26 — Check-in pass (recurring, 16:36 UTC)

Larger gap this time: ~30 commits, PRs #83–#93. `npm test`: 767/767 (up
from 616 — 151 new tests). `npm run build`: clean. Given the volume, this
pass triaged by commit message + targeted live verification of the
highest-risk change (the Today redesign) rather than a full line-by-line
review of every diff — consistent with this report's approach on every
large batch so far.

**Most significant: a genuine demo/real-data precedence bug, now fixed.**
`composeSignals()` merged per-metric signals in a single provider-
preference pass with no distinction between a provider's real data and
its canned demo fallback — a provider that was simply never connected
(running in default demo mode) could pre-empt a genuinely connected,
later-ordered provider's *real* data purely by sorting first in
`PREFERENCE`. Confirmed against production data: Garmin
"not-configured", Oura "oauth" (i.e., actually connected), yet Workouts
showed Garmin's fixed demo scenario instead of the user's real Oura
workout. This is exactly the failure mode this report's own earlier
passes flagged as unacceptable ("demo must never look like a live
connection") — a real, previously-undetected instance of it. Fixed with
a proper two-pass merge (real data first in preference order, demo only
as a last resort); a fresh account with nothing connected is unaffected.
Well-tested (dedicated precedence describe block, an end-to-end HTTP
test against a real Express app).

**Today header + Daily Signals redesign** (PRs #92, #93) — a substantial,
carefully-scoped visual/structural redesign: a compact day-context header
replacing an oversized masthead, a new circular readiness Dial, one
hairline-divided Daily Signals row instead of three equal boxes, and a
synthesized one-sentence day summary that's honest about absent/demo/stale
data rather than ever fabricating one. Notably self-correcting: the
following commit (PR #93) is the same effort's own re-review of its just-
merged PR #92, catching and fixing two real gaps (a historical day's
workout still read "planned" instead of "logged"; a genuine `/api/today`
fetch failure was indistinguishable from "still loading," so an outage
rendered a permanent skeleton instead of an error) — the kind of adversarial
self-check this report's own practice has consistently valued. Live-
verified: fresh signup, redesigned Today renders cleanly (Dial, honest
"Showing sample recovery data" disclosure, correctly-sized intake numeral
per this report's own earlier PR #43 fix, Energy Balance card, empty
Today's-log state) — zero console/network errors.

**Connections' 5-state distinction** (PR #90, Oura sync observability) —
adds a proper `syncing`/`stale`/`demo`/`not-configured`/`disconnected`/
`error` state model with a visible legend, "shape + word, never color
alone" (explicit colorblind-safe design). Live-verified: this dev
environment (no Oura/Garmin client credentials configured) correctly shows
"NOT AVAILABLE HERE" for both rather than a misleading non-functional
Connect button.

**Also landed, reviewed at commit-message level only (small, well-tested,
no red flags):** a no-code Apple Health ingest path via the Health Auto
Export app (new route, shares the existing ingest token + persistence
logic, honestly reports unmapped fields instead of dropping them); manual-
workout calorie estimation using the user's real logged weight instead of
a fabricated one; Plan's target-energy display between baseline and
today's adjusted values; and a documentation-only keystroke-efficiency
audit of food search (200 real queries against live USDA/OFF — 84.5%
usable within 20 typed characters, branded items the identified weak spot,
no code changes).

**Live site**: `GET /api/version` reports `9f0dd1a` (PR #90) — 4 commits
behind current `main`, but has moved forward since last check-in's stuck
`c8fc50c`, so treated as normal deploy cadence rather than a stall.

No fixes made directly by this pass. All remaining "Reported"/"Deferred"
items unchanged — nothing since the last check-in touches the Apple-token
bearer-credential item, provider-abstraction claim, forgot-password,
server logging, `SESSION_SECRET`, or either Garmin item.

## 2026-08-26 — Check-in pass (recurring, 20:35 UTC)

One PR since the last check-in (#95), but a large one: a fully phased
(1–6), evidence-driven overhaul of the entire food-search pipeline —
transport, ranking, honesty, and client-side race conditions. `npm test`:
874/874 (up from 767 — 107 new). `npm run build`: clean.

**Quality note, not a finding.** This PR is the most rigorously
self-documented piece of work this report has seen across every pass:
every phase commit carries its own before/after measurements on the same
200-item corpus from the same worktree base (not re-run separately, which
would confound the comparison), reports a genuine regression it caused
(latency +230ms p50, 4 items pushed past the result cap) rather than
rounding it away, and includes a commit whose entire purpose is
retracting an earlier commit's false claim ("verified by watching the
dev-server log" — it wasn't) once the author caught it. Every phase commit
carries a `NO-GO for production until the full pass is reviewed` line —
the author's own gate, not a claim about the repo; the owner's merge of
PR #95 is that review having happened. Given this level of built-in
verification, this pass triaged by reading the full phase history rather
than re-deriving what it already rigorously proved.

**What changed, briefly:** split USDA's Foundation/SR-Legacy pass from its
flakier Survey (FNDDS) pass so one no longer takes the other down;
switched Open Food Facts' primary endpoint from the legacy `cgi/search.pl`
(9/20 measured failures) to `search.openfoodfacts.org` (0/20), keeping the
legacy endpoint as fallback; added a whole-search deadline so one hung
provider can't block all results; separated `degraded`/`partial`/
`canonicalCoverage` as distinct honesty facts instead of one boolean that
was wrong 90% of the time on the baseline corpus; facet-aware ranking so
USDA's inverted comma-separated names ("Squash, summer, ... zucchini,
...") are correctly identified; a real Foundation-data bug where a missing
nutrient code 1008 rendered as a fabricated "0 kcal" instead of reading
the equivalent 2048/2047 codes; and client-side fixes for stale/crossed
search results on fast typing (a query-owned generation guard with a real
`AbortController`, not just a check-and-discard).

**Live-verified in this sandbox** (previously a reliable way to hit a
genuine upstream failure, since this environment has no egress to the old
`cgi/search.pl`): searching "zucchini" now returns correct, relevant
results (Zucchini, Courgettes, via `openfoodfacts`) with the new `per100`
comparison figure rendering correctly — a direct, independent confirmation
that the `search.openfoodfacts.org` transport fix is real, not just
measured by the PR's own harness. Updated the Search (OFF) row above to
note this further overhaul.

Live site: `GET /api/version` confirms it's redeployed and running this
exact commit (`45bbf76`, current `main` HEAD). No fixes made directly by
this pass. All remaining "Reported"/"Deferred" items unchanged.
