# Body Current

A personal-use Progressive Web App for **fueling intelligence**: it pairs
food logging with wearable recovery and training signals (Oura, Garmin, Apple
Health) to surface one clear, transparent, **non-medical** recommendation —
*given my recovery, training, and intake so far, what should I do next?* Each
account is private — sign in with just an email and password, and your log,
targets, and connected wearables belong to that account alone. Every
"premium" feature is just on: full macro + micronutrient tracking, unlimited
scans, no ads.

Logging is the foundation and works **fully standalone** — scan a barcode, scan
a label, search, or type it in, with no wearables connected. The wearable layer
sits on top: when a provider is connected it sharpens the day's targets and the
next-action suggestion, but nothing about the core loop depends on it.

**Core loop:** open the installed PWA → tap **＋** → scan a barcode → confirm the
product and serving → log it → the **Today** screen shows a recovery/training
context strip, running totals against your targets, and a single focal
"what should I do next?" recommendation you can expand to see *why*. No barcode
(bulk bins, deli, produce)? Photograph the Nutrition Facts panel and Claude
reads it, or search by name, or type it in.

**Works with nothing connected.** The app ships with a seeded **demo scenario**
(an evening run) so the whole experience — context strip, adjusted targets,
next-action recommendation — is explorable before you connect any account. Demo
data is **always clearly labelled as demo** and is never presented as a live
connection.

## Navigation

Five tabs:

| Tab | What it holds |
|---|---|
| **Today** | Home. A context strip (recovery/training with source + freshness), a focal **next-action recommendation** with a **"Why this?"** disclosure, compact progress vs. targets, a manual water log, and the chronological food log. |
| **Log** | The four ways to add food — scan barcode, scan label, search, manual — plus one-tap re-log of recents, grouped by meal. |
| **Plan** | The canonical Daily Fuel Plan: one profile, planned sessions, daily energy/macros, progress, safety guardrails, and a plain-language rationale for every adjustment. Today uses these exact targets. |
| **Insights** | Nutrition trends over 7 / 14 / 30 days against the current canonical AFP target, with an explicit insufficient-data state. Recovery/training correlations are shown cautiously — never causal, never medical. |
| **Connections** | Provider rows (Oura, Garmin, Apple Health) with live status (connected / actively syncing / stale / demo / not-configured / disconnected / error), last-sync, categories, connect / reconnect / disconnect, per-provider **enable** + **demo** toggles, and toggles for what may influence the plan (readiness / sleep / workouts). Includes a privacy note. Oura additionally persists last-attempted-sync, the most recent backfill's fetched/accepted/deduplicated record counts, and a classified token-refresh/backfill failure reason — see `docs/oura-sync-runbook.md`. |

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite, Tailwind CSS v4, installable PWA (`vite-plugin-pwa`) |
| Backend | Express proxy (`server/`) — keeps all API keys server-side |
| Database | Neon Postgres in production; local JSON only for development or an explicitly disposable preview |
| Barcodes | `@zxing/browser` (camera, retail 1D formats) |
| Label OCR | Claude vision (`@anthropic-ai/sdk`), structured JSON output |
| Nutrition data | Open Food Facts (primary) → USDA FoodData Central (fallback), cached |

## Quick start

```bash
npm install
cp .env.example .env      # optional — see below
npm run dev               # web on :5173, API on :3001 (Vite proxies /api → API)
```

Open http://localhost:5173. **No keys are required** to scan a barcode and log
it — Open Food Facts is free and keyless, and with no `DATABASE_URL` the app
stores data in `server/.data/store.json` so the full loop works immediately.

Barcode scanning needs a camera + a secure context. `localhost` counts as secure;
to scan from a phone on your LAN, serve over HTTPS (e.g. a tunnel) or use the
"enter barcode digits" fallback in the scanner.

### Enabling the optional pieces

- **Durable storage (Neon):** production requires `DATABASE_URL`; set it in
  `.env`, then run `npm run db:init`
  to create the tables (or paste `schema.sql` into the Neon SQL editor).
