# DESIGN.md — visual/UX design rationale

## 8 Sep 2026 — immersive Today field and complete glance rail

Today now opens directly onto the Current Field instead of placing a small
abstract card below a separate paper header and metric strip. The composition
uses the supplied Oura screen as an information and proportion reference—day
context, circular signals, a broad outcome arc, strong editorial priority, and
a lower surface rising into view—while retaining Body Current's global rail,
type system, account accent, controls, and original imagery. The default
**Alpine** field is an original portrait landscape bundled into the PWA cache;
`tide` remains its stored scene ID so existing account preferences migrate
without a reset. Five real, source-verified photographs—Laguna Beach, Manhattan
at night, Big Sur, Joshua Tree, and Lake Tahoe—join it as user-selectable
fields. Their source and license are visible for the selected field, and full
provenance lives in `docs/PHOTO-CREDITS.md`. Ridge, Dawn, and account-local
personal photos remain intact.

At a glance is no longer a detached white section. It is a named, focusable
horizontal region over the field with visible touch/keyboard instructions and
larger translucent instruments. Fuel, Protein, Water, and Carbs make the row
balanced and useful without a wearable. Real readiness, sleep, and activity
append only when present. Macro coverage is checked entry-by-entry: all-unknown
and mixed-partial totals are disclosed rather than displayed as a fabricated
zero or target percentage. Rail touch events remain within the rail instead of
invoking Today’s left/right day gesture.

The warm-paper journal rises over the lower field without rounded SaaS card
styling. The first implementation over-protected contrast with a 78% near-black
information slab and a lower veil beginning at 72%; together they suppressed
the photograph. The revised treatment keeps curated fields luminous: a shallow
atmospheric top wash, compact text shadow, and translucent provider row protect
small metadata without hiding the sky or ridge. The lower veil is nearly
transparent around the arc and deepens only behind the recommendation and paper
seam. Personal photos retain a stronger wash because their luminance is unknown.
Information-band details use 86–90% white. The recommendation remains the
largest type moment and every provider
refresh/manage/connect recovery action retains its prior behavior.

The additional supplied Oura screens clarify the continuation beneath the
field: generous separation, one primary subject per surface, a short state
label, and detail only where it advances a decision. Body Current maps that
hierarchy to its own actual information rather than copying Oura's metrics.
The resulting **Daily current** sequence presents intake/macros, optional
wearable-reported energy and movement, the latest real wearable activity, and
interactive hydration. It uses softly atmospheric, rounded panels as a scoped
Today-page exception; the food journal and the rest of the app keep the sharp
editorial system. Missing wearable data removes its card instead of producing
a placeholder score.

## 7 Sep 2026 — the Current Field

The Today page now uses the supplied Oura screen as a compositional reference,
not a visual template: compact circular signals lead into one immersive daily
outcome, then the editorial paper journal resumes below. Body Current's own
signature is the **Current Field**—an atmospheric cover whose app-authored arc
is tied to actual calorie-plan completion and whose dominant sentence remains
the evidence-aware Today recommendation. Fuel, protein, water, and carbohydrates keep the rail
useful without a wearable; real readiness, sleep, and activity join only when
present. Activity retains source, tense, time, duration, and device-reported
energy instead of collapsing to a decorative icon.

The later 8 Sep pass replaces the original Tide abstraction with the bundled
Alpine photograph while preserving `tide` as the stored compatibility ID, then
adds five locally hosted, licensed location photographs so selection remains
reliable offline. Ridge and Dawn remain code-native. A personal-photo path makes the visual genuinely user-owned without
creating a server-side photo store: the browser validates, downsizes,
WebP-reencodes, strips embedded metadata, and saves the bounded result under the
signed-in account's existing private-storage key pattern. A uniform dark photo
scrim is intentionally stronger than the curated-scene treatment so even a
pure-white source keeps the small white metadata readable. The Sheet explains
limits and device-only behavior before the picker opens.

This is the page's one deliberate aesthetic risk. The date/connection header,
intake, hydration, log, and global navigation retain the warm-paper, sharp-rule,
Bodoni/Archivo system so the product does not become a stack of glossy fitness
cards or a copy of Oura's mountain treatment.

## 7 Sep 2026 — Today reading hierarchy

This intermediate pass established a relevance-first reading order inspired by the information
architecture of strong wearable apps, including Oura, without copying their
visual language. One compact header carries the selected day and provider
freshness. A single **Today's priority** panel becomes the page's strongest
moment; real daily signals and intake follow as supporting evidence. Provider
actions stay adjacent to provider status instead of competing with the main
recommendation. The Current Field revision above retains that hierarchy while
moving the compact signal rail ahead of the immersive priority.

