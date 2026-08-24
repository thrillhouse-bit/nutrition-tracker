# Nutrition — Garmin Connect IQ widget (Fenix line)

A companion **on-watch app** for the single-user nutrition-tracker web app. It
shows today's calories at a glance and pulls the numbers straight from the web
app's HTTP API — no data lives on the watch.

Two surfaces:

- **Glance** (the compact strip in the fenix glance carousel): two lines —
  a `Nutrition` title and `consumed/target kcal  <remaining> left`.
- **Full widget view** (open the glance): the consumed kcal as a large number,
  `of <target>`, a progress bar, remaining kcal, and the primary macros
  (protein / carbs / fat) when the API returns them. Press **START** (or tap)
  to re-fetch.

Loading and error states are handled: while a request is in flight the view
says `Loading…`; on no phone/network or a non-200 response it shows `No data`
with the status code and `Press START to retry`. Missing target/remaining
values (the API may send `null`) render as an em dash `—`, never as `0`.

> **This scaffold was not compiled here** — the Connect IQ SDK is not (and
> cannot be) installed in the authoring environment. The code is written to the
> Connect IQ / Monkey C APIs and is intended to build as-is once you have the
> SDK. See "Build" below.

---

## API contract

The watch makes exactly one request:

```
GET {apiBaseUrl}/api/today/summary
```

expecting JSON of this shape (some `targets`/`remaining` values may be `null`
when no target is set — the app renders `—` for those):

```json
{
  "date": "YYYY-MM-DD",
  "totals":    { "calories": 1450, "protein_g": 90,  "carbs_g": 160, "fat_g": 48 },
  "targets":   { "calories": 2000, "protein_g": 150, "carbs_g": null, "fat_g": null },
  "remaining": { "calories": 550 }
}
```

