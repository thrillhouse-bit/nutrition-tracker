import { describe, expect, it } from 'vitest'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { routeStateForMap } from '../src/rpg/routeState.js'
import { WAYFINDING_SURVEY_CONTRACTS } from '../src/rpg/wayfinding.js'
import { xpForLevel } from '../src/rpg/progression.js'
import {
  ACT5_LIGHT_FLAG,
  applyEvent,
  createInitialState,
  planQuestCompletionForDefinition,
} from '../src/rpg/state.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

function syntheticState(rewards, inventory = createInitialState().inventory) {
  const id = 'test-completion'
  const objective = { id: 'finish', kind: 'reach', mapId: 'beacon-overlook', markerId: 'start' }
  return {
    state: {
      ...createInitialState(),
      mainQuestId: id,
      quests: { [id]: { state: 'active', objectiveIndex: 0, objectiveCounts: {} } },
      inventory,
    },
    definition: { id, kind: 'side', act: 1, objectives: [objective], rewards },
    objective,
  }
}

function falseDawnState() {
  const initial = createInitialState()
  const map = rpgMapById('false-sky')
  return {
    ...initial,
    mainQuestId: 'mq-act5-last-name',
    quests: {
      ...initial.quests,
      'mq-act5-last-name': { state: 'active', objectiveIndex: 3, objectiveCounts: {} },
    },
    flags: {
      ...initial.flags,
      [ACT5_LIGHT_FLAG]: 'moon',
      'act5-moon-witnesses-aligned': true,
    },
    world: {
      ...initial.world,
      regionId: map.region,
      mapId: map.id,
      spawnId: 'from-night-stair',
      position: { x: 76, y: 382 },
    },
  }
}

function moveToEntity(state, entityId) {
  const map = rpgMapById(state.world.mapId)
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  const path = findWorldPath(map, state.world.position, entity, {
    routeStateId: routeStateForMap(state, map),
  })
  expect(path.length, `reachable setup ${map.id}:${entityId}`).toBeGreaterThan(0)
  return moveAlongWorldPath(state, path.at(-1))
}

