// Act II content scaffold — Pelagos Isles: The Salt Covenant.
//
// Derived strictly from ACTS-II-V-BLUEPRINT.md (Act II) and STORY-BIBLE.md.
// This is a future integration seam, not a second RPG engine: pure authored
// data + pure lookup helpers. No time reads, no RNG, no DOM, no browser
// globals, no network. All exports are deep-frozen so imported data can never
// be mutated.
//
// Canonical contracts referenced here (referenced by ID only, never redefined):
//   - Monster types from game/characters.js MONSTER_TYPES
//   - Deity keys from game/characters.js GODS (poseidon, oceanus, aphrodite,
//     eros, hermes are the Act II patron cast)
//   - Act I completion prerequisites: `mq-act1-ash-at-dawn` completed and the
//     restored Far-Sighted epithet (`act1-far-sighted-restored`)
//   - Save contract stays schema-v1; this module adds known content IDs only.
//
// Story logic reasons only about the stable kebab-case IDs below; display
// text is never used to infer progression.

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

// ─── Region identity ───────────────────────────────────────────
export const ACT2_REGION_ID = 'pelagos-isles'
export const ACT2_MAIN_QUEST_ID = 'mq-act2-salt-covenant'
export const ACT2_SIDE_QUEST_ID = 'sq-act2-unmoored-heart'

// Entry requires Act I completion AND the restored Far-Sighted epithet.
export const ACT2_PRECONDITIONS = deepFreeze([
  { kind: 'quest-complete', questId: 'mq-act1-ash-at-dawn' },
  { kind: 'flag', flagId: 'act1-far-sighted-restored', value: true },
])

// ─── Pockets ───────────────────────────────────────────────────
// Five authored pockets. `spawns` holds every named spawn; `spawnId` is the
// default entry checkpoint for a fresh arrival. Geometry (walkable lanes,
// entities, decor) is authored by the map-owning worker at integration time;
// this scaffold owns only the stable IDs and connection graph.
export const ACT2_POCKETS = deepFreeze({
  'pelagos-harbor': {
    id: 'pelagos-harbor',
    name: 'Pelagos Harbor',
    region: ACT2_REGION_ID,
    act: 2,
    role: 'hub',
    hub: true,
    spawnId: 'keeper-jetty',
    spawns: {
      'keeper-jetty': { id: 'keeper-jetty', note: 'Default harbor arrival, by Melite\u2019s jetty' },
      'from-breakwater': { id: 'from-breakwater', note: 'Return from the breakwater road' },
      'from-barge': { id: 'from-barge', note: 'Skiff return from the archive barge' },
      'post-covenant': { id: 'post-covenant', note: 'Accepted Act II exit — region completion save' },
    },
    landmarks: ['keeper-jetty', 'poseidon-shrine', 'skiff-docks'],
  },
  'breakwater-road': {
    id: 'breakwater-road',
    name: 'Breakwater Road',
    region: ACT2_REGION_ID,
    act: 2,
    role: 'traversal',
    hub: false,
    spawnId: 'from-harbor',
    spawns: {
      'from-harbor': { id: 'from-harbor', note: 'Harbor-side causeway entry' },
      'from-caves': { id: 'from-caves', note: 'Return from the nereid caves' },
      'surge-witness': { id: 'surge-witness', note: 'Objective marker: first surge telegraph' },
    },
    landmarks: ['tide-well-harbor', 'tide-well-caves'],
  },
  'nereid-caves': {
    id: 'nereid-caves',
    name: 'Nereid Caves',
    region: ACT2_REGION_ID,
    act: 2,
    role: 'dungeon',
    hub: false,
    spawnId: 'from-breakwater',
    spawns: {
      'from-breakwater': { id: 'from-breakwater', note: 'Cave mouth from the breakwater' },
      'from-anchorage': { id: 'from-anchorage', note: 'Return from the storm anchorage' },
      'threshold': { id: 'threshold', note: 'Checkpoint before cave combat' },
    },
    landmarks: ['pressure-shell-1', 'pressure-shell-2', 'pressure-shell-3', 'oceanus-boundary-well', 'nereid-enclave'],
  },
  'storm-anchorage': {
    id: 'storm-anchorage',
    name: 'Storm Anchorage',
    region: ACT2_REGION_ID,
    act: 2,
    role: 'combat',
    hub: false,
    spawnId: 'from-caves',
    spawns: {
      'from-caves': { id: 'from-caves', note: 'Reef platform entry from the caves' },
      'from-barge': { id: 'from-barge', note: 'Skiff return from the archive barge' },
      'rope-lift': { id: 'rope-lift', note: 'Rope lift to the archive skiff route' },
    },
    landmarks: ['rope-lift', 'archive-skiff-dock'],
  },
  'archive-barge-deck': {
    id: 'archive-barge-deck',
    name: 'Archive Barge Deck',
    region: ACT2_REGION_ID,
    act: 2,
    role: 'boss',
    hub: false,
    spawnId: 'from-anchorage',
    spawns: {
      'from-anchorage': { id: 'from-anchorage', note: 'Skiff arrival from the storm anchorage' },
      'from-harbor': { id: 'from-harbor', note: 'Skiff arrival from the harbor docks' },
      'post-boss': { id: 'post-boss', note: 'Resume point after the Leviathan — never inside active combat' },
    },
    landmarks: ['archive-crates', 'mast-hazard', 'leviathan-arena'],
  },
})

