---
version: alpha
name: "Control Tower: Oathbearer"
description: "An original Greek-mythic action RPG combining sun-bleached Aegean readability with scorched-bronze combat impact."
colors:
  void: "#090D10"
  soot: "#12100B"
  bronze-panel: "#1D2633"
  ivory: "#F3E6C8"
  parchment-muted: "#B8A888"
  bronze: "#A5761F"
  gold: "#E8B64C"
  terracotta: "#7D2B1F"
  terracotta-hot: "#9C3828"
  danger: "#B3241C"
  focus: "#F6CF70"
typography:
  sans:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
rounded:
  DEFAULT: "0.25rem"
  sm: "0.125rem"
  md: "0.25rem"
  full: "9999px"
spacing:
  hud-gap: "0.5rem"
  overlay-padding: "1rem"
  touch-target: "2.75rem"
components:
  button: { }
  hud-panel: { }
  dialogue: { }
  shrine-card: { }
  combat-canvas: { }
  shop-panel: { }
  equipment-ledger: { }
  resource-target: { }
  crafting-source-control: { }
---

# Control Tower: Oathbearer Design System

## Overview

### Creative North Star

An Aegean archaeological site at hard noon, viewed through the scorched edge of a bronze votive shield. Exploration favors clean marble planes, cobalt sea, terracotta paths, and legible silhouettes. Combat breaks that calm with molten-orange streaks, sparks, debris, hit stop, and brief fractures of stolen lettering. The approved visual evidence is recorded in `GAME-DIRECTION.md`; the implementation must remain original rather than imitate another game's character, map, UI, or asset language.

### Product context and register

- **Audience and primary job:** A solo player should immediately understand where to go, which mythic power is equipped, and what changed after an encounter while moving between story, exploration, and combat without leaving the route.
- **Target market(s) and evidence:** English-language personal web game; the current brief and implemented copy provide no evidence for a market-specific variant.
- **Locale(s) and language policy:** English only for this build. Visible labels and accessible names share the same authored vocabulary. Additional locales require complete owned copy rather than partial fallback.
- **Usage scene:** Desktop point-and-click plus keyboard and narrow portrait touch play; players cross authored terrain, click people/resources/enemies to approach and act, and manage persistent skills, equipment, materials, quests, and banked supplies. Sessions are checkpointed at shrines, region transitions, quest completion, and encounter boundaries.
- **Register:** Hybrid. Exploration and dialogue are cinematic brand surfaces; HUD, pause, save recovery, objectives, and controls are quiet product surfaces.
- **Memorable signature:** The stolen epithet appears as a sharp light seam and broken-letter motif at map transitions, elite telegraphs, recovered fragments, and act cards. It is a state cue, never background wallpaper.
- **Restraint:** Navigation, health, controls, save state, focus, and recovery use familiar placement and plain language. Expression belongs in the world, transitions, and combat feedback.
- **Anti-references:** No abstract floating-circle avatar; no generic fantasy glass dashboard; no beige editorial/broadsheet layout; no proprietary Hades or Assassin's Creed Odyssey character, plot, UI, map, quest, dialogue, or asset imitation.
- **Token ownership/runtime mapping:** This file is durable intent. Canvas-world colors are runtime-canonical in `src/rpg/content.js` map palettes. Canvas-combat colors are owned by `src/game/campaign.js` and `src/renderer.js`. Route chrome currently maps these tokens in the single adapter `src/ControlTowerRPG.jsx`; new shared chrome values must reuse this frontmatter vocabulary rather than introduce parallel hex aliases. Drift is checked with the premium project audit and a changed-file raw-color review.

## Colors

`void` and `soot` hold route chrome behind the brighter authored world. `ivory` is primary text and sunlit stone; `parchment-muted` is secondary copy. `bronze` marks labels and context, while `gold` is reserved for the current oath, primary focus, ready power, and meaningful completion. `terracotta` is the primary action surface and `terracotta-hot` its hover state. `danger` is paired with explicit failure text and never acts as the only signal. `focus` supplies a high-contrast two-pixel focus-visible ring. The game is dark-chrome-only for now; canvas maps provide their own daylight palettes. Forced-colors mode must preserve native outlines and semantic text.

## Typography

System sans owns controls, HUD, objectives, and body copy for speed and cross-device stability. The display serif is limited to the title, act names, dialogue beats, and pause/victory headings. Technical values and future debug/seed readouts use mono. Uppercase labels use restrained tracking; paragraphs remain sentence case with a readable 1.45–1.6 line height. No italic is required to communicate state. Long dialogue wraps instead of truncating.

## Layout

The canvas is the stage and fills the visual viewport beneath a compact top bar. World pockets are authored at a stable logical size and camera-cropped on narrow devices; gameplay never shrinks into a distant letterbox. Desktop HUD anchors objectives top-left and actions low-center/right. Touch uses a four-axis cluster low-left and context actions low-right, all at least `touch-target`. Overlays stay inside safe-area-aware viewport padding, scroll internally only when their content exceeds the available height, and keep actions reachable. Map transitions may change composition but not control placement.

