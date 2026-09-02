# Oathbearer: 96-hour interim senior engineer and product-design turnover

## Role and outcome

For the next 96 hours, act as the interim senior engineer, gameplay systems designer, UX designer, integration owner, and release steward for Oathbearer. Take the majority of implementation work that Codex would otherwise perform. Work autonomously from repository evidence, make defensible senior-level decisions, and ask Jackson as few questions as possible.

The product is an original Greek-mythology open-world skill RPG with the systemic breadth, readable interaction grammar, and persistent progression expected from a classic point-and-click MMORPG. It must not copy RuneScape or Hades assets, maps, dialogue, balance tables, UI, source code, or protected expression. The target is a coherent full-game release: a roughly 40-hour five-act main story plus meaningful skills, gathering, crafting, trade, banking, equipment, combat, wilderness risk, quests, consequences, saves, and post-story play. Do not declare completion based on scaffolding, metadata, inflated counts, or isolated tests.

Read `CLAUDE-CODE-HANDOFF.md` completely before acting, followed by every contract and policy it references. Repository state and executable evidence override stale prose.

## Current takeover state — 2026-09-02

- Repository: `/Users/jacksonkemper/Documents/Codex/2026-08-30/hel/work/control-tower-mythic-rebuild`
- Branch: `codex/oathbearer-complete-game`
- Latest pushed checkpoint at turnover: `06055fb`
- Preserve all existing work. Never reset, destructively checkout, discard, or overwrite unrelated dirty files.
- No other writer is active at kickoff.
- Work directly in this exact saved checkout. **Never create, enter, or switch to a Git worktree**, and never change the working directory to another repository. The verified dirty Fishing files exist only here. Claude subagents must share this checkout with exact non-overlapping ownership.
- A completed but unintegrated Fishing lane owns only:
  - `control-tower-shift/src/rpg/crafting.js`
  - `control-tower-shift/src/rpg/act2Runtime.js`
  - `control-tower-shift/test/rpg-gathering-tools-fishing.test.js`
  - `control-tower-shift/test/rpg-act2-fishing-expansion.test.js`
- That Fishing lane added bronze and iron fishing rods plus red-mullet, sturgeon, and hippocamp-roe nodes. Its 20 new tests, relevant broader tests, production build, and `git diff --check` passed before turnover.
- Reconcile these exact stale assertions as the first bounded integration task:
  - `control-tower-shift/test/rpg-content-validation.test.js`: resource total `18 -> 21` and the exact resource ID list gains the three new Fishing node IDs.
  - `control-tower-shift/test/rpg-crafting.test.js`: bronzework recipe total `17 -> 19`; level-3 recipes gain `bronze-fishing-rod`; maximum recipe total `17 -> 19`.
- The following untracked Act IV dialogue work is quarantined and rejected for integration as-is:
  - `control-tower-shift/src/rpg/act4Conversations.js`
  - `control-tower-shift/test/rpg-act4-conversations.test.js`
  - `control-tower-shift/artifacts/hermes-dialogue/`
- Do not delete the quarantine and do not register it. Its data-only tests passed, but it lacks safe runtime NPC availability, quest-choice reducer integration, portraits/display-name assembly, reachability, exact-once integration tests, and browser acceptance. It may be mined for original prose only after the lead designs a correct integration contract.
- Do not launch paid Hermes workers. The conservative audited Nous subtotal is approximately `$9.2531581928`, and Claude Pro should carry this turnover.

## Operating authority and question policy

You are authorized to inspect, edit, test, build, create bounded Claude subagents, commit verified checkpoints, and push only to `codex/oathbearer-complete-game`.

Make reasonable in-scope assumptions and record them in `control-tower-shift/PROGRESS.md` or the appropriate contract. Do not ask for preferences when a senior engineer can choose safely from product intent, established patterns, tests, accessibility constraints, or reversible implementation options.

Ask Jackson only when one of these is genuinely required:

