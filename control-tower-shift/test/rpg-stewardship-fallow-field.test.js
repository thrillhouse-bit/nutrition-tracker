import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import {
  DEFAULT_RESOURCE_NODE_CAPACITY,
  DEFAULT_RESOURCE_RESPAWN_TICKS,
  resourceNodeKey,
} from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

const FALLOW_FIELD_ID = 'steward-fallow-field'
const RESTORED_FLAG = 'steward:restored:beacon-overlook:steward-fallow-field'
const FALLOW_FIELD_KEY = resourceNodeKey('beacon-overlook', FALLOW_FIELD_ID)

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

function depletedCapacityOneNode(tick = 0) {
  return {
    remaining: 0,
    capacity: DEFAULT_RESOURCE_NODE_CAPACITY,
    respawnTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    depletedAtTick: tick,
    nextRespawnTick: tick + DEFAULT_RESOURCE_RESPAWN_TICKS,
  }
}

function stateWithCarried(itemId, quantity = 1) {
  const initial = createInitialState()
  const { inventory } = addInventoryItem(initial.inventory, itemId, quantity, ALL_ITEM_DEFS)
  return { ...initial, inventory }
}

function restoredState() {
  const carrying = stateWithCarried('compost', 2)
  const restored = applyEvent(carrying, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
  expect(restored.flags[RESTORED_FLAG]).toBe(true)
  return restored
}

describe('stewardship items and recipes', () => {
  it('registers compost and barley-sheaf with the exact material contract', () => {
    expect(ALL_ITEM_DEFS.compost).toMatchObject({
      id: 'compost', name: 'Compost', category: 'material', stackable: false, tier: 1,
    })
    expect(ALL_ITEM_DEFS['barley-sheaf']).toMatchObject({
      id: 'barley-sheaf', name: 'Barley Sheaf', category: 'grain', stackable: false, tier: 1,
    })
  })

  it('registers bronze-hoe and iron-hoe with the exact toolBonus contract', () => {
    expect(ALL_ITEM_DEFS['bronze-hoe']).toMatchObject({
      id: 'bronze-hoe', name: 'Bronze Hoe', category: 'tool', stackable: false, tier: 1,
      toolBonus: { skillId: 'stewardship', yieldBonus: 1 },
    })
    expect(ALL_ITEM_DEFS['iron-hoe']).toMatchObject({
      id: 'iron-hoe', name: 'Iron Hoe', category: 'tool', stackable: false, tier: 2,
      toolBonus: { skillId: 'stewardship', yieldBonus: 2 },
    })
  })

  it('registers forge recipes for both hoe tiers with independently reachable ingredients', () => {
    const bronzeHoe = RECIPES.find((recipe) => recipe.id === 'bronze-hoe')
    const ironHoe = RECIPES.find((recipe) => recipe.id === 'iron-hoe')
    expect(bronzeHoe).toMatchObject({
      name: 'Forge Bronze Hoe', skillId: 'bronzework', stationId: 'bronze-forge', level: 3, xp: 20,
      ingredients: [{ itemId: 'bronze-bar', quantity: 1 }, { itemId: 'olive-plank', quantity: 1 }],
      outputs: [{ itemId: 'bronze-hoe', quantity: 1 }],
    })
    expect(ironHoe).toMatchObject({
      name: 'Forge Iron Hoe', skillId: 'bronzework', stationId: 'bronze-forge', level: 15, xp: 95,
      ingredients: [{ itemId: 'iron-ore', quantity: 2 }, { itemId: 'cypress-plank', quantity: 1 }],
      outputs: [{ itemId: 'iron-hoe', quantity: 1 }],
    })
  })

  it('reports zero new content-validation errors and lists compost/barley-sheaf/hoes as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    const unobtainableForHoes = report.issues.filter((entry) => (
      entry.code === 'UNOBTAINABLE_RECIPE_INGREDIENT'
      && (entry.path === 'recipes.bronze-hoe.ingredients' || entry.path === 'recipes.iron-hoe.ingredients')
    ))
    expect(unobtainableForHoes).toEqual([])
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining([
      'compost', 'barley-sheaf', 'bronze-hoe', 'iron-hoe',
    ]))
  })
})

