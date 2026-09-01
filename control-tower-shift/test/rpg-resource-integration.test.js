import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { INVENTORY_CAPACITY, addInventoryItem } from '../src/rpg/progression.js'
import {
  DEFAULT_RESOURCE_RESPAWN_TICKS,
  RESOURCE_NODE_STATE_VERSION,
  resourceNodeKey,
} from '../src/rpg/resources.js'
import { normalizeState } from '../src/rpg/save.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

const THYME_NODE_KEY = resourceNodeKey('beacon-overlook', 'wild-thyme')

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

describe('resource-node reducer integration', () => {
  it('depletes the authored node and awards its item and XP exactly once', () => {
    const initial = createInitialState()
    expect(initial.resources).toEqual({ version: RESOURCE_NODE_STATE_VERSION, nodes: {} })
    expect(itemQuantity(initial.inventory, 'thyme')).toBe(0)
    expect(initial.progression.skills.foraging.xp).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(gathered).not.toBe(initial)
    expect(itemQuantity(gathered.inventory, 'thyme')).toBe(1)
    expect(gathered.progression.skills.foraging.xp).toBe(12)
    expect(gathered.progression.totalXp).toBe(initial.progression.totalXp + 12)
    expect(gathered.resources.nodes[THYME_NODE_KEY]).toEqual({
      remaining: 0,
      capacity: 1,
      respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
      depletedAtTick: 0,
      nextRespawnTick: DEFAULT_RESOURCE_RESPAWN_TICKS,
    })

    const replayed = applyEvent(gathered, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(replayed).toBe(gathered)
    expect(itemQuantity(replayed.inventory, 'thyme')).toBe(1)
    expect(replayed.progression.skills.foraging.xp).toBe(12)
    expect(replayed.progression.totalXp).toBe(gathered.progression.totalXp)
  })

  it('does not consume the node or award XP when the complete yield cannot fit', () => {
    let state = createInitialState()
    const fill = addInventoryItem(
      state.inventory,
      'copper-ore',
      INVENTORY_CAPACITY - state.inventory.slots.length,
      ALL_ITEM_DEFS,
    )
    expect(fill.added).toBe(INVENTORY_CAPACITY - state.inventory.slots.length)
    state = { ...state, inventory: fill.inventory }
    expect(state.inventory.slots).toHaveLength(INVENTORY_CAPACITY)

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(gathered).toBe(state)
    expect(itemQuantity(gathered.inventory, 'thyme')).toBe(0)
    expect(gathered.progression.skills.foraging.xp).toBe(0)
    expect(gathered.resources.nodes).toEqual({})
  })

  it('respawns on deterministic TICK time and permits one new exact reward', () => {
    const initial = createInitialState()
    const depleted = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })

    const beforeBoundary = applyEvent(depleted, { type: 'TICK', n: DEFAULT_RESOURCE_RESPAWN_TICKS - 1 })
    expect(beforeBoundary.playtimeTicks).toBe(DEFAULT_RESOURCE_RESPAWN_TICKS - 1)
    expect(beforeBoundary.resources.nodes[THYME_NODE_KEY]).toBeTruthy()
    expect(applyEvent(beforeBoundary, { type: 'GATHER', entityId: 'wild-thyme' })).toBe(beforeBoundary)

    const atBoundary = applyEvent(beforeBoundary, { type: 'TICK', n: 1 })
    expect(atBoundary.playtimeTicks).toBe(DEFAULT_RESOURCE_RESPAWN_TICKS)
    expect(atBoundary.resources.nodes[THYME_NODE_KEY]).toBeUndefined()

    const gatheredAgain = applyEvent(atBoundary, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gatheredAgain.inventory, 'thyme')).toBe(2)
    expect(gatheredAgain.progression.skills.foraging.xp).toBe(24)
    expect(gatheredAgain.resources.nodes[THYME_NODE_KEY].depletedAtTick).toBe(DEFAULT_RESOURCE_RESPAWN_TICKS)
    expect(gatheredAgain.resources.nodes[THYME_NODE_KEY].nextRespawnTick).toBe(DEFAULT_RESOURCE_RESPAWN_TICKS * 2)
  })
})

describe('resource-node save normalization', () => {
  it('keeps canonical known depletion while pruning unknown and malformed node records', () => {
    const raw = createInitialState()
    raw.playtimeTicks = 40
    raw.resources = {
      version: 99,
      nodes: {
        [THYME_NODE_KEY]: {
          remaining: 0,
          capacity: 1,
          respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
          depletedAtTick: 10,
          nextRespawnTick: 310,
        },
        [resourceNodeKey('beacon-overlook', 'unknown-tree')]: {
          remaining: 0,
          capacity: 1,
          respawnTicks: 30,
          depletedAtTick: 10,
          nextRespawnTick: 40,
        },
        'foreign-map::foreign-node': {
          remaining: 1,
          capacity: 2,
          respawnTicks: 20,
          depletedAtTick: null,
          nextRespawnTick: null,
        },
        malformed: { remaining: 'none' },
      },
    }

    const normalized = normalizeState(raw)
    expect(normalized.resources).toEqual({
      version: RESOURCE_NODE_STATE_VERSION,
      nodes: {
        [THYME_NODE_KEY]: {
          remaining: 0,
          capacity: 1,
          respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
          depletedAtTick: 10,
          nextRespawnTick: 310,
        },
      },
    })
  })

  it('normalizes an expired known depletion back to an available sparse node', () => {
    const raw = createInitialState()
    raw.playtimeTicks = DEFAULT_RESOURCE_RESPAWN_TICKS
    raw.resources = {
      version: RESOURCE_NODE_STATE_VERSION,
      nodes: {
        [THYME_NODE_KEY]: {
          remaining: 0,
          capacity: 1,
          respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
          depletedAtTick: 0,
          nextRespawnTick: DEFAULT_RESOURCE_RESPAWN_TICKS,
        },
      },
    }
    expect(normalizeState(raw).resources).toEqual({ version: RESOURCE_NODE_STATE_VERSION, nodes: {} })
  })
})
