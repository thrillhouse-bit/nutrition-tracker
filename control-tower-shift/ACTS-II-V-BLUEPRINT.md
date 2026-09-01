# Acts II–V Region Blueprint — The Oathbearer

Status: documentation-only expansion plan following Act I, “Ash at Dawn.” This document extends `RPG-VERTICAL-SLICE.md`; its state, quest, dialogue, combat-adapter, and save contracts remain authoritative. `STORY-BIBLE.md` is authoritative for character motives, revelation order, epithet manifestations, restoration consequences, Witness Path travel, and earned-ending logic.

## Delivery rule

Each act ships as one accepted open-zone region with authored pockets, a fixed main path, one optional loop, explicit checkpoints, and deterministic combat encounters. Regions unlock sequentially. A later region is not exposed until the previous region meets its acceptance criteria; “Continue” must never lead into placeholder terrain.

This is an original story and implementation. It must not copy Assassin's Creed Odyssey or any other franchise's characters, plot, dialogue, quest beats, locations, layouts, terminology, icons, UI, assets, or branded mechanics. The intended overlap is only the broad genre idea of a story-led mythic journey through explorable zones.

## Stable implementation boundaries

- Existing deity IDs from `characters.js`, power IDs from `POWER_DEFS`/`DEITY_LOADOUT`, and base monsters from `MONSTER_TYPES` are canonical. Story data references IDs, not labels.
- `powersForGod`, `powerReady`, `powerActive`, and `castPowerOn` remain the authority for the active patron. Story encounters may provide contextual advantages for power tags, but no objective may require one specific patron.
- `createInitialState`, `setInput`, `setAim`, `advanceTick`, `pause`, and `resume` remain the deterministic combat surface behind `rpg/combatAdapter`.
- `EncounterDef.order` is fixed, seeded, and authored. New maps use data-equivalent encounter definitions; only `bronze-foundry` has a current `campaignLevelId` in Acts II–V.
- Quest progression comes from exactly-once encounter/interaction events, never score, `tokenUsage`, display text, or elapsed wall-clock time.
- The save remains schema-versioned under `control-tower-shift:rpg-save:v1`. Region expansion may add known flags and content IDs without changing the shape of `RPGState`; a shape change requires a pure migration and version bump.
- Boss and elite behavior is a story overlay on base monster identity. Overlays may add phases, telegraphs, hazards, or stat modifiers without forking base collision, damage, cooldown, or scoring rules.
- Every stolen epithet has authored map, memory, language, terrain, relationship, and enemy-behavior manifestations as defined in `STORY-BIBLE.md`. Accessibility labels and objective meaning are never erased.
- Each regional restoration stores its stable formulation ID and applies the documented revisit state. Formulations alter authored routes, reactions, and overlays without branching the linear main quest.

## Shared region content contract

```ts
type RegionDef = {
  id: string
  act: 2 | 3 | 4 | 5
  entry: { mapId: string; spawnId: string; prerequisites: Condition[] }
  pockets: MapPocketDef[]
  mainQuestId: string
  optionalQuestId: string
  shrineIds: string[]
  exit: { mapId: string; spawnId: string; effects: Effect[] }
}

type MapPocketDef = {
  id: string
  role: 'hub' | 'traversal' | 'combat' | 'dungeon' | 'boss' | 'epilogue'
  connections: { to: string; gate?: Condition[] }[]
  checkpointId?: string
  encounterIds?: string[]
  mechanics?: string[]
}
```

All flags below are namespaced by act. A completion flag changes from absent/false to true once and never toggles back. Temporary map mechanisms use reducer state or a checkpoint snapshot, not permanent flags unless stated.

---

## Act II — Pelagos Isles: The Salt Covenant

### Story purpose and entry/exit

Kallias follows the Unnamed cipher to Pelagos, where Poseidon's harbor oath and Oceanus's world-boundary have been stitched together. Every tide now carries ships inland and leaves nereids stranded in stone. The act proves that restoring an oath requires agreement from those it binds, not merely returning a stolen relic.

