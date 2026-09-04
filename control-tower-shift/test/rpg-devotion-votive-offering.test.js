import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { consumableEffect } from '../src/rpg/itemEffects.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { craftingAccessDecision, craftingStationMaps } from '../src/rpg/systemAccess.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Devotion — "Favor, blessings, and resistance to curses" — had no
// obtainable XP source anywhere in the game: no resource node, no recipe,
// no quest reward. It was one of three completely dead skills (alongside
// Guile and Beastbond, both still open). This gives Devotion a genuine,
// repeatable first loop: a votive-stand station (reusing the existing
// crafting ledger, the same way Hearthkeeping's shrine-fire already does
// for worship-adjacent crafting) that turns purchased votive-oil into
// Devotion XP and a real "blessing"-slot consumable.

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

// Physical system access requires the concrete station/shop/bank entity on the
// current map and a protagonist standing beside it. Resolve the matching entity
// for the map the caller already set, reposition west of it (validated
// reachable), and open through the reducer so later CRAFT/SHOP_*/BANK_* events
// carry real physical authority.
function systemOpenNear(state, kind, systemId) {
  const map = rpgMapById(state.world.mapId)
  const isStation = kind === 'station'
  const isShop = kind === 'shop'
  const entity = map.entities.find((candidate) =>
    isStation
      ? candidate.kind === 'station' && candidate.stationId === systemId
      : isShop
        ? candidate.kind === 'shop' && candidate.shopId === systemId
        : candidate.kind === 'bank')
  const near = { ...state, world: { ...state.world, position: { x: entity.x - 8, y: entity.y } } }
  const payload = isStation ? { stationId: systemId } : isShop ? { shopId: systemId } : {}
  const type = isStation ? 'OPEN_CRAFTING' : isShop ? 'OPEN_SHOP' : 'OPEN_BANK'
  return applyEvent(near, { type, entityId: entity.id, ...payload })
}

describe('devotion items and recipe', () => {
  it('registers votive-oil and votive-favor', () => {
    expect(ALL_ITEM_DEFS['votive-oil']).toMatchObject({ id: 'votive-oil', name: 'Votive Oil', category: 'material', stackable: false })
    expect(ALL_ITEM_DEFS['votive-favor']).toMatchObject({ id: 'votive-favor', name: 'Votive Favor', category: 'herb', stackable: false })
  })

  it('registers the votive-offering recipe with the exact contract', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'votive-offering')
    expect(recipe).toMatchObject({
      name: 'Make a Votive Offering', skillId: 'devotion', stationId: 'votive-stand', level: 1, xp: 15,
      ingredients: [{ itemId: 'votive-oil', quantity: 1 }],
      outputs: [{ itemId: 'votive-favor', quantity: 1 }],
    })
  })

  it('gives votive-favor a real blessing-slot consumable effect', () => {
    const effect = consumableEffect('votive-favor')
    expect(effect).toMatchObject({ activation: 'next-encounter', kind: 'blessing', slot: 'blessing' })
    expect(effect.modifiers.incomingDamageMultiplier).toBeLessThan(1)
  })

  it('reports zero new content-validation errors and lists both items as obtainable with no inert output', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['votive-oil', 'votive-favor']))
    const inert = report.issues.filter((entry) => entry.code === 'INERT_CRAFTED_OUTPUT' && entry.reference === 'votive-favor')
    expect(inert).toEqual([])
  })
})

