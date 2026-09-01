import { describe, expect, it } from 'vitest'
import { SHOP_RESTOCK_INTERVAL_TICKS } from '../src/rpg/economy.js'
import { loadRPG, normalizeState, RPG_SAVE_KEY } from '../src/rpg/save.js'
import { applyEvent, createInitialState, SCHEMA_VERSION } from '../src/rpg/state.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { rpgMapById } from '../src/rpg/registry.js'

function stored(raw) {
  return { getItem: (key) => key === RPG_SAVE_KEY ? JSON.stringify(raw) : null }
}

describe('physical merchant reducer integration', () => {
  it('keeps Myrrine reachable from every Beacon spawn and separated from nearby targets', () => {
    const map = rpgMapById('beacon-overlook')
    const merchant = map.entities.find((entity) => entity.shopId === 'beacon-provisioner')
    expect(merchant).toBeTruthy()
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, merchant)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      const end = path.at(-1)
      expect(Math.hypot(end.x - merchant.x, end.y - merchant.y), spawn.id).toBeLessThan(56)
    }
    for (const target of [...map.entities, ...map.exits].filter((target) => target.id !== merchant.id)) {
      expect(Math.hypot(target.x - merchant.x, target.y - merchant.y), target.id).toBeGreaterThan(57)
    }
  })

  it('opens only the local merchant and executes an exact-once buy', () => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 100 } }
    expect(applyEvent(state, { type: 'OPEN_SHOP', shopId: 'not-a-shop' })).toBe(state)

    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    expect(state.economy.openShopId).toBe('beacon-provisioner')
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'thyme', quantity: 2, transactionId: 'ui:buy:1' })
    expect(bought.inventory.currency).toBe(82)
    expect(bought.inventory.slots.filter((entry) => entry.itemId === 'thyme')).toHaveLength(2)
    expect(bought.economy.shops['beacon-provisioner'].stock.thyme).toBe(14)

    expect(applyEvent(bought, { type: 'SHOP_BUY', itemId: 'thyme', quantity: 2, transactionId: 'ui:buy:1' })).toBe(bought)
  })

  it('sells carried stock once, rejects malformed quantities, and closes explicitly', () => {
    let state = createInitialState()
    state = applyEvent(state, { type: 'ADD_ITEM', itemId: 'thyme', quantity: 2 })
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    for (const quantity of [0, -1, 1.5, NaN, Infinity, '1']) {
      expect(applyEvent(state, { type: 'SHOP_SELL', itemId: 'thyme', quantity, transactionId: `bad:${String(quantity)}` })).toBe(state)
    }
    state = applyEvent(state, { type: 'SHOP_SELL', itemId: 'thyme', quantity: 1, transactionId: 'ui:sell:1' })
    expect(state.inventory.currency).toBe(3)
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'thyme')).toHaveLength(1)
    const closed = applyEvent(state, { type: 'CLOSE_SHOP' })
    expect(closed.economy.openShopId).toBeNull()
  })

  it('rechecks map access on every trade and closes a forged remote session', () => {
    let state = createInitialState()
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    state = { ...state, world: { ...state.world, mapId: 'olive-road', regionId: 'olive-road' } }
    const next = applyEvent(state, { type: 'SHOP_BUY', itemId: 'thyme', quantity: 1, transactionId: 'remote:1' })
    expect(next.economy.openShopId).toBeNull()
    expect(next.inventory).toBe(state.inventory)
  })

  it('restocks through strict deterministic TICK events only', () => {
    let state = createInitialState()
    state.economy.shops['beacon-provisioner'].stock.thyme = 0
    expect(applyEvent(state, { type: 'TICK', n: 1.5 })).toBe(state)
    expect(applyEvent(state, { type: 'TICK', n: '1800' })).toBe(state)
    const restocked = applyEvent(state, { type: 'TICK', n: SHOP_RESTOCK_INTERVAL_TICKS })
    expect(restocked.playtimeTicks).toBe(SHOP_RESTOCK_INTERVAL_TICKS)
    expect(restocked.economy.shops['beacon-provisioner'].stock.thyme).toBe(3)
  })
})

describe('schema-v2 economy migration', () => {
  it('folds legacy carried and banked drachma stacks into the scalar wallet exactly once', () => {
    const legacy = createInitialState()
    legacy.schemaVersion = 1
    delete legacy.economy
    legacy.inventory = {
      ...legacy.inventory,
      currency: 7,
      slots: [...legacy.inventory.slots, { itemId: 'drachma', quantity: 11 }],
      bank: { ...legacy.inventory.bank, slots: [{ itemId: 'drachma', quantity: 13 }] },
    }
    const loaded = loadRPG(stored(legacy))
    expect(loaded.error).toBe('none')
    expect(loaded.save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(loaded.save.inventory.currency).toBe(31)
    expect(loaded.save.inventory.slots.some((entry) => entry.itemId === 'drachma')).toBe(false)
    expect(loaded.save.inventory.bank.slots.some((entry) => entry.itemId === 'drachma')).toBe(false)
    expect(loaded.save.economy.shops['beacon-provisioner'].stock.thyme).toBe(16)

    const normalizedAgain = normalizeState(loaded.save)
    expect(normalizedAgain.inventory.currency).toBe(31)
  })

  it('normalizes malformed economy state, closes remote shops, and reports unknown IDs', () => {
    const raw = createInitialState()
    raw.world = { ...raw.world, mapId: 'olive-road', regionId: 'olive-road', spawnId: 'from-beacon' }
    raw.economy.openShopId = 'beacon-provisioner'
    expect(normalizeState(raw).economy.openShopId).toBeNull()

    const unknown = createInitialState()
    unknown.economy.openShopId = 'foreign-market'
    const loaded = loadRPG(stored(unknown))
    expect(loaded.save).toBeTruthy()
    expect(loaded.error).toBe('unknown')
  })
})