// ─── Connections ───────────────────────────────────────────────
// Every connection is reciprocal: an explicit forward edge and its return.
// `arrivalSpawnId` is the named spawn used in the destination pocket;
// `returnSpawnId` is the named spawn used back in the origin pocket. Both
// must exist in their pocket's `spawns` table. No placeholder exits.
export const ACT2_CONNECTIONS = deepFreeze([
  { id: 'harbor-to-breakwater', from: 'pelagos-harbor', to: 'breakwater-road', arrivalSpawnId: 'from-harbor', returnSpawnId: 'from-breakwater', kind: 'foot' },
  { id: 'breakwater-to-harbor', from: 'breakwater-road', to: 'pelagos-harbor', arrivalSpawnId: 'from-breakwater', returnSpawnId: 'from-harbor', kind: 'foot' },
  { id: 'breakwater-to-caves', from: 'breakwater-road', to: 'nereid-caves', arrivalSpawnId: 'from-breakwater', returnSpawnId: 'from-caves', kind: 'foot' },
  { id: 'caves-to-breakwater', from: 'nereid-caves', to: 'breakwater-road', arrivalSpawnId: 'from-caves', returnSpawnId: 'from-breakwater', kind: 'foot' },
  { id: 'caves-to-anchorage', from: 'nereid-caves', to: 'storm-anchorage', arrivalSpawnId: 'from-caves', returnSpawnId: 'from-anchorage', kind: 'foot' },
  { id: 'anchorage-to-caves', from: 'storm-anchorage', to: 'nereid-caves', arrivalSpawnId: 'from-anchorage', returnSpawnId: 'from-caves', kind: 'foot' },
  // Skiff routes: the anchorage unlocks the archive route; the barge returns
  // to the harbor. Every skiff destination has a valid return spawn.
  { id: 'anchorage-to-barge', from: 'storm-anchorage', to: 'archive-barge-deck', arrivalSpawnId: 'from-anchorage', returnSpawnId: 'from-barge', kind: 'skiff', gate: [{ kind: 'flag', flagId: 'act2-anchorage-cleared', value: true }] },
  { id: 'barge-to-harbor', from: 'archive-barge-deck', to: 'pelagos-harbor', arrivalSpawnId: 'from-barge', returnSpawnId: 'from-harbor', kind: 'skiff' },
])