`{apiBaseUrl}` is the user-configurable setting described under **Set the web
app URL** below (default `http://localhost:3001`, the web app's dev port).

> **This endpoint is served by the web app, not by the watch.** If
> `/api/today/summary` does not exist yet on your deployment, add it to the
> Express server (`server/index.js`) so it returns the shape above; the watch
> is built against that contract exactly.

---

## Layout

```
garmin-connectiq/
├── manifest.xml            app id (placeholder), type=widget, product list,
│                           Communications permission, languages
├── monkey.jungle           build config (manifest + source path)
├── source/
│   ├── NutritionApp.mc      AppBase entry: getInitialView + getGlanceView
│   ├── GlanceView.mc        compact glance (WatchUi.GlanceView, (:glance))
│   ├── SummaryView.mc       full widget view (loading/error/ok, progress, macros)
│   ├── SummaryDelegate.mc   input: START/tap = refresh
│   ├── ApiClient.mc         makeWebRequest + async callback (shared, (:glance))
│   └── Helpers.mc           dget / fmtInt / isNum — null-safe, (:glance)
├── resources/
│   ├── strings/strings.xml      app name + setting label
│   ├── drawables/drawables.xml  launcher icon bitmap declaration
│   ├── drawables/launcher_icon.png  placeholder icon (60×60 RGBA)
│   └── settings/
│       ├── properties.xml    apiBaseUrl property (default http://localhost:3001)
│       └── settings.xml      surfaces apiBaseUrl as an editable text setting
└── README.md
```

The glance runs in a separate, memory-limited scope. Every symbol it uses —
`getGlanceView`, `NutritionGlanceView`, `ApiClient`, and the `Helpers.mc`
functions — is annotated `(:glance)` so the compiler includes it there. The
annotation only *adds* code to the glance scope; the full view still sees it.

---

## Prerequisites

You need a machine you control with:

1. **The Connect IQ SDK** — download the SDK Manager from
   <https://developer.garmin.com/connect-iq/sdk/>, install it, and use it to
   install a current SDK plus the **device** files for the fenix models you
   target (the SDK Manager's *Devices* tab).
2. **A developer key** — a one-time RSA key that signs every build. Generate it
   once (any of these):
   - VS Code command **Monkey C: Generate a Developer Key**, or
   - `openssl genrsa -out developer_key.pem 4096` then
     `openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key -nocrypt`
   Keep `developer_key` (the DER file) private and out of git.
3. **Either** the **VS Code Monkey C extension** (easiest — gives build/run/
   sideload commands and a device simulator) **or** the SDK's **`monkeyc`**
   command-line compiler (on your `PATH`, from the SDK's `bin/`).

> This app has **no** dependency on the Garmin Health API or the Garmin Connect
> Developer Program — those are a separate partner program with an approval
> process, for reading Garmin's own health/activity data. Connect IQ apps are
> free to build, run in the simulator, and sideload with just the SDK and a
> self-generated developer key. (Publishing to the Connect IQ **Store** is also
> free and needs only a Garmin account.)

---

## Build

### With the VS Code Monkey C extension

Open the `garmin-connectiq/` folder, then run **Monkey C: Build for Device**
(pick a device, e.g. `fenix7`) or **Monkey C: Run** (builds and launches the
simulator). The extension reads `monkey.jungle` and `manifest.xml` for you.

### With the `monkeyc` CLI

```sh
cd garmin-connectiq
monkeyc -f monkey.jungle -d fenix7 -o nutrition.prg -y /path/to/developer_key
```

- `-d fenix7` — target device; must be one of the ids in `manifest.xml`
  (`fenix7s`, `fenix7x`, `fenix7pro`, `fenix843mm`, `epix2`, … — see below).
- `-o nutrition.prg` — output binary.
- `-y <developer_key>` — your DER developer key from step 2 above.

Add `-t` to also run the type checker.

---

## Run in the simulator

```sh
connectiq                                   # start the Connect IQ simulator
monkeydo nutrition.prg fenix7               # load the built .prg onto it
```

(Or just **Monkey C: Run** in VS Code.) In the simulator the request is proxied
through your computer, so the default `http://localhost:3001` reaches the web
app if it is running locally. Start the web app first (`npm run dev` /
`npm start` in the repo root — it listens on port 3001). To see the glance, use
the simulator's **glance** view mode.

---

## Sideload to a Fenix

1. Build a `.prg` for your exact device (`-d fenix7`, `-d fenix847mm`, …).
2. Connect the watch over USB; it mounts as a drive.
3. Copy `nutrition.prg` into the watch's **`GARMIN/APPS/`** folder.
4. Eject, and find **Nutrition** in the watch's glance carousel / widget list.

---

## Set the web app URL

`apiBaseUrl` is a normal Connect IQ **application setting**, editable without a
rebuild:

- **Phone:** Garmin **Connect IQ** mobile app → *My Device* → the **Nutrition**
  app → **Settings** → **Web app URL**.
- **Desktop:** **Garmin Express** → the device → *Connect IQ Apps* → **Nutrition**
  → the gear/settings.

In code this is read via `Application.Properties.getValue("apiBaseUrl")` (with a
`getApp().getProperty(...)` fallback for older API levels); the default lives in
`resources/settings/properties.xml`.

### Networking notes (read this before it "doesn't work" on the watch)

- **On a real watch there is no direct internet.** `makeWebRequest` is proxied
  through the phone's Garmin Connect Mobile app, which reaches the URL from the
  *phone's* network. So `http://localhost:3001` only works in the **simulator**.
  On a real device set `apiBaseUrl` to a URL the phone can reach — a LAN IP
  (e.g. `http://192.168.1.20:3001`) while on the same Wi-Fi, or a public /
  tunneled HTTPS address for anywhere.
- **HTTPS is strongly recommended** for a non-LAN URL; some networks and future
  OS versions restrict plain HTTP. A reverse proxy in front of the web app
  (Caddy/nginx with TLS) is the usual answer.
- **No auth (yet).** The web API is single-user and currently unauthenticated,
  so point `apiBaseUrl` at a URL **you** control and don't expose it publicly
  without protection. A token could be added later: put it in a second setting
  and send it as an `Authorization` header from `ApiClient.fetchSummary()`.

---

## Products (device list) — add / remove

`manifest.xml` `<iq:products>` currently declares:

```
fenix7  fenix7s  fenix7x
fenix7pro  fenix7spro  fenix7xpro
fenix843mm  fenix847mm  fenix851mm  fenix8solar47mm  fenix8solar51mm
epix2  epix2pro42mm  epix2pro47mm  epix2pro51mm
```

To **add** a device, add `<iq:product id="<deviceId>"/>`; to **remove** one,
delete its line. An **unknown product id fails the build**, and Garmin's device
ids are versioned, so confirm against your installed SDK:

- VS Code: **Monkey C: Edit Products** (checkbox list of installed devices), or
- the SDK's device list under `<SDK>/bin/devices.xml`.

`minApiLevel="3.1.0"` in the manifest is the floor for glance support; every
device above ships a newer level, so this only sets the minimum — leave it
unless you drop the glance.

---

## Regenerate the app id before publishing

`manifest.xml` ships a **placeholder** `id`
(`0000000000000000000000000000dead`). It is valid for the simulator and
sideloading, but generate a unique one before submitting to the Connect IQ
Store: VS Code **Monkey C: Generate a New Application Id**, or the manifest
editor's **Generate Id** button.
