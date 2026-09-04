// Act V content scaffold — Night Stair and Silent Loom: The Last Name.
//
// Pure authored data for the final linear region. This module deliberately
// owns no reducer, rendering, save, combat, or eligibility logic. Runtime
// systems consume stable IDs and emit the documented effects exactly once.
// No time reads, RNG, DOM, browser globals, or network access. All exported
// data is recursively frozen.
//
// Entry uses the completion flag Act IV actually emits
// (`mq-act4-false-constellation-completed`), not the blueprint's shorthand
// quest-state wording. The ratified mortal draft remains a separate gate.

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

export const ACT5_REGION_ID = 'night-stair'
export const ACT5_MAIN_QUEST_ID = 'mq-act5-last-name'
export const ACT5_SIDE_QUEST_ID = 'sq-act5-light-no-map-remembers'

export const ACT5_PRECONDITIONS = deepFreeze([
  { kind: 'flag', flagId: 'mq-act4-false-constellation-completed', value: true },
  { kind: 'flag', flagId: 'act4-mortal-draft-ratified', value: true },
])

const arrivalState = (lightStateId) => ({ lightStateId })

// ─── Authored pockets and graph ───────────────────────────────
export const ACT5_POCKETS = deepFreeze({
  'nyx-foothold': {
    id: 'nyx-foothold',
    name: 'Nyx Foothold',
    region: ACT5_REGION_ID,
    act: 5,
    role: 'hub',
    hub: true,
    spawnId: 'keeper-camp',
    spawns: {
      'keeper-camp': { id: 'keeper-camp', arrivalState: arrivalState('shadow'), note: 'Final Keeper camp and first Act V save' },
      'from-night-stair': { id: 'from-night-stair', arrivalState: arrivalState('shadow'), note: 'Safe return from the ascent' },
      'witness-board': { id: 'witness-board', arrivalState: arrivalState('shadow'), note: 'Review allies, deeds, and neutral fallbacks' },
    },
    landmarks: ['shrine-nyx-foothold', 'ally-witness-board', 'shadow-seal-first'],
  },
  'night-stair': {
    id: 'night-stair',
    name: 'The Night Stair',
    region: ACT5_REGION_ID,
    act: 5,
    role: 'traversal-combat',
    hub: false,
    spawnId: 'from-foothold',
    spawns: {
      'from-foothold': { id: 'from-foothold', arrivalState: arrivalState('shadow'), note: 'First shadow bridge from Nyx Foothold' },
      'from-false-sky': { id: 'from-false-sky', arrivalState: arrivalState('moon'), note: 'Return from the false-sky threshold' },
      'anchors-stable': { id: 'anchors-stable', arrivalState: arrivalState('shadow'), note: 'Checkpoint after all four memory anchors' },
      'selene-overlook': { id: 'selene-overlook', arrivalState: arrivalState('moon'), note: 'Optional light-without-a-map loop' },
    },
    landmarks: ['memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4', 'selene-overlook'],
  },
  'false-sky': {
    id: 'false-sky',
    name: 'The False Sky',
    region: ACT5_REGION_ID,
    act: 5,
    role: 'dungeon',
    hub: false,
    spawnId: 'from-night-stair',
    spawns: {
      'from-night-stair': { id: 'from-night-stair', arrivalState: arrivalState('moon'), note: 'Moonlit threshold from Night Stair' },
      'from-approach': { id: 'from-approach', arrivalState: arrivalState('sun'), note: 'Return from the Loom approach' },
      'mirrors-aligned': { id: 'mirrors-aligned', arrivalState: arrivalState('sun'), note: 'Checkpoint after Helios turns the false dawn' },
    },
    landmarks: ['sun-mirror-1', 'sun-mirror-2', 'sun-mirror-3', 'fracture-room-a', 'fracture-room-b'],
  },
  'silent-loom-approach': {
    id: 'silent-loom-approach',
    name: 'Silent Loom Approach',
    region: ACT5_REGION_ID,
    act: 5,
    role: 'combat',
    hub: false,
    spawnId: 'from-false-sky',
    spawns: {
      'from-false-sky': { id: 'from-false-sky', arrivalState: arrivalState('sun'), note: 'Point-of-no-return threshold' },
      'from-loom': { id: 'from-loom', arrivalState: arrivalState('sun'), note: 'Return from the covenant chamber after final combat' },
      'epithets-sealed': { id: 'epithets-sealed', arrivalState: arrivalState('sun'), note: 'Checkpoint after the four witnessed deeds' },
    },
    landmarks: ['seal-far-sighted', 'seal-salt-covenant', 'seal-she-who-returns', 'seal-shared-fire'],
  },
  'silent-loom': {
    id: 'silent-loom',
    name: 'The Silent Loom',
    region: ACT5_REGION_ID,
    act: 5,
    role: 'boss',
    hub: false,
    spawnId: 'from-approach',
    spawns: {
      'from-approach': { id: 'from-approach', arrivalState: arrivalState('sun'), note: 'Clean start before Loom Guardian phase one' },
      'regent-phase': { id: 'regent-phase', arrivalState: arrivalState('sun'), note: 'Checkpoint boundary after the Guardian' },
      'accord-chamber': { id: 'accord-chamber', arrivalState: arrivalState('sun'), note: 'Constitutional choice after the Regent falls' },
      'from-overlook': { id: 'from-overlook', arrivalState: arrivalState('sun'), note: 'Post-game return; bosses remain defeated' },
    },
    landmarks: ['loom-heart', 'guardian-ring', 'regent-dais', 'accord-table'],
  },
  'accord-overlook': {
    id: 'accord-overlook',
    name: 'Accord Overlook',
    region: ACT5_REGION_ID,
    act: 5,
    role: 'epilogue',
    hub: false,
    spawnId: 'epilogue',
    spawns: {
      epilogue: { id: 'epilogue', arrivalState: arrivalState('sun'), note: 'Stable post-game save and deterministic tableau' },
      'from-loom': { id: 'from-loom', arrivalState: arrivalState('sun'), note: 'Post-game path back to the covenant chamber' },
    },
    landmarks: ['public-accord', 'witness-path-stone', 'epilogue-sky'],
  },
})