// ─── Main quest: exact eight-step chain ────────────────────────
// IDs and order are authoritative per blueprint §Act II "Main objectives".
export const ACT2_MAIN_OBJECTIVES = deepFreeze([
  { id: 'reach-pelagos-keeper', kind: 'talk', npcId: 'melite', conversationId: 'act2-melite-oath-post', text: 'Meet harbor Keeper Melite and inspect the oath-post' },
  { id: 'witness-first-surge', kind: 'reach', mapId: 'breakwater-road', markerId: 'surge-witness', text: 'Cross the breakwater and learn the tide-state telegraph' },
  { id: 'free-nereid-witnesses', kind: 'free-witnesses', encounterId: 'enc-act2-nereid-caves', entityIds: ['nereid-witness-1', 'nereid-witness-2', 'nereid-witness-3'], count: 3, orderFree: true, text: 'Clear the caves and release the three named witnesses in any order' },
  { id: 'separate-boundary-names', kind: 'interact', entityIds: ['pressure-shell-1', 'pressure-shell-2', 'pressure-shell-3'], count: 3, orderFree: true, text: 'Rotate the three pressure shells to separate harbor-oath from world-boundary' },
  { id: 'secure-storm-anchorage', kind: 'clear-encounter', encounterId: 'enc-act2-anchorage', text: 'Clear the anchorage ambush and activate the archive skiff' },
  { id: 'board-archive-barge', kind: 'interact', entityIds: ['cipher-folio-1', 'cipher-folio-2'], count: 2, orderFree: true, text: 'Recover the two cipher folios from fixed deck locations' },
  { id: 'defeat-archive-leviathan', kind: 'clear-encounter', encounterId: 'boss-act2-archive-leviathan', text: 'Defeat the Archive Leviathan' },
  { id: 'ratify-salt-covenant', kind: 'choose', choiceIds: ['harbor-first', 'boundary-first', 'shared-crossing'], text: 'Ratify the Salt Covenant with Poseidon, Oceanus, the sailors, and the nereids' },
])

export const ACT2_MAIN_QUEST = deepFreeze({
  id: ACT2_MAIN_QUEST_ID,
  kind: 'main',
  act: 2,
  regionId: ACT2_REGION_ID,
  prerequisites: ACT2_PRECONDITIONS,
  objectives: ACT2_MAIN_OBJECTIVES,
  rewards: [{ kind: 'flag', id: 'mq-act2-salt-covenant-completed', value: true }],
})

// ─── Optional loop: The Unmoored Heart ─────────────────────────
// Independently skippable/completable; never gates the main path and never
// changes the skiff gate or main objective order. Skipping it yields a valid
// neutral final-story fallback (no evidence, no affinity, no dead end).
export const ACT2_SIDE_QUEST = deepFreeze({
  id: ACT2_SIDE_QUEST_ID,
  kind: 'side',
  act: 2,
  regionId: ACT2_REGION_ID,
  prerequisites: [],
  objectives: [
    { id: 'follow-echo-markers', kind: 'reach', mapId: 'nereid-caves', markerId: 'echo-cavern', text: 'Follow the fixed echo markers into the side cavern' },
    { id: 'confront-charmed-medusa', kind: 'clear-encounter', encounterId: 'enc-act2-unmoored-charmed', text: 'Face the charmed medusa elite' },
    { id: 'witness-desire-debate', kind: 'choose', choiceIds: ['affinity-aphrodite', 'affinity-eros'], text: 'Let Aphrodite and Eros disagree over whether desire proves identity' },
  ],
  rewards: [
    { kind: 'flag', id: 'evidence-mutual-memory', value: true },
    { kind: 'codex', entryId: 'codex-unmoored-heart' },
    { kind: 'currency', amount: 30 },
  ],
  affinityChoices: ['act2-affinity-aphrodite', 'act2-affinity-eros'],
  skippedFallback: {
    valid: true,
    evidence: null,
    affinity: null,
    note: 'Neutral final-story fallback: the main covenant ratification never requires this loop',
  },
})

