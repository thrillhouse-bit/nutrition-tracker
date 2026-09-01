// Act III content scaffold — Fields of Kore: The Withered Year.
//
// Derived strictly from ACTS-II-V-BLUEPRINT.md (Act III) and STORY-BIBLE.md
// (Act III section + restoration consequence matrix). Future integration
// seam, not a second RPG engine: pure authored data + pure lookup helpers.
// No time reads, no RNG, no DOM, no browser globals, no network. All exports
// are deep-frozen.
//
// Canonical contracts referenced by ID only:
//   - Monster types from game/characters.js MONSTER_TYPES
//   - Deity keys demeter, persephone, hades, dionysus, hera, artemis
//   - Act II completion prerequisites: `mq-act2-salt-covenant` completed and
//     `act2-salt-covenant-ratified`
//   - Save contract stays schema-v1; this module adds known content IDs only.

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

// ─── Region identity ───────────────────────────────────────────
export const ACT3_REGION_ID = 'fields-of-kore'
export const ACT3_MAIN_QUEST_ID = 'mq-act3-withered-year'
export const ACT3_SIDE_QUEST_ID = 'sq-act3-cup-between-seasons'

export const ACT3_PRECONDITIONS = deepFreeze([
  { kind: 'quest-complete', questId: 'mq-act2-salt-covenant' },
  { kind: 'flag', flagId: 'act2-salt-covenant-ratified', value: true },
])

// ─── Pockets ───────────────────────────────────────────────────
export const ACT3_POCKETS = deepFreeze({
  'wheat-village': {
    id: 'wheat-village',
    name: 'Wheat Village',
    region: ACT3_REGION_ID,
    act: 3,
    role: 'hub',
    hub: true,
    spawnId: 'granary',
    spawns: {
      'granary': { id: 'granary', note: 'Default arrival by the Keeper granary' },
      'from-orchard': { id: 'from-orchard', note: 'Return from the winter orchard' },
      'from-threshing': { id: 'from-threshing', note: 'Return after the Echo falls' },
      'first-thaw': { id: 'first-thaw', note: 'Accepted Act III exit — region completion save' },
    },
    landmarks: ['keeper-granary', 'demeter-shrine', 'frozen-villagers'],
  },
  'winter-orchard': {
    id: 'winter-orchard',
    name: 'Winter Orchard',
    region: ACT3_REGION_ID,
    act: 3,
    role: 'traversal',
    hub: false,
    spawnId: 'from-village',
    spawns: {
      'from-village': { id: 'from-village', note: 'Village-side orchard entry' },
      'from-sanctuary': { id: 'from-sanctuary', note: 'Return from Kore Sanctuary' },
      'orchard-spring': { id: 'orchard-spring', note: 'Checkpoint after both traversal altars activate' },
    },
    // The seasonal overlay toggles here; the vineyard exists only in the
    // brief transition between states (optional loop setting).
    landmarks: ['harvest-altar', 'winter-altar', 'frozen-spring', 'vineyard-between'],
    seasonalOverlay: true,
  },
  'kore-sanctuary': {
    id: 'kore-sanctuary',
    name: 'Kore Sanctuary',
    region: ACT3_REGION_ID,
    act: 3,
    role: 'dungeon',
    hub: false,
    spawnId: 'from-orchard',
    spawns: {
      'from-orchard': { id: 'from-orchard', note: 'Sanctuary entry from the orchard' },
      'from-asphodel': { id: 'from-asphodel', note: 'Return from the Asphodel Gate' },
      'seal-chamber': { id: 'seal-chamber', note: 'Checkpoint before the seal sequence' },
    },
    landmarks: ['pomegranate-seal-1', 'pomegranate-seal-2', 'pomegranate-seal-3', 'pomegranate-seal-4', 'descent-gate'],
  },
  'asphodel-gate': {
    id: 'asphodel-gate',
    name: 'Asphodel Gate',
    region: ACT3_REGION_ID,
    act: 3,
    role: 'dungeon',
    hub: false,
    spawnId: 'from-sanctuary',
    spawns: {
      'from-sanctuary': { id: 'from-sanctuary', note: 'Chthonic entry from the descent gate' },
      'kleio-threshold': { id: 'kleio-threshold', note: 'Checkpoint after Kleio\u2019s testimony' },
    },
    landmarks: ['witness-shades', 'hades-threshold'],
  },
  'threshing-circle': {
    id: 'threshing-circle',
    name: 'Threshing Circle',
    region: ACT3_REGION_ID,
    act: 3,
    role: 'boss',
    hub: false,
    spawnId: 'from-village',
    spawns: {
      'from-village': { id: 'from-village', note: 'Village-side circle entry after the covenant joins' },
      'post-boss': { id: 'post-boss', note: 'Resume point after the Winter Mother Echo — never inside active combat' },
    },
    // The field is split into winter and harvest halves.
    landmarks: ['winter-half', 'harvest-half'],
    seasonalOverlay: true,
  },
})