- **Label OCR:** set `ANTHROPIC_API_KEY`. Optionally set `ANTHROPIC_MODEL`
  (defaults to `claude-opus-5`; `claude-haiku-4-5` is much cheaper per scan).
- **Better whole-food coverage:** set `FDC_API_KEY` (free USDA key).
- **Wearable signals (Oura):** connect via **OAuth 2.0** — set `OURA_CLIENT_ID`,
  `OURA_CLIENT_SECRET`, and `OURA_REDIRECT_URI`, then hit **Connect Oura** in the
  Connections tab — to feed recovery/readiness and expenditure into the plan and
  the Today context strip. A legacy `OURA_TOKEN` (PATs deprecated Dec 2025) still
  works as a single-account fallback. See [Wearables](#wearables-oura).
- **Wearable signals (Garmin):** a push-based alternative source for the same
  signals — set `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and
  `GARMIN_REDIRECT_URI`, verify the private partner wire and webhook-security
  contract, and only then set `GARMIN_INTEGRATION_VERIFIED=true`. The integration
  fails closed without that acknowledgement. Then choose **Connect Garmin**.
  Today prefers Oura and falls
  back to Garmin (`GET /api/energy/summary`). Garmin's Health API is gated by a
  partner program that was **on hold as of 2026**, so you may not be able to
  obtain credentials yet — see [Wearables](#wearables-oura).
- **Wearable signals (Apple Health):** no OAuth — Apple has no cloud API, so it
  is an **ingest** provider. A native iOS companion (or a Health-export importer)
  POSTs normalized samples to `POST /api/apple/ingest`, token-gated by the
  optional `APPLE_INGEST_TOKEN`. See [Apple Health](#apple-health-ingest).

`GET /api/health` reports which of these are configured; the Connections screen
shows the same status.

## Wearables (Oura)

### Provider abstraction & non-medical framing

Wearables sit behind a **provider abstraction**: each source (Oura, Garmin,
Apple Health) is an adapter that normalizes its own payload into shared signals
(readiness/recovery, sleep, workouts, expenditure). Adding a provider means
adding an adapter, not touching the UI or the plan engine. Every composed signal
carries **provenance** (which provider produced it) and **freshness** (fresh /
stale / unavailable), both surfaced in the Today context strip and on the
Connections tab, so a stale or missing signal is visible rather than silently
treated as current. For a live Oura read of the current day, freshness reflects
the successful fetch time while `recorded_at` remains the measurement-day
provenance; historical-day signals continue to age by their recorded day.
treated as current.

Signals feed only the **fueling and nutrition-planning** suggestions — adjusted
targets and the next-action recommendation. This app makes **no medical,
diagnostic, injury, or disease claims** of any kind; the recovery/training
correlations in Insights are shown cautiously and are explicitly non-causal.
Which categories may influence the plan (readiness / sleep / workouts) is your
choice, set per-toggle on the Connections tab.

Today shows an **Energy balance** card: calories logged (in) vs. Oura's total
daily expenditure (out) = net deficit/surplus, plus steps.
`GET /api/oura/summary?date=YYYY-MM-DD` returns the day's activity; the server
holds every token, and the integration (`server/integrations/oura.js`) is
token-agnostic on purpose.

**Connect via OAuth 2.0 (the primary path).** Oura **deprecated Personal Access
Tokens in Dec 2025** — an existing PAT still works as `OURA_TOKEN` (single
account), but new tokens require OAuth 2.0. One-time setup:

1. Register an application at the
   [Oura developer portal](https://cloud.ouraring.com/oauth/applications) — it
   gives you a **client ID** and **client secret**.
2. Set the app's **Redirect URI** to `<your-app-origin>/api/oura/callback`. For
   local dev that's `http://localhost:5173/api/oura/callback` (Vite proxies
   `/api` to the API server, and Oura returns the browser to the app origin); in
   production it's `https://<your-domain>/api/oura/callback`.
3. Put the three values — `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`,
   `OURA_REDIRECT_URI` — in `.env`.
4. In the app, open the **Connections** tab → the **Oura** card →
   **Connect Oura**, authorize on Oura, and you're returned to the app.

The connect flow requests the `email personal daily` scopes.