describe('fallow field world placement', () => {
  it('places the fallow field on beacon-overlook with the authored restore contract', () => {
    const map = rpgMapById('beacon-overlook')
    const entity = map.entities.find((candidate) => candidate.id === FALLOW_FIELD_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'resource', skillId: 'stewardship', itemId: 'barley-sheaf', level: 1, xp: 15,
      requiresFlag: RESTORED_FLAG,
      restore: { level: 1, xp: 12, cost: [{ itemId: 'compost', quantity: 2 }] },
    })
  })

  it('is reachable from every spawn on beacon-overlook within gameplay interaction distance', () => {
    const map = rpgMapById('beacon-overlook')
    const entity = map.entities.find((candidate) => candidate.id === FALLOW_FIELD_ID)
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y), spawn.id).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Beacon Overlook target', () => {
    const map = rpgMapById('beacon-overlook')
    const entity = map.entities.find((candidate) => candidate.id === FALLOW_FIELD_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== FALLOW_FIELD_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('RESTORE_LAND reducer — one-time restoration', () => {
  it('is a no-op when insufficient compost is carried, and consumes nothing', () => {
    const state = stateWithCarried('compost', 1)
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
    expect(result).toBe(state)
    expect(result.flags[RESTORED_FLAG]).toBeUndefined()
    expect(itemQuantity(result.inventory, 'compost')).toBe(1)
  })

  it('is a no-op with no compost at all', () => {
    const state = createInitialState()
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
    expect(result).toBe(state)
  })

  it('consumes exactly the authored cost, sets the flag, and awards restore XP once', () => {
    const state = stateWithCarried('compost', 2)
    const restored = applyEvent(state, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
    expect(restored).not.toBe(state)
    expect(restored.flags[RESTORED_FLAG]).toBe(true)
    expect(itemQuantity(restored.inventory, 'compost')).toBe(0)
    expect(restored.progression.skills.stewardship.xp).toBe(12)
    expect(restored.progression.totalXp).toBe(state.progression.totalXp + 12)
  })

  it('leaves surplus compost untouched beyond the exact authored quantity', () => {
    const state = stateWithCarried('compost', 5)
    const restored = applyEvent(state, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(restored.inventory, 'compost')).toBe(3)
  })

  it('is exact-once: a second restoration attempt is a no-op even while carrying more compost', () => {
    const restored = restoredState()
    const withMoreCompost = { ...restored, inventory: addInventoryItem(restored.inventory, 'compost', 2, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreCompost, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
    expect(secondAttempt).toBe(withMoreCompost)
    expect(itemQuantity(secondAttempt.inventory, 'compost')).toBe(2)
  })
})

describe('GATHER reducer — the fallow field before and after restoration', () => {
  it('refuses to harvest an unrestored field, leaving state byte-identical', () => {
    const state = createInitialState()
    const gathered = applyEvent(state, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(gathered).toBe(state)
    expect(itemQuantity(gathered.inventory, 'barley-sheaf')).toBe(0)
  })

  it('grants exactly 1 barley-sheaf from a restored field with no tool carried', () => {
    const restored = restoredState()
    expect(itemQuantity(restored.inventory, 'barley-sheaf')).toBe(0)
    const gathered = applyEvent(restored, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(gathered.inventory, 'barley-sheaf')).toBe(1)
    expect(gathered.progression.skills.stewardship.xp).toBe(12 + 15)
    expect(gathered.resources.nodes[FALLOW_FIELD_KEY]).toEqual(depletedCapacityOneNode(0))
  })

  it('grants exactly 2 barley-sheaf (base 1 + tool bonus 1) when bronze-hoe is carried', () => {
    const restored = restoredState()
    const withHoe = { ...restored, inventory: addInventoryItem(restored.inventory, 'bronze-hoe', 1, ALL_ITEM_DEFS).inventory }
    const gathered = applyEvent(withHoe, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(gathered.inventory, 'barley-sheaf')).toBe(2)
  })

  it('grants exactly 3 barley-sheaf (base 1 + tool bonus 2) when iron-hoe is carried, never stacking with bronze', () => {
    const restored = restoredState()
    const withBronze = addInventoryItem(restored.inventory, 'bronze-hoe', 1, ALL_ITEM_DEFS).inventory
    const withBoth = addInventoryItem(withBronze, 'iron-hoe', 1, ALL_ITEM_DEFS).inventory
    const gathered = applyEvent({ ...restored, inventory: withBoth }, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(gathered.inventory, 'barley-sheaf')).toBe(3)
  })

  it('depletes and respawns on the default schedule once restored', () => {
    const restored = restoredState()
    const firstHarvest = applyEvent(restored, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(firstHarvest.inventory, 'barley-sheaf')).toBe(1)

    const secondAttempt = applyEvent(firstHarvest, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(secondAttempt).toBe(firstHarvest)

    const respawned = applyEvent(firstHarvest, { type: 'TICK', n: DEFAULT_RESOURCE_RESPAWN_TICKS })
    const thirdHarvest = applyEvent(respawned, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(thirdHarvest.inventory, 'barley-sheaf')).toBe(2)
  })

  it('never partially harvests when the yield cannot fit in a full inventory', () => {
    const restored = restoredState()
    const filled = addInventoryItem(restored.inventory, 'barley-flatbread', 28, ALL_ITEM_DEFS).inventory
    expect(filled.slots.length).toBe(28)
    const full = { ...restored, inventory: filled }
    const gathered = applyEvent(full, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(gathered).toBe(full)
    expect(gathered.resources.nodes[FALLOW_FIELD_KEY]).toBeUndefined()
  })
})

describe('fallow field economy interaction', () => {
  it('lets barley-sheaf be deposited into and withdrawn from the physical bank', () => {
    const restored = restoredState()
    const caught = applyEvent(restored, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(caught.inventory, 'barley-sheaf')).toBe(1)

    const deposited = applyEvent(caught, { type: 'BANK_DEPOSIT', itemId: 'barley-sheaf', quantity: 1 })
    expect(itemQuantity(deposited.inventory, 'barley-sheaf')).toBe(0)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'barley-sheaf', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'barley-sheaf', quantity: 1 })
    expect(itemQuantity(withdrawn.inventory, 'barley-sheaf')).toBe(1)
  })

  it('lets Myrrine sell compost and buy back barley-sheaf, closing the restore-then-tend economy loop', () => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 100 } }
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'compost', quantity: 2, transactionId: 'ui:buy:compost:1' })
    expect(itemQuantity(bought.inventory, 'compost')).toBe(2)
    expect(bought.inventory.currency).toBeLessThan(100)

    const restored = applyEvent(bought, { type: 'RESTORE_LAND', entityId: FALLOW_FIELD_ID })
    expect(restored.flags[RESTORED_FLAG]).toBe(true)
    const gathered = applyEvent(restored, { type: 'GATHER', entityId: FALLOW_FIELD_ID })
    expect(itemQuantity(gathered.inventory, 'barley-sheaf')).toBe(1)

    const reopened = applyEvent(gathered, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    const sold = applyEvent(reopened, { type: 'SHOP_SELL', itemId: 'barley-sheaf', quantity: 1, transactionId: 'ui:sell:sheaf:1' })
    expect(itemQuantity(sold.inventory, 'barley-sheaf')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(gathered.inventory.currency)
  })
})
