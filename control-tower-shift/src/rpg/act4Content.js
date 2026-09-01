// Act IV content scaffold — Forge March: The False Constellation.
//
// Derived strictly from ACTS-II-V-BLUEPRINT.md (Act IV) and STORY-BIBLE.md
// (Act IV section + restoration consequence matrix). Future integration
// seam, not a second RPG engine: pure authored data + pure lookup helpers.
// No time reads, no RNG, no DOM, no browser globals, no network. All exports
// are deep-frozen.
//
// Canonical contracts referenced by ID only:
//   - Monster types from game/characters.js MONSTER_TYPES
//   - The arena campaign level `bronze-foundry` from game/campaign.js — the
//     ONLY Act II–V encounter with a campaignLevelId. Its order must stay
//     data-equivalent to the campaign level (blueprint "Stable implementation
//     boundaries").
//   - Deity keys prometheus, atlas, athena, ares, hercules, zeus
//   - Act III completion prerequisites: `mq-act3-withered-year` completed and
//     `act3-first-thaw`

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

// ─── Region identity ───────────────────────────────────────────
export const ACT4_REGION_ID = 'forge-march'
export const ACT4_MAIN_QUEST_ID = 'mq-act4-false-constellation'
export const ACT4_SIDE_QUEST_ID = 'sq-act4-one-more-sky'

export const ACT4_PRECONDITIONS = deepFreeze([
  { kind: 'quest-complete', questId: 'mq-act3-withered-year' },
  { kind: 'flag', flagId: 'act3-first-thaw', value: true },
])

// ─── Pockets ───────────────────────────────────────────────────
export const ACT4_POCKETS = deepFreeze({
  'slag-road': {
    id: 'slag-road',
    name: 'Slag Road',
    region: ACT4_REGION_ID,
    act: 4,
    role: 'hub',
    hub: true,
    spawnId: 'refugee-camp',
    spawns: {
      'refugee-camp': { id: 'refugee-camp', note: 'Refugee foundry camp, default arrival' },
      'from-foundry': { id: 'from-foundry', note: 'Return from the bronze foundry' },
      'from-vault': { id: 'from-vault', note: 'Return from the Atlas Vault' },
      'dawn-muster': { id: 'dawn-muster', note: 'Accepted Act IV exit — mortal-authored covenant assembled' },
    },
    landmarks: ['lift-controls', 'strategy-board', 'prometheus-shrine'],
  },
  'bronze-foundry': {
    id: 'bronze-foundry',
    name: 'Bronze Foundry',
    region: ACT4_REGION_ID,
    act: 4,
    role: 'combat',
    hub: false,
    spawnId: 'from-slag-road',
    spawns: {
      'from-slag-road': { id: 'from-slag-road', note: 'Foundry entry from the slag road' },
      'from-name-press': { id: 'from-name-press', note: 'Return from the Name-Press' },
      'foundry-cleared': { id: 'foundry-cleared', note: 'Checkpoint after the reused campaign encounter' },
    },
    // Reuses the arena campaign palette/architecture via campaignLevelId.
    landmarks: ['production-lane-1', 'production-lane-2', 'production-lane-3'],
    reusesCampaignLevel: 'bronze-foundry',
  },
  'name-press': {
    id: 'name-press',
    name: 'Name-Press',
    region: ACT4_REGION_ID,
    act: 4,
    role: 'dungeon',
    hub: false,
    spawnId: 'from-foundry',
    spawns: {
      'from-foundry': { id: 'from-foundry', note: 'Name-Press entry from the foundry' },
      'from-vault': { id: 'from-vault', note: 'Return from the Atlas Vault' },
      'name-press-relief': { id: 'name-press-relief', note: 'Checkpoint after fire redirection' },
    },
    landmarks: ['heat-routing-floor', 'epithet-dies', 'pressure-relief-1', 'pressure-relief-2', 'prometheus-brazier'],
  },
  'atlas-vault': {
    id: 'atlas-vault',
    name: 'Atlas Vault',
    region: ACT4_REGION_ID,
    act: 4,
    role: 'traversal',
    hub: false,
    spawnId: 'from-name-press',
    spawns: {
      'from-name-press': { id: 'from-name-press', note: 'Vault entry from the Name-Press' },
      'from-false-constellation': { id: 'from-false-constellation', note: 'Return from the false constellation' },
      'atlas-checkpoint': { id: 'atlas-checkpoint', note: 'Checkpoint after all four anchors release' },
    },
    // Four chain anchors support the false sky; each opens a fixed route.
    landmarks: ['chain-anchor-1', 'chain-anchor-2', 'chain-anchor-3', 'chain-anchor-4', 'load-platforms', 'collapsed-side-vault'],
  },
  'false-constellation': {
    id: 'false-constellation',
    name: 'False Constellation',
    region: ACT4_REGION_ID,
    act: 4,
    role: 'boss',
    hub: false,
    spawnId: 'from-vault',
    spawns: {
      'from-vault': { id: 'from-vault', note: 'Ascent beneath the collapsing bronze firmament' },
      'post-boss': { id: 'post-boss', note: 'Resume point after the Colossus — never inside active combat' },
    },
    landmarks: ['bronze-firmament', 'colossus-arena'],
  },
})

