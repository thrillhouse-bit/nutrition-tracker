// RPG state reducer — schema v1, pure functions. No quest logic lives in
// `game/state.js`; this module owns story state. Every export is a pure
// function of (state, event) → new state, so progression is deterministic and
// unit-testable. Display text is never used to infer progression.

import { TIER1_PATRON_IDS } from './content.js'
import { ACT2_TIDE_ORDER, ACT2_TIDE_RULES, ACT2_TIDE_STATES, ACT2_RESTORATION_FORMULATIONS } from './act2Content.js'
import { ACT3_RESTORATION_FORMULATIONS } from './act3Content.js'
import { ACT4_PRESSURE_RULES, ACT4_RESTORATION_FORMULATIONS } from './act4Content.js'
import { ACT5_ENDING_VARIANTS, ACT5_LIGHT_POLARITY_RULES } from './act5Content.js'
import {
  rpgRegionByAct,
  rpgMapById as mapById,
  rpgQuestDefById as questDefById,
  rpgEncounterById as encounterById,
  rpgConversationById as conversationById,
  rpgSpawnById as spawnById,
  rpgEncounterOwnerQuestId,
  registeredQuestIds,
  normalizedProgressFlags,
  prerequisitesMet,
} from './registry.js'
import {
  ITEM_DEFS,
  addInventoryItem,
  awardSkillXp,
  awardSkillXpBundle,
  createInitialInventory,
  createInitialSkills,
  depositAllMaterials,
  levelForXp,
  withdrawBankItem,
} from './progression.js'
import { ALL_ITEM_DEFS, RECIPES, craft as resolveCraft } from './crafting.js'
import { craftingAccessDecision, wildernessAccessDecision } from './systemAccess.js'
import {
  REGIONS_BY_ID as WILDERNESS_REGIONS_BY_ID,
  planDeathDrop,
  rollWildernessEncounter,
  wildernessCombatRewards,
} from './wilderness.js'

export const SCHEMA_VERSION = 1

// Stable, documented spawn for a new schema-v1 save.
export const START_MAP = 'beacon-overlook'
export const START_SPAWN = 'start'
export const ACT2_TIDE_FLAG = 'act2:tide-state'
export const ACT5_LIGHT_FLAG = 'act5:light-state'

function arrivalLightStateId(spawn) {
  const lightStateId = spawn?.arrivalState?.lightStateId
  return ACT5_LIGHT_POLARITY_RULES.stateIds.includes(lightStateId) ? lightStateId : null
}

function restoreSpawnArrivalState(state, spawn) {
  const lightStateId = arrivalLightStateId(spawn)
  return lightStateId
    ? { ...state, flags: { ...state.flags, [ACT5_LIGHT_FLAG]: lightStateId } }
    : state
}

// Deterministic per-encounter seed (FNV-1a over the encounter id). The same
// encounter always gets the same seed, so replays are identical.
export function seedForEncounter(id) {
  let h = 2166136261
  for (let i = 0; i < String(id).length; i++) h = Math.imul(h ^ String(id).charCodeAt(i), 16777619)
  return (h ^ 0x9e3779b9) >>> 0
}

export function freshQuest(questId) {
  const def = questDefById(questId)
  if (!def) return null
  const autoAccept = def.kind === 'main'
  return {
    state: autoAccept ? 'active' : 'available',
    objectiveIndex: 0,
    objectiveCounts: {},
  }
}

export function createInitialState(opts = {}) {
  const map = mapById(START_MAP)
  const spawn = spawnById(START_MAP, START_SPAWN) || map.spawn
  // Main quest auto-accepts and its first objective (reach spawn) is satisfied
  // the moment the save exists at the documented spawn.
  const quests = {
    'mq-act1-ash-at-dawn': { ...freshQuest('mq-act1-ash-at-dawn'), objectiveIndex: 1 },
  }
  if (opts.withSideQuest) {
    quests['sq-lost-witness'] = freshQuest('sq-lost-witness')
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'playing',
    protagonist: {
      presentation: opts.presentation || 'he/him',
      activePatronId: null,
      unlockedPatronIds: [],
    },
    world: {
      regionId: map.region,
      mapId: START_MAP,
      spawnId: START_SPAWN,
      position: { x: spawn.x, y: spawn.y },
      facing: spawn.facing || 0,
    },
    mainQuestId: 'mq-act1-ash-at-dawn',
    quests,
    flags: {},
    inventory: createInitialInventory(),
    progression: { rank: 0, powerUnlocks: [], shrineIds: [], skills: createInitialSkills(), totalXp: 0 },
    wilderness: {
      regionId: null,
      riskBand: 'low',
      step: 0,
      skulled: false,
      devotionActive: false,
      pendingEnemyId: null,
      activeEncounterKey: null,
      lastDeathDrop: null,
    },
    crafting: { stationId: null, lastResult: null },
    combatSnapshot: null,
    playtimeTicks: 0,
    // No clock reads in the reducer: savedAt is stamped at the persistence
    // boundary (or by the caller) and defaults deterministically here.
    savedAt: typeof opts.savedAt === 'string' ? opts.savedAt : '',
  }
}

// Start a registered act only through its authored entry contract. This is an
// explicit transition so the existing Act I ending card remains backwards
// compatible and the UI can decide when to cross the region boundary.
export function beginAct(state, act) {
  // Act I presents its accepted boundary as `ending`; BEGIN_ACT is the sole
  // legal way out of that card. Ordinary starts from `playing` remain valid
  // for tests/tools, while dialogue/combat/paused states stay immutable.
  if (state.status !== 'playing' && state.status !== 'ending') return state
  const region = rpgRegionByAct(Number(act))
  if (!region || region.act === 1 || !prerequisitesMet(state, region.entry?.prerequisites)) return state
  const quest = questDefById(region.mainQuestId)
  const map = mapById(region.entry?.mapId)
  const spawn = spawnById(region.entry?.mapId, region.entry?.spawnId)
  if (!quest || !map || !spawn) return state
  const existing = state.quests[quest.id]
  if (existing?.state === 'completed') return state
  return {
    ...state,
    status: 'playing',
    mainQuestId: quest.id,
    quests: {
      ...state.quests,
      [quest.id]: existing && existing.state === 'active'
        ? existing
        : { ...freshQuest(quest.id), state: 'active', acceptedAtTick: state.playtimeTicks },
    },
    flags: {
      ...normalizedProgressFlags(state),
      ...(region.act === 2 ? {
        'act2-pelagos-arrived': true,
        [ACT2_TIDE_FLAG]: map.tide?.initialStateId || ACT2_TIDE_ORDER[0],
      } : {}),
      ...(region.act === 3 ? {
        'act3-fields-arrived': true,
        'act3:season-state': map.season?.initialStateId || 'winter',
      } : {}),
      ...(region.act === 4 ? {
        'act4-forge-arrived': true,
        'act4:pressure-state': map.pressure?.initialStateId || ACT4_PRESSURE_RULES.states[0],
      } : {}),
      ...(region.act === 5 ? {
        'act5-night-stair-arrived': true,
        [ACT5_LIGHT_FLAG]: arrivalLightStateId(spawn) || map.light?.initialStateId || 'shadow',
      } : {}),
    },
    world: {
      regionId: map.region,
      mapId: map.id,
      spawnId: spawn.id,
      position: { x: spawn.x, y: spawn.y },
      facing: spawn.facing || 0,
    },
  }
}