// ─── Connections ───────────────────────────────────────────────
// Reciprocal foot edges; the threshing circle gates on the joined covenant
// (boss comes after Kleio's testimony and the halves join). No placeholder
// exits; every destination and return spawn exists in its pocket's table.
export const ACT3_CONNECTIONS = deepFreeze([
  { id: 'village-to-orchard', from: 'wheat-village', to: 'winter-orchard', arrivalSpawnId: 'from-village', returnSpawnId: 'from-orchard', kind: 'foot' },
  { id: 'orchard-to-village', from: 'winter-orchard', to: 'wheat-village', arrivalSpawnId: 'from-orchard', returnSpawnId: 'from-village', kind: 'foot' },
  { id: 'orchard-to-sanctuary', from: 'winter-orchard', to: 'kore-sanctuary', arrivalSpawnId: 'from-orchard', returnSpawnId: 'from-sanctuary', kind: 'foot' },
  { id: 'sanctuary-to-orchard', from: 'kore-sanctuary', to: 'winter-orchard', arrivalSpawnId: 'from-sanctuary', returnSpawnId: 'from-orchard', kind: 'foot' },
  { id: 'sanctuary-to-asphodel', from: 'kore-sanctuary', to: 'asphodel-gate', arrivalSpawnId: 'from-sanctuary', returnSpawnId: 'from-asphodel', kind: 'foot' },
  { id: 'asphodel-to-sanctuary', from: 'asphodel-gate', to: 'kore-sanctuary', arrivalSpawnId: 'from-asphodel', returnSpawnId: 'from-sanctuary', kind: 'foot' },
  { id: 'village-to-threshing', from: 'wheat-village', to: 'threshing-circle', arrivalSpawnId: 'from-village', returnSpawnId: 'from-threshing', kind: 'foot', gate: [{ kind: 'flag', flagId: 'act3-covenant-joined', value: true }] },
  { id: 'threshing-to-village', from: 'threshing-circle', to: 'wheat-village', arrivalSpawnId: 'from-threshing', returnSpawnId: 'from-village', kind: 'foot' },
])

// ─── Main quest: exact eight-step chain ────────────────────────
export const ACT3_MAIN_OBJECTIVES = deepFreeze([
  { id: 'hear-the-stilled-year', kind: 'multi-talk', speakerIds: ['demeter', 'persephone', 'villager-1', 'villager-2'], count: 4, orderFree: true, text: 'Speak to Demeter, Persephone, and two villagers in any order' },
  { id: 'restore-orchard-paths', kind: 'interact', entityIds: ['harvest-altar', 'winter-altar'], count: 2, orderFree: true, text: 'Activate the harvest and winter altars, learning seasonal traversal' },
  { id: 'recover-seed-half', kind: 'clear-encounter', encounterId: 'enc-act3-orchard-tracks', grantsItem: 'demeter-seed-half', text: 'Clear the orchard guardian and collect Demeter\u2019s half-promise' },
  { id: 'recover-return-half', kind: 'interact', entityIds: ['pomegranate-seal-1', 'pomegranate-seal-2', 'pomegranate-seal-3', 'pomegranate-seal-4'], count: 4, orderFree: false, grantsItem: 'persephone-return-half', text: 'Solve the sanctuary\u2019s ordered pomegranate seals and collect Persephone\u2019s half' },
  { id: 'petition-hades', kind: 'talk', npcId: 'kleio', mapId: 'asphodel-gate', conversationId: 'act3-kleio-testimony', text: 'Cross the Asphodel Gate and identify the dead midwife Kleio as the missing mortal witness' },
  { id: 'join-the-covenant', kind: 'choose', choiceIds: ['continuity-kept', 'departure-protected', 'witnessed-cycle'], requiresOrdering: 'petition-hades', text: 'Combine both halves after Kleio\u2019s testimony and ratify the Return covenant' },
  { id: 'defeat-winter-mother-echo', kind: 'clear-encounter', encounterId: 'boss-act3-winter-mother-echo', text: 'Survive the alternating seasonal phases and destroy the counterfeit memory' },
  { id: 'witness-first-thaw', kind: 'reach', mapId: 'wheat-village', markerId: 'first-thaw', text: 'Return to the village and complete the joined covenant' },
])