// ─── Connections ───────────────────────────────────────────────
// The march-plan choice changes the FIRST traversal connection only; both
// plans rejoin before the bronze foundry and share every required encounter
// (Act IV acceptance criterion 1). Modeled as two alternative first edges
// with a shared rejoin point, never as divergent encounter graphs.
export const ACT4_MARCH_PLANS = deepFreeze({
  'athena-precise-route': {
    id: 'athena-precise-route',
    name: 'Athena\u2019s Precise Route',
    proposer: 'athena',
    firstConnectionId: 'plan-athena-first-edge',
    text: 'Survey the lift controls, then cut through the relief chambers',
  },
  'ares-direct-breach': {
    id: 'ares-direct-breach',
    name: 'Ares\u2019s Direct Breach',
    proposer: 'ares',
    firstConnectionId: 'plan-ares-first-edge',
    text: 'Breach the foundry gate head-on through the slag flats',
  },
})

export const ACT4_CONNECTIONS = deepFreeze([
  // Plan-specific first traversal edges (choice-dependent). Both rejoin at
  // the foundry; neither changes the required encounter set.
  { id: 'plan-athena-first-edge', from: 'slag-road', to: 'bronze-foundry', arrivalSpawnId: 'from-slag-road', returnSpawnId: 'from-foundry', kind: 'foot', planId: 'athena-precise-route' },
  { id: 'plan-ares-first-edge', from: 'slag-road', to: 'bronze-foundry', arrivalSpawnId: 'from-slag-road', returnSpawnId: 'from-foundry', kind: 'foot', planId: 'ares-direct-breach' },
  // Shared main-path connections (plan-independent).
  { id: 'foundry-to-slag-road', from: 'bronze-foundry', to: 'slag-road', arrivalSpawnId: 'from-foundry', returnSpawnId: 'from-slag-road', kind: 'foot' },
  { id: 'foundry-to-name-press', from: 'bronze-foundry', to: 'name-press', arrivalSpawnId: 'from-foundry', returnSpawnId: 'from-name-press', kind: 'foot' },
  { id: 'name-press-to-foundry', from: 'name-press', to: 'bronze-foundry', arrivalSpawnId: 'from-name-press', returnSpawnId: 'from-foundry', kind: 'foot' },
  { id: 'name-press-to-vault', from: 'name-press', to: 'atlas-vault', arrivalSpawnId: 'from-name-press', returnSpawnId: 'from-vault', kind: 'foot' },
  { id: 'vault-to-name-press', from: 'atlas-vault', to: 'name-press', arrivalSpawnId: 'from-vault', returnSpawnId: 'from-name-press', kind: 'foot' },
  { id: 'vault-to-constellation', from: 'atlas-vault', to: 'false-constellation', arrivalSpawnId: 'from-vault', returnSpawnId: 'from-false-constellation', kind: 'foot', gate: [{ kind: 'flag', flagId: 'act4-single-crown-rejected', value: true }] },
  { id: 'constellation-to-vault', from: 'false-constellation', to: 'atlas-vault', arrivalSpawnId: 'from-false-constellation', returnSpawnId: 'from-vault', kind: 'foot' },
])

