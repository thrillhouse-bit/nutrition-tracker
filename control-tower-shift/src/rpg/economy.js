// Deterministic local commerce for Oathbearer.
//
// Shops use the scalar `inventory.currency` wallet. Legacy carried/banked
// drachma item stacks are folded into that wallet by the schema-v2 migration.
// Transactions are pure, atomic, replay-safe, and driven by playtime ticks —
// never wall-clock time.

import { ALL_ITEM_DEFS } from './crafting.js'
import { addInventoryItem, removeInventoryItem } from './progression.js'

export const SHOP_RESTOCK_INTERVAL_TICKS = 1_800
export const MAX_PROCESSED_TRANSACTIONS = 64

export const SHOP_DEFS = Object.freeze({
  'beacon-provisioner': Object.freeze({
    id: 'beacon-provisioner',
    name: 'Myrrine’s Provision Table',
    merchantName: 'Myrrine',
    mapIds: Object.freeze(['beacon-overlook']),
    listings: Object.freeze({
      'barley-flatbread': Object.freeze({ itemId: 'barley-flatbread', buyPrice: 6, sellPrice: 2, baseStock: 12, maxStock: 24, restockAmount: 2 }),
      thyme: Object.freeze({ itemId: 'thyme', buyPrice: 9, sellPrice: 3, baseStock: 16, maxStock: 32, restockAmount: 3 }),
      'olive-log': Object.freeze({ itemId: 'olive-log', buyPrice: 14, sellPrice: 5, baseStock: 10, maxStock: 24, restockAmount: 2 }),
      'copper-ore': Object.freeze({ itemId: 'copper-ore', buyPrice: 18, sellPrice: 7, baseStock: 8, maxStock: 20, restockAmount: 1 }),
      compost: Object.freeze({ itemId: 'compost', buyPrice: 8, sellPrice: 3, baseStock: 12, maxStock: 24, restockAmount: 2 }),
      'barley-sheaf': Object.freeze({ itemId: 'barley-sheaf', buyPrice: 14, sellPrice: 5, baseStock: 6, maxStock: 16, restockAmount: 2 }),
      'votive-oil': Object.freeze({ itemId: 'votive-oil', buyPrice: 10, sellPrice: 4, baseStock: 10, maxStock: 20, restockAmount: 2 }),
      'votive-favor': Object.freeze({ itemId: 'votive-favor', buyPrice: 60, sellPrice: 22, baseStock: 3, maxStock: 8, restockAmount: 1 }),
      'honeyed-figs': Object.freeze({ itemId: 'honeyed-figs', buyPrice: 16, sellPrice: 6, baseStock: 8, maxStock: 18, restockAmount: 2 }),
    }),
  }),
  'pelagos-chandler': Object.freeze({
    id: 'pelagos-chandler',
    name: 'Thaleia’s Harbor Chandlery',
    merchantName: 'Thaleia',
    mapIds: Object.freeze(['pelagos-harbor']),
    listings: Object.freeze({
      'olive-plank': Object.freeze({ itemId: 'olive-plank', buyPrice: 38, sellPrice: 15, baseStock: 8, maxStock: 20, restockAmount: 2 }),
      'cedar-keel': Object.freeze({ itemId: 'cedar-keel', buyPrice: 220, sellPrice: 85, baseStock: 2, maxStock: 6, restockAmount: 1 }),
      'tuna-stew': Object.freeze({ itemId: 'tuna-stew', buyPrice: 90, sellPrice: 34, baseStock: 6, maxStock: 12, restockAmount: 1 }),
      'water-cask': Object.freeze({ itemId: 'water-cask', buyPrice: 22, sellPrice: 8, baseStock: 10, maxStock: 20, restockAmount: 2 }),
      'sea-fig': Object.freeze({ itemId: 'sea-fig', buyPrice: 40, sellPrice: 15, baseStock: 5, maxStock: 14, restockAmount: 2 }),
    }),
  }),
  'wheat-village-exchange': Object.freeze({
    id: 'wheat-village-exchange',
    name: 'Eirene’s Household Exchange',
    merchantName: 'Eirene',
    mapIds: Object.freeze(['wheat-village']),
    listings: Object.freeze({
      'grain-pottage': Object.freeze({ itemId: 'grain-pottage', buyPrice: 20, sellPrice: 8, baseStock: 10, maxStock: 24, restockAmount: 2 }),
      'herb-cake': Object.freeze({ itemId: 'herb-cake', buyPrice: 38, sellPrice: 14, baseStock: 8, maxStock: 18, restockAmount: 2 }),
      'herbal-salve': Object.freeze({ itemId: 'herbal-salve', buyPrice: 120, sellPrice: 45, baseStock: 4, maxStock: 10, restockAmount: 1 }),
      'kiln-fired-vessel': Object.freeze({ itemId: 'kiln-fired-vessel', buyPrice: 150, sellPrice: 55, baseStock: 3, maxStock: 8, restockAmount: 1 }),
    }),
  }),
  'forge-march-quartermaster': Object.freeze({
    id: 'forge-march-quartermaster',
    name: 'Doros’s March Ledger',
    merchantName: 'Doros',
    mapIds: Object.freeze(['slag-road']),
    listings: Object.freeze({
      'bronze-fittings': Object.freeze({ itemId: 'bronze-fittings', buyPrice: 75, sellPrice: 28, baseStock: 8, maxStock: 18, restockAmount: 2 }),
      'bronze-ingot': Object.freeze({ itemId: 'bronze-ingot', buyPrice: 110, sellPrice: 42, baseStock: 6, maxStock: 14, restockAmount: 1 }),
      'sacred-flame-brand': Object.freeze({ itemId: 'sacred-flame-brand', buyPrice: 300, sellPrice: 115, baseStock: 2, maxStock: 6, restockAmount: 1 }),
    }),
  }),
  'olive-road-trader': Object.freeze({
    id: 'olive-road-trader',
    name: 'Philyra’s Roadside Stall',
    merchantName: 'Philyra',
    mapIds: Object.freeze(['olive-road']),
    listings: Object.freeze({
      'tin-ore': Object.freeze({ itemId: 'tin-ore', buyPrice: 24, sellPrice: 9, baseStock: 6, maxStock: 14, restockAmount: 1 }),
      lockpick: Object.freeze({ itemId: 'lockpick', buyPrice: 16, sellPrice: 6, baseStock: 8, maxStock: 16, restockAmount: 2 }),
    }),
  }),
  'anchorage-garrison-quartermaster': Object.freeze({
    id: 'anchorage-garrison-quartermaster',
    name: 'Straton’s Garrison Stores',
    merchantName: 'Straton',
    mapIds: Object.freeze(['storm-anchorage']),
    listings: Object.freeze({
      'iron-ore': Object.freeze({ itemId: 'iron-ore', buyPrice: 60, sellPrice: 22, baseStock: 5, maxStock: 12, restockAmount: 1 }),
      'cypress-log': Object.freeze({ itemId: 'cypress-log', buyPrice: 45, sellPrice: 17, baseStock: 6, maxStock: 14, restockAmount: 1 }),
    }),
  }),
  'nyx-witness-exchange': Object.freeze({
    id: 'nyx-witness-exchange',
    name: 'Asteria’s Witness Exchange',
    merchantName: 'Asteria',
    mapIds: Object.freeze(['nyx-foothold']),
    listings: Object.freeze({
      'ash-blessing': Object.freeze({ itemId: 'ash-blessing', buyPrice: 520, sellPrice: 200, baseStock: 2, maxStock: 4, restockAmount: 1 }),
      'laurel-loom-fiber': Object.freeze({ itemId: 'laurel-loom-fiber', buyPrice: 280, sellPrice: 105, baseStock: 3, maxStock: 8, restockAmount: 1 }),
      'linen-weave': Object.freeze({ itemId: 'linen-weave', buyPrice: 190, sellPrice: 72, baseStock: 4, maxStock: 10, restockAmount: 1 }),
      'moly-tonic': Object.freeze({ itemId: 'moly-tonic', buyPrice: 360, sellPrice: 135, baseStock: 3, maxStock: 8, restockAmount: 1 }),
    }),
  }),
})

