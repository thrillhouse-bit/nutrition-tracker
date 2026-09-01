// Canonical RPG content registry.
//
// Act I predates the region scaffolds in Acts II-IV, so its maps already carry
// render geometry while later acts intentionally expose only pockets, named
// spawns, and connections. This module normalizes those two authored shapes
// into one lookup surface without mutating either source.

import {
  MAPS as ACT1_MAPS,
  ENCOUNTERS as ACT1_ENCOUNTERS,
  QUEST_DEFS as ACT1_QUESTS,
  CONVERSATIONS as ACT1_CONVERSATIONS,
  ENCOUNTER_OWNER_QUEST as ACT1_ENCOUNTER_OWNERS,
} from './content.js'
import {
  ACT2_REGION, ACT2_CONNECTIONS, ACT2_ENCOUNTERS,
  ACT2_MAIN_QUEST, ACT2_SIDE_QUEST, ACT2_ENCOUNTER_OWNER_QUEST,
} from './act2Content.js'
import { ACT2_RENDERABLE_MAPS } from './act2Runtime.js'
import {
  ACT3_REGION, ACT3_CONNECTIONS, ACT3_ENCOUNTERS,
  ACT3_MAIN_QUEST, ACT3_SIDE_QUEST, ACT3_ENCOUNTER_OWNER_QUEST,
} from './act3Content.js'
import { ACT3_RENDERABLE_MAPS } from './act3Runtime.js'
import {
  ACT4_REGION, ACT4_CONNECTIONS, ACT4_ENCOUNTERS,
  ACT4_MAIN_QUEST, ACT4_SIDE_QUEST, ACT4_ENCOUNTER_OWNER_QUEST,
} from './act4Content.js'
import { ACT4_RENDERABLE_MAPS } from './act4Runtime.js'
import {
  ACT5_REGION, ACT5_CONNECTIONS, ACT5_ENCOUNTERS,
  ACT5_MAIN_QUEST, ACT5_SIDE_QUEST, ACT5_ENCOUNTER_OWNER_QUEST,
  ACT5_CONVERSATIONS,
} from './act5Content.js'
import { ACT5_RENDERABLE_MAPS } from './act5Runtime.js'

const LATER_REGIONS = [ACT2_REGION, ACT3_REGION, ACT4_REGION, ACT5_REGION]
const SCAFFOLD_POCKETS = {}
const LATER_CONNECTIONS = [...ACT2_CONNECTIONS, ...ACT3_CONNECTIONS, ...ACT4_CONNECTIONS, ...ACT5_CONNECTIONS]

function finiteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeSpawn(spawn) {
  if (!spawn) return null
  return {
    ...spawn,
    ...(spawn.arrivalState ? { arrivalState: { ...spawn.arrivalState } } : {}),
    x: finiteCoordinate(spawn.x),
    y: finiteCoordinate(spawn.y),
    facing: finiteCoordinate(spawn.facing),
  }
}

function normalizePocket(pocket) {
  const spawns = Object.fromEntries(
    Object.entries(pocket.spawns || {}).map(([id, spawn]) => [id, normalizeSpawn(spawn)]),
  )
  const spawn = spawns[pocket.spawnId] || null
  const exits = LATER_CONNECTIONS
    .filter((connection) => connection.from === pocket.id)
    .map((connection) => ({
      id: connection.id,
      toMapId: connection.to,
      spawnId: connection.arrivalSpawnId,
      returnSpawnId: connection.returnSpawnId,
      kind: connection.kind,
      gate: connection.gate || [],
      ...(connection.planId ? { planId: connection.planId } : {}),
    }))
  return {
    ...pocket,
    // Geometry is deliberately absent from the scaffold. Zero is a stable,
    // render-safe checkpoint until the map-owning lane supplies coordinates.
    bounds: pocket.bounds || { w: 0, h: 0 },
    spawn,
    spawns,
    entities: pocket.entities || [],
    exits,
    decor: pocket.decor || [],
  }
}

export const REGISTERED_REGIONS = Object.freeze({
  'asterion-reach': Object.freeze({
    id: 'asterion-reach',
    act: 1,
    name: 'Asterion Reach: Ash at Dawn',
    entry: { mapId: 'beacon-overlook', spawnId: 'start', prerequisites: [] },
    pockets: ACT1_MAPS,
    mainQuestId: 'mq-act1-ash-at-dawn',
    optionalQuestId: 'sq-lost-witness',
  }),
  ...Object.fromEntries(LATER_REGIONS.map((region) => [region.id, region])),
})

export const REGISTERED_MAPS = Object.freeze({
  ...ACT1_MAPS,
  // Act II has accepted render geometry. Consume that canonical merge rather
  // than normalizing its authored coordinates back to zero-valued scaffolds.
  ...ACT2_RENDERABLE_MAPS,
  ...ACT3_RENDERABLE_MAPS,
  ...ACT4_RENDERABLE_MAPS,
  ...ACT5_RENDERABLE_MAPS,
  ...Object.fromEntries(
    Object.entries(SCAFFOLD_POCKETS).map(([id, pocket]) => [id, Object.freeze(normalizePocket(pocket))]),
  ),
})