- Entry requires `mq-act1-ash-at-dawn === completed` and `act1-far-sighted-restored === true`.
- Main quest: `mq-act2-salt-covenant`.
- Accepted exit: `pelagos-harbor:post-covenant`, with the archive route to the Fields of Kore decoded.

### Authored map pockets

| Pocket ID | Role | Authored content and connections |
|---|---|---|
| `pelagos-harbor` | Hub | Flooded market, Keeper jetty, Poseidon shrine, three skiff docks. Connects to `breakwater-road` and returns from `archive-barge-deck`. |
| `breakwater-road` | Traversal | Alternates dry causeway and waist-deep channel through a deterministic three-state tide. Connects harbor to `nereid-caves`. |
| `nereid-caves` | Dungeon | Two hand-authored chambers, pressure-shell doors, Oceanus boundary well, stranded nereid enclave. Exits at `storm-anchorage`. |
| `storm-anchorage` | Combat | Open reef platform with rope lift and fixed ambush; unlocks the archive skiff route. |
| `archive-barge-deck` | Boss | Multi-level deck, chained archive crates, mast hazard, Archive Leviathan arena. Returns to harbor for turn-in. |

### Main objectives

1. `reach-pelagos-keeper`: meet harbor Keeper Melite and inspect the oath-post.
2. `witness-first-surge`: cross `breakwater-road` and learn the tide-state telegraph.
3. `free-nereid-witnesses`: clear the caves and release three named witnesses; order is player-chosen inside the pocket.
4. `separate-boundary-names`: rotate three pressure shells to separate Poseidon's `harbor-oath` fragment from Oceanus's `world-boundary` fragment.
5. `secure-storm-anchorage`: clear its authored encounter and activate the archive skiff.
6. `board-archive-barge`: recover two cipher folios from fixed deck locations.
7. `defeat-archive-leviathan`: clear the boss encounter.
8. `ratify-salt-covenant`: choose `harbor-first`, `boundary-first`, or `shared-crossing` with Poseidon, Oceanus, sailors, and nereids. All complete Act II; each applies the terrain, language/relationship, enemy-overlay, and ending-evidence consequences in `STORY-BIBLE.md`.

### Optional loop: “The Unmoored Heart”

`sq-act2-unmoored-heart` begins with a sailor who remembers a nereid's song but not her name. Follow fixed echo markers through a side cavern, fight one charmed-medusa elite, and let Aphrodite and Eros disagree over whether desire proves identity. Their decision proves a relationship can sustain part of an epithet outside an official archive and records `evidence-mutual-memory`. Reward: codex entry, currency, and either `act2-affinity-aphrodite` or `act2-affinity-eros`. It never changes the skiff gate or main objective order.

### Save points

- `shrine-pelagos-poseidon` on first harbor arrival and after patron changes.
- `checkpoint-nereid-threshold` before cave combat.
- `checkpoint-storm-anchorage-cleared` after the anchorage event.
- `checkpoint-archive-barge-boss` before the Leviathan; defeat restores recovered folios but not boss completion.
- Region completion save at `pelagos-harbor:post-covenant`.

### Patron and deity roles

- **Poseidon** insists harbor protection grants him authority; `earthshaker` can briefly expose armored deck enemies but is never required.
- **Oceanus** distinguishes a boundary from ownership; `worldRiver` gains a visual resonance near tide wells without changing its canonical effect.
- **Hermes** interprets the archive route and provides objective clarity when roads move.
- **Aphrodite and Eros** anchor the optional story about desire versus witnessed identity.
- Any unlocked patron remains valid throughout the region; switches occur only at the harbor shrine.

### Unique mechanic and combat

**Covenant tide:** map traversal cycles only when the player activates a marked tide well. States are `ebb`, `crossing`, and `surge`; each has fixed walkable polygons and an accessible color-plus-shape telegraph. The tide pauses during dialogue and arena combat. No real-time drowning timer.