export const ACT3_MAIN_QUEST = deepFreeze({
  id: ACT3_MAIN_QUEST_ID,
  kind: 'main',
  act: 3,
  regionId: ACT3_REGION_ID,
  prerequisites: ACT3_PRECONDITIONS,
  objectives: ACT3_MAIN_OBJECTIVES,
  rewards: [{ kind: 'flag', id: 'mq-act3-withered-year-completed', value: true }],
})

// ─── Optional loop: The Cup Between Seasons ────────────────────
// Independently skippable/completable; never gates the main path or the next
// act. Skipping yields a valid neutral final-story fallback.
export const ACT3_SIDE_QUEST = deepFreeze({
  id: ACT3_SIDE_QUEST_ID,
  kind: 'side',
  act: 3,
  regionId: ACT3_REGION_ID,
  prerequisites: [],
  objectives: [
    { id: 'reach-vineyard-threshold', kind: 'reach', mapId: 'winter-orchard', markerId: 'vineyard-between', text: 'Enter the vineyard that exists only between states' },
    { id: 'recover-ceremonial-cup', kind: 'interact', entityIds: ['ceremonial-cup'], count: 1, orderFree: false, text: 'Recover Dionysus\u2019s ceremonial cup' },
    { id: 'witness-ritual-dispute', kind: 'choose', choiceIds: ['rite-renewed', 'rite-released'], text: 'Let Hera question whether a ritual without its household still binds anyone' },
  ],
  rewards: [
    { kind: 'flag', id: 'evidence-backdated-rite', value: true },
    { kind: 'codex', entryId: 'codex-cup-between-seasons' },
    { kind: 'currency', amount: 30 },
  ],
  affinityChoices: ['act3-rite-renewed', 'act3-rite-released'],
  skippedFallback: {
    valid: true,
    evidence: null,
    affinity: null,
    note: 'Neutral final-story fallback: the Return covenant never requires this loop',
  },
})

// ─── Encounters ────────────────────────────────────────────────
export const ACT3_ENCOUNTERS = deepFreeze({
  'enc-act3-orchard-tracks': {
    id: 'enc-act3-orchard-tracks',
    activationMapId: 'winter-orchard',
    returnMapId: 'winter-orchard',
    returnSpawnId: 'orchard-spring',
    campaignLevelId: null,
    title: 'Orchard Tracks',
    subtitle: 'Something circles the frozen spring.',
    order: ['chronos', 'medusa', 'hydra', 'medusa'],
    overlay: { kind: 'winter-slow-zones', note: 'Winter slow zones on the traversal routes' },
    completionFlag: 'act3-orchard-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'enc-act3-kore-sanctuary': {
    id: 'enc-act3-kore-sanctuary',
    activationMapId: 'kore-sanctuary',
    returnMapId: 'kore-sanctuary',
    returnSpawnId: 'seal-chamber',
    campaignLevelId: null,
    title: 'Kore Sanctuary Wardens',
    subtitle: 'The seals are not unguarded.',
    order: ['sphinx', 'hydra', 'sphinx', 'cerberus'],
    overlay: null,
    completionFlag: 'act3-sanctuary-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'enc-act3-asphodel': {
    id: 'enc-act3-asphodel',
    activationMapId: 'asphodel-gate',
    returnMapId: 'asphodel-gate',
    returnSpawnId: 'kleio-threshold',
    campaignLevelId: null,
    title: 'Asphodel Threshold',
    subtitle: 'The shades do not part quietly.',
    order: ['cerberus', 'chronos', 'chronos', 'cerberus'],
    overlay: { kind: 'shade', note: 'Shade overlays on all spawns' },
    completionFlag: 'act3-asphodel-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'boss-act3-winter-mother-echo': {
    id: 'boss-act3-winter-mother-echo',
    activationMapId: 'threshing-circle',
    returnMapId: 'threshing-circle',
    returnSpawnId: 'post-boss',
    campaignLevelId: null,
    title: 'The Winter Mother Echo',
    subtitle: 'A memory built from Demeter\u2019s fear and the Loom\u2019s false Elia.',
    boss: {
      core: { baseMonsterType: 'medusa', note: 'Medusa-control core' },
      overlays: [
        { kind: 'harvest-adds', note: 'Harvest-half adds during harvest phase' },
        { kind: 'winter-hazards', note: 'Winter hazards during winter phase' },
      ],
      // The boss alternates seasonal phases deterministically; telegraphs are
      // shape + label based, never color-only (Act III acceptance criterion 3).
      phases: ['harvest-phase', 'winter-phase'],
      alternating: true,
      telegraphed: true,
      nonColorTelegraphs: true,
    },
    order: ['medusa'],
    overlay: { kind: 'seasonal-alternation', note: 'Alternating harvest adds / winter hazards' },
    completionFlag: 'act3-winter-echo-defeated',
    activation: 'quest',
    repeatable: false,
    checkpointId: 'checkpoint-threshing-boss',
    defeatRestore: { note: 'Defeat restores the village thaw state and unlocks Act IV exactly once' },
  },
})