// ─── Main quest: exact eight-step chain ────────────────────────
export const ACT4_MAIN_OBJECTIVES = deepFreeze([
  { id: 'choose-march-plan', kind: 'choose', choiceIds: ['athena-precise-route', 'ares-direct-breach'], text: 'Hear Athena\u2019s precise route and Ares\u2019s direct breach; the choice changes the first traversal, not the required encounters' },
  { id: 'break-foundry-guard', kind: 'clear-encounter', encounterId: 'enc-act4-foundry-threshold', also: ['shut-production-lanes'], text: 'Clear the reused bronze-foundry encounter and shut down its production lanes' },
  { id: 'return-prometheus-fire', kind: 'interact', entityIds: ['prometheus-brazier'], count: 1, orderFree: false, text: 'Redirect stolen fire from the press to Prometheus\u2019s lawful brazier' },
  { id: 'release-atlas-anchors', kind: 'interact', entityIds: ['chain-anchor-1', 'chain-anchor-2', 'chain-anchor-3', 'chain-anchor-4'], count: 4, orderFree: true, text: 'Release the four authored anchors; each opens a fixed route through the Atlas Vault' },
  { id: 'recover-covenant-witnesses', kind: 'interact', entityIds: ['cell-hercules', 'cell-smith-1', 'cell-smith-2'], count: 3, orderFree: true, text: 'Rescue Hercules and the two mortal smiths from marked cells' },
  { id: 'reject-single-crown', kind: 'choose', choiceIds: ['rejection-firm', 'rejection-mournful'], unavoidable: true, proposer: 'zeus', text: 'Refuse Zeus\u2019s domination proposal; tone may vary, outcome does not' },
  { id: 'defeat-name-press-colossus', kind: 'clear-encounter', encounterId: 'boss-act4-name-press-colossus', text: 'Break the Colossus\u2019s three name-dies, then its exposed core' },
  { id: 'ratify-mortal-draft', kind: 'choose', choiceIds: ['licensed-flame', 'guild-stewardship', 'revocable-hearths'], text: 'Witness the mortal-authored draft with Athena, Ares, Prometheus, Atlas, Hercules, Zeus, and the smiths' },
])

export const ACT4_MAIN_QUEST = deepFreeze({
  id: ACT4_MAIN_QUEST_ID,
  kind: 'main',
  act: 4,
  regionId: ACT4_REGION_ID,
  prerequisites: ACT4_PRECONDITIONS,
  objectives: ACT4_MAIN_OBJECTIVES,
  rewards: [{ kind: 'flag', id: 'mq-act4-false-constellation-completed', value: true }],
})

// ─── Optional loop: Weight of One More Sky ─────────────────────
// Hercules can lift one gate while the player reroutes a counterweight for
// the other; neither active patron is required. The tablets prove the Loom
// omits constellations that require multiple viewpoints and record
// `evidence-plural-stars`. Also adds stars to the epilogue sky.
export const ACT4_SIDE_QUEST = deepFreeze({
  id: ACT4_SIDE_QUEST_ID,
  kind: 'side',
  act: 4,
  regionId: ACT4_REGION_ID,
  prerequisites: [],
  objectives: [
    { id: 'reach-collapsed-side-vault', kind: 'reach', mapId: 'atlas-vault', markerId: 'collapsed-side-vault', text: 'Enter the collapsed side vault' },
    { id: 'split-the-gates', kind: 'multi-interact', entityIds: ['gate-hercules-lift', 'gate-counterweight'], count: 2, orderFree: true, patronRequired: false, text: 'Hercules lifts one gate while you reroute a counterweight for the other' },
    { id: 'recover-constellation-tablets', kind: 'interact', entityIds: ['constellation-tablets'], count: 1, orderFree: false, text: 'Recover Atlas\u2019s hand-carved constellation tablets' },
  ],
  rewards: [
    { kind: 'flag', id: 'evidence-plural-stars', value: true },
    { kind: 'flag', id: 'act4-atlas-constellations-restored', value: true },
    { kind: 'codex', entryId: 'codex-atlas-constellations' },
    { kind: 'currency', amount: 35 },
    { kind: 'epilogue', treatment: 'added-stars', note: 'Stars added to the epilogue sky' },
  ],
  affinityChoices: ['act4-atlas-constellations-restored'],
  skippedFallback: {
    valid: true,
    evidence: null,
    affinity: null,
    note: 'Neutral final-story fallback: the mortal draft never requires this loop',
  },
})

