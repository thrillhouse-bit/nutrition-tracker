import { describe, expect, it } from 'vitest'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { ACT3_SEASONAL_STATES } from '../src/rpg/act3Content.js'
import { ACT4_PRESSURE_RULES } from '../src/rpg/act4Content.js'
import { ACT5_LIGHT_POLARITY_RULES } from '../src/rpg/act5Content.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import {
  SHOP_DEFS,
  SHOP_RESTOCK_INTERVAL_TICKS,
  buyFromShop,
  createInitialEconomy,
  quoteBuy,
  quoteSell,
  restockEconomy,
  sellToShop,
  validateShopDefinitions,
} from '../src/rpg/economy.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { createInitialInventory } from '../src/rpg/progression.js'
import { REGISTERED_MAPS } from '../src/rpg/registry.js'

const REGIONAL_SHOP_IDS = [
  'forge-march-quartermaster',
  'nyx-witness-exchange',
  'pelagos-chandler',
  'wheat-village-exchange',
]

const CRAFTED_SINK_ITEMS = [
  'ambrosia-distillate',
  'ash-blessing',
  'bronze-fittings',
  'bronze-ingot',
  'cedar-keel',
  'copper-wire',
  'grain-pottage',
  'herb-cake',
  'herbal-salve',
  'kiln-fired-vessel',
  'laurel-loom-fiber',
  'linen-weave',
  'moly-tonic',
  'olive-figurehead',
  'olive-plank',
  'sacred-flame-brand',
  'sage-barley-broth',
  'sage-tonic',
  'tuna-stew',
  'woven-tape',
]

// Stewardship's Act II tier added a second-tier raw material (water-cask,
// the restore cost) and its gathered crop (sea-fig) to Thaleia's chandlery.
// Neither is a crafted output, so they sit outside CRAFTED_SINK_ITEMS above
// without changing what that list is verifying.
const NON_CRAFTED_STEWARDSHIP_LISTINGS = ['sea-fig', 'water-cask', 'spiced-must', 'threshed-grain', 'ration-water', 'camp-forage', 'shadow-lantern-oil', 'night-forage']

const MERCHANT_ENTITY_IDS = new Set([
  'thaleia-harbor-chandler',
  'eirene-household-steward',
  'doros-march-quartermaster',
  'asteria-witness-broker',
])

const ROUTE_STATES_BY_MAP = {
  'pelagos-harbor': ACT2_TIDE_ORDER,
  'wheat-village': Object.keys(ACT3_SEASONAL_STATES),
  'slag-road': ACT4_PRESSURE_RULES.states,
  'nyx-foothold': ACT5_LIGHT_POLARITY_RULES.stateIds,
}

function regionalMerchants() {
  return Object.values(REGISTERED_MAPS).flatMap((map) => (
    (map.entities || [])
      .filter((entity) => MERCHANT_ENTITY_IDS.has(entity.id))
      .map((entity) => ({ map, entity }))
  ))
}

