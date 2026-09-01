import { describe, expect, it } from 'vitest'
import {
  REGISTERED_ENCOUNTERS,
  REGISTERED_MAPS,
  REGISTERED_QUESTS,
  normalizedProgressFlags,
  prerequisitesMet,
  rpgEncounterById,
  rpgMapById,
  rpgQuestDefById,
  rpgSpawnById,
} from '../src/rpg/registry.js'
import { applyEvent, createInitialState, currentObjective } from '../src/rpg/state.js'
import { normalizeState } from '../src/rpg/save.js'
import { arenaProgress, startEncounter, stepCombat } from '../src/rpg/combatAdapter.js'

function act1BoundaryState() {
  const state = createInitialState()
  return {
    ...state,
    quests: {
      ...state.quests,
      'mq-act1-ash-at-dawn': {
        ...state.quests['mq-act1-ash-at-dawn'],
        state: 'completed',
        objectiveIndex: rpgQuestDefById('mq-act1-ash-at-dawn').objectives.length,
      },
    },
    inventory: { ...state.inventory, epithetFragments: ['far-sighted'] },
  }
}

function act2State(objectiveIndex = 0, mapId = 'pelagos-harbor', spawnId = 'keeper-jetty') {
  const begun = applyEvent(act1BoundaryState(), { type: 'BEGIN_ACT', act: 2 })
  return {
    ...begun,
    world: {
      regionId: rpgMapById(mapId).region,
      mapId,
      spawnId,
      position: { x: 0, y: 0 },
      facing: 0,
    },
    quests: {
      ...begun.quests,
      'mq-act2-salt-covenant': {
        ...begun.quests['mq-act2-salt-covenant'],
        objectiveIndex,
      },
    },
  }
}

describe('canonical multi-act registry', () => {
  it('registers Acts I-V without replacing the Act I objects', () => {
    expect(Object.keys(REGISTERED_MAPS)).toHaveLength(23)
    expect(Object.keys(REGISTERED_QUESTS)).toHaveLength(10)
    expect(Object.keys(REGISTERED_ENCOUNTERS).length).toBeGreaterThan(10)
    expect(rpgMapById('beacon-overlook')?.bounds).toEqual({ w: 900, h: 470 })
    expect(rpgMapById('pelagos-harbor')?.region).toBe('pelagos-isles')
    expect(rpgQuestDefById('mq-act4-false-constellation')?.act).toBe(4)
    expect(rpgQuestDefById('mq-act5-last-name')?.act).toBe(5)
    expect(rpgMapById('silent-loom')?.region).toBe('night-stair')
    expect(rpgEncounterById('boss-act3-winter-mother-echo')?.campaignLevelId).toBeNull()
  })

  it('strictly validates named spawns while supplying accepted Act II runtime coordinates', () => {
    expect(rpgSpawnById('pelagos-harbor', 'keeper-jetty')).toMatchObject({ id: 'keeper-jetty', x: 150, y: 382 })
    expect(rpgSpawnById('pelagos-harbor', 'invented')).toBeNull()
  })

  it('derives cross-act prerequisite aliases from accepted predecessor state', () => {
    const act1 = act1BoundaryState()
    const flags = normalizedProgressFlags(act1)
    expect(flags['act1-far-sighted-restored']).toBe(true)
    expect(prerequisitesMet(act1, rpgQuestDefById('mq-act2-salt-covenant').prerequisites)).toBe(true)

    const act2 = {
      ...act1,
      quests: { ...act1.quests, 'mq-act2-salt-covenant': { state: 'completed' } },
    }
    expect(normalizedProgressFlags(act2)['act2-salt-covenant-ratified']).toBe(true)
  })
})

