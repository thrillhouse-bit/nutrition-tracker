import { describe, expect, it } from 'vitest'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { resourceNodeKey } from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Stewardship's first (Act I) node proved the restore-then-tend contract at
// a single tier. This gives it a real Act II tier — a salt-damaged Pelagos
// garden, leached with purchased fresh water rather than compost — so the
// skill has an actual curve instead of stopping after one node, the same
// way Fishing/Quarrying/Foraging/Woodcutting already do.
const SALT_GARDEN_ID = 'steward-salt-garden'
const RESTORED_FLAG = 'steward:restored:pelagos-harbor:steward-salt-garden'
const SALT_GARDEN_KEY = resourceNodeKey('pelagos-harbor', SALT_GARDEN_ID)

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
  const base = stewardshipState(15)
  const withCask = addInventoryItem(base.inventory, 'water-cask', 3, ALL_ITEM_DEFS).inventory
  const state = atMap({ ...base, inventory: withCask }, 'pelagos-harbor', { x: 180, y: 420 })
  const restored = applyEvent(state, { type: 'RESTORE_LAND', entityId: SALT_GARDEN_ID })
  expect(restored.flags[RESTORED_FLAG]).toBe(true)
  return restored
}

describe('stewardship items', () => {
  it('registers water-cask and sea-fig with the exact material contract', () => {
    expect(ALL_ITEM_DEFS['water-cask']).toMatchObject({
      id: 'water-cask', name: 'Water Cask', category: 'material', stackable: false, tier: 15,
    })
    expect(ALL_ITEM_DEFS['sea-fig']).toMatchObject({
      id: 'sea-fig', name: 'Sea Fig', category: 'grain', stackable: false, tier: 15,
    })
  })

  it('reports zero new content-validation errors and lists both items as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['water-cask', 'sea-fig']))
  })
})

describe('salt garden world placement', () => {
  it('places the salt garden on Pelagos Harbor with the authored restore contract', () => {
    const map = REGISTERED_MAPS['pelagos-harbor']
    const entity = map.entities.find((candidate) => candidate.id === SALT_GARDEN_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'resource', skillId: 'stewardship', itemId: 'sea-fig', level: 20, xp: 35,
      requiresFlag: RESTORED_FLAG,
      restore: { level: 15, xp: 30, cost: [{ itemId: 'water-cask', quantity: 3 }] },
    })
  })

  it('is reachable from every spawn across the full tide cycle', () => {
    const map = REGISTERED_MAPS['pelagos-harbor']
    const entity = map.entities.find((candidate) => candidate.id === SALT_GARDEN_ID)
    for (const routeStateId of ACT2_TIDE_ORDER) {
      for (const spawn of Object.values(map.spawns)) {
        const path = findWorldPath(map, spawn, entity, { routeStateId })
        expect(path.length, `${spawn.id}@${routeStateId}`).toBeGreaterThan(0)
        expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
      }
    }
  })

  it('stays physically distinct from every other Pelagos Harbor target', () => {
    const map = REGISTERED_MAPS['pelagos-harbor']
    const entity = map.entities.find((candidate) => candidate.id === SALT_GARDEN_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== SALT_GARDEN_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('RESTORE_LAND — the salt garden', () => {
  it('refuses to restore below the authored level gate, leaving state byte-identical', () => {
    const base = stewardshipState(14)
    const withCask = addInventoryItem(base.inventory, 'water-cask', 3, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withCask }, 'pelagos-harbor', { x: 180, y: 420 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: SALT_GARDEN_ID })
    expect(result).toBe(state)
  })

  it('is a no-op with insufficient water casks', () => {
    const base = stewardshipState(15)
    const withCask = addInventoryItem(base.inventory, 'water-cask', 2, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withCask }, 'pelagos-harbor', { x: 180, y: 420 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: SALT_GARDEN_ID })
    expect(result).toBe(state)
    expect(itemQuantity(result.inventory, 'water-cask')).toBe(2)
  })

  it('consumes exactly the authored cost, sets the flag, and awards restore XP once', () => {
    const restored = restoredState()
    expect(itemQuantity(restored.inventory, 'water-cask')).toBe(0)
    expect(restored.progression.skills.stewardship.xp).toBe(xpForLevel(15) + 30)
  })

  it('is exact-once: a second restoration attempt is a no-op', () => {
    const restored = restoredState()
    const withMoreCasks = { ...restored, inventory: addInventoryItem(restored.inventory, 'water-cask', 3, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreCasks, { type: 'RESTORE_LAND', entityId: SALT_GARDEN_ID })
    expect(secondAttempt).toBe(withMoreCasks)
  })
})

describe('GATHER — the salt garden before and after restoration', () => {
  it('refuses to harvest an unrestored garden, leaving state byte-identical', () => {
    const state = atMap(stewardshipState(20), 'pelagos-harbor', { x: 180, y: 420 })
    const gathered = applyEvent(state, { type: 'GATHER', entityId: SALT_GARDEN_ID })
    expect(gathered).toBe(state)
  })

  it('refuses to harvest a restored garden below the tend level gate', () => {
    const restored = restoredState()
    const belowLevel = { ...restored, progression: { ...restored.progression, skills: { ...restored.progression.skills, stewardship: { xp: xpForLevel(19) } } } }
    const gathered = applyEvent(belowLevel, { type: 'GATHER', entityId: SALT_GARDEN_ID })
    expect(gathered).toBe(belowLevel)
  })

  it('grants exactly 1 sea fig once restored and at the tend level gate', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(20) } } } }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: SALT_GARDEN_ID })
    expect(itemQuantity(gathered.inventory, 'sea-fig')).toBe(1)
    expect(gathered.progression.skills.stewardship.xp).toBe(xpForLevel(20) + 35)
    expect(gathered.resources.nodes[SALT_GARDEN_KEY]).toBeTruthy()
    expect(gathered.resources.nodes[SALT_GARDEN_KEY].remaining).toBe(0)
  })

  it('grants a tool-bonus yield when iron-hoe is carried, reusing the existing gathering-tool mechanism', () => {
    const base = restoredState()
    const withHoe = addInventoryItem(base.inventory, 'iron-hoe', 1, ALL_ITEM_DEFS).inventory
    const state = {
      ...base, inventory: withHoe,
      progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(20) } } },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: SALT_GARDEN_ID })
    expect(itemQuantity(gathered.inventory, 'sea-fig')).toBe(3)
  })
})