| Encounter ID | Map | Fixed base order / overlay | Completion flag |
|---|---|---|---|
| `enc-act2-breakwater` | `breakwater-road` | `hydra, hydra, chronos, cerberus` with reef overlays | `act2-breakwater-cleared` |
| `enc-act2-nereid-caves` | `nereid-caves` | `medusa, hydra, medusa, cerberus` | `act2-nereid-caves-cleared` |
| `enc-act2-anchorage` | `storm-anchorage` | `chronos, minotaur, hydra, minotaur` with surge lanes | `act2-anchorage-cleared` |
| `boss-act2-archive-leviathan` | `archive-barge-deck` | Cerberus-tank core plus targetable hydra-head overlays; three telegraphed mast slams | `act2-leviathan-defeated` |

Permanent flags: `act2-pelagos-arrived`, `act2-nereids-freed`, `act2-boundary-separated`, `act2-folios-recovered`, `act2-leviathan-defeated`, `act2-salt-covenant-ratified`, `act2-restoration-form`, optional `evidence-mutual-memory`, `mq-act2-salt-covenant-completed`.

### Act II acceptance criteria

1. The full main objective chain completes in order with any Tier 1 patron and cannot double-award after reload.
2. All five pockets connect without placeholder exits; every skiff destination has a valid return spawn.
3. Tide states persist across pocket transitions/checkpoints, expose identical geometry after reload, and never change during combat/dialogue.
4. The side loop is independently skippable/completable, records its documented mystery evidence, and has a valid neutral final-story fallback when skipped.
5. Leviathan defeat resumes on the post-boss deck, not inside active combat, and region completion unlocks Act III exactly once.
6. Reload/revisit preserves the selected Salt Covenant formulation and its exact route, relationship-language, and enemy-overlay consequences.

---

## Act III — Fields of Kore: The Withered Year

### Story purpose and entry/exit

The recovered folios lead to a valley trapped between harvest and winter. Demeter safeguards continuity; Persephone argues that return is meaningless without departure. Kallias must join two seasonal promises and use Hades's lawful gate to recover the witness omitted from both accounts.

- Entry requires `mq-act2-salt-covenant === completed` and `act2-salt-covenant-ratified === true`.
- Main quest: `mq-act3-withered-year`.
- Accepted exit: `wheat-village:first-thaw`, with the False Constellation located over Forge March.

### Authored map pockets

| Pocket ID | Role | Authored content and connections |
|---|---|---|
| `wheat-village` | Hub | Keeper granary, Demeter shrine, villagers frozen at different moments of one year. |
| `winter-orchard` | Traversal/combat | Two seasonal-state routes around a central frozen spring; connects to village and `kore-sanctuary`. |
| `kore-sanctuary` | Dungeon | Persephone's pomegranate seals, four authored season mosaics, descent gate. |
| `asphodel-gate` | Dungeon | Compact chthonic pocket with witness shades and Hades's lawful threshold. |
| `threshing-circle` | Boss | Circular field split into winter and harvest halves; returns to village after the Echo falls. |

### Main objectives

1. `hear-the-stilled-year`: speak to Demeter, Persephone, and two villagers in any order.
2. `restore-orchard-paths`: activate the harvest and winter altars, learning seasonal traversal.
3. `recover-seed-half`: clear the orchard guardian and collect Demeter's half-promise.
4. `recover-return-half`: solve the sanctuary's ordered pomegranate seals and collect Persephone's half.
5. `petition-hades`: cross `asphodel-gate` and identify the dead midwife Kleio as the missing mortal witness.
6. `join-the-covenant`: combine both halves only after Kleio's testimony, then ratify `continuity-kept`, `departure-protected`, or `witnessed-cycle`. Every form completes the objective and applies its documented revisit/evidence state.
7. `defeat-winter-mother-echo`: survive alternating seasonal phases and destroy the counterfeit memory.
8. `witness-first-thaw`: return to the village and complete the joined covenant.

