# Apple Health via "Health Auto Export" — no-code setup

A second way to get Apple Health / Apple Watch data into this app, alongside
the native [`ios/`](../ios/) companion (which needs a Mac + Xcode to build).
**Health Auto Export** (HAE) is an existing, real App Store app that already
reads HealthKit and can POST it to a custom REST API — no code, no Xcode,
just two fields and a header in an app you install.

Same destination as the native companion: both land in the same
`wearable_signals` rows, through the same `store.replaceAppleSignals` call
(`server/index.js`'s `ingestAppleSamples`), so once data is flowing it's
indistinguishable from a native-companion sync anywhere else in the app —
Connections, Insights, the training-load chart, all of it.

> **This is not the same as the native companion, and you only need one.**
> If you've already built and installed `ios/`, you don't need HAE. If you
> haven't (or can't — no Mac), HAE is the fastest way to get real data in
> instead of the demo signals.

## Step 1 — get your pairing token

The token is generated from the **signed-in web app**, not from HAE itself —
HAE only ever receives it, it never creates one.

1. Open the app in a browser, sign in, and go to **Connections**.
2. Expand the **Apple Health** row.
3. Under **Pair the companion**, click **Generate pairing token**.
4. Copy the token shown — it's a long hex string, and it's **shown once**.
   Losing it isn't fatal (see [Security](#security--privacy-the-token-is-a-password) below), but you'll need to
   generate a new one and re-paste it into HAE if you don't copy it now.

This is the exact same token the native `ios/` companion uses
(`POST /api/apple/token`, `server/index.js`) — HAE is a second consumer of
it, not a separate credential.

> **Regenerating invalidates the previous token immediately.** Clicking
> **Generate pairing token** again — here or from a native companion install —
> throws away the old one. If you're running both the native companion and
> HAE, generating a fresh token means re-pasting it into *both* places, or
> one of them silently starts getting 401s.

## Step 2 — configure Health Auto Export

In the HAE app: **Automations → New Automation → REST API**.