export const ACT5_CONNECTIONS = deepFreeze([
  { id: 'foothold-to-night-stair', from: 'nyx-foothold', to: 'night-stair', arrivalSpawnId: 'from-foothold', returnSpawnId: 'from-night-stair', kind: 'shadow-bridge' },
  { id: 'night-stair-to-foothold', from: 'night-stair', to: 'nyx-foothold', arrivalSpawnId: 'from-night-stair', returnSpawnId: 'from-foothold', kind: 'shadow-bridge' },
  { id: 'night-stair-to-false-sky', from: 'night-stair', to: 'false-sky', arrivalSpawnId: 'from-night-stair', returnSpawnId: 'from-false-sky', kind: 'moon-bridge', gate: [{ kind: 'flag', flagId: 'act5-moon-witnesses-aligned', value: true }] },
  { id: 'false-sky-to-night-stair', from: 'false-sky', to: 'night-stair', arrivalSpawnId: 'from-false-sky', returnSpawnId: 'from-night-stair', kind: 'moon-bridge' },
  { id: 'false-sky-to-loom-approach', from: 'false-sky', to: 'silent-loom-approach', arrivalSpawnId: 'from-false-sky', returnSpawnId: 'from-approach', kind: 'sun-mirror-route', gate: [{ kind: 'flag', flagId: 'act5-time-fractures-crossed', value: true }] },
  { id: 'loom-approach-to-false-sky', from: 'silent-loom-approach', to: 'false-sky', arrivalSpawnId: 'from-approach', returnSpawnId: 'from-false-sky', kind: 'sun-mirror-route' },
  { id: 'loom-approach-to-silent-loom', from: 'silent-loom-approach', to: 'silent-loom', arrivalSpawnId: 'from-approach', returnSpawnId: 'from-loom', kind: 'witness-seal', gate: [{ kind: 'flag', flagId: 'act5-epithets-restored', value: true }] },
  { id: 'silent-loom-to-approach', from: 'silent-loom', to: 'silent-loom-approach', arrivalSpawnId: 'from-loom', returnSpawnId: 'from-approach', kind: 'witness-seal' },
  { id: 'silent-loom-to-overlook', from: 'silent-loom', to: 'accord-overlook', arrivalSpawnId: 'epilogue', returnSpawnId: 'from-overlook', kind: 'epilogue-path', gate: [{ kind: 'flag', flagId: 'act5-last-name-witnessed', value: true }] },
  { id: 'overlook-to-silent-loom', from: 'accord-overlook', to: 'silent-loom', arrivalSpawnId: 'from-overlook', returnSpawnId: 'from-loom', kind: 'epilogue-path', gate: [{ kind: 'flag', flagId: 'mq-act5-last-name-completed', value: true }] },
])

// Interior detours rejoin their owning pocket and never create story gates.
export const ACT5_OPTIONAL_LOOPS = deepFreeze([
  { id: 'loop-selene-overlook', mapId: 'night-stair', entryMarkerId: 'selene-path-split', rejoinMarkerId: 'anchor-3-landing', questId: ACT5_SIDE_QUEST_ID, required: false },
  { id: 'loop-unwritten-witnesses', mapId: 'nyx-foothold', entryMarkerId: 'archive-tent', rejoinMarkerId: 'ally-witness-board', reward: { kind: 'codex', entryId: 'codex-unwritten-witnesses' }, required: false },
  { id: 'loop-afterimage-gallery', mapId: 'false-sky', entryMarkerId: 'fracture-room-a-side', rejoinMarkerId: 'sun-mirror-3', reward: { kind: 'currency', amount: 20 }, required: false },
])

