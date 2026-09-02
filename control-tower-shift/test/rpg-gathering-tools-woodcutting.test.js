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

const OLIVE_TREE_KEY = resourceNodeKey('beacon-overlook', 'olive-tree')

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

// olive-tree is authored with no explicit capacity/quantity/respawnTicks, so
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

describe('woodcutting gathering tool items and recipes', () => {
  it('registers bronze-felling-axe and iron-felling-axe with the exact toolBonus contract', () => {
    expect(ALL_ITEM_DEFS['bronze-felling-axe']).toMatchObject({
      id: 'bronze-felling-axe',
      name: 'Bronze Felling Axe',
      category: 'tool',
      stackable: false,
      tier: 1,
      toolBonus: { skillId: 'woodcutting', yieldBonus: 1 },
    })
    expect(ALL_ITEM_DEFS['iron-felling-axe']).toMatchObject({
      id: 'iron-felling-axe',
      name: 'Iron Felling Axe',
      category: 'tool',
      stackable: false,
      tier: 2,
      toolBonus: { skillId: 'woodcutting', yieldBonus: 2 },
    })
  })

  it('registers forge recipes for both axe tiers with independently reachable ingredients', () => {
    const bronzeAxe = RECIPES.find((recipe) => recipe.id === 'bronze-felling-axe')
    const ironAxe = RECIPES.find((recipe) => recipe.id === 'iron-felling-axe')
    expect(bronzeAxe).toMatchObject({
      name: 'Forge Bronze Felling Axe',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 3,
      xp: 20,
      ingredients: [
        { itemId: 'bronze-bar', quantity: 1 },
        { itemId: 'olive-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'bronze-felling-axe', quantity: 1 }],
    })
    expect(ironAxe).toMatchObject({
      name: 'Forge Iron Felling Axe',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 15,
      xp: 95,
      ingredients: [
        { itemId: 'iron-ore', quantity: 2 },
        { itemId: 'cypress-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'iron-felling-axe', quantity: 1 }],
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
      && (issueEntry.path === 'recipes.bronze-felling-axe.ingredients' || issueEntry.path === 'recipes.iron-felling-axe.ingredients')
    ))
    expect(unobtainableForNewTools).toEqual([])

    expect(report.obtainableItemIds).toEqual(expect.arrayContaining([
      'bronze-bar',
      'olive-plank',
      'iron-ore',
      'cypress-plank',
      'bronze-felling-axe',
      'iron-felling-axe',
    ]))
  })
})

describe('gather() reducer — woodcutting tool yield bonus', () => {
  it('grants exactly 1 olive-log from olive-tree with no tool carried', () => {
    const initial = createInitialState()
    expect(itemQuantity(initial.inventory, 'olive-log')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'olive-tree' })
    expect(itemQuantity(gathered.inventory, 'olive-log')).toBe(1)
    expect(gathered.progression.skills.woodcutting.xp).toBe(14)
    expect(gathered.resources.nodes[OLIVE_TREE_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 2 olive-log (base 1 + tool bonus 1) when bronze-felling-axe is carried', () => {
    const initial = stateWithCarried('bronze-felling-axe')
    expect(itemQuantity(initial.inventory, 'olive-log')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'olive-tree' })
    expect(itemQuantity(gathered.inventory, 'olive-log')).toBe(2)
    expect(gathered.progression.skills.woodcutting.xp).toBe(14)
    expect(gathered.resources.nodes[OLIVE_TREE_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 3 olive-log (base 1 + tool bonus 2) when iron-felling-axe is carried', () => {
    const initial = stateWithCarried('iron-felling-axe')
    expect(itemQuantity(initial.inventory, 'olive-log')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'olive-tree' })
    expect(itemQuantity(gathered.inventory, 'olive-log')).toBe(3)
    expect(gathered.progression.skills.woodcutting.xp).toBe(14)
    expect(gathered.resources.nodes[OLIVE_TREE_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants only the larger bonus when both axe tiers are carried at once', () => {
    const initial = createInitialState()
    const withBronze = addInventoryItem(initial.inventory, 'bronze-felling-axe', 1, ALL_ITEM_DEFS).inventory
    const withBoth = addInventoryItem(withBronze, 'iron-felling-axe', 1, ALL_ITEM_DEFS).inventory
    const state = { ...initial, inventory: withBoth }

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'olive-tree' })
    expect(itemQuantity(gathered.inventory, 'olive-log')).toBe(3)
  })

  it('grants no bonus when the carried tool does not match the gathered skill', () => {
    const initial = stateWithCarried('bronze-felling-axe')
    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(1)

    const initialInverse = stateWithCarried('bronze-quarry-pick')
    const gatheredInverse = applyEvent(initialInverse, { type: 'GATHER', entityId: 'olive-tree' })
    expect(itemQuantity(gatheredInverse.inventory, 'olive-log')).toBe(1)
    expect(gatheredInverse.resources.nodes[OLIVE_TREE_KEY]).toEqual(depletedCapacityOneNode(0))
  })
})
