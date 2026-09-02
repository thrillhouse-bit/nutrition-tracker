# Control Tower Shift — progress

## Project overview

One original Greek-mythic game universe (two modes planned: arena campaign +
story RPG) living inside the OmniFuel repo as a self-contained subdirectory
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
- 2026-09-02 — **96-hour interim-engineer takeover begins.** See
  `CLAUDE-96H-TURNOVER.md` for the operating charter, question policy, and
  execution loop. First checkpoint below.

## Recovery checkpoint — 2026-09-02T13:2x (turnover hour ~0)

- **Branch**: `codex/oathbearer-complete-game`. **Local HEAD**: `d94a174`
  ("feat(oathbearer): integrate fishing tool tier and Act II fishing
  expansion"), committed on top of the turnover baseline `06055fb`.
- **Push status**: `d94a174` was pushed successfully to
  `origin/codex/oathbearer-complete-game` after the already-authorized
  central lead performed the permission-gated Git write. The Claude lead
  may continue implementation without treating this as a product blocker.
- **Clean/dirty state**: working tree is clean except the quarantine
  (untracked, intentionally unregistered):
  - `control-tower-shift/src/rpg/act4Conversations.js`
  - `control-tower-shift/test/rpg-act4-conversations.test.js`
  - `control-tower-shift/artifacts/hermes-dialogue/`
- **What `d94a174` did** (Priority 0 — Fishing checkpoint integration):
  - Reconciled the two stale assertions the turnover doc named:
    `rpg-content-validation.test.js` (resource total 18→21 + new IDs) and
    `rpg-crafting.test.js` (bronzework/bronze-forge recipe totals 17→19,
    level-3 list gains `bronze-fishing-rod`).
  - Found and fixed a **third, undocumented** stale-assertion collision the
    turnover list missed: the three new Act II fishing resource entities
    (`pelagos-red-mullet-run`, `anchorage-sturgeon-run`,
    `archive-hippocamp-shoal`) landed on Act II maps with no release-ready
    authoring metadata, which the Act II authoring-readiness contract
    requires for every non-shop Act II map entity. Added original
    dramaticQuestion/systemsUsed/durableReward/downstreamConsequence/
    recoveryBehavior/originalityNotes for each (matching the existing
    `anchorage-tuna-run` entry's pattern) so they land release-ready
    instead of legacy — not a threshold tweak, real authoring content.
  - Updated `rpg-act2-authoring-readiness.test.js` and
    `rpg-authoring-schema.test.js` to the resulting truthful counts (54
    Act II records; 82/293 release-ready; legacy unchanged at 211) and the
    recomputed Act II behavior digest (legitimately changes — these are
    new gameplay resource nodes, not authoring-only edits).
  - Updated `FULL-GAME-CONTRACT.md`'s resource-node and
    authoring-readiness rows to match reality.
- **Verification evidence for `d94a174`**:
  - Focused: `rpg-gathering-tools-fishing.test.js`,
    `rpg-act2-fishing-expansion.test.js`, `rpg-content-validation.test.js`,
    `rpg-crafting.test.js`, `rpg-act2-authoring-readiness.test.js`,
    `rpg-authoring-schema.test.js` → 112/112 passed.
  - Full suite: `npm run test:oathbearer` → **958/958 passed** (73 files).
  - `npm run build` → succeeded.
  - `npm run report:oathbearer:complete` → correctly remains **BLOCKED**,
    no thresholds altered. Current truthful counts from this run:
    completeSkillLoops 0/22, items 79/200, recipes 47/100, maps 23/60,
    quests 10/70 (main 5/20, side 5/35, character 0/10, mastery 0/5),
    dialogueWords 927/50000, conversations 15/60, encounters 20/80
    (bosses 5/12), namedNpcs 16/60, resourceNodes 21/150, merchants 5/15,
    banks 1/8, reactiveChoices 0/20, delayedConsequences 0/8, plus every
    human/browser release-evidence field still absent.
  - `git diff --check` → clean.
- **Active subagents**: none yet this checkpoint — worked solo on the
  bounded reconciliation task before spawning anything, per the turnover's
  "begin with at most two subagents plus the lead" guidance.
- **Discovered but deliberately deferred** (not fixed this checkpoint, to
  keep it bounded and reviewable): `FULL-GAME-CONTRACT.md`'s "Current
  audited baseline" table has other stale rows predating this session
  (items shown as 77 vs. the report's actual 79; recipes shown as 45 vs.
  actual 47; objectives shown as 55, unverified) — likely drift from the
  equipment-ladder/Act II-authoring/combat-progression integration commit
  (`11a31e8`) that was never reconciled against the table. Worth a single
  bounded "truthful contract table" pass later; not fixed now because it
  is unrelated to the Fishing lane and touches numbers I did not just
  independently verify end-to-end.
- **Next three ordered milestones** (per turnover Priority order):
  1. Priority 1 — close a complete skill loop. Gate shows
     `completeSkillLoops: 0/22`; Stewardship is flagged in the turnover
     doc as the next new-contract skill after Fishing and needs deliberate
     resource/event/UI design, not cosmetic metadata. This is the next
     lead task; a bounded non-overlapping delegated lane (content/schema
     enumeration for Stewardship's node/tool/output set) can run in
     parallel once the lead has sketched the loop shape.
  2. Priority 2 — economy/equipment network (banks 1/8, merchants 5/15
     are the largest raw gaps after skill-loop closure).
  3. Reconcile the remaining stale audited-baseline rows against executable
     report evidence without changing or lowering release thresholds.
- **Assumptions a fresh lead must preserve**: the quarantine is untouched
  and must stay untouched until a lead designs a correct Act IV dialogue
  integration contract (NPC availability, quest-choice reducer
  integration, portraits/display-name assembly, reachability, exact-once
  tests, browser acceptance) — do not register or wire it in as-is.