// ─── Main and optional quests ─────────────────────────────────
export const ACT5_WITNESSED_DEEDS = deepFreeze([
  { act: 1, epithetId: 'far-sighted', sealId: 'seal-far-sighted', requiredFlagId: 'act1-far-sighted-restored', witnessedDeed: 'A warning was carried to people who could choose how to answer it.' },
  { act: 2, epithetId: 'salt-covenant', sealId: 'seal-salt-covenant', requiredFlagId: 'act2-salt-covenant-ratified', witnessedDeed: 'Sailors and nereids named both welcome and boundary.' },
  { act: 3, epithetId: 'she-who-returns', sealId: 'seal-she-who-returns', requiredFlagId: 'act3-covenant-joined', witnessedDeed: 'Departure remained lawful because return was freely witnessed.' },
  { act: 4, epithetId: 'shared-fire', sealId: 'seal-shared-fire', requiredFlagId: 'act4-mortal-draft-ratified', witnessedDeed: 'Mortals published who may tend the fire and how consent can be revised.' },
])

export const ACT5_MAIN_OBJECTIVES = deepFreeze([
  { id: 'muster-the-witnesses', kind: 'talk', npcId: 'thessa', conversationId: 'act5-nyx-muster', effects: [{ kind: 'flag', id: 'act5-witnesses-mustered', value: true }], text: 'Review restored allies; every absent optional ally receives a neutral witness' },
  { id: 'cross-night-stair', kind: 'interact', entityIds: ['memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4'], count: 4, orderFree: true, effects: [{ kind: 'flag', id: 'act5-anchors-stable', value: true }], text: 'Cross Nyx\'s shadow bridges and stabilize four memory anchors' },
  { id: 'align-moon-witnesses', kind: 'talk', npcId: 'selene', conversationId: 'act5-selene-reflection', effects: [{ kind: 'flag', id: 'act5-moon-witnesses-aligned', value: true }], text: 'Use reflected witness-light to prove the anchors share one mortal history' },
  { id: 'turn-the-false-dawn', kind: 'interact', entityIds: ['sun-mirror-1', 'sun-mirror-2', 'sun-mirror-3'], count: 3, ordered: true, conversationId: 'act5-helios-false-dawn', effects: [{ kind: 'flag', id: 'act5-false-dawn-turned', value: true }], text: 'Rotate Helios\'s three sun mirrors and expose the Loom route' },
  { id: 'survive-time-fractures', kind: 'reach', mapId: 'false-sky', markerId: 'fracture-exit', fixedStates: ['fracture-a', 'fracture-b'], effects: [{ kind: 'flag', id: 'act5-time-fractures-crossed', value: true }], text: 'Cross Cronus rooms that replay authored positions, never player input' },
  { id: 'restore-the-epithets', kind: 'interact', entityIds: ACT5_WITNESSED_DEEDS.map((deed) => deed.sealId), count: 4, fixedActOrder: [1, 2, 3, 4], restoration: 'witnessed-deeds', effects: [{ kind: 'flag', id: 'act5-epithets-restored', value: true }], text: 'Restore four epithets in act order by recounting the deeds that gave each promise meaning' },
  { id: 'defeat-loom-guardian', kind: 'clear-encounter', encounterId: 'boss-act5-loom-guardian', effects: [{ kind: 'flag', id: 'act5-loom-guardian-defeated', value: true }], text: 'Defeat the Loom Guardian while all four named seals remain recoverable' },
  { id: 'confront-quiet-regent', kind: 'clear-encounter', encounterId: 'boss-act5-quiet-regent', conversationId: 'act5-regent-interruption', requiredWitnessRuleId: 'regent-interruption-witness', effects: [{ kind: 'flag', id: 'act5-quiet-regent-defeated', value: true }], text: 'Fight Damas until witnessed testimony interrupts the final erasure' },
  { id: 'write-the-new-accord', kind: 'choose', choiceIds: ['bounded-patrons', 'mortal-witness', 'renewed-compact'], eligibility: 'ending-evidence-thresholds', effects: [{ kind: 'set-ending', idFromChoice: true }, { kind: 'flag', id: 'act5-accord-choice', valueFromChoice: true }], text: 'Choose the covenant form; benefits, costs, and safeguards remain visible' },
  { id: 'witness-the-last-name', kind: 'talk', npcId: 'kallias', conversationId: 'act5-epilogue', effects: [{ kind: 'flag', id: 'act5-last-name-witnessed', value: true }], text: 'Publish the Accord and create the stable post-game save' },
])

export const ACT5_MAIN_QUEST = deepFreeze({
  id: ACT5_MAIN_QUEST_ID,
  kind: 'main',
  act: 5,
  regionId: ACT5_REGION_ID,
  prerequisites: ACT5_PRECONDITIONS,
  objectives: ACT5_MAIN_OBJECTIVES,
  rewards: [{ kind: 'flag', id: 'mq-act5-last-name-completed', value: true }],
})

