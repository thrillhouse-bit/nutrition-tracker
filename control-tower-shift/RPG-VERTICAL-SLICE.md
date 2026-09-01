# RPG Vertical Slice — The Oathbearer

Status: historical implementation blueprint. The five-act story mode is now
playable; current gaps and execution gates are maintained in
`AUDIT-AND-ROADMAP.md`. This document remains the original reuse contract.

## Product promise

An original Greek-mythology action RPG with a linear, authored main story inside open zones. The player can explore, choose an active divine patron, take contained side quests, and fight using the arena game's deterministic combat. The feeling to preserve is mythic travel, discovery, and forceful ability combat—not any other game's characters, plot, dialogue, map layouts, iconography, or branded systems.

Target route: `/#control-tower-rpg`. The current `/#control-tower` arena route remains independently playable.

### Player fantasy and protagonist

The player is **Kallias, the Oathbearer**, a mortal courier who survived the destruction of a divine treaty-stone. Its fragments lodged in Kallias's shadow, making them the only mortal able to carry a god's power across the Veil Accord, which prevents gods from intervening directly in the mortal world.

At the first shrine, the player chooses one Tier 1 patron. `god` remains the active-patron ID, so the existing loadout contract continues to work. Later shrines allow patron switching outside combat. Kallias has a fixed role, authored personality, male identity, he/him pronouns, lighter brown hair, and pale husky-blue eyes; narrow cosmetic options may vary scars, complexion details, and clothing accents without branching the plot. The fantasy is not “be every god,” but “be the mortal whom rival gods must trust.”

## Original five-act story

The antagonist is **The Quiet Regent**, former mortal archivist of the Veil Accord. The Regent's faction, **the Unnamed**, steals divine epithets from shrines and weaves them into the Silent Loom. Removing an epithet severs a place from the god whose promise protected it. The Regent claims this will free mortals from divine feuds; in practice it is erasing memory, agency, and the boundaries that keep primordial powers contained.

1. **Act I — The Broken Beacon.** Asterion Reach loses Apollo's epithet “Far-Sighted,” and beasts cross its defenseless terraces. Kallias accepts a first patron, rescues shrine keeper Thessa, clears the Acropolis Entry Court and Sun Court, and discovers an Unnamed cipher pointing seaward.
2. **Act II — The Salt Covenant.** In the island harbors of Pelagos, Poseidon's harbor oath and Oceanus's boundary are being spliced together. Kallias brokers a truce between sailors and displaced nereids, boards the Regent's archive-barge, and learns that the stolen names are components of a map to the first divine language.
3. **Act III — The Withered Year.** The Fields of Kore are trapped between harvest and winter. Demeter and Persephone disagree over which promise must be restored. Kallias reunites their two halves of the seasonal covenant, descends briefly through Hades's lawful gate, and learns the Regent once lost a family to a divine wager.
4. **Act IV — The False Constellation.** At the Bronze Foundry, Prometheus's fire is forging counterfeit stars while Atlas is forced to hold their false sky. Kallias frees Atlas, destroys the forge's name-press, and must refuse a tempting shortcut: let one patron dominate the repaired Accord. The surviving Olympian, Titan, and chthonic factions agree to a mortal-authored covenant.
5. **Act V — The Last Name.** The Night Stair leads through Nyx's dark and Helios's dawn to the Silent Loom above the mortal world. The Regent activates it, causing regions and allies to vanish from memory. Kallias restores the names through witnessed deeds, defeats the Loom's guardian, and chooses how the new Accord limits divine power. The ending changes epilogue lines and world-state details, not the main mission sequence.

## World structure, maps, and traversal

The world is five open zones joined by authored transitions. A zone is a bounded explorable map with a main path, one hub, 2–3 optional loops, combat pockets, shrines, and a clear exit gate. It is not a seamless continent.

| Region | Act | Reused/new authored maps | Traversal identity | Main-story gate |
|---|---:|---|---|---|
| Asterion Reach | I | `acropolis-entry`, `sun-court`; new `beacon-overlook`, `olive-road` | Run, mantle marked ledges, shrine fast-return | Restore Far-Sighted epithet |
| Pelagos Isles | II | New `harbor-of-oaths`, `nereid-caves`, `archive-barge` | Skiff nodes, swim shallows, rope lifts | Recover the salt covenant |
| Fields of Kore | III | New `wheat-village`, `winter-orchard`, `asphodel-gate` | Mount paths, seasonal bridges, underworld door | Reconcile the seasonal halves |
| Forge March | IV | Reuse `bronze-foundry`; new `slag-road`, `atlas-vault` | Mine carts, heat-safe routes, moving lifts | Break the name-press |
| Night Stair | V | New `nyx-foothold`, `false-sky`, `silent-loom` | Shadow bridges, sun mirrors, final ascent | Rewrite the Accord |