export const ACT3_ENCOUNTER_OWNER_QUEST = deepFreeze({
  'enc-act3-orchard-tracks': ACT3_MAIN_QUEST_ID,
  'enc-act3-kore-sanctuary': ACT3_MAIN_QUEST_ID,
  'enc-act3-asphodel': ACT3_MAIN_QUEST_ID,
  'boss-act3-winter-mother-echo': ACT3_MAIN_QUEST_ID,
})

// ─── Seasonal overlay mechanic ─────────────────────────────────
// Designated pockets toggle between exactly two authored states only at
// paired altars. Objective markers always identify the reachable route. The
// toggle is disabled during combat; reloading restores the checkpoint's
// exact season. No entity may spawn inside blocked geometry after a toggle
// or reload (integration-time acceptance criterion 1).
export const ACT3_SEASONAL_STATES = deepFreeze({
  harvest: {
    id: 'harvest',
    name: 'Harvest',
    telegraph: { shapeGlyph: 'sheaf', label: 'Harvest state — growth and warmth', motion: 'steady-pulse' },
  },
  winter: {
    id: 'winter',
    name: 'Winter',
    telegraph: { shapeGlyph: 'snowflake', label: 'Winter state — frost and stillness', motion: 'slow-pulse' },
  },
})

export const ACT3_SEASONAL_RULES = deepFreeze({
  togglesOnlyAtPairedAltars: true,
  altars: ['harvest-altar', 'winter-altar'],
  twoAuthoredVariantsPerPocket: true,
  disabledDuring: ['combat'],
  restoredAtCheckpoints: true,
  appliesToPockets: ['winter-orchard', 'threshing-circle'],
  telegraphsAreNonColor: true,
})

// ─── Save points ───────────────────────────────────────────────
export const ACT3_SAVE_POINTS = deepFreeze({
  'shrine-wheat-village-demeter': { id: 'shrine-wheat-village-demeter', kind: 'shrine', mapId: 'wheat-village', deityId: 'demeter', note: 'Arrival and turn-in' },
  'checkpoint-orchard-spring': { id: 'checkpoint-orchard-spring', kind: 'checkpoint', mapId: 'winter-orchard', spawnId: 'orchard-spring', note: 'After both traversal altars activate' },
  'checkpoint-kore-sanctuary': { id: 'checkpoint-kore-sanctuary', kind: 'checkpoint', mapId: 'kore-sanctuary', spawnId: 'seal-chamber', note: 'Before the seal sequence' },
  'checkpoint-asphodel-return': { id: 'checkpoint-asphodel-return', kind: 'checkpoint', mapId: 'asphodel-gate', spawnId: 'kleio-threshold', note: 'After Kleio\u2019s testimony' },
  'checkpoint-threshing-boss': { id: 'checkpoint-threshing-boss', kind: 'checkpoint', mapId: 'threshing-circle', spawnId: 'from-village', note: 'After covenant joining and before the Echo' },
  'checkpoint-fields-completion': { id: 'checkpoint-fields-completion', kind: 'checkpoint', mapId: 'wheat-village', spawnId: 'first-thaw', note: 'Region completion save' },
})

// ─── Permanent flags ───────────────────────────────────────────
// Exact list per blueprint, plus the three encounter-clear flags from the
// encounter table (they are the permanent flags those clears record).
export const ACT3_PERMANENT_FLAGS = deepFreeze([
  'act3-fields-arrived',
  'act3-altars-awakened',
  'act3-seed-half-recovered',
  'act3-return-half-recovered',
  'act3-kleio-witnessed',
  'act3-covenant-joined',
  'act3-restoration-form',
  'act3-orchard-cleared',
  'act3-sanctuary-cleared',
  'act3-asphodel-cleared',
  'act3-winter-echo-defeated',
  'act3-first-thaw',
  'mq-act3-withered-year-completed',
])

export const ACT3_SHARED_FLAG_IDS = deepFreeze([
  'evidence-backdated-rite', // cross-act mystery evidence (STORY-BIBLE)
])

export const ACT3_OPTIONAL_FLAG_IDS = deepFreeze([
  'evidence-backdated-rite',
  'act3-rite-renewed',
  'act3-rite-released',
])

