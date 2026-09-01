# GAME-DIRECTION.md — Control Tower Shift (arena campaign slice)

Status: original arena direction and shared-foundation contract. The story RPG
is now a playable five-act alpha; current scope is tracked in
`AUDIT-AND-ROADMAP.md`.

## One universe, two modes (Phase B plan)

Control Tower Shift is one original Greek-mythic game universe. Two modes share
characters, combat rules, enemies, powers, and world data:

1. **Arena campaign** (`/#control-tower`) — the Phase A slice: authored levels
   replace endless waves. The player controls a deity through named maps with
   explicit objectives.
2. **Story RPG** (`/#control-tower-rpg`) — explorable regions with a linear
   main quest and optional exploration. It may use the broad structural appeal
   of a large Greek-world action RPG, but MUST NOT copy Assassin's Creed
   Odyssey's plot, characters, map, UI, names, quests, dialogue, or assets.

The story route now exists as bounded authored open zones; the arena route
remains independently playable.

## Approved visual direction (Phase A north star)

The current abstract circle-and-glyph presentation is REJECTED. The approved
hybrid of the saved mockups (`01-sun-bleached-acropolis.png` +
`03-bronze-foundry.png`):

- Bright Aegean marble readability: sun-bleached ivory floors, readable
  boundaries, crisp hero/enemy silhouettes.
- Terracotta navigation lanes crossing the arena diagonals.
- Molten-orange projectile streaks, sparks, debris, hard impacts, charge
  telegraphs, restrained screen shake.
- All code-native Canvas paths — no external asset packs, no engine.

Fidelity note: this slice is a readable, distinct silhouette implementation of
that direction — not pixel parity with the mockups. Where the two conflict,
readability and performance win.

## Data contracts Phase B reuses (stable IDs)

- **Deities**: `GODS_TIER_1..3`, stable `key` per god (apollo, athena, hermes,
  ...). In `control-tower-shift/src/game/characters.js`.
- **Powers**: `POWER_DEFS` and `DEITY_LOADOUT` in
  `control-tower-shift/src/game/powers.js`. Every god has at least one distinct
  myth-grounded power with a deterministic effect. Apollo has three
  (solarBow, radiantBurst, goldenLyre).
- **Enemies**: `MONSTER_TYPES` in characters.js — hydra (serpent), cerberus
  (hound), chronos (wraith), minotaur (elite bull-man), medusa, sphinx, atlas.
  Each renders as a distinct full-body silhouette in `src/renderer.js`.
- **Maps/locations**: `CAMPAIGN` in `control-tower-shift/src/game/campaign.js`
  — stable `id` per level, palette, architecture (columns/braziers), encounter
  composition, objective, intro/completion copy.
- **Simulation vs renderer**: pure game state in `src/game/*` (no RNG, no DOM);
  rendering in `src/renderer.js` consumes state + a render-layer fx object. The
  same state always renders the same frame.

## Control grammar

- Keyboard: WASD / arrows move; J K L (or 1 2 3) cast the three powers;
  Enter = point-blank melee; P pauses. Pointer/touch: aim where you point, tap
  or the fire button looses the bow, on-screen powers.
- Deterministic and testable by construction; keyboard, pointer/touch, pause,
  reduced-motion, and accessible buttons are preserved.

## Original-IP boundary

- No copyrighted game assets or recognizable proprietary character/UI designs.
- No ACO plot/characters/map/UI/names/quests/dialogue/assets.
- Everything is code-native Canvas geometry in an original Greek-mythic frame.

## What Phase B may reuse

- The campaign data module (as region/map data), power engine, enemy archetypes
  + silhouettes, arena renderer, control grammar, and the pure-simulation
  separation — all designed to be shared rather than duplicated.