Traversal is authored and stateful. Interactions are `walk`, `dash`, `mantle`, `interact`, `fastReturn`, and region-specific transports. No procedural terrain, random quest placement, or wave spawns. Hostile encounters have fixed IDs, compositions, activation volumes, and completion flags.

## Factions, characters, and monsters

### Factions and recurring NPCs

- **Keepers of the Accord:** shrine keepers and witnesses. Thessa (pragmatic keeper) is the Act I guide; Amonides (legalist elder) tests whether Kallias treats oaths as obligations rather than loot.
- **The Unnamed:** mortal archivists, name-cutters, bronze masks, and the Quiet Regent. Lieutenant Ianthe believes erasure is mercy and can be persuaded to testify in Act V.
- **Olympian Compact:** Zeus, Hera, Poseidon, Demeter, Apollo, Artemis, Athena, Ares, Aphrodite, Hermes, Dionysus, and Persephone. They are patrons, quest givers, and disputants—not a unified “good” faction.
- **Chthonic Court:** Hades, Persephone, and Nyx protect lawful boundaries and memory of the dead.
- **Older Powers:** Cronus, Helios, Selene, Prometheus, Atlas, Oceanus, Eros, and Hercules. Their quests unlock Tier 3 patron contracts or alter optional outcomes.

Every existing deity key in `characters.js` appears as a named character or patron. Existing `DEITY_LOADOUT` power IDs are canonical; story content references IDs, never display names.

### Combat roster

Reuse `hydra`, `cerberus`, `chronos`, `sphinx`, `minotaur`, `medusa`, and `atlas` from `MONSTER_TYPES`. Add story variants only as data overlays (`baseMonsterType`, stat modifiers, attacks, codex text); do not duplicate base collision or health rules. `apollo` in the current monster table must not represent the story NPC Apollo; deprecate that encounter key or rename it through a migration before story content uses it. Bosses: Name-Cutter Captain (Act I), Archive Leviathan (II), Winter Mother Echo (III), Name-Press Colossus (IV), Loom Guardian and Quiet Regent (V).

## Contracts and schemas

All IDs are stable kebab-case strings. Content is data; reducers are pure. Runtime code must not infer progression from display text.

```ts
type RPGState = {
  schemaVersion: 1
  status: 'playing' | 'paused' | 'in-dialogue' | 'in-combat' | 'ending'
  protagonist: { presentation: 'he/him'; activePatronId: GodId; unlockedPatronIds: GodId[] }
  world: { regionId: string; mapId: string; spawnId: string; position: Vec2; facing: number }
  mainQuestId: string
  quests: Record<QuestId, QuestProgress>
  flags: Record<string, boolean | number | string>
  inventory: { epithetFragments: string[]; questItems: string[]; currency: number }
  progression: { rank: number; powerUnlocks: PowerId[]; shrineIds: string[] }
  combatSnapshot: null | CombatSessionSave
  playtimeTicks: number
  savedAt: string
}

type QuestProgress = {
  state: 'locked' | 'available' | 'active' | 'ready-to-turn-in' | 'completed' | 'failed'
  objectiveIndex: number
  objectiveCounts: Record<string, number>
  acceptedAtTick?: number
  completedAtTick?: number
}

type QuestDef = {
  id: QuestId
  kind: 'main' | 'side' | 'patron'
  act: 1 | 2 | 3 | 4 | 5
  prerequisites: Condition[]
  objectives: ObjectiveDef[]
  rewards: Effect[]
  nextQuestId?: QuestId
}

type ObjectiveDef =
  | { id: string; kind: 'reach'; mapId: string; markerId: string }
  | { id: string; kind: 'talk'; npcId: string; conversationId: string }
  | { id: string; kind: 'interact'; entityId: string }
  | { id: string; kind: 'collect'; itemId: string; count: number }
  | { id: string; kind: 'clear-encounter'; encounterId: string }

type EncounterDef = {
  id: string
  mapId: string
  campaignLevelId?: 'acropolis-entry' | 'sun-court' | 'bronze-foundry'
  order: MonsterTypeId[]
  pacing: number
  activation: 'volume' | 'interact' | 'quest'
  completionFlag: string
  repeatable: false
}
```