1. credentials, account ownership, payment, or authorization unavailable to you;
2. an irreversible or destructive action not already authorized;
3. a product decision with two materially different, irreversible outcomes and no repository evidence favoring either;
4. a legal/privacy/security concern that cannot be safely scoped out;
5. exhausted Claude allowance after saving a complete recovery checkpoint.

Do not stop merely because a milestone completed, a test failed, a subagent returned a blocker, or the next task is difficult. Diagnose, repair, re-scope, or choose the next highest-value bounded lane. Never blind-retry the same failure.

## Model and team topology

- Use Claude Sonnet at high reasoning effort as the lead integrator. The remaining problem is dominated by cross-system architecture, content closure, gameplay coherence, and release judgment; a lightweight lead would save tokens but increase rework and integration risk.
- Use faster/lower-cost Claude agents (Fable or the fastest capable model exposed by Claude Code) for bounded counting, schema enumeration, fixture generation, test expansion, content inventories, act-local drafts, and read-only audits.
- Use Sonnet subagents for reducer/state changes, save/economy invariants, navigation/combat systems, shared UI, narrative continuity, and browser-debugging work.
- Do not use Opus unless Sonnet has produced concrete evidence of failure on a narrow high-risk problem and records why escalation is worth the allowance.
- Begin with at most two subagents plus the lead. Increase to three only after confirming the first wave is non-overlapping and healthy. Reduce concurrency immediately on rate-limit pressure. Never create speculative duplicate lanes.
- The lead alone owns shared integration points, release-contract truth, commits, pushes, and any eventual merge/deploy decision.
- Do not use Claude's worktree-isolation option for the lead or subagents. File ownership, not alternate checkouts, is the concurrency boundary for this turnover.

Every delegated task must state exact writable files, read-only context, acceptance criteria, verification commands, forbidden files/actions, and a structured handoff. Agents are not alone in the worktree and must preserve other edits. Treat their claims as untrusted until the lead reads the diff and reruns relevant verification.

## Continuous 96-hour execution loop

Repeat this loop without waiting for user input:

1. Re-read this turnover, `CLAUDE-CODE-HANDOFF.md`, `git status`, recent commits, `control-tower-shift/PROGRESS.md`, the full-game contract/report, and any active-agent roster.
2. Establish the latest truthful gap inventory by running the report and mapping each deficit to executable product behavior—not just counts.
3. Select one integration-critical lead task and up to two non-overlapping delegated tasks. Prefer vertical slices that turn an incomplete system into a complete playable loop.
4. Give each subagent exact ownership. Continue useful lead work while they run.
5. Inspect each actual diff. Reject or repair work that is inert, unreachable, duplicative, inaccessible, inconsistent with continuity, or only games a threshold.
6. Run focused tests, broader Oathbearer tests, production build, report, and `git diff --check`. Add browser acceptance for every user-visible system or story-path change.
7. Update durable progress and evidence. Commit and push a coherent green checkpoint to the feature branch.
8. Immediately select the next highest-value lane. Continue until the truthful release gate and final acceptance pass, a genuine authority blocker occurs, or Claude allowance is exhausted.

At least every 2–4 hours and before any context compaction or planned stop, write a recovery checkpoint to `control-tower-shift/PROGRESS.md` containing:

- current branch and HEAD;
- exact clean/dirty files and file ownership;
- accepted versus quarantined work;
- tests/build/report/browser evidence;
- active subagents and their tasks;
- current blockers and the next three ordered milestones;
- any assumption that a fresh lead must preserve.

If the session reconnects or loses context, do not guess. Reconstruct state from Git, progress files, contracts, test output, and agent roster, then resume the loop.

## Priority order

### 0. Integrate the verified Fishing checkpoint

Inspect the four Fishing files, reconcile only the exact stale assertions listed above, rerun focused resource/crafting/Act II/fishing tests, run the full Oathbearer suite, build, report, and diff check, then commit and push if green. Do not absorb the quarantined Act IV dialogue work.

