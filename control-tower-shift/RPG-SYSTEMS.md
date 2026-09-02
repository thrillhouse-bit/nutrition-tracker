# Oathbearer RPG Systems Contract

> Release scope is governed by [FULL-GAME-CONTRACT.md](./FULL-GAME-CONTRACT.md).
> This document describes implemented system behavior; a green subsystem does
> not authorize a partial Oathbearer release. Run
> `npm run report:oathbearer:complete` for the current whole-game gap report.

> Release scope is governed by [FULL-GAME-CONTRACT.md](./FULL-GAME-CONTRACT.md).
> This document describes implemented system behavior; a green subsystem does
> not authorize a partial Oathbearer release. Run
> `npm run report:oathbearer:complete` for the current whole-game gap report.

## Direction

Oathbearer uses the durable interaction and progression grammar of a classic point-and-click skill RPG inside an original Greek-mythology world. Mechanical familiarity is the goal; names, worldbuilding, quests, maps, characters, art, audio, prose, and interface composition remain original.

The game is not an arena-wave game. It is a persistent character RPG built from authored regions, settlements, wilderness routes, resource sites, dungeons, quests, and bosses.

## Parity map

| System | Oathbearer contract | Current status |
|---|---|---|
| World interaction | Click ground to pathfind; click a semantic person, resource, enemy, object, or gate to approach and act; keyboard/touch alternatives remain available | Accepted across the five-act public-UI playthrough |
| Skill progression | 22 independent skills, levels 1–99, classic accelerating XP curve, unlock requirements, total level and total XP | Foundation implemented |
| Inventory | 28 physical slots; ordinary materials and food consume one slot each; explicitly stackable currencies/ammunition stack | Foundation implemented |
| Equipment | 11 stable slots; the Oath-Spear is Kallias's primary weapon and lightning occupies the divine/off-hand combat role | Equip/unequip, persistent empty slots, combat damage/resilience, and craftable Cypress Helm implemented |
| Bank | Persistent 400-slot material bank accessed from authored settlements and sanctuaries | Beacon Storehouse deposit/withdraw accepted in live browser |
| Quest journal | Main and side oaths, ordered objectives, explicit rewards, completion state, region prerequisites | Implemented over the five-act quest registry |
| Quest XP | Main and side oaths grant deterministic Oathkeeping and Wayfinding XP exactly once | Implemented |
| Combat XP | Accepted encounters grant Spearcraft, Might, Guard, Vitality, and Stormcalling XP exactly once | Implemented at victory boundary; per-action allocation pending |
| Gathering | Quarrying, Woodcutting, Fishing, Foraging, and Stewardship nodes use level gates, finite interaction time, inventory capacity, deterministic XP/yields, depletion, and play-tick renewal | Renewable node state, exact-once yield/XP, save normalization, and depleted target feedback implemented |
| Production | Bronzework, Carpentry, Cooking, Alchemy, Weaving, and Hearthkeeping transform carried or explicitly local-banked materials through level-gated recipes | 24 recipes, 9 placed station types, carried-first provenance, atomic settlement, and local-Storehouse opt-in implemented |
| Wilderness | Named risk bands outside civic sanctuaries; stronger enemies and rarer materials with recoverable death drops and protected equipment | Five regions implemented with deterministic encounters, loot, protected items, and recoverable defeat |
| Economy | Drachmae, shops, value bands, repair/supply sinks, bank deposit/withdraw, material exchange without real-money monetization | Currency exists; full loop pending |
| Open-world structure | Settlements act as safe hubs; roads and wilderness connect authored regions; quests and skill checks unlock routes rather than waves | Five regions / 23 maps and the full critical path are playable; optional systemic density remains alpha-level |

## Skills

Combat: Spearcraft, Might, Guard, Vitality, Marksmanship.

Divine: Stormcalling, Devotion, Oathkeeping.

Gathering: Quarrying, Woodcutting, Fishing, Foraging, Stewardship.

Artisan: Bronzework, Carpentry, Cooking, Alchemy, Weaving, Hearthkeeping.

World: Wayfinding, Guile, Beastbond.

Every skill begins at level 1. XP is stored, never a mutable displayed level. The displayed level is derived from the canonical XP curve; level 99 begins at 13,034,431 XP.

## Material ladder

- Ore and metal: copper + tin → bronze, iron, silver, celestial bronze, orichalcum.
- Timber: olive, cypress, cedar, laurel, ambrosial ash.
- Fish: sardine, red mullet, tuna, sturgeon, hippocamp roe.
- Herbs: thyme, sage, asphodel, moly, ambrosia bloom.
- Future regional layers add hides, fibers, gems, essences, food, and boss components without replacing lower-tier utility.

## Progression rules

1. Performing a skill action grants that skill's XP when the action resolves, not when it begins.
2. Combat XP is derived from real damage, defense, divine-power use, and encounter completion. The current victory-boundary grant is an interim deterministic adapter.
3. Quest XP and item rewards resolve once at the existing quest-completion boundary.
4. A level unlocks capabilities; it does not automatically insert items into inventory.
5. Gathering fails safely when the backpack is full and never deletes another item to make space.
6. Resource charges deplete only after the complete yield fits; renewal is deterministic active-play time and survives save/reload.
7. Bank contents, equipment, resource nodes, XP, quest state, and durable unlocks save together at accepted boundaries.
8. Crafting defaults to carried materials. A local bank must be physically present before an explicit Storehouse opt-in can draw the exact remainder.
9. Wilderness defeat may expose carried items according to the risk band. Equipped primary gear and a small protected-item allowance remain recoverable; quest items and epithet fragments are never dropped.

## Act I vertical-slice acceptance

Act I is not accepted as a skill RPG until a fresh browser run can:

1. Click a destination and visibly path around blocking geometry.
2. Click Thessa, approach automatically, and open the correct dialogue.
3. Inspect the 22-skill record, 28-slot backpack, equipment, and quest journal.
4. Gather at least three material types into real slots and gain the matching XP.
5. Bank and withdraw a material at the Beacon settlement.
6. Equip or inspect the Oath-Spear while preserving lightning as Kallias's divine combat identity.
7. Complete a quest and an encounter, visibly receive XP, save, reload, and retain it.
8. Enter one named wilderness route with readable risk and reward rules.

Later acts inherit these systems only after this browser acceptance passes.
