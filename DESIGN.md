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
  sapphire: "#1f35c4"
  sapphire-ink: "#16289b"
  sapphire-soft: "#e9ecf9"
  emerald: "#087a5a"
  ruby: "#a82945"
  silver: "#66717d"
  gold: "#8a6200"
  crystal: "#0a7180"
  diamond: "#526d91"
  pearl: "#756579"
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
  current-field: { }
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
- **Memorable signature:** Today's user-selected Current Field turns the real daily fuel arc into a personal, atmospheric cover; the account accent continues through primary actions, progress marks, and confident chart data.
- **Restraint:** Authentication, data entry, settings, destructive actions, and error recovery favor platform conventions and explicit labels.
- **Anti-references:** Avoid rounded-card SaaS dashboards, neon fitness gamification, decorative wellness gradients, and unlabeled color-only status.
- **Token ownership/runtime mapping:** This file mirrors the canonical Tailwind v4 theme in `src/index.css`. Account accent overrides are owned by `src/lib/accentTheme.js`. Drift is checked by the strict frontend audit and build.

## Colors

Warm paper and rail are the persistent ground. Near-black ink and its alpha
variants establish type and hairline hierarchy. Sapphire is the default account
accent; Emerald, Ruby, Silver, Gold, Crystal, Diamond, and Pearl replace only
the account-accent family through the runtime theme adapter. The adapter keeps
writing the historical `--color-cobalt*` CSS aliases while consumer utilities
are migrated; those token names describe the accent role, not a fixed blue.
Mist is recovery context, Sand is training context, and
Berry is destructive/error meaning. Those semantic colors never change with
account preference. White is reserved for consequential sheets and confirmed
moments. Focus uses a 2px account-accent outline. Completion charts use ordered
alpha strengths of the same accent plus the neutral track for missing data.
The Today field derives `--color-current-glow` from the live account accent;
it is a runtime adapter rather than a second independently editable palette.
Progress drawn over photography uses the darker `--color-progress-mid` accent
with an ink keyline and a luminous edge. The keyline is required: light
palettes such as Silver and Pearl must remain distinct from the white remainder
track on bright personal or curated photographs.

Signed-out Body Current screens reuse the default real alpine Current Field as
a full-viewport photographic ground. Authentication controls sit on one warm,
blurred journal surface with conventional high-contrast labels and fields;
photography never enters the form itself. The shared Oathbearer auth variant is
intentionally excluded so its separate product identity is preserved.

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
must remain complete at 320px and must not introduce page-level horizontal
scrolling. A deliberately bounded signal rail may own horizontal overflow.
Loading and empty states preserve the information hierarchy; an absent feature
does not leave a decorative hole. Today opens directly into one full-bleed
Current Field: day and connection context, then a horizontally scrollable
circle rail of real fuel, protein, water, carbohydrates, and available wearable
readings all sit over the landscape. A broad calorie-plan arc and the dominant
daily priority complete the field before the warm-paper journal overlaps its
lower edge and resumes detailed intake.
Secondary arithmetic and entry-management detail use progressive disclosure;
Today previews only the three most recent food entries and routes the complete
history to Log.

## Elevation & Depth

Hierarchy comes from paper tones, rules, type scale, and sparse shadows. Most
surfaces stay flat. Sheets and the focal Today Current Field may lift; ordinary
metrics and settings do not become floating cards.

## Shapes

Paper forms and data rows remain square. Circles are allowed for intrinsically
circular information such as bounded daily progress, wearable readings, and
status dots. The Today photo field may use 16px optical-glass groups for related
hero controls and connection state; those groups are one instrument, not a new
rounded-card default. Dividers are one-pixel ink-alpha rules. Do not introduce
pill containers for ordinary labels or data.

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

Primary actions use the account accent with white text and one restrained
mineral treatment: a directional highlight, deeper lower edge, and small
accent-colored shadow. Compact selected segments use the same gradient without
the lift; selected option surfaces use the pale accent wash. This material is
reserved for active or primary states—neutral paper surfaces stay flat.
Outline actions are secondary; text actions are tertiary. Destructive actions
use Berry and are spatially separated or require confirmation. Busy labels do
not change control geometry.

### Navigation and data display

Top navigation is fixed and bounded to the content column. Detailed row lists
use rules inside their owning journal surface rather than nesting smaller cards.
Charts label their metric, period, endpoints, and reference lines. Daily
completion is represented by 25/50/75/100 accent strengths with an exact
accessible percentage per day; the neutral track means no log.

On Today, the fixed rail is a light, edge-free photo-glass overlay on the actual
Current Field, with white labels and a short luminous account-accent indicator;
it must never read as a separate gray website header. The field reserves the
rail's 3.25rem content height so no hero control sits underneath it. The day
arrows and backdrop action form one divided optical control cluster, and
connection state uses a second glass group with a labeled accent status bead.
All other screens keep a warm-paper mineral-glass rail: translucent enough to
let their atmospheric lead-in show through, but lighter than Today's photo
glass. At-a-glance instrument values use a heavy tabular sans face with an
adaptive compact size, reserving Bodoni for editorial headings and large values
on quiet paper surfaces.

Insights, Plan, and Connect share an atmospheric deep-blue lead-in followed by
rounded, low-contrast journal surfaces. This is a hierarchy system rather than a
decorative clone of Today: Insights leads with range selection, Plan gives its
human-readable date prominent glass treatment, and Connect leads with provider
scope. Their underlying data, empty states, and actions remain unchanged.

### Today Current Field

The field is the product's one immersive visual surface. Alpine is an original,
bundled photographic landscape and the backward-compatible `tide` scene ID.
Five credited, licensed photographs add Laguna Beach, Manhattan at night, Big
Sur, Joshua Tree, and Lake Tahoe; Ridge and Dawn remain code-native
alternatives, and a personal photo is also allowed. Every selectable photograph
is part of the PWA precache, with a CSS color field as its failure fallback.
Curated fields use a light directional wash and tight
text shadow so the landscape remains luminous; a personal photo receives a
stronger protective treatment because its luminance is unknown. The
app-authored arc always represents actual calorie-plan completion, caps
visually at 100%, and shows exact intake and target in text. Missing and
loading targets are named rather than illustrated as progress. Provider status
uses its own translucent glass row, while the date and At a glance rail sit
over an atmospheric top wash rather than an opaque backplate. Their smallest
text uses at least 86% white plus a compact shadow.
A separate edge-free lower gradient stays nearly transparent around the arc
and deepens only behind the recommendation and paper seam. This preserves
terrain detail through the focal gauge instead of turning the field into a
dark panel.

The Today field also owns the safe-area ground behind the fixed rail, including
the camera-island region on supported browsers. Its day label and date share a
single masthead line. Daily current carries the selected field image forward as
a blurred, warm-veiled texture behind the cards, keeping the atmosphere
continuous without making the data hard to read. Plan places its date inline
with the title as context rather than leaving a decorative square control.

Below the field, **Daily current** applies the reference app's calmer
one-subject-per-surface hierarchy to Body Current's own records: intake and
macros, connected-device energy/movement, the latest real wearable activity,
and the user's hydration log and goal. It never substitutes Oura-specific
constructs such as cardiovascular age, sleep debt, or cumulative stress. A
card is omitted when its underlying wearable signal is missing, while food and
hydration remain useful without a wearable.

The integrated At a glance rail always contains four useful account-owned
readings—Fuel, Protein, Water, and Carbs—before appending only wearable readings
that truly exist. Unknown or partially known macro data is named and never
coerced into a false zero or percentage. The rail owns horizontal touch and
keyboard scrolling so it cannot accidentally trigger day navigation.

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
