import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

function atEntity(state, mapId, entityId, offset = 0) {
  const map = rpgMapById(mapId)
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  return {
    ...state,
    world: {
      ...state.world,
      regionId: map.region,
      mapId,
      spawnId: map.spawn.id,
      position: { x: entity.x + offset, y: entity.y },
    },
  }
}

function withItems(state, items) {
  return {
    ...state,
    inventory: items.reduce((inventory, [itemId, quantity]) =>
      addInventoryItem(inventory, itemId, quantity, ALL_ITEM_DEFS).inventory, state.inventory),
  }
}

describe('physical world-action authorization', () => {
  const cases = [
    ['GATHER', 'beacon-overlook', 'wild-thyme', []],
    ['RESTORE_LAND', 'beacon-overlook', 'steward-fallow-field', [['compost', 2]]],
    ['PICK_LOCK', 'olive-road', 'olive-road-locked-chest', [['lockpick', 1]]],
    ['CALM_CREATURE', 'beacon-overlook', 'beacon-sacred-hind', [['honeyed-figs', 1]]],
  ]

  for (const [type, mapId, entityId, items] of cases) {
    it(`${type} rejects a valid target remotely without mutating its cost or reward`, () => {
      const remote = atEntity(withItems(createInitialState(), items), mapId, entityId, 120)
      expect(applyEvent(remote, { type, entityId })).toBe(remote)
    })

    it(`${type} accepts the same concrete target while physically nearby`, () => {
      const near = atEntity(withItems(createInitialState(), items), mapId, entityId, 0)
      expect(applyEvent(near, { type, entityId })).not.toBe(near)
    })
  }

  it('rejects a remote world controller but permits its nearby authored interaction', () => {
    const remote = atEntity(createInitialState(), 'bronze-foundry', 'pressure-valve-1', 120)
    expect(applyEvent(remote, { type: 'INTERACT', entityId: 'pressure-valve-1' })).toBe(remote)

    const near = atEntity(createInitialState(), 'bronze-foundry', 'pressure-valve-1', 0)
    const interacted = applyEvent(near, { type: 'INTERACT', entityId: 'pressure-valve-1' })
    expect(interacted.flags['act4:pressure-state']).not.toBe(near.flags['act4:pressure-state'])
  })

  it('rejects a remote exit and permits its nearby authored traversal', () => {
    const remote = atEntity(createInitialState(), 'beacon-overlook', 'shrine', 0)
    expect(applyEvent(remote, {
      type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon',
    })).toBe(remote)

    const map = rpgMapById('beacon-overlook')
    const exit = map.exits.find((candidate) => candidate.id === 'to-olive-road')
    const near = moveAlongWorldPath(createInitialState(), exit)
    const traversed = applyEvent(near, {
      type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon',
    })
    expect(traversed.world.mapId).toBe('olive-road')
  })

  it('rejects an alternate destination spawn even at the real exit', () => {
    const origin = rpgMapById('olive-road')
    const exit = origin.exits.find((candidate) => candidate.id === 'to-beacon')
    const alternateSpawnId = Object.keys(rpgMapById('beacon-overlook').spawns)
      .find((spawnId) => spawnId !== exit.spawnId)
    const base = createInitialState()
    const state = { ...base, world: { ...base.world, mapId: origin.id, regionId: origin.region, position: { x: exit.x, y: exit.y } } }
    expect(applyEvent(state, {
      type: 'TRAVERSE', viaGate: exit.id, toMapId: exit.toMapId, spawnId: alternateSpawnId,
    })).toBe(state)
  })

  it('rejects remote marker reaches and world-table choices, while accepting their exact nearby entity', () => {
    const remoteEcho = {
      ...atEntity(createInitialState(), 'nereid-caves', 'echo-cavern', 120),
      flags: { ...createInitialState().flags, 'act2:tide-state': 'crossing' },
      quests: { 'sq-act2-unmoored-heart': { state: 'active', objectiveIndex: 0, objectiveCounts: {} } },
    }
    expect(applyEvent(remoteEcho, { type: 'REACH', mapId: 'nereid-caves', markerId: 'echo-cavern' })).toBe(remoteEcho)
    const nearEcho = atEntity(remoteEcho, 'nereid-caves', 'echo-cavern')
    expect(applyEvent(nearEcho, { type: 'REACH', mapId: 'nereid-caves', markerId: 'echo-cavern' }))
      .not.toBe(nearEcho)

    const remoteTable = {
      ...atEntity(createInitialState(), 'asphodel-gate', 'return-covenant-table', 120),
      mainQuestId: 'mq-act3-withered-year',
      quests: { 'mq-act3-withered-year': { state: 'active', objectiveIndex: 5, objectiveCounts: {} } },
    }
    expect(applyEvent(remoteTable, { type: 'CHOOSE', choiceId: 'witnessed-cycle', entityId: 'return-covenant-table' })).toBe(remoteTable)
    const nearTable = atEntity(remoteTable, 'asphodel-gate', 'return-covenant-table')
    expect(applyEvent(nearTable, { type: 'CHOOSE', choiceId: 'witnessed-cycle', entityId: 'return-covenant-table' }))
      .not.toBe(nearTable)
    expect(applyEvent(nearTable, { type: 'CHOOSE', choiceId: 'witnessed-cycle' })).toBe(nearTable)
  })

  it('binds a first-patron selection to the exact nearby shrine and clears it on movement or close', () => {
    const map = rpgMapById('beacon-overlook')
    const shrine = map.entities.find((entity) => entity.id === 'shrine')
    const thessa = map.entities.find((entity) => entity.id === 'thessa')
    let state = createInitialState()
    const thessaPath = findWorldPath(map, state.world.position, thessa)
    expect(thessaPath.length).toBeGreaterThan(0)
    state = { ...state, world: { ...state.world, position: thessaPath.at(-1) } }
    state = applyEvent(state, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    state = applyEvent(state, { type: 'DIALOGUE_END', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    state = { ...state, world: { ...state.world, position: { x: shrine.x, y: shrine.y } } }
    state = applyEvent(state, { type: 'INTERACT', entityId: shrine.id })
    expect(state.flags['rpg:active-shrine-entity']).toBe(shrine.id)

    const moved = moveAlongWorldPath(state, { x: shrine.x + 120, y: shrine.y })
    expect(applyEvent(moved, { type: 'CHOOSE_PATRON', godId: 'apollo' })).toBe(moved)
    const reopened = applyEvent(state, { type: 'CLOSE_SHRINE' })
    expect(applyEvent(reopened, { type: 'CHOOSE_PATRON', godId: 'apollo' })).toBe(reopened)
  })

  it('keeps the repaired resource routes reachable in every authored world state', () => {
    const routes = [
      ['pelagos-harbor', 'from-chartwright', 'steward-salt-garden', ['ebb', 'crossing', 'surge']],
      ['kore-sanctuary', 'from-orchard', 'kore-sanctuary-moly', ['winter', 'harvest']],
      ['asphodel-gate', 'from-sanctuary', 'asphodel-gate-bloom', ['winter', 'harvest']],
      ['wheat-village', 'granary', 'wheat-village-sage', ['winter', 'harvest']],
      ['wheat-village', 'granary', 'wheat-village-frost-terrace', ['winter', 'harvest']],
      ['name-press', 'from-foundry', 'name-press-iron-vein', ['safe', 'venting', 'critical']],
      ['slag-road', 'from-vault', 'slag-road-cinder-plot', ['safe', 'venting', 'critical']],
      ['nyx-foothold', 'keeper-camp', 'nyx-foothold-shade-plot', ['shadow', 'moon', 'sun']],
      ['accord-overlook', 'from-loom', 'accord-overlook-ambrosial-ash', ['shadow', 'moon', 'sun']],
    ]
    for (const [mapId, spawnId, entityId, routeStateIds] of routes) {
      const map = rpgMapById(mapId)
      const target = map.entities.find((entity) => entity.id === entityId)
      for (const routeStateId of routeStateIds) {
        const path = findWorldPath(map, map.spawns[spawnId], target, { routeStateId })
        expect(path.length, `${mapId}:${routeStateId}`).toBeGreaterThan(0)
        expect(Math.hypot(path.at(-1).x - target.x, path.at(-1).y - target.y)).toBeLessThan(56)
      }
    }
  })
})
