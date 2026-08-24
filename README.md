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

`GET /api/health` reports which of these are configured; the Targets screen shows
the same status.

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

## MVP feature scope

- [x] Barcode scan → lookup → log
- [x] Label photo → Claude vision parse → confirm/edit → log
- [x] Manual food entry (name + macros) → log
- [x] Today view: running totals vs. targets, editable/deletable log
- [x] History view: past days + 7-day average
- [x] Editable daily targets (versioned)
- [x] Local caching of scanned products for instant re-lookup
- [x] Installable PWA with offline app shell (last-loaded data readable offline)

### Deferred (v2)

- Offline **write** queue (log while offline, sync later) — today only offline
  *reads* work, via the service worker's NetworkFirst cache.
- Apple Health / Google Fit sync, recipe builder, meal planning.

## Deploying

The Express server is written so each route is portable to serverless functions
(e.g. Vercel `/api/*`) later. For now the simplest host is any Node platform
(Render, Railway, Fly, a small VPS) serving `dist/` behind the API, with a
reverse proxy mapping `/api` → the Express app and `DATABASE_URL` pointed at Neon.

## Notes

- Counts reflect what's on labels / in the databases; Open Food Facts is
  crowd-sourced, so occasionally a product's macros are missing or off — the
  confirm screen lets you correct any value before logging (edits create a new
  food row rather than overwriting the shared cached product).
- The local JSON store is a dev convenience only; use Neon for anything you care
  about keeping or syncing.
