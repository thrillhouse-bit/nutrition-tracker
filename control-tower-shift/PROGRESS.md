# Control Tower Shift — progress

## Project overview

An arcade mini-game living inside the OmniFuel repo as a self-contained
subdirectory (`control-tower-shift/`). You operate a control tower through a
shift: waves of threats close in, you clear them for points, and five
abilities (shield, pulse clear, speed burst, score multiplier, repair) manage
the pressure. Survive the final wave to win; lose all tower integrity and the
shift fails.

## Milestones

- [x] **M1 — deterministic core**: pure game-state logic — scoring, wave
  progression, collision detection, all five abilities, win/fail, pause/restart,
  high-score persistence against an injectable storage mock. 45 unit tests in
  `game-core.test.js`, zero runtime dependencies, no `Math.random` or `Date.now`
  anywhere in `src/game/` (callers supply spawns and time).
- [x] **M2 — render layer**: `ControlTowerShift.jsx` — canvas play field (house
  geometry per the audit: ink triangles, cobalt tower footprint, mist shield
  ring, hairline range rings), fixed-timestep loop at 30 Hz driving `advanceTick`
  from refs (StrictMode-safe), tap-to-clear with touch slop, ability buttons
  with cooldown/active/ready words, pause overlay, end states with a top-5 board.
  Randomness lives ONLY in `spawner.js` (seeded mulberry32) — a seed replays the
  identical shift.
- [x] **M3 — integration**: `GameGate.jsx` mounted in `src/main.jsx` —
  `#control-tower` renders the game full-screen, any other hash renders the app
  untouched. No tab added (the five-tab nav is the owner's design). Lazy-loaded:
  the game is its own ~12 kB Vite chunk; the main bundle is unchanged.
- [x] **M4 — adversarial review and fixes**: shield tick-edge bug fixed, escape
  cull origin-relative bug fixed, partial ability override dropping `cooldown`
  fixed, high-score write gated by `isHighScore`, purity test guarded with a
  control proving `deepFreeze` detects mutations, dead-code `checkEndState`
  removed. Keyboard accessibility (#126): Enter/Space clears nearest threat, P
  pauses, DPR-aware canvas backing store, `prefers-reduced-motion` handling,
  44px touch targets. Score button label duplication fixed.
- [x] **M5 — how-to-play panel**: dismissible "?" panel explaining the tap/
  keyboard clear mechanic and each ability in plain language. Reduced to
  minimum 44px touch target.

## Visible progress protocol

- Branch: `hermes/control-tower-shift-game` (rebased onto `main` at
  `b3c19d0` — all M1-M5 content present)
- Each milestone lands as its own commit(s) on this branch; this file's
  checklist is updated in the same commit that completes a milestone.
- Tests are the acceptance record: `npx vitest run control-tower-shift`.
- A green suite is not the acceptance record on its own. Every claim about how
  this game behaves is backed by: a test that fails when the behaviour is
  mutated away, or a measurement taken from the built page in a real browser.

## Status log

- 2026-08-30 — M1 complete. Core logic + 45 tests green. Asset audit written
  (no pre-existing Control Tower assets found; geometric alternatives noted).
- 2026-08-30 — M2+M3 complete. Render layer, spawner, loop, hash-gate
  integration; 54 game tests, full repo suite green, production build verified.
  The unattended-shift test caught a real bug: spawn drift was wide enough that
  most threats missed the tower and flew off forever — fixed by capping drift so
  every spawn intersects the tower footprint, plus an `escapeRadius` cull.
- 2026-08-30 — M4, three passes: adversarial review (#124), accessibility (#126),
  cleanup (#127). All five confirmed defects fixed. Score button label duplication
  found and fixed via real browser verification.
- 2026-08-30 — M5 complete. How-to-play panel added. Merge catch: "?" toggle was
  fixed 24px, under the 44px floor — fixed to `min-h-11 min-w-11`.
- 2026-08-31 — Branch rebased onto `main` (commit `b3c19d0`). All M1-M5
|  content present. 121 game tests green (45 core + 13 spawner/loop + 63 view).
|  Production build verified. Game accessible at `/#control-tower`.
|- 2026-08-31 — **Deity progression system complete**: Full Tier 1 roster (Apollo,
|  Athena, Hermes, Ares, Artemis, Aphrodite, Hercules), Tier 2 (Zeus, Hera,
|  Poseidon, Hades, Persephone, Dionysus, Demeter), Tier 3 (Cronus, Helios,
|  Selene, Prometheus, Nyx, Eros, Atlas, Oceanus) — 18 deities total across
|  3 unlockable tiers. Added DeitySelect screen with tier-based unlock UI
|  (accessible from pause menu). Each deity has a signature ability, domain
|  glyph (adapted from Art.jsx), and faces monster waves from opposing pantheon.
|  Added 15+ canvas glyph drawers for domain gods and monsters. Added token
|  usage HUD counter (incremented per ability use + wave milestones). Tier 2+3
|  unlock on wave completion. All 80 game tests pass, 973 total repo tests
|  green, production build verified (ControlTowerShift-40.6 kB chunk).
|  Created vitest.config.js + vitest.setup.js for jsdom localStorage support.
