import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { resourceNodeKey } from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Stewardship's fourth tier — a slag-and-ash-fouled plot on the Slag Road
// (Act IV), the one genuinely civic location in that region (a refugee camp
// with its own quartermaster and muster bank, unlike the industrial Bronze
// Foundry/Name-Press or the Atlas Vault). Continues the same restore-then-
// tend curve as Beacon Overlook, Pelagos Harbor, and Wheat Village, each
// with its own thematically distinct restore cost — here, ration water to
// wash the slag ash out before the plot can grow anything again.
const PLOT_ID = 'slag-road-cinder-plot'
const RESTORED_FLAG = 'steward:restored:slag-road:slag-road-cinder-plot'
const PLOT_KEY = resourceNodeKey('slag-road', PLOT_ID)

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

function atMap(state, mapId, position) {
  const map = rpgMapById(mapId)
  return {
    ...state,
    world: {
      ...state.world,
      regionId: map.region,
      mapId,
      spawnId: map.spawn.id,
      position: position || { x: map.spawn.x, y: map.spawn.y },
      facing: map.spawn.facing || 0,
    },
  }
}

function stewardshipState(level) {
  const base = createInitialState()
  return {
    ...base,
    progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(level) } } },
  }
}

function restoredState() {
  const base = stewardshipState(35)
  const withWater = addInventoryItem(base.inventory, 'ration-water', 3, ALL_ITEM_DEFS).inventory
  const state = atMap({ ...base, inventory: withWater }, 'slag-road', { x: 200, y: 470 })
  const restored = applyEvent(state, { type: 'RESTORE_LAND', entityId: PLOT_ID })
  expect(restored.flags[RESTORED_FLAG]).toBe(true)
  return restored
}

describe('stewardship tier-4 items', () => {
  it('registers ration-water and camp-forage with the exact material contract', () => {
    expect(ALL_ITEM_DEFS['ration-water']).toMatchObject({
      id: 'ration-water', name: 'Ration Water', category: 'material', stackable: false, tier: 35,
    })
    expect(ALL_ITEM_DEFS['camp-forage']).toMatchObject({
      id: 'camp-forage', name: 'Camp Forage', category: 'grain', stackable: false, tier: 40,
    })
  })

  it('reports zero new content-validation errors and lists both items as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['ration-water', 'camp-forage']))
  })
})