// ─── Encounters ────────────────────────────────────────────────
// Fixed base orders per blueprint. Monster IDs are canonical MONSTER_TYPES
// keys. Overlays are data over canonical behavior — they never mutate base
// collision/damage/cooldown/scoring rules. No campaign level is reused in
// Act II (only Act IV's bronze-foundry carries a campaignLevelId).
export const ACT2_ENCOUNTERS = deepFreeze({
  'enc-act2-breakwater': {
    id: 'enc-act2-breakwater',
    activationMapId: 'breakwater-road',
    returnMapId: 'breakwater-road',
    returnSpawnId: 'from-caves',
    campaignLevelId: null,
    title: 'Breakwater Road',
    subtitle: 'Reef-born threats on the crossing.',
    order: ['hydra', 'hydra', 'chronos', 'cerberus'],
    overlay: { kind: 'reef', note: 'Reef overlays on all spawns' },
    completionFlag: 'act2-breakwater-cleared',
    activation: 'traversal',
    repeatable: false,
  },
  'enc-act2-nereid-caves': {
    id: 'enc-act2-nereid-caves',
    activationMapId: 'nereid-caves',
    returnMapId: 'nereid-caves',
    returnSpawnId: 'threshold',
    campaignLevelId: null,
    title: 'Nereid Caves',
    subtitle: 'Stranded witnesses behind pressure-shell doors.',
    order: ['medusa', 'hydra', 'medusa', 'cerberus'],
    overlay: null,
    completionFlag: 'act2-nereid-caves-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'enc-act2-anchorage': {
    id: 'enc-act2-anchorage',
    activationMapId: 'storm-anchorage',
    returnMapId: 'storm-anchorage',
    returnSpawnId: 'rope-lift',
    campaignLevelId: null,
    title: 'Storm Anchorage Ambush',
    subtitle: 'The reef platform will not yield quietly.',
    order: ['chronos', 'minotaur', 'hydra', 'minotaur'],
    overlay: { kind: 'surge-lanes', note: 'Fixed surge lanes telegraphed by the tide system' },
    completionFlag: 'act2-anchorage-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'boss-act2-archive-leviathan': {
    id: 'boss-act2-archive-leviathan',
    activationMapId: 'archive-barge-deck',
    returnMapId: 'archive-barge-deck',
    returnSpawnId: 'post-boss',
    campaignLevelId: null,
    title: 'The Archive Leviathan',
    subtitle: 'It guards stolen clauses — it does not destroy them.',
    boss: {
      core: { baseMonsterType: 'cerberus', note: 'Cerberus-tank core' },
      overlays: [{ kind: 'hydra-heads', targetable: true }],
      phases: ['mast-slam-1', 'mast-slam-2', 'mast-slam-3'],
      telegraphed: true,
    },
    order: ['cerberus'],
    overlay: { kind: 'hydra-heads', targetable: true, note: 'Targetable hydra-head overlays on the core' },
    completionFlag: 'act2-leviathan-defeated',
    activation: 'quest',
    repeatable: false,
    checkpointId: 'checkpoint-archive-barge-boss',
    defeatRestore: { note: 'Defeat restores recovered folios but not boss completion' },
  },
  // Side-loop encounter (The Unmoored Heart) — not part of the main chain.
  'enc-act2-unmoored-charmed': {
    id: 'enc-act2-unmoored-charmed',
    activationMapId: 'nereid-caves',
    returnMapId: 'nereid-caves',
    returnSpawnId: 'from-breakwater',
    campaignLevelId: null,
    title: 'The Charmed Medusa',
    subtitle: 'A song remembered, a name forgotten.',
    order: ['medusa'],
    overlay: { kind: 'charmed', note: 'Single charmed-medusa elite' },
    completionFlag: 'sq-act2-unmoored-medusa-cleared',
    activation: 'side',
    repeatable: false,
    questId: ACT2_SIDE_QUEST_ID,
  },
})

// Encounter → owning quest (exact-once wiring). The side encounter belongs to
// the side quest only; it can never satisfy a main objective.
export const ACT2_ENCOUNTER_OWNER_QUEST = deepFreeze({
  'enc-act2-breakwater': ACT2_MAIN_QUEST_ID,
  'enc-act2-nereid-caves': ACT2_MAIN_QUEST_ID,
  'enc-act2-anchorage': ACT2_MAIN_QUEST_ID,
  'boss-act2-archive-leviathan': ACT2_MAIN_QUEST_ID,
  'enc-act2-unmoored-charmed': ACT2_SIDE_QUEST_ID,
})

