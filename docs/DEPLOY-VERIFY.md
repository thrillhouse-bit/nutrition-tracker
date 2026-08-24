# Deploy & verify — real Oura credentials on a live host

The Oura OAuth flow is already production-ready (server-side only): stateless
HMAC-signed CSRF `state`, automatic access-token refresh, multiple connected
accounts, tokens stored server-side and never returned to the browser
(`server/integrations/oura.js`, `server/index.js`). "Wiring real credentials" is
therefore a **deployment** step — set the secrets on the host, connect once, and
verify **from the box**. This app is portable (VPS, Vercel, Render, Fly, Docker),
so the steps below are host-agnostic.

> **Why "from the box":** local source cannot tell you what a remote host is
> actually doing. Every claim of "Oura is live" must come from a probe run
> against the deployment — that's what `scripts/verify_deploy.sh` is for.

## Turnkey path (Render + Neon), start to finish

The app is a single Docker image (Express serves the built PWA **and** `/api`
from one HTTPS origin). A [`render.yaml`](../render.yaml) blueprint makes the
deploy near one-click. Order matters because the Oura redirect URI needs the
final host URL.

1. **Deploy the app (get an HTTPS URL).** Render dashboard → **New → Blueprint**
   → pick `thrillhouse-bit/nutrition-tracker` → it reads `render.yaml` and builds
   the Dockerfile. When it's live you get a URL like
   `https://nutrition-tracker-xxxx.onrender.com`. (Health check is `/api/health`.)
2. **(Recommended) Add a database** so Oura tokens survive restarts. Create a
   free [Neon](https://neon.tech) project, copy the connection string, and once
   (Neon SQL editor) paste the contents of [`schema.sql`](../schema.sql) to
   create the tables. Set `DATABASE_URL` on Render to that string.
   *Quick-test alternative:* skip the DB and verify immediately after connecting
   Oura — the in-container JSON store keeps the token until the next deploy.
3. **Register the Oura app** (see below) with the redirect URI
   `https://<your-render-url>/api/oura/callback`.
4. **Set the Oura env vars on Render** (dashboard → your service → Environment):
   `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, and `OURA_REDIRECT_URI` = the callback
   URL above. Save → Render redeploys.
5. **Connect once:** open the URL → **Connections → Connect Oura** → authorize.
6. **Verify from the box:** send me the URL and I'll run
   `scripts/verify_deploy.sh https://<your-render-url>` from here and report the
   real result (or run it yourself).

> Other hosts work identically — Railway/Fly/Cloud Run/a VPS all build the same
> Dockerfile; only the env-var UI and TLS setup differ. On a VPS, put Caddy in
> front for HTTPS and mount a volume at `server/.data` (or use Neon) for
> persistence.

## 1. Get Oura OAuth credentials

1. Create an app at the [Oura developer portal](https://cloud.ouraring.com/oauth/applications) → note the **client id** and **client secret**.
2. Set its **Redirect URI** to `https://<your-domain>/api/oura/callback` (exactly; for local dev `http://localhost:5173/api/oura/callback`).
3. Scopes requested by the app: `email personal daily`.

## 2. Set the secrets on the host (never in git, argv, or chat)

Locally, `./set-env.sh` writes to a gitignored `.env` without touching shell
history:

```bash
./set-env.sh OURA_CLIENT_ID
./set-env.sh OURA_CLIENT_SECRET
./set-env.sh OURA_REDIRECT_URI     # https://<your-domain>/api/oura/callback
```

On a hosted platform, set the same three as environment variables in the
provider's dashboard (Vercel/Render/Fly) or the systemd unit / `docker run -e`
on a VPS. A legacy `OURA_TOKEN` (PATs deprecated Dec 2025) still works as a
single-account fallback. Reference secrets **by name** only — never paste values
into a PR, issue, or chat.

## 3. Connect once

Deploy, open `https://<your-domain>`, go to **Connections → Connect Oura**,
authorize on Oura, and you're returned to the app. (Repeat for additional
accounts; the Today/Plan signals use the first connected account.)

## 4. Verify — from the box, not from source

```bash
scripts/verify_deploy.sh https://<your-domain>
# optionally also test the Apple ingest path:
APPLE_INGEST_TOKEN=<same-as-on-box> scripts/verify_deploy.sh https://<your-domain>
```

It probes the live host and prints a PASS/FAIL matrix:

- `/api/health` responds; reports `backend`, `oura`, `garmin`.
- Oura credentials are configured on the box.
- An Oura account is connected.
- `/api/oura/summary?date=<today>` returns **live activity** → end-to-end verified.
- `/api/signals` shows readiness as **live** (not demo).
- (Optional) Apple ingest accepts a token-gated request.

A green run against the deployment is the only thing that should ever be called
"verified on the live host". Until then, the honest status is "configured,
pending a live probe".

## Notes

- With `DATABASE_URL` set (Neon), data persists and syncs across devices; without
  it the host uses a local JSON store (fine for a single box).
- Garmin's Health API is partner-gated (on hold as of 2026); its flow mirrors
  Oura and is ready when approved.
- Apple Health has no OAuth — see [`ios/README.md`](../ios/README.md); the
  companion posts to `/api/apple/ingest` (gate it with `APPLE_INGEST_TOKEN` on
  any public host).
