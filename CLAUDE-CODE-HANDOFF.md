# Oathbearer complete-game handoff to Claude Code

## Mission

Take primary ownership of completing **Oathbearer**, an original Greek-mythology open-world skill RPG with the legible interaction grammar and systemic depth of a classic point-and-click MMORPG. The player should feel grounded in the world rather than gliding, and the finished game must combine a measured roughly 40-hour five-act main story with persistent account saves, gathering, crafting, equipment, trade, banking, wilderness risk, combat progression, quests, and post-story play.

This is not a request to copy RuneScape or Hades assets, writing, characters, maps, UI, code, or proprietary balance tables. Match the breadth and clarity of the feature loops using original Oathbearer content and presentation.

Jackson wants the **full game completed as one coherent release**, not a succession of public partial releases. Work continuously and autonomously. Commit and push verified checkpoints to the existing feature branch, but do not merge or deploy until the complete-game release gate and final browser acceptance pass.

## Recommended operating model

Use **Claude Sonnet at high effort** as lead integrator. It is the recommended balance of coding reliability, context endurance, and Pro-plan usage. Use Opus only for a genuinely difficult architecture/reliability review after Sonnet has concrete evidence it cannot resolve the issue. Do not use Haiku for shared-state implementation; it is acceptable for narrow inventory/counting/read-only tasks.

Use multiple Claude Code agents aggressively where work is non-overlapping. The lead agent remains the only integration owner.

Suggested topology:

1. **Lead integrator** — owns shared registries, reducer integration, `ControlTowerRPG.jsx`, cross-lane tests, commits, and push decisions.
2. **Systems/economy agent** — owns bounded domain modules and tests for trading, merchants, skills, recipes, equipment, resource nodes, bank, death/risk, and progression. Never edits shared UI or registry without a lead-approved handoff.
3. **Narrative/content agents** — one act per agent with exact ownership (`act3*`, `act4*`, `act5*` and act-local tests). They add original release-ready metadata and substantive story/content; they do not touch shared registry/state unless the lead integrates their handoff.
4. **Gameplay/presentation agent** — only after domain APIs are stable; owns bounded UI/CSS/tests for interaction feel, movement animation, combat affordances, responsive behavior, and accessible cues.
5. **Read-only QA agent** — audits every concrete integration for reachability, exact-once settlement, save normalization, content closure, responsive/browser behavior, and release-gate truthfulness. It makes no edits unless reassigned a bounded repair.

Never allow two agents to edit the same files concurrently. Each agent must report exact changed files, tests, blockers, and one next task. Treat every agent claim as untrusted until the lead reviews the actual diff and reruns relevant tests.

## Repository and branch

- Repository: `/Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/control-tower-mythic-rebuild`
- Branch: `codex/oathbearer-complete-game`
- Latest pushed checkpoint at handoff: `dcc4634` (`feat(oathbearer): add account saves and usable consumables`)
- Previous complete-game foundation checkpoint: `62cc9af`
- Remote feature branch already exists.
- The worktree is intentionally dirty with a second integration wave. Preserve all of it; do not reset, checkout over, stash destructively, or discard changes.

Before acting, read completely:

- `control-tower-shift/FULL-GAME-CONTRACT.md`
- `control-tower-shift/full-game-release.json`
- `scripts/verify-oathbearer-complete-game.mjs`
- `/Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/HERMES-CODEX-HANDOFF-PROTOCOL.md`
- `/Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/HERMES-SPEND-POLICY.md`

The Nous subtotal was `$9.1559148264` at handoff. No further paid Hermes work is needed for this transition. Claude Pro-plan agents should carry the load. Do not buy credits, redeem resets, or alter credentials.

## Pushed baseline already accepted

The `dcc4634` checkpoint includes:

- Authenticated RPG account gate on the production hash route.
- Authenticated per-user GET/PUT RPG save API with optimistic concurrency.
- Remote-first account boot, same-account offline cache, serial/coalesced writes, explicit conflict resolution, and explicit legacy import.
- Consumable foods and pre-encounter salve/tonic/blessing behavior with exact-once boundaries.
- Five-act story that is traversable through public UI, safe Act V light-polarity topology, deterministic combat, physical map-bound crafting/wilderness access, bank/inventory/crafting systems, and responsive/camera/performance work.
- Act I release-ready authoring metadata.
- Complete-game contract/reporting that intentionally fails while the content and evidence remain below target.

Last pushed verification evidence:

- Oathbearer tests: 855/855 passed.
- Relevant server/API/store tests: 262/262 passed.
- Production build passed.
- Strict UI audit: zero findings.
- `git diff --check` passed.
- Complete gate correctly remained blocked.

## Dirty integration wave at handoff

Run `git status --short` and inspect every diff before editing. The dirty worktree contains four lanes.

### 1. Account save history/restore — implementation complete, pending lead verification

Changed files:

- `schema.sql`
- `server/db.js`
- `server/index.js`
- `server/rpgSave.js`
- `src/api/client.js`
- `test/rpg-account-save-api.test.js`
- new `test/rpg-account-save-history.test.js`

