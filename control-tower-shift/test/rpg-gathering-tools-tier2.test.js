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
import { rpgMapById } from '../src/rpg/registry.js'

const COPPER_SEAM_KEY = resourceNodeKey('beacon-overlook', 'copper-seam')
const THYME_KEY = resourceNodeKey('beacon-overlook', 'wild-thyme')

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

// Every current node (copper-seam, wild-thyme, etc.) is authored with no
// explicit capacity/quantity/respawnTicks, so the reducer relies on the
// documented defaults: 1 charge, capacity 1, respawn after
// DEFAULT_RESOURCE_RESPAWN_TICKS. This is the exact shape a fully-depleted
// capacity-1 node takes once a single charge has been consumed.
function depletedCapacityOneNode(tick = 0) {
  return {
    remaining: 0,
    capacity: DEFAULT_RESOURCE_NODE_CAPACITY,
    respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    depletedAtTick: tick,
    nextRespawnTick: tick + DEFAULT_RESOURCE_RESPAWN_TICKS,
  }
}

function stateWithCarried(itemIds) {
  const initial = createInitialState()
  let inventory = initial.inventory
  for (const itemId of Array.isArray(itemIds) ? itemIds : [itemIds]) {
    inventory = addInventoryItem(inventory, itemId, 1, ALL_ITEM_DEFS).inventory
  }
  return { ...initial, inventory }
}
function atResource(state, entityId) { const map = rpgMapById('beacon-overlook'); const entity = map.entities.find((candidate) => candidate.id === entityId); return { ...state, world: { ...state.world, regionId: map.region, mapId: map.id, spawnId: map.spawn.id, position: { x: entity.x, y: entity.y } } } }

