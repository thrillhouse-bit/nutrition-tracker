# DESIGN.md — visual/UX design rationale

There was no design-rationale doc in this repo before this file (checked
`README.md` and everything under `docs/` first — `PWA-RESPONSIVE-REPORT.md`
covers accessibility/responsive *testing*, not design *decisions*, and
nothing else in `docs/` is design-shaped). This is that home, starting with
the 26 Aug 2026 Today header/Daily-Signals redesign. Future design work
should add a new dated section here rather than starting a second file —
same reasoning `CLAUDE.md`-style incident logs in this codebase already give
for keeping one running record instead of scattering rationale across PR
descriptions that get harder to find over time.

The existing visual system (`src/index.css`'s own comment block, and the
"Rules from the design" comment at the top of `src/components/ui.jsx`) is
unchanged by this pass: sharp rectangles, hairline rules in ink, cobalt as
the single accent, status conveyed by shape + word (never color alone),
Bodoni numerals / Archivo labels, white (or cobalt-soft, since 25 Aug 2026)
reserved for a moment that matters. This redesign works inside that system,
not around it — no new colors, no new type scale, no rounded corners.

## 26 Aug 2026 — Today header + Daily Signals

**Ask:** the Today page's date/header region was oversized and nearly empty,
and the Readiness/Sleep/Workout cards were three thin, mechanically equal
boxes that didn't read as a system. Redesign both without a generic
dashboard reskin, and without inventing decorative charts or hero visuals
just to fill space.

### Before

Measured on the live layout (see `git log` — `sitrep`-style incident
comments already in `Today.jsx` before this pass): a 32px serif "Today"
title, its own 18px date-badge line, a conditional "back to today" line, and
a sync-status line — four stacked rows carrying one piece of real state (the
selected date) before any content appeared. Below that, three hairline
columns each held a bare numeral + provider name and nothing else — Workout
in particular had no state (planned vs. completed), no duration, no energy,
and no action when nothing was set.

```
┌──────────────────────────────────────────┐
│ Today                              (32px)│
│ ‹  WED 26 AUG  ›                    (18px)│
│ ‹ Back to today                            │
│ o SAMPLE SIGNALS · NOT A LIVE SYNC         │
├───────────┬───────────┬───────────────────┤
│ READINESS │ SLEEP     │ WORKOUTS          │
│ 82        │ 7h 24m    │ run               │
│           │ Score 78  │ 5:30 PM           │
│ OURA      │ OURA      │ GARMIN            │
├───────────┴───────────┴───────────────────┤
│ [Oura refresh strip, only if applicable]  │
├────────────────────────────────────────────┤
│ RECOMMENDATION                             │
│ Fuel your run                              │
│ ...                                        │
```

### After

```
┌──────────────────────────────────────────────┐
│ ‹  Today  Wednesday, August 26  ›             │  one line, 19px serif +
│                                                │  12px muted full date
│ ● OURA · SYNCED 2:35 PM                        │  secondary, small, tnum
│ [Manage connection ›]  (only if stale)         │
│ [Oura refresh strip — relocated here]          │
│                                                │
│ Solid recovery. Evening Run planned 5:30 PM.   │  <- the one new sentence,
│  — or, honestly, when there's nothing real:    │     real data only
│ No wearable connected yet — logging still      │
│ works great on its own.  [Connect a wearable ›]│
├──────────────────┬───────────┬────────────────┤
│ DAILY SIGNALS                                  │  <- named as one system
│  ◔88  Strong     │ 7h 54m    │ Evening Run    →│  workout is 1.3fr wide
│       recovery   │ Well      │ Planned·5:30PM  │  on wide-enough screens,
│  HRV91 RHR84 T62 │ rested    │ 45 min ~520kcal │  a real link to Plan
│  Oura · Fresh    │ ·Score 86 │ Oura · Fresh    │
│                  │ Oura·Fresh│                 │
├──────────────────┴───────────┴────────────────┤
│ RECOMMENDATION (unchanged)                     │
│ Fuel your run                                  │
│ ...                                            │
```

Same information budget as before, plus real additions (workout state,
duration/energy, readiness contributors, a synthesized day sentence) — in
less vertical space, because the four-row masthead collapsed into two
compact lines.

### Why a dial, and only for Readiness

The product ask calls for "one intentional signature visual treatment... a
restrained signal curve, timeline, or compact dial" — singular, not one
per card. Readiness is the one signal here that's a genuine bounded 0-100
score, which is exactly what a dial is for; Sleep is a duration (no natural
0-100 bound) and Workout is closer to a scheduling fact than a measurement,
so both stay typographic. Stamping a dial on all three would have been
decoration; using it once, on the one signal it actually fits, is the
"restrained" the ask asks for.