// ─── Encounters ────────────────────────────────────────────────
export const ACT4_ENCOUNTERS = deepFreeze({
  // The ONLY Act II–V encounter reusing an arena campaign level. Its order
  // must stay data-equivalent to the campaign level's encounter.order (the
  // test suite asserts equality against game/campaign.js directly). The RPG
  // adapter stops at this level's boundary — it never auto-spawns the next
  // arena campaign level (Act IV acceptance criterion 2).
  'enc-act4-foundry-threshold': {
    id: 'enc-act4-foundry-threshold',
    activationMapId: 'bronze-foundry',
    returnMapId: 'bronze-foundry',
    returnSpawnId: 'foundry-cleared',
    campaignLevelId: 'bronze-foundry',
    title: 'Bronze Foundry Threshold',
    subtitle: 'The reused campaign encounter, stopped at its adapter boundary.',
    order: ['hydra', 'minotaur', 'cerberus', 'hydra', 'chronos', 'minotaur', 'cerberus'],
    overlay: null,
    completionFlag: 'act4-foundry-cleared',
    activation: 'quest',
    repeatable: false,
    adapterBoundary: { stopsAtLevelEnd: true, note: 'Never auto-spawns the next arena campaign level' },
  },
  'enc-act4-name-press': {
    id: 'enc-act4-name-press',
    activationMapId: 'name-press',
    returnMapId: 'name-press',
    returnSpawnId: 'name-press-relief',
    campaignLevelId: null,
    title: 'Name-Press Wardens',
    subtitle: 'The dies are not unguarded.',
    order: ['minotaur', 'cerberus', 'chronos', 'minotaur', 'medusa'],
    overlay: { kind: 'forge-masks', note: 'Forge masks on all spawns' },
    completionFlag: 'act4-name-press-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'enc-act4-atlas-vault': {
    id: 'enc-act4-atlas-vault',
    activationMapId: 'atlas-vault',
    returnMapId: 'atlas-vault',
    returnSpawnId: 'atlas-checkpoint',
    campaignLevelId: null,
    title: 'Atlas Vault Anchors',
    subtitle: 'The chains hold more than the sky.',
    order: ['cerberus', 'atlas', 'minotaur', 'chronos'],
    overlay: { kind: 'anchor-guards', note: 'Anchor guards tied to the four chain anchors' },
    completionFlag: 'act4-atlas-vault-cleared',
    activation: 'quest',
    repeatable: false,
  },
  'boss-act4-name-press-colossus': {
    id: 'boss-act4-name-press-colossus',
    activationMapId: 'false-constellation',
    returnMapId: 'false-constellation',
    returnSpawnId: 'post-boss',
    campaignLevelId: null,
    title: 'The Name-Press Colossus',
    subtitle: 'Three name-dies, then the exposed core.',
    boss: {
      core: { baseMonsterType: 'atlas', note: 'Atlas-boss core' },
      overlays: [{ kind: 'sphinx-dies', count: 3, targetable: true, note: 'Three targetable sphinx-die overlays' }],
      phases: ['name-die-phase', 'exposed-core-phase'],
      fixedCollapsePhases: true,
      telegraphed: true,
    },
    order: ['atlas'],
    overlay: { kind: 'sphinx-dies', count: 3, targetable: true, note: 'Break the dies, then the core' },
    completionFlag: 'act4-colossus-defeated',
    activation: 'quest',
    repeatable: false,
    checkpointId: 'checkpoint-colossus-boss',
    defeatRestore: { note: 'Witness rescue and draft ratification unlock Act V exactly once after a valid post-region save' },
  },
})

export const ACT4_ENCOUNTER_OWNER_QUEST = deepFreeze({
  'enc-act4-foundry-threshold': ACT4_MAIN_QUEST_ID,
  'enc-act4-name-press': ACT4_MAIN_QUEST_ID,
  'enc-act4-atlas-vault': ACT4_MAIN_QUEST_ID,
  'boss-act4-name-press-colossus': ACT4_MAIN_QUEST_ID,
})

// ─── Atlas identity separation ─────────────────────────────────
// The Atlas NPC is a person under coercion, NOT the `atlas` monster base
// (Act IV acceptance criterion 4). Distinct content IDs, rendering,
// dialogue, and targeting semantics.
export const ACT4_ATLAS_IDENTITY = deepFreeze({
  npcId: 'atlas-npc',
  monsterTypeId: 'atlas',
  idsAreDistinct: true,
  note: 'Content IDs, rendering, dialogue, and targeting semantics are all distinct',
})

