# Control Tower Shift — progress

## Project overview

One original Greek-mythic game universe (two modes planned: arena campaign +
story RPG) living inside the Body Current repo as a self-contained subdirectory
(`control-tower-shift/`). Phase A replaces the old abstract circle/glyph
presentation and wave-driven tower-defence with a playable arena campaign: a
deity moves through authored Greek-mythic maps, uses deity powers + deliberate
melee attacks, and clears each level's objective. Direction, palette, and Phase B
contracts live in `GAME-DIRECTION.md`.

Current product status (2026-09-01): the separate Oathbearer story route is a
playable five-act alpha. The authoritative gap and execution plan now live in
`AUDIT-AND-ROADMAP.md`; the historical phase notes below are retained as build
history rather than current scope.

## Milestones

- [x] **M1 — deterministic core**: pure game-state logic — scoring, collision,
  win/fail, pause/restart, high-score persistence against an injectable storage
  mock. No `Math.random` or `Date.now` in `src/game/` (callers supply spawns).
- [x] **M2 — render layer**: canvas play field, fixed-timestep loop, tap-to-clear,
  cooldown/active/ready buttons, pause overlay, end states. Randomness ONLY in
  `spawner.js` (seeded mulberry32).
- [x] **M3 — integration**: `GameGate.jsx` hash-gates `#control-tower`;
  lazy-loaded game chunk; main bundle unchanged.
- [x] **M4/M5 — adversarial review + accessibility + how-to-play panel**.
- [x] **Deity progression (pre-Phase-A)**: tiered roster; then superseded — see
  Phase A rewrite below.

## Phase A — arena campaign slice (this branch)

Rewrite on branch `codex/control-tower-mythic-rebuild` (from `46a6165`):

- **Authored map progression**: new `src/game/campaign.js` — three original
  locations in order (Acropolis Entry Court → Marble-and-Terracotta Sun Court →
  Bronze Foundry Threshold), each with palette/materials, architecture
  (columns/braziers), encounter composition, objective, intro copy, completion
  and next-map transition. HUD shows LEVEL / location / objective progress
  (`data-testid="level"` / `"objective"`); no player-facing `Wave N/10`.
  Spawning is an internal per-level pacing mechanism only.
- **Mythology-specific powers**: new `src/game/powers.js` — a typed,
  data-driven power definition (name, description, kind, cooldown, duration,
  deterministic effect) for every deity in the roster (22 powers). Shared
  dispatch `castPower`/`powerReady`/`powerActive`. Apollo's kit is fully
  playable: solarBow (luminous arrow projectile), radiantBurst (aimed AoE
  blast), goldenLyre (tempo — faster bow + double score). HUD exposes exactly
  three powers for Apollo with honest cooldown/ready states. Other deities are
  selectable and their signature power works in the simulation.
- **Rendering rewrite**: new `src/renderer.js` — isometric-inspired arena
  (diamond floor tiles, terracotta lanes, boundary wall, broken columns,
  braziers with flame glow, cast shadows, foreground depth); full-body
  Apollo-inspired archer (head/torso/limbs/bow/quiver, pose + recoil); distinct
  silhouettes for hydra (serpent), cerberus (hound), chronos (wraith), minotaur
  (bull-man elite); molten-orange arrow streaks, impact flashes, sparks/debris,
  bounded screen shake, minotaur charge telegraph, damage feedback; reduced
  motion respected.
- **HUD / controls**: deity identity + health top-left, level/location/
  objective top-right, three large powers bottom-center; WASD/arrows + J K L /
  1 2 3 + Enter + P; pointer aim + tap-to-fire + fire button; 44px targets,
  visible focus, no native dialogs, dismissible first-time hint; level-complete
  transitions and replay (restart level / new campaign).
- **Shared foundation for Phase B**: stable deity/power/enemy/map IDs, clean
  simulation-vs-renderer separation, `GAME-DIRECTION.md` written.

### Tests