export const ACT5_SIDE_QUEST = deepFreeze({
  id: ACT5_SIDE_QUEST_ID,
  kind: 'side',
  act: 5,
  regionId: ACT5_REGION_ID,
  prerequisites: [],
  objectives: [
    { id: 'reach-selene-overlook', kind: 'reach', mapId: 'night-stair', markerId: 'selene-overlook', text: 'Follow stable witness icons to Selene\'s overlook' },
    { id: 'match-star-deeds', kind: 'match', entityIds: ['star-deed-mercy', 'star-deed-vigil', 'star-deed-return', 'star-deed-refusal'], count: 4, orderFree: true, source: 'witnessed-deeds', text: 'Restore four original star names by matching deeds rather than tracing a borrowed constellation' },
    { id: 'witness-three-lights', kind: 'talk', npcIds: ['apollo', 'helios', 'selene'], conversationId: 'act5-three-lights', text: 'Let revelation, endurance, and reflection remain distinct accounts of visibility' },
  ],
  rewards: [
    { kind: 'flag', id: 'evidence-independent-light', value: true },
    { kind: 'flag', id: 'act5-true-sky-restored', value: true },
    { kind: 'codex', entryId: 'codex-light-no-map-remembers' },
    { kind: 'currency', amount: 50 },
    { kind: 'epilogue', treatment: 'plural-true-sky', note: 'Independent witness-lights remain visible together' },
  ],
  skippedFallback: { valid: true, evidence: null, bossModifier: null, note: 'The true-sky loop never changes boss health, phases, or main completion' },
})

// ─── Encounters ───────────────────────────────────────────────
export const ACT5_ENCOUNTERS = deepFreeze({
  'enc-act5-night-stair': {
    id: 'enc-act5-night-stair', activationMapId: 'night-stair', returnMapId: 'night-stair', returnSpawnId: 'anchors-stable', campaignLevelId: null,
    title: 'Erasure on the Stair', order: ['chronos', 'medusa', 'sphinx', 'chronos', 'cerberus'], overlay: { kind: 'erasure-masks' }, seed: 5101,
    completionFlag: 'act5-night-stair-cleared', activation: 'quest', repeatable: false, checkpointId: 'checkpoint-night-stair-anchors',
  },
  'enc-act5-false-sky': {
    id: 'enc-act5-false-sky', activationMapId: 'false-sky', returnMapId: 'false-sky', returnSpawnId: 'mirrors-aligned', campaignLevelId: null,
    title: 'Counterfeit Dawn', order: ['chronos', 'minotaur', 'sphinx', 'atlas'], overlay: { kind: 'fixed-fracture-states', states: ['fracture-a', 'fracture-b'] }, seed: 5201,
    completionFlag: 'act5-false-sky-cleared', activation: 'quest', repeatable: false, checkpointId: 'checkpoint-false-sky-mirrors',
  },
  'enc-act5-loom-approach': {
    id: 'enc-act5-loom-approach', activationMapId: 'silent-loom-approach', returnMapId: 'silent-loom-approach', returnSpawnId: 'epithets-sealed', campaignLevelId: null,
    title: 'Five Suppressed Seals', order: ['hydra', 'cerberus', 'medusa', 'minotaur', 'sphinx'], overlay: { kind: 'witness-seal-bonds', count: 5 }, seed: 5301,
    completionFlag: 'act5-loom-approach-cleared', activation: 'quest', repeatable: false, checkpointId: 'checkpoint-loom-approach',
  },
  'boss-act5-loom-guardian': {
    id: 'boss-act5-loom-guardian', activationMapId: 'silent-loom', returnMapId: 'silent-loom', returnSpawnId: 'regent-phase', campaignLevelId: null,
    title: 'The Loom Guardian', order: ['atlas'], seed: 5401, completionFlag: 'act5-loom-guardian-defeated', activation: 'quest', repeatable: false,
    checkpointId: 'checkpoint-loom-guardian', boss: { core: { baseMonsterType: 'atlas' }, overlays: [{ kind: 'suppressible-seals', count: 4, targetable: true }], phases: ['weft-lock', 'witness-break', 'open-pattern'], fixedPhases: true, telegraphed: true },
  },
  'boss-act5-quiet-regent': {
    id: 'boss-act5-quiet-regent', activationMapId: 'silent-loom', returnMapId: 'silent-loom', returnSpawnId: 'accord-chamber', campaignLevelId: null,
    title: 'Damas, the Quiet Regent', order: ['minotaur', 'chronos'], seed: 5501, completionFlag: 'act5-quiet-regent-defeated', activation: 'quest', repeatable: false,
    checkpointId: 'checkpoint-loom-guardian', boss: { identity: 'damas-quiet-regent', humanScale: true, overlays: ['minotaur-charge', 'chronos-speed'], phases: ['archivist-defense', 'last-erasure'], testimonyInterruptRequired: true, fixedPhases: true, telegraphed: true },
    resolution: { authored: true, executionPrompt: false, note: 'Damas\'s fate follows the authored boss resolution; the Accord remains the climax' },
  },
})