export const SHOP_IDS = Object.freeze(Object.keys(SHOP_DEFS))

function strictQuantity(value) {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null
}

function safeTick(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function validTransactionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 96
}

function baselineShopState(def, tick = 0) {
  return {
    stock: Object.fromEntries(Object.values(def.listings).map((listing) => [listing.itemId, listing.baseStock])),
    lastRestockTick: safeTick(tick),
  }
}

export function createInitialEconomy(playtimeTicks = 0) {
  const tick = safeTick(playtimeTicks)
  return {
    openShopId: null,
    shops: Object.fromEntries(SHOP_IDS.map((id) => [id, baselineShopState(SHOP_DEFS[id], tick)])),
    processedTransactionIds: [],
    transactionSequence: 0,
    lastResult: null,
  }
}

function normalizeLastResult(raw) {
  if (!raw || typeof raw !== 'object') return null
  const allowedReasons = new Set([
    'bought', 'sold', 'invalid_quantity', 'insufficient_funds', 'insufficient_stock',
    'inventory_full', 'insufficient_items', 'unsellable_item', 'overflow',
  ])
  if (!allowedReasons.has(raw.reason)) return null
  const shopId = SHOP_DEFS[raw.shopId] ? raw.shopId : null
  const itemId = ALL_ITEM_DEFS[raw.itemId] ? raw.itemId : null
  const quantity = strictQuantity(raw.quantity)
  if (!shopId || !itemId || !quantity) return null
  return {
    ok: raw.ok === true,
    reason: raw.reason,
    shopId,
    itemId,
    quantity,
    total: Number.isSafeInteger(raw.total) && raw.total >= 0 ? raw.total : 0,
  }
}