// ─── Forge pressure mechanic ───────────────────────────────────
// Three authored pressure lanes with visible valves. State changes open
// routes and telegraph floor hazards; they pause during dialogue and save
// exactly at checkpoints. Pressure cannot kill during an interaction
// animation. Reduced motion replaces shake/distortion with border pulses
// and audio/subtitle cues.
export const ACT4_PRESSURE_LANES = deepFreeze(['pressure-lane-1', 'pressure-lane-2', 'pressure-lane-3'])

export const ACT4_PRESSURE_STATES = deepFreeze({
  safe: { id: 'safe', telegraph: { shapeGlyph: 'closed-valve', label: 'Safe — lane sealed', motion: 'steady-pulse' } },
  venting: { id: 'venting', telegraph: { shapeGlyph: 'half-valve', label: 'Venting — hazard telegraph active', motion: 'fast-pulse' } },
  critical: { id: 'critical', telegraph: { shapeGlyph: 'open-valve', label: 'Critical — floor hazard live', motion: 'rapid-pulse' } },
})

export const ACT4_PRESSURE_RULES = deepFreeze({
  states: ['safe', 'venting', 'critical'],
  controlledByVisibleValves: true,
  pausesDuring: ['dialogue'],
  savesExactlyAtCheckpoints: true,
  cannotKillDuringInteractionAnimation: true,
  deterministic: true,
  doesNotAlterCanonicalPowerMath: true,
  reducedMotionFallback: { replaces: ['screen-shake', 'heat-distortion'], with: ['border-pulses', 'audio-subtitle-cues'] },
})

// ─── Save points ───────────────────────────────────────────────
export const ACT4_SAVE_POINTS = deepFreeze({
  'shrine-slag-road-prometheus': { id: 'shrine-slag-road-prometheus', kind: 'shrine', mapId: 'slag-road', deityId: 'prometheus', note: 'Arrival and after strategy choice' },
  'checkpoint-foundry-cleared': { id: 'checkpoint-foundry-cleared', kind: 'checkpoint', mapId: 'bronze-foundry', spawnId: 'foundry-cleared', note: 'After the reused campaign encounter' },
  'checkpoint-name-press-relief': { id: 'checkpoint-name-press-relief', kind: 'checkpoint', mapId: 'name-press', spawnId: 'name-press-relief', note: 'After fire redirection' },
  'checkpoint-atlas-vault': { id: 'checkpoint-atlas-vault', kind: 'checkpoint', mapId: 'atlas-vault', spawnId: 'atlas-checkpoint', note: 'After all four anchors release' },
  'checkpoint-colossus-boss': { id: 'checkpoint-colossus-boss', kind: 'checkpoint', mapId: 'false-constellation', spawnId: 'from-vault', note: 'After rejecting the single crown' },
  'checkpoint-forge-completion': { id: 'checkpoint-forge-completion', kind: 'checkpoint', mapId: 'slag-road', spawnId: 'dawn-muster', note: 'Region completion save' },
})

// ─── Permanent flags ───────────────────────────────────────────
export const ACT4_PERMANENT_FLAGS = deepFreeze([
  'act4-forge-arrived',
  'act4-march-plan',
  'act4-foundry-cleared',
  'act4-name-press-cleared',
  'act4-atlas-vault-cleared',
  'act4-fire-returned',
  'act4-atlas-released',
  'act4-witnesses-freed',
  'act4-single-crown-rejected',
  'act4-colossus-defeated',
  'act4-mortal-draft-ratified',
  'act4-restoration-form',
  'mq-act4-false-constellation-completed',
])

export const ACT4_SHARED_FLAG_IDS = deepFreeze([
  'evidence-plural-stars', // cross-act mystery evidence (STORY-BIBLE)
])

export const ACT4_OPTIONAL_FLAG_IDS = deepFreeze([
  'evidence-plural-stars',
  'act4-atlas-constellations-restored',
])

