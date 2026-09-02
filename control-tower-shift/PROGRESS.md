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

## Recovery checkpoint — 2026-09-02T14:2x (turnover hour ~1)

- **Branch**: `codex/oathbearer-complete-game`. Prior HEAD `047e775`
  (Jackson landed the fishing-checkpoint recovery-notes commit himself
  after the harness's Bash permission classifier blocked my own
  `git commit`/`git push`; he granted standing permission to proceed).
- **This checkpoint (uncommitted at time of writing, about to commit)**:
  Priority 1 — first Stewardship skill-loop vertical slice, a genuine
  new mechanic rather than a clone of the resource-node pattern already
  used by fishing/quarrying/foraging/woodcutting, per the turnover's
  explicit guidance that Stewardship "needs deliberate resource/event/UI
  design rather than cosmetic metadata."
  - **Design**: a physical Beacon Overlook entity (`steward-fallow-field`,
    kind `resource`) that is inert until restored. A new `RESTORE_LAND`
    event (`state.js`) is level-gated, atomically consumes a multi-
    ingredient cost (compost ×2; the atomicity check verifies every
    ingredient is carried before removing any, so a partial cost can
    never be charged), and sets a persistent `flags['steward:restored:…']`
    exact-once. `gather()` now honors an optional `resource.requiresFlag`
    gate, so the same physical node becomes an ordinary tend-able
    resource node (existing depletion/respawn/tool-bonus machinery,
    unmodified) only after restoration — this is the "restore land, tend
    crops" contract the skill's own description promises, not a plain
    harvest node with different flavor text.
  - **New items**: `compost` (material, purchasable from Myrrine at
    Beacon Overlook — a genuine economy sink/source, not a free grant),
    `barley-sheaf` (grain, the tended crop; sellable back to Myrrine —
    closes the trade loop). New tiered tool line matching every other
    gathering skill's pattern: `bronze-hoe`/`iron-hoe` (bronzework/
    bronze-forge recipes at level 3/15, same cost shape as the fishing
    rods), `toolBonus` yield +1/+2.
  - **UI** (`ControlTowerRPG.jsx`): the nearby-interaction prompt, the
    off-screen accessible world-target label, and the click-to-approach
    handler all now compute a state-aware label/action — "Restore the
    fallow field" before the flag is set, the ordinary tend prompt after
    — instead of a static authored string that would silently lie about
    which action a keypress performs.
  - **Content-integrity fallout reconciled** (same class of issue as the
    Fishing checkpoint's Act II authoring collision): the new resource
    entity needed real Act I authoring metadata
    (dramaticQuestion/systemsUsed/durableReward/downstreamConsequence/
    recoveryBehavior/originalityNotes) to land release-ready rather than
    legacy, which shifted `rpg-act1-authoring-readiness.test.js` (28→29
    Act I records, 8→9 Beacon Overlook entities) and, downstream,
    `rpg-act2-authoring-readiness.test.js` and `rpg-authoring-schema.test.js`
    (293→294 total, 82→83 release-ready, legacy unchanged at 211).
    `rpg-content-validation.test.js` and `rpg-crafting.test.js` updated
    for the new resource/recipe counts (21→22 resources, 19→21 bronzework
    recipes), same pattern as the Fishing reconciliation.
  - **New test file**: `test/rpg-stewardship-fallow-field.test.js` (20
    tests) — item/recipe registration, world placement + reachability +
    distinctness, `RESTORE_LAND` atomicity/level-gate/exact-once, `GATHER`
    before/after restoration including tool-bonus stacking and inventory-
    full atomicity, and bank + Myrrine buy/sell economy interaction.
- **Verification evidence**:
  - Full suite: `npm run test:oathbearer` → **978/978 passed** (74
    files, up from 958/73).
  - `npm run build` → succeeded.
  - `npm run report:oathbearer:complete` → correctly remains **BLOCKED**;
    `resourceNodes` 21→22, `items` 79→83, `recipes` 47→49, and
    **`completeSkillLoops` deliberately left at 0/22** — see below.
  - `git diff --check` → clean.
  - **Partial live-browser evidence, not a full playthrough** — recorded
    honestly rather than papered over:
    - Created a real account and started a New Story against the actual
      production build (`npm run build` output served via `vite preview`
      with a temporary local `preview.proxy` added to `vite.config.js`
      to reach the API, then reverted before this commit — the dev
      server on :5173 could not be used because one specific unrelated
      file, `src/components/LogView.jsx` — part of the pre-existing
      nutrition-tracker app, not touched by this session — consistently
      failed to load only inside the browser tab (curl and a fresh
      no-cache `fetch()` both diverged from what the tab reported),
      breaking the whole module graph before the RPG route could even
      mount. Worth a `/run-skill-generator` pass later; noted here so
      the next session doesn't rediscover it from scratch).
    - Confirmed live, via the accessibility tree against the running
      production build: the fallow field's interaction target correctly
      reads **"Restore the fallow field"** before restoration — i.e. the
      new state-aware label logic is genuinely wired into the shipped
      UI, not just passing in isolation.
    - Confirmed live: the general gather mechanism (wild thyme at Beacon
      Overlook — the same code path Stewardship's post-restoration tend
      step reuses) completed end-to-end with real feedback ("Wild Thyme
      added to your backpack. The node is now depleted.") and a real
      inventory/XP change persisted to the account save.
    - Could not complete a full walk-there-and-restore-and-tend
      playthrough in this session: this automated tab's
      `document.visibilityState` was `"hidden"` throughout (confirmed via
      direct JS inspection, not inferred from a blank screenshot), which
      freezes the character-movement animation loop in this build
      (movement dispatches ride `requestAnimationFrame`, which Chrome
      clamps to near-zero for hidden documents) even though discrete,
      event-driven state changes (clicks, gathers, panel toggles) kept
      working normally. Confirmed by reading `world.position` directly
      out of the persisted account save rather than trusting the
      screenshot: position stopped advancing at all across an 8-second
      wait after a click-to-move. This reproduced consistently across a
      fresh tab, `resize_window`, and repeated reloads — a property of
      this browser-automation session, not of the game.
  - **Because of the above, `completeSkillLoops` was deliberately left
    truthfully at 0/22.** The reducer contract, atomicity, exact-once
    behavior, and economy interaction are proven by 20 dedicated tests
    plus the full suite, and the live UI wiring is proven by the
    accessible-label check above, but the turnover's bar for a "complete
    skill loop" explicitly requires human/browser acceptance of the full
    loop, which this session could not finish live. **Do not bump this
    number without either a real interactive playthrough (Jackson, or a
    session where the tab is genuinely foregrounded/visible) or an
    equivalent, honestly-documented substitute.**
- **Active subagents**: none — solo lead work again; this was reducer +
  shared-UI + content authoring, all lead-owned per the turnover's team
  topology.
- **Next three ordered milestones**:
  1. Get a real interactive (or Jackson-run) browser pass on the Beacon
     Overlook fallow field: buy 2 compost from Myrrine (starting
     currency is 0 — sell a gathered copper-ore/olive-log/thyme first),
     restore it, tend it once, confirm the UI copy switches correctly
     from "Restore…" to the ordinary tend prompt after restoration, then
     truthfully set `completeSkillLoops` to 1/22 in
     `full-game-release.json`'s `evidence` block and record the exact
     evidence in this file.
  2. Continue Priority 1: a second gathering-tier skill loop (or extend
     Stewardship into Act II/III to build out its own multi-tier curve
     the way Fishing/Quarrying/Foraging/Woodcutting already have) is
     the next highest-value lane, since one verified loop out of 22
     alone doesn't move the release gate materially.
  3. Priority 2 — economy/equipment network (banks 1/8, merchants 5/15).
  4. Reconcile the remaining stale `FULL-GAME-CONTRACT.md` "Current
     audited baseline" rows noted in the previous checkpoint (unrelated
     to this one; still deferred).

## Recovery checkpoint — 2026-09-02T14:3x (turnover hour ~1)

- **Branch**: `codex/oathbearer-complete-game`. Prior HEAD `2ffeff2`
  (Stewardship checkpoint, pushed).
- **This checkpoint**: Priority 2 — closed the most acute economy gap
  first: before this pass only Beacon Overlook (Act I) had a physical
  bank, leaving every player in Acts II–V with zero account-safe
  storage anywhere in three-quarters of the game. Added one regional
  bank to each remaining act's hub map:
  - Pelagos Storehouse — `pelagos-harbor` (Act II), with full
    `act2Authoring` metadata (this act still has an authoring-readiness
    contract test, so the new entity needed real authoring to land
    release-ready rather than legacy — same reconciliation shape as the
    two prior checkpoints).
  - Wheat Village Granary Store — `wheat-village` (Act III).
  - March Muster Strongbox — `slag-road` (Act IV).
  - Witness Camp Cache — `nyx-foothold` (Act V).
  - Acts III–V carry zero authoring metadata anywhere in the existing
    codebase (confirmed by grep before touching anything) — they are
    explicitly still legacy per the turnover's own roadmap, so the new
    Act III/IV/V bank entities were left unauthored to match their
    siblings, not "fixed" prematurely.
- **How placement was verified before committing to coordinates**: wrote
  a throwaway Node probe script (`_probe.mjs`, deleted before commit,
  never staged) that calls the real `findWorldPath` against the real
  registered maps for every spawn and every relevant route state
  (Act II tide states; Act III seasons; Act IV pressure states; Act V
  light-polarity states) before hand-picking any coordinates — this
  caught that `wheat-village`'s existing, already-shipped Eirene shop is
  itself only reachable in the map's `'winter'` route state (the other
  three season states are not concurrently walkable during normal Act
  III play — a genuine property of that map, not a bug), so the new
  bank was placed to match that same, already-correct pattern rather
  than chasing a false "reachable in every state" bar borrowed from Act
  II's different (cyclically-active) tide mechanic.
- **Reducer behavior confirmed, not assumed**: `bankIsPhysicallyAvailable`
  (`state.js`) was already fully generic — it only checks whether *any*
  `kind: 'bank'` entity exists on the current map — and bank storage
  itself is one flat `inventory.bank` structure in the save, so every
  regional bank shares one account-wide vault gated by physical
  presence, exactly like Beacon Overlook's already did. No reducer
  changes were needed; this was pure, low-risk content placement plus
  test coverage proving the existing generic mechanism actually holds
  at every new location.
- **Existing test updated for a genuine behavior improvement**: the
  Fishing checkpoint's own `rpg-act2-fishing-expansion.test.js` bank
  test previously demonstrated "depositing away from any bank is a
  no-op" by using Pelagos Harbor itself as the remote (bankless)
  location, then traveling all the way back to Beacon Overlook to
  actually deposit. That assumption is no longer true — Pelagos Harbor
  now has its own bank — so the test now deposits directly at Pelagos
  Harbor (a strictly better, shorter economy loop for a real player)
  and demonstrates the no-op case from `breakwater-road` instead.
- **Content-integrity fallout reconciled** (same shape as both prior
  checkpoints): `rpg-content-validation.test.js` banks count 1→5;
  `rpg-act2-authoring-readiness.test.js` Act II records 54→55, whole-
  registry total 294→298, legacy 211→214 (+3 for the three unauthored
  Act III–V banks), release-ready 83→84 (+1 for the authored Act II
  bank), recomputed Act II behavior digest (legitimately changes — a
  new bank is new gameplay data, not an authoring-only edit);
  `rpg-authoring-schema.test.js` matching counts. `FULL-GAME-CONTRACT.md`
  banks row and authoring-readiness row updated to match (the latter
  had also drifted one checkpoint behind — the Stewardship commit bumped
  the real counts but I forgot to update this doc then; fixed now).
- **New test file**: `test/rpg-regional-banks.test.js` (9 tests) — each
  bank's placement/fields, reachability from every spawn across every
  relevant route state, physical distinctness from siblings, zero new
  content-validation errors, deposit/withdraw at each new bank with a
  genuinely bankless map proving the remote no-op, and one test proving
  the shared-account-bank behavior explicitly (deposit at Wheat Village,
  withdraw at Nyx Foothold).
- **Verification evidence**:
  - Full suite: `npm run test:oathbearer` → **987/987 passed** (75
    files, up from 978/74).
  - `npm run build` → succeeded.
  - `npm run report:oathbearer:complete` → correctly remains **BLOCKED**;
    `banks` 1→5.
  - `git diff --check` → clean.
  - No browser-acceptance evidence attempted this checkpoint — this was
    pure backend/content work with full reducer-generic reuse and no
    new UI surface, so the same tab-visibility limitation from the
    Stewardship checkpoint wasn't in play, but a real save/reload/
    deposit-withdraw browser pass across at least one new regional bank
    is still worth doing whenever a live session is available.
- **Active subagents**: none — solo lead work; bounded content-placement
  task with generic reducer reuse, low risk, straightforward to do
  directly rather than delegate.
- **Next three ordered milestones**:
  1. Land the still-open Stewardship browser-acceptance evidence (see
     previous checkpoint) — needs a genuinely interactive session.
  2. Continue Priority 2: merchants are the next-largest raw economy gap
     (5/15) — add regional merchants to Acts II–V's remaining maps
     (each act's hub already has one shop; satellite maps like
     `breakwater-road`, `nereid-caves`, `winter-orchard`, `bronze-foundry`,
     `atlas-vault`, `night-stair`, `false-constellation` have none), or
     push banks from 5→8 by adding 1–2 more per region to satellite maps
     using the same verified-placement method as this checkpoint.
  3. Continue Priority 1: close a second skill loop (see previous
     checkpoint's milestone 2).

## Recovery checkpoint — 2026-09-02T14:5x (turnover hour ~1)

- **Branch**: `codex/oathbearer-complete-game`. Prior HEAD `f405728`
  (regional banks, pushed).
- **This checkpoint**: continued Priority 2 (economy). While scoping the
  next merchant, discovered two real content-integrity gaps that
  `validateRPGContent()` doesn't catch because it only checks that an
  ingredient is obtainable *somewhere in the whole game*, never that a
  recipe's *station* is reachable at the act where its level gate first
  makes it available:
  1. **tin-ore** (needed by the level-2 Alloy Bronze Bar recipe) only
     existed on a level-5 Act II resource node — bronze-bar was
     unreachable for the whole of Act I despite its level-2 gate.
  2. **iron-ore** (needed by all five level-15 iron-tier tool recipes —
     iron-quarry-pick, iron-herb-sickle, iron-felling-axe,
     iron-fishing-rod, iron-hoe) only existed on a single Act IV resource
     node — the entire iron tier was unreachable until Act IV regardless
     of bronzework level.
  3. **The much bigger one**: `bronze-forge` itself — required by *all
     21* bronzework recipes, including every level-1 one — was only
     physically accessible at the Act IV Bronze Foundry
     (`CRAFTING_PLACEMENT['bronze-forge'].mapIds` was `['bronze-foundry']`
     only). The entire bronzework skill was structurally unreachable for
     three-quarters of the game.
  Fixed all three:
  - Added Philyra's Roadside Stall (`olive-road-trader` shop, Act I) —
    sells tin-ore, with full `act1Authoring` metadata.
  - Added Straton's Garrison Stores (`anchorage-garrison-quartermaster`
    shop, Act II `storm-anchorage`) — sells iron-ore, with full
    `act2Authoring` metadata.
  - Widened `bronze-forge`'s `mapIds` to `['beacon-overlook',
    'bronze-foundry']` and placed a matching physical `beacon-bronze-forge`
    station entity at Beacon Overlook (Act I), with `act1Authoring`
    metadata explaining exactly why (closes the structural-unreachability
    gap, not decoration).
  - All three placements verified with the same throwaway-probe-script
    method as the regional-banks checkpoint before any coordinate was
    chosen (never committed).
- **Discovered mid-checkpoint that shop-kind entities are structurally
  excluded from the authored-depth report**: `act1RecordKeys()` /
  `act2RecordKeys()` / `contentValidation.js`'s own `collectRecords` all
  explicitly skip `kind === 'shop'` entities — merchant "authoring" is
  tracked separately as one record per `SHOP_DEFS` entry (`shops.<id>`),
  and none of the 7 existing `SHOP_DEFS` entries (the 5 original plus my
  2 new ones) carry `authoring` metadata — matching the turnover's own
  "merchants remain legacy" statement. The `authoring:` fields I added
  to Philyra's and Straton's physical entity placements are therefore
  inert for the release-ready count (harmless, accurate prose, just not
  load-bearing) — only the new `beacon-bronze-forge` *station* entity
  (not shop-kind) actually became release-ready. Recording this so a
  future session doesn't re-discover it the hard way: authoring
  merchants for real would mean adding `authoring` to the `SHOP_DEFS`
  entries themselves, a distinct, not-yet-started piece of work.
- **Existing tests fixed, not papered over**: six pre-existing tests
  across four files (`rpg-regional-resources`, `rpg-save-systems-
  reliability`, `rpg-systems-integration`, `rpg-systems-panel` ×2) had
  encoded the old "bronze-forge only exists at bronze-foundry" fact as
  their test premise — using Beacon Overlook as their "remote/stale
  station" fixture. Each was fixed to either use a genuinely-still-
  remote map (`olive-road`) or a genuinely-still-remote *station*
  (`alchemy-lab`) instead, and one structural assumption
  (`rpg-regional-resources.test.js` asserted exactly one physical
  placement per station type) was corrected to allow a station having
  more than one physical placement, which is now a real and correct
  possibility.
- **Content-integrity fallout reconciled** (same shape as every prior
  checkpoint): `shops`/`shopPlacements` 5→7, `stationPlacements` 9→10;
  Act I records 29→30 (only the new forge station counts — Philyra's
  shop entity is excluded, see above), Act II records 54→55 (Straton's
  authored entity); whole-registry total 298→301, legacy 214→216 (+2 for
  the two unauthored merchant shop records), release-ready 84→85 (+1 for
  Straton's authored Act II entity — the Act I forge's own release-ready
  count is already folded into the 29→30 delta above); recomputed Act II
  behavior digest (new gameplay data, not authoring-only).
  `FULL-GAME-CONTRACT.md` merchants and authoring-readiness rows updated
  to match.
- **New test file**: `test/rpg-economy-gap-closures.test.js` (9 tests) —
  placement/reachability/distinctness for both new merchants, zero new
  content-validation errors, real `SHOP_BUY` purchases through the
  reducer, `bronze-forge` access-policy and physical-placement checks,
  every bronzework recipe now has a physically reachable Act I station,
  and — the crucial one — a full real-reducer playthrough proving the
  exact gap closure: gather copper-ore for free at Beacon Overlook, buy
  tin-ore at Olive Road, travel back to Beacon Overlook, open the new
  forge, and successfully craft Alloy Bronze Bar.
- **Verification evidence**:
  - Full suite: `npm run test:oathbearer` → **996/996 passed** (76
    files, up from 987/75).
  - `npm run build` → succeeded.
  - `npm run report:oathbearer:complete` → correctly remains **BLOCKED**;
    `merchants` 5→7.
  - `git diff --check` → clean.
  - No browser-acceptance evidence attempted this checkpoint — same
    reasoning as the regional-banks checkpoint (pure backend/content
    work, fully covered by the real-reducer integration test above); a
    live pass through Philyra/Straton/the new forge is still worth doing
    whenever an interactive session is available.
- **Active subagents**: none — solo lead work; discovered mid-flight
  during a bounded merchant-placement task, stayed in scope by fixing
  exactly the gap found plus its test fallout, nothing more.
- **Next three ordered milestones**:
  1. Land the still-open Stewardship browser-acceptance evidence.
  2. Continue Priority 2: merchants 7/15, banks 5/8 remain the largest
     raw economy gaps. Worth auditing other skills' stations the same
     way bronze-forge was just audited — `woodwork-bench` (carpentry),
     `hearth`/`kiln` (cooking), `shipwright`, `field-kitchen`,
     `shrine-fire`, `alchemy-lab`, `loom` — for the same "station
     reachable later than its lowest-level recipe" pattern before
     assuming they're fine.
  3. Continue Priority 1: close a second skill loop.

## Recovery checkpoint — 2026-09-02T15:0x (turnover hour ~1)

- **Branch**: `codex/oathbearer-complete-game`. Prior HEAD `e906ac1`
  (bronze-forge/tin-ore/iron-ore gap closures, pushed).
- **This checkpoint**: acted immediately on the previous checkpoint's own
  milestone 2 — audited every one of the 9 crafting stations (not just
  bronze-forge) for the same "station reachable later than its lowest-
  level recipe" pattern with a throwaway probe script comparing each
  station's earliest-available map against its lowest-level recipe.
  Findings:
  - `woodwork-bench`, `field-kitchen` — already fine (level-1 recipe,
    Act I station).
  - `shipwright`, `hearth`, `kiln`, `shrine-fire` — lowest-level recipe
    is high enough (level 12–30) that the player would plausibly already
    be in a later act by the time it matters; not an urgent structural
    gap, left alone.
  - `alchemy-lab` — a second real gap, same shape as bronze-forge: all
    three of alchemy's recipes (including the level-1 one) use
    alchemy-lab, which was only physically accessible at Act III's Kore
    Sanctuary. The entire alchemy skill was 100% non-functional for the
    first two-fifths of the game.
  - `loom` — **investigated and deliberately left alone.** Its physical
    entity is literally named "Restored Covenant Loom," reachable only
    after two Act V story flags (`act5-time-fractures-crossed`,
    `act5-epithets-restored`) and framed narratively as a
    just-unlocked, one-of-a-kind location. This is genuine intentional
    narrative gating, not an oversight — the opposite of bronze-forge's
    and alchemy-lab's case, where no such justification exists.
    Recording the distinction explicitly so a future pass doesn't
    "fix" this one by mistake.
  - Fixed alchemy-lab exactly like bronze-forge: widened
    `CRAFTING_PLACEMENT['alchemy-lab'].mapIds` to
    `['beacon-overlook', 'kore-sanctuary']`, added a physical
    `beacon-alchemy-bench` station entity at Beacon Overlook with full
    `act1Authoring` metadata, verified reachability with the same
    probe-script method (never committed).
  - Reconciled the identical class of test fallout as bronze-forge: one
    more `craftingStationMaps('alchemy-lab')` hardcoded assertion in
    `rpg-system-access.test.js`, and the `rpg-systems-panel.test.jsx`
    "remote stations" test — which I had just repointed at `alchemy-lab`
    as its stand-in remote station during the previous checkpoint's
    fallout fixes — needed repointing again, this time to `hearth`,
    since alchemy-lab is no longer remote from Beacon Overlook either.
  - Extended `test/rpg-economy-gap-closures.test.js` (now 13 tests, up
    from 9) with the same coverage shape for alchemy-lab: access-policy
    and physical-placement checks, every alchemy recipe now has a
    reachable Act I station, and a full real-reducer playthrough (dry
    herbs at Beacon Overlook with zero travel) proving the closure.
  - Content-integrity fallout: `stationPlacements` 10→11, Act I records
    30→31, whole-registry total 301→302, legacy unchanged 216,
    release-ready 85→86. `FULL-GAME-CONTRACT.md` authoring-readiness row
    updated to match.
- **Verification evidence**:
  - Full suite: `npm run test:oathbearer` → **1000/1000 passed** (76
    files, up from 996/76).
  - `npm run build` → succeeded.
  - `npm run report:oathbearer:complete` → correctly remains **BLOCKED**.
  - `git diff --check` → clean.
  - No browser-acceptance evidence attempted — same reasoning as the
    prior two checkpoints (pure backend/content work fully covered by
    the real-reducer integration test).
- **Active subagents**: none — solo lead work, direct continuation of
  the prior checkpoint's own recorded next step.
- **Next three ordered milestones**:
  1. Land the still-open Stewardship browser-acceptance evidence.
  2. Priority 2: merchants 7/15, banks 5/8 remain the largest raw
     economy gaps. The station-reachability audit is now complete for
     all 9 crafting stations — no more of that particular class of gap
     is known to remain (`loom` is confirmed intentional).
  3. Priority 1: close a second skill loop — Stewardship is currently
     Act I-only with one node; extending it into Act II/III toward a
     full multi-tier curve (matching Fishing/Quarrying/Foraging/
     Woodcutting) is probably higher-value than starting a brand-new
     22nd skill from scratch.

## Recovery checkpoint — 2026-09-02T15:1x (turnover hour ~1)

- **Branch**: `codex/oathbearer-complete-game`. Prior HEAD `bffd663`
  (crafting-station audit + alchemy-lab fix, pushed).
- **This checkpoint**: acted on the previous checkpoint's own milestone
  3 — gave Stewardship a real second tier instead of leaving it a
  single-node skill, the same way Fishing/Quarrying/Foraging/Woodcutting
  already have multi-tier curves.
  - New Pelagos Harbor (Act II) node: `steward-salt-garden` — a
    salt-damaged civic garden. Restoring it costs 3 `water-cask`
    (a new material, purchasable from Thaleia's chandlery — a
    deliberately different restore-cost material from tier 1's compost,
    so the loop doesn't feel like a reskin) instead of compost, framed
    as leaching salted soil with fresh water (a real Mediterranean
    agricultural technique). Restore level 15, tend level 20, yields a
    new crop item `sea-fig` (also sellable back to Thaleia — closes the
    trade loop, matching tier 1's pattern).
  - Reused every existing mechanism with zero reducer changes: the same
    `RESTORE_LAND`/`requiresFlag`-gated `GATHER` contract built for tier
    1, and the existing bronze-hoe/iron-hoe tool bonus applies
    automatically (it's keyed generically on `resource.skillId ===
    'stewardship'`, not on a specific node) — proven live in the new
    test suite (iron-hoe grants the tier-2 yield bonus on the new node
    with no code changes needed).
  - Placement verified with the same throwaway-probe-script method as
    every prior placement checkpoint (never committed): reachable from
    all 4 Pelagos Harbor spawns across the full Act II tide cycle.
  - Added full `act2Authoring` metadata to the new resource entity
    (Act II still has its authoring-readiness contract, unlike Acts
    III–V).
  - New test file `test/rpg-stewardship-act2-expansion.test.js` (15
    tests): item registration/obtainability, placement/reachability/
    distinctness, `RESTORE_LAND` level-gate/atomicity/exact-once at the
    new tier, `GATHER` before/after restoration including the
    cross-tier tool-bonus proof, and both economy interactions (buy
    water-cask/sell sea-fig at Thaleia's, deposit/withdraw at the
    Pelagos Storehouse).
  - **One genuinely different test fix, not just a count bump**:
    `rpg-regional-economy.test.js` has a `CRAFTED_SINK_ITEMS` fixed list
    asserting the four regional-hub shops' listings match *exactly* the
    set of crafted-recipe outputs that need a trade sink. `water-cask`
    (a raw purchasable material) and `sea-fig` (a gathered resource, not
    a crafted output) legitimately don't belong in that list — they're
    a different kind of listing serving a different purpose. Rather than
    stuff them into `CRAFTED_SINK_ITEMS` and blur what that list means,
    added a small `NON_CRAFTED_STEWARDSHIP_LISTINGS` allowlist and
    asserted both properties separately: the crafted-sink set is still
    exactly what it was, and the two new listings are present too.
  - Reconciled the same class of content-integrity fallout as every
    prior placement checkpoint: `resources` 22→23 + new sorted ID;
    Act II records 55→56; whole-registry total 302→303, legacy
    unchanged 216, release-ready 86→87; recomputed Act II behavior
    digest. `FULL-GAME-CONTRACT.md` resource-nodes and
    authoring-readiness rows updated.
- **Verification evidence**:
  - Full suite: `npm run test:oathbearer` → **1015/1015 passed** (77
    files, up from 1000/76).
  - `npm run build` → succeeded.
  - `npm run report:oathbearer:complete` → correctly remains **BLOCKED**;
    `resourceNodes` 22→23, `items` 83→85.
  - `git diff --check` → clean.
  - No browser-acceptance evidence attempted — same reasoning as every
    checkpoint since the Stewardship tier-1 one: pure backend/content
    work with an already-proven UI wiring pattern (the tier-1 checkpoint
    already verified the restore/tend label logic live against the
    production build), fully covered by the real-reducer integration
    tests above.
- **Active subagents**: none — solo lead work, direct continuation of
  the prior checkpoint's own recorded next step.
- **Next three ordered milestones**:
  1. Land the still-open Stewardship browser-acceptance evidence — this
     is now the single most valuable open item, since two full tiers of
     reducer/economy logic are verified but zero minutes of actual human
     or live-browser play have confirmed the loop feels right.
  2. Priority 2: merchants 7/15, banks 5/8. Stewardship's tier-2 node
     added `sea-fig`/`water-cask` to an *existing* shop rather than a
     new one, so the merchant count didn't move this checkpoint — a
     genuinely new merchant is still the more direct way to close that
     specific gap further.
  3. Priority 1: Stewardship could go to a third tier (Act III/IV), or
     a different skill (e.g. Hearthkeeping, Alchemy, or Weaving) could
     get its own first real loop — Stewardship having 2/5 plausible
     tiers is a reasonable place to pause that particular skill and
     spread coverage across more of the 22 before deepening one further.
