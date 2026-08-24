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
  (multi-account) are in — see [Wearables](#wearables-oura); still to come:
  **Garmin** (Health API — gated behind Garmin's developer program; apply early),
  and optionally an on-watch **Connect IQ** glance for the Fenix line.
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
