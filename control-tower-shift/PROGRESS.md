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
- [x] **M4 — accessibility + onboarding**: the play field was pointer/touch
  only, with no keyboard path and no in-game explanation of the ability
  glyphs (▢ ◎ » ×2 +) — a real gap against the design system's own rule
  ("every control gets a visible focus ring and a real label"). Fixed
  without touching the deterministic core: `loop.js` gains `nearestThreat()`
  (closest threat to the tower, no slop cutoff — distinct from `threatAt()`,
  which is a pointer hit-test); the canvas is now keyboard-focusable while
  running (picks up the design system's existing global `:focus-visible`
  ring for free) and Enter/Space clears the nearest threat. A dismissible
  "?" panel in the header explains the clear mechanic and each ability in
  plain language. 7 new tests (3 `nearestThreat` unit tests, 4 render-layer:
  keyboard focusability, a no-threat no-op control, an actual keyboard
  clear-and-score under fake timers, and the help panel's open/close).

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
- 2026-08-30 — M2+M3 merged to `main` (PR #121) and independently
  re-verified live in a separate QA check-in pass (`docs/qa-qc-report.md`):
  Playwright-tested at `#control-tower`, confirmed the game doesn't leak
  into or break the main app's sign-in route, and confirmed the game still
  ships as its own lazy chunk. M4 (this entry) closes a real completeness
  gap found by reading the merged code rather than assumed: no keyboard
  path onto the play field, and no in-game explanation of what the five
  ability glyphs do. 61 game tests, full repo suite green, production
  build verified. Mutation-tested both new behaviors (keyboard clear,
  help-panel toggle) — each covering test fails against a reverted/no-op
  version and passes restored, byte-identical.