// ─── Objective helpers ─────────────────────────────────────────
export function currentObjective(state) {
  const q = state.quests[state.mainQuestId]
  const def = questDefById(state.mainQuestId)
  if (!q || !def || q.state !== 'active') return null
  return def.objectives[q.objectiveIndex] || null
}

export function questProgress(state, questId) {
  return state.quests[questId] || null
}

export function isEncounterCleared(state, encounterId) {
  const enc = encounterById(encounterId)
  return Boolean(enc && state.flags[enc.completionFlag])
}

// Advance any registered quest by one objective, completing it and applying
// rewards exactly once at the final boundary.
function advanceQuest(state, questId, context = {}) {
  let q = state.quests[questId]
  const def = questDefById(questId)
  if (!q || !def || q.state !== 'active') return state
  const objective = def.objectives[q.objectiveIndex]
  state = applyObjectiveEffects(state, objective, context)
  q = state.quests[questId]
  const nextIndex = q.objectiveIndex + 1
  if (nextIndex >= def.objectives.length) {
    let next = { ...state, quests: { ...state.quests, [questId]: { ...q, state: 'completed', objectiveIndex: nextIndex, completedAtTick: state.playtimeTicks } } }
    next = applyRewards(next, def.rewards || [])
    const act = Math.max(1, Number(def.act) || 1)
    next = awardSkillXpBundle(next, def.kind === 'main'
      ? [
          { skillId: 'oathkeeping', amount: 320 * act },
          { skillId: 'wayfinding', amount: 140 * act },
        ]
      : [
          { skillId: 'oathkeeping', amount: 90 * act },
          { skillId: 'wayfinding', amount: 55 * act },
        ])
    const region = def.kind === 'main' ? rpgRegionByAct(def.act) : null
    if (region?.act > 1 && region.exit) {
      next = applyRewards(next, region.exit.effects || [])
      const map = mapById(region.exit.mapId)
      const spawn = spawnById(region.exit.mapId, region.exit.spawnId)
      if (map && spawn) {
        next = {
          ...next,
          // Every completed chapter owns the same explicit boundary state.
          // The UI either begins the next registered act or, after Act V,
          // acknowledges the epilogue and returns to free exploration.
          status: 'ending',
          world: {
            regionId: map.region,
            mapId: map.id,
            spawnId: spawn.id,
            position: { x: spawn.x, y: spawn.y },
            facing: spawn.facing || 0,
          },
        }
      }
    }
    return next
  }
  return { ...state, quests: { ...state.quests, [questId]: { ...q, objectiveIndex: nextIndex } } }
}

function advanceMain(state) {
  return advanceQuest(state, state.mainQuestId)
}

function advanceSide(state, questId) {
  return advanceQuest(state, questId)
}

// Apply deterministic reward effects. Idempotent where sensible: flags set only
// once; currency accumulates on explicit completion (completion happens once).
function applyRewards(state, effects) {
  let next = state
  for (const fx of effects || []) {
    if (fx.kind === 'currency') {
      next = { ...next, inventory: { ...next.inventory, currency: (next.inventory.currency || 0) + (fx.amount || 0) } }
    } else if (fx.kind === 'flag') {
      next = setFlag(next, fx.id, fx.value ?? true)
    } else if (fx.kind === 'item') {
      if (ITEM_DEFS[fx.id]) {
        next = { ...next, inventory: addInventoryItem(next.inventory, fx.id, fx.quantity || 1).inventory }
      } else {
        next = { ...next, inventory: { ...next.inventory, questItems: [...(next.inventory.questItems || []), fx.id] } }
      }
    } else if (fx.kind === 'xp') {
      next = awardSkillXp(next, fx.skillId, fx.amount)
    } else if (fx.kind === 'epithet') {
      next = collectEpithet(next, fx.id)
    } else if (fx.kind === 'unlock-region') {
      next = setFlag(next, `region:${fx.regionId}:unlocked`, true)
    } else if (fx.kind === 'codex') {
      next = setFlag(next, `codex:${fx.entryId}`, true)
    } else if (fx.kind === 'epilogue') {
      next = setFlag(next, `epilogue:${fx.treatment}`, true)
    } else if (fx.kind === 'set-ending' && fx.choiceId) {
      next = setFlag(next, 'act5-ending', fx.choiceId)
    }
  }
  return next
}

const OBJECTIVE_COMPLETION_FLAGS = Object.freeze({
  'join-the-covenant': 'act3-covenant-joined',
  'choose-march-plan': 'act4-march-plan',
  'return-prometheus-fire': 'act4-fire-returned',
  'release-atlas-anchors': 'act4-atlas-released',
  'recover-covenant-witnesses': 'act4-witnesses-freed',
  'reject-single-crown': 'act4-single-crown-rejected',
  'ratify-mortal-draft': 'act4-mortal-draft-ratified',
})

function applyObjectiveEffects(state, objective, context = {}) {
  if (!objective) return state
  const choiceId = context.choiceId
  const effects = (objective.effects || []).map((effect) => {
    if (effect.kind === 'set-ending' && effect.idFromChoice) return { ...effect, choiceId }
    if (effect.kind === 'flag' && effect.valueFromChoice) return { ...effect, value: choiceId }
    return effect
  })
  if (objective.grantsItem) effects.push({ kind: 'item', id: objective.grantsItem })
  const implicitFlag = OBJECTIVE_COMPLETION_FLAGS[objective.id]
  if (implicitFlag) effects.push({ kind: 'flag', id: implicitFlag, value: true })
  return applyRewards(state, effects)
}

// Add an epithet fragment exactly once — never a duplicate in the collection.
function collectEpithet(state, id) {
  const fragments = state.inventory?.epithetFragments || []
  if (!id || fragments.includes(id)) return state
  return { ...state, inventory: { ...state.inventory, epithetFragments: [...fragments, id] } }
}

function setFlag(state, id, value = true) {
  return { ...state, flags: { ...state.flags, [id]: value } }
}

