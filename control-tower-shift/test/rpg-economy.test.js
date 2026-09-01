import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import {
  MAX_PROCESSED_TRANSACTIONS,
  SHOP_RESTOCK_INTERVAL_TICKS,
  buyFromShop,
  createInitialEconomy,
  normalizeEconomy,
  quoteBuy,
  quoteSell,
  restockEconomy,
  sellToShop,
  validateShopDefinitions,
} from '../src/rpg/economy.js'
import { INVENTORY_CAPACITY, addInventoryItem, createInitialInventory } from '../src/rpg/progression.js'

function funded(amount = 200) {
  return { ...createInitialInventory(), currency: amount }
}

describe('Oathbearer deterministic shop domain', () => {
  it('validates original item listings and keeps a lossless buy/sell spread', () => {
    expect(validateShopDefinitions()).toEqual([])
    expect(quoteBuy(createInitialEconomy(), 'beacon-provisioner', 'thyme', 2)).toMatchObject({ unitPrice: 9, total: 18, stock: 16 })
    expect(quoteSell('beacon-provisioner', 'thyme', 2)).toEqual({ unitPrice: 3, total: 6 })
  })

  it('buys atomically, debits the scalar wallet, and rejects replay', () => {
    const input = { economy: createInitialEconomy(), inventory: funded(), shopId: 'beacon-provisioner', itemId: 'thyme', quantity: 2, transactionId: 'buy:1' }
    const bought = buyFromShop(input)
    expect(bought.changed).toBe(true)
    expect(bought.inventory.currency).toBe(182)
    expect(bought.inventory.slots.filter((entry) => entry.itemId === 'thyme')).toHaveLength(2)
    expect(bought.economy.shops['beacon-provisioner'].stock.thyme).toBe(14)
    expect(bought.economy.lastResult).toMatchObject({ ok: true, reason: 'bought', total: 18 })

    const replayed = buyFromShop({ ...input, economy: bought.economy, inventory: bought.inventory })
    expect(replayed.changed).toBe(false)
    expect(replayed.economy).toBe(bought.economy)
    expect(replayed.inventory).toBe(bought.inventory)
  })

  it('rejects partial non-stackable purchases when the backpack cannot fit every item', () => {
    let inventory = funded()
    inventory = addInventoryItem(inventory, 'copper-ore', INVENTORY_CAPACITY - inventory.slots.length - 1, ALL_ITEM_DEFS).inventory
    expect(inventory.slots).toHaveLength(INVENTORY_CAPACITY - 1)
    const outcome = buyFromShop({
      economy: createInitialEconomy(), inventory, shopId: 'beacon-provisioner', itemId: 'thyme', quantity: 2, transactionId: 'buy:full',
    })
    expect(outcome.changed).toBe(false)
    expect(outcome.inventory).toBe(inventory)
    expect(outcome.economy.lastResult.reason).toBe('inventory_full')
    expect(outcome.economy.shops['beacon-provisioner'].stock.thyme).toBe(16)
  })

  it('does not mutate stock or inventory for insufficient funds or stock', () => {
    const economy = createInitialEconomy()
    const poor = funded(1)
    const funds = buyFromShop({ economy, inventory: poor, shopId: 'beacon-provisioner', itemId: 'olive-log', quantity: 1, transactionId: 'buy:poor' })
    expect(funds.changed).toBe(false)
    expect(funds.inventory).toBe(poor)
    expect(funds.economy.lastResult.reason).toBe('insufficient_funds')
    expect(funds.economy.shops['beacon-provisioner'].stock['olive-log']).toBe(10)

    const stock = buyFromShop({ economy, inventory: funded(1_000), shopId: 'beacon-provisioner', itemId: 'copper-ore', quantity: 9, transactionId: 'buy:stock' })
    expect(stock.changed).toBe(false)
    expect(stock.economy.lastResult.reason).toBe('insufficient_stock')
  })

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '2'])('rejects invalid quantity %s without recording a transaction', (quantity) => {
    const economy = createInitialEconomy()
    const inventory = funded()
    const bought = buyFromShop({ economy, inventory, shopId: 'beacon-provisioner', itemId: 'thyme', quantity, transactionId: `invalid:${String(quantity)}` })
    const sold = sellToShop({ economy, inventory, shopId: 'beacon-provisioner', itemId: 'thyme', quantity, transactionId: `sell-invalid:${String(quantity)}` })
    expect(bought.economy).toBe(economy)
    expect(bought.inventory).toBe(inventory)
    expect(sold.economy).toBe(economy)
    expect(sold.inventory).toBe(inventory)
  })

  it('sells carried items only and credits exact value once', () => {
    let inventory = addInventoryItem(funded(10), 'olive-log', 3, ALL_ITEM_DEFS).inventory
    inventory = { ...inventory, bank: { ...inventory.bank, slots: [{ itemId: 'olive-log', quantity: 7 }] } }
    const sold = sellToShop({ economy: createInitialEconomy(), inventory, shopId: 'beacon-provisioner', itemId: 'olive-log', quantity: 2, transactionId: 'sell:1' })
    expect(sold.changed).toBe(true)
    expect(sold.inventory.currency).toBe(20)
    expect(sold.inventory.slots.filter((entry) => entry.itemId === 'olive-log')).toHaveLength(1)
    expect(sold.inventory.bank.slots).toEqual([{ itemId: 'olive-log', quantity: 7 }])
    expect(sold.economy.shops['beacon-provisioner'].stock['olive-log']).toBe(12)

    const replayed = sellToShop({ economy: sold.economy, inventory: sold.inventory, shopId: 'beacon-provisioner', itemId: 'olive-log', quantity: 2, transactionId: 'sell:1' })
    expect(replayed.economy).toBe(sold.economy)
    expect(replayed.inventory).toBe(sold.inventory)
  })

  it('restocks only on deterministic playtime intervals and caps stock', () => {
    const depleted = createInitialEconomy()
    depleted.shops['beacon-provisioner'].stock.thyme = 1
    expect(restockEconomy(depleted, SHOP_RESTOCK_INTERVAL_TICKS - 1).shops['beacon-provisioner'].stock.thyme).toBe(1)
    expect(restockEconomy(depleted, SHOP_RESTOCK_INTERVAL_TICKS).shops['beacon-provisioner'].stock.thyme).toBe(4)
    const capped = restockEconomy(depleted, SHOP_RESTOCK_INTERVAL_TICKS * 100)
    expect(capped.shops['beacon-provisioner'].stock.thyme).toBe(32)
    expect(capped.shops['beacon-provisioner'].lastRestockTick).toBe(SHOP_RESTOCK_INTERVAL_TICKS * 100)
  })

  it('normalizes malformed state and bounds replay memory', () => {
    const ids = Array.from({ length: 80 }, (_, index) => `tx:${index}`)
    const normalized = normalizeEconomy({
      openShopId: 'unknown',
      processedTransactionIds: ['', ...ids, ids.at(-1), 42],
      shops: { 'beacon-provisioner': { stock: { thyme: -9, 'olive-log': Infinity }, lastRestockTick: Infinity } },
    }, 200)
    expect(normalized.openShopId).toBeNull()
    expect(normalized.processedTransactionIds).toHaveLength(MAX_PROCESSED_TRANSACTIONS)
    expect(normalized.processedTransactionIds[0]).toBe('tx:16')
    expect(normalized.shops['beacon-provisioner'].stock.thyme).toBe(0)
    expect(normalized.shops['beacon-provisioner'].stock['olive-log']).toBe(10)
    expect(normalized.shops['beacon-provisioner'].lastRestockTick).toBe(0)
  })
})