| Field | What to enter |
|---|---|
| **Name** | Anything recognizable — e.g. `Body Current` |
| **URL** | `https://<your-domain>/api/apple/health-auto-export` |
| **Headers → Add Header** | Key: `Authorization` — Value: `Bearer <your token from Step 1>` |
| **Data to export** | Workouts, and under Health Metrics: Steps, Active Energy, Heart Rate Variability, Resting Heart Rate. Sleep Analysis if you want sleep. (Symptoms/ECG/cycle-tracking/state-of-mind aren't read by this app — leave them off.) |
| **Format** | JSON (not CSV — the server only parses JSON) |

The **URL must be a real, publicly reachable HTTPS address** — this is your
phone talking to your server over the internet, not the same machine. A
`localhost` or LAN-only address won't work unless HAE's device is on that
same network and the URL uses that machine's real address; for anything
self-hosted off a home network, this needs your actual deployed domain (see
[`docs/DEPLOY-VERIFY.md`](./DEPLOY-VERIFY.md) if you haven't deployed yet).

Before relying on it, use HAE's **Manual Export** / "run once" action and
confirm you get a 200 back (see [Troubleshooting](#troubleshooting) below)
rather than waiting for a scheduled run to eventually fire.

## Supported metrics

| HAE data | Mapped to | Notes |
|---|---|---|
| Workouts | `workout` samples | Name, start/end, duration, energy. Recognized workout types map to this app's own kind (`run`, `ride`, `swim`, `strength`, `hiit`, `mobility`, `cardio`, …); anything else still comes through as a generic `workout` with the real name preserved, never dropped. |
| Sleep Analysis | `sleep` samples | Hours asleep (prefers HAE's `asleep` over `totalSleep`, which includes awake-in-bed time), plus a **core / deep / rem** stage breakdown when HAE reports it. |
| Steps | `steps` | Latest point in the day. |
| Active Energy | `expenditure` | kcal (HAE's kJ unit is converted automatically). |
| Heart Rate Variability | `hrv` | Context only — never changes a target. |
| Resting Heart Rate | `resting_hr` | Context only — never changes a target. |

**Be aware: the generic per-metric matching (steps/active energy/HRV/resting
HR) is best-effort, built from HAE's [published wiki
schema](https://github.com/Lybron/health-auto-export/wiki/API-Export---JSON-Format),
not from a payload captured off a real device** (`server/appleHealthAutoExport.js`'s
own header comment says this plainly — there was no iPhone available to test
against when this was built). Workouts and sleep are higher-confidence; the
scalar-metric name matching is the part most likely to need a fix once
someone runs it for real.

**Nothing HAE sends is ever silently dropped.** Anything the server doesn't
recognize comes back in the response's `unmapped` array (a list of the raw
metric names it couldn't match) and is also logged server-side
(`[apple-health-auto-export] {"userId":...,"unmapped":[...]}`) — if you (or
whoever runs the server) see a metric name showing up in `unmapped`
repeatedly, that's the exact string needed to add a new alias to
`SCALAR_METRIC_ALIASES` in `server/appleHealthAutoExport.js`.

## Sync cadence — this server never pulls, it only receives

There is no polling here. This app doesn't ask HAE for data on any
schedule — it can only ingest whatever HAE decides to send, whenever HAE
decides to send it. Cadence is **entirely** controlled by HAE's own
automation settings on your phone, and by iOS itself:

- HAE's own scheduling is aspirational, not guaranteed — per HAE's own docs,
  "iOS does not allow apps to run in the background at a specified time," so
  a configured frequency (e.g. hourly) is a request to iOS, not a promise.
- Background sync needs the phone unlocked at some point, Background App
  Refresh enabled for HAE, and not in Low Power Mode — any of those being off
  means a scheduled run silently doesn't happen.
- The most reliable way to get data in is **not** to wait on the schedule:
  use HAE's Home Screen widget, its Shortcuts app "Run Automation" action, or
  the in-app manual export button, especially right after changing
  something you want reflected quickly.

Practically: don't expect real-time sync, and don't be surprised if a
scheduled automation goes a while without firing. If you need today's data
now, trigger HAE manually.

## Security & privacy: the token is a password

Anyone holding your pairing token can write workout/sleep/steps/HRV/RHR data
into **your account**, indistinguishably from your own phone — it's a bearer
credential, exactly as sensitive as your account password, not a read-only
API key.

- **It travels over HTTPS.** The URL you configure in HAE must be `https://`;
  don't point it at a plain `http://` address.
- **It's shown once, in the web app, and never again** — there's no "view my
  current token" screen, by design (same reasoning as never storing a
  plaintext password).
- **If your phone is lost, stolen, or you think the token leaked:**
  1. Sign in to the web app from another device and click **Generate pairing
     token** again — this immediately invalidates the old one (proven by
     `test/api-routes.test.js`'s token-rotation test). Nothing more can be
     written with the old value.
  2. Or, faster and reversible: toggle **Apple Health** off for the account
     in Connections. That refuses every write (a `403`), even with a
     perfectly valid token, until you turn it back on — no rotation needed.
- **This app never sends the token anywhere else.** It's checked against
  your account's own stored value and nothing more; it's not logged, and it
  never appears in a URL or query string (only in the `Authorization`
  header, which HAE sends automatically).

## Troubleshooting

If data isn't showing up in the app after HAE runs:

1. **Check the response HAE got back**, if it surfaces one (its Event Logs /
   automation history, or the result of a Manual Export run). A `200` with
   an `unmapped` array means the request succeeded but named something the
   server didn't recognize — see [Supported metrics](#supported-metrics)
   above. A `401` means the token is wrong or was rotated away (see below).
   A `403` means the account's Apple Health integration is switched off.
2. **Check the token is current.** If you (or anyone) generated a new
   pairing token since HAE was configured, the old one no longer works —
   re-copy the current token from Connections into HAE's header.
3. **Check the account's Apple Health toggle is on** — Connections → Apple
   Health → the "Use in my plan" / enabled toggle. A disabled integration
   refuses every write regardless of token validity.
4. **Check the URL is exactly right** — `https://<your-domain>/api/apple/health-auto-export`,
   not `/api/apple/ingest` (that's the native companion's endpoint — it
   expects this app's own sample shape, not HAE's, and will silently ingest
   nothing useful from an HAE-shaped body).
5. **Confirm HAE actually ran.** Given the [cadence caveats](#sync-cadence--this-server-never-pulls-it-only-receives)
   above, "nothing showed up" is very often "it hasn't fired yet," not a
   bug — try a Manual Export to rule that out first.

If someone with server access is debugging this, the server logs one line
per HAE POST that contains any unmapped metric name
(`[apple-health-auto-export] {"userId":...,"unmapped":[...]}`) — that's the
fastest way to see exactly what HAE is sending that this app doesn't yet
understand.