### Optional loop: “The Cup Between Seasons”

`sq-act3-cup-between-seasons` asks Kallias to recover Dionysus's ceremonial cup from a vineyard that exists only in the brief transition between states. Hera questions whether a ritual without its household still binds anyone. The cup's renewal mark proves the Keepers backdated Orthe's revised minutes and records `evidence-backdated-rite`. Reward: currency plus either `act3-rite-renewed` or `act3-rite-released`; both are regional/ending nuance only.

### Save points

- `shrine-wheat-village-demeter` at arrival/turn-in.
- `checkpoint-orchard-spring` after both traversal altars activate.
- `checkpoint-kore-sanctuary` before the seal sequence.
- `checkpoint-asphodel-return` after Kleio's testimony.
- `checkpoint-threshing-boss` after covenant joining and before the Echo.
- Region completion save at `wheat-village:first-thaw`.

### Patron and deity roles

- **Demeter** embodies continuity and sustenance; `harvestMoon` receives strong growth feedback, not a stronger numeric heal.
- **Persephone** insists on cyclic agency; `seasonalShift` may activate traversal altars from range but direct interaction also works.
- **Hades** enforces testimony and lawful passage; `gateOfTheDead` reveals the same witness trail available through shrine lanterns.
- **Dionysus and Hera** dispute ritual versus household in the optional loop.
- **Artemis** identifies the orchard guardian's tracks and supplies hunt context whether or not she is active patron.

### Unique mechanic and combat

**Seasonal overlay:** designated pockets toggle between `harvest` and `winter` only at paired altars. Geometry, hazards, and NPC positions have two authored variants. Objective markers always identify the currently reachable route. The toggle is disabled during combat; reloading restores the checkpoint's exact season.

| Encounter ID | Map | Fixed base order / overlay | Completion flag |
|---|---|---|---|
| `enc-act3-orchard-tracks` | `winter-orchard` | `chronos, medusa, hydra, medusa` with winter slow zones | `act3-orchard-cleared` |
| `enc-act3-kore-sanctuary` | `kore-sanctuary` | `sphinx, hydra, sphinx, cerberus` | `act3-sanctuary-cleared` |
| `enc-act3-asphodel` | `asphodel-gate` | `cerberus, chronos, chronos, cerberus` with shade overlays | `act3-asphodel-cleared` |
| `boss-act3-winter-mother-echo` | `threshing-circle` | Medusa-control core alternating harvest adds and winter hazards | `act3-winter-echo-defeated` |

Permanent flags: `act3-fields-arrived`, `act3-altars-awakened`, `act3-seed-half-recovered`, `act3-return-half-recovered`, `act3-kleio-witnessed`, `act3-covenant-joined`, `act3-restoration-form`, `act3-winter-echo-defeated`, `act3-first-thaw`, optional `evidence-backdated-rite`, `mq-act3-withered-year-completed`.

### Act III acceptance criteria

1. Each seasonal pocket has exactly two authored, tested states; no entity can spawn inside blocked geometry after a toggle or reload.
2. Kleio's testimony is mandatory, skippable cutscenes produce identical quest effects, and the main quest cannot join halves early.
3. The boss alternates phases deterministically with non-color telegraphs; defeat restores the village thaw state and unlocks Act IV once.
4. All five patron roles render correct dialogue regardless of active patron, with active-patron variants limited to optional lines/effects.
5. The optional cup loop is completable in either documented outcome without modifying boss difficulty or main progression.
6. Reload/revisit preserves the selected Return formulation, exact seasonal access, relationship-language reactions, and enemy overlay.

---

## Act IV — Forge March: The False Constellation

### Story purpose and entry/exit

The Unnamed are pressing stolen epithets into bronze stars. Prometheus's fire powers the press while Atlas is chained beneath its artificial sky. Kallias must free both with his older half-brother Hercules, then refuse their father Zeus's proposed replacement: one god's name permanently above all others.