The page uses progressive disclosure to reduce its initial scan length. Energy
and movement arithmetic appears only when real expenditure or step data exists
and is collapsed by default. Hydration keeps total, goal progress, Customize,
and quick-add controls visible while exact amount/time entry and water history
move under **More water options**. Today's food preview stops at the three most
recent entries and sends the full history to Log.

Hierarchy is carried by weight and spacing inside the established editorial
system: the 31px serif day and 30px serif recommendation are the primary anchors;
15px bold section labels and key totals are secondary; provider freshness and
other metadata remain restrained at 10.5–13px. The account accent, warm paper,
sharp rules, existing type families, and real-data-only contract are unchanged.
The shared button-based `Disclosure` makes expanded state explicit to assistive
technology and retains the global 44px target and focus treatment.

## 5 Sep 2026 — real-only signals and completion spectrum

Runtime sample wearable data has been removed. An account without a linked
wearable now reads as **Fuel + hydration mode** and retains its useful food,
water, plan, recommendation, and connection actions; the empty three-column
Daily signals strip is omitted. This avoids presenting blank recovery metrics
or a "No workout set" prompt as though they were device readings.

Insights' daily strip now encodes calorie-target completion rather than the
less-informative binary on-target verdict. Each logged day uses the active
account accent at the server-owned 25/50/75/100 reached threshold, darkest at
completion. The neutral track means no log. The exact percentage is exposed in
the segment label and tooltip, and the caption states the direction, so shade
is never the only carrier of meaning. No new palette token or rounded surface
was introduced.

## 4 Sep 2026 — two food-entry paths

Log's four competing capture cards collapse to two shared choices: Search foods
and Scan a package. Each is a single semantic button tile with its title, short
hint and arrow; Search gets the account-accent wash and scanning a hairline border.
The compact pair replaces the oversized scanner promotion and
unverified "Camera ready" claim. Manual values live inside Search; Nutrition Facts
capture lives inside Scan, with their purposes named plainly. The same owner is
used in the global Add food sheet so hierarchy does not change by entry point.
Existing Archivo/Bodoni, hairline borders and account accent tokens are retained.
The meal-grouped rows stay intact, with wrapping macro totals under each heading.

## 4 Sep 2026 — personal hydration preferences

Hydration retains the Today hairline section and Bodoni amount. A quiet
Customize text action opens the established Sheet; the existing native unit
select, Field, Button and ErrorNote own its interactions. The sole new visual
is a thin account-accent progress bar, shown only after an explicit user-set
goal and only for today. Actual intake remains the primary number even above
the goal. This adds no palette or type token and makes no fluid prescription.
The three quick-add buttons represent the person's chosen cup/bottle sizes.
`docs/UX-CONTRACT.md` records storage, history and save/failure behavior.

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
unchanged by this pass: sharp rectangles, hairline rules in ink, the account accent as
the single accent, status conveyed by shape + word (never color alone),
Bodoni numerals / Archivo labels, white (or the soft account-accent wash, since 25 Aug 2026)
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
to them elsewhere in this file. The arc uses `var(--color-cobalt)`, the
runtime brand token, so it follows the selected account accent without
changing semantic status colors.

### Body Current identity and account accents

Body Current uses the refined flowing-current mark as its production identity:
the raster master at `public/body-current-master.png` is the sole source for
the PWA, iOS, and Connect IQ icon sizes. The mark carries the product's quiet
through-line—body signals becoming a readable current—without introducing a
second decorative system.

An authenticated account may choose Sapphire (default), Emerald, Ruby,
Silver, Gold, Crystal, Diamond, or Pearl. The
canonical palette map is `src/lib/accentTheme.js`; it applies only the brand
family (`--color-cobalt`, ink, soft wash, on-accent) plus the three progress
gradient stops. The `--color-cobalt*` names are retained as internal
compatibility aliases while Sapphire is the user-facing and persisted name.
Shared components consume those runtime variables, including
the SegmentBar, Dial, and Insights SVG highlights. Mist, Sand, Berry, Good,
Warn, and Alert remain fixed semantic/context tokens: changing an account
accent must never reclassify recovery, training, warning, or destructive
meaning.

The signed-out Body Current gate uses the same real alpine Current Field as
Today's default scene, with its conventional account form placed on a warm,
blurred journal surface. The image and scrim are atmosphere only; labels,
errors, inputs, recovery, and account creation remain high-contrast and fully
keyboard accessible. The shared Oathbearer auth surface keeps its own styling.

The dial's own color never encodes good/bad — it's the same account accent at any
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