// ─── Covenant tide ─────────────────────────────────────────────
// Traversal cycles ONLY when the player activates a marked tide well. Three
// authored states with fixed walkable-lane metadata. Every telegraph carries
// a shape glyph AND a text label — never color alone. The tide pauses during
// dialogue and arena combat; no real-time drowning timer exists.
export const ACT2_TIDE_STATES = deepFreeze({
  ebb: {
    id: 'ebb',
    name: 'Ebb',
    walkableLanes: ['dry-causeway'],
    lockedLanes: ['waist-deep-channel'],
    telegraph: { shapeGlyph: 'chevron-down', cadenceTicks: 90, label: 'Ebb — the causeway lies dry', motion: 'slow-pulse' },
  },
  crossing: {
    id: 'crossing',
    name: 'Crossing',
    walkableLanes: ['dry-causeway', 'waist-deep-channel'],
    lockedLanes: [],
    telegraph: { shapeGlyph: 'double-chevron', cadenceTicks: 60, label: 'Crossing — both lanes passable', motion: 'steady-pulse' },
  },
  surge: {
    id: 'surge',
    name: 'Surge',
    walkableLanes: ['waist-deep-channel'],
    lockedLanes: ['dry-causeway'],
    telegraph: { shapeGlyph: 'chevron-up', cadenceTicks: 30, label: 'Surge — only the channel holds', motion: 'rapid-pulse' },
  },
})

export const ACT2_TIDE_ORDER = deepFreeze(['ebb', 'crossing', 'surge'])

export const ACT2_TIDE_RULES = deepFreeze({
  // The tide advances only at a marked tide well, by explicit interaction.
  advancesOnlyAtWells: true,
  wells: ['tide-well-harbor', 'tide-well-caves'],
  // The tide pauses during dialogue and arena combat; state persists through
  // pocket transitions and is restored identically after reload.
  pausedDuring: ['dialogue', 'combat'],
  persistsAcrossTransitions: true,
  restoredAtCheckpoints: true,
  noDrowningTimer: true,
})

// ─── Save points ───────────────────────────────────────────────
export const ACT2_SAVE_POINTS = deepFreeze({
  'shrine-pelagos-poseidon': { id: 'shrine-pelagos-poseidon', kind: 'shrine', mapId: 'pelagos-harbor', deityId: 'poseidon', note: 'First harbor arrival and after patron changes' },
  'checkpoint-nereid-threshold': { id: 'checkpoint-nereid-threshold', kind: 'checkpoint', mapId: 'nereid-caves', spawnId: 'threshold', note: 'Before cave combat' },
  'checkpoint-storm-anchorage-cleared': { id: 'checkpoint-storm-anchorage-cleared', kind: 'checkpoint', mapId: 'storm-anchorage', spawnId: 'rope-lift', note: 'After the anchorage event' },
  'checkpoint-archive-barge-boss': { id: 'checkpoint-archive-barge-boss', kind: 'checkpoint', mapId: 'archive-barge-deck', spawnId: 'from-anchorage', note: 'Before the Leviathan; defeat restores folios but not completion' },
  'checkpoint-pelagos-completion': { id: 'checkpoint-pelagos-completion', kind: 'checkpoint', mapId: 'pelagos-harbor', spawnId: 'post-covenant', note: 'Region completion save' },
})

// ─── Permanent flags ───────────────────────────────────────────
// Exact list per blueprint. Each changes absent/false → true once (except
// `act2-restoration-form`, which stores the single ratified formulation ID).
export const ACT2_PERMANENT_FLAGS = deepFreeze([
  'act2-pelagos-arrived',
  'act2-breakwater-cleared',
  'act2-nereid-caves-cleared',
  'act2-nereids-freed',
  'act2-boundary-separated',
  'act2-anchorage-cleared',
  'act2-folios-recovered',
  'act2-leviathan-defeated',
  'act2-salt-covenant-ratified',
  'act2-restoration-form',
  'mq-act2-salt-covenant-completed',
])

// Documented shared/optional IDs that are intentionally not `act2-` prefixed.
export const ACT2_SHARED_FLAG_IDS = deepFreeze([
  'evidence-mutual-memory', // cross-act mystery evidence (STORY-BIBLE)
])
export const ACT2_OPTIONAL_FLAG_IDS = deepFreeze([
  'evidence-mutual-memory',
  'act2-affinity-aphrodite',
  'act2-affinity-eros',
])

