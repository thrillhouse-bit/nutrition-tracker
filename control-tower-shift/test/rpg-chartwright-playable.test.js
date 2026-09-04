import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { normalizeState } from '../src/rpg/save.js'
import { createInitialState, applyEvent } from '../src/rpg/state.js'
import { WAYFINDING_SHORTCUT_DESTINATION_SEAMS, WAYFINDING_SURVEY_CONTRACTS } from '../src/rpg/wayfinding.js'

function atEntity(state, mapId, entityId) {
  const map = rpgMapById(mapId)
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  return {
    ...state,
    world: {
      regionId: map.region,
      mapId,
      spawnId: Object.keys(map.spawns)[0],
      position: { x: entity.x - 20, y: entity.y },
      facing: 0,
    },
  }
}

describe('Act II Chartwright playable reducer slice', () => {
  it('accepts only a nearby concrete quest-giver and rejects forged acceptance', () => {
    const initial = atEntity(createInitialState(), 'chartwright-hall', 'ianthe-chartwright')
    const accepted = applyEvent(initial, {
      type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk',
    })
    expect(accepted.quests['cq-act2-ianthe-open-chart']).toMatchObject({ state: 'active', acceptedAtTick: 0 })
    expect(applyEvent(initial, {
      type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'naukleros-signal-keeper', trigger: 'talk',
    })).toBe(initial)
    const far = { ...initial, world: { ...initial.world, position: { x: 40, y: 40 } } }
    expect(applyEvent(far, {
      type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk',
    })).toBe(far)
  })

  it('awards a physical survey chart atomically and advances matching objectives once', () => {
    const contract = WAYFINDING_SURVEY_CONTRACTS[0]
    let state = atEntity(createInitialState(), 'chartwright-hall', `survey-${contract.id}`)
    state = {
      ...state,
      quests: {
        ...state.quests,
        'cq-act2-ianthe-open-chart': { state: 'active', objectiveIndex: 1, objectiveCounts: {} },
        'mqy-wayfinding-covenant-routes': { state: 'active', objectiveIndex: 0, objectiveCounts: {} },
      },
    }
    const surveyed = applyEvent(state, { type: 'SURVEY_WAYFINDING', entityId: `survey-${contract.id}` })
    expect(surveyed.wayfinding.discoveries[contract.id]).toBeTruthy()
    expect(surveyed.inventory.slots).toEqual(expect.arrayContaining([{ itemId: contract.discoveryReward.itemId, quantity: 1 }]))
    expect(surveyed.quests['cq-act2-ianthe-open-chart'].objectiveCounts['recover-two-public-soundings']).toBe(1)
    expect(surveyed.quests['mqy-wayfinding-covenant-routes'].objectiveIndex).toBe(1)
    expect(applyEvent(surveyed, { type: 'SURVEY_WAYFINDING', entityId: `survey-${contract.id}` })).toBe(surveyed)

    const full = {
      ...state,
      inventory: { ...state.inventory, slots: Array.from({ length: 28 }, () => ({ itemId: 'barley-flatbread', quantity: 1 })) },
    }
    expect(applyEvent(full, { type: 'SURVEY_WAYFINDING', entityId: `survey-${contract.id}` })).toBe(full)
    expect(ALL_ITEM_DEFS[contract.discoveryReward.itemId]).toBeTruthy()
  })

  it('uses the signal buoy as a station before and an exact-once quest interaction after the elite', () => {
    let state = atEntity(createInitialState(), 'submerged-signal-shoal', 'signal-buoy')
    state = {
      ...state,
      quests: {
        ...state.quests,
        'sq-act2-submerged-signal': { state: 'active', objectiveIndex: 2, objectiveCounts: {} },
      },
      flags: { ...state.flags, 'act2-submerged-signal-reef-cleared': true },
    }
    const relit = applyEvent(state, { type: 'INTERACT', entityId: 'signal-buoy' })
    expect(relit.quests['sq-act2-submerged-signal']).toMatchObject({ state: 'completed' })
    expect(relit.flags['act2-submerged-signal-relit']).toBe(true)
    expect(applyEvent(relit, { type: 'INTERACT', entityId: 'signal-buoy' })).toBe(relit)
  })

  it('traverses every unlocked shortcut only from its concrete nearby route post and preserves it through reload', () => {
    const posts = {
      'shortcut:pelagos-chartwright-hall': ['pelagos-harbor', 'wayfinding-post-chartwright-hall'],
      'shortcut:breakwater-tide-shelf': ['breakwater-road', 'wayfinding-post-tide-shelf'],
      'shortcut:nereid-enclave-current': ['nereid-caves', 'wayfinding-post-enclave-current'],
      'shortcut:anchorage-weather-lee': ['storm-anchorage', 'wayfinding-post-weather-lee'],
      'shortcut:archive-return-course': ['archive-barge-deck', 'wayfinding-post-return-course'],
    }
    for (const shortcut of WAYFINDING_SHORTCUT_DESTINATION_SEAMS) {
      const [mapId, entityId] = posts[shortcut.id]
      const contract = WAYFINDING_SURVEY_CONTRACTS.find((candidate) => candidate.shortcut.id === shortcut.id)
      expect(contract, shortcut.id).toBeTruthy()
      const map = rpgMapById(mapId)
      const post = map.entities.find((entity) => entity.id === entityId)
      for (const tideStateId of ['ebb', 'crossing', 'surge']) for (const spawn of Object.values(map.spawns)) {
        const path = findWorldPath(map, spawn, post, { routeStateId: tideStateId })
        expect(path.length, `${mapId}:${tideStateId}:${spawn.id}→${entityId}`).toBeGreaterThan(0)
        expect(Math.hypot(path.at(-1).x - post.x, path.at(-1).y - post.y)).toBeLessThan(56)
      }
      const state = {
        ...atEntity(createInitialState(), mapId, entityId),
        flags: { 'act2:tide-state': 'ebb' },
        wayfinding: {
          discoveries: { [contract.id]: { discoveredAtTick: 0 } },
          practices: {},
          shortcuts: { [shortcut.id]: true },
        },
      }
      const next = applyEvent(state, { type: 'TRAVERSE_WAYFINDING_SHORTCUT', entityId, shortcutId: shortcut.id })
      expect(next.world).toMatchObject({ mapId: shortcut.toMapId, spawnId: shortcut.toSpawnId })
      expect(normalizeState(next).wayfinding.shortcuts[shortcut.id]).toBe(true)
      expect(applyEvent(state, {
        type: 'TRAVERSE_WAYFINDING_SHORTCUT', entityId, shortcutId: shortcut.id, toMapId: 'forged-map',
      })).toBe(state)
    }
  })

  it('rejects locked, remote, and mismatched shortcut requests without mutation', () => {
    const state = atEntity(createInitialState(), 'pelagos-harbor', 'wayfinding-post-chartwright-hall')
    expect(applyEvent(state, {
      type: 'TRAVERSE_WAYFINDING_SHORTCUT', entityId: 'wayfinding-post-chartwright-hall', shortcutId: 'shortcut:pelagos-chartwright-hall',
    })).toBe(state)
    const unlocked = {
      ...state,
      wayfinding: {
        discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 0 } },
        practices: {},
        shortcuts: { 'shortcut:pelagos-chartwright-hall': true },
      },
    }
    const remote = { ...unlocked, world: { ...unlocked.world, position: { x: 40, y: 40 } } }
    expect(applyEvent(remote, {
      type: 'TRAVERSE_WAYFINDING_SHORTCUT', entityId: 'wayfinding-post-chartwright-hall', shortcutId: 'shortcut:pelagos-chartwright-hall',
    })).toBe(remote)
    expect(applyEvent(unlocked, {
      type: 'TRAVERSE_WAYFINDING_SHORTCUT', entityId: 'wayfinding-post-chartwright-hall', shortcutId: 'shortcut:archive-return-course',
    })).toBe(unlocked)
  })

  it('keeps every Storm Anchorage spawn, world entity, and exit reachable in each tide state', () => {
    const map = rpgMapById('storm-anchorage')
    for (const tideStateId of ['ebb', 'crossing', 'surge']) {
      for (const spawn of Object.values(map.spawns)) {
        for (const target of [...map.entities, ...map.exits]) {
          const path = findWorldPath(map, spawn, target, { routeStateId: tideStateId })
          expect(path.length, `${tideStateId}:${spawn.id}→${target.id}`).toBeGreaterThan(0)
          expect(Math.hypot(path.at(-1).x - target.x, path.at(-1).y - target.y)).toBeLessThan(56)
        }
      }
    }
  })
})