describe('votive-stand access and placement', () => {
  it('is reachable from Beacon Overlook', () => {
    expect(craftingStationMaps('votive-stand')).toEqual(['beacon-overlook'])
    expect(craftingAccessDecision('beacon-overlook', 'votive-stand')).toMatchObject({ available: true })
  })

  it('places a physical station entity, reachable from every spawn', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === 'beacon-votive-stand')
    expect(entity).toBeTruthy()
    expect(entity.kind).toBe('station')
    expect(entity.stationId).toBe('votive-stand')
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Beacon Overlook target, including the unrelated patron shrine', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === 'beacon-votive-stand')
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== 'beacon-votive-stand')) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('CRAFT reducer — making a votive offering', () => {
  it('refuses to craft without votive-oil carried', () => {
    const state = atMap(createInitialState(), 'beacon-overlook')
    const open = systemOpenNear(state, 'station', 'votive-stand')
    expect(open.crafting.stationId).toBe('votive-stand')
    const crafted = applyEvent(open, { type: 'CRAFT', recipeId: 'votive-offering', quantity: 1 })
    expect(crafted.crafting.lastResult.ok).toBe(false)
    expect(itemQuantity(crafted.inventory, 'votive-favor')).toBe(0)
  })

  it('refuses to open the station away from Beacon Overlook', () => {
    const state = atMap(createInitialState(), 'olive-road')
    const open = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'votive-stand' })
    expect(open).toBe(state)
  })

  it('consumes exactly 1 votive-oil, awards 15 Devotion XP, and yields exactly 1 votive-favor', () => {
    const base = createInitialState()
    const withOil = { ...base, inventory: addInventoryItem(base.inventory, 'votive-oil', 1, ALL_ITEM_DEFS).inventory }
    let state = atMap(withOil, 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'votive-stand')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'votive-offering', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 15 })
    expect(itemQuantity(state.inventory, 'votive-oil')).toBe(0)
    expect(itemQuantity(state.inventory, 'votive-favor')).toBe(1)
    expect(state.progression.skills.devotion.xp).toBe(15)
  })

  it('is repeatable — devotion has no cap on how many offerings can be made, unlike a one-time restoration', () => {
    const base = createInitialState()
    const withOil = { ...base, inventory: addInventoryItem(base.inventory, 'votive-oil', 3, ALL_ITEM_DEFS).inventory }
    let state = atMap(withOil, 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'votive-stand')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'votive-offering', quantity: 3 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 3, xpAwarded: 45 })
    expect(itemQuantity(state.inventory, 'votive-favor')).toBe(3)
    expect(state.progression.skills.devotion.xp).toBe(45)
  })
})

describe('devotion economy and consumable interaction', () => {
  it('lets Myrrine sell votive-oil and buy back votive-favor', () => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 200 } }
    state = atMap(state, 'beacon-overlook')
    state = systemOpenNear(state, 'shop', 'beacon-provisioner')
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'votive-oil', quantity: 1, transactionId: 'devotion:buy-oil' })
    expect(itemQuantity(bought.inventory, 'votive-oil')).toBe(1)

    let crafted = systemOpenNear(bought, 'station', 'votive-stand')
    crafted = applyEvent(crafted, { type: 'CRAFT', recipeId: 'votive-offering', quantity: 1 })
    expect(itemQuantity(crafted.inventory, 'votive-favor')).toBe(1)

    const reopened = systemOpenNear(crafted, 'shop', 'beacon-provisioner')
    const sold = applyEvent(reopened, { type: 'SHOP_SELL', itemId: 'votive-favor', quantity: 1, transactionId: 'devotion:sell-favor' })
    expect(itemQuantity(sold.inventory, 'votive-favor')).toBe(0)
    expect(sold.inventory.currency).toBe(199)
    expect(sold.inventory.currency - state.inventory.currency).toBe(-1)
  })

  it('lets a crafted votive-favor actually be prepared as a pre-encounter blessing through the real USE_ITEM reducer path', () => {
    const base = createInitialState()
    const withOil = { ...base, inventory: addInventoryItem(base.inventory, 'votive-oil', 1, ALL_ITEM_DEFS).inventory }
    let state = atMap(withOil, 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'votive-stand')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'votive-offering', quantity: 1 })
    expect(itemQuantity(state.inventory, 'votive-favor')).toBe(1)

    const prepared = applyEvent(state, { type: 'USE_ITEM', itemId: 'votive-favor' })
    expect(prepared.flags['consumable:prepared:blessing']).toBe('votive-favor')
    expect(itemQuantity(prepared.inventory, 'votive-favor')).toBe(0)
  })
})