export const ACT5_ENCOUNTER_OWNER_QUEST = deepFreeze(Object.fromEntries(
  Object.keys(ACT5_ENCOUNTERS).map((id) => [id, ACT5_MAIN_QUEST_ID])
))

// ─── Region mechanics ─────────────────────────────────────────
export const ACT5_LIGHT_POLARITY_STATES = deepFreeze({
  shadow: { id: 'shadow', controller: 'nyx-seal', shapeGlyph: 'filled-crescent', label: 'Shadow bridge — sheltered path solid' },
  moon: { id: 'moon', controller: 'selene-witness', shapeGlyph: 'split-disc', label: 'Moon bridge — reflected path solid' },
  sun: { id: 'sun', controller: 'sun-mirror', shapeGlyph: 'rayed-disc', label: 'Sun bridge — exposed path solid' },
})

export const ACT5_LIGHT_POLARITY_RULES = deepFreeze({
  stateIds: ['shadow', 'moon', 'sun'],
  switchSources: ['nyx-seal', 'selene-witness', 'sun-mirror'],
  fixedGeometryPerState: true,
  shapeCoded: true,
  colorOnly: false,
  restoredAtCheckpoints: true,
  cannotHide: ['objective-direction', 'interaction-label', 'subtitle', 'accessibility-name', 'save-point-identity'],
  patronPowersMayBypassTraversal: false,
})

export const ACT5_TIME_FRACTURE_STATES = deepFreeze({
  'fracture-a': { id: 'fracture-a', roomSnapshot: 'a', label: 'First fixed room position' },
  'fracture-b': { id: 'fracture-b', roomSnapshot: 'b', label: 'Second fixed room position' },
})

export const ACT5_TIME_FRACTURE_RULES = deepFreeze({
  order: ['fracture-a', 'fracture-b'],
  deterministic: true,
  recordsPlayerInput: false,
  rewindsDamage: false,
  rewindsCooldowns: false,
  rewindsInventory: false,
  rewindsQuestEvents: false,
  rewindsSaves: false,
  restoredAtCheckpoints: true,
})

export const ACT5_DEITY_ROLES = deepFreeze({
  nyx: { deityId: 'nyx', powerId: 'primordialDark', role: 'Shelters names the Loom cannot perceive; visual resonance never obscures objective UI', requiredPowerUse: false },
  helios: { deityId: 'helios', powerId: 'sunChariot', role: 'Exposes the counterfeit dawn; direct mirror interaction always remains sufficient', requiredPowerUse: false },
  selene: { deityId: 'selene', powerId: 'lunarVeil', role: 'Supplies reflected witness-light without traversal bypass', requiredPowerUse: false },
  cronus: { deityId: 'cronus', powerId: 'temporalRewind', role: 'Explains sequence without rewinding quests, saves, or destiny', requiredPowerUse: false },
})

export const ACT5_WITNESS_RULES = deepFreeze({
  'regent-interruption-witness': {
    id: 'regent-interruption-witness',
    preferred: { npcId: 'ianthe', when: [{ kind: 'flag', flagId: 'revealed-ianthe', value: true }] },
    fallback: { npcId: 'melite', alwaysValid: true },
    exactlyOne: true,
    changesObjectiveGraph: false,
  },
})

