# PWA responsive & accessibility test report

Executed against the built app (served by the Express server) in headless
Chromium (Playwright) at device-pixel-ratio 2. This covers **test-plan item 1**
(PWA / mobile browser). Native iOS/watch items require a Mac + devices — see
[`ios/README.md`](../ios/README.md).

## Method

- Seeded the evening-run demo scenario plus a deliberately **long food name**
  (90 chars: *"Artisanal Sprouted Whole-Grain Sourdough with Sea Salt & Rosemary,
  Bakery Style"*).
- For each width in **320 / 375 / 390 / 430** px, visited all five tabs and
  measured: horizontal overflow (`scrollWidth − clientWidth`) and the bounding
  box of every visible interactive control (`button, a[href], [role=switch]`),
  flagging any under 44 × 44.
- Plus: 200% page zoom, offline reload (service-worker shell), and the app's
  own loading / empty / insufficient-data / demo / offline states.

## Results

### Horizontal overflow — PASS at every width

`overflow = 0` on **all five tabs at 320, 375, 390 and 430 px**, including with
the 90-character food name present (it truncates; the body never scrolls
sideways). Wide content (the Plan table, the Insights SVG charts) stays within
its column.

### Touch targets — fixed to 44 px on primary controls

The audit found several controls under 44 px; the following were enlarged (and
re-measured on the real fixed-nav layout):

| Control | Before | After |
|---|---|---|
| Square ON/OFF toggles (Plan, Connections) | 50 × **28** | 50 × **44** (28 px visual centred in a 44 px hit area) |
| Day-nav ‹ › (Today) | 8 × 24 | **44 × 44** |
| Entry delete ✕ (Today, Log) | 25 × 32 | **44 × 44** |
| Meal-log rows (tap to edit) | …× 41–42 | **≥ 44** tall (`min-h-11`) |

> The bottom-nav tab buttons initially *appeared* sub-44 in the measurement;
> that was an artifact of the `position:static` override used only for full-page
> screenshots. On the real `position:fixed` nav each tab is ~64 px wide × 51 px
> tall at 320 px — **PASS**.

**Residual (WCAG AA-compliant, AAA follow-up):** two secondary text links —
"All foods" (Log) and "Options" (Connections) — sit at ~33–34 px tall after
padding. They exceed the WCAG 2.5.8 **AA** minimum (24 px); reaching the 2.5.5
**AAA** 44 px would visually overweight these small inline labels, so they are
left as a deliberate, documented trade-off.

### Long food names — PASS

Long names truncate with ellipsis inside their row; no overflow at any width.

### Offline shell — PASS

After a normal load (service worker installs and precaches on `localhost`),
going offline and reloading still renders the app shell and bottom nav (the
offline banner shows "Offline — logs queue and sync when you reconnect"). The
offline **write queue** (log while offline → auto-sync on reconnect) is covered
separately by `test/outbox.test.js`.

### Required states — PASS (rendered in the live app)

Loading (spinners), empty ("Nothing logged"), insufficient-data (Insights
< 3 tracked days), demo (honest "Sample signals / Demo data" labels), offline,
sync-pending, stale/disconnected/error (Connections shape+word marks), and the
save/edit/delete flows all render. The scanner/label/search/manual flows open
in the shared sheet.

### 200% zoom — one caveat to follow up

Under a 2× **page** zoom at 375 px, ~55 px of horizontal overflow appears — a
few fixed-pixel rows (e.g. the Plan Baseline/Today columns) don't fully reflow
at extreme zoom. Notes:
- This is *page* zoom, not *text-only* zoom. Because the design sizes type in
  `px` (Tailwind), browser **text-size** settings have little effect — itself an
  accessibility consideration worth a future pass (move key type to `rem`).
- Recommended follow-up: let the Plan table columns wrap/shrink under very
  narrow effective widths, and audit a `rem`-based type scale for text-zoom
  support. Not a blocker for normal 1× use across 320–430 px.

## Verdict

Fluid and safe across 320–430 px with no horizontal scroll, working offline
shell, honest states, and primary touch targets at 44 px. Two documented
follow-ups: AAA-sizing two secondary text links, and reflow/`rem` for extreme
zoom.