// ─── Restoration formulations (STORY-BIBLE ledger, Act IV) ─────
// Every form completes the SAME linear main quest and advances to Act V.
export const ACT4_RESTORATION_FORMULATIONS = deepFreeze([
  {
    id: 'licensed-flame',
    name: 'Licensed Flame',
    completesQuestId: ACT4_MAIN_QUEST_ID,
    completesObjectiveId: 'ratify-mortal-draft',
    terrain: 'Stable lifts and guarded forge shortcuts',
    language: 'Athena approves audit chains; smiths fear slow approval in emergencies',
    enemyOverlay: 'Forge hazards are milder; armored enemies retain formation behavior',
    evidenceWeight: { authority: 2 },
  },
  {
    id: 'guild-stewardship',
    name: 'Guild Stewardship',
    completesQuestId: ACT4_MAIN_QUEST_ID,
    completesObjectiveId: 'ratify-mortal-draft',
    terrain: 'Worker lifts and repair benches open; elite route stays sealed',
    language: 'Smith councils control use and publish costs',
    enemyOverlay: 'Enemies lose command buffs near freed workers',
    evidenceWeight: { reciprocity: 1, autonomy: 1 },
  },
  {
    id: 'revocable-hearths',
    name: 'Revocable Hearths',
    completesQuestId: ACT4_MAIN_QUEST_ID,
    completesObjectiveId: 'ratify-mortal-draft',
    terrain: 'Several small braziers create flexible local shortcuts, each manually renewed',
    language: 'Prometheus praises sharing; Atlas warns of uneven upkeep',
    enemyOverlay: 'Fire overlays extinguish near witnessed hearths but persist elsewhere',
    evidenceWeight: { autonomy: 1, plurality: 1 },
  },
])

// ─── Region definition (integration seam) ──────────────────────
export const ACT4_REGION = deepFreeze({
  id: ACT4_REGION_ID,
  act: 4,
  name: 'Forge March: The False Constellation',
  entry: { mapId: 'slag-road', spawnId: 'refugee-camp', prerequisites: ACT4_PRECONDITIONS },
  pockets: ACT4_POCKETS,
  connections: ACT4_CONNECTIONS,
  mainQuestId: ACT4_MAIN_QUEST_ID,
  optionalQuestId: ACT4_SIDE_QUEST_ID,
  shrineIds: ['shrine-slag-road-prometheus'],
  exit: {
    mapId: 'slag-road',
    spawnId: 'dawn-muster',
    effects: [
      { kind: 'flag', id: 'mq-act4-false-constellation-completed', value: true },
      { kind: 'unlock-region', regionId: 'night-stair', note: 'Act V unlocks exactly once; Night Stair revealed' },
    ],
  },
})

// ─── Lookup helpers ────────────────────────────────────────────
// All lookups return null for unknown IDs and never guess from display text.
export function act4PocketById(id) {
  return (typeof id === 'string' && ACT4_POCKETS[id]) || null
}

export function act4SpawnById(pocketId, spawnId) {
  const pocket = act4PocketById(pocketId)
  if (!pocket || typeof spawnId !== 'string') return null
  return (pocket.spawns && pocket.spawns[spawnId]) || null
}

export function act4ConnectionById(id) {
  return ACT4_CONNECTIONS.find((c) => c.id === id) || null
}

export function act4MarchPlanById(id) {
  return (typeof id === 'string' && ACT4_MARCH_PLANS[id]) || null
}

export function act4EncounterById(id) {
  return (typeof id === 'string' && ACT4_ENCOUNTERS[id]) || null
}

export function act4QuestById(id) {
  if (id === ACT4_MAIN_QUEST_ID) return ACT4_MAIN_QUEST
  if (id === ACT4_SIDE_QUEST_ID) return ACT4_SIDE_QUEST
  return null
}

export function act4ObjectiveById(id) {
  for (const quest of [ACT4_MAIN_QUEST, ACT4_SIDE_QUEST]) {
    const found = quest.objectives.find((o) => o.id === id)
    if (found) return found
  }
  return null
}

export function act4PressureStateById(id) {
  return (typeof id === 'string' && ACT4_PRESSURE_STATES[id]) || null
}

export function act4FormulationById(id) {
  return ACT4_RESTORATION_FORMULATIONS.find((f) => f.id === id) || null
}

export function act4SavePointById(id) {
  return (typeof id === 'string' && ACT4_SAVE_POINTS[id]) || null
}

export function act4CompletionFlagForEncounter(encounterId) {
  const enc = act4EncounterById(encounterId)
  return enc ? enc.completionFlag : null
}