**Multiple accounts.** You can connect more than one Oura account — each person
authorizes their own via Oura's login, and each connected account is stored
server-side with its own tokens. The Today Energy-balance card uses the first
connected account. You can never read anyone's data without them authorizing
through Oura. That's *multiple connected data sources* — separate from turning
the whole app into a multi-user product.

**Token storage.** OAuth access + refresh tokens live server-side (the Neon
`oura_accounts` table, or the local JSON store) and are never returned to the
client; the server refreshes the access token automatically before it expires.
Tokens are stored **unencrypted** — fine for a personal single-user deployment,
worth hardening if you host this for others.

**Unified energy (out).** Today's **Energy balance** card now reads expenditure
from a single `GET /api/energy/summary?date=YYYY-MM-DD` — Oura if an Oura
account is connected, otherwise Garmin — so either wearable drives the same
card without the client caring which one answered.

**Readiness contributors, sleep score, workouts (25 Aug 2026).** Beyond the
readiness score, sleep duration, expenditure, and steps this app already
pulled, it now also retains:
- **HRV balance, resting heart rate, body temperature** — `daily_readiness`'s
  `contributors` object, three named sub-**scores** in [1, 100] (not raw
  biometrics — Oura's contributor scores compare a recent window to your own
  baseline and report how that comparison scored, same shape as the
  top-level readiness score), plus the genuinely raw
  `temperature_deviation`/`temperature_trend_deviation` fields (°C). All
  four ride alongside the readiness signal itself (`signals.readiness.contributors`,
  `.temperature_deviation`, `.temperature_trend_deviation`) — available via
  the API and persisted through backfill/resync; not yet given dedicated
  Today/Insights UI chrome (kept out of scope for this pass — the context
  strip's three columns are already pixel-tuned at 320px, and this felt like
  a real design decision rather than a plumbing one).
- **Sleep quality score** — `daily_sleep`'s 0-100 score (a different endpoint
  from sleep *duration*), surfaced in Today's Sleep cell as "Score NN"
  alongside the existing hours/minutes.
