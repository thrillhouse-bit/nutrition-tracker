import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { resourceNodeKey } from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Stewardship's fifth and final tier — a shadowed plot at Nyx Foothold
// (Act V), the one genuinely civic Act V location among Night Stair, False
// Sky, and the narrative-gated Silent Loom — a witness camp with its own
// field kitchen, shrine-fire, bank, and merchant (Asteria). Closes out the
// full 5-tier restore-then-tend curve every other gathering skill already
// has: Beacon Overlook (Act I) -> Pelagos Harbor (Act II) -> Wheat Village
// (Act III) -> Slag Road (Act IV) -> Nyx Foothold (Act V).
const PLOT_ID = 'nyx-foothold-shade-plot'
const RESTORED_FLAG = 'steward:restored:nyx-foothold:nyx-foothold-shade-plot'
const PLOT_KEY = resourceNodeKey('nyx-foothold', PLOT_ID)

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
  const base = stewardshipState(45)
  const withOil = addInventoryItem(base.inventory, 'shadow-lantern-oil', 3, ALL_ITEM_DEFS).inventory
  const state = atMap({ ...base, inventory: withOil }, 'nyx-foothold', { x: 250, y: 470 })
  const restored = applyEvent(state, { type: 'RESTORE_LAND', entityId: PLOT_ID })
  expect(restored.flags[RESTORED_FLAG]).toBe(true)
  return restored
}

describe('stewardship tier-5 items', () => {
  it('registers shadow-lantern-oil and night-forage with the exact material contract', () => {
    expect(ALL_ITEM_DEFS['shadow-lantern-oil']).toMatchObject({
      id: 'shadow-lantern-oil', name: 'Shadow Lantern Oil', category: 'material', stackable: false, tier: 45,
    })
    expect(ALL_ITEM_DEFS['night-forage']).toMatchObject({
      id: 'night-forage', name: 'Night Forage', category: 'grain', stackable: false, tier: 50,
    })
  })

  it('reports zero new content-validation errors and lists both items as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['shadow-lantern-oil', 'night-forage']))
  })
})

