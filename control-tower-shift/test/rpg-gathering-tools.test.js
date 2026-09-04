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

function stateWithCarried(itemId) {
  const initial = createInitialState()
  const { inventory } = addInventoryItem(initial.inventory, itemId, 1, ALL_ITEM_DEFS)
  return { ...initial, inventory }
}

function atResource(state, entityId) {
  const map = rpgMapById('beacon-overlook')
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  return { ...state, world: { ...state.world, regionId: map.region, mapId: map.id, spawnId: map.spawn.id, position: { x: entity.x, y: entity.y }, facing: map.spawn.facing || 0 } }
}

describe('gathering tool items and recipes', () => {
  it('registers bronze-quarry-pick and bronze-herb-sickle with the exact toolBonus contract', () => {
    expect(ALL_ITEM_DEFS['bronze-quarry-pick']).toMatchObject({
      id: 'bronze-quarry-pick',
      name: 'Bronze Quarry Pick',
      category: 'tool',
      stackable: false,
      tier: 1,
      toolBonus: { skillId: 'quarrying', yieldBonus: 1 },
    })
    expect(ALL_ITEM_DEFS['bronze-herb-sickle']).toMatchObject({
      id: 'bronze-herb-sickle',
      name: 'Bronze Herb Sickle',
      category: 'tool',
      stackable: false,
      tier: 1,
      toolBonus: { skillId: 'foraging', yieldBonus: 1 },
    })
  })

  it('registers forge recipes for both tools with independently reachable ingredients', () => {
    const pick = RECIPES.find((recipe) => recipe.id === 'bronze-quarry-pick')
    const sickle = RECIPES.find((recipe) => recipe.id === 'bronze-herb-sickle')
    expect(pick).toMatchObject({
      name: 'Forge Bronze Quarry Pick',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 3,
      xp: 20,
      ingredients: [
        { itemId: 'bronze-bar', quantity: 1 },
        { itemId: 'olive-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'bronze-quarry-pick', quantity: 1 }],
    })
    expect(sickle).toMatchObject({
      name: 'Forge Bronze Herb Sickle',
      skillId: 'bronzework',
      stationId: 'bronze-forge',
      level: 3,
      xp: 20,
      ingredients: [
        { itemId: 'bronze-bar', quantity: 1 },
        { itemId: 'olive-plank', quantity: 1 },
      ],
      outputs: [{ itemId: 'bronze-herb-sickle', quantity: 1 }],
    })

    // bronze-bar (level 2) and olive-plank (level 1) must both already be
    // orderable at or below this recipe's level-3 gate.
    const bronzeBar = RECIPES.find((recipe) => recipe.id === 'bronze-bar')
    const olivePlank = RECIPES.find((recipe) => recipe.id === 'olive-plank')
    expect(bronzeBar.level).toBeLessThanOrEqual(3)
    expect(olivePlank.level).toBeLessThanOrEqual(3)
  })

  it('reports zero UNOBTAINABLE_RECIPE_INGREDIENT issues for the new recipes and zero new errors overall', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)

    const unobtainableForNewTools = report.issues.filter((issueEntry) => (
      issueEntry.code === 'UNOBTAINABLE_RECIPE_INGREDIENT'
      && (issueEntry.path === 'recipes.bronze-quarry-pick.ingredients' || issueEntry.path === 'recipes.bronze-herb-sickle.ingredients')
    ))
    expect(unobtainableForNewTools).toEqual([])

    // Both crafted tools and their ingredients are part of the reachable
    // crafting closure computed by the validator.
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining([
      'bronze-bar',
      'olive-plank',
      'bronze-quarry-pick',
      'bronze-herb-sickle',
    ]))
  })
})

describe('gather() reducer — tool yield bonus', () => {
  it('grants exactly 1 copper-ore from copper-seam with no tool carried', () => {
    const initial = atResource(createInitialState(), 'copper-seam')
    expect(itemQuantity(initial.inventory, 'copper-ore')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(1)
    expect(gathered.progression.skills.quarrying.xp).toBe(16)
    // Exactly one charge consumed — the node is fully depleted, not drained
    // by more than its authored capacity.
    expect(gathered.resources.nodes[COPPER_SEAM_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 2 copper-ore (base 1 + tool bonus 1) when bronze-quarry-pick is carried', () => {
    const initial = atResource(stateWithCarried('bronze-quarry-pick'), 'copper-seam')
    expect(itemQuantity(initial.inventory, 'copper-ore')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(2)
    // XP is unaffected by the tool: same as the no-tool case.
    expect(gathered.progression.skills.quarrying.xp).toBe(16)
    // The node still lost exactly one charge — the tool bonus is an item
    // yield multiplier, never a node-charge multiplier.
    expect(gathered.resources.nodes[COPPER_SEAM_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 1 thyme from wild-thyme with no tool carried', () => {
    const initial = atResource(createInitialState(), 'wild-thyme')
    expect(itemQuantity(initial.inventory, 'thyme')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gathered.inventory, 'thyme')).toBe(1)
    expect(gathered.progression.skills.foraging.xp).toBe(12)
    expect(gathered.resources.nodes[THYME_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 2 thyme (base 1 + tool bonus 1) when bronze-herb-sickle is carried — proves the mechanic is not quarrying-specific', () => {
    const initial = atResource(stateWithCarried('bronze-herb-sickle'), 'wild-thyme')
    expect(itemQuantity(initial.inventory, 'thyme')).toBe(0)

    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gathered.inventory, 'thyme')).toBe(2)
    expect(gathered.progression.skills.foraging.xp).toBe(12)
    expect(gathered.resources.nodes[THYME_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants no bonus when the carried tool does not match the gathered skill', () => {
    // bronze-herb-sickle only bonuses foraging; gathering the quarrying node
    // while carrying it must yield exactly the base amount.
    const initial = atResource(stateWithCarried('bronze-herb-sickle'), 'copper-seam')
    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'copper-seam' })
    expect(itemQuantity(gathered.inventory, 'copper-ore')).toBe(1)
    expect(gathered.resources.nodes[COPPER_SEAM_KEY]).toEqual(depletedCapacityOneNode(0))

    // And the converse: bronze-quarry-pick does not bonus foraging.
    const initialInverse = atResource(stateWithCarried('bronze-quarry-pick'), 'wild-thyme')
    const gatheredInverse = applyEvent(initialInverse, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(itemQuantity(gatheredInverse.inventory, 'thyme')).toBe(1)
    expect(gatheredInverse.resources.nodes[THYME_KEY]).toEqual(depletedCapacityOneNode(0))
  })
})