- Entry requires `mq-act3-withered-year === completed` and `act3-first-thaw === true`.
- Main quest: `mq-act4-false-constellation`.
- Accepted exit: `slag-road:dawn-muster`, with the mortal-authored covenant assembled and Night Stair revealed.

### Authored map pockets

| Pocket ID | Role | Authored content and connections |
|---|---|---|
| `slag-road` | Hub/traversal | Refugee foundry camp, lift controls, Athena/Ares strategy board, Prometheus shrine. |
| `bronze-foundry` | Combat/dungeon | Reuses campaign palette, architecture, and `campaignLevelId: bronze-foundry`; adds three disabled production lanes outside combat. |
| `name-press` | Dungeon | Heat-routing floor, epithet dies, two pressure relief chambers. |
| `atlas-vault` | Traversal | Moving load platforms and four chain anchors supporting the false sky. |
| `false-constellation` | Boss | Name-Press Colossus beneath a collapsing bronze firmament. |

### Main objectives

1. `choose-march-plan`: hear Athena's precise route and Ares's direct breach; the choice changes the first traversal connection, not required encounters.
2. `break-foundry-guard`: clear the reused `bronze-foundry` encounter and shut down its production lanes.
3. `return-prometheus-fire`: redirect stolen fire from the press to Prometheus's lawful brazier.
4. `release-atlas-anchors`: release four authored anchors; each opens a fixed route through `atlas-vault`.
5. `recover-covenant-witnesses`: rescue Hercules and two mortal smiths from marked cells.
6. `reject-single-crown`: refuse Zeus's domination proposal; dialogue tone may vary, outcome does not.
7. `defeat-name-press-colossus`: break its three name-dies, then its exposed core.
8. `ratify-mortal-draft`: Athena, Ares, Prometheus, Atlas, Hercules, Zeus, and the smiths witness the draft; choose `licensed-flame`, `guild-stewardship`, or `revocable-hearths` for Forge March. Every form advances to Act V and contributes different final evidence.

### Optional loop: “Weight of One More Sky”

`sq-act4-one-more-sky` recovers Atlas's hand-carved constellation tablets from a collapsed side vault. Hercules can lift one gate while the player reroutes a counterweight for the other; neither active patron is required. The tablets prove the Loom omits constellations that require multiple viewpoints and record `evidence-plural-stars`. Reward: Atlas codex, currency, and `act4-atlas-constellations-restored`, which also adds stars to the epilogue sky.

### Save points

- `shrine-slag-road-prometheus` at arrival and after strategy choice.
- `checkpoint-foundry-cleared` after the reused campaign encounter.
- `checkpoint-name-press-relief` after fire redirection.
- `checkpoint-atlas-vault` after all four anchors release.
- `checkpoint-colossus-boss` after rejecting the single crown.
- Region completion save at `slag-road:dawn-muster`.

### Patron and deity roles

- **Prometheus** distinguishes stolen fire from shared craft; `fireBrand` lights optional shortcuts but every shortcut has a manual brazier.
- **Atlas** is a person under coercion, not merely the `atlas` monster base; `worldBearer` receives unique brace feedback during platform traversal.
- **Athena and Ares** offer different traversal plans without branching the objective graph.
- **Hercules**, Kallias's older half-brother, embodies strength used in service, not rule. Their joint rescue of Atlas contrasts public heroic force with Kallias's medical/stewardship practice; neither brother is reduced to the other's lesson. `herosWrath` can accelerate anchor combat but cannot bypass it.
- **Zeus**, father to both brothers, offers the false solution Kallias must reject: use their lineage and visible strength to legitimize a single divine crown. Rejecting inherited authority does not reject Kallias's storm identity; `thunderbolt` remains fully usable and receives no punishment.

### Unique mechanic and combat

**Forge pressure:** three authored pressure lanes have `safe`, `venting`, and `critical` states controlled by visible valves. State changes open routes and telegraph floor hazards; they pause during dialogue and save exactly at checkpoints. Pressure cannot kill during an interaction animation. Reduced-motion mode replaces screen shake and heat distortion with border pulses and audio/subtitle cues.

