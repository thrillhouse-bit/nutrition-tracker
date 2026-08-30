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
  ("every control gets a visible focus ring and a real label"). Two lanes
  worked this concurrently and landed within minutes of each other: PR
  #126 shipped the keyboard path itself (`loop.js`'s
  `nearestThreatToTower()`, Enter/Space clears, P pauses, DPR-aware canvas
  backing store, `prefers-reduced-motion` handling, 44px touch targets) —
  more complete than this PR's own first draft, which duplicated the same
  idea as `nearestThreat()` and was DROPPED in favor of theirs on merge,
  rather than kept alongside it as dead/duplicate code. What this PR
  actually contributes on top: the dismissible "?" panel in the header
  explaining the tap/keyboard clear mechanic and each ability in plain
  language — a gap #126 didn't cover. Also folded in while merging: PR
  #124's five bug fixes (partial ability-config-override merge, the
  escape-cull measuring from the origin instead of the configured tower,
  a shield-boundary damage bug, a zero-score high-score-board write bug,
  and a purity-freeze control test) and PR #127's score-button label fix
  (the mark and label both read "×2" — fixed to "Score" under the `×2`
  glyph) and a duplicate `checkEndState` cleanup.

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
  ships as its own lazy chunk.
- 2026-08-30 — M4 opened as a PR (keyboard accessibility + a how-to-play
  panel), built against a real completeness gap found by reading the
  merged code rather than assumed. Before it merged, three more PRs
  landed on `main` from a concurrent lane: #124 (five adversarially-found
  bug fixes: partial ability-config-override merge dropping `cooldown`,
  the escape-cull measuring from the origin instead of the configured
  tower, a shield-boundary damage bug, a zero-score board-write bug, a
  purity-freeze control test), #126 (the SAME keyboard-accessibility gap,
  independently — and more completely: Enter/Space clears plus P pauses,
  DPR-aware canvas backing store, `prefers-reduced-motion` handling,
  44px touch targets), and #127 (the score-multiplier button's mark
  repeating its own label, plus a duplicate `checkEndState`). Resolved by
  merging `main` in and dropping this PR's own keyboard implementation
  entirely in favor of #126's more complete one, rather than keeping two
  functions doing the same job — this PR's surviving, non-duplicated
  contribution is the how-to-play panel. That merge caught a real, live
  bug in this PR's own code: the "?" toggle button was a fixed 24px box,
  under the 44px touch floor #126's own suite tests EVERY button against
  — the merged suite failed on the first run, not a pre-existing test
  this PR had to write. Fixed by sizing it the same way every other
  control on the page already is (`min-h-11 min-w-11`). 80 game tests
  (all four PRs' suites combined, none dropped), full repo suite green,
  production build verified. The lesson: **read the target branch's
  actual current state before merging, not just the state you branched
  from** — the base moved three PRs in the time this one was open, and
  the merge is exactly the moment a real regression like this surfaces
  instead of shipping quietly.