// ─── Conversations ────────────────────────────────────────────
export const ACT5_CONVERSATIONS = deepFreeze({
  'act5-nyx-muster': {
    id: 'act5-nyx-muster', speakerIds: ['thessa', 'nyx', 'kallias'], start: 'thessa-record',
    nodes: {
      'thessa-record': { speakerId: 'thessa', text: 'The archive is public now. What vanishes from ink remains in the people who acted.', cameraCue: 'speaker', next: 'nyx-shelter' },
      'nyx-shelter': { speakerId: 'nyx', text: 'Bring me no perfect name. Bring me a promise the Loom cannot separate from its witnesses.', cameraCue: 'reveal', next: 'kallias-answers' },
      'kallias-answers': { speakerId: 'kallias', text: 'Then I am not delivering this draft. I am here to argue every line.', cameraCue: 'player', effects: [{ kind: 'flag', id: 'act5-witnesses-mustered', value: true }], next: 'nyx-ext-1' },
      'nyx-ext-1': { speakerId: 'nyx', text: 'Argue it in the open, where the whole camp can hear you tonight. A promise kept quietly is only a rumor when the Loom comes.', cameraCue: 'speaker', next: 'nyx-ext-2' },
      'nyx-ext-2': { speakerId: 'kallias', text: 'Then nothing here gets signed while anyone sleeps. Every witness repeats their own words out loud before the camp breaks.', cameraCue: 'restore', next: null },
    },
  },
  'act5-selene-reflection': {
    id: 'act5-selene-reflection', speakerIds: ['selene', 'kallias'], start: 'selene-proof',
    nodes: {
      'selene-proof': { speakerId: 'selene', text: 'Reflection is not a lesser truth. It proves another stood somewhere to receive the light.', cameraCue: 'speaker', next: 'kallias-aligns' },
      'kallias-aligns': { speakerId: 'kallias', text: 'Four anchors, one history, and no single owner of it.', cameraCue: 'restore', effects: [{ kind: 'flag', id: 'act5-moon-witnesses-aligned', value: true }], next: 'selene-ext-1' },
      'selene-ext-1': { speakerId: 'selene', text: 'Say that to the ones who want a single lamp. A moon does not dim the sun; it keeps watch when he cannot.', cameraCue: 'speaker', next: 'selene-ext-2' },
      'selene-ext-2': { speakerId: 'kallias', text: 'Then I will carry both kinds of light where the work is. Neither one gets to call the other a copy.', cameraCue: 'restore', next: null },
    },
  },
  'act5-helios-false-dawn': {
    id: 'act5-helios-false-dawn', speakerIds: ['helios', 'kallias'], start: 'helios-challenge',
    nodes: {
      'helios-challenge': { speakerId: 'helios', text: 'The false sky copies brightness and omits the cost of carrying it. Turn the mirrors toward the labor.', cameraCue: 'wide', next: 'kallias-turns' },
      'kallias-turns': { speakerId: 'kallias', text: 'A dawn without witnesses is only glare.', cameraCue: 'restore', effects: [{ kind: 'flag', id: 'act5-false-dawn-turned', value: true }], next: 'helios-ext-1' },
      'helios-ext-1': { speakerId: 'helios', text: 'Glare is what a light looks like when nobody has to answer for it. The mirrors are turned now; count the hands that held them.', cameraCue: 'speaker', next: 'helios-ext-2' },
      'helios-ext-2': { speakerId: 'kallias', text: 'I will count them where the record is read. A name that never worked deserves no share of this sunrise.', cameraCue: 'restore', next: null },
    },
  },
  'act5-three-lights': {
    id: 'act5-three-lights', speakerIds: ['apollo', 'helios', 'selene'], start: 'three-claims',
    nodes: {
      'three-claims': { speakerId: 'apollo', text: 'I reveal the road before the traveler commits.', cameraCue: 'speaker', next: 'helios-claim' },
      'helios-claim': { speakerId: 'helios', text: 'I endure above every road, whether anyone praises the heat.', cameraCue: 'speaker', next: 'selene-claim' },
      'selene-claim': { speakerId: 'selene', text: 'And I return light changed by distance. None of us owns visibility.', cameraCue: 'restore', next: 'three-lights-ext-1' },
      'three-lights-ext-1': { speakerId: 'apollo', text: 'I go first, and I go without thanks. The step shown is spent the moment it is taken.', cameraCue: 'speaker', next: 'three-lights-ext-2' },
      'three-lights-ext-2': { speakerId: 'helios', text: 'Praise adds no heat. Setting changes nothing. I rise at the same cost.', cameraCue: 'speaker', next: 'three-lights-ext-3' },
      'three-lights-ext-3': { speakerId: 'selene', text: 'None of us is the fire. My face only says someone stood somewhere, and looked up.', cameraCue: 'restore', next: null },
    },
  },
  'act5-regent-interruption': {
    id: 'act5-regent-interruption', speakerIds: ['damas-quiet-regent', 'ianthe', 'melite', 'kallias'], start: 'damas-erases',
    nodes: {
      'damas-erases': { speakerId: 'damas-quiet-regent', text: 'If no promise can be named, no power can forge consent around it.', cameraCue: 'speaker', next: 'choose-witness' },
      'choose-witness': {
        choices: [
          { id: 'ianthe-testimony', text: 'Ianthe reads Elia\'s unedited refusal.', when: [{ kind: 'flag', flagId: 'revealed-ianthe', value: true }], effects: [{ kind: 'flag', id: 'act5-ianthe-testified', value: true }], next: 'elia-condition' },
          { id: 'keeper-testimony', text: 'Melite enters the neutral Keeper testimony.', effects: [{ kind: 'flag', id: 'act5-neutral-keeper-testified', value: true }], next: 'keeper-condition' },
        ],
      },
      'elia-condition': { speakerId: 'kallias', text: 'Elia did not ask to erase the gods. She asked that refusal remain inside every future agreement.', cameraCue: 'reveal', effects: [{ kind: 'flag', id: 'act5-regent-testimony-heard', value: true }], next: 'elia-condition-ext-1' },
      'elia-condition-ext-1': { speakerId: 'damas-quiet-regent', text: 'I had bet on her silence lasting. It did not. A refusal read aloud has a body behind it; a filed clause does not. You did not preserve words, you preserved a witness. That is worse, for me.', cameraCue: 'reveal', next: null },
      'keeper-condition': { speakerId: 'kallias', text: 'Melite kept both terms in the neutral record: power may offer a covenant, and every witness may refuse it without disappearing.', cameraCue: 'reveal', effects: [{ kind: 'flag', id: 'act5-regent-testimony-heard', value: true }], next: 'keeper-condition-ext-1' },
      'keeper-condition-ext-1': { speakerId: 'damas-quiet-regent', text: 'I came to break a name, and met a form. No one weeps in this record. No one need. A term kept neutrally binds both directions, and I am inside it now.', cameraCue: 'reveal', next: null },
    },
  },
  'act5-epilogue': {
    id: 'act5-epilogue', speakerIds: ['kallias', 'thessa'], start: 'publish',
    nodes: {
      publish: { speakerId: 'kallias', text: 'A name survives when power, place, witness, and deed remain answerable to one another.', cameraCue: 'wide', next: 'thessa-closes' },
      'thessa-closes': { speakerId: 'thessa', text: 'Then leave room beneath it for the next refusal.', cameraCue: 'restore', effects: [{ kind: 'flag', id: 'act5-last-name-witnessed', value: true }], next: 'epilogue-ext-1' },
      'epilogue-ext-1': { speakerId: 'kallias', text: 'Then let the last page stay uncut. I was a map with one road on it once, and called that courage. You drew the blank coast first, and named the distance far-sighted.', cameraCue: 'speaker', next: 'epilogue-ext-2' },
      'epilogue-ext-2': { speakerId: 'thessa', text: 'Every blank was a promise, not an absence. Walk into one slowly. The pen stays warm for whoever reads next.', cameraCue: 'restore', next: null },
    },
  },
})