| Encounter ID | Map | Fixed base order / overlay | Completion flag |
|---|---|---|---|
| `enc-act4-foundry-threshold` | `bronze-foundry` | Exact current `bronze-foundry` order; `campaignLevelId: bronze-foundry` | `act4-foundry-cleared` |
| `enc-act4-name-press` | `name-press` | `minotaur, cerberus, chronos, minotaur, medusa` with forge masks | `act4-name-press-cleared` |
| `enc-act4-atlas-vault` | `atlas-vault` | `cerberus, atlas, minotaur, chronos` with anchor guards | `act4-atlas-vault-cleared` |
| `boss-act4-name-press-colossus` | `false-constellation` | Atlas-boss core; three targetable sphinx-die overlays and fixed collapse phases | `act4-colossus-defeated` |

Permanent flags: `act4-forge-arrived`, `act4-march-plan`, `act4-foundry-cleared`, `act4-fire-returned`, `act4-atlas-released`, `act4-witnesses-freed`, `act4-single-crown-rejected`, `act4-colossus-defeated`, `act4-mortal-draft-ratified`, `act4-restoration-form`, optional `evidence-plural-stars`, `mq-act4-false-constellation-completed`.

### Act IV acceptance criteria

1. Both march plans rejoin before `bronze-foundry` and produce the same required encounter set and completion state.
2. The reused campaign level stops at its RPG adapter boundary; it cannot auto-spawn another arena campaign level.
3. Forge pressure is deterministic, safely telegraphed, checkpointed, and does not alter canonical patron power math.
4. Atlas NPC and `atlas` base monster have distinct content IDs, rendering, dialogue, and targeting semantics.
5. Rejecting the single crown is unavoidable but offers at least two authored tones; both unlock the boss and record one compatible epilogue flag.
6. Colossus completion, witness rescue, and draft ratification unlock Act V exactly once after a valid post-region save.
7. Reload/revisit preserves the selected Shared Fire formulation, exact convenience route, worker/deity reactions, and forge-enemy overlay.

---

## Act V — Night Stair and Silent Loom: The Last Name

### Story purpose and entry/exit

The Quiet Regent activates the Silent Loom above Night Stair. Names disappear first from maps, then speech, then memory. Kallias carries the mortal draft through Nyx's shelter, Selene's witness-light, Helios's dawn, and Cronus's time fractures to restore the stolen epithets and decide the new Accord's limits.

- Entry requires `mq-act4-false-constellation === completed` and `act4-mortal-draft-ratified === true`.
- Main quest: `mq-act5-last-name`.
- Accepted exit: `accord-overlook:epilogue`, with a completed ending record and a stable post-game save.

### Authored map pockets

| Pocket ID | Role | Authored content and connections |
|---|---|---|
| `nyx-foothold` | Hub | Final Keeper camp, patron shrine, ally witness board, path to the Stair. |
| `night-stair` | Traversal/combat | Shadow bridges, four memory anchors, optional Selene overlook. |
| `false-sky` | Dungeon | Sun-mirror routes and fixed time-fracture rooms; connects to Loom approach. |
| `silent-loom-approach` | Combat | Restored witness names become visible protective seals. |
| `silent-loom` | Boss | Loom Guardian phase, Quiet Regent phase, covenant choice chamber. |
| `accord-overlook` | Epilogue | Deterministic epilogue tableau generated only from documented flags. |

### Main objectives