// ─── Restoration formulations (STORY-BIBLE ledger, Act III) ────
// Every form completes the SAME linear main quest; choices alter revisit
// terrain, relationship language, and enemy overlays — never the objective
// graph or the next act's prerequisites.
export const ACT3_RESTORATION_FORMULATIONS = deepFreeze([
  {
    id: 'continuity-kept',
    name: 'Continuity Kept',
    completesQuestId: ACT3_MAIN_QUEST_ID,
    completesObjectiveId: 'join-the-covenant',
    terrain: 'Longer harvest state and reliable food route; winter refuge remains narrow',
    language: 'Demeter is reassured; departure language requires explicit leave-taking',
    enemyOverlay: 'Harvest adds weaken; winter hazards remain strong',
    evidenceWeight: { authority: 1, reciprocity: 1 },
  },
  {
    id: 'departure-protected',
    name: 'Departure Protected',
    completesQuestId: ACT3_MAIN_QUEST_ID,
    completesObjectiveId: 'join-the-covenant',
    terrain: 'Winter paths stay open and shades may visit the sanctuary edge',
    language: 'Persephone and villagers name absence without treating it as betrayal',
    enemyOverlay: 'Control enemies lose forced-return pulls; roaming threats spread wider',
    evidenceWeight: { autonomy: 1, plurality: 1 },
  },
  {
    id: 'witnessed-cycle',
    name: 'Witnessed Cycle',
    completesQuestId: ACT3_MAIN_QUEST_ID,
    completesObjectiveId: 'join-the-covenant',
    terrain: 'Player chooses harvest/winter at altars; both communities staff the transition',
    language: 'Kleio\u2019s testimony is recited at every change',
    enemyOverlay: 'Enemies adapt to the selected state but gain no extra health',
    evidenceWeight: { reciprocity: 1, autonomy: 1 },
  },
])

// ─── Region definition (integration seam) ──────────────────────
export const ACT3_REGION = deepFreeze({
  id: ACT3_REGION_ID,
  act: 3,
  name: 'Fields of Kore: The Withered Year',
  entry: { mapId: 'wheat-village', spawnId: 'granary', prerequisites: ACT3_PRECONDITIONS },
  pockets: ACT3_POCKETS,
  connections: ACT3_CONNECTIONS,
  mainQuestId: ACT3_MAIN_QUEST_ID,
  optionalQuestId: ACT3_SIDE_QUEST_ID,
  shrineIds: ['shrine-wheat-village-demeter'],
  exit: {
    mapId: 'wheat-village',
    spawnId: 'first-thaw',
    effects: [
      { kind: 'flag', id: 'mq-act3-withered-year-completed', value: true },
      { kind: 'unlock-region', regionId: 'forge-march', note: 'Act IV unlocks exactly once' },
    ],
  },
})

// ─── Lookup helpers ────────────────────────────────────────────
// All lookups return null for unknown IDs and never guess from display text.
export function act3PocketById(id) {
  return (typeof id === 'string' && ACT3_POCKETS[id]) || null
}

export function act3SpawnById(pocketId, spawnId) {
  const pocket = act3PocketById(pocketId)
  if (!pocket || typeof spawnId !== 'string') return null
  return (pocket.spawns && pocket.spawns[spawnId]) || null
}

export function act3ConnectionById(id) {
  return ACT3_CONNECTIONS.find((c) => c.id === id) || null
}

export function act3EncounterById(id) {
  return (typeof id === 'string' && ACT3_ENCOUNTERS[id]) || null
}

export function act3QuestById(id) {
  if (id === ACT3_MAIN_QUEST_ID) return ACT3_MAIN_QUEST
  if (id === ACT3_SIDE_QUEST_ID) return ACT3_SIDE_QUEST
  return null
}

export function act3ObjectiveById(id) {
  for (const quest of [ACT3_MAIN_QUEST, ACT3_SIDE_QUEST]) {
    const found = quest.objectives.find((o) => o.id === id)
    if (found) return found
  }
  return null
}

export function act3SeasonalStateById(id) {
  return (typeof id === 'string' && ACT3_SEASONAL_STATES[id]) || null
}

export function act3FormulationById(id) {
  return ACT3_RESTORATION_FORMULATIONS.find((f) => f.id === id) || null
}

export function act3SavePointById(id) {
  return (typeof id === 'string' && ACT3_SAVE_POINTS[id]) || null
}

export function act3CompletionFlagForEncounter(encounterId) {
  const enc = act3EncounterById(encounterId)
  return enc ? enc.completionFlag : null
}