describe('generic registered progression', () => {
  it('begins Act II through its authored entry without changing the initial Act I path', () => {
    const initial = createInitialState()
    expect(applyEvent(initial, { type: 'BEGIN_ACT', act: 2 })).toBe(initial)

    const begun = applyEvent(act1BoundaryState(), { type: 'BEGIN_ACT', act: 2 })
    expect(begun.mainQuestId).toBe('mq-act2-salt-covenant')
    expect(begun.world).toMatchObject({ regionId: 'pelagos-isles', mapId: 'pelagos-harbor', spawnId: 'keeper-jetty' })
    expect(currentObjective(begun)?.id).toBe('reach-pelagos-keeper')
    expect(begun.flags['act2-pelagos-arrived']).toBe(true)
    expect(begun.flags['act2:tide-state']).toBe('ebb')
  })

  it('advances scaffold talk, counted interact, and choice objectives from exact authored IDs', () => {
    let state = act2State()
    state = applyEvent(state, { type: 'TALK', npcId: 'melite', conversationId: 'act2-melite-oath-post' })
    expect(state.status).toBe('in-dialogue')
    state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'act2-melite-oath-post' })
    expect(currentObjective(state)?.id).toBe('witness-first-surge')

    state = act2State(3, 'nereid-caves', 'threshold')
    for (const entityId of ['pressure-shell-1', 'pressure-shell-2', 'pressure-shell-3']) {
      state = applyEvent(state, { type: 'INTERACT', entityId })
    }
    expect(currentObjective(state)?.id).toBe('secure-storm-anchorage')
    expect(state.quests[state.mainQuestId].objectiveCounts['separate-boundary-names']).toBe(3)

    state = act2State(7)
    state = applyEvent(state, { type: 'CHOOSE', choiceId: 'shared-crossing' })
    expect(state.quests['mq-act2-salt-covenant'].state).toBe('completed')
    expect(state.flags['choice:ratify-salt-covenant']).toBe('shared-crossing')
    expect(state.flags['region:fields-of-kore:unlocked']).toBe(true)
    expect(state.world.spawnId).toBe('post-covenant')
  })

  it('rejects repeated counted interactions', () => {
    let state = act2State(3, 'nereid-caves', 'threshold')
    state = applyEvent(state, { type: 'INTERACT', entityId: 'pressure-shell-1' })
    state = applyEvent(state, { type: 'INTERACT', entityId: 'pressure-shell-1' })
    expect(state.quests[state.mainQuestId].objectiveCounts['separate-boundary-names']).toBe(1)
    expect(currentObjective(state)?.id).toBe('separate-boundary-names')
  })

  it('allows authored later-act route encounters without advancing an unrelated objective', () => {
    let state = act2State(1, 'breakwater-road', 'from-harbor')
    state = { ...state, protagonist: { ...state.protagonist, activePatronId: 'apollo' } }
    const entered = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act2-breakwater' })
    expect(entered.status).toBe('in-combat')
    expect(entered.combatSnapshot.encounterId).toBe('enc-act2-breakwater')
    expect(currentObjective(entered)?.id).toBe('witness-first-surge')
  })

  it('rejects a valid gate paired with a spoofed cross-region destination', () => {
    const initial = createInitialState()
    const spoofed = applyEvent(initial, {
      type: 'TRAVERSE',
      viaGate: 'to-olive-road',
      toMapId: 'silent-loom',
      spawnId: 'from-approach',
    })
    expect(spoofed).toBe(initial)
  })

  it('persists the authored Pelagos position and explicit tide state through normalization', () => {
    let state = applyEvent({ ...act1BoundaryState(), status: 'ending' }, { type: 'BEGIN_ACT', act: 2 })
    state = {
      ...state,
      world: {
        regionId: 'pelagos-isles', mapId: 'breakwater-road', spawnId: 'from-harbor',
        position: { x: 286, y: 350 }, facing: 0,
      },
    }
    state = applyEvent(state, { type: 'INTERACT', entityId: 'tide-well-harbor' })
    expect(state.flags['act2:tide-state']).toBe('crossing')
    const loaded = normalizeState(state)
    expect(loaded.world).toMatchObject({ mapId: 'breakwater-road', spawnId: 'from-harbor' })
    expect(loaded.flags['act2:tide-state']).toBe('crossing')
  })

  it('applies conversation currency once even when the same dialogue is replayed', () => {
    let state = createInitialState()
    state = {
      ...state,
      world: { regionId: 'asterion-reach', mapId: 'olive-road', spawnId: 'from-beacon', position: { x: 760, y: 150 }, facing: 0 },
      quests: {
        ...state.quests,
        'sq-lost-witness': { state: 'active', objectiveIndex: 1, objectiveCounts: {} },
      },
    }
    state = applyEvent(state, { type: 'TALK', npcId: 'keeper', conversationId: 'sq-lost-witness-return' })
    state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'sq-lost-witness-return' })
    const firstCurrency = state.inventory.currency
    state = applyEvent(state, { type: 'TALK', npcId: 'keeper', conversationId: 'sq-lost-witness-return' })
    state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'sq-lost-witness-return' })
    expect(firstCurrency).toBe(50)
    expect(state.inventory.currency).toBe(firstCurrency)
  })
})

describe('later-act persistence and authored encounters', () => {
  it('normalizes a valid later-act map, spawn, and quest instead of falling back to Act I', () => {
    const raw = act2State(3, 'nereid-caves', 'threshold')
    const normalized = normalizeState(raw)
    expect(normalized.world).toMatchObject({ regionId: 'pelagos-isles', mapId: 'nereid-caves', spawnId: 'threshold' })
    expect(normalized.mainQuestId).toBe('mq-act2-salt-covenant')
    expect(normalized.quests['mq-act2-salt-covenant'].objectiveIndex).toBe(3)
  })

  it('constructs deterministic combat from authored order when campaignLevelId is null', () => {
    const rpg = {
      ...act2State(4, 'storm-anchorage', 'from-caves'),
      protagonist: { ...act2State().protagonist, activePatronId: 'apollo' },
    }
    let a = startEncounter(rpg, 'enc-act2-anchorage')
    let b = startEncounter(rpg, 'enc-act2-anchorage')
    expect(a).not.toBeNull()
    expect(a.campaignLevelId).toBeNull()
    expect(a.authoredOrder).toEqual(['chronos', 'minotaur', 'hydra', 'minotaur'])
    expect(arenaProgress(a)).toEqual({ defeated: 0, total: 4 })

    for (let i = 0; i < 20; i += 1) {
      a = stepCombat(a)
      b = stepCombat(b)
    }
    expect(a.arena.threats).toHaveLength(1)
    expect(a.arena.threats[0].monsterType).toBe('chronos')
    expect(a.arena.threats[0]).toMatchObject({ x: b.arena.threats[0].x, y: b.arena.threats[0].y })
  })
})
