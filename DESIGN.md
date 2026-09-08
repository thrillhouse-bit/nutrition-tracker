---
version: alpha
name: "Body Current"
description: "A mobile-first editorial health-tech journal that turns nutrition and account-owned body signals into one calm daily plan."
colors:
  paper: "#f7f4ec"
  rail: "#f1ede3"
  scrim: "#e3dfd4"
  card: "#ffffff"
  ink: "#121210"
  cobalt: "#1f35c4"
  cobalt-ink: "#16289b"
  cobalt-soft: "#e9ecf9"
  progress-mid: "#7185f6"
  mist: "#dce6d7"
  sand: "#eacd91"
  berry: "#8e3044"
typography:
  sans:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  serif:
    fontFamily: "Bodoni Moda, Didot, Times New Roman, Georgia, serif"
rounded:
  DEFAULT: "0px"
spacing:
  page-max: "36rem"
  touch-target-min: "44px"
components:
  button: { }
  card: { }
  sheet: { }
  input: { }
  status-mark: { }
  chart: { }
---

# Body Current design system

## Overview

### Creative North Star

An annotated training journal printed on warm paper: sharp rules, disciplined
spacing, high-contrast numbers, and one flowing account accent that makes the
current state legible without making the product feel like a generic dashboard.

### Product context and register

- **Audience and primary job:** People logging food, hydration, body weight, and training context who need a readable daily decision, not a wall of device metrics.
- **Target market and evidence:** English-language alpha users on mobile web/PWA; current routes, copy, manifests, and test matrix are English and phone-first.
- **Locale and language policy:** English UI; dates and native controls follow browser locale. No translated locale is claimed until native review exists.
- **Usage scene:** Frequent, one-handed phone use around meals and training. Primary actions and form controls keep a 44px minimum touch target.
- **Register:** Product/editorial. Serif display type carries the journal voice; sans-serif controls remain familiar and direct.
- **Memorable signature:** The account-selected current color flows through primary actions, progress gradients, dials, and confident chart data.
- **Restraint:** Authentication, data entry, settings, destructive actions, and error recovery favor platform conventions and explicit labels.
- **Anti-references:** Avoid rounded-card SaaS dashboards, neon fitness gamification, decorative wellness gradients, and unlabeled color-only status.
- **Token ownership/runtime mapping:** This file mirrors the canonical Tailwind v4 theme in `src/index.css`. Account accent overrides are owned by `src/lib/accentTheme.js`. Drift is checked by the strict frontend audit and build.

## Colors

Warm paper and rail are the persistent ground. Near-black ink and its alpha
variants establish type and hairline hierarchy. Cobalt is the default account
accent; Emerald and Ruby replace only the account-accent family through the
runtime theme adapter. Mist is recovery context, Sand is training context, and
Berry is destructive/error meaning. Those semantic colors never change with
account preference. White is reserved for consequential sheets and confirmed
moments. Focus uses a 2px account-accent outline. Completion charts use ordered
alpha strengths of the same accent plus the neutral track for missing data.

## Typography

Bodoni Moda owns page titles, recommendations, and large/tabular numerals.
Archivo owns body copy, labels, fields, and actions. Small uppercase eyebrows
use tracked Archivo and never replace a readable sentence. Numeric rows use
tabular lining figures. Browser-localized dates remain text, never decorative
bitmaps.

## Layout

The application is a single 36rem-wide mobile column with fixed top navigation,
safe-area padding, and hairline-separated sections. Content density is compact
but touch controls remain at least 44px. Layouts may widen progressively, but
must remain complete at 320px and must not introduce horizontal scrolling.
Loading and empty states preserve the information hierarchy; an absent feature
does not leave a decorative hole. Today leads with date and compact connection
context, then one dominant daily priority before supporting signals and intake.
Secondary arithmetic and entry-management detail use progressive disclosure;
Today previews only the three most recent food entries and routes the complete
history to Log.

## Elevation & Depth

Hierarchy comes from paper tones, rules, type scale, and sparse shadows. Most
surfaces stay flat. Sheets and the focal Today recommendation may lift; ordinary
metrics and settings do not become floating cards.

## Shapes

Rectangles are square. Circles are allowed only for intrinsically circular
information such as the readiness dial and status dot. Dividers are one-pixel
ink-alpha rules. Do not introduce pill containers for ordinary labels or data.

## Components

### Foundational visual states

Shared controls in `src/components/ui.jsx` own default, hover, focus-visible,
disabled, busy, destructive, error, sheet, spinner, and skeleton treatments.
Every status combines shape and text. Disabled controls remain readable;
loading indicators name what is being loaded; failures retain user input and
offer a real retry or recovery action. `Disclosure` owns inline expandable
secondary detail with a 44px button, announced expanded state, preserved
content state, and the shared focus treatment.

### Buttons and actions

Primary actions use the account accent with white text. Outline actions are
secondary; text actions are tertiary. Destructive actions use Berry and are
spatially separated or require confirmation. Busy labels do not change control
geometry.

### Navigation and data display

Top navigation is fixed and bounded to the content column. Lists use rules rather
than card stacks. Charts label their metric, period, endpoints, and reference
lines. Daily completion is represented by 25/50/75/100 accent strengths with an
exact accessible percentage per day; the neutral track means no log.

### Forms and overlays

Fields use native inputs/selects with shared `inputCls`; Body Current owns labels,
validation copy, and storage semantics while the platform owns keyboard, locale,
and picker behavior. `Sheet` owns dialogs and bottom sheets, including focus,
backdrop, close, and dirty-state decisions.

### Iconography

The UI uses restrained text symbols and simple app-authored marks rather than a
mixed icon library. Icons supplement labels except for universally understood,
explicitly aria-labeled navigation or dismissal controls.

### Motion

Motion communicates state changes only: short transitions on controls, meters,
and sheets. It must be interruptible and honor reduced-motion preferences.

### Content and data visualization

Copy is concrete, calm, and provenance-aware. Never fabricate health readings,
workouts, goals, or connection freshness. Missing wearable data is omitted or
named honestly. Exact values accompany shade, shape, and line encodings so color
is never the only channel.

## Do's and Don'ts

- **Do:** Make the next useful action and the source/freshness of data obvious.
- **Do:** Reuse canonical tokens and shared controls before creating a local variant.
- **Don't:** Populate an empty account with demo or sample health data.
- **Don't:** leave empty metric cards, unlabeled chart shades, or controls that cannot complete their stated action.

Detailed dated rationale and before/after decisions remain in
`docs/DESIGN.md`; cross-screen behavior is canonical in `docs/UX-CONTRACT.md`.
