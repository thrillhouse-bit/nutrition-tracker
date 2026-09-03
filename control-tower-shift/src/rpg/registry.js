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
  ACT2_MAIN_QUEST, ACT2_SIDE_QUEST, ACT2_ENCOUNTER_OWNER_QUEST, act2Authoring,
} from './act2Content.js'
import { ACT2_RENDERABLE_MAPS } from './act2Runtime.js'
import {
  ACT3_REGION, ACT3_CONNECTIONS, ACT3_ENCOUNTERS,
  ACT3_MAIN_QUEST, ACT3_SIDE_QUEST, ACT3_ENCOUNTER_OWNER_QUEST,
} from './act3Content.js'
import { ACT3_CONVERSATIONS } from './act3Conversations.js'
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

// Act II conversations. act2Content owns the quest contract, act2Runtime owns
// geometry, and the registry supplies the line graphs needed by the generic
// dialogue runtime.
const ACT2_CONVERSATIONS = Object.freeze({
  'act2-melite-oath-post': Object.freeze({
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
        next: 'melite-oath-ext-1',
      }),
      'melite-oath-ext-1': Object.freeze({
        speakerId: 'kallias',
        text: 'Before I walk out to it, define honest hand. At the breakwater, what does a dishonest one actually do? I can splice rope and carry a crate, but I have never kept a well in my life. Tell me the mistake in the hands, not the morals, and I will stay off it.',
        next: 'melite-oath-ext-2',
      }),
      'melite-oath-ext-2': Object.freeze({
        speakerId: 'melite',
        text: 'A dishonest hand draws out of turn. Watch the well head where the Crossing ends: the face goes low and still, and that water is what the harbor lets you have. Pull on the Surge instead and you bring up silt, salt, and a rope chafed loose at the throat — and every broken line is one more crew the oath-post learns to refuse. Take what the turn allows, cap the well behind you, and the tally stays clean.',
        next: 'melite-oath-ext-3',
      }),
      'melite-oath-ext-3': Object.freeze({
        speakerId: 'melite',
        text: 'Keep that tally clean while you are in it. Every arrival refused on a bad record is a crew I have to stand in front of on this quay and explain. This is my harbor. Setting arrival and permission back part is not work I can hand off, so I am not handing it to you either. I am lending it, and I expect it back.',
        next: null,
      }),
    }),
    authoring: act2Authoring({
      category: 'conversation',
      dramaticQuestion: 'Can Melite teach Kallias to separate arrival from permission before Pelagos turns a damaged oath into permanent exclusion?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Melite as met and places the First Surge marker on Breakwater Road.',
      downstreamConsequence: 'Its shape-and-color tide instructions define how the player reads every Act II traversal lane.',
      recoveryBehavior: 'The deterministic three-node scene can resume after interruption, and its flag and marker effects cannot duplicate progress.',
      expectedMinutes: 2,
      originalityNotes: 'Uses public-domain Greek harbor-keeper and sea-oath motifs; Melite’s arrival-versus-permission lesson is original Oathbearer writing.',
    }),
  }),
  // Fulfills the promise Thessa made at the close of Act I ("Ianthe keeps the
  // old tide-charts on the Pelagos strand... rebuild the name there") — Ianthe
  // never actually appeared in Act II until this scene. Drafted by a governed
  // Hermes worker (qwen/qwen3.8-flash) per CLAUDE-HERMES-SWARM-DIRECTIVE.md
  // and independently verified here (schema, word count, graph integrity,
  // required beats, prohibited-reveals list) before integration.
  'act2-ianthe-first-meeting': Object.freeze({
    id: 'act2-ianthe-first-meeting',
    speakerIds: ['ianthe', 'kallias'],
    start: 'n1',
    nodes: Object.freeze({
      n1: Object.freeze({ speakerId: 'ianthe', text: 'You have stood there long enough to read three of my charts. Either buy something or walk on. The docks are full of men who want my tide-tables and none who can pay.', next: 'n2' }),
      n2: Object.freeze({ speakerId: 'kallias', text: 'I am looking for Ianthe. Thessa sent me, out of Asterion Reach.', next: 'n3' }),
      n3: Object.freeze({ speakerId: 'ianthe', text: 'Thessa. Good. Thessa’s name buys you one look at my table and nothing more. Everyone who washes up here lately wants something the sea already took back.', next: 'n4' }),
      n4: Object.freeze({ speakerId: 'kallias', text: 'Then look at this. It is a fragment of an epithet. Far-Sighted. It does not point like a needle does. It leans seaward, and it pulls harder when the crossing turns.', next: 'n5' }),
      n5: Object.freeze({ speakerId: 'ianthe', text: 'Hold it over the depth columns. Do not move it. See how the set-and-drift figures fight against it? Glass does not do that. Neither does a lie. In eleven years of copying these charts, nothing has ever corrected one of mine before.', next: 'n6' }),
      n6: Object.freeze({ speakerId: 'ianthe', text: 'Understand what you are carrying. A name that leans seaward is a name trying to get back to the water it was sworn over. You will not stitch Far-Sighted shut on this strand. Follow the drift, not the shore.', next: 'c1' }),
      c1: Object.freeze({
        choices: Object.freeze([
          Object.freeze({ id: 'ianthe-hand-over-fragment', text: 'Set the fragment down on her chart table. Read it yourself. That is why I came this far to find you.', next: 'n7' }),
          Object.freeze({ id: 'ianthe-keep-fragment-close', text: 'Keep it in your hand. Tell me the route and I will go. I would rather you did not touch it.', next: 'n8' }),
        ]),
      }),
      n7: Object.freeze({ speakerId: 'ianthe', text: 'Careful. First thing a stranger has handed me in two years that I did not have to pry open. Point at the column you want measured.', next: 'n9' }),
      n8: Object.freeze({ speakerId: 'ianthe', text: 'Fair enough. Keep it close. The charts do not need your hands, only your eyes. Hold it level with the outer marker and tell me which way the lean swings when the tide crosses.', next: 'n9' }),
      n9: Object.freeze({ speakerId: 'ianthe', text: 'Here. See where the old shoal road threads out past the Dry Mouths? Every pilot who ran it is gone, but the water still runs it, and it runs straight past the Salt Covenant toward the Fields of Kore. Take that heading. And when the Surge turns the wrong color, do not anchor off low ground. Those shores get borrowed back without warning.', next: 'n10' }),
      n10: Object.freeze({ speakerId: 'ianthe', text: 'Go on, then. And when you have the rest of your god’s name in hand, send word to this table. I would like to check my columns against it.', effects: Object.freeze([{ kind: 'flag', id: 'ianthe-met', value: true }]), next: null }),
    }),
    authoring: act2Authoring({
      category: 'conversation',
      dramaticQuestion: 'Will a stranger’s claim about a god’s fragment earn a working chart-reader’s trust before her patience runs out?',
      systemsUsed: ['dialogue', 'questing'],
      durableReward: 'The scene records Ianthe as met and gives Kallias a concrete heading for the road beyond the Salt Covenant.',
      downstreamConsequence: 'It closes the promise Thessa made at the end of Act I and grounds the Fields of Kore as a real, chart-read destination rather than an abstract next chapter.',
      recoveryBehavior: 'The deterministic ten-node scene, including one reconverging player choice, can resume after interruption; its flag effect applies only once regardless of replay.',
      expectedMinutes: 3,
      originalityNotes: 'Uses public-domain Mediterranean tide-chart and wayfinding practice; Ianthe’s transactional voice and the fragment-reading scene are original Oathbearer writing.',
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
  ...ACT2_CONVERSATIONS,
  ...ACT3_CONVERSATIONS,
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
