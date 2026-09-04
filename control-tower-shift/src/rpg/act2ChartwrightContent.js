// Isolated authored seam for the Pelagos Chartwright slice. Registry, state,
// dialogue, and UI integration intentionally remain outside this module.

import { act2Authoring } from './act2Content.js'
import { WAYFINDING_SURVEY_CONTRACTS } from './wayfinding.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

const meta = (category, question, systemsUsed, reward, consequence, recovery, expectedMinutes, levelMin = 1, levelMax = 70) => act2Authoring({
  category, dramaticQuestion: question, systemsUsed, durableReward: reward,
  downstreamConsequence: consequence, recoveryBehavior: recovery, expectedMinutes,
  originalityNotes: 'Uses public-domain Mediterranean navigation, sounding, beacon, and harbor practices; the Pelagos Chartwright people, routes, and civic terms are original.',
  levelMin, levelMax,
})

export const ACT2_CHARTWRIGHT_REGION_ID = 'pelagos-isles'
export const ACT2_CHARTWRIGHT_MAP_IDS = deepFreeze(['chartwright-hall', 'submerged-signal-shoal'])
export const ACT2_CHARTWRIGHT_CONVERSATION_IDS = deepFreeze([
  'act2-ianthe-chartwright-briefing', 'act2-naukleros-signal-shoal', 'act2-dorieus-published-route',
])

// These deliberately reference existing maps/spawns that the later registry
// integration must add to its reciprocal map definitions.
export const ACT2_CHARTWRIGHT_EXTERNAL_SEAMS = deepFreeze([
  { mapId: 'pelagos-harbor', spawnId: 'from-chartwright', requiredConnectionId: 'pelagos-harbor-to-chartwright-hall' },
  { mapId: 'storm-anchorage', spawnId: 'from-signal-shoal', requiredConnectionId: 'storm-anchorage-to-signal-shoal' },
])

export const ACT2_CHARTWRIGHT_POCKETS = deepFreeze({
  'chartwright-hall': {
    id: 'chartwright-hall', name: 'Chartwright Hall', region: ACT2_CHARTWRIGHT_REGION_ID, act: 2, role: 'civic-workshop', hub: true,
    spawnId: 'from-pelagos', spawns: { 'from-pelagos': { id: 'from-pelagos' }, 'from-shoal': { id: 'from-shoal' }, 'published-route': { id: 'published-route' } },
    landmarks: ['chart-table', 'survey-pelagos-harbor-soundings', 'survey-breakwater-tide-bearing'],
    authoring: meta('region-map', 'Can a harbor chart belong to every sailor who tests it rather than only to the official who stamps it?', ['dialogue', 'wayfinding', 'crafting'], 'The hall provides the first physical chart table and a durable published-route return.', 'Its open chart practice turns Pelagos routes into repeatable player-earned shortcuts.', 'Every hall arrival, survey, and publication marker has a fixed return point and exact-once state seam.', 8),
  },
  'submerged-signal-shoal': {
    id: 'submerged-signal-shoal', name: 'Submerged Signal Shoal', region: ACT2_CHARTWRIGHT_REGION_ID, act: 2, role: 'hazard-route', hub: false,
    spawnId: 'from-hall', spawns: { 'from-hall': { id: 'from-hall' }, 'from-anchorage': { id: 'from-anchorage' }, 'shoal-cleared': { id: 'shoal-cleared' } },
    landmarks: ['signal-buoy', 'survey-nereid-boundary-soundings', 'survey-anchorage-storm-line', 'survey-archive-return-bearing'],
    authoring: meta('region-map', 'Can a drowned signal route be restored without hiding its danger behind a faster travel reward?', ['combat', 'wayfinding', 'exploration'], 'The shoal exposes three late survey bearings and a recoverable elite route test.', 'Its restored signals create optional returns without changing the Salt Covenant main path.', 'The safe shoal-cleared spawn and reciprocal exits preserve recovery after combat or reload.', 10, 10, 70),
  },
})

export const ACT2_CHARTWRIGHT_CONNECTIONS = deepFreeze([
  { id: 'pelagos-harbor-to-chartwright-hall', from: 'pelagos-harbor', to: 'chartwright-hall', arrivalSpawnId: 'from-pelagos', returnSpawnId: 'from-chartwright', kind: 'foot' },
  { id: 'chartwright-hall-to-pelagos-harbor', from: 'chartwright-hall', to: 'pelagos-harbor', arrivalSpawnId: 'from-chartwright', returnSpawnId: 'from-pelagos', kind: 'foot' },
  { id: 'chartwright-hall-to-signal-shoal', from: 'chartwright-hall', to: 'submerged-signal-shoal', arrivalSpawnId: 'from-hall', returnSpawnId: 'from-shoal', kind: 'skiff' },
  { id: 'signal-shoal-to-chartwright-hall', from: 'submerged-signal-shoal', to: 'chartwright-hall', arrivalSpawnId: 'from-shoal', returnSpawnId: 'from-hall', kind: 'skiff' },
  { id: 'storm-anchorage-to-signal-shoal', from: 'storm-anchorage', to: 'submerged-signal-shoal', arrivalSpawnId: 'from-anchorage', returnSpawnId: 'from-signal-shoal', kind: 'skiff' },
  { id: 'signal-shoal-to-storm-anchorage', from: 'submerged-signal-shoal', to: 'storm-anchorage', arrivalSpawnId: 'from-signal-shoal', returnSpawnId: 'from-anchorage', kind: 'skiff' },
])

const objective = (id, kind, fields, question, systemsUsed) => ({ id, kind, ...fields, authoring: meta('quest-objective', question, systemsUsed, 'The objective records one bounded chartwright contribution.', 'Its settled state unlocks only the next authored optional step.', 'Invalid, duplicate, or interrupted actions remain recoverable and exact-once.', 2) })