// Minimal playable-entry conversation. It deliberately lives at the registry
// seam: act2Content owns the quest contract, act2Runtime owns geometry, and the
// registry supplies the line graph needed by the generic dialogue runtime.
const ACT2_ENTRY_CONVERSATION = Object.freeze({
  id: 'act2-melite-oath-post',
  speakerIds: ['melite', 'kallias'],
  start: 'n1',
  nodes: Object.freeze({
    n1: Object.freeze({
      speakerId: 'melite',
      text: 'Far-Sighted brought you to Pelagos, then. The tide remembers every crossing, but the oath-post has begun calling arrival and permission the same name.',
      effects: Object.freeze([{ kind: 'flag', id: 'act2-melite-met', value: true }]),
      next: 'n2',
    }),
    n2: Object.freeze({
      speakerId: 'kallias',
      text: 'Then we separate them before the harbor forgets who may leave — and who was ever welcomed here.',
      next: 'n3',
    }),
    n3: Object.freeze({
      speakerId: 'melite',
      text: 'Start at the breakwater. Read the tide by its shape as well as its color, and turn it only at a marked well. Pelagos will answer an honest hand.',
      effects: Object.freeze([{ kind: 'marker', mapId: 'breakwater-road', entityId: 'surge-witness' }]),
      next: null,
    }),
  }),
})

export const REGISTERED_QUESTS = Object.freeze({
  ...ACT1_QUESTS,
  [ACT2_MAIN_QUEST.id]: ACT2_MAIN_QUEST,
  [ACT2_SIDE_QUEST.id]: ACT2_SIDE_QUEST,
  [ACT3_MAIN_QUEST.id]: ACT3_MAIN_QUEST,
  [ACT3_SIDE_QUEST.id]: ACT3_SIDE_QUEST,
  [ACT4_MAIN_QUEST.id]: ACT4_MAIN_QUEST,
  [ACT4_SIDE_QUEST.id]: ACT4_SIDE_QUEST,
  [ACT5_MAIN_QUEST.id]: ACT5_MAIN_QUEST,
  [ACT5_SIDE_QUEST.id]: ACT5_SIDE_QUEST,
})

export const REGISTERED_ENCOUNTERS = Object.freeze({
  ...ACT1_ENCOUNTERS,
  ...ACT2_ENCOUNTERS,
  ...ACT3_ENCOUNTERS,
  ...ACT4_ENCOUNTERS,
  ...ACT5_ENCOUNTERS,
})

export const REGISTERED_CONVERSATIONS = Object.freeze({
  ...ACT1_CONVERSATIONS,
  [ACT2_ENTRY_CONVERSATION.id]: ACT2_ENTRY_CONVERSATION,
  ...ACT5_CONVERSATIONS,
})

export const REGISTERED_ENCOUNTER_OWNER_QUEST = Object.freeze({
  ...ACT1_ENCOUNTER_OWNERS,
  ...ACT2_ENCOUNTER_OWNER_QUEST,
  ...ACT3_ENCOUNTER_OWNER_QUEST,
  ...ACT4_ENCOUNTER_OWNER_QUEST,
  ...ACT5_ENCOUNTER_OWNER_QUEST,
})

export function rpgRegionById(id) {
  return (typeof id === 'string' && REGISTERED_REGIONS[id]) || null
}

export function rpgRegionByAct(act) {
  return Object.values(REGISTERED_REGIONS).find((region) => region.act === act) || null
}

export function rpgMapById(id) {
  return (typeof id === 'string' && REGISTERED_MAPS[id]) || null
}

// Strict for explicit IDs: an invented named spawn never silently succeeds.
// Omitting spawnId selects the authored default.
export function rpgSpawnById(mapId, spawnId) {
  const map = rpgMapById(mapId)
  if (!map) return null
  const id = spawnId || map.spawn?.id || map.spawnId
  if (!id) return null
  return (map.spawns && map.spawns[id]) || (map.spawn?.id === id ? map.spawn : null)
}

export function rpgQuestDefById(id) {
  return (typeof id === 'string' && REGISTERED_QUESTS[id]) || null
}

export function rpgEncounterById(id) {
  return (typeof id === 'string' && REGISTERED_ENCOUNTERS[id]) || null
}

export function rpgConversationById(id) {
  return (typeof id === 'string' && REGISTERED_CONVERSATIONS[id]) || null
}

export function rpgConnectionById(id) {
  return LATER_CONNECTIONS.find((connection) => connection.id === id) || null
}

export function rpgEncounterOwnerQuestId(encounterId) {
  return REGISTERED_ENCOUNTER_OWNER_QUEST[encounterId] || null
}

export function registeredQuestIds() {
  return Object.keys(REGISTERED_QUESTS)
}

// The scaffold and Act I used different names for the same accepted boundary
// facts. Derive the canonical aliases rather than rewriting history in saves.
export function normalizedProgressFlags(state) {
  const flags = { ...(state?.flags || {}) }
  const completed = (questId) => state?.quests?.[questId]?.state === 'completed'
  if (state?.inventory?.epithetFragments?.includes('far-sighted')) {
    flags['act1-far-sighted-restored'] = true
  }
  if (completed('mq-act2-salt-covenant') || flags['mq-act2-salt-covenant-completed']) {
    flags['act2-salt-covenant-ratified'] = true
  }
  if (completed('mq-act3-withered-year') || flags['mq-act3-withered-year-completed']) {
    flags['act3-first-thaw'] = true
  }
  if (completed('mq-act4-false-constellation')) {
    flags['mq-act4-false-constellation-completed'] = true
  }
  return flags
}

export function prerequisitesMet(state, prerequisites = []) {
  const flags = normalizedProgressFlags(state)
  return prerequisites.every((requirement) => {
    if (!requirement || typeof requirement !== 'object') return false
    if (requirement.kind === 'quest-complete') {
      return state?.quests?.[requirement.questId]?.state === 'completed'
    }
    if (requirement.kind === 'flag') {
      return flags[requirement.flagId] === (requirement.value ?? true)
    }
    return false
  })
}