## Elevation & Depth

World depth comes from isometric overlap, hard cast shadows, haze, and foreground occlusion. Product chrome uses opaque soot/bronze tonal layers plus one-pixel borders; blur is avoided because it reduces combat readability. Strong shadows are reserved for full-screen dialogue, shrine, pause, result, and act-transition surfaces. Routine HUD panels remain shallow and translucent enough to preserve the map while keeping text contrast.

## Shapes

Architecture, panels, cards, and primary controls use cut-stone edges and small radii. True circles are reserved for the touch direction cluster, health pips, and explicitly radial mythic effects. Pills are limited to compact identity/status tags. Borders are one pixel unless focus-visible, where the dedicated two-pixel ring is mandatory.

## Components

### Foundational visual states

Default controls use an authored border and stable geometry. Hover brightens the existing border or surface; focus-visible always uses `focus`; active compresses through color/impact rather than layout shift. Selected shrine patrons use gold border plus the word “Bound.” Disabled powers retain their label, reduce opacity, reject input, and expose readiness in text. Save failure persists as an inline alert until a later successful save. Loading is only used for lazy route import and reserves the full stage.

### Buttons and actions

Primary story actions use terracotta with gold border; secondary actions use bronze-panel with a subdued border; tertiary actions remain low-emphasis bordered text. Buttons use explicit verbs such as “New Story,” “Continue,” “Resume,” “Return,” and “Enter Pelagos.” Busy/disabled states cannot change size. Destructive New Story replacement must identify that it overwrites the existing checkpoint before proceeding.

### Navigation and data display

Exact hash routes isolate arena and RPG loops. Location, objective, patron, health, and encounter progress remain the only always-visible HUD data. Skills, Pack, and Journal open quiet record panels without turning the world into a dashboard. World targets use semantic 48px hotspots with a small diamond reticle only on hover/focus; the character walks to the authored target before the action resolves. Player-facing “waves” are forbidden; encounters show authored map/encounter identity and concrete completion. Act cards summarize destination, recovered epithet, and the next main objective without pretending unbuilt regions are playable.

Commerce is physically approached in the world rather than exposed as global HUD chrome. Merchant ledgers reuse the quiet side-panel grammar: item, unit price, stock, carried quantity, and exact transaction outcome remain legible in text. Bronze tally lines are the signature; pricing and availability never rely on color alone.

Renewable resources reuse the semantic diamond target: available nodes are gold and depleted nodes remain discoverable with a dashed parchment reticle plus a textual renewal estimate. Equipment uses a compact carved ledger inside the Pack, with all eleven canonical slots, readable combat totals, and explicit 44px Equip/Unequip actions. Crafting material provenance is a deliberate station control, not an invisible convenience: carried materials are the default, and a physically local Storehouse can be opted into with exact carried/bank deductions announced after settlement.

### Forms and overlays

There are no text-entry forms, selects, or date inputs. Shrine selection is an authored grid of semantic buttons. Dialogue, shrine, pause, combat result, save recovery, and act cards are app-owned overlays with accessible names, Escape behavior where safe, visible focus, and deterministic state outcomes. Native `alert`, `confirm`, and `prompt` are forbidden.

### Iconography

Code-native geometric glyphs and Canvas silhouettes are canonical. Text labels remain mandatory for powers, interaction, pause, and recovery; symbols alone never carry progression or danger. Imported proprietary game iconography is forbidden.

### Motion

Exploration locomotion is distance-driven: click-to-move accelerates into a readable walk, follows collision-aware paths, brakes into the destination, and settles without idle drift. Kallias must visibly plant his feet through alternating weight shift, body bob, directional lean, and a contact shadow; translating a static plate without gait is a release-blocking regression. Keyboard movement uses the same locomotion primitive, while reduced motion keeps position/facing and suppresses decorative gait travel. Combat uses short recoil, particles, impact flashes, bounded screen shake, and restrained hit stop. Transitions communicate crossing a threshold or restoring an epithet. All loops are interruptible by pause/unmount.

### Content and data visualization

Voice is direct mythic prose: specific nouns, short objective verbs, no lore dump in HUD. Numbers are reserved for health, cooldown, currency, and explicit objective counts. Health and cooldown always retain textual/accessibility alternatives. Score and token telemetry never become story currency or progression.

## Do's and Don'ts

- **Do:** Let each region earn a distinct mythic material, traversal hazard, and boss silhouette while preserving one HUD/control grammar.
- **Do:** Make patron powers mechanically distinct and mythology-grounded through the canonical power registry.
- **Don't:** disguise procedural waves as story levels or advance quests from score.
- **Don't:** trade legibility, touch reach, reduced motion, deterministic saves, or original IP for decorative fidelity.