export const ACT2_CHARTWRIGHT_CHARACTER_QUEST = deepFreeze({
  id: 'cq-act2-ianthe-open-chart', kind: 'character', category: 'character', act: 2, regionId: ACT2_CHARTWRIGHT_REGION_ID,
  objectives: [
    objective('hear-ianthe-open-chart', 'talk', { npcId: 'ianthe-chartwright', conversationId: 'act2-ianthe-chartwright-briefing' }, 'Will Ianthe publish a route that sailors may correct in public?', ['dialogue', 'wayfinding']),
    objective('recover-two-public-soundings', 'interact', { entityIds: ['survey-pelagos-harbor-soundings', 'survey-breakwater-tide-bearing'], count: 2, orderFree: true }, 'Can two near-harbor measurements be trusted only when both are witnessed?', ['wayfinding', 'exploration']),
    objective('publish-shared-route', 'choose', { choiceIds: ['route-public-ledge', 'route-stewarded-berth'] }, 'Who may maintain the new shortcut after its first publication?', ['choice', 'wayfinding']),
  ],
  rewards: [{ kind: 'flag', id: 'act2-ianthe-open-chart-published', value: true }],
  authoring: meta('cross-act-character-quest', 'Can Ianthe make navigation accountable to sailors without making every route ownerless?', ['dialogue', 'choice', 'wayfinding'], 'The quest grants one durable publication choice and Ianthe relationship state.', 'The chosen maintenance model is an explicit future cross-act consequence seam.', 'Every stage uses physical hall markers and leaves the main covenant path optional.', 12),
})

export const ACT2_CHARTWRIGHT_MASTERY_QUEST = deepFreeze({
  id: 'mqy-wayfinding-covenant-routes', kind: 'mastery', category: 'mastery', act: 2, regionId: ACT2_CHARTWRIGHT_REGION_ID,
  objectives: WAYFINDING_SURVEY_CONTRACTS.map((contract) => objective(`survey-${contract.id}`, 'survey', { entityId: `survey-${contract.id}`, surveyContractId: contract.id, requiredLevel: contract.requiredLevel }, `Can the ${contract.bandId} bearing be verified by practice rather than inherited authority?`, ['wayfinding', 'exploration'])),
  rewards: [{ kind: 'flag', id: 'act2-wayfinding-chartwright-mastered', value: true }],
  authoring: meta('system-mastery-quest', 'Can five tested route bands make Wayfinding a civic practice instead of a quest-completion number?', ['wayfinding', 'crafting', 'exploration'], 'Completing all five surveys records the Chartwright mastery flag and permanent route outputs.', 'The five-band contract becomes the reusable template for later world-skill mastery quests.', 'Survey discoveries are exact-once while practice remains cooldown-bound and reload-safe.', 25, 1, 70),
})

export const ACT2_CHARTWRIGHT_SIDE_QUEST = deepFreeze({
  id: 'sq-act2-submerged-signal', kind: 'side', act: 2, regionId: ACT2_CHARTWRIGHT_REGION_ID,
  objectives: [
    objective('accept-signal-watch', 'talk', { npcId: 'naukleros-signal-keeper', conversationId: 'act2-naukleros-signal-shoal' }, 'Will Naukleros ask for a route repair instead of a private rescue?', ['dialogue', 'wayfinding']),
    objective('clear-signal-reef', 'clear-encounter', { encounterId: 'enc-act2-submerged-signal-reef' }, 'Can the old signal be made visible without pretending its reef guardians never existed?', ['combat', 'wayfinding']),
    objective('relight-public-buoy', 'interact', { entityIds: ['signal-buoy'], count: 1, orderFree: false }, 'Who gets to see a repaired danger signal first?', ['wayfinding', 'choice']),
  ],
  rewards: [{ kind: 'flag', id: 'act2-submerged-signal-relit', value: true }],
  authoring: meta('regional-side-quest', 'Can a dangerous shortcut remain publicly legible after it is repaired?', ['combat', 'wayfinding', 'exploration'], 'The repaired buoy creates a durable optional route state and a civic signal reward.', 'Its signal state can later alter travel copy without gating the main story.', 'Combat returns to the shoal-cleared spawn and buoy interaction remains exact-once.', 10, 10, 45),
})

export const ACT2_CHARTWRIGHT_ENCOUNTERS = deepFreeze({
  'enc-act2-submerged-signal-reef': {
    id: 'enc-act2-submerged-signal-reef', activationMapId: 'submerged-signal-shoal', returnMapId: 'submerged-signal-shoal', returnSpawnId: 'shoal-cleared',
    title: 'Bell-Reef Cartographer', subtitle: 'A drowned surveyor’s bell has taught the reef to answer every false bearing.', order: ['hydra', 'medusa', 'hydra'], elite: true, completionFlag: 'act2-submerged-signal-reef-cleared', repeatable: false,
    authoring: meta('wilderness-encounter', 'Can a route elite be defeated without collapsing its navigational warning into ordinary loot?', ['combat', 'wayfinding'], 'Victory opens a safe shoal return and permits the public buoy repair.', 'The elite keeps the route optional while making its risk visible before engagement.', 'The explicit ready gate and shoal-cleared spawn preserve retry and reload recovery.', 4, 10, 45),
  },
})

export const ACT2_CHARTWRIGHT_RUNTIME_SEAMS = deepFreeze({
  conversationIds: ACT2_CHARTWRIGHT_CONVERSATION_IDS,
  externalConnections: ACT2_CHARTWRIGHT_EXTERNAL_SEAMS,
  futureItemIds: WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.discoveryReward.itemId),
})