describe('regional merchant network', () => {
  it('splits all crafted sinks across four specialized, valid inventories', () => {
    expect(validateShopDefinitions()).toEqual([])
    const listed = []
    for (const shopId of REGIONAL_SHOP_IDS) {
      const shop = SHOP_DEFS[shopId]
      expect(shop).toBeTruthy()
      expect(Object.keys(shop.listings).length).toBeGreaterThanOrEqual(3)
      expect(Object.keys(shop.listings).length).toBeLessThan(CRAFTED_SINK_ITEMS.length)
      for (const listing of Object.values(shop.listings)) {
        expect(ALL_ITEM_DEFS[listing.itemId], `${shopId}:${listing.itemId}`).toBeTruthy()
        expect(listing.buyPrice).toBeGreaterThan(listing.sellPrice)
        expect(listing.sellPrice).toBeGreaterThan(0)
        expect(listing.baseStock).toBeGreaterThan(0)
        expect(listing.maxStock).toBeGreaterThanOrEqual(listing.baseStock)
        expect(listing.restockAmount).toBeGreaterThan(0)
        expect(quoteBuy(createInitialEconomy(), shopId, listing.itemId, 1)).toBeTruthy()
        expect(quoteSell(shopId, listing.itemId, 1)).toBeTruthy()
        listed.push(listing.itemId)
      }
    }
    expect(listed.filter((itemId) => !NON_CRAFTED_STEWARDSHIP_LISTINGS.includes(itemId)).sort()).toEqual(CRAFTED_SINK_ITEMS)
    expect(listed).toEqual(expect.arrayContaining(NON_CRAFTED_STEWARDSHIP_LISTINGS))
  })

  it('places one distinct, reachable merchant in each of Acts II through V', () => {
    const merchants = regionalMerchants()
    expect(merchants.map(({ entity }) => entity.shopId).sort()).toEqual(REGIONAL_SHOP_IDS)
    expect(merchants.map(({ map }) => map.act).sort()).toEqual([2, 3, 4, 5])

    for (const { map, entity } of merchants) {
      expect(SHOP_DEFS[entity.shopId].mapIds).toContain(map.id)
      for (const routeStateId of ROUTE_STATES_BY_MAP[map.id]) {
        for (const spawn of Object.values(map.spawns)) {
          const path = findWorldPath(map, spawn, entity, { routeStateId })
          expect(path.length, `${map.id}:${spawn.id}->${entity.id}@${routeStateId}`).toBeGreaterThan(0)
          expect(
            Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y),
            `${map.id}:${spawn.id}->${entity.id}@${routeStateId} interaction distance`,
          ).toBeLessThan(56)
        }
      }

      for (const sibling of [...map.entities, ...map.exits]) {
        if (sibling === entity) continue
        expect(
          Math.hypot(entity.x - sibling.x, entity.y - sibling.y),
          `${map.id}:${entity.id}<->${sibling.id}`,
        ).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('buys and sells every crafted output atomically and rejects replay', () => {
    let economy = createInitialEconomy()
    let inventory = { ...createInitialInventory(), currency: 100_000 }
    let expectedCurrency = inventory.currency
    let firstBuy = null

    for (const shopId of REGIONAL_SHOP_IDS) {
      for (const listing of Object.values(SHOP_DEFS[shopId].listings)) {
        const buyTransactionId = `regional:buy:${shopId}:${listing.itemId}`
        const bought = buyFromShop({
          economy, inventory, shopId, itemId: listing.itemId, quantity: 1,
          transactionId: buyTransactionId, playtimeTicks: 0,
        })
        expect(bought.changed, buyTransactionId).toBe(true)
        expectedCurrency -= listing.buyPrice
        expect(bought.inventory.currency).toBe(expectedCurrency)
        if (!firstBuy) firstBuy = { economy: bought.economy, inventory: bought.inventory, shopId, itemId: listing.itemId, transactionId: buyTransactionId }
        economy = bought.economy
        inventory = bought.inventory

        const sellTransactionId = `regional:sell:${shopId}:${listing.itemId}`
        const sold = sellToShop({
          economy, inventory, shopId, itemId: listing.itemId, quantity: 1,
          transactionId: sellTransactionId, playtimeTicks: 0,
        })
        expect(sold.changed, sellTransactionId).toBe(true)
        expectedCurrency += listing.sellPrice
        expect(sold.inventory.currency).toBe(expectedCurrency)
        expect(sold.economy.shops[shopId].stock[listing.itemId]).toBe(listing.baseStock)
        economy = sold.economy
        inventory = sold.inventory
      }
    }

    const replay = buyFromShop({
      economy, inventory, shopId: firstBuy.shopId, itemId: firstBuy.itemId,
      quantity: 1, transactionId: firstBuy.transactionId, playtimeTicks: 0,
    })
    expect(replay.changed).toBe(false)
    expect(replay.economy).toBe(economy)
    expect(replay.inventory).toBe(inventory)
  })

  it('restocks every regional listing only from deterministic playtime intervals', () => {
    const depleted = createInitialEconomy(0)
    for (const shopId of REGIONAL_SHOP_IDS) {
      for (const itemId of Object.keys(SHOP_DEFS[shopId].listings)) depleted.shops[shopId].stock[itemId] = 0
    }

    const before = restockEconomy(depleted, SHOP_RESTOCK_INTERVAL_TICKS - 1)
    const after = restockEconomy(depleted, SHOP_RESTOCK_INTERVAL_TICKS * 3)
    const repeated = restockEconomy(depleted, SHOP_RESTOCK_INTERVAL_TICKS * 3)
    expect(JSON.stringify(after)).toBe(JSON.stringify(repeated))

    for (const shopId of REGIONAL_SHOP_IDS) {
      expect(after.shops[shopId].lastRestockTick).toBe(SHOP_RESTOCK_INTERVAL_TICKS * 3)
      for (const listing of Object.values(SHOP_DEFS[shopId].listings)) {
        expect(before.shops[shopId].stock[listing.itemId]).toBe(0)
        expect(after.shops[shopId].stock[listing.itemId]).toBe(
          Math.min(listing.maxStock, listing.restockAmount * 3),
        )
      }
    }
  })

  it('closes the inert-output and unplaced-shop validator gaps', () => {
    const report = validateRPGContent()
    expect(report.issues.filter((issue) => issue.code === 'INERT_CRAFTED_OUTPUT')).toEqual([])
    expect(report.issues.filter((issue) => issue.code === 'UNPLACED_SHOP')).toEqual([])
  })
})