export function normalizeEconomy(raw, playtimeTicks = 0) {
  const tick = safeTick(playtimeTicks)
  const baseline = createInitialEconomy(tick)
  const shops = {}
  for (const shopId of SHOP_IDS) {
    const def = SHOP_DEFS[shopId]
    const saved = raw?.shops?.[shopId]
    const stock = {}
    for (const listing of Object.values(def.listings)) {
      const quantity = saved?.stock?.[listing.itemId]
      stock[listing.itemId] = typeof quantity === 'number' && Number.isSafeInteger(quantity)
        ? Math.max(0, Math.min(listing.maxStock, quantity))
        : listing.baseStock
    }
    shops[shopId] = {
      stock,
      lastRestockTick: Math.min(tick, safeTick(saved?.lastRestockTick)),
    }
  }
  const processedTransactionIds = Array.isArray(raw?.processedTransactionIds)
    ? [...new Set(raw.processedTransactionIds.filter(validTransactionId))].slice(-MAX_PROCESSED_TRANSACTIONS)
    : []
  return {
    ...baseline,
    openShopId: SHOP_DEFS[raw?.openShopId] ? raw.openShopId : null,
    shops,
    processedTransactionIds,
    transactionSequence: typeof raw?.transactionSequence === 'number' && Number.isSafeInteger(raw.transactionSequence) && raw.transactionSequence >= 0
      ? raw.transactionSequence
      : 0,
    lastResult: normalizeLastResult(raw?.lastResult),
  }
}

export function restockEconomy(raw, playtimeTicks = 0) {
  const tick = safeTick(playtimeTicks)
  const economy = normalizeEconomy(raw, tick)
  let changed = false
  const shops = { ...economy.shops }
  for (const shopId of SHOP_IDS) {
    const def = SHOP_DEFS[shopId]
    const current = economy.shops[shopId]
    const intervals = Math.floor((tick - current.lastRestockTick) / SHOP_RESTOCK_INTERVAL_TICKS)
    if (intervals <= 0) continue
    const stock = { ...current.stock }
    for (const listing of Object.values(def.listings)) {
      stock[listing.itemId] = Math.min(
        listing.maxStock,
        stock[listing.itemId] + intervals * listing.restockAmount,
      )
    }
    shops[shopId] = {
      stock,
      lastRestockTick: current.lastRestockTick + intervals * SHOP_RESTOCK_INTERVAL_TICKS,
    }
    changed = true
  }
  return changed ? { ...economy, shops } : economy
}

export function shopAccessDecision(mapId, shopId) {
  const shop = SHOP_DEFS[shopId]
  if (!shop) return { available: false, reason: 'Unknown merchant.' }
  const available = shop.mapIds.includes(mapId)
  return {
    available,
    reason: available ? '' : `Travel to ${shop.name} before trading.`,
    shop,
  }
}

export function quoteBuy(economy, shopId, itemId, quantity = 1) {
  const count = strictQuantity(quantity)
  const shop = SHOP_DEFS[shopId]
  const listing = shop?.listings?.[itemId]
  if (!count || !listing) return null
  const total = listing.buyPrice * count
  if (!Number.isSafeInteger(total)) return null
  const stock = economy?.shops?.[shopId]?.stock?.[itemId]
  return { unitPrice: listing.buyPrice, total, stock: Number.isSafeInteger(stock) ? stock : listing.baseStock }
}

export function quoteSell(shopId, itemId, quantity = 1) {
  const count = strictQuantity(quantity)
  const listing = SHOP_DEFS[shopId]?.listings?.[itemId]
  if (!count || !listing) return null
  const total = listing.sellPrice * count
  return Number.isSafeInteger(total) ? { unitPrice: listing.sellPrice, total } : null
}