describe('shadowed camp plot world placement', () => {
  it('places the plot on Nyx Foothold with the authored restore contract', () => {
    const map = REGISTERED_MAPS['nyx-foothold']
    const entity = map.entities.find((candidate) => candidate.id === PLOT_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'resource', skillId: 'stewardship', itemId: 'night-forage', level: 50, xp: 95,
      requiresFlag: RESTORED_FLAG,
      restore: { level: 45, xp: 80, cost: [{ itemId: 'shadow-lantern-oil', quantity: 3 }] },
    })
  })

  it('is reachable from every spawn', () => {
    const map = REGISTERED_MAPS['nyx-foothold']
    const entity = map.entities.find((candidate) => candidate.id === PLOT_ID)
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Nyx Foothold target', () => {
    const map = REGISTERED_MAPS['nyx-foothold']
    const entity = map.entities.find((candidate) => candidate.id === PLOT_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== PLOT_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('RESTORE_LAND — the shadowed camp plot', () => {
  it('refuses to restore below the authored level gate, leaving state byte-identical', () => {
    const base = stewardshipState(44)
    const withOil = addInventoryItem(base.inventory, 'shadow-lantern-oil', 3, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withOil }, 'nyx-foothold', { x: 250, y: 470 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(result).toBe(state)
  })

  it('is a no-op with insufficient shadow lantern oil', () => {
    const base = stewardshipState(45)
    const withOil = addInventoryItem(base.inventory, 'shadow-lantern-oil', 2, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withOil }, 'nyx-foothold', { x: 250, y: 470 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(result).toBe(state)
    expect(itemQuantity(result.inventory, 'shadow-lantern-oil')).toBe(2)
  })

  it('consumes exactly the authored cost, sets the flag, and awards restore XP once', () => {
    const restored = restoredState()
    expect(itemQuantity(restored.inventory, 'shadow-lantern-oil')).toBe(0)
    expect(restored.progression.skills.stewardship.xp).toBe(xpForLevel(45) + 80)
  })

  it('is exact-once: a second restoration attempt is a no-op', () => {
    const restored = restoredState()
    const withMoreOil = { ...restored, inventory: addInventoryItem(restored.inventory, 'shadow-lantern-oil', 3, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreOil, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(secondAttempt).toBe(withMoreOil)
  })
})

describe('GATHER — the shadowed camp plot before and after restoration', () => {
  it('refuses to harvest an unrestored plot, leaving state byte-identical', () => {
    const state = atMap(stewardshipState(50), 'nyx-foothold', { x: 250, y: 470 })
    const gathered = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(gathered).toBe(state)
  })

  it('refuses to harvest a restored plot below the tend level gate', () => {
    const restored = restoredState()
    const belowLevel = { ...restored, progression: { ...restored.progression, skills: { ...restored.progression.skills, stewardship: { xp: xpForLevel(49) } } } }
    const gathered = applyEvent(belowLevel, { type: 'GATHER', entityId: PLOT_ID })
    expect(gathered).toBe(belowLevel)
  })

  it('grants exactly 1 night forage once restored and at the tend level gate', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(50) } } } }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(gathered.inventory, 'night-forage')).toBe(1)
    expect(gathered.progression.skills.stewardship.xp).toBe(xpForLevel(50) + 95)
    expect(gathered.resources.nodes[PLOT_KEY]).toBeTruthy()
    expect(gathered.resources.nodes[PLOT_KEY].remaining).toBe(0)
  })

  it('grants a tool-bonus yield when iron-hoe is carried, reusing the existing gathering-tool mechanism', () => {
    const base = restoredState()
    const withHoe = addInventoryItem(base.inventory, 'iron-hoe', 1, ALL_ITEM_DEFS).inventory
    const state = {
      ...base, inventory: withHoe,
      progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(50) } } },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(gathered.inventory, 'night-forage')).toBe(3)
  })
})

describe('shadowed camp plot economy interaction', () => {
  it('lets Asteria sell shadow lantern oil and buy back night forage, closing the fifth-tier economy loop', () => {
    let state = { ...stewardshipState(50), inventory: { ...stewardshipState(50).inventory, currency: 300 } }
    state = atMap(state, 'nyx-foothold', { x: 250, y: 470 })
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'nyx-witness-exchange' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'shadow-lantern-oil', quantity: 3, transactionId: 'gap:oil' })
    expect(itemQuantity(bought.inventory, 'shadow-lantern-oil')).toBe(3)

    const restored = applyEvent(bought, { type: 'RESTORE_LAND', entityId: PLOT_ID })
    expect(restored.flags[RESTORED_FLAG]).toBe(true)
    const gathered = applyEvent(restored, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(gathered.inventory, 'night-forage')).toBe(1)

    const reopened = applyEvent(gathered, { type: 'OPEN_SHOP', shopId: 'nyx-witness-exchange' })
    const sold = applyEvent(reopened, { type: 'SHOP_SELL', itemId: 'night-forage', quantity: 1, transactionId: 'gap:forage' })
    expect(itemQuantity(sold.inventory, 'night-forage')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(gathered.inventory.currency)
  })

  it('lets a harvested night forage be deposited into and withdrawn from the Witness Camp Cache', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(50) } } } }
    const caught = applyEvent(state, { type: 'GATHER', entityId: PLOT_ID })
    expect(itemQuantity(caught.inventory, 'night-forage')).toBe(1)

    const deposited = applyEvent(caught, { type: 'BANK_DEPOSIT', itemId: 'night-forage', quantity: 1 })
    expect(itemQuantity(deposited.inventory, 'night-forage')).toBe(0)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'night-forage', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'night-forage', quantity: 1 })
    expect(itemQuantity(withdrawn.inventory, 'night-forage')).toBe(1)
  })
})