A circular dial is also the one shape the existing "no rounded corners
except true circles" rule already allows — see `ui.jsx`'s `Swatch` and the
"?" `Why` icon for the two existing exceptions. `Dial` (`src/components/
ui.jsx`) draws two `<circle>` elements with `stroke-dasharray`, raw hex
colors (`#1F35C4`/ink at 0.16 alpha) rather than `var(--color-...)`, matching
`Insights.jsx`'s own inline SVG charts — an established pattern in this
codebase, not a new one invented for this card. `strokeLinecap="butt"` (not
`round`) keeps the arc's ends sharp even on this one circular shape. It's
`aria-hidden` — the numeral drawn on top of it is what a screen reader gets,
same division of labor as `Meter`/`SegmentBar`'s bars vs. the numerals next
to them elsewhere in this file.

The dial's own color never encodes good/bad — it's the same cobalt at any
score. All of the "is this good" meaning rides on the band WORD next to it
("Strong recovery" / "Solid recovery" / "Moderate recovery" / "Low
recovery"), so color is never the sole channel (the accessibility ask's own
requirement), and a colorblind reader loses nothing a sighted reader has.

### Bands are borrowed thresholds, not new medical claims

`readinessBand()`'s 70 cutoff and `sleepBand()`'s 6.5h cutoff
(`src/components/Today.jsx`) are not new numbers invented for this card —
they're the exact thresholds `server/plan.js` already uses for its own
readiness/sleep rules ("below the ~70 mark that usually means recovery is
still catching up," "under the ~6.5h mark where energy tends to dip").
Reusing them means the card's language and the plan engine's actual
behavior agree about what "70" and "6.5h" mean, instead of a second,
silently-drifting definition of the same cutoffs living in two files. Per
this app's own non-medical framing (README: "no medical, diagnostic,
injury, or disease claims of any kind"), these are plain-language
descriptions of a number, never a diagnostic claim.

### What "connected system, not three cards" means concretely

- One hairline-divided grid (unchanged container language from before) —
  Readiness, Sleep, Workout sit inside it, not as three separate `Card`s.
- `min-[560px]:grid-cols-[1fr_1fr_1.3fr]`: below 560px (every phone this
  app is tested at — 320/375/390/430) the three stay mechanically equal,
  because there's no room to do otherwise; once the row has space, Workout
  — the one with the most to say (type, time, status, duration/energy) —
  gets more of it. This is a viewport breakpoint, not a container query;
  the arbitrary-pixel-value convention (`min-[360px]:` already exists in
  `ui.jsx`'s `SourceLabel`) is what this follows rather than inventing a
  named Tailwind breakpoint for one spot.
- Workout is the one card that's a real link (`onGoToPlan`, wired from
  `App.jsx` to `setTab('plan')`) — it's the one signal with somewhere
  useful to go (Plan's pre/post-fuel timeline for that exact session).
  Readiness and Sleep have no dedicated detail view anywhere in this app
  yet, so they stay plain, non-clickable-looking panels — "make it look
  clickable only if it leads somewhere" cuts against giving them a fake
  destination just for visual parity with Workout.
- The header's one-sentence day summary (`daySentenceParts()`) is built
  from the SAME `rd`/`sl`/`wo` values the cards render, but never repeats
  their exact wording — it translates a score/status into one plain
  sentence ("Solid recovery. Easy run planned at 5:30 PM.") rather than
  restating "Readiness 78" a second time.

### Real-data behavior — how each honest state is reached

| State | How it's produced | Where |
|---|---|---|
| Fresh, live | ≥1 non-demo signal, `freshness` fresh | header: `SYNCED`; sentence built from real bands/clauses |
| Mixed source | some signals real, others fall back to a provider's demo (e.g. Apple real, Oura demo because Oura was never connected) | each cell discloses its OWN provenance via `SourceLabel`; the header sentence excludes demo signals even when the overall state reads "live" |
| Missing metric (connected provider, no data) | `rd`/`sl`/`wo` undefined for that metric | em-dash + "No data" (readiness/sleep), "No workout set" + "Set workout" (workout) |
| No connection | every provider's `demo` explicitly off, nothing real | header: "No wearable connected yet — logging still works great on its own." + "Connect a wearable" → Connections tab |
| Stale | a real, non-demo signal with `freshness === 'stale'` (recorded 18-48h ago, `server/providers.js`'s `freshnessOf`) | header: `STALE · LAST SYNCED <time>` + "Manage connection" → Connections tab; Oura additionally gets its existing real "Refresh" action |
| Loading | `data == null` (composite hasn't resolved) | header shows `LOADING…` and a muted placeholder bar; Daily Signals renders `SignalSkeleton` cells at the same geometry — nothing about a genuinely-empty-but-resolved day is shown early |
| Long workout name | any real `label`/`shortLabel` longer than the column | `truncate` on the subject line only (status/time/meta wrap instead) — full text still reaches the DOM, only the paint is clipped |
| Prior-day view | `date` prop not today | `dayLabel`/`readableFullDate` reflect the viewed day; signals reflect THAT day's real data if any exists (`composeSignals`'s `queryDate`) |

Every one of these is exercised by a real end-to-end account in this pass's
screenshots (Health Auto Export ingest for real/mixed/stale, explicit
`demo:false` for no-connection) except the single "all-live, real Oura
readiness with contributors" showcase — Oura's real OAuth API is
unreachable from the sandbox this was built in, so that ONE screenshot uses
a mocked `/api/today` network response on top of the real build (real
rendering/CSS, synthetic payload). Every other screenshot in the set is
real and unmocked. See the task report for exact file paths.

### Never fabricated

- No new number is invented anywhere in this pass. The readiness/sleep
  bands are labels over a REAL value; the "no weight on file" note
  (`estKcalReason`) states an honest gap instead of guessing a calorie
  number, mirroring `Plan.jsx`'s existing `noWeightForEstimate` pattern.
- `test/today-daily-signals.test.jsx`'s "no implicit/hardcoded demo data"
  section, plus its demo-exclusion tests under "day-context sentence,"
  directly assert this: a demo signal's band/value renders in its OWN card
  (disclosed via `SourceLabel`/`StatusTag`, exactly like every other signal
  in this app already does), but never crosses into the header's synthesized
  "live" sentence, and every missing reading renders an em-dash rather than
  a zero or a placeholder figure.

### Deliberately NOT done, and why

- **Sleep "vs. your recent baseline."** The product ask calls for this,
  gated on "only when enough history exists." Nothing wired into Today
  fetches per-user sleep HISTORY — the one history endpoint that exists
  (`server/db.js`'s `listOuraHistory`) covers Oura readiness only, over the
  window `Insights` asks for, not this screen. Building a real one means a
  new store method (both JSON and Postgres backends) plus its own test
  coverage — a backend surface change bigger than this pass's scope, and
  fabricating a personal average from data this screen doesn't have would
  be exactly the "reported success while doing nothing" failure shape this
  codebase's own `CLAUDE.md` warns about. Sleep instead reads its duration
  against the SAME fixed threshold `server/plan.js` already uses (6.5h) —
  an honest, connected-to-the-real-engine substitute, explicitly NOT a
  baseline claim (see the comment above `sleepBand()` in `Today.jsx`).
- **A true "sync error" state.** `server/providers.js`'s `providerStatus`
  never actually returns an `error` status today (grepped — it's in
  `ui.jsx`'s vocabulary but nothing server-side emits it live); the one
  real failure path that exists is the Oura manual-refresh button's own
  error state (`ouraError`), which this pass keeps and relocates verbatim.
  Inventing a second, never-fired "sync error" banner elsewhere on the page
  would be a diagnostic that can't be proven to fire — this codebase's
  house rule against exactly that.
- **A shared cross-signal timeline visual** (sleep block + workout block on
  one 24h axis) was considered and dropped: sleep's own signal shape only
  ever carries a DURATION and a quality score, never a real start/end clock
  time (`recorded_at` is when the reading was recorded, not when sleep
  began) — drawing a sleep block on a timeline would mean inventing a start
  time nothing in this data actually reports.

### Shared primitives touched

- `src/components/ui.jsx`: added `Dial` (new — see above). Extended
  `ContextCell` (moved from `Today.jsx`, still module-local) to optionally
  render as a real `<button>` when given `onClick`, instead of always a
  `<div>` — the Workout cell's real-link behavior, with the plain-panel
  behavior for Readiness/Sleep unchanged.
- No new screen-local card styles were introduced — Daily Signals reuses
  the existing hairline-grid + `Swatch`/`SourceLabel`/`StatusTag` scaffolding
  rather than a parallel card component.

### Tests

`test/today-daily-signals.test.jsx` (new) — day-sentence composition and
its demo/none/stale/loading branches, readiness bands, sleep bands, the
workout cell's real-link vs. plain-panel behavior, long-name handling, the
manual-workout "estimate unavailable" honesty note, and a no-fabrication
sweep. Every new gate has a sibling negative-control test proving it does
NOT fire in the adjacent state (this repo's own house rule). The three
pre-existing Today test files (`today-wearable-refresh`,
`today-energy-balance`, `today-sleep-score`) needed zero changes — the
redesign kept their exact copy/aria-labels/DOM shape where those tests
depend on it.

### Follow-up (26 Aug 2026) — two real gaps found on independent re-review

After this redesign shipped, a fresh review against a more detailed state
matrix (future day, historical-day tense, a genuine full-error state,
keyboard-only nav) found two real, in-scope gaps and fixed both:

1. **Historical-day workout tense.** `PUT /api/plan/workout` stores a
   manual entry with `status:'planned'` permanently — nothing in this app
   ever flips it to `'completed'` after the fact. Viewing a PAST day with
   one would have read "Evening Run planned at 5:30 PM" forever, a live,
   forward-looking claim about a day already over. `workoutClause` and the
   Workout card's own status label now take an `isHistoricalDay` flag
   (`!isToday(date)`) and say "logged" instead of "planned" once the
   VIEWED day, not the workout's own status, is in the past — "completed"
   is untouched, since that's true on any day. Not currently reachable
   through this app's own UI (manual workouts only ever save for today), so
   this is a data-integrity fix for a shape the store doesn't prevent,
   verified by targeted component tests rather than a live reproduction.
2. **A genuine "full error" state.** `App.jsx`'s `/api/today` fetch used
   `data == null` to mean "still loading" — but a failed fetch ALSO leaves
   `data` null forever, so a real, permanent failure rendered as an eternal
   loading skeleton with no explanation and no retry. A new `dataError`
   prop (cleared at the start of every fetch attempt, set only on a genuine
   catch) is checked ONLY alongside `data == null` (so real data arriving
   always wins over a stale error flag) to show an honest message and a
   working "Try again" action, wired to the same `onChanged`/`refreshKey`
   mechanism every other retry action in this app already uses. Verified
   live (blocking `/api/today` in the browser shows the message; the retry
   click is proven in a component test to call `onChanged`) — a full
   click-through-to-recovery live-browser check hit a timing flake in the
   verification script itself rather than a confirmed product defect;
   disclosed rather than rounded up to "fully verified live."

Investigated and NOT changed, with reasons:
- **Future-day navigation** — the app has no future-day view anywhere
  (`disabled={isToday(date)}` on the Next-day button, app-wide); nothing to
  fix here.
- **"No workout" vs. "workout data unavailable"** — every provider fetch on
  the server swallows its own errors internally (`.catch(() => null)`),
  so a genuine fetch failure is indistinguishable from "nothing scheduled"
  anywhere in `/api/today`'s response, even after the Oura-observability
  work (PR #90), whose `sync_error` lives on a separate per-provider status
  read, not on the per-metric signal this screen consumes. Building this
  distinction honestly needs a server-side change (threading observability
  data into `/api/today`) — out of scope here; fabricating a UI-only guess
  would be exactly the kind of invented state this codebase avoids.
- **Focus restoration after dialogs/popovers** — this component has no
  dialogs or popovers (the workout/plan links are plain navigation); the
  requirement doesn't apply to this surface.
- **Large-text / OS Dynamic-Type scaling** — inherited from the app's
  existing px-based Tailwind sizing, unchanged by and predating this
  redesign; not a regression to fix here.

## 31 Aug 2026 — one Plan, one setup

The visible Plan tab previously stacked two products: the richer Adaptive Fuel
Plan followed by a "Quick targets" calculator, editable static targets,
wearable influence controls, and a second workout editor. That hierarchy made
the less capable system look equally authoritative and required users to enter
the same body data twice.

The tab now has one page title/date rail and one Daily Fuel Plan panel. Its
existing component already contains the material states the feature needs:
loading, incomplete-profile setup, computed rest/training days, warnings,
safety suppression, frozen history, explicit overrides, no workouts, and
workout create/edit. Onboarding uses that exact profile form and removes the
calculate-versus-manual fork. This is a product-structure change, not a visual
reskin: it adds no token, color, type, radius, shadow, or novel component.

"Adaptive Fuel Plan" remains an implementation/API name (`afp`) but user-facing
copy says "Daily Fuel Plan." The shorter name matches the tab and avoids
presenting the calculation method as a separate product. Cross-screen behavior,
migration, account isolation, and the legal gate are recorded in
`docs/UX-CONTRACT.md`.

## 31 Aug 2026 — account data lifecycle

Connections remains the owner for everything that crosses the app/provider or
app/account boundary. The account block now follows provider controls but is
visually separated into signed-in identity, a safe export action, and a danger
zone. This adds no new visual tokens: safe export uses the established outline
button, the page-level delete trigger uses the existing low-emphasis danger
outline, and only the irreversible confirmation uses the new solid-danger
emphasis of the shared `Button` intent system.

Permanent deletion uses the canonical `Sheet`, whose Close button receives
initial focus, traps focus, restores it to the trigger, and treats Escape as
Cancel. Backdrop dismissal is disabled for this serious action so an accidental
tap does not discard a partially completed reauthentication step. The sheet
names the account and deletion scope, states that recovery is impossible, and
requires both current password and exact-email confirmation. It stays open on
failure, clears only the sensitive password, blocks duplicate submission, and
uses no browser-native alert/confirm/prompt. `docs/UX-CONTRACT.md` owns the full
behavior and data-scope contract.