function result(economy, ok, reason, shopId, itemId, quantity, total = 0) {
  return {
    ...economy,
    lastResult: { ok, reason, shopId, itemId, quantity, total },
  }
}

function rememberTransaction(economy, transactionId) {
  return {
    ...economy,
    processedTransactionIds: [...economy.processedTransactionIds, transactionId].slice(-MAX_PROCESSED_TRANSACTIONS),
    transactionSequence: economy.transactionSequence + 1,
  }
}

export function buyFromShop({ economy: rawEconomy, inventory, shopId, itemId, quantity, transactionId, playtimeTicks = 0 }) {
  if (!validTransactionId(transactionId)) return { economy: rawEconomy, inventory, changed: false }
  const economy = restockEconomy(rawEconomy, playtimeTicks)
  if (economy.processedTransactionIds.includes(transactionId)) return { economy: rawEconomy, inventory, changed: false }
  const count = strictQuantity(quantity)
  const quote = quoteBuy(economy, shopId, itemId, count)
  if (!count || !quote) return { economy: rawEconomy, inventory, changed: false }
  if (quote.stock < count) return { economy: result(economy, false, 'insufficient_stock', shopId, itemId, count), inventory, changed: false }
  const currency = inventory?.currency
  if (!Number.isSafeInteger(currency) || currency < quote.total) {
    return { economy: result(economy, false, 'insufficient_funds', shopId, itemId, count, quote.total), inventory, changed: false }
  }
  const added = addInventoryItem(inventory, itemId, count, ALL_ITEM_DEFS)
  if (added.added !== count) {
    return { economy: result(economy, false, 'inventory_full', shopId, itemId, count, quote.total), inventory, changed: false }
  }
  const shopState = economy.shops[shopId]
  const nextEconomy = rememberTransaction(result({
    ...economy,
    shops: {
      ...economy.shops,
      [shopId]: {
        ...shopState,
        stock: { ...shopState.stock, [itemId]: quote.stock - count },
      },
    },
  }, true, 'bought', shopId, itemId, count, quote.total), transactionId)
  return {
    economy: nextEconomy,
    inventory: { ...added.inventory, currency: currency - quote.total },
    changed: true,
  }
}

export function sellToShop({ economy: rawEconomy, inventory, shopId, itemId, quantity, transactionId, playtimeTicks = 0 }) {
  if (!validTransactionId(transactionId)) return { economy: rawEconomy, inventory, changed: false }
  const economy = restockEconomy(rawEconomy, playtimeTicks)
  if (economy.processedTransactionIds.includes(transactionId)) return { economy: rawEconomy, inventory, changed: false }
  const count = strictQuantity(quantity)
  const quote = quoteSell(shopId, itemId, count)
  if (!count || !quote) return { economy: rawEconomy, inventory, changed: false }
  const currency = inventory?.currency
  if (!Number.isSafeInteger(currency) || currency > Number.MAX_SAFE_INTEGER - quote.total) {
    return { economy: result(economy, false, 'overflow', shopId, itemId, count, quote.total), inventory, changed: false }
  }
  const removed = removeInventoryItem(inventory, itemId, count, ALL_ITEM_DEFS)
  if (removed.removed !== count) {
    return { economy: result(economy, false, 'insufficient_items', shopId, itemId, count, quote.total), inventory, changed: false }
  }
  const listing = SHOP_DEFS[shopId].listings[itemId]
  const shopState = economy.shops[shopId]
  const nextStock = Math.min(listing.maxStock, shopState.stock[itemId] + count)
  const nextEconomy = rememberTransaction(result({
    ...economy,
    shops: {
      ...economy.shops,
      [shopId]: {
        ...shopState,
        stock: { ...shopState.stock, [itemId]: nextStock },
      },
    },
  }, true, 'sold', shopId, itemId, count, quote.total), transactionId)
  return {
    economy: nextEconomy,
    inventory: { ...removed.inventory, currency: currency + quote.total },
    changed: true,
  }
}

export function validateShopDefinitions() {
  const errors = []
  for (const shop of Object.values(SHOP_DEFS)) {
    if (!shop.mapIds.length) errors.push(`shop has no map: ${shop.id}`)
    for (const listing of Object.values(shop.listings)) {
      if (!ALL_ITEM_DEFS[listing.itemId]) errors.push(`unknown shop item: ${listing.itemId}`)
      if (listing.sellPrice > listing.buyPrice) errors.push(`sell price exceeds buy price: ${listing.itemId}`)
      if (listing.baseStock > listing.maxStock) errors.push(`base stock exceeds max: ${listing.itemId}`)
    }
  }
  return errors
}
