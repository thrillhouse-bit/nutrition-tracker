# Oathbearer Audit and Execution Roadmap

Audited: 2026-09-01
Scope: `/#control-tower-rpg`, the shared arena foundation, product contracts,
tests, assets, performance, accessibility, repository state, and release path.

## Executive verdict

Oathbearer is a **playable alpha with a complete five-act critical path**. It is
not the discarded floating-circle prototype: it has authored navigation,
dialogue, deterministic combat, persistent progression, inventory, banking,
crafting, wilderness risk, quests, five traversal-state systems, and a tested
ending. It is also **not yet a release-quality RuneScape-scale RPG or a
commercial Hades-density action game**. The remaining gap is primarily
production depth, presentation coverage, and repository/release discipline—not
the absence of a game loop.

## What exists now

| Surface | Audited implementation |
|---|---|
| Story | Five acts, one linear critical path, optional quests, mandatory Act V witness choice, and eligible ending selection |
| World | 5 regions and 23 registered maps with semantic targets, collision-aware pathfinding, safe spawns, and regional traversal states |
| Combat | 20 registered deterministic encounters, ready gate, keyboard/touch controls, powers, exact-once victory/defeat settlement, and checkpoint recovery |
| Character system | 22 gods, 24 mythology-grounded powers, 8 base monster archetypes, fixed Kallias protagonist |
| Progression | 22 skills using a stored-XP/derived-level 1–99 curve; quest and encounter rewards persist |
| Items | 56 item definitions, 28-slot carried inventory, 400-slot bank, protected death items, normalization, and exact quantities |
| Crafting | 24 recipes across 9 physically placed station types with atomic material consumption/output and XP |
| Wilderness | 5 named risk regions, deterministic enemies/loot, identity-bound encounters, recoverable defeat, and exact-once settlement |
| Presentation | Responsive HUD, dialogue portraits, Act I backplates/world sprites, code-rendered later regions, reduced motion, safe-area handling, and DPR/pixel budgets |
| Persistence | Schema-v1 validation, corrupt/future/unknown recovery, no mid-frame combat persistence, and boundary saves |

## Evidence captured during this audit

- Live browser: title and Beacon Overlook loaded at
  `http://127.0.0.1:5200/#control-tower-rpg`; semantic world controls were
  present and the rendered Act I environment matched the current art direction.
- Game-only suite initially exposed one invalid Act V Selene fixture that put a
  moon-lane interaction in shadow state. The fixture now uses the canonical moon
  arrival state and its isolated regression passes.
- Production build: 327 modules transformed; RPG JS 299.72 kB / 84.57 kB gzip;
  RPG CSS 25.88 kB / 5.83 kB gzip; PWA precache 17 entries / ~1.154 MB.
- Full repository suite before the fixture repair: 1559/1560 tests passed. The
  remaining failure is outside Oathbearer: `test/agent-surface.test.js` expects
  an obsolete endpoint to return 404 while the server now returns 200.
- `git diff --check` and direct RPG/game domain imports passed.
- Static premium audit of the whole parent application found 12 unrelated
  nutrition-app contract findings. Oathbearer now has a scoped manifest so its
  own UI can be audited without conflating those surfaces.

## Risk-ranked findings

### P0 — release integrity

1. The RPG implementation, tests, contracts, and assets are currently untracked
   in Git. A clean checkout at the branch HEAD does not contain the playable
   game. This is the highest release risk.
2. Progress and systems documents described Acts II–V, crafting, and wilderness
   as pending after those systems had already shipped. Stale contracts make
   future agent work unsafe.
3. Four unused `* 2.*` files preserved older implementations beside canonical
   files. Nothing imports them; they invite accidental edits and false audits.
4. The parent package had no one-command Oathbearer verification surface.

### P1 — playable-alpha completeness

1. Equipment has a stable 11-slot schema but no complete equip/unequip/compare
   interaction loop.
2. Food and crafted consumables render as items but lack a complete use/consume
   action and combat/world effect contract.
3. Combat XP is awarded at the encounter boundary rather than from real damage,
   defense, and patron-power use.