1. `muster-the-witnesses`: review allies restored in Acts I–IV; missing optional allies have neutral fallback witnesses.
2. `cross-night-stair`: stabilize four memory anchors while the Regent removes location labels.
3. `align-moon-witnesses`: use Selene's reflected light to prove the anchors refer to the same mortal history.
4. `turn-the-false-dawn`: rotate Helios's three sun mirrors and expose the Loom approach.
5. `survive-time-fractures`: cross Cronus rooms whose authored states replay earlier traversal positions, never player input or saves.
6. `restore-the-epithets`: place the recovered fragments into named seals in fixed act order.
7. `defeat-loom-guardian`: clear the construct without allowing any seal to remain suppressed.
8. `confront-quiet-regent`: fight until Ianthe's testimony interrupts the final erasure; a neutral Keeper testifies if her optional affinity was not earned.
9. `write-the-new-accord`: choose among the Accord forms earned by the restoration/evidence thresholds in `STORY-BIBLE.md`. `renewed-compact` provides a limited fallback for migrated or partial data, so the story cannot dead-end. Every eligible form completes the story with a stated benefit, cost, and earned safeguards.
10. `witness-the-last-name`: complete the epilogue and create the post-game save.

### Optional loop: “A Light No Map Remembers”

`sq-act5-light-no-map-remembers` begins at Selene's overlook. Restore four star names by matching their witnessed deeds, not constellations copied from a real or fictional map. Apollo, Helios, and Selene disagree over whether illumination means revelation, endurance, or reflection. The result records `evidence-independent-light`, proving plural witnesses can preserve truth without one owning it. Reward: `act5-true-sky-restored`, an epilogue sky treatment, plus codex/currency. It does not weaken either final boss.

### Save points

- `shrine-nyx-foothold` before final ascent and patron changes.
- `checkpoint-night-stair-anchors` after all four anchors stabilize.
- `checkpoint-false-sky-mirrors` after the sun mirrors align.
- `checkpoint-loom-approach` after all epithets are sealed.
- `checkpoint-loom-guardian` between Guardian and Regent phases; reload begins at a clean phase boundary.
- Final save at `accord-overlook:epilogue`; it records `endingId` and never respawns a defeated final boss.

### Patron and deity roles

- **Nyx** shelters names the Loom cannot perceive; `primordialDark` makes anchor protection visually resonate without hiding objective UI.
- **Selene** supplies reflected witness-light; `lunarVeil` grants no traversal bypass.
- **Helios** exposes counterfeit dawn; `sunChariot` can illuminate optional lore seals but mirrors always work directly.
- **Cronus** explains sequence without controlling destiny; `temporalRewind` retains its canonical heal and never rewinds quests or saves.
- **Apollo** restores “Far-Sighted” and closes the Act I thematic loop; his three canonical powers remain unchanged.
- **Ianthe** testifies if persuaded by documented prior flags; otherwise Keeper Melite provides the required witness so the main story cannot dead-end.
- All unlocked patrons appear as witnesses through data-driven lines. Active patron changes flavor dialogue and effects, never the final objective graph.

### Unique mechanics and combat

**Witnessed memory:** the Loom may replace a discovered map label with a stable witness icon, but it never removes objective direction, interaction labels, subtitles, accessibility names, or save-point identity. Restoring an anchor reverses the authored erasure state.

**Light polarity:** marked bridges use `shadow`, `moon`, or `sun` state, switched only at Nyx seals or sun mirrors. Each state has fixed geometry and shape-coded feedback.

**Time fractures:** fixed room snapshots alternate between authored A/B states. They do not record or replay player controls, damage, cooldowns, inventory, or quest events.

| Encounter ID | Map | Fixed base order / overlay | Completion flag |
|---|---|---|---|
| `enc-act5-night-stair` | `night-stair` | `chronos, medusa, sphinx, chronos, cerberus` with erasure masks | `act5-night-stair-cleared` |
| `enc-act5-false-sky` | `false-sky` | `chronos, minotaur, sphinx, atlas` across fixed fracture states | `act5-false-sky-cleared` |
| `enc-act5-loom-approach` | `silent-loom-approach` | `hydra, cerberus, medusa, minotaur, sphinx` bound to five seals | `act5-loom-approach-cleared` |
| `boss-act5-loom-guardian` | `silent-loom` | Atlas-boss core with suppressible seal overlays and three fixed phases | `act5-loom-guardian-defeated` |
| `boss-act5-quiet-regent` | `silent-loom` | Human-scale minotaur-charge/chronos-speed overlays; two phases and testimony interrupt | `act5-quiet-regent-defeated` |