Intended behavior:

- Metadata-only GET `/api/rpg/save/history`.
- Exact-body POST `/api/rpg/save/restore` with `{revision, expectedRevision}`.
- Same-account historical restore creates a new monotonic revision.
- Successful non-idempotent writes/restores append history atomically; stale/idempotent requests append nothing.
- Latest 20 entries only.
- Export includes account-owned history payloads; account deletion removes history.
- Both PgStore and JsonStore implementations.

Audit PostgreSQL CTE pruning/order, cross-account isolation, concurrency, idempotence, export privacy, and JSON serialization. Rerun focused API/store tests before accepting.

### 2. Six-slot, three-tier equipment ladder — implementation complete, pending lead verification

Changed files:

- `control-tower-shift/src/rpg/crafting.js`
- `control-tower-shift/src/rpg/equipment.js`
- `control-tower-shift/test/rpg-crafting.test.js`
- new `control-tower-shift/test/rpg-equipment-ladder.test.js`

Intended behavior:

- Weapon, head, body, offhand, legs, feet.
- Three strictly stronger tiers per slot.
- Fifteen new items/recipes plus existing starter pieces.
- Explicit combat modifiers and legitimate obtainable ingredient closure.

Audit recipe/source reachability, station/level ordering, inventory capacity, public craft/equip contracts, non-circular intermediates, and actual combat modifier consumption. Do not count the release evidence as complete until browser/user-visible equip/craft behavior is proven.

### 3. Act II authoring retrofit — implementation complete, pending aggregate reconciliation

Changed files:

- `control-tower-shift/src/rpg/act2Content.js`
- `control-tower-shift/src/rpg/act2Runtime.js`
- metadata-only edit in `control-tower-shift/src/rpg/registry.js`
- new `control-tower-shift/test/rpg-act2-authoring-readiness.test.js`

Exact claimed delta:

- Release-ready: 28 -> 79.
- Legacy: 254 -> 203.
- Incomplete: 0.
- Total: 282.
- Act II adds 2 quests, 11 objectives, 1 conversation, 5 maps, 25 entities, 2 resources, 5 encounters.

The new test includes a SHA-256 digest proving non-authoring Act II behavior stayed unchanged. Reconcile stale aggregate count assertions and update the contract only after independent verification. Acts III–V and merchants remain legacy.

### 4. Action-derived combat progression and Guard — partially integrated

Changed/new files:

- new `control-tower-shift/src/rpg/combatProgression.js`
- `control-tower-shift/src/rpg/combatAdapter.js`
- `control-tower-shift/src/rpg/state.js`
- `control-tower-shift/src/ControlTowerRPG.jsx`
- new `control-tower-shift/test/rpg-combat-progression.test.js`

Already implemented:

- Observed enemy-health loss is attributed to actual attack, firing, or patron-power input.
- Offensive contribution maps to spearcraft/might, marksmanship, or stormcalling.
- Story combat no longer pays the old fixed act-wide XP bundle.
- Session telemetry records `damageByStyle`, `damageTaken`, and `guardedDamageTaken`.
- Holding Guard reduces threat damage to 55% for the frame, then restores config.
- UI has a held Guard button and keyboard `G`; help copy is updated.
- Story and wilderness outcome dispatch now carry `combatContributions`.

Immediate unfinished work:

1. Finish `wildernessCombatRewards` so XP is contribution-derived rather than granting unused styles. Preserve loot/currency. Suggested contract:
   - spear damage trains spearcraft and might;
   - ranged damage trains marksmanship;
   - patron power damage trains stormcalling;
   - guarded damage actually taken trains guard;
   - total damage actually taken trains vitality;
   - enemy-authored XP values are caps;
   - zero contribution means zero XP for that skill.
2. Pass `event.combatContributions` from `wildernessVictory` into reward calculation.
3. Add adapter integration tests proving `stepCombat` accumulates real telemetry and Guard changes actual incoming damage without permanently mutating config.
4. Extend UI tests for pre-Begin disabled Guard, held pointer behavior, keyboard key-up, blur/unmount cleanup, and accessible label.
5. Update the combat progression test to assert `combatContributions` at reducer settlement; retain compatibility only where genuinely needed.

Important: a multi-file patch for wilderness rewards was attempted immediately before this handoff and **failed verification before applying**. Do not assume any wilderness reward changes landed. Inspect the current diff.

Previously focused combat verification before the final Guard extension was 89/89 passing across combat progression, systems integration, RPG UI, wilderness, and five-act tests.

## Immediate integration sequence

1. Inspect all dirty diffs and active processes. Confirm no other writer is running.
2. Finish and test action-derived Guard/wilderness progression.
3. Independently verify save history, equipment, and Act II authoring lanes.
4. Fix only concrete integration defects; preserve unrelated changes.
5. Reconcile authoring aggregate counts and update `FULL-GAME-CONTRACT.md` truthfully.
6. Run:

   ```bash
   npm run test:oathbearer
   npx vitest run test/rpg-account-save-api.test.js test/rpg-account-save-history.test.js
   npm run build
   npm run report:oathbearer:complete
   git diff --check
   ```