// ─── Restoration formulations ──────────────────────────────────
// Three ratified forms (STORY-BIBLE §restoration ledger). Every form
// completes the SAME linear main quest — choices alter terrain, language,
// and overlays, never the objective graph or the next act's prerequisites.
export const ACT2_RESTORATION_FORMULATIONS = deepFreeze([
  {
    id: 'harbor-first',
    name: 'Harbor-First',
    completesQuestId: ACT2_MAIN_QUEST_ID,
    completesObjectiveId: 'ratify-salt-covenant',
    terrain: 'Stable docks and faster skiff access; one nereid cavern remains tide-limited',
    language: 'Sailors call Poseidon protector; nereids retain separate boundary language',
    enemyOverlay: 'Reef enemies leave dock NPCs alone but guard caves more aggressively',
    evidenceWeight: { authority: 1, reciprocity: 1 },
  },
  {
    id: 'boundary-first',
    name: 'Boundary-First',
    completesQuestId: ACT2_MAIN_QUEST_ID,
    completesObjectiveId: 'ratify-salt-covenant',
    terrain: 'Nereid caves stay open; outer docks require tide-well activation',
    language: 'Oceanus affirms limits; merchants complain but acknowledge passage terms',
    enemyOverlay: 'Enemies cannot cross boundary seals and cluster at their edges',
    evidenceWeight: { autonomy: 1, authority: 1 },
  },
  {
    id: 'shared-crossing',
    name: 'Shared Crossing',
    completesQuestId: ACT2_MAIN_QUEST_ID,
    completesObjectiveId: 'ratify-salt-covenant',
    terrain: 'Timed-by-interaction crossing opens both routes after local consent posts',
    language: '"Arrival" and "permission" remain distinct in dialogue',
    enemyOverlay: 'Creatures lose fused surge behavior but retain varied reef overlays',
    evidenceWeight: { reciprocity: 1, plurality: 1 },
  },
])

// ─── Region definition (integration seam) ──────────────────────
export const ACT2_REGION = deepFreeze({
  id: ACT2_REGION_ID,
  act: 2,
  name: 'Pelagos Isles: The Salt Covenant',
  entry: { mapId: 'pelagos-harbor', spawnId: 'keeper-jetty', prerequisites: ACT2_PRECONDITIONS },
  pockets: ACT2_POCKETS,
  connections: ACT2_CONNECTIONS,
  mainQuestId: ACT2_MAIN_QUEST_ID,
  optionalQuestId: ACT2_SIDE_QUEST_ID,
  shrineIds: ['shrine-pelagos-poseidon'],
  exit: {
    mapId: 'pelagos-harbor',
    spawnId: 'post-covenant',
    effects: [
      { kind: 'flag', id: 'mq-act2-salt-covenant-completed', value: true },
      { kind: 'unlock-region', regionId: 'fields-of-kore', note: 'Act III unlocks exactly once' },
    ],
  },
})

// ─── Lookup helpers ────────────────────────────────────────────
// All lookups return null for unknown IDs and never guess from display text.
export function act2PocketById(id) {
  return (typeof id === 'string' && ACT2_POCKETS[id]) || null
}

export function act2SpawnById(pocketId, spawnId) {
  const pocket = act2PocketById(pocketId)
  if (!pocket || typeof spawnId !== 'string') return null
  return (pocket.spawns && pocket.spawns[spawnId]) || null
}

export function act2ConnectionById(id) {
  return ACT2_CONNECTIONS.find((c) => c.id === id) || null
}

export function act2EncounterById(id) {
  return (typeof id === 'string' && ACT2_ENCOUNTERS[id]) || null
}

export function act2QuestById(id) {
  if (id === ACT2_MAIN_QUEST_ID) return ACT2_MAIN_QUEST
  if (id === ACT2_SIDE_QUEST_ID) return ACT2_SIDE_QUEST
  return null
}

export function act2ObjectiveById(id) {
  for (const quest of [ACT2_MAIN_QUEST, ACT2_SIDE_QUEST]) {
    const found = quest.objectives.find((o) => o.id === id)
    if (found) return found
  }
  return null
}

export function act2TideStateById(id) {
  return (typeof id === 'string' && ACT2_TIDE_STATES[id]) || null
}

export function act2FormulationById(id) {
  return ACT2_RESTORATION_FORMULATIONS.find((f) => f.id === id) || null
}

export function act2SavePointById(id) {
  return (typeof id === 'string' && ACT2_SAVE_POINTS[id]) || null
}

export function act2CompletionFlagForEncounter(encounterId) {
  const enc = act2EncounterById(encounterId)
  return enc ? enc.completionFlag : null
}