Permanent flags: `act5-night-stair-arrived`, `act5-witnesses-mustered`, `act5-anchors-stable`, `act5-moon-witnesses-aligned`, `act5-false-dawn-turned`, `act5-time-fractures-crossed`, `act5-epithets-restored`, `act5-loom-guardian-defeated`, `act5-quiet-regent-defeated`, `act5-accord-choice`, `act5-last-name-witnessed`, `mq-act5-last-name-completed`, plus optional `act5-true-sky-restored` and `evidence-independent-light`.

### Act V acceptance criteria

1. The final ascent remains navigable and understandable through every erasure state; no mechanic removes accessibility or objective semantics.
2. Light-polarity and time-fracture states are finite, authored, deterministic, and restored exactly at checkpoints.
3. Optional ally/affinity flags alter only valid witness lines and epilogue details; neutral fallbacks always prevent a dead-end.
4. Guardian and Regent phases checkpoint only at documented boundaries and cannot duplicate completion, reward, or testimony events.
5. Every evidence-eligible Accord choice completes the same main quest and creates a valid, distinct `endingId`; the limited fallback is always valid and no unavailable branch is selectable.
6. Reloading the final save opens `accord-overlook:epilogue`, preserves patron/progression/side-quest history, and never restarts final combat.

---

## Cross-act release acceptance

Acts II–V are complete only when all of the following are true:

1. A clean save can play Act I through Act V sequentially; a valid checkpoint save can resume every documented pocket and boss boundary.
2. Every main objective advances once, in order. Duplicate reducer events, boss retries, hash navigation, and save reloads cannot duplicate flags or rewards.
3. Every region is fully authored: all map connections, return spawns, shrines, objective markers, encounter boundaries, and post-region states exist before its entry gate is enabled.
4. Every encounter has a stable ID, seed, fixed composition, completion flag, pre-combat checkpoint, and adapter exit. No player-facing waves appear.
5. Any unlocked patron can complete every required encounter. Mythology-specific contextual advantages are optional, discoverable, and do not modify canonical `POWER_DEFS` values.
6. Dialogue skip and reduced-motion variants produce identical quest effects. Subtitles, focus, touch controls, pause behavior, non-color telegraphs, and narrow-width HUD meet the Act I accessibility bar.
7. The `#control-tower` arena route, arena high scores, and existing focused tests remain isolated from `#control-tower-rpg` state and saves.
8. Focused RPG reducer/content/save tests, all `control-tower-shift` regression tests, production build, and one complete real-browser playthrough pass before the epilogue route is exposed.
9. Each completed region is revisitable through accepted Witness Paths and restores its exact selected terrain/route, memory-language, relationship, and enemy-overlay state.
10. Each optional regional story records only its documented mystery evidence, has a neutral fallback when skipped, and never gates the next act or adds boss damage.

## Scope controls

- One open-zone region per act; no seamless world, procedural maps, radiant quests, repeatable camps, naval simulation, conquest system, multiplayer, live-service economy, or loot treadmill.
- One optional narrative loop per region in this implementation phase. Additional patron stories wait until the full main path is accepted.
- Story choices affect tone, affinity, optional resolutions, and epilogue state. They do not fork the five-act map/mission sequence.
- No patron-specific required route, objective, or boss solution. No newly invented duplicate power IDs where a current mythology-grounded power already exists.
- No mid-combat saves, dynamic day/night simulation, fully voiced production, motion-captured cinematics, or empty “coming soon” exits inside accepted regions.
- No copied layouts, characters, dialogue, plot, factions, quest structures, branded terminology, interface, assets, combat identity, progression loops, or other proprietary expression from *Hades*, *Assassin's Creed Odyssey*, or another game.