7. If green, commit one coherent checkpoint and push only `codex/oathbearer-complete-game`.
8. Do not merge or deploy. The report is expected to remain blocked.

## Complete-game targets and truthful gate

The last pushed report was intentionally far below release scope:

- Complete skill loops: 0/22.
- Items: 56/200.
- Recipes: 24/100.
- Maps: 23/60.
- Quests: 10/70 (main 5/20, side 5/35, character 0/10, mastery 0/5).
- Dialogue words: 927/50,000.
- Conversations: 15/60.
- Encounters: 20/80; bosses 5/12.
- Named NPCs: 16/60.
- Resource nodes: 10/150.
- Merchants: 5/15; banks 1/8.
- Useful equipment-slot evidence: 0/6.
- Reactive world consequences: 0/20; delayed consequences: 0/8.

The equipment lane will raise catalog counts, and Act II metadata will reduce authoring warnings, but neither makes the full-game gate pass. Never fabricate `full-game-release.json` evidence or lower thresholds to obtain green. Evidence must point to executable tests, measured content, or human/browser acceptance.

## High-level completion roadmap after the dirty wave

Parallelize only non-overlapping work and integrate one verified wave at a time.

### A. Finish all 22 skill loops

Each skill needs original world sources, readable interaction, deterministic action duration, level gate, XP curve, outputs, sinks, tool/gear effects where appropriate, persistence, UI feedback, and tests. No inert skill tiles.

### B. Build the economy and trade network

Add spatially distributed banks and merchants, stock/restock, buy/sell spreads, item sinks, transport/risk decisions, equipment and consumable demand, anti-duplication invariants, and browser acceptance. Keep the economy original; do not copy proprietary tables.

### C. Expand original content to the measured target

Use one act-local content agent at a time or separate non-overlapping acts. Add substantive quests, conversations, NPCs, maps, encounters, resource nodes, character arcs, optional discovery, delayed consequences, and post-story content. Metadata alone does not count as story length. Build a deterministic playtime estimator and calibrate it with browser/human timing evidence toward roughly 40 hours.

### D. Improve grounded movement and combat feel

Preserve the existing locomotion primitive, animation cadence, collision/pathfinding, camera projection, semantic 56px target guard, input cleanup, and performance policies. Diagnose perceived gliding using measurable acceleration/deceleration, stride/foot-contact timing, waypoint stopping, sprite scale, and collision response. Do not “fix” feel by weakening reachability or accessibility guards.

### E. Account lifecycle and recovery UI

After the save-history backend is accepted, add a user-visible restore-point UI with metadata, confirmation, conflict handling, offline behavior, keyboard/screen-reader support, and tests. Never expose another account’s payload.

### F. Whole-game acceptance and release

Only after the automated complete gate passes:

- Create a clean test account.
- Play the complete main story and representative side/skill/economy loops through public UI.
- Verify save/reload, restore history, offline recovery, death, bank, trade, crafting, equipment, every control mode, mobile/landscape/desktop, and all five acts.
- Record exact human/browser evidence in the release manifest.
- Run the broad repository suite; the historical unrelated `agent-surface` obsolete 404 expectation may be triaged separately only if still demonstrably unrelated.
- Build production from the exact commit, push it, then merge and deploy once.
- Smoke-test the deployed account flow and game at the production URL.

## Safety and quality rules

- Preserve user work and unrelated dirty changes.
- No destructive Git commands.
- Use `rg`/`rg --files` for discovery and `apply_patch`/Edit for deliberate changes.
- No blind retries, speculative duplicate agents, credential edits, purchases, or scope expansion.
- No merge/deploy until the complete gate and final acceptance are genuinely green.
- Keep accessibility: keyboard, pointer/touch, non-color cues, ARIA, 44px mobile targets, scroll/safe-area behavior.
- Keep deterministic seeds, exact-once XP/reward/death settlement, 28-slot inventory invariants, bank normalization, physical system access, and save conflict semantics.
- For every checkpoint: inspect diff, focused tests, whole Oathbearer suite, production build, report, and diff check before commit/push.

## First prompt for the lead Claude session

Read this handoff completely, then read every referenced contract/policy file. Inspect the branch and dirty worktree; repository evidence overrides this narrative. Use multiple non-overlapping Claude Code agents where they materially accelerate the work, with exact file ownership and structured handoffs. First finish and independently verify the four dirty integration lanes, commit and push one green checkpoint to `codex/oathbearer-complete-game`, then continue autonomously through the complete-game roadmap. Do not merge or deploy until the truthful complete-game gate and public-UI acceptance pass. Stop only for a genuine authority/credential blocker, destructive ambiguity, or exhausted Claude allowance; otherwise keep selecting and completing the highest-value bounded milestone.