- `campaign.test.js` (levels authored + progression), `powers.test.js`
  (every power definition + dispatch), `game-core.test.js` (simulation
  contracts), `spawner-loop.test.js` (determinism, encounter feed),
  `game-view.test.jsx` (HUD, powers, accessibility, no native dialogs,
  no "Wave N/10", keyboard/pause/reduced-motion).
- Result: `npx vitest run control-tower-shift` → **118 tests green (5 files)**.
- Full repo suite: 49/50 files green; 1 pre-existing unrelated failure in
  `test/agent-surface.test.js` (HTTP agent endpoint, untouched by this branch).
- `npm run build` → success (ControlTowerShift chunk, PWA generated).

## Phase B — arena visual correction

- Viewport-filling 16:9 Acropolis arena, dark bronze HUD, larger silhouettes,
  corrected isometric pointer projection, deliberate melee, kill-based
  objectives, contact damage/recoil, level-title transitions, and hardened FX.
- Project-bound transparent Apollo archer asset integrated with a vector
  fallback; live browser evidence is `artifacts/phase-b-arena.png`.
- Pointer capture/release, single dispatch, Enter melee, patron authorization,
  reduced motion, restart, projection, and renderer regressions are covered.

## Phase C — Oathbearer RPG foundation

- Separate exact route `/#control-tower-rpg`; the arena remains at
  `/#control-tower` and all other hashes remain the original app.
- Original New Story / Continue entry, Beacon Overlook and Olive Road authored
  world pockets, Kallias traversal/dash/collision, Thessa dialogue, skippable
  deterministic conversation effects, the seven Tier-1 patron shrine choices,
  canonical power descriptions/loadouts, optional lost-witness tablet, and
  boundary-safe schema-v1 saves.
- A thin `src/rpg/combatAdapter.js` runs the deterministic Acropolis Entry Court
  without leaking story state into score/high-score state. It owns the seed,
  emits exactly-once win/failure events, and restores the pre-encounter
  checkpoint on defeat.
- Desktop keyboard and narrow touch controls now cover two-axis movement,
  interaction, dash, melee, all patron powers, pause/resume, and save/reload.
  Portrait rendering follows Kallias instead of leaving a large letterbox.
- At this phase boundary, Sun Court and Acts II–V were intentionally deferred.
  They have since been implemented and accepted in the five-act pass below.

### Verification status

- `npx vitest run control-tower-shift` → **161 tests green (8 files)**.
- `npm run build` → success; arena and RPG remain separate lazy chunks.
- `git diff --check` → clean.
- Real-browser mobile playthrough verified New Story → Thessa → patron shrine →
  save/reload → Olive Road → Entry Court, canonical Apollo cast/cooldown,
  failure checkpoint restoration, combat pause, and RPG → arena route switch.
  No browser console errors were observed. Evidence:
  `artifacts/rpg-title-mobile.png`, `artifacts/rpg-olive-road-mobile.png`, and
  `artifacts/rpg-combat-paused-mobile.png`.

## Status log

- 2026-08-30 — M1–M5 + deity progression as above.
- 2026-08-31 — **Phase A arena campaign slice**: wave progression replaced by
  authored campaign; generic abilities replaced by per-deity powers; abstract
  circle/glyph renderer replaced by isometric marble/terracotta arena with
  full-body silhouettes + combat FX. 118 game tests green; production build
  verified.
- 2026-08-31 — **Phase B correction + Phase C RPG foundation**: arena visual
  correction completed; separate Oathbearer story route implemented and
  verified through its first authored encounter boundary. 161 focused tests,
  production build, diff check, and live browser route/mobile/save/combat pass
  all green.
- 2026-09-01 — **Five-act playable alpha**: Acts I–V completed through the
  normal public UI without storage or developer-console shortcuts. Integrated
  skill/inventory/bank/crafting/wilderness systems, exact-once combat and death
  settlement, strict save normalization, physical system access, responsive
  camera/input, optimized route assets, safe Act V light traversal, and the
  mandatory final witness/ending sequence. See `AUDIT-AND-ROADMAP.md` for the
  current verification baseline and remaining systems/art/release work.