describe('cinder-fouled plot world placement', () => {
  it('places the plot on Slag Road with the authored restore contract', () => {
    const map = REGISTERED_MAPS['slag-road']
    const entity = map.entities.find((candidate) => candidate.id === PLOT_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'resource', skillId: 'stewardship', itemId: 'camp-forage', level: 40, xp: 70,
      requiresFlag: RESTORED_FLAG,
      restore: { level: 35, xp: 60, cost: [{ itemId: 'ration-water', quantity: 3 }] },
    })
  })

  it('is reachable from every spawn', () => {
    const map = REGISTERED_MAPS['slag-road']
    const entity = map.entities.find((candidate) => candidate.id === PLOT_ID)
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Slag Road target', () => {
    const map = REGISTERED_MAPS['slag-road']
    const entity = map.entities.find((candidate) => candidate.id === PLOT_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== PLOT_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('RESTORE_LAND — the cinder-fouled plot', () => {
  it('refuses to restore below the authored level gate, leaving state byte-identical', () => {
    const base = stewardshipState(34)
    const withWater = addInventoryItem(base.inventory, 'ration-water', 3, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withWater }, 'slag-road', { x: 200, y: 470 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(result).toBe(state)
  })

  it('is a no-op with insufficient ration water', () => {
    const base = stewardshipState(35)
    const withWater = addInventoryItem(base.inventory, 'ration-water', 2, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withWater }, 'slag-road', { x: 200, y: 470 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(result).toBe(state)
    expect(itemQuantity(result.inventory, 'ration-water')).toBe(2)
  })

  it('consumes exactly the authored cost, sets the flag, and awards restore XP once', () => {
    const restored = restoredState()
    expect(itemQuantity(restored.inventory, 'ration-water')).toBe(0)
    expect(restored.progression.skills.stewardship.xp).toBe(xpForLevel(35) + 60)
  })

  it('is exact-once: a second restoration attempt is a no-op', () => {
    const restored = restoredState()
    const withMoreWater = { ...restored, inventory: addInventoryItem(restored.inventory, 'ration-water', 3, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreWater, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(secondAttempt).toBe(withMoreWater)
  })
})

describe('GATHER — the cinder-fouled plot before and after restoration', () => {
  it('refuses to harvest an unrestored plot, leaving state byte-identical', () => {
    const state = atMap(stewardshipState(40), 'slag-road', { x: 200, y: 470 })
    const gathered = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(gathered).toBe(state)
  })

  it('refuses to harvest a restored plot below the tend level gate', () => {
    const restored = restoredState()
    const belowLevel = { ...restored, progression: { ...restored.progression, skills: { ...restored.progression.skills, stewardship: { xp: xpForLevel(39) } } } }
    const gathered = applyEvent(belowLevel, { type: 'GATHER', entityId: PLOT_ID })
    expect(gathered).toBe(belowLevel)
  })

  it('grants exactly 1 camp forage once restored and at the tend level gate', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(40) } } } }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(gathered.inventory, 'camp-forage')).toBe(1)
    expect(gathered.progression.skills.stewardship.xp).toBe(xpForLevel(40) + 70)
    expect(gathered.resources.nodes[PLOT_KEY]).toBeTruthy()
    expect(gathered.resources.nodes[PLOT_KEY].remaining).toBe(0)
  })

  it('grants a tool-bonus yield when iron-hoe is carried, reusing the existing gathering-tool mechanism', () => {
    const base = restoredState()
    const withHoe = addInventoryItem(base.inventory, 'iron-hoe', 1, ALL_ITEM_DEFS).inventory
    const state = {
      ...base, inventory: withHoe,
      progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(40) } } },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(gathered.inventory, 'camp-forage')).toBe(3)
  })
})

describe('cinder-fouled plot economy interaction', () => {
  it('lets Doros sell ration water and buy back camp forage, closing the fourth-tier economy loop', () => {
    let state = { ...stewardshipState(40), inventory: { ...stewardshipState(40).inventory, currency: 300 } }
    state = atMap(state, 'slag-road', { x: 200, y: 470 })
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'forge-march-quartermaster' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'ration-water', quantity: 3, transactionId: 'gap:water' })
    expect(itemQuantity(bought.inventory, 'ration-water')).toBe(3)

    const restored = applyEvent(bought, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(restored.flags[RESTORED_FLAG]).toBe(true)
    const gathered = applyEvent(restored, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(gathered.inventory, 'camp-forage')).toBe(1)

    const reopened = applyEvent(gathered, { type: 'OPEN_SHOP', shopId: 'forge-march-quartermaster' })
    const sold = applyEvent(reopened, { type: 'SHOP_SELL', itemId: 'camp-forage', quantity: 1, transactionId: 'gap:forage' })
    expect(itemQuantity(sold.inventory, 'camp-forage')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(gathered.inventory.currency)
  })

  it('lets a harvested camp forage be deposited into and withdrawn from the March Muster Strongbox', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(40) } } } }
    const caught = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(caught.inventory, 'camp-forage')).toBe(1)

    const deposited = applyEvent(caught, { type: 'BANK_DEPOSIT', itemId: 'camp-forage', quantity: 1 })
    expect(itemQuantity(deposited.inventory, 'camp-forage')).toBe(0)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'camp-forage', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'camp-forage', quantity: 1 })
    expect(itemQuantity(withdrawn.inventory, 'camp-forage')).toBe(1)
  })
})
