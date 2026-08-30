# Control Tower Shift — progress

## Project overview

An arcade mini-game living inside the OmniFuel repo as a self-contained
subdirectory (`control-tower-shift/`). You operate a control tower through a
shift: waves of threats close in, you clear them for points, and five
abilities (shield, pulse clear, speed burst, score multiplier, repair) manage
the pressure. Survive the final wave to win; lose all tower integrity and the
shift fails.

## Milestones

- [x] **M1 — deterministic core** (this commit): pure game-state logic —
  scoring, wave progression, collision detection, all five abilities,
  win/fail, pause/restart, high-score persistence against an injectable
  storage mock. 35 unit tests, zero runtime dependencies, no `Math.random`
  or `Date.now` anywhere in `src/game/` (callers supply spawns and time).
- [x] **M2 — render layer**: `ControlTowerShift.jsx` — canvas play field
  (house geometry per the audit: ink triangles, cobalt tower footprint, mist
  shield ring, hairline range rings), fixed-timestep loop at 30 Hz driving
  `advanceTick` from refs (StrictMode-safe), tap-to-clear with touch slop,
  ability buttons with cooldown/active/ready words, pause overlay, end
  states with a top-5 board. Randomness lives ONLY in `spawner.js`
  (seeded mulberry32) — a seed replays the identical shift.
- [x] **M3 — integration**: `GameGate.jsx` mounted in `src/main.jsx` —
  `#control-tower` renders the game full-screen, any other hash renders the
  app untouched. No tab added (the five-tab nav is the owner's design).
  Lazy-loaded: the game is its own ~12 kB Vite chunk; the main bundle is
  unchanged. Game-only Tailwind classes verified present in the built CSS.

## Visible progress protocol

- Branch: `hermes/control-tower-shift-game`
- Each milestone lands as its own commit(s) on this branch; this file's
  checklist is updated in the same commit that completes a milestone.
- Tests are the acceptance record: `npx vitest run control-tower-shift`.

## Status log

- 2026-08-30 — M1 complete. Core logic + 35 tests green. Asset audit written
  (no pre-existing Control Tower assets found; geometric alternatives noted).
- 2026-08-30 — M2+M3 complete. Render layer, spawner, loop, hash-gate
  integration; 54 game tests, full repo suite green, production build
  verified. The unattended-shift test caught a real bug on the way in:
  spawn drift was wide enough that most threats missed the tower and flew
  off forever, leaving waves permanently incomplete — fixed by capping
  drift so every spawn intersects the tower footprint, plus an
  `escapeRadius` cull in the core so any off-field threat still resolves
  its wave. Play at `/#control-tower`.