Quest transitions are event-driven: `locked -> available` when prerequisites pass; `available -> active` on accept (main quests auto-accept); `active -> ready-to-turn-in` when all ordered objectives pass; `ready-to-turn-in -> completed` on turn-in; only optional quests may enter `failed`. Main quests cannot permanently fail. Replaying a combat encounter after death restores its pre-encounter checkpoint and does not duplicate rewards.

### Dialogue and cutscene contract

```ts
type Conversation = {
  id: string
  speakerIds: string[]
  nodes: Record<string, {
    speakerId?: string
    text: string
    portraitState?: string
    cameraCue?: 'wide' | 'speaker' | 'player' | 'reveal' | 'restore'
    animationCue?: string
    choices?: { id: string; text: string; when?: Condition[]; effects?: Effect[]; next: string }[]
    next?: string
    effects?: Effect[]
  }>
  start: string
}
```

Dialogue is skippable line-by-line; cutscenes are skippable to a deterministic end-state. Choices may set flags, affinity, rewards, or epilogue variants, but cannot reorder the five-act main path. Subtitles are always on. Every camera cue must have a reduced-motion equivalent, and gameplay input remains disabled until `restore` completes.

## Reusing the arena foundation

Existing contracts remain authoritative:

- `CAMPAIGN`, `levelById`, `encounterSize`, and palette/architecture data provide the first three authored combat maps.
- `createInitialState`, `setInput`, `setAim`, `advanceTick`, `castPowerOn`, `pause`, and `resume` remain the combat reducer surface.
- `POWER_DEFS`, `DEITY_LOADOUT`, `powersForGod`, `powerReady`, and `powerActive` define patron abilities. Story unlocks expose powers; they do not fork their effects.
- `MONSTER_TYPES` supplies base monster identity; `createSpawner`/`stepSpawner` feed a fixed encounter order with seeded placement.

Add a thin `rpg/combatAdapter` rather than putting quest logic in `game/state.js`. It creates a combat state from `activePatronId`, maps an `EncounterDef` to a known campaign level or data-equivalent encounter, owns the seed, and emits only `COMBAT_WON`, `COMBAT_FAILED`, and checkpoint events to the RPG reducer. For reused sequential campaign data, the adapter must stop before the next map's spawner tick. It must never award quest progress from score.

RPG progression and combat cooldown time are separate clocks. `tokenUsage` and high scores are arena telemetry, not RPG currency. `world.position` is not copied into arena coordinates. A patron can switch only at a shrine and never while `status === 'in-combat'`.

### Save contract

- Storage key: `control-tower-shift:rpg-save:v1`; never reuse `control-tower-shift:high-scores`.
- Save at shrines, region transitions, quest completion, patron changes, and combat entry/exit checkpoints.
- Validate every loaded field; unknown IDs fall back to the last valid shrine, not a blank world.
- Persist active combat only at encounter boundaries for v1. Mid-frame/projectile saving is a non-goal.
- Migration is `schemaVersion`-keyed and pure. Corrupt data returns a recoverable “start new / restore last checkpoint” choice and never throws during render.

## First playable vertical slice: “Ash at Dawn”

Target duration: 15–20 minutes. Target content: one hub segment, two authored combat maps, three conversations, one optional quest, one patron choice, one boss-like elite, one checkpoint loop.

### Entry criteria

- Open `/#control-tower-rpg` with no RPG save or choose New Story.
- A new schema-v1 save is created at `beacon-overlook:start`.
- No arena high score, arena unlock, or prior hash route state is required.

### Ordered playable flow

1. **Beacon Overlook:** short movement, dash, mantle, interact tutorial; Kallias witnesses the treaty-stone break. Conversation `act1-thessa-overlook` establishes the lost epithet and marks the shrine.
2. **First Patron Shrine:** choose any Tier 1 patron from the existing roster. Show the mythology-grounded `POWER_DEFS` description and controls. Save immediately after choice.
3. **Olive Road open pocket:** main marker points to the gate; the player may detour for side quest `sq-lost-witness`, recovering one tablet and returning it to a keeper. The detour grants currency/codex only and never blocks the gate.
4. **Acropolis Entry Court:** `enc-act1-entry` reuses campaign level `acropolis-entry`. Clear its exact authored encounter. On death, restore the shrine checkpoint. On victory, set `enc-act1-entry-cleared` once and unlock the gate.
5. **Sun Court:** `enc-act1-sun` reuses `sun-court`, replacing its final `chronos` spawn with an elite Name-Cutter overlay for the slice. The existing power, melee, health, and deterministic spawn contracts remain active.
6. **Exit conversation:** Thessa recovers the Far-Sighted fragment; Ianthe is revealed without a boss fight. Complete `mq-act1-ash-at-dawn`, write the save, show a concise Act II destination card, and return control in a post-mission overlook.

