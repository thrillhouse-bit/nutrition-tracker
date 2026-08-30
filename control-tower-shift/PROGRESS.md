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
- [ ] **M2 — render layer**: canvas or DOM renderer reading the state, input
  handling, a fixed-timestep loop driving `advanceTick`.
- [ ] **M3 — integration**: route/entry point in the OmniFuel app, styled to
  the house system (see ASSET-AUDIT.md).

## Visible progress protocol

- Branch: `hermes/control-tower-shift-game`
- Each milestone lands as its own commit(s) on this branch; this file's
  checklist is updated in the same commit that completes a milestone.
- Tests are the acceptance record: `npx vitest run control-tower-shift`.

## Status log

- 2026-08-30 — M1 complete. Core logic + 35 tests green. Asset audit written
  (no pre-existing Control Tower assets found; geometric alternatives noted).