function applyConversationEffects(state, effects) {
  let next = state
  for (const fx of effects || []) {
    if (fx.kind === 'flag') next = setFlag(next, fx.id, fx.value ?? true)
    else if (fx.kind === 'currency') next = { ...next, inventory: { ...next.inventory, currency: (next.inventory.currency || 0) + (fx.amount || 0) } }
    else if (fx.kind === 'marker') next = { ...next, flags: { ...next.flags, [`marker:${fx.mapId}:${fx.entityId}`]: true } }
    else if (fx.kind === 'epithet') next = collectEpithet(next, fx.id)
    else if (fx.kind === 'item') {
      next = ITEM_DEFS[fx.id]
        ? { ...next, inventory: addInventoryItem(next.inventory, fx.id, fx.quantity || 1).inventory }
        : { ...next, inventory: { ...next.inventory, questItems: [...(next.inventory.questItems || []), fx.id] } }
    } else if (fx.kind === 'xp') next = awardSkillXp(next, fx.skillId, fx.amount)
  }
  return next
}

// Deterministic union of a conversation's effects: every effect on every node,
// plus any top-level effects. Deduped by id where present so a re-watched or
// skipped conversation cannot double-apply the same marker/flag.
function collectConversationEffects(convo) {
  const out = []
  const seen = new Set()
  const push = (fx) => {
    if (!fx) return
    const key = fx.id || `${fx.kind}:${fx.mapId || ''}:${fx.entityId || ''}:${fx.value === false ? 'F' : 'T'}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(fx)
  }
  for (const fx of convo.effects || []) push(fx)
  for (const node of Object.values(convo.nodes || {})) {
    for (const fx of node.effects || []) push(fx)
  }
  return out
}

const conversationChoiceFlag = (conversationId, choiceId) => `conversation-choice:${conversationId}:${choiceId}`

function requiredConversationChoiceGroups(convo) {
  return Object.values(convo?.nodes || {})
    .map((node) => node.choices || [])
    .filter((choices) => choices.length > 0)
}

// A node with authored choices is an explicit required-choice contract: one
// available choice from each such node must be recorded before the dialogue
// may be skipped or completed. Ordinary linear conversations have no groups
// and remain freely skippable.
export function conversationRequiredChoicesMet(state, conversation) {
  const convo = typeof conversation === 'string' ? conversationById(conversation) : conversation
  if (!convo) return false
  return requiredConversationChoiceGroups(convo).every((choices) =>
    choices.some((choice) => Boolean(state?.flags?.[conversationChoiceFlag(convo.id, choice.id)])))
}

// ─── Event reducer ─────────────────────────────────────────────
export function applyEvent(state, event) {
  if (!event || !event.type) return state
  switch (event.type) {
    case 'REACH': return reach(state, event)
    case 'MOVE': return move(state, event)
    case 'TALK': return talk(state, event)
    case 'BEGIN_DIALOGUE': return beginDialogue(state, event)
    case 'DIALOGUE_END': return dialogueEnd(state, event)
    case 'INTERACT': return interact(state, event)
    case 'CHOOSE_PATRON': return choosePatron(state, event)
    case 'TRAVERSE': return traverse(state, event)
    case 'ENTER_ENCOUNTER': return enterEncounter(state, event)
    case 'COMBAT_WON': return combatWon(state, event)
    case 'COMBAT_FAILED': return combatFailed(state, event)
    case 'ACK_ENDING': return ackEnding(state, event)
    case 'BEGIN_ACT': return beginAct(state, event.act)
    case 'CHOOSE': return choose(state, event)
    case 'TALK_COMPLETE': return talkComplete(state, event)
    case 'GAIN_XP': return awardSkillXp(state, event.skillId, event.amount)
    case 'ADD_ITEM': {
      const quantity = positiveIntegerQuantity(event.quantity)
      return ITEM_DEFS[event.itemId] && quantity
        ? { ...state, inventory: addInventoryItem(state.inventory, event.itemId, quantity).inventory }
        : state
    }
    case 'GATHER': return gather(state, event)
    case 'WILDERNESS_ENTER': return wildernessEnter(state, event)
    case 'WILDERNESS_STEP': return wildernessStep(state, event)
    case 'WILDERNESS_COMBAT_START': return wildernessCombatStart(state, event)
    case 'WILDERNESS_VICTORY': return wildernessVictory(state, event)
    case 'WILDERNESS_DEFEAT': return wildernessDefeat(state, event)
    case 'WILDERNESS_EXIT': return wildernessExit(state)
    case 'OPEN_CRAFTING': return openCrafting(state, event)
    case 'CRAFT': return craftAtStation(state, event)
    case 'CLOSE_CRAFTING': return closeCrafting(state)
    case 'BANK_DEPOSIT_MATERIALS': return state.status === 'playing'
      ? { ...state, inventory: depositAllMaterials(state.inventory, ALL_ITEM_DEFS) }
      : state
    case 'BANK_WITHDRAW': {
      const quantity = positiveIntegerQuantity(event.quantity)
      return state.status === 'playing' && quantity
        ? { ...state, inventory: withdrawBankItem(state.inventory, event.itemId, quantity, ALL_ITEM_DEFS) }
        : state
    }
    case 'PAUSE': return state.status === 'playing' ? { ...state, status: 'paused' } : state
    case 'RESUME': return state.status === 'paused' ? { ...state, status: 'playing' } : state
    case 'TICK': return { ...state, playtimeTicks: state.playtimeTicks + Math.max(0, event.n || 1) }
    default: return state
  }
}

function positiveIntegerQuantity(quantity) {
  const value = Number(quantity ?? 1)
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null
}

// Active conversation is stored in flags so the documented schema stays intact.
export const ACTIVE_CONVO_FLAG = 'rpg:active-conversation'
export const ACTIVE_CONVO_NPC_FLAG = 'rpg:active-conversation-npc'

function currentMainMatch(state, match) {
  const obj = currentObjective(state)
  if (!obj) return false
  for (const [k, v] of Object.entries(match)) if (obj[k] !== v) return false
  return true
}

function objectiveForQuest(state, questId) {
  const progress = state.quests[questId]
  const def = questDefById(questId)
  if (!progress || !def || progress.state !== 'active') return null
  return def.objectives[progress.objectiveIndex] || null
}

function matchingActiveQuest(state, predicate) {
  const ids = [state.mainQuestId, ...registeredQuestIds().filter((id) => id !== state.mainQuestId)]
  return ids.find((questId) => {
    const objective = objectiveForQuest(state, questId)
    return objective && predicate(objective, questId)
  }) || null
}

function objectiveIncludesNpc(objective, npcId) {
  if (!objective || !npcId) return false
  if (objective.npcId) return objective.npcId === npcId
  if (Array.isArray(objective.npcIds)) return objective.npcIds.includes(npcId)
  if (Array.isArray(objective.speakerIds)) return objective.speakerIds.includes(npcId)
  return false
}

// Pure UI/reducer conversation routing. An exact active main-quest scene wins;
// otherwise an incomplete default NPC scene is shown once before an eligible
// active optional multi-speaker scene. Completed/default scenes remain the
// replay fallback when no optional objective is active.
export function resolveConversationId(state, npc) {
  if (!state || !npc?.id) return null
  const main = currentObjective(state)
  if (
    main?.conversationId
    && ['talk', 'multi-talk'].includes(main.kind)
    && objectiveIncludesNpc(main, npc.id)
  ) return main.conversationId

  const defaultId = typeof npc.conversationId === 'string' ? npc.conversationId : null
  const optionalIds = new Set(npc.optionalConversationIds || [])
  if (defaultId && !optionalIds.has(defaultId) && !state.flags[`conversation:completed:${defaultId}`]) {
    return defaultId
  }

  const optionalQuestId = registeredQuestIds().find((questId) => {
    if (questId === state.mainQuestId) return false
    const objective = objectiveForQuest(state, questId)
    return Boolean(
      objective?.conversationId
      && ['talk', 'multi-talk'].includes(objective.kind)
      && objectiveIncludesNpc(objective, npc.id)
      && optionalIds.has(objective.conversationId)
    )
  })
  return optionalQuestId ? objectiveForQuest(state, optionalQuestId).conversationId : defaultId
}

function matchEntityObjective(objective, entityId) {
  if (!objective || !entityId) return false
  if (objective.entityId) {
    const bare = String(objective.entityId).split(':').at(-1)
    return entityId === objective.entityId || entityId === bare
  }
  return Array.isArray(objective.entityIds) && objective.entityIds.includes(entityId)
}

function recordObjectiveEntity(state, questId, objective, entityId) {
  const progress = state.quests[questId]
  if (!progress || !matchEntityObjective(objective, entityId)) return state
  const seenFlag = `objective:${questId}:${objective.id}:${entityId}`
  if (state.flags[seenFlag]) return state
  const prior = Number(progress.objectiveCounts?.[objective.id]) || 0
  if (Array.isArray(objective.entityIds) && (objective.orderFree === false || objective.ordered || Array.isArray(objective.fixedActOrder))) {
    if (objective.entityIds[prior] !== entityId) return state
  }
  const count = prior + 1
  let next = {
    ...state,
    flags: { ...state.flags, [seenFlag]: true },
    quests: {
      ...state.quests,
      [questId]: {
        ...progress,
        objectiveCounts: { ...progress.objectiveCounts, [objective.id]: count },
      },
    },
  }
  const target = Math.max(1, objective.count || objective.entityIds?.length || 1)
  if (count >= target) next = advanceQuest(next, questId)
  return next
}

function reach(state, event) {
  if (state.status !== 'playing') return state
  if (currentMainMatch(state, { kind: 'reach', mapId: event.mapId, markerId: event.markerId })) {
    return advanceMain(state)
  }
  const side = matchingActiveQuest(state, (objective, questId) =>
    questId !== state.mainQuestId && objective.kind === 'reach' &&
    objective.mapId === event.mapId && objective.markerId === event.markerId)
  if (side) return advanceSide(state, side)
  return state
}

function move(state, event) {
  if (state.status !== 'playing') return state
  const x = typeof event.x === 'number' ? event.x : state.world.position.x
  const y = typeof event.y === 'number' ? event.y : state.world.position.y
  const facing = typeof event.facing === 'number' ? event.facing : state.world.facing
  return {
    ...state,
    world: { ...state.world, position: { x, y }, facing },
  }
}

function gather(state, event) {
  if (state.status !== 'playing') return state
  const map = mapById(state.world.mapId)
  const resource = map?.entities?.find((entity) => entity.id === event.entityId && entity.kind === 'resource')
  if (!resource || !ITEM_DEFS[resource.itemId]) return state
  const xp = state.progression?.skills?.[resource.skillId]?.xp || 0
  if (levelForXp(xp) < (resource.level || 1)) return state
  const result = addInventoryItem(state.inventory, resource.itemId, resource.quantity || 1)
  if (!result.added) return state
  return awardSkillXp({ ...state, inventory: result.inventory }, resource.skillId, resource.xp || 10)
}

function wildernessEnter(state, event) {
  if (state.status !== 'playing') return state
  const region = WILDERNESS_REGIONS_BY_ID[event.regionId]
  if (!region) return state
  if (!wildernessAccessDecision(state.world?.mapId, region.id)?.available) return state
  return {
    ...state,
    wilderness: {
      ...state.wilderness,
      regionId: region.id,
      riskBand: region.riskBand,
      step: 0,
      pendingEnemyId: null,
      activeEncounterKey: null,
      lastDeathDrop: null,
    },
  }
}

function wildernessStep(state, event) {
  if (state.status !== 'playing' || !state.wilderness?.regionId || state.wilderness.pendingEnemyId) return state
  const step = Math.max(0, Math.floor(state.wilderness.step || 0))
  const enemyId = rollWildernessEncounter({
    regionId: state.wilderness.regionId,
    seed: Number.isFinite(event.seed) ? event.seed : seedForEncounter(state.wilderness.regionId),
    step,
  })
  return {
    ...state,
    wilderness: { ...state.wilderness, step: step + 1, pendingEnemyId: enemyId, activeEncounterKey: null },
  }
}

function wildernessEncounterKey(state) {
  const regionId = state.wilderness?.regionId
  const enemyId = state.wilderness?.pendingEnemyId
  if (!regionId || !enemyId) return null
  return `${regionId}:${Math.max(0, Math.floor(state.wilderness.step || 0))}:${enemyId}`
}

function wildernessCombatStart(state, event) {
  if (state.status !== 'playing' || !state.wilderness?.pendingEnemyId) return state
  if (event.enemyId !== state.wilderness.pendingEnemyId) return state
  const encounterKey = wildernessEncounterKey(state)
  if (!encounterKey || event.encounterKey !== encounterKey) return state
  return {
    ...state,
    status: 'in-combat',
    wilderness: { ...state.wilderness, activeEncounterKey: encounterKey },
  }
}

function wildernessVictory(state, event) {
  if (!['playing', 'in-combat'].includes(state.status) || !state.wilderness?.pendingEnemyId) return state
  const enemyId = event.enemyId || state.wilderness.pendingEnemyId
  if (enemyId !== state.wilderness.pendingEnemyId) return state
  if (state.status === 'in-combat' && (
    event.encounterKey !== state.wilderness.activeEncounterKey
    || event.encounterKey !== wildernessEncounterKey(state)
  )) return state
  const rewardKey = event.encounterKey || `${state.wilderness.regionId}:${state.wilderness.step}:${enemyId}`
  const rewardFlag = `wilderness:reward:${rewardKey}`
  if (state.flags[rewardFlag]) {
    return { ...state, status: 'playing', wilderness: { ...state.wilderness, pendingEnemyId: null, activeEncounterKey: null } }
  }
  const rewards = wildernessCombatRewards({ enemyId, damageByStyle: event.damageByStyle, killCredit: true })
  if (!rewards) return state
  let inventory = state.inventory
  for (const item of rewards.items) {
    inventory = addInventoryItem(inventory, item.itemId, item.quantity, ALL_ITEM_DEFS).inventory
  }
  inventory = { ...inventory, currency: (inventory.currency || 0) + rewards.currency }
  let next = awardSkillXpBundle({
    ...state,
    status: 'playing',
    flags: { ...state.flags, [rewardFlag]: true },
    inventory,
    wilderness: { ...state.wilderness, pendingEnemyId: null, activeEncounterKey: null },
  }, Object.entries(rewards.xp).map(([skillId, amount]) => ({ skillId, amount })))
  return next
}

function wildernessDefeat(state, event) {
  // A settlement is valid only for the active pending fight. This makes a
  // duplicated UI effect or stale arena callback an identity-preserving no-op
  // instead of charging the death penalty twice.
  if (state.status !== 'in-combat' || !state.wilderness?.regionId || !state.wilderness?.pendingEnemyId) return state
  const encounterKey = wildernessEncounterKey(state)
  if (
    event.enemyId !== state.wilderness.pendingEnemyId
    || !encounterKey
    || event.encounterKey !== encounterKey
    || event.encounterKey !== state.wilderness.activeEncounterKey
  ) return state
  const drop = planDeathDrop({
    inventory: state.inventory,
    riskBand: state.wilderness.riskBand,
    skulled: state.wilderness.skulled,
    devotionActive: state.wilderness.devotionActive,
  })
  return {
    ...state,
    status: 'playing',
    inventory: {
      ...state.inventory,
      slots: drop.kept,
      currency: Math.max(0, (state.inventory.currency || 0) - drop.lostCurrency),
    },
    wilderness: {
      ...state.wilderness,
      pendingEnemyId: null,
      activeEncounterKey: null,
      lastDeathDrop: {
        dropped: drop.dropped,
        lostCurrency: drop.lostCurrency,
        cause: typeof event.cause === 'string' && event.cause ? event.cause : event.enemyId,
      },
    },
  }
}

function wildernessExit(state) {
  if (state.status !== 'playing' || !state.wilderness?.regionId) return state
  return {
    ...state,
    wilderness: { ...state.wilderness, regionId: null, pendingEnemyId: null, activeEncounterKey: null, step: 0 },
  }
}

function openCrafting(state, event) {
  if (state.status !== 'playing' || !RECIPES.some((recipe) => recipe.stationId === event.stationId)) return state
  if (!craftingAccessDecision(state.world?.mapId, event.stationId)?.available) return state
  return { ...state, crafting: { stationId: event.stationId, lastResult: null } }
}

function craftAtStation(state, event) {
  if (state.status !== 'playing' || !state.crafting?.stationId) return state
  if (!craftingAccessDecision(state.world?.mapId, state.crafting.stationId)?.available) {
    return { ...state, crafting: { stationId: null, lastResult: null } }
  }
  const outcome = resolveCraft({
    inventory: state.inventory,
    skills: state.progression.skills,
    progression: state.progression,
    stationId: state.crafting.stationId,
  }, event.recipeId, event.quantity ?? 1)
  if (!outcome.result.ok) {
    return { ...state, crafting: { ...state.crafting, lastResult: outcome.result } }
  }
  return {
    ...state,
    inventory: outcome.inventory,
    progression: outcome.progression,
    crafting: { ...state.crafting, lastResult: outcome.result },
  }
}

function closeCrafting(state) {
  if (!state.crafting?.stationId) return state
  return { ...state, crafting: { stationId: null, lastResult: state.crafting.lastResult } }
}

function talk(state, event) {
  if (state.status !== 'playing') return state
  // Later-act scaffolds can author a talk objective before its line graph is
  // integrated. Exact authored IDs may complete through the same TALK event;
  // Act I conversations still enter dialogue and require DIALOGUE_END.
  if (!conversationById(event.conversationId)) return talkComplete(state, event)
  // The NPC must be on the current map and match the requested speaker.
  const map = mapById(state.world.mapId)
  const npc = map && map.entities.find((e) => e.id === event.npcId && (e.kind === 'npc'))
  if (!npc || resolveConversationId(state, npc) !== event.conversationId) return state
  return {
    ...state,
    status: 'in-dialogue',
    flags: {
      ...state.flags,
      [ACTIVE_CONVO_FLAG]: event.conversationId,
      [ACTIVE_CONVO_NPC_FLAG]: npc.id,
    },
  }
}

function beginDialogue(state, event) {
  if (state.status !== 'playing' || !conversationById(event.conversationId)) return state
  return {
    ...state,
    status: 'in-dialogue',
    flags: { ...state.flags, [ACTIVE_CONVO_FLAG]: event.conversationId },
  }
}

function talkComplete(state, event) {
  if (state.status !== 'playing') return state
  const questId = matchingActiveQuest(state, (objective) =>
    (objective.kind === 'talk' || objective.kind === 'multi-talk') &&
    (!objective.conversationId || objective.conversationId === event.conversationId) &&
    (!objective.npcId || objective.npcId === event.npcId) &&
    (!objective.speakerIds || objective.speakerIds.includes(event.npcId)) &&
    (!objective.npcIds || objective.npcIds.includes(event.npcId)))
  if (!questId) return state
  const objective = objectiveForQuest(state, questId)
  if (objective.kind === 'multi-talk' || objective.npcIds) {
    return recordObjectiveEntity(state, questId, { ...objective, entityIds: objective.speakerIds || objective.npcIds }, event.npcId)
  }
  return advanceQuest(state, questId)
}

function dialogueEnd(state, event) {
  if (state.status !== 'in-dialogue') return state
  const convoId = state.flags[ACTIVE_CONVO_FLAG]
  if (event.conversationId && event.conversationId !== convoId) return state
  const convo = conversationById(convoId)
  if (!convo) return { ...state, status: 'playing', flags: dropFlags(state.flags, [ACTIVE_CONVO_FLAG, ACTIVE_CONVO_NPC_FLAG]) }
  const multiNpcSideQuestId = registeredQuestIds().find((questId) => {
    if (questId === state.mainQuestId) return false
    const objective = objectiveForQuest(state, questId)
    return Boolean(objective?.conversationId === convoId && Array.isArray(objective.npcIds))
  })
  const activeNpcId = state.flags[ACTIVE_CONVO_NPC_FLAG]
  const resolvedNpcId = event.npcId || activeNpcId
  if (multiNpcSideQuestId) {
    const objective = objectiveForQuest(state, multiNpcSideQuestId)
    if (
      !activeNpcId
      || event.npcId !== activeNpcId
      || !objective.npcIds.includes(activeNpcId)
      || !convo.speakerIds?.includes(activeNpcId)
    ) return state
  }
  // Required authored choices cannot be bypassed by Skip, Escape, or a
  // malformed direct DIALOGUE_END event. Keep the exact dialogue state active
  // until one valid choice from every required group has been accepted.
  if (!conversationRequiredChoicesMet(state, convo)) return state
  // Apply the conversation's deterministic effects — the union of all node
  // effects plus any top-level effects — so SKIPPING and VIEWING land on the
  // exact same end-state (blueprint requirement). Only the once-guard on each
  // effect kind prevents duplicated rewards across replays.
  const completedFlag = `conversation:completed:${convoId}`
  let next = state.flags[completedFlag]
    ? state
    : setFlag(applyConversationEffects(state, collectConversationEffects(convo)), completedFlag, true)
  // Dialogue done → restore gameplay.
  next = { ...next, status: 'playing', flags: dropFlags(next.flags, [ACTIVE_CONVO_FLAG, ACTIVE_CONVO_NPC_FLAG]) }
  // A completed conversation may satisfy a main-quest talk objective.
  const mainTalk = currentObjective(next)
  if (mainTalk?.kind === 'talk' && mainTalk.conversationId === convoId && (!mainTalk.npcId || mainTalk.npcId === resolvedNpcId)) {
    next = advanceMain(next)
  }
  // ...or an optional-quest talk objective.
  const side = registeredQuestIds().find((id) => {
    if (id === next.mainQuestId) return false
    const q = next.quests[id]
    const def = questDefById(id)
    if (!q || !def || q.state !== 'active') return false
    const obj = def.objectives[q.objectiveIndex]
    return Boolean(obj && obj.kind === 'talk' && obj.conversationId === convoId &&
      (!obj.npcId || obj.npcId === resolvedNpcId) &&
      (!obj.npcIds || (event.npcId && obj.npcIds.includes(event.npcId))))
  })
  if (side) {
    const objective = objectiveForQuest(next, side)
    next = objective.npcIds && event.npcId
      ? recordObjectiveEntity(next, side, { ...objective, entityIds: objective.npcIds }, event.npcId)
      : advanceSide(next, side)
  }

  // The exit conversation resolves Act I: once it completes, the main quest is
  // finished (advanceMain above moved it to 'completed') and Kallias stands at
  // the post-mission overlook with the Act-II boundary raised. Only the exit
  // conversation triggers this — the intro conversation never does.
  if (convoId === 'act1-thessa-exit') {
    const post = spawnById('beacon-overlook', 'post-mission')
    const postMap = mapById('beacon-overlook')
    if (post && postMap) {
      next = {
        ...next,
        status: 'ending',
        world: {
          regionId: postMap.region,
          mapId: 'beacon-overlook',
          spawnId: post.id,
          position: { x: post.x, y: post.y },
          facing: post.facing || 0,
        },
      }
    }
  }
  return next
}

// Acknowledge the Act-II boundary card → back to controllable play at the
// post-mission overlook. Idempotent: only a state actually in 'ending' moves.
function ackEnding(state) {
  if (state.status !== 'ending') return state
  return { ...state, status: 'playing' }
}

function dropFlag(flags, id) {
  const copy = { ...flags }
  delete copy[id]
  return copy
}

function dropFlags(flags, ids) {
  const copy = { ...flags }
  for (const id of ids) delete copy[id]
  return copy
}

function interact(state, event) {
  if (state.status !== 'playing') return state
  const map = mapById(state.world.mapId)
  const ent = map && map.entities.find((e) => e.id === event.entityId)

  // Pelagos' tide is deterministic and player-driven. Only authored wells
  // may cycle it; dialogue/combat cannot reach this branch, and the string
  // flag survives schema-v1 save normalization unchanged.
  if (ent?.kind === 'tide-well' && ACT2_TIDE_RULES.wells.includes(ent.id)) {
    const current = currentTideStateId(state)
    const index = ACT2_TIDE_ORDER.indexOf(current)
    const next = ACT2_TIDE_ORDER[(index + 1) % ACT2_TIDE_ORDER.length]
    return setFlag(state, ACT2_TIDE_FLAG, next)
  }

  if (ent?.kind === 'season-altar' && (ent.seasonId === 'winter' || ent.seasonId === 'harvest')) {
    state = setFlag(state, 'act3:season-state', ent.seasonId)
  }

  if (ent?.kind === 'pressure-valve') {
    const current = state.flags['act4:pressure-state']
    const index = ACT4_PRESSURE_RULES.states.indexOf(current)
    const next = ACT4_PRESSURE_RULES.states[(index + 1 + ACT4_PRESSURE_RULES.states.length) % ACT4_PRESSURE_RULES.states.length]
    state = setFlag(state, 'act4:pressure-state', next)
  }

  if (ent?.lightStateId && ACT5_LIGHT_POLARITY_RULES.stateIds.includes(ent.lightStateId)) {
    state = setFlag(state, ACT5_LIGHT_FLAG, ent.lightStateId)
  }

  if (ent?.requiredFlagId && !normalizedProgressFlags(state)[ent.requiredFlagId]) return state

  // Shrine interaction opens patron selection (UI shows the picker). The
  // objective completes on the actual patron commitment (CHOOSE_PATRON).
  if (ent?.kind === 'shrine') {
    return { ...state, flags: { ...state.flags, 'rpg:shrine-open': true } }
  }

  // Optional tablet interaction drives the side quest, never the main quest.
  if (ent?.sideQuest) {
    const sideId = ent.sideQuest
    const q = state.quests[sideId]
    const def = questDefById(sideId)
    const prefixed = `${state.world.mapId}:${event.entityId}`
    const matchesObj = (obj) => obj && obj.kind === 'interact' &&
      (obj.entityId === event.entityId || obj.entityId === prefixed)
    if (def && !q) {
      // Auto-accept the side quest on first interaction.
      let next = { ...state, quests: { ...state.quests, [sideId]: { ...freshQuest(sideId), state: 'active' } } }
      const qq = next.quests[sideId]
      if (matchesObj(def.objectives[qq.objectiveIndex])) {
        next = advanceSide(next, sideId)
      }
      return next
    }
    if (q && (q.state === 'available' || q.state === 'active')) {
      if (matchesObj(def.objectives[q.objectiveIndex])) {
        return advanceSide(state, sideId)
      }
    }
    return state
  }

  // Generic first-only informational interaction (e.g. the treaty-stone).
  if (ent?.firstOnly) {
    return setFlag(state, `seen:${event.entityId}`, true)
  }

  // Geometry-free later-act pockets still have authored landmark IDs. Only an
  // exact current objective match can advance, so arbitrary events are inert.
  const questId = matchingActiveQuest(state, (objective) =>
    ['interact', 'multi-interact', 'free-witnesses', 'match'].includes(objective.kind) &&
    matchEntityObjective(objective, event.entityId))
  if (questId) {
    const objective = objectiveForQuest(state, questId)
    // Witnesses are physically present before the cave is safe, but cannot be
    // released until their authored encounter has actually been cleared.
    if (objective.kind === 'free-witnesses' && objective.encounterId && !isEncounterCleared(state, objective.encounterId)) {
      return state
    }
    return recordObjectiveEntity(state, questId, objective, event.entityId)
  }
  return state
}

function choose(state, event) {
  if (state.status === 'in-dialogue') return chooseConversation(state, event)
  return chooseObjective(state, event)
}

function chooseConversation(state, event) {
  const conversationId = state.flags[ACTIVE_CONVO_FLAG]
  const convo = conversationById(conversationId)
  const choiceId = event.choiceId || event.id
  if (!convo || !choiceId) return state
  const group = requiredConversationChoiceGroups(convo)
    .find((choices) => choices.some((candidate) => candidate.id === choiceId))
  const choice = group?.find((candidate) => candidate.id === choiceId)
  if (!choice || !prerequisitesMet(state, choice.when || [])) return state
  // Exactly one accepted choice per authored node. Repeats and attempts to
  // select a sibling choice after acceptance are strict no-ops.
  if (group.some((candidate) => state.flags[conversationChoiceFlag(conversationId, candidate.id)])) return state
  const flagId = conversationChoiceFlag(conversationId, choiceId)
  if (state.flags[flagId]) return state
  return setFlag(applyConversationEffects(state, choice.effects || []), flagId, true)
}

function chooseObjective(state, event) {
  if (state.status !== 'playing') return state
  const choiceId = event.choiceId || event.id
  const questId = matchingActiveQuest(state, (objective) =>
    objective.kind === 'choose' && Array.isArray(objective.choiceIds) && objective.choiceIds.includes(choiceId))
  if (!questId) return state
  const objective = objectiveForQuest(state, questId)
  if (objective.eligibility === 'ending-evidence-thresholds' && !choiceIsAvailable(state, choiceId)) return state
  const next = setFlag(state, `choice:${objective.id}`, choiceId)
  return advanceQuest(next, questId, { choiceId })
}

const RESTORATION_FORMULATIONS = Object.freeze([
  ...ACT2_RESTORATION_FORMULATIONS,
  ...ACT3_RESTORATION_FORMULATIONS,
  ...ACT4_RESTORATION_FORMULATIONS,
])

export function endingEvidenceScores(state) {
  const chosen = new Set(Object.entries(state?.flags || {})
    .filter(([key, value]) => key.startsWith('choice:') && typeof value === 'string')
    .map(([, value]) => value))
  const scores = { authority: 0, autonomy: 0, reciprocity: 0, plurality: 0 }
  for (const formulation of RESTORATION_FORMULATIONS) {
    if (!chosen.has(formulation.id)) continue
    for (const [dimension, weight] of Object.entries(formulation.evidenceWeight || {})) {
      scores[dimension] = (scores[dimension] || 0) + Number(weight || 0)
    }
  }
  return scores
}

export function choiceIsAvailable(state, choiceId) {
  const ending = ACT5_ENDING_VARIANTS.find((candidate) => candidate.id === choiceId)
  if (!ending) return true
  if (ending.fallback) return true
  const scores = endingEvidenceScores(state)
  if (ending.threshold.authority) return scores.authority >= ending.threshold.authority
  if (ending.threshold.autonomy) return scores.autonomy >= ending.threshold.autonomy
  if (ending.threshold.reciprocityPlusPlurality) {
    return scores.reciprocity + scores.plurality >= ending.threshold.reciprocityPlusPlurality
  }
  return false
}

function choosePatron(state, event) {
  // Patron switching is allowed only at a shrine and never during combat.
  if (state.status !== 'playing') return state
  if (!state.flags['rpg:shrine-open']) return state
  if (!TIER1_PATRON_IDS.includes(event.godId)) return state
  const map = mapById(state.world.mapId)
  const hasShrine = Boolean(map && map.entities.some((e) => e.kind === 'shrine'))
  if (!hasShrine) return state

  let next = {
    ...state,
    flags: { ...state.flags, 'rpg:shrine-open': false },
    protagonist: {
      ...state.protagonist,
      activePatronId: event.godId,
      unlockedPatronIds: state.protagonist.unlockedPatronIds.includes(event.godId)
        ? state.protagonist.unlockedPatronIds
        : [...state.protagonist.unlockedPatronIds, event.godId],
    },
    progression: {
      ...state.progression,
      shrineIds: state.progression.shrineIds.includes(state.world.mapId)
        ? state.progression.shrineIds
        : [...state.progression.shrineIds, state.world.mapId],
    },
  }
  // Completes an authored shrine interaction objective if it is current.
  const objective = currentObjective(next)
  if (objective?.kind === 'interact' && String(objective.entityId || '').split(':').at(-1) === 'shrine') {
    next = advanceMain(next)
  }
  return next
}

function traverse(state, event) {
  if (state.status !== 'playing') return state
  const map = mapById(state.world.mapId)
  const exit = map && map.exits.find((e) => e.id === event.viaGate || e.toMapId === event.toMapId)
  if (!exit) return state
  // The selected authored exit is the authority. A caller cannot pair a valid
  // gate ID with an unrelated destination to teleport across the registry.
  if (event.toMapId && event.toMapId !== exit.toMapId) return state
  if (exit.kind === 'combat') return state // combat exits go through ENTER_ENCOUNTER
  if (exit.gate?.length && !prerequisitesMet(state, exit.gate)) return state
  if (exit.planId && state.flags['choice:choose-march-plan'] !== exit.planId) return state
  const dest = mapById(exit.toMapId)
  if (!dest) return state
  // Validate the named spawn (never silently accept an arbitrary spawn id).
  const spawn = spawnById(exit.toMapId, event.spawnId || exit.spawnId)
  if (!spawn) return state
  let next = {
    ...state,
    world: {
      regionId: dest.region,
      mapId: dest.id,
      spawnId: spawn.id,
      position: { x: spawn.x, y: spawn.y },
      facing: spawn.facing || 0,
    },
  }
  next = restoreSpawnArrivalState(next, spawn)
  // Arriving on a map may satisfy a main or optional reach objective.
  return reach(next, { mapId: next.world.mapId, markerId: next.world.spawnId })
}

function enterEncounter(state, event) {
  if (state.status !== 'playing') return state
  const enc = encounterById(event.encounterId)
  if (!enc) return state
  if (!state.protagonist.activePatronId) return state
  if (isEncounterCleared(state, enc.id)) return state // non-repeatable
  // Gate against the owning quest's current authored objective. Some later
  // objectives pair a fight with follow-up interactions (free-witnesses), so
  // encounterId—not display text or objective kind—is the stable contract.
  const ownerQuestId = rpgEncounterOwnerQuestId(enc.id)
  const ownerObjective = ownerQuestId && objectiveForQuest(state, ownerQuestId)
  const ownerDef = ownerQuestId && questDefById(ownerQuestId)
  const isDirectObjective = ownerObjective?.encounterId === enc.id
  // Later regions also author non-boss route encounters between objectives.
  // Reaching their activation pocket is the gate; they set completion flags
  // but never advance an unrelated objective.
  const isLaterRouteEncounter = Boolean(
    ownerObjective && ownerDef?.act > 1 &&
    !ownerDef.objectives.some((objective) => objective.encounterId === enc.id) &&
    !String(enc.id).startsWith('boss-'),
  )
  if (!isDirectObjective && !isLaterRouteEncounter) return state
  // Must be entering from the encounter's authored activation map (the gate).
  if (state.world.mapId !== enc.activationMapId) return state
  const seed = seedForEncounter(enc.id)
  return {
    ...state,
    status: 'in-combat',
    combatSnapshot: {
      encounterId: enc.id,
      mapId: enc.returnMapId || enc.mapId,
      campaignLevelId: enc.campaignLevelId,
      seed,
      checkpoint: state,
    },
  }
}

function combatWon(state, event) {
  if (state.status !== 'in-combat') return state
  const snap = state.combatSnapshot
  if (!snap) return state
  if (event.encounterId && event.encounterId !== snap.encounterId) return state
  const enc = encounterById(snap.encounterId)
  if (!enc) return state

  // Return to the story world at the encounter's map (the return location),
  // clearing the combat session.
  const returnMapId = enc.returnMapId || enc.mapId
  const returnMap = mapById(returnMapId)
  const returnSpawn = spawnById(returnMapId, enc.returnSpawnId || returnMap?.spawn?.id)
  let returned = {
    ...state,
    status: 'playing',
    combatSnapshot: null,
    ...(returnSpawn ? {
      world: {
        regionId: returnMap.region,
        mapId: returnMapId,
        spawnId: returnSpawn.id,
        position: { x: returnSpawn.x, y: returnSpawn.y },
        facing: returnSpawn.facing || 0,
      },
    } : {}),
  }
  if (returnSpawn) returned = restoreSpawnArrivalState(returned, returnSpawn)

  // Exactly-once guard: if the completion flag is already set (a repeated or
  // replayed event), we must NOT re-award objective progress or rewards.
  if (state.flags[enc.completionFlag]) {
    return returned
  }
  let next = setFlag(returned, enc.completionFlag, true)
  // Advance the owning quest's clear-encounter objective exactly once.
  const owner = rpgEncounterOwnerQuestId(enc.id)
  const objective = owner && objectiveForQuest(next, owner)
  if (objective?.kind === 'clear-encounter' && objective.encounterId === enc.id) {
    next = advanceQuest(next, owner)
  }
  const ownerDef = owner && questDefById(owner)
  const act = Math.max(1, Number(ownerDef?.act) || 1)
  next = awardSkillXpBundle(next, [
    { skillId: 'spearcraft', amount: 95 * act },
    { skillId: 'might', amount: 70 * act },
    { skillId: 'guard', amount: 55 * act },
    { skillId: 'vitality', amount: 45 * act },
    { skillId: 'stormcalling', amount: 80 * act },
  ])
  return next
}

function combatFailed(state, event) {
  if (state.status !== 'in-combat') return state
  const snap = state.combatSnapshot
  if (!snap) return state
  if (event.encounterId && event.encounterId !== snap.encounterId) return state
  // Restore the pre-encounter checkpoint. The seed is deterministic per
  // encounter (seedForEncounter), so a retry replays the identical fight.
  // savedAt is preserved from the checkpoint (stamped at the persistence
  // boundary) — no clock reads inside the reducer.
  const checkpoint = snap.checkpoint
  return {
    ...checkpoint,
    status: 'playing',
    combatSnapshot: null,
  }
}

// ─── Derived read helpers (used by the UI, not progression) ───
export function currentObjectiveLabel(state) {
  const obj = currentObjective(state)
  if (!obj) return ''
  switch (obj.kind) {
    case 'reach': {
      const map = mapById(obj.mapId)
      const exit = map && map.exits.find((e) => e.markerId === obj.markerId)
      return exit ? exit.label : (obj.text || `Reach ${map ? map.name : obj.mapId}`)
    }
    case 'talk': {
      const map = mapById(state.world.mapId)
      const npc = map && map.entities.find((e) => e.id === obj.npcId)
      return npc ? `Talk to ${npc.name}` : (obj.text || 'Find your guide')
    }
    case 'interact': {
      const map = mapById(state.world.mapId)
      const authoredId = obj.entityId || obj.entityIds?.[0]
      const entityId = authoredId && authoredId.replace(`${state.world.mapId}:`, '')
      const ent = entityId && map && map.entities.find((e) => e.id === entityId)
      return ent ? ent.name : (obj.text || 'Choose a patron')
    }
    case 'clear-encounter': {
      const enc = encounterById(obj.encounterId)
      return enc ? `Clear the ${enc.title}` : (obj.text || 'Face the court')
    }
    default: return obj.text || ''
  }
}

export function currentTideStateId(state) {
  const candidate = state?.flags?.[ACT2_TIDE_FLAG]
  return typeof candidate === 'string' && ACT2_TIDE_STATES[candidate]
    ? candidate
    : ACT2_TIDE_ORDER[0]
}

export function currentTideState(state) {
  return ACT2_TIDE_STATES[currentTideStateId(state)]
}

export function isAtShrine(state) {
  const map = mapById(state.world.mapId)
  return Boolean(state.status === 'playing' && map && map.entities.some((e) => e.kind === 'shrine'))
}
