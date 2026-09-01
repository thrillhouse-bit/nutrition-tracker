import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESOURCE_NODE_CAPACITY,
  DEFAULT_RESOURCE_RESPAWN_TICKS,
  RESOURCE_NODE_STATE_VERSION,
  advanceResourceNodes,
  createInitialResourceNodes,
  harvestResourceNode,
  normalizeResourceNodes,
  parseResourceNodeKey,
  resourceNodeKey,
  resourceNodeStatus,
} from '../src/rpg/resources.js'

const BEACON_THYME = {
  mapId: 'beacon-overlook',
  entityId: 'wild-thyme',
}

describe('deterministic Oathbearer resource nodes', () => {
  it('uses stable map/entity identity and rejects ambiguous or malformed ids', () => {
    const key = resourceNodeKey('beacon-overlook', 'wild-thyme')
    expect(key).toBe('beacon-overlook::wild-thyme')
    expect(parseResourceNodeKey(key)).toEqual(BEACON_THYME)
    expect(resourceNodeKey('', 'wild-thyme')).toBeNull()
    expect(resourceNodeKey('beacon::overlook', 'wild-thyme')).toBeNull()
    expect(parseResourceNodeKey('beacon-overlook::wild-thyme::copy')).toBeNull()
  })

  it('starts every absent node full with deterministic defaults', () => {
    const resources = createInitialResourceNodes()
    const status = resourceNodeStatus({ resources, ...BEACON_THYME, playtimeTicks: 40 })
    expect(resources).toEqual({ version: RESOURCE_NODE_STATE_VERSION, nodes: {} })
    expect(status.available).toBe(true)
    expect(status.waitTicks).toBe(0)
    expect(status.node).toMatchObject({
      ...BEACON_THYME,
      capacity: DEFAULT_RESOURCE_NODE_CAPACITY,
      respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
      remaining: 1,
      nextRespawnTick: null,
    })
  })

  it('depletes exactly once and respawns on the precise playtime boundary', () => {
    const initial = createInitialResourceNodes()
    const harvested = harvestResourceNode({ resources: initial, ...BEACON_THYME, playtimeTicks: 100 })
    expect(harvested.changed).toBe(true)
    expect(harvested.reason).toBe('harvested')
    expect(harvested.quantity).toBe(1)
    expect(harvested.node).toMatchObject({ remaining: 0, depletedAtTick: 100, nextRespawnTick: 400 })
    expect(initial.nodes).toEqual({})

    const duplicate = harvestResourceNode({ resources: harvested.resources, ...BEACON_THYME, playtimeTicks: 399 })
    expect(duplicate.changed).toBe(false)
    expect(duplicate.reason).toBe('depleted')
    expect(duplicate.resources).toEqual(harvested.resources)
    expect(resourceNodeStatus({ resources: harvested.resources, ...BEACON_THYME, playtimeTicks: 399 })).toMatchObject({
      available: false,
      waitTicks: 1,
    })

    const boundary = resourceNodeStatus({ resources: harvested.resources, ...BEACON_THYME, playtimeTicks: 400 })
    expect(boundary.available).toBe(true)
    expect(boundary.node.remaining).toBe(1)
    expect(boundary.resources.nodes).toEqual({})
  })

  it('supports authored multi-charge nodes without partial overdraw', () => {
    const authored = { ...BEACON_THYME, capacity: 3, respawnTicks: 20 }
    const first = harvestResourceNode({ resources: createInitialResourceNodes(), ...authored, quantity: 2, playtimeTicks: 5 })
    expect(first.changed).toBe(true)
    expect(first.node).toMatchObject({ remaining: 1, nextRespawnTick: null })

    const overdraw = harvestResourceNode({ resources: first.resources, ...authored, quantity: 2, playtimeTicks: 8 })
    expect(overdraw.changed).toBe(false)
    expect(overdraw.reason).toBe('insufficient_charges')
    expect(overdraw.node.remaining).toBe(1)
    expect(overdraw.resources).toEqual(first.resources)

    const depleted = harvestResourceNode({ resources: first.resources, ...authored, quantity: 1, playtimeTicks: 8 })
    expect(depleted.node).toMatchObject({ remaining: 0, depletedAtTick: 8, nextRespawnTick: 28 })
    expect(resourceNodeStatus({ resources: depleted.resources, ...authored, playtimeTicks: 27 }).available).toBe(false)
    expect(resourceNodeStatus({ resources: depleted.resources, ...authored, playtimeTicks: 28 }).node.remaining).toBe(3)
  })

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])('rejects invalid harvest quantity %s without mutation', (quantity) => {
    const resources = createInitialResourceNodes()
    const outcome = harvestResourceNode({ resources, ...BEACON_THYME, quantity, playtimeTicks: 0 })
    expect(outcome).toMatchObject({ resources, node: null, changed: false, reason: 'invalid_request', quantity: 0 })
    expect(outcome.resources).toBe(resources)
  })

  it('rejects invalid operational ticks and explicit invalid node configuration', () => {
    const resources = createInitialResourceNodes()
    for (const request of [
      { ...BEACON_THYME, playtimeTicks: -1 },
      { ...BEACON_THYME, playtimeTicks: 1.5 },
      { ...BEACON_THYME, playtimeTicks: '1' },
      { ...BEACON_THYME, capacity: 0, playtimeTicks: 0 },
      { ...BEACON_THYME, capacity: '1', playtimeTicks: 0 },
      { ...BEACON_THYME, respawnTicks: Infinity, playtimeTicks: 0 },
    ]) {
      expect(resourceNodeStatus({ resources, ...request })).toBeNull()
      const outcome = harvestResourceNode({ resources, ...request })
      expect(outcome.changed).toBe(false)
      expect(outcome.resources).toBe(resources)
      expect(outcome.reason).toBe('invalid_request')
    }
    const overflow = harvestResourceNode({
      resources,
      ...BEACON_THYME,
      respawnTicks: 2,
      playtimeTicks: Number.MAX_SAFE_INTEGER,
    })
    expect(overflow).toMatchObject({ resources, changed: false, reason: 'invalid_request' })
  })

  it('normalizes malformed saves into a bounded sparse canonical state', () => {
    const thymeKey = resourceNodeKey(BEACON_THYME.mapId, BEACON_THYME.entityId)
    const oreKey = resourceNodeKey('beacon-overlook', 'copper-seam')
    const fullKey = resourceNodeKey('olive-road', 'shore-fishing')
    const normalized = normalizeResourceNodes({
      version: 999,
      nodes: {
        broken: { remaining: 0, capacity: 1, respawnTicks: 20, nextRespawnTick: 40 },
        [thymeKey]: { remaining: -9, capacity: 2, respawnTicks: 20, depletedAtTick: Infinity, nextRespawnTick: 50 },
        [oreKey]: { remaining: 99, capacity: 3, respawnTicks: 40 },
        [fullKey]: { remaining: 1, capacity: 1, respawnTicks: 10 },
      },
    }, 30)
    expect(normalized.version).toBe(RESOURCE_NODE_STATE_VERSION)
    expect(normalized.nodes).toEqual({
      [thymeKey]: { remaining: 0, capacity: 2, respawnTicks: 20, depletedAtTick: 30, nextRespawnTick: 50 },
    })
  })

  it('drops expired nodes and optionally prunes definitions removed from authored content', () => {
    const thymeKey = resourceNodeKey(BEACON_THYME.mapId, BEACON_THYME.entityId)
    const oreKey = resourceNodeKey('beacon-overlook', 'copper-seam')
    const saved = {
      version: 1,
      nodes: {
        [thymeKey]: { remaining: 0, capacity: 1, respawnTicks: 10, depletedAtTick: 10, nextRespawnTick: 20 },
        [oreKey]: { remaining: 1, capacity: 2, respawnTicks: 30, depletedAtTick: null, nextRespawnTick: null },
      },
    }
    expect(advanceResourceNodes(saved, 20).nodes).toEqual({
      [oreKey]: { remaining: 1, capacity: 2, respawnTicks: 30, depletedAtTick: null, nextRespawnTick: null },
    })
    expect(normalizeResourceNodes(saved, 19, { allowedNodeKeys: [thymeKey] }).nodes).toEqual({
      [thymeKey]: { remaining: 0, capacity: 1, respawnTicks: 10, depletedAtTick: 10, nextRespawnTick: 20 },
    })
  })

  it('is deterministic and does not mutate nested input records', () => {
    const resources = createInitialResourceNodes()
    const request = { resources, ...BEACON_THYME, capacity: 2, respawnTicks: 12, quantity: 1, playtimeTicks: 7 }
    const first = harvestResourceNode(request)
    const second = harvestResourceNode(request)
    expect(first).toEqual(second)
    expect(first.resources).not.toBe(resources)
    expect(resources).toEqual({ version: RESOURCE_NODE_STATE_VERSION, nodes: {} })

    const saved = structuredClone(first.resources)
    const normalized = normalizeResourceNodes(first.resources, 8)
    expect(first.resources).toEqual(saved)
    expect(normalized).toEqual(first.resources)
    expect(normalized).not.toBe(first.resources)
  })
})