// ─── Ending contract ──────────────────────────────────────────
export const ACT5_ENDING_VARIANTS = deepFreeze([
  {
    id: 'bounded-patrons', name: 'Bounded Patrons', threshold: { authority: 3 }, fallback: false,
    promise: 'Gods act only inside narrow published limits with Keeper audits.',
    cost: 'Clear crisis response can harden into rigid or captured institutions.',
    worldState: { accordModel: 'published-limits', witnessPaths: 'keeper-audited' },
    safeguardEvidence: ['evidence-orthe-receipt', 'evidence-backdated-rite'],
    completesQuestId: ACT5_MAIN_QUEST_ID, completesObjectiveId: 'write-the-new-accord',
  },
  {
    id: 'mortal-witness', name: 'Mortal Witness', threshold: { autonomy: 3 }, fallback: false,
    promise: 'Each region authors and may withdraw its own divine covenants.',
    cost: 'Protection and shared standards vary between regions.',
    worldState: { accordModel: 'local-consent', witnessPaths: 'federated-refusals' },
    safeguardEvidence: ['evidence-mutual-memory', 'evidence-backdated-rite'],
    completesQuestId: ACT5_MAIN_QUEST_ID, completesObjectiveId: 'write-the-new-accord',
  },
  {
    id: 'renewed-compact', name: 'Renewed Compact', threshold: { reciprocityPlusPlurality: 5 }, fallback: true,
    promise: 'God, Keeper, and local witness all sign while contradictions remain public.',
    cost: 'Broad legitimacy makes negotiation slower and leaves deadlock visible.',
    worldState: { accordModel: 'multi-signatory', witnessPaths: 'public-dissent' },
    safeguardEvidence: ['evidence-plural-stars', 'evidence-independent-light'],
    completesQuestId: ACT5_MAIN_QUEST_ID, completesObjectiveId: 'write-the-new-accord',
    limitedFallback: { valid: true, endingId: 'renewed-compact-limited', note: 'Emergency form for migrated or partial evidence; weaknesses remain explicit' },
  },
])

// ─── Saves, flags, and region seam ────────────────────────────
export const ACT5_SAVE_POINTS = deepFreeze({
  'shrine-nyx-foothold': { id: 'shrine-nyx-foothold', kind: 'shrine', mapId: 'nyx-foothold', spawnId: 'keeper-camp', deityId: 'nyx', note: 'Before final ascent and patron changes' },
  'checkpoint-night-stair-anchors': { id: 'checkpoint-night-stair-anchors', kind: 'checkpoint', mapId: 'night-stair', spawnId: 'anchors-stable', note: 'After all four anchors stabilize' },
  'checkpoint-false-sky-mirrors': { id: 'checkpoint-false-sky-mirrors', kind: 'checkpoint', mapId: 'false-sky', spawnId: 'mirrors-aligned', note: 'After all three sun mirrors align' },
  'checkpoint-loom-approach': { id: 'checkpoint-loom-approach', kind: 'checkpoint', mapId: 'silent-loom-approach', spawnId: 'epithets-sealed', note: 'After all four epithets are sealed' },
  'checkpoint-loom-guardian': { id: 'checkpoint-loom-guardian', kind: 'checkpoint', mapId: 'silent-loom', spawnId: 'regent-phase', note: 'Clean boundary between Guardian and Regent; never active combat' },
  'checkpoint-act5-epilogue': { id: 'checkpoint-act5-epilogue', kind: 'final', mapId: 'accord-overlook', spawnId: 'epilogue', recordsEndingId: true, bossesRemainDefeated: true },
})