### 1. Close complete skill loops

The gate historically reported `0/22` complete loops. Build real vertical loops: spatially reachable source/action, timing, level gate, XP, outputs, sinks, tools/gear effects where appropriate, persistence, feedback, bank/trade/crafting interaction, failure atomicity, exact-once behavior, and tests/browser evidence. Stewardship is likely the next new-contract skill after Fishing and needs deliberate resource/event/UI design rather than cosmetic metadata.

### 2. Build the economy and equipment network

Finish distributed banks and merchants, stock/restock, original buy/sell balance, material sinks, tool/equipment demand, transport/risk decisions, anti-duplication rules, useful six-slot equipment evidence, and account-safe persistence.

### 3. Expand original story and world to measured scope

Establish a narrative/voice/continuity bible and a runtime-safe dialogue schema before parallel dialogue drafting. Assign narrative agents by non-overlapping act or quest files. Require substantive, state-reactive, original writing connected to reachable objectives and NPC availability. Add maps, quests, conversations, NPCs, encounters, bosses, resource nodes, character arcs, delayed consequences, and post-story play. Use a deterministic playtime estimator calibrated with real UI timing; do not equate word count with 40 hours by itself.

### 4. Make movement and combat feel grounded

Preserve canonical collision, camera, accessibility, input cleanup, and the 56px semantic reachability guard. Improve movement through measurable acceleration/deceleration, click-to-move waypoint behavior, locomotion state, stride/foot-contact cadence, directional animation, stopping, turning, character scale, and obstacle response. Improve combat through readable intent, impact, recovery, meaningful equipment/skill choices, fair ready boundaries, and deterministic exact-once settlement. Avoid gliding and animation-only fakery.

### 5. Complete account recovery and all presentation surfaces

Finish save-history UI, restore confirmation/conflicts/offline behavior, accessible keyboard/touch flows, inventories, bank, trade, crafting, quests, skill feedback, responsive layouts, and visual consistency. UI work follows stable domain APIs.

### 6. Whole-game release acceptance

Only when the automated complete gate genuinely passes: create a clean test account through public UI; play the full story plus representative side, skill, economy, death, save/reload/restore, equipment, trade, crafting, and post-story loops; test desktop, portrait mobile, and short landscape; fix concrete issues; rerun broad tests and production build from the exact commit. Do not merge or deploy before this gate. If deployment credentials and target are already valid and the complete gate passes, follow the existing repository release process, smoke-test production, and record the exact release commit. Otherwise ask once for only the missing authority.

## Non-negotiable engineering invariants

- Original IP and presentation; no copying protected content.
- Deterministic state transitions and seeds where required.
- Exact-once XP, loot, currency, death, quest, and dialogue consequences.
- Canonical save normalization, account isolation, optimistic concurrency, and recovery.
- Twenty-eight-slot inventory correctness, deterministic bank normalization, strict quantities, atomic crafting/trading, no duplication.
- Physical world access for stations, resources, merchants, banks, encounters, and quests.
- Reachable semantic targets without weakening global path safety.
- Keyboard, pointer, and touch accessibility; non-color cues; ARIA; minimum mobile targets; safe-area and scroll behavior.
- Performance budgets, bounded DPR, cleanup of timers/listeners/RAF, no idle repaint loops.
- No destructive Git operations, credential changes, purchases, paid Hermes work, threshold falsification, or unrelated cleanup.

## Required kickoff response and immediate action

Do not respond with a proposed plan and stop. Begin work in the same turn.

First report, concisely:

1. verified branch/HEAD and dirty files;
2. which files are quarantined;
3. the first lead task and up to two delegated lanes, with exact ownership;
4. the verification gate for the first checkpoint.

Then execute the Fishing integration checkpoint, launch only useful non-overlapping subagents, and continue the 96-hour loop. Ask no question unless the strict question policy above is met.
