import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import {
  DEFAULT_RESOURCE_NODE_CAPACITY,
  DEFAULT_RESOURCE_RESPAWN_TICKS,
  resourceNodeKey,
} from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

const SHORE_FISHING_KEY = resourceNodeKey('olive-road', 'shore-fishing')

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

// shore-fishing is authored with no explicit capacity/quantity/respawnTicks, so
// the reducer relies on the documented defaults: 1 charge, capacity 1,
// respawn after DEFAULT_RESOURCE_RESPAWN_TICKS. This is the exact shape a
// fully-depleted capacity-1 node takes once a single charge has been consumed.
function depletedCapacityOneNode(tick = 0) {
  return {
    remaining: 0,
    capacity: DEFAULT_RESOURCE_NODE_CAPACITY,
    respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    depletedAtTick: tick,
    nextRespawnTick: tick + DEFAULT_RESOURCE_RESPAWN_TICKS,
  }
}

function stateWithCarried(itemId) {
  const initial = createInitialState()
  const { inventory } = addInventoryItem(initial.inventory, itemId, 1, ALL_ITEM_DEFS)
  return { ...initial, inventory }
}

describe('fishing gathering tool items and recipes', () => {
  it('registers bronze-fishing-rod and iron-fishing-rod with the exact toolBonus contract', () => {
    expect(ALL_ITEM_DEFS['bronze-fishing-rod']).toMatchObject({
      id: 'bronze-fishing-rod',
      name: 'Bronze Fishing Rod',
      category: 'tool',
      stackable: false,
      tier: 1,
      toolBonus: { skillId: 'fishing', yieldBonus: 1 },
    })
    expect(ALL_ITEM_DEFS['iron-fishing-rod']).toMatchObject({
      id: 'iron-fishing-rod',
      name: 'Iron Fishing Rod',
      category: 'tool',
      stackable: false,
      tier: 2,
      toolBonus: { skillId: 'fishing', yieldBonus: 2 },
    })
  })

  it('registers forge recipes for both rod tiers with independently reachable ingredients', () => {
    const bronzeRod = RECIPES.find((recipe) => recipe.id === 'bronze-fishing-rod')
    const ironRod = RECIPES.find((recipe) => recipe.id === 'iron-fishing-rod')
    expect(bronzeRod).toMatchObject({
      name: 'Forge Bronze Fishing Rod',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 3,
      xp: 20,
      ingredients: [
        { itemId: 'bronze-bar', quantity: 1 },
        { itemId: 'olive-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'bronze-fishing-rod', quantity: 1 }],
    })
    expect(ironRod).toMatchObject({
      name: 'Forge Iron Fishing Rod',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 15,
      xp: 95,
      ingredients: [
        { itemId: 'iron-ore', quantity: 2 },
        { itemId: 'cypress-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'iron-fishing-rod', quantity: 1 }],
    })

    const bronzeBar = RECIPES.find((recipe) => recipe.id === 'bronze-bar')
    const olivePlank = RECIPES.find((recipe) => recipe.id === 'olive-plank')
    expect(bronzeBar.level).toBeLessThanOrEqual(3)
    expect(olivePlank.level).toBeLessThanOrEqual(3)

    const ironOre = RECIPES.find((recipe) => recipe.id === 'iron-ore')
    const cypressPlank = RECIPES.find((recipe) => recipe.id === 'cypress-plank')
    expect(ironOre === undefined || ironOre.level <= 15).toBe(true)
    expect(cypressPlank.level).toBeLessThanOrEqual(15)
  })

  it('reports zero UNOBTAINABLE_RECIPE_INGREDIENT issues for the new recipes and zero new errors overall', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)

    const unobtainableForNewTools = report.issues.filter((issueEntry) => (
      issueEntry.code === 'UNOBTAINABLE_RECIPE_INGREDIENT'
      && (issueEntry.path === 'recipes.bronze-fishing-rod.ingredients' || issueEntry.path === 'recipes.iron-fishing-rod.ingredients')
    ))
    expect(unobtainableForNewTools).toEqual([])

    expect(report.obtainableItemIds).toEqual(expect.arrayContaining([
      'bronze-bar',
      'olive-plank',
      'iron-ore',
      'cypress-plank',
      'bronze-fishing-rod',
      'iron-fishing-rod',
    ]))
  })
})

describe('gather() reducer — fishing tool yield bonus', () => {
  it('grants exactly 1 sardine from shore-fishing with no tool carried', () => {
    const initial = createInitialState()
    expect(itemQuantity(initial.inventory, 'sardine')).toBe(0)

    const gathered = applyEvent(initial, {
      type: 'GATHER', entityId: 'shore-fishing', mapId: 'olive-road',
    })
    // GATHER only resolves against the currently active map's entities in
    // createInitialState (beacon-overlook), so travel there first via the
    // world position the reducer actually checks.
    const state = { ...initial, world: { ...initial.world, mapId: 'olive-road', position: { x: 292, y: 404 } } }
    const gatheredAtMap = applyEvent(state, { type: 'GATHER', entityId: 'shore-fishing' })
    expect(itemQuantity(gatheredAtMap.inventory, 'sardine')).toBe(1)
    expect(gatheredAtMap.progression.skills.fishing.xp).toBe(13)
    expect(gatheredAtMap.resources.nodes[SHORE_FISHING_KEY]).toEqual(depletedCapacityOneNode(0))
    // Confirms the naive call above (wrong map) is a genuine no-op, not a
    // silent partial success, before trusting the correctly-mapped result.
    expect(gathered).toBe(initial)
  })

  it('grants exactly 2 sardine (base 1 + tool bonus 1) when bronze-fishing-rod is carried', () => {
    const base = stateWithCarried('bronze-fishing-rod')
    const initial = { ...base, world: { ...base.world, mapId: 'olive-road', position: { x: 292, y: 404 } } }
    expect(itemQuantity(initial.inventory, 'sardine')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'shore-fishing' })
    expect(itemQuantity(gathered.inventory, 'sardine')).toBe(2)
    expect(gathered.progression.skills.fishing.xp).toBe(13)
    expect(gathered.resources.nodes[SHORE_FISHING_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 3 sardine (base 1 + tool bonus 2) when iron-fishing-rod is carried', () => {
    const base = stateWithCarried('iron-fishing-rod')
    const initial = { ...base, world: { ...base.world, mapId: 'olive-road', position: { x: 292, y: 404 } } }
    expect(itemQuantity(initial.inventory, 'sardine')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'shore-fishing' })
    expect(itemQuantity(gathered.inventory, 'sardine')).toBe(3)
    expect(gathered.progression.skills.fishing.xp).toBe(13)
    expect(gathered.resources.nodes[SHORE_FISHING_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants only the larger bonus when both rod tiers are carried at once', () => {
    const base = createInitialState()
    const withBronze = addInventoryItem(base.inventory, 'bronze-fishing-rod', 1, ALL_ITEM_DEFS).inventory
    const withBoth = addInventoryItem(withBronze, 'iron-fishing-rod', 1, ALL_ITEM_DEFS).inventory
    const initial = { ...base, inventory: withBoth, world: { ...base.world, mapId: 'olive-road', position: { x: 292, y: 404 } } }

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'shore-fishing' })
    expect(itemQuantity(gathered.inventory, 'sardine')).toBe(3)
  })

  it('grants no bonus when the carried tool does not match the gathered skill', () => {
    const base = stateWithCarried('bronze-fishing-rod')
    const initial = { ...base, world: { ...base.world, mapId: 'beacon-overlook', position: { x: 780, y: 408 } } }
    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(1)

    const inverseBase = stateWithCarried('bronze-quarry-pick')
    const inverseInitial = { ...inverseBase, world: { ...inverseBase.world, mapId: 'olive-road', position: { x: 292, y: 404 } } }
    const gatheredInverse = applyEvent(inverseInitial, { type: 'GATHER', entityId: 'shore-fishing' })
    expect(itemQuantity(gatheredInverse.inventory, 'sardine')).toBe(1)
    expect(gatheredInverse.resources.nodes[SHORE_FISHING_KEY]).toEqual(depletedCapacityOneNode(0))
  })
})