describe('transactional quest completion planner', () => {
  it('rejects a full-inventory item reward before any completion state can be committed', () => {
    const base = createInitialState()
    const fullInventory = {
      ...base.inventory,
      capacity: 28,
      slots: Array.from({ length: 28 }, () => ({ itemId: 'copper-ore', quantity: 1 })),
    }
    const { state, definition, objective } = syntheticState([
      { kind: 'item', itemId: 'tin-ore', quantity: 1 },
      { kind: 'flag', id: 'test-completion-paid', value: true },
    ], fullInventory)
    expect(planQuestCompletionForDefinition(state, definition, objective)).toBeNull()
    expect(state.quests['test-completion'].state).toBe('active')
    expect(state.flags['test-completion-paid']).toBeUndefined()

    const grant = syntheticState([], fullInventory)
    grant.objective.grantsItem = 'tin-ore'
    expect(planQuestCompletionForDefinition(grant.state, grant.definition, grant.objective)).toBeNull()
  })

  it('fails closed for malformed rewards and accepts only registered canonical items, bounded currency, and known skills', () => {
    const badItem = syntheticState([{ kind: 'item', itemId: 'invented-relic', quantity: 1 }])
    const badCurrency = syntheticState([{ kind: 'currency', amount: 0 }])
    const badXp = syntheticState([{ kind: 'xp', skillId: 'invented-skill', amount: 10 }])
    expect(planQuestCompletionForDefinition(badItem.state, badItem.definition, badItem.objective)).toBeNull()
    expect(planQuestCompletionForDefinition(badCurrency.state, badCurrency.definition, badCurrency.objective)).toBeNull()
    expect(planQuestCompletionForDefinition(badXp.state, badXp.definition, badXp.objective)).toBeNull()

    const valid = syntheticState([
      { kind: 'item', itemId: 'tin-ore', quantity: 1 },
      { kind: 'currency', amount: 10 },
      { kind: 'xp', skillId: 'wayfinding', amount: 10 },
    ])
    expect(planQuestCompletionForDefinition(valid.state, valid.definition, valid.objective)).toMatchObject({
      effects: expect.arrayContaining([{ kind: 'item', itemId: 'tin-ore', quantity: 1 }]),
    })
  })

  it('settles a real final talk reward exactly once after all effects preflight', () => {
    const keeper = rpgMapById('olive-road').entities.find((entity) => entity.id === 'keeper')
    const initial = createInitialState({ withSideQuest: true })
    const state = {
      ...initial,
      quests: { ...initial.quests, 'sq-lost-witness': { state: 'active', objectiveIndex: 1, objectiveCounts: {} } },
      world: { ...initial.world, mapId: 'olive-road', position: { x: keeper.x, y: keeper.y } },
    }
    const won = applyEvent(state, { type: 'TALK_COMPLETE', npcId: 'keeper', conversationId: 'sq-lost-witness-return' })
    expect(won.quests['sq-lost-witness']).toMatchObject({ state: 'completed', objectiveIndex: 2 })
    expect(won.inventory.currency).toBe(25)
    expect(won.flags['sq-lost-witness-complete']).toBe(true)
    expect(applyEvent(won, { type: 'TALK_COMPLETE', npcId: 'keeper', conversationId: 'sq-lost-witness-return' })).toEqual(won)
  })

  it('leaves final dialogue and survey events byte-identical when their combined bundles cannot settle', () => {
    const keeper = rpgMapById('olive-road').entities.find((entity) => entity.id === 'keeper')
    const initial = createInitialState({ withSideQuest: true })
    const dialogue = {
      ...initial,
      status: 'in-dialogue',
      quests: { ...initial.quests, 'sq-lost-witness': { state: 'active', objectiveIndex: 1, objectiveCounts: {} } },
      world: { ...initial.world, mapId: 'olive-road', position: { x: keeper.x, y: keeper.y } },
      progression: { ...initial.progression, totalXp: 1_000_000_000 },
      flags: { 'rpg:active-conversation': 'sq-lost-witness-return', 'rpg:active-conversation-npc': 'keeper' },
    }
    expect(applyEvent(dialogue, { type: 'DIALOGUE_END', conversationId: 'sq-lost-witness-return', npcId: 'keeper' })).toBe(dialogue)

    const last = WAYFINDING_SURVEY_CONTRACTS.at(-1)
    const marker = rpgMapById('submerged-signal-shoal').entities.find((entity) => entity.surveyContractId === last.id)
    const charts = WAYFINDING_SURVEY_CONTRACTS.slice(0, -1).map((contract) => contract.discoveryReward.itemId)
    const surveyBase = createInitialState()
    const survey = {
      ...surveyBase,
      world: { ...surveyBase.world, mapId: 'submerged-signal-shoal', position: { x: marker.x, y: marker.y } },
      quests: { ...surveyBase.quests, 'mqy-wayfinding-covenant-routes': { state: 'active', objectiveIndex: 4, objectiveCounts: {} } },
      inventory: { ...surveyBase.inventory, capacity: 28, slots: [...charts.map((itemId) => ({ itemId, quantity: 1 })), ...Array.from({ length: 24 }, () => ({ itemId: 'copper-ore', quantity: 1 }))] },
      progression: { ...surveyBase.progression, skills: { ...surveyBase.progression.skills, wayfinding: { xp: xpForLevel(70) } } },
      wayfinding: { discoveries: Object.fromEntries(WAYFINDING_SURVEY_CONTRACTS.slice(0, -1).map((contract) => [contract.id, { discoveredAtTick: 1 }])), practices: {}, shortcuts: {} },
    }
    expect(applyEvent(survey, { type: 'SURVEY_WAYFINDING', entityId: marker.id })).toBe(survey)
  })

  it('does not change False Dawn polarity or progress for rejected ordered mirrors, but accepts canonical 1→2→3', () => {
    const unchanged = falseDawnState()
    for (const mirrorId of ['sun-mirror-2', 'sun-mirror-3']) {
      const positioned = moveToEntity(unchanged, mirrorId)
      const rejected = applyEvent(positioned, { type: 'INTERACT', entityId: mirrorId })
      expect(rejected).toBe(positioned)
      expect(rejected.flags[ACT5_LIGHT_FLAG]).toBe('moon')
      expect(rejected.quests['mq-act5-last-name'].objectiveCounts['turn-the-false-dawn']).toBeUndefined()
    }

    let canonical = falseDawnState()
    for (const [index, mirrorId] of ['sun-mirror-1', 'sun-mirror-2', 'sun-mirror-3'].entries()) {
      canonical = moveToEntity(canonical, mirrorId)
      canonical = applyEvent(canonical, { type: 'INTERACT', entityId: mirrorId })
      expect(canonical.flags[ACT5_LIGHT_FLAG]).toBe('sun')
      expect(canonical.quests['mq-act5-last-name'].objectiveCounts['turn-the-false-dawn']).toBe(index + 1)
    }
  })
})
