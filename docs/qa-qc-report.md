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
| — | SEO metadata | Missing `<meta name="description">`, no `robots.txt` | Merged (2026-08-25, PR #18) |
| — | Accessibility | Search-foods input had no accessible name (placeholder only) | Merged (2026-08-25, PR #19) |
| — | Connections copy | "Delete synced history" footer described working functionality; button admits it's not wired up | Merged (2026-08-25, PR #20) |
| — | Legal pages | Garmin described as "(planned)" / "later" though the integration is actually built | Merged (2026-08-25, PR #21) |
| — | Terminology | Today's third context cell said "Training" (elsewhere "Workouts"); Insights caption said "recovery" next to a "Readiness" header | Merged (2026-08-25, PR #22) |
| — | README copy | README quoted the disclosure label as "Why?"; actual component text is "Why this?" | Merged (2026-08-25, PR #23) |

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