export const ACT5_PERMANENT_FLAGS = deepFreeze([
  'act5-night-stair-arrived',
  'act5-witnesses-mustered',
  'act5-anchors-stable',
  'act5-moon-witnesses-aligned',
  'act5-false-dawn-turned',
  'act5-time-fractures-crossed',
  'act5-epithets-restored',
  'act5-night-stair-cleared',
  'act5-false-sky-cleared',
  'act5-loom-approach-cleared',
  'act5-loom-guardian-defeated',
  'act5-quiet-regent-defeated',
  'act5-ianthe-testified',
  'act5-neutral-keeper-testified',
  'act5-regent-testimony-heard',
  'act5-accord-choice',
  'act5-last-name-witnessed',
  'mq-act5-last-name-completed',
])

export const ACT5_SHARED_FLAG_IDS = deepFreeze(['evidence-independent-light'])
export const ACT5_OPTIONAL_FLAG_IDS = deepFreeze(['evidence-independent-light', 'act5-true-sky-restored'])

export const ACT5_POINT_OF_NO_RETURN = deepFreeze({
  id: 'act5-point-of-no-return',
  connectionId: 'false-sky-to-loom-approach',
  warningRequired: true,
  disablesLongRangeTravel: true,
  safeReturnMapId: 'nyx-foothold',
  reopensAfterFlagId: 'mq-act5-last-name-completed',
})

export const ACT5_REGION = deepFreeze({
  id: ACT5_REGION_ID,
  act: 5,
  name: 'Night Stair and Silent Loom: The Last Name',
  entry: { mapId: 'nyx-foothold', spawnId: 'keeper-camp', prerequisites: ACT5_PRECONDITIONS },
  pockets: ACT5_POCKETS,
  connections: ACT5_CONNECTIONS,
  optionalLoops: ACT5_OPTIONAL_LOOPS,
  mainQuestId: ACT5_MAIN_QUEST_ID,
  optionalQuestId: ACT5_SIDE_QUEST_ID,
  shrineIds: ['shrine-nyx-foothold'],
  exit: {
    mapId: 'accord-overlook',
    spawnId: 'epilogue',
    effects: [
      { kind: 'flag', id: 'mq-act5-last-name-completed', value: true },
      { kind: 'save', savePointId: 'checkpoint-act5-epilogue', recordsEndingId: true },
      { kind: 'reopen-witness-paths', preserveBossDefeats: true },
    ],
  },
})

// ─── Null-safe lookups ────────────────────────────────────────
export function act5PocketById(id) {
  return (typeof id === 'string' && ACT5_POCKETS[id]) || null
}

export function act5SpawnById(pocketId, spawnId) {
  const pocket = act5PocketById(pocketId)
  if (!pocket || typeof spawnId !== 'string') return null
  return (pocket.spawns && pocket.spawns[spawnId]) || null
}

export function act5ConnectionById(id) {
  return ACT5_CONNECTIONS.find((connection) => connection.id === id) || null
}

export function act5OptionalLoopById(id) {
  return ACT5_OPTIONAL_LOOPS.find((loop) => loop.id === id) || null
}

export function act5EncounterById(id) {
  return (typeof id === 'string' && ACT5_ENCOUNTERS[id]) || null
}

export function act5QuestById(id) {
  if (id === ACT5_MAIN_QUEST_ID) return ACT5_MAIN_QUEST
  if (id === ACT5_SIDE_QUEST_ID) return ACT5_SIDE_QUEST
  return null
}

export function act5ObjectiveById(id) {
  for (const quest of [ACT5_MAIN_QUEST, ACT5_SIDE_QUEST]) {
    const objective = quest.objectives.find((entry) => entry.id === id)
    if (objective) return objective
  }
  return null
}

export function act5ConversationById(id) {
  return (typeof id === 'string' && ACT5_CONVERSATIONS[id]) || null
}

export function act5EndingById(id) {
  return ACT5_ENDING_VARIANTS.find((ending) => ending.id === id) || null
}

export function act5SavePointById(id) {
  return (typeof id === 'string' && ACT5_SAVE_POINTS[id]) || null
}

export function act5LightPolarityById(id) {
  return (typeof id === 'string' && ACT5_LIGHT_POLARITY_STATES[id]) || null
}

export function act5TimeFractureById(id) {
  return (typeof id === 'string' && ACT5_TIME_FRACTURE_STATES[id]) || null
}

export function act5CompletionFlagForEncounter(id) {
  const encounter = act5EncounterById(id)
  return encounter ? encounter.completionFlag : null
}