describe('gathering tool items and recipes — tier 2', () => {
  it('registers iron-quarry-pick and iron-herb-sickle with the exact toolBonus contract', () => {
    expect(ALL_ITEM_DEFS['iron-quarry-pick']).toMatchObject({
      id: 'iron-quarry-pick',
      name: 'Iron Quarry Pick',
      category: 'tool',
      stackable: false,
      tier: 2,
      toolBonus: { skillId: 'quarrying', yieldBonus: 2 },
    })
    expect(ALL_ITEM_DEFS['iron-herb-sickle']).toMatchObject({
      id: 'iron-herb-sickle',
      name: 'Iron Herb Sickle',
      category: 'tool',
      stackable: false,
      tier: 2,
      toolBonus: { skillId: 'foraging', yieldBonus: 2 },
    })
  })

  it('registers forge recipes for both tier-2 tools with independently reachable ingredients', () => {
    const pick = RECIPES.find((recipe) => recipe.id === 'iron-quarry-pick')
    const sickle = RECIPES.find((recipe) => recipe.id === 'iron-herb-sickle')
    expect(pick).toMatchObject({
      name: 'Forge Iron Quarry Pick',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 15,
      ingredients: [
        { itemId: 'iron-ore', quantity: 2 },
        { itemId: 'cypress-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'iron-quarry-pick', quantity: 1 }],
    })
    expect(sickle).toMatchObject({
      name: 'Forge Iron Herb Sickle',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 15,
      ingredients: [
        { itemId: 'iron-ore', quantity: 2 },
        { itemId: 'cypress-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'iron-herb-sickle', quantity: 1 }],
    })

    // cypress-plank (carpentry level 10) is a different skill's recipe and
    // does not gate the bronzework level here; iron-ore is gathered directly
    // (quarrying level 10), not crafted. Both are already-reachable inputs
    // well below this recipe's bronzework level-15 gate.
    const cypressPlank = RECIPES.find((recipe) => recipe.id === 'cypress-plank')
    expect(cypressPlank.level).toBeLessThanOrEqual(15)

    // These sit meaningfully above the tier-1 tools' level-3 gate, and above
    // bronze-dory (level 12) — the next recipe below them in registry order.
    const bronzeDory = RECIPES.find((recipe) => recipe.id === 'bronze-dory')
    const bronzeAspis = RECIPES.find((recipe) => recipe.id === 'bronze-aspis')
    expect(pick.level).toBeGreaterThan(3)
    expect(pick.level).toBeGreaterThanOrEqual(bronzeDory.level)
    expect(pick.level).toBeLessThanOrEqual(bronzeAspis.level)
  })

  it('reports zero UNOBTAINABLE_RECIPE_INGREDIENT and zero INERT_CRAFTED_OUTPUT issues for the new tier-2 tools', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)

    const unobtainableForNewTools = report.issues.filter((issueEntry) => (
      issueEntry.code === 'UNOBTAINABLE_RECIPE_INGREDIENT'
      && (issueEntry.path === 'recipes.iron-quarry-pick.ingredients' || issueEntry.path === 'recipes.iron-herb-sickle.ingredients')
    ))
    expect(unobtainableForNewTools).toEqual([])

    const inertForNewTools = report.issues.filter((issueEntry) => (
      issueEntry.code === 'INERT_CRAFTED_OUTPUT'
      && (issueEntry.path === 'items.iron-quarry-pick' || issueEntry.path === 'items.iron-herb-sickle')
    ))
    expect(inertForNewTools).toEqual([])

    // Both crafted tools and their ingredients are part of the reachable
    // crafting closure computed by the validator.
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining([
      'iron-ore',
      'cypress-plank',
      'iron-quarry-pick',
      'iron-herb-sickle',
    ]))
  })
})

describe('gather() reducer — tier-2 tool yield bonus', () => {
  it('grants exactly 3 copper-ore (base 1 + tool bonus 2) when iron-quarry-pick is carried', () => {
    const initial = atResource(stateWithCarried('iron-quarry-pick'), 'copper-seam')
    expect(itemQuantity(initial.inventory, 'copper-ore')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(3)
    // XP is unaffected by the tool: same as the no-tool case.
    expect(gathered.progression.skills.quarrying.xp).toBe(16)
    // The node still lost exactly one charge — the tool bonus is an item
    // yield multiplier, never a node-charge multiplier.
    expect(gathered.resources.nodes[COPPER_SEAM_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 3 thyme (base 1 + tool bonus 2) when iron-herb-sickle is carried — proves the mechanic is not quarrying-specific', () => {
    const initial = atResource(stateWithCarried('iron-herb-sickle'), 'wild-thyme')
    expect(itemQuantity(initial.inventory, 'thyme')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gathered.inventory, 'thyme')).toBe(3)
    expect(gathered.progression.skills.foraging.xp).toBe(12)
    expect(gathered.resources.nodes[THYME_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants no bonus when the carried tier-2 tool does not match the gathered skill', () => {
    // iron-herb-sickle only bonuses foraging; gathering the quarrying node
    // while carrying it must yield exactly the base amount.
    const initial = atResource(stateWithCarried('iron-herb-sickle'), 'copper-seam')
    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(1)
    expect(gathered.resources.nodes[COPPER_SEAM_KEY]).toEqual(depletedCapacityOneNode(0))

    // And the converse: iron-quarry-pick does not bonus foraging.
    const initialInverse = atResource(stateWithCarried('iron-quarry-pick'), 'wild-thyme')
    const gatheredInverse = applyEvent(initialInverse, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gatheredInverse.inventory, 'thyme')).toBe(1)
    expect(gatheredInverse.resources.nodes[THYME_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants only the tier-2 bonus (not additive) when both tier-1 and tier-2 tools for the same skill are carried', () => {
    const initial = atResource(stateWithCarried(['bronze-quarry-pick', 'iron-quarry-pick']), 'copper-seam')
    expect(itemQuantity(initial.inventory, 'copper-ore')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    // base 1 + max(1, 2) = 3, never base 1 + 1 + 2 = 4 (not stacked additively).
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(3)
    expect(gathered.progression.skills.quarrying.xp).toBe(16)
    expect(gathered.resources.nodes[COPPER_SEAM_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants only the tier-2 bonus (not additive) for foraging when both bronze and iron sickles are carried', () => {
    const initial = atResource(stateWithCarried(['bronze-herb-sickle', 'iron-herb-sickle']), 'wild-thyme')
    expect(itemQuantity(initial.inventory, 'thyme')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gathered.inventory, 'thyme')).toBe(3)
    expect(gathered.progression.skills.foraging.xp).toBe(12)
    expect(gathered.resources.nodes[THYME_KEY]).toEqual(depletedCapacityOneNode(0))
  })
})