describe('salt garden economy interaction', () => {
  it('lets Thaleia sell water casks and buy back sea figs, closing the second-tier economy loop', () => {
    let state = { ...stewardshipState(20), inventory: { ...stewardshipState(20).inventory, currency: 200 } }
    state = atMap(state, 'pelagos-harbor', { x: 180, y: 420 })
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'pelagos-chandler' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'water-cask', quantity: 3, transactionId: 'gap:cask' })
    expect(itemQuantity(bought.inventory, 'water-cask')).toBe(3)

    const restored = applyEvent(bought, { type: 'RESTORE_LAND', entityId: SALT_GARDEN_ID })
    expect(restored.flags[RESTORED_FLAG]).toBe(true)
    const gathered = applyEvent(restored, { type: 'GATHER', entityId: SALT_GARDEN_ID })
    expect(itemQuantity(gathered.inventory, 'sea-fig')).toBe(1)

    const reopened = applyEvent(gathered, { type: 'OPEN_SHOP', shopId: 'pelagos-chandler' })
    const sold = applyEvent(reopened, { type: 'SHOP_SELL', itemId: 'sea-fig', quantity: 1, transactionId: 'gap:fig' })
    expect(itemQuantity(sold.inventory, 'sea-fig')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(gathered.inventory.currency)
  })

  it('lets a harvested sea fig be deposited into and withdrawn from the Pelagos Storehouse', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(20) } } } }
    const caught = applyEvent(state, { type: 'GATHER', entityId: SALT_GARDEN_ID })
    expect(itemQuantity(caught.inventory, 'sea-fig')).toBe(1)

    const deposited = applyEvent(caught, { type: 'BANK_DEPOSIT', itemId: 'sea-fig', quantity: 1 })
    expect(itemQuantity(deposited.inventory, 'sea-fig')).toBe(0)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'sea-fig', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'sea-fig', quantity: 1 })
    expect(itemQuantity(withdrawn.inventory, 'sea-fig')).toBe(1)
  })
})