### Exit criteria

- `mq-act1-ash-at-dawn.state === 'completed'`.
- Both encounter completion flags are true and their rewards cannot repeat.
- A valid save reloads at `beacon-overlook:post-mission` with patron, optional-quest state, inventory, and power unlocks intact.
- Continue displays “Act II not yet available” in the vertical slice; it must not lead into an empty zone.

## Testable acceptance criteria

1. Direct navigation mounts story mode only at `/#control-tower-rpg`; arena mode still mounts at `/#control-tower` and the main app mounts elsewhere.
2. New game -> patron choice -> entry combat -> sun combat -> exit conversation is completable with keyboard and pointer/touch controls.
3. Every Tier 1 patron produces exactly the loadout returned by `powersForGod(god)`; `castPowerOn` rejects abilities outside it.
4. The slice contains no player-facing waves. Encounter IDs, fixed compositions, map titles, objectives, and completion flags are visible/inspectable.
5. Clearing an encounter updates its quest objective once. Score changes, reloads, and repeated reducer events cannot duplicate progress or rewards.
6. Death restores the pre-encounter checkpoint with the same patron, quest state, and deterministic encounter seed.
7. Saving, reloading, corrupt JSON, unknown IDs, and a future `schemaVersion` all follow the save contract without a render crash.
8. Main quest objectives advance only in order. The side quest can be skipped, completed before the gate, or finished post-mission without changing main quest order.
9. Dialogue supports next, conditional choice, skip, side effects, and reduced-motion camera behavior; skipping produces the same flags as viewing.
10. Browser verification at desktop and narrow mobile widths shows readable HUD, objective, subtitles, interaction prompt, and safe touch controls with no horizontal page overflow.
11. Focus order, visible focus, pause, subtitle announcements, and power cooldown labels meet the arena's accessibility behavior; gameplay is paused when focus leaves the story surface.
12. Focused RPG tests, existing `control-tower-shift` tests, and the production build pass. Any unrelated repository failure is documented rather than hidden.

## Phased implementation order

1. **Contracts:** add `rpg/content`, state reducer, quest events, validation, save migration, and unit tests. No world rendering yet.
2. **Route shell:** extend the hash gate for `#control-tower-rpg`; add New/Continue, pause, objective/subtitle HUD, and a blank authored map fixture.
3. **World traversal:** implement `beacon-overlook` and `olive-road`, interaction volumes, shrine checkpoint/patron selection, camera bounds, and narrow-screen controls.
4. **Combat adapter:** connect the two existing campaign levels, fixed seeds, entry/exit checkpoints, and exactly-once quest events. Run all arena regression tests.
5. **Narrative:** implement the three conversations, skip semantics, side quest, codex/currency reward, elite overlay, and Act II boundary card.
6. **Presentation and verification:** region art pass, map transitions, impact effects, audio hooks, accessibility, performance budget, full browser playthrough, save/reload matrix, and screenshot evidence.
7. **Post-slice expansion:** build Acts II–V one region at a time. A region is accepted only when its main path, optional loops, save points, boss, and regression suite are complete.

## Explicit non-goals

- No seamless continent, procedural map generation, radiant/random quests, enemy waves, live-service economy, multiplayer, or user-generated content.
- No naval simulation, army/conquest system, stealth-assassination tree, loot rarity treadmill, hundreds of interchangeable weapons, or imitation of another franchise's UI or structure.
- No fully branching main plot. Choices affect affinity, optional resolutions, and epilogue state while the five acts remain linear.
- No romance system in the vertical slice; Aphrodite and Eros retain mythology-grounded power and story roles without an affinity minigame.
- No attempt to make all 22 patrons equally featured in Act I. Every deity has a stable contract and planned story presence; the slice proves the Tier 1 patron path.
- No mid-combat save, dynamic day/night simulation, fully voiced dialogue, motion-captured cutscenes, mount combat, or complete Acts II–V before the vertical slice is tested.
- No copying of Assassin's Creed Odyssey characters, plot beats, dialogue, locations, map layouts, branded terminology, assets, or proprietary systems.
