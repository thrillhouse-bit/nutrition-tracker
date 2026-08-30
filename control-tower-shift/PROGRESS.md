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

- [x] **M4 — adversarial review and its findings**: six review lenses, each
  finding then put to three independent skeptics. Five confirmed defects
  fixed (#124), then the accessibility gaps the review raised but could not
  adjudicate (#126), then dead code and a vacuous test (#127).

## Visible progress protocol

- Branch: `hermes/control-tower-shift-game`
- Each milestone lands as its own commit(s) on this branch; this file's
  checklist is updated in the same commit that completes a milestone.
- Tests are the acceptance record: `npx vitest run control-tower-shift`.
- **A green suite is not the acceptance record on its own.** Every claim
  about how this game behaves is backed by one of: a test that fails when
  the behaviour is mutated away, or a measurement taken from the built page
  in a real browser. Both, for anything visual — see the 30 Aug entry below
  for why.

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
- 2026-08-30 — M4, three passes. **(1) Adversarial review** (#124): five
  confirmed defects, each mutation-checked. The shield read the POST-step
  tick while the speed scale one line above read the pre-step one, so a hit
  on the step out of the shield's last active tick dealt full damage while
  the HUD still said "Shield up". The escape cull measured from the origin
  while collision and pulseClear honour `towerX/towerY`. A partial ability
  override dropped `cooldown`, so `cooldownUntil` went NaN and the ability
  fired once then was dead for the shift with nothing thrown. Every finished
  run was written to the high-score board, so ten unplayed shifts would fill
  the top ten with zeros — `isHighScore` already encoded the rule and was
  already tested, it just was not wired to the one write path. And the purity
  gate asserted only the absence of an exception, so a `deepFreeze` regression
  would have passed vacuously. **(2) Accessibility** (#126): the field was
  pointer-only while every control around it was tab-reachable — the game
  looked operable and was not playable. Enter clears the threat nearest the
  tower, P pauses; the canvas takes focus and says how to play. Also a fixed
  560px backing store stretched over 1170 device pixels on a phone, two
  buttons at 40px against this repo's own measured 44px floor, and no
  reduced-motion handling. **(3) Cleanup** (#127): `checkEndState` was
  exported, called by nothing, and inlined a copy of `waveComplete` — one
  idea in three places, the copy being the one no test would catch drifting.
  The `stepFrame` determinism test compared two runs of the same seed, which
  passes equally for a deterministic simulation and one that does nothing.
- 2026-08-30 — **The game was verified in a real browser for the first time,
  and that is what found the last bug.** 79 tests were green and the score
  button still rendered `×2` above `×2 SCORE` — the mark duplicated inside
  its own label, against every sibling's glyph-over-noun. Nothing compared
  the two strings, so nothing could have caught it. Measured on the built
  bundle at 430×900 DPR 2: HUD reads Wave 1/10 and Integrity 100/100; the
  canvas is genuinely painted (1110 inked pixels, luminance 18–244, not an
  empty buffer); the DPR fix resolves to a 792px backing store behind a 396px
  box; Enter-to-clear scores 0 → 200 against real spawns; `/` still renders
  the OmniFuel sign-in with no game canvas, and returning from the hash
  restores it. Zero page errors. **Screenshot anything visual before calling
  it done** — the suite cannot see the page.