- **Real workout detection** — `GET /v2/usercollection/workout` (auto-detected
  or manually logged in the Oura app), stored per connected account
  (`oura_workouts`, upserted on Oura's own workout id) and kept current by
  the same daily backfill/resync that already covers readiness/sleep/
  activity. The day's earliest-starting workout composes as the `workout`
  signal, matching every other provider's one-workout-per-day shape; every
  workout that day is retained for a future multi-workout view.

All of the above uses the `daily` scope this app already requests — no new
OAuth consent, no reconnect needed for already-connected accounts.

**Not implemented: daily stress and SpO2.** Both are real Oura v2 endpoints
(`daily_stress`, `daily_spo2`) but require OAuth scopes this app's connect
flow does not currently request (`stress` and `spo2`/`spo2Daily`
respectively — VERIFY the exact scope string against Oura's live docs before
wiring either up). Concretely, adding them means: (1) add the scope(s) to
`SCOPES` in `server/integrations/oura.js`; (2) every **already-connected**
account's stored token was authorized under the old scope set and will 403
on these endpoints until that person disconnects and reconnects through
Oura's consent screen again — there is no silent scope upgrade; (3) SpO2
specifically also needs a Gen3+ ring and an active Oura membership on the
connected account, a hardware/subscription gate outside this app's control
and unverifiable without a real qualifying account. Given the reconnect
requirement and the unverifiable SpO2 gate, this is left undone rather than
half-tested against assumptions about scope names and hardware this
environment cannot confirm.

### Garmin (data-in)

Garmin mirrors the Oura shape — the same Energy-balance card, a day-at-a-time
summary held server-side — but Garmin's API is **push, not pull**. You connect
once via **OAuth 2.0 with PKCE**; after that Garmin **POSTs** daily summaries to
a webhook as they're produced, the server stores each one, and a day is served
back from the store rather than fetched on demand. `server/integrations/garmin.js`
holds the credentials server-side, the same way `oura.js` does.

One-time setup:

1. Register an app in the Garmin **Health API** (part of the Garmin Connect
   Developer Program) for a **client ID** and **client secret**.
2. Set the app's **Redirect URI** to `<your-app-origin>/api/garmin/callback`.
   For local dev that's `http://localhost:5173/api/garmin/callback`; in
   production it's `https://<your-domain>/api/garmin/callback`.
3. Put `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and `GARMIN_REDIRECT_URI`
   in `.env`. Check the approved-partner documentation against every `VERIFY`
   marker, including the provider's current webhook authentication/origin
   verification requirements. Implement those controls if required, then set
   `GARMIN_INTEGRATION_VERIFIED=true`. The flag records that review; it is not
   itself request authentication.
4. In the app, open **Connections** → the **Garmin** card → **Connect
   Garmin**, authorize on Garmin, and you're returned to the app.

The flow:

- `GET /api/garmin/connect` starts OAuth 2.0 (PKCE) and redirects to Garmin's
  consent screen.
- `GET /api/garmin/callback` stores the connected account (access + refresh
  tokens, server-side, unencrypted, refreshed automatically — same posture as
  Oura).
- `POST /api/garmin/webhook` is where Garmin pushes daily summaries; the server
  persists each one. A **backfill** request asks Garmin to re-send history for a
  newly-connected account.
- `GET /api/garmin/summary?date=YYYY-MM-DD` returns a day **from the store**
  (Garmin never gets a live read — it already sent the data).
- `GET /api/garmin/accounts` / `DELETE /api/garmin/accounts/:id` list and
  disconnect connected accounts, exactly like the Oura pair.

**Program on hold (2026).** The Garmin Connect Developer Program that gates the
Health API is **partner-approval-only, and was on hold as of 2026** — you may
not be able to obtain credentials yet. The integration is built and wired
end-to-end; it is **ready when approved**, not usable today unless you already
hold Garmin Health API access.

**VERIFY the wire details.** Because the program is gated, the exact Garmin
endpoint URLs, the OAuth scope name, and the summary payload field names live
behind Garmin's partner portal and could not be confirmed from public docs.
They are marked **`VERIFY`** in `server/integrations/garmin.js` and must be
checked against the partner documentation once access is granted. OAuth,
provider status, and webhook ingestion stay disabled unless
`GARMIN_INTEGRATION_VERIFIED=true`; do not set it until webhook request
verification has also been resolved.

### Apple Health & Apple Watch — native companion

Apple Health has **no cloud API**, and **the browser PWA cannot connect to Apple
Watch** — HealthKit data only leaves the device through a native app the user
installs. A native **iOS + watchOS companion** (SwiftUI) provides that bridge and
lives in [`ios/`](./ios/) with full build/verify docs. Apple is an **ingest
(push-in) provider**: the companion reads HealthKit on the device and **POSTs
normalized samples** to your own server at `POST /api/apple/ingest`, where they
become wearable signals exactly like Oura's or Garmin's — same provider-neutral
model, provenance/freshness, and influence toggles.

- **Minimum, read-only permissions:** workouts & timing, active energy, exercise,
  and sleep — plus heart-rate / HRV as **context only** (never changes a target,
  proven by `test/apple.test.js`). No clinical data; no workout recording (reads
  approved workouts only). Missing categories show "No data", never "denied".
- **The watch** is a minimal glance — next action, pre/post-workout fuel targets,
  today's calories/protein — plus a "Log later on iPhone" handoff (no scanning on
  the watch). The phone is the HealthKit bridge and sends it a `PlanSummary`.
- **Token gate.** `POST /api/apple/ingest` is protected by the optional
  `APPLE_INGEST_TOKEN` env var, sent as the **`x-ingest-token`** header. Unset =
  open, acceptable only on a **private, non-public** instance.
- **Storage & control.** The companion reads on your iPhone/Apple Watch and syncs
  to **your own server** — nothing is sent to any third party; you choose which
  signals influence the plan and can delete synced data at any time.

See [`ios/README.md`](./ios/README.md) for capabilities, entitlements, the exact
HealthKit types, and the device-test matrix (the native targets are review-ready
source — building and device-testing require a Mac + a paired iPhone/Apple Watch).

### Deploy & verify (real Oura credentials on a live host)

The Oura OAuth flow is production-ready; wiring real credentials is a deployment
step. Set `OURA_CLIENT_ID/SECRET/REDIRECT_URI` on the host, connect once, and
verify **from the box** with `scripts/verify_deploy.sh https://<your-domain>` —
see [`docs/DEPLOY-VERIFY.md`](./docs/DEPLOY-VERIFY.md).

### On-watch app (Connect IQ)

A companion on-watch app for the Fenix line lives in
[`garmin-connectiq/`](./garmin-connectiq/) — a separate Monkey C project with
its own README. It shows the day's nutrition totals against targets on the
watch, reading `GET /api/today/summary?date=`. **Connect IQ is a separate
program from the Garmin Health / Developer Program** and needs no partner
approval to build or sideload, so this piece works today regardless of the
Health API hold above.

## Data model

- **`foods`** — id, barcode (nullable), name, brand, serving_size, serving_unit,
  calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
  source (`openfoodfacts` | `usda` | `manual` | `ocr`), raw_api_response (jsonb).
  Every successful lookup is cached here, so repeat scans never hit the network.
- **`users`** — account credentials plus the accepted legal-document version
  and acceptance timestamp; password hashes and acceptance records never leave
  the server.
- **`log_entries`** — id, food_id, logged_at, servings_consumed, meal (optional).
- **`water_entries`** — account-owned manual water amount (millilitres) and timestamp; it is exported/deleted with the account and never drives an automatic hydration or sodium target.
- **`afp_profile`** — the canonical body/activity/goal profile used to build
  daily targets. Existing calculator profiles are copied into missing fields
  once and never overwrite explicit AFP edits.
- **`planned_workouts`** — per-account training sessions used both for daily
  energy/carbohydrate periodization and Today's workout context.
- **`afp_daily_plans`** — versioned, reproducible daily plan snapshots with
  computed targets, overrides, warnings, and the exact input snapshot.
- **`daily_targets`** — deprecated compatibility data for older clients; it no
  longer drives the visible Today or Plan experience.
- **`integrations`** — one row per provider (`oura` | `garmin` | `apple`):
  `enabled` / `demo` flags, `connected_at` / `last_synced_at` timestamps, and a
  `settings` blob (incl. which categories may influence the plan). Backs the
  Connections tab.
- **`wearable_signals`** — normalized per-provider, per-metric, per-day signal
  samples (readiness, sleep, workouts, expenditure, …) with `recorded_at` (when
  the wearable measured it) and `fetched_at` (when we ingested it), which is what
  drives the freshness label.
- **`daily_plans`** — a per-day snapshot of baseline + adjusted targets, the
  rationale, the signals used, and the rules version — so a day's **"Why this?"**
  is reproducible after the fact rather than recomputed against changed inputs.

Full DDL in [`schema.sql`](./schema.sql).

## API (all under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | backend + which integrations are configured |
| GET | `/account/export` | download the signed-in account's data as JSON; credentials, provider tokens, and the shared food cache are excluded |
| POST | `/account/delete` | password + exact-email verified permanent account deletion; clears the session and cascades all account-owned data |
| GET | `/lookup/:barcode` | cache → Open Food Facts → USDA; caches the hit |
| GET | `/search?q=` | text search (USDA + OFF) for no-barcode foods. Returns `{results, degraded, partial, canonicalCoverage, usdaConfigured, query, providers}` — three separate honesty facts, not one: `degraded` = everything tried failed, `partial` = some of it did and this answer is incomplete, `canonicalCoverage` = whether any source of canonical whole foods answered. See `docs/food-search.md`. |
| POST | `/ocr` | `{imageBase64, mediaType}` → parsed food (Claude vision) |
| POST | `/foods` | persist a food |
| GET | `/entries?from=&to=` | log entries in a time range |
| POST | `/entries` | log a food (`food_id` or inline `food`) |
| PATCH/DELETE | `/entries/:id` | edit / remove an entry |
| GET/POST | `/water?from=&to=` / `/water` | list / add manual water entries for the signed-in account |
| PATCH/DELETE | `/water/:id` | edit / remove a manual water entry |
| GET / PUT | `/afp/profile` | read / set the canonical planning profile; GET performs safe legacy migration |
| GET / PUT / DELETE | `/afp/workouts` | list, save, and remove canonical planned sessions |
| GET | `/afp/plan?date=` | canonical daily targets, progress, explanation, safety state, and freeze state |
| GET | `/today?date=&from=&to=` | Today composite built from the same AFP baseline/targets, canonical planned or completed workout, intake, and next action |
| GET | `/plan/today?date=` | deprecated compatibility adapter over the canonical AFP plan |
| GET / PUT | `/targets` | deprecated static-target compatibility surface |
| GET | `/signals` | composed wearable signals (one per metric) with provenance + freshness |
| GET | `/insights?window=7\|14\|30` | nutrition trends against today's canonical AFP target + insufficient-data flag + a cautious (non-causal) correlations note |
| GET | `/oura/connect` | start OAuth — redirects to Oura's consent screen |
| GET | `/oura/callback` | OAuth callback — stores the account, returns to the app |
| GET | `/oura/accounts` | list connected accounts (no tokens) + config state |
| DELETE | `/oura/accounts/:id` | disconnect an account |
| GET | `/oura/summary?date=` | Oura activity/expenditure for a day (if configured) |
| GET | `/garmin/connect` | start Garmin OAuth 2.0 (PKCE) — redirects to Garmin's consent screen |
| GET | `/garmin/callback` | OAuth callback — stores the account, returns to the app |
| POST | `/garmin/webhook` | Garmin pushes daily summaries here; disabled until the partner contract is explicitly verified |
| GET | `/garmin/accounts` | list connected Garmin accounts (no tokens) + config state |
| DELETE | `/garmin/accounts/:id` | disconnect a Garmin account |
| GET | `/garmin/summary?date=` | a stored Garmin day (served from the store, not fetched) |
| GET | `/energy/summary?date=` | unified expenditure (out): Oura if connected, else Garmin |
| POST | `/apple/token` | generate (and invalidate the previous) per-account pairing token for the companion — Connections tab has a "Generate pairing token" button for this |
| POST | `/apple/ingest` | ingest Apple Health samples (token-gated by `APPLE_INGEST_TOKEN`) |
| GET | `/connections` | provider statuses (incl. demo) + the plan-influence toggles |
| PUT | `/connections/influence` | set which signal categories (readiness / sleep / workouts) may influence the plan |
| PUT | `/connections/:provider` | set a provider's `enabled` / `demo` flags |
| GET | `/today/summary?date=` | nutrition totals vs. targets for a day (used by the Connect IQ watch app) |

## Agent surface (A2A)

A narrow, **read-only** surface so another agent can ask Body Current how fueling
is going — shaped after the [A2A protocol](https://a2a-protocol.org) (agent
card + JSON-RPC), with the same **non-medical** framing as everything else
here: it reports what was logged and what the plan said, never advice or
diagnosis. Nothing on this surface writes.

| Method | Path | Purpose |
|---|---|---|
| GET | `/.well-known/agent-card.json` | A2A agent card: name, version, two skills (`operational-status`, `fueling-status`), and the bearer security scheme. Contains no secrets. |
| GET | `/api/agent/status` | The status read — two tiers, one route (below) |
| POST | `/a2a` | Minimal JSON-RPC 2.0 endpoint: `message/send` returns a completed Task whose artifact is the same status JSON the caller's tier earns. Stateless — `tasks/get` answers `-32001` (tasks are not persisted). |

**Two tiers, one route.** Anonymous callers get **operational facts only** —
the same config-level fields as `GET /api/health` (backend, which
integrations are configured) plus `fueling: { available: false }`. Presenting
`Authorization: Bearer <OMNIFUEL_A2A_TOKEN>` unlocks the **fueling tier**:
today's kcal logged, entry count, minutes since the last log, baseline vs.
plan-adjusted targets with the day's adjustment factors, per-provider status +
freshness, and a top-level `demo` flag whenever any contributing adjustment
came from demo data (a canned demo adjustment must never read as real). A
**wrong** token gets exactly the anonymous body — same shape, same reason,
same timing-safe compare as the Apple ingest token — never a distinct error
to probe against.

Honest refusals, in the same spirit as the rest of the app:

- `OMNIFUEL_A2A_TOKEN` unset → `fueling: { available: false, reason: "not configured" }`, even with a token presented.
- Not exactly one account → `reason: "no sole account"` — the same rule as the
  legacy Apple ingest token: a single shared secret can only be attributed
  while there is exactly one person it could mean.
- Targets never set → `targets: { set: false }` — the fabricated 2000 kcal
  default is never reported as the user's target.

| Env var | Meaning |
|---|---|
| `OMNIFUEL_A2A_TOKEN` | Bearer token for the fueling tier. Unset = the tier is off, permanently and visibly. |
| `OMNIFUEL_PUBLIC_URL` | Public origin written into the agent card's `url` (default `https://omnifuelapp.tech`). |

## MVP feature scope

- [x] Barcode scan → lookup → log
- [x] Label photo → Claude vision parse → confirm/edit → log
- [x] Manual food entry (name + macros) → log
- [x] Today view: context strip, running totals vs. targets, editable/deletable log
- [x] History view: past days + 7-day average
- [x] One canonical Daily Fuel Plan shared by onboarding, Today, Plan, and the
  watch summary compatibility route
- [x] Explainable targets with planned/completed training reconciliation,
  versioned snapshots, explicit overrides, and safety guardrails
- [x] Focal **next-action recommendation** with a "Why this?" disclosure
- [x] Provider abstraction with per-signal **provenance + freshness**
  (Oura, Garmin, Apple Health behind one adapter shape)
- [x] Seeded **demo scenario** (evening run) so the full experience works with no
  accounts connected, always labelled as demo
- [x] Insights: nutrition trends over 7 / 14 / 30 days with an explicit
  insufficient-data state and cautious (non-causal) correlations
- [x] Local caching of scanned products for instant re-lookup
- [x] Recent-foods quick re-log (one tap; cached for offline use)
- [x] Installable PWA with offline app shell (last-loaded data readable offline)
- [x] Offline **write** queue — log while offline; entries are held locally
  (with their original timestamp), shown as "pending", and auto-synced on
  reconnect. Barcode lookup / OCR still need network, but manual entry and
  re-logging a recent food work fully offline.

### Deferred (v2)

- **Wearables:** **Oura** energy-balance and the **OAuth 2.0 connect flow**
  (multi-account) are in — see [Wearables](#wearables-oura). **Garmin** data-in
  (Health API, OAuth 2.0 + PKCE, push webhook) is now in as well —
  **scaffolded, ready-when-approved**: the Garmin Connect Developer Program that
  gates it is partner-approval-only and was on hold as of 2026, and the exact
  wire details are marked `VERIFY` until access is granted. The on-watch
  **Connect IQ** glance for the Fenix (`garmin-connectiq/`) is in too — a
  separate program that needs no partner approval. **Apple Health** is now in as
  an **ingest** provider — no cloud API, so a companion POSTs samples to
  `POST /api/apple/ingest` (token-gated) — see [Apple Health](#apple-health-ingest).
- Google Fit sync, recipe builder, meal planning.

## Deploying

**Why you need to:** the camera (barcode scanning) and the service worker only
work over **HTTPS** (or `localhost`). To scan on your phone, the app must be
served from a secure origin — so deploy it and put it behind TLS.

In production the Express server serves the built PWA **and** the API from one
origin, so the frontend's relative `/api` calls just work — no separate frontend
host, no CORS. `DATABASE_URL` and `SESSION_SECRET` are mandatory: startup fails
closed rather than accepting accounts into disposable storage or rotating every
session at redeploy. `ALLOW_EPHEMERAL_STORAGE=true` exists only for an explicitly
disposable production preview and must not be used for real data.

Public credential endpoints have a bounded in-process abuse limiter. Defaults:
8 attempts per client+email and 30 per client address over 15 minutes for
login, and 5 signup attempts per client address per hour. Override with
`AUTH_LOGIN_CREDENTIAL_MAX`, `AUTH_LOGIN_IP_MAX`, `AUTH_LOGIN_WINDOW_MS`,
`AUTH_SIGNUP_IP_MAX`, and `AUTH_SIGNUP_WINDOW_MS`. This limiter is per process;
before running multiple API replicas, replace or supplement it with a shared
edge/Redis limiter so limits cannot be bypassed by replica rotation.

For a private first-ten-person alpha, set `ALPHA_INVITE_ONLY=true` and provide
exactly ten distinct high-entropy codes in comma-separated
`ALPHA_INVITE_CODES` (24–128 letters, numbers, `_`, or `-`). Misconfiguration
fails closed. Public status exposes only whether an invite is required;
plaintext codes are never logged or persisted. Postgres atomically enforces
single redemption and retains the digest ledger after account deletion. Apply
`schema.sql` before enabling this additional gate; it never bypasses the legal
launch gate. To deliver an invite without exposing it to the server or browser
history, use `https://<your-domain>/#invite=<code>`; the app accepts only the
configured code character set and immediately removes the fragment after
prefilling signup.

After deployment and secret configuration, run the read-only alpha gate:

```bash
EXPECTED_SHA="$(git rev-parse HEAD)" scripts/verify_alpha.sh https://omnifuelapp.tech
```

```bash
npm run build && npm start      # serves dist/ + /api on PORT (default 3001)
```

Or with Docker (host-agnostic — Render, Railway, Fly, Cloud Run, a VPS):

```bash
docker build -t nutrition-tracker .
docker run -p 3001:3001 \
  -e DATABASE_URL="postgres://…neon…" \
  -e ANTHROPIC_API_KEY="sk-ant-…" \
  -e FDC_API_KEY="…" \
  nutrition-tracker
```

Put a reverse proxy (Caddy/nginx) in front for TLS. With `DATABASE_URL` set,
run `npm run db:init` before each schema-bearing release. It is idempotent and
upgrades an existing deployment as well as initializing a new one. Each route is written to stay
portable to serverless functions (e.g. Vercel `/api/*`) if you'd rather split
them later.

## Control Tower Shift (mini-game)

A self-contained arcade survival mini-game living in `control-tower-shift/`.
You operate a command tower through an escalating shift: waves of threats close
in, you clear them for points, and five abilities (shield, pulse clear, speed
burst, score multiplier, repair) manage the pressure. Survive all waves to win;
lose all tower integrity and the shift fails.

Navigate to `/#control-tower` to play. No tab is added to the five-tab nav — the
game lives behind a hash route and lazy-loads its own chunk so the main app is
unaffected until you land on it.

**How to play:** Tap a threat to clear it, or focus the play field and press
Enter/Space to clear the threat nearest the tower. Press **P** to pause. Five
ability buttons manage the pressure. Full instructions are in the "How to play"
panel, opened with the "?" toggle in the header.

The game follows the repo's visual system: paper ground, ink lines, cobalt
accent, Bodoni/Archivo typography, status shown by shape + word, 44px touch
targets, and `prefers-reduced-motion` handling. It uses original geometric
shapes only — no third-party assets.

```bash
# Play in the dev server
npm run dev    # then navigate to /#control-tower

# Test (80 tests across the deterministic core, spawner/loop, and render layer)
npx vitest run control-tower-shift

# Build (game ships as its own ~12KB lazy chunk)
npm run build
```

See `control-tower-shift/PROGRESS.md` for the full milestone log and
`control-tower-shift/ASSET-AUDIT.md` for the design rationale.

## Design

Visual/UX design rationale (what changed, why, and the tokens/components it
uses) lives in [`docs/DESIGN.md`](./docs/DESIGN.md) — start there before a
UI-facing change; add a new dated section rather than a second file.

## Notes

- Counts reflect what's on labels / in the databases; Open Food Facts is
  crowd-sourced, so occasionally a product's macros are missing or off — the
  confirm screen lets you correct any value before logging (edits create a new
  food row rather than overwriting the shared cached product).
- The local JSON store is a dev convenience only; use Neon for anything you care
  about keeping or syncing.
