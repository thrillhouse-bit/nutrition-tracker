# Nutrition Tracker

A personal-use Progressive Web App for tracking daily nutrition by scanning
barcodes and food labels. Single user, no accounts, every "premium" feature just
on: full macro + micronutrient tracking, unlimited scans, no ads.

**Core loop:** open the installed PWA → tap **＋** → scan a barcode → confirm the
product and serving → log it → the Today screen shows running totals against your
targets. No barcode (bulk bins, deli, produce)? Photograph the Nutrition Facts
panel and Claude reads it, or search by name, or type it in.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite, Tailwind CSS v4, installable PWA (`vite-plugin-pwa`) |
| Backend | Express proxy (`server/`) — keeps all API keys server-side |
| Database | Neon Postgres when `DATABASE_URL` is set; local JSON file otherwise |
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

- **Cross-device sync (Neon):** set `DATABASE_URL` in `.env`, then `npm run db:init`
  to create the tables (or paste `schema.sql` into the Neon SQL editor).
- **Label OCR:** set `ANTHROPIC_API_KEY`. Optionally set `ANTHROPIC_MODEL`
  (defaults to `claude-opus-5`; `claude-haiku-4-5` is much cheaper per scan).
- **Better whole-food coverage:** set `FDC_API_KEY` (free USDA key).
- **Energy balance (Oura):** connect via **OAuth 2.0** — set `OURA_CLIENT_ID`,
  `OURA_CLIENT_SECRET`, and `OURA_REDIRECT_URI`, then hit **Connect Oura** in the
  Targets tab — to show calories in − activity out on Today. A legacy `OURA_TOKEN`
  (PATs deprecated Dec 2025) still works as a single-account fallback. See
  [Wearables](#wearables-oura).
- **Energy balance (Garmin):** a push-based alternative source for the same
  card — set `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, and
  `GARMIN_REDIRECT_URI`, then **Connect Garmin**. Today prefers Oura and falls
  back to Garmin (`GET /api/energy/summary`). Garmin's Health API is gated by a
  partner program that was **on hold as of 2026**, so you may not be able to
  obtain credentials yet — see [Wearables](#wearables-oura).

`GET /api/health` reports which of these are configured; the Targets screen shows
the same status.

## Wearables (Oura)

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
4. In the app, open the **Targets/Settings** tab → the **Oura** card →
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
   in `.env`.
4. In the app, open **Targets/Settings** → the **Garmin** card → **Connect
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
checked against the partner documentation once access is granted.

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
- **`log_entries`** — id, food_id, logged_at, servings_consumed, meal (optional).
- **`daily_targets`** — versioned; the latest `effective_from` row drives the
  Today rings.

Full DDL in [`schema.sql`](./schema.sql).

## API (all under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | backend + which integrations are configured |
| GET | `/lookup/:barcode` | cache → Open Food Facts → USDA; caches the hit |
| GET | `/search?q=` | text search (USDA + OFF) for no-barcode foods |
| POST | `/ocr` | `{imageBase64, mediaType}` → parsed food (Claude vision) |
| POST | `/foods` | persist a food |
| GET | `/entries?from=&to=` | log entries in a time range |
| POST | `/entries` | log a food (`food_id` or inline `food`) |
| PATCH/DELETE | `/entries/:id` | edit / remove an entry |
| GET / PUT | `/targets` | read / set daily targets |
| GET | `/oura/connect` | start OAuth — redirects to Oura's consent screen |
| GET | `/oura/callback` | OAuth callback — stores the account, returns to the app |
| GET | `/oura/accounts` | list connected accounts (no tokens) + config state |
| DELETE | `/oura/accounts/:id` | disconnect an account |
| GET | `/oura/summary?date=` | Oura activity/expenditure for a day (if configured) |
| GET | `/garmin/connect` | start Garmin OAuth 2.0 (PKCE) — redirects to Garmin's consent screen |
| GET | `/garmin/callback` | OAuth callback — stores the account, returns to the app |
| POST | `/garmin/webhook` | Garmin pushes daily summaries here; the server stores them |
| GET | `/garmin/accounts` | list connected Garmin accounts (no tokens) + config state |
| DELETE | `/garmin/accounts/:id` | disconnect a Garmin account |
| GET | `/garmin/summary?date=` | a stored Garmin day (served from the store, not fetched) |
| GET | `/energy/summary?date=` | unified expenditure (out): Oura if connected, else Garmin |
| GET | `/today/summary?date=` | nutrition totals vs. targets for a day (used by the Connect IQ watch app) |

## MVP feature scope

- [x] Barcode scan → lookup → log
- [x] Label photo → Claude vision parse → confirm/edit → log
- [x] Manual food entry (name + macros) → log
- [x] Today view: running totals vs. targets, editable/deletable log
- [x] History view: past days + 7-day average
- [x] Editable daily targets (versioned)
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
  separate program that needs no partner approval.
- Apple Health / Google Fit sync, recipe builder, meal planning.

## Deploying

**Why you need to:** the camera (barcode scanning) and the service worker only
work over **HTTPS** (or `localhost`). To scan on your phone, the app must be
served from a secure origin — so deploy it and put it behind TLS.

In production the Express server serves the built PWA **and** the API from one
origin, so the frontend's relative `/api` calls just work — no separate frontend
host, no CORS.

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
run `npm run db:init` once against Neon first. Each route is written to stay
portable to serverless functions (e.g. Vercel `/api/*`) if you'd rather split
them later.

## Notes

- Counts reflect what's on labels / in the databases; Open Food Facts is
  crowd-sourced, so occasionally a product's macros are missing or off — the
  confirm screen lets you correct any value before logging (edits create a new
  food row rather than overwriting the shared cached product).
- The local JSON store is a dev convenience only; use Neon for anything you care
  about keeping or syncing.