4. Banking and currency work, but shops, buying/selling, repair/supply sinks,
   and a sustainable value loop do not exist.
5. Five-act completion has strong reducer and browser evidence, but there is no
   automated browser journey or visual-regression baseline for the full route.

### P1 — presentation and content coverage

1. Authored raster world art covers two Act I maps only. Acts II–V are readable
   code-rendered maps, not art-complete regions.
2. Portrait art covers five named characters; world sprites cover Kallias,
   Thessa, and Amonides. The broader cast still uses code-rendered or text-led
   representation.
3. There is no implemented music, ambience, combat SFX, dialogue voicing, or
   accessible audio/subtitle cue system despite later-act content contracts
   referring to it.
4. Combat has meaningful effects and deterministic silhouettes, but animation,
   enemy-specific telegraphs, hit reactions, and environmental spectacle are
   still alpha-level relative to the intended high-impact action direction.

### P2 — maintainability and scale

1. `ControlTowerRPG.jsx` is over 2,100 lines and owns boot, persistence,
   movement, dialogue, combat, panels, overlays, and rendering orchestration.
2. `rpg/state.js` exceeds 1,200 lines; `renderer.js` exceeds 1,800 lines. These
   are workable today but high-conflict owners for parallel development.
3. The test suite logs repeated jsdom Canvas warnings, obscuring real failures.
4. Review screenshots/concepts total roughly 24 MB and need an explicit policy:
   version selected evidence, or keep generated review output outside source.

## Execution plan

### Phase 0 — trustworthy alpha baseline (current pass)

- Remove verified unused duplicate files.
- Repair the invalid Selene test fixture and run it in isolation and in the
  game suite.
- Add `test:oathbearer` and `verify:oathbearer` commands.
- Add a scoped premium UI manifest and refresh progress/system contracts.
- Preserve all existing gameplay and assets; do not commit, push, or deploy
  without explicit authority.

Exit gate: scoped static audit, game tests, production build, and diff check all
pass; Git status clearly distinguishes deliverable source from optional review
artifacts.

### Phase 1 — systems-complete alpha

1. Equipment equip/unequip/compare and stat effects.
2. Consumable use, food healing, and deterministic cooldown/effect rules.
3. Damage/defense/divine-use combat XP with exact-once encounter bonuses.
4. Settlement shops, buy/sell pricing, repair/supply sinks, and save migration.
5. Automated browser smoke for New Story, save/reload, craft/bank/wilderness,
   one boss, and completion recovery.

Exit gate: every carried item category has an honest action or explicitly says
it is inspect-only; currency has a repeatable source and sink; the browser smoke
is deterministic.

### Phase 2 — art and feel vertical upgrade

- Produce one art-complete representative map per remaining act before bulk
  generation; validate silhouette readability, interaction anchors, mobile
  crop, and performance.
- Complete recurring-character portraits/world sprites from a canonical
  character bible, then bosses and regional NPCs.
- Add a small original audio system: ambience, UI, melee/impact, patron cast,
  danger telegraph, victory/defeat, and subtitle equivalents.
- Split world, combat, dialogue, systems, and overlay orchestration out of the
  route component before several agents edit those areas in parallel.

Exit gate: Acts I–V share one visual grammar and each act has authored material,
lighting, NPC, enemy, and boss identity without proprietary imitation.

### Phase 3 — release candidate

- Full keyboard/touch/200% zoom/reduced-motion/browser matrix.
- Full save migration, corrupt-save, offline shell, and PWA route verification.
- Performance budgets on representative desktop and mobile hardware.
- Automated critical-path browser suite plus representative visual regression.
- Decide whether Oathbearer remains an embedded Body Current route or becomes a
  separately branded build; the current PWA manifest still belongs to Body Current.

## Deliberate non-goals

- No 1:1 copying of Hades, RuneScape, Assassin's Creed Odyssey, or their assets,
  UI, story, map layouts, terminology, or progression tables.
- No seamless continent, multiplayer, live-service economy, procedural quest
  filler, or hundreds of interchangeable items before the alpha loop is deep.
- No new paid model work until a bounded lane maps to one of the exit gates
  above and cannot be completed locally at lower cost.
