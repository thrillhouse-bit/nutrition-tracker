// Deterministic, reducer-backed economy simulation foundation.  This is not
// release evidence: it is a narrow executable scenario which makes future
// affordability and stability assertions inspectable.

import { RECIPES, craft } from './crafting.js'
import { SHOP_DEFS, SHOP_RESTOCK_INTERVAL_TICKS, buyFromShop, createInitialEconomy, sellToShop } from './economy.js'
import { findWorldPath } from './pathfinding.js'
import { createInitialInventory, createInitialSkills, xpForLevel } from './progression.js'
import { rpgMapById } from './registry.js'
import { routeStateForMap } from './routeState.js'
import { applyEvent, createInitialState, MAX_WORLD_MOVE_STEP } from './state.js'

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

// The starting wallet is an explicit conservative test budget, not a claim
// that a fresh player has earned it.  A future release matrix must replace it
// with an authored income path before making any economy-completion claim.
const regionalDays = Array.from({ length: 26 }, (_, index) => ({
  day: index + 3,
  label: `advance regional day ${index + 3}`,
  event: { type: 'TICK', n: 300 },
}))

export const ECONOMY_SIMULATION_SCENARIOS = deepFreeze({
  'early-survival': {
    schemaVersion: 1,
    id: 'early-survival',
    seed: 4,
    days: 7,
    minimumRestockIntervals: 1,
    startingCurrency: 100,
    affordability: { foodItemId: 'barley-flatbread', maximumFoodCost: 6, craftRecipeId: 'copper-bar', maximumCraftCurrencyCost: 0 },
    itinerary: [
      { day: 1, label: 'reach copper seam', event: { type: 'MOVE', x: 780, y: 408 } },
      { day: 1, label: 'gather copper', event: { type: 'GATHER', entityId: 'copper-seam' } },
      { day: 2, label: 'resource respawn boundary', event: { type: 'TICK', n: 300 } },
      { day: 2, label: 'gather respawned copper', event: { type: 'GATHER', entityId: 'copper-seam' } },
      { day: 2, label: 'reach Beacon bank', event: { type: 'MOVE', x: 540, y: 424 } },
      { day: 2, label: 'open Beacon bank', event: { type: 'OPEN_BANK', entityId: 'beacon-bank' } },
      { day: 2, label: 'deposit copper', event: { type: 'BANK_DEPOSIT', itemId: 'copper-ore', quantity: 1 } },
      { day: 2, label: 'withdraw copper', event: { type: 'BANK_WITHDRAW', itemId: 'copper-ore', quantity: 1 } },
      { day: 2, label: 'close Beacon bank', event: { type: 'CLOSE_BANK' } },
      { day: 2, label: 'reach bronze forge', event: { type: 'MOVE', x: 692, y: 180 } },
      { day: 2, label: 'open bronze forge', event: { type: 'OPEN_CRAFTING', entityId: 'beacon-bronze-forge', stationId: 'bronze-forge' } },
      { day: 2, label: 'craft copper bar', event: { type: 'CRAFT', recipeId: 'copper-bar', quantity: 1 } },
      { day: 2, label: 'close bronze forge', event: { type: 'CLOSE_CRAFTING' } },
      { day: 2, label: 'reach provisioner', event: { type: 'MOVE', x: 642, y: 410 } },
      { day: 2, label: 'open provisioner', event: { type: 'OPEN_SHOP', entityId: 'myrrine-provisioner', shopId: 'beacon-provisioner' } },
      { day: 2, label: 'buy early food', event: { type: 'SHOP_BUY', itemId: 'barley-flatbread', quantity: 1, transactionId: 'economy-sim:food' } },
      { day: 2, label: 'close provisioner', event: { type: 'CLOSE_SHOP' } },
      { day: 2, label: 'reach Olive Road exit', event: { type: 'MOVE', x: 884, y: 404 } },
      { day: 2, label: 'traverse to Olive Road', event: { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' } },
      { day: 3, label: 'enter low-risk wilderness', event: { type: 'WILDERNESS_ENTER', regionId: 'olive-road' } },
      { day: 3, label: 'seeded wilderness step', event: { type: 'WILDERNESS_STEP', seedFromScenario: true } },
      { day: 3, label: 'start seeded wilderness combat', event: { type: 'WILDERNESS_COMBAT_START', dynamicEncounter: true } },
      { day: 3, label: 'consume purchased food in combat', event: { type: 'USE_ITEM', itemId: 'barley-flatbread', dynamicEncounter: true, useId: 'economy-sim:food-use' } },
      { day: 3, label: 'settle seeded wilderness reward', event: { type: 'WILDERNESS_VICTORY', dynamicEncounter: true, combatContributions: { damageByStyle: { spearcraft: 20 }, damageTaken: 4, guardedDamageTaken: 1 } } },
      { day: 3, label: 'leave wilderness', event: { type: 'WILDERNESS_EXIT' } },
      { day: 3, label: 'reach Beacon return', event: { type: 'MOVE', x: 80, y: 96 } },
      { day: 3, label: 'traverse to Beacon', event: { type: 'TRAVERSE', viaGate: 'to-beacon', toMapId: 'beacon-overlook', spawnId: 'start' } },
      { day: 4, label: 'advance day four', event: { type: 'TICK', n: 300 } },
      { day: 5, label: 'advance day five', event: { type: 'TICK', n: 300 } },
      { day: 6, label: 'advance day six', event: { type: 'TICK', n: 300 } },
      { day: 7, label: 'merchant restock boundary', event: { type: 'TICK', n: 600 } },
    ],
  },
  'regional-craft-trade': {
    schemaVersion: 1,
    id: 'regional-craft-trade',
    seed: 4,
    days: 28,
    minimumRestockIntervals: 4,
    startingCurrency: 1,
    affordability: { foodItemId: 'barley-flatbread', maximumFoodCost: 6, craftRecipeId: 'clay-loaf', maximumCraftCurrencyCost: 0 },
    itinerary: [
      { day: 1, label: 'reach olive tree', event: { type: 'MOVE', x: 188, y: 258 } },
      { day: 1, label: 'gather first olive log', event: { type: 'GATHER', entityId: 'olive-tree' } },
      { day: 2, label: 'olive resource respawn boundary', event: { type: 'TICK', n: 300 } },
      { day: 2, label: 'gather renewed olive log', event: { type: 'GATHER', entityId: 'olive-tree' } },
      { day: 2, label: 'reach Olive Road exit', event: { type: 'MOVE', x: 884, y: 404 } },
      { day: 2, label: 'traverse to Olive Road', event: { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' } },
      { day: 2, label: 'enter first low-risk wilderness', event: { type: 'WILDERNESS_ENTER', regionId: 'olive-road' } },
      { day: 2, label: 'first seeded wilderness step', event: { type: 'WILDERNESS_STEP', seedFromScenario: true } },
      { day: 2, label: 'start first seeded combat', event: { type: 'WILDERNESS_COMBAT_START', dynamicEncounter: true } },
      { day: 2, label: 'settle first seeded reward', event: { type: 'WILDERNESS_VICTORY', dynamicEncounter: true, combatContributions: { damageByStyle: { spearcraft: 20 }, damageTaken: 4, guardedDamageTaken: 1 } } },
      { day: 2, label: 'leave first wilderness route', event: { type: 'WILDERNESS_EXIT' } },
      { day: 2, label: 'enter second low-risk wilderness', event: { type: 'WILDERNESS_ENTER', regionId: 'olive-road' } },
      { day: 2, label: 'second seeded wilderness step', event: { type: 'WILDERNESS_STEP', seed: 8 } },
      { day: 2, label: 'start second seeded combat', event: { type: 'WILDERNESS_COMBAT_START', dynamicEncounter: true } },
      { day: 2, label: 'settle second seeded reward', event: { type: 'WILDERNESS_VICTORY', dynamicEncounter: true, combatContributions: { damageByStyle: { spearcraft: 20 }, damageTaken: 4, guardedDamageTaken: 1 } } },
      { day: 2, label: 'leave second wilderness route', event: { type: 'WILDERNESS_EXIT' } },
      { day: 2, label: 'reach roadside bank', event: { type: 'MOVE', x: 142, y: 150 } },
      { day: 2, label: 'open roadside bank', event: { type: 'OPEN_BANK', entityId: 'olive-road-waycache' } },
      { day: 2, label: 'deposit earned olive log', event: { type: 'BANK_DEPOSIT', itemId: 'olive-log', quantity: 1 } },
      { day: 2, label: 'withdraw earned olive log', event: { type: 'BANK_WITHDRAW', itemId: 'olive-log', quantity: 1 } },
      { day: 2, label: 'close roadside bank', event: { type: 'CLOSE_BANK' } },
      { day: 2, label: 'reach roadside bench', event: { type: 'MOVE', x: 332, y: 260 } },
      { day: 2, label: 'open roadside bench', event: { type: 'OPEN_CRAFTING', entityId: 'olive-road-carpenter-bench', stationId: 'woodwork-bench' } },
      { day: 2, label: 'craft regional olive plank', event: { type: 'CRAFT', recipeId: 'olive-plank', quantity: 1 } },
      { day: 2, label: 'close roadside bench', event: { type: 'CLOSE_CRAFTING' } },
      { day: 2, label: 'reach Beacon return', event: { type: 'MOVE', x: 80, y: 96 } },
      { day: 2, label: 'traverse to Beacon', event: { type: 'TRAVERSE', viaGate: 'to-beacon', toMapId: 'beacon-overlook', spawnId: 'start' } },
      { day: 2, label: 'reach provisioner', event: { type: 'MOVE', x: 642, y: 410 } },
      { day: 2, label: 'open provisioner', event: { type: 'OPEN_SHOP', entityId: 'myrrine-provisioner', shopId: 'beacon-provisioner' } },
      { day: 2, label: 'buy affordable craft input', event: { type: 'SHOP_BUY', itemId: 'barley-flatbread', quantity: 1, transactionId: 'economy-sim:regional-input' } },
      { day: 2, label: 'close provisioner', event: { type: 'CLOSE_SHOP' } },
      { day: 2, label: 'reach field kitchen', event: { type: 'MOVE', x: 452, y: 400 } },
      { day: 2, label: 'open field kitchen', event: { type: 'OPEN_CRAFTING', entityId: 'beacon-field-kitchen', stationId: 'field-kitchen' } },
      { day: 2, label: 'craft affordable clay loaf', event: { type: 'CRAFT', recipeId: 'clay-loaf', quantity: 1 } },
      { day: 2, label: 'close field kitchen', event: { type: 'CLOSE_CRAFTING' } },
      { day: 2, label: 'reach provisioner to sell', event: { type: 'MOVE', x: 642, y: 410 } },
      { day: 2, label: 'open provisioner to sell', event: { type: 'OPEN_SHOP', entityId: 'myrrine-provisioner', shopId: 'beacon-provisioner' } },
      { day: 2, label: 'sell crafted clay loaf', event: { type: 'SHOP_SELL', itemId: 'clay-loaf', quantity: 1, transactionId: 'economy-sim:regional-output' } },
      { day: 2, label: 'close provisioner after sale', event: { type: 'CLOSE_SHOP' } },
      ...regionalDays,
    ],
  },
})

function eventForStep(state, step, scenario) {
  const event = { ...step.event }
  if (event.seedFromScenario) {
    delete event.seedFromScenario
    event.seed = scenario.seed
  }
  if (event.dynamicEncounter) {
    delete event.dynamicEncounter
    const enemyId = state.wilderness?.pendingEnemyId
    const encounterKey = state.wilderness?.activeEncounterKey || (enemyId ? `${state.wilderness.regionId}:${state.wilderness.step}:${enemyId}` : null)
    if (!enemyId || !encounterKey) return null
    event.enemyId = event.enemyId || enemyId
    event.encounterKey = encounterKey
    if (event.type === 'USE_ITEM') event.encounterId = `wilderness:${encounterKey}`
  }
  return event
}

// Scenario itineraries describe destinations, not an authority bypass. Replay
// every requested movement over the same bounded, collision-aware reducer
// steps used by normal play. A missing route is an intended-action failure,
// rather than a teleport that could mask authored-world regressions.
function applyItineraryMove(state, event) {
  const map = rpgMapById(event.mapId || state.world?.mapId)
  if (!map) return null
  const path = findWorldPath(map, state.world?.position, event, {
    routeStateId: routeStateForMap(state, map),
  })
  if (!path.length) return null

  let next = state
  for (const point of path) {
    const start = next.world.position
    const distance = Math.hypot(point.x - start.x, point.y - start.y)
    const segments = Math.max(1, Math.ceil(distance / (MAX_WORLD_MOVE_STEP / 2)))
    for (let index = 1; index <= segments; index += 1) {
      const fraction = index / segments
      const moved = applyEvent(next, {
        type: 'MOVE',
        x: start.x + (point.x - start.x) * fraction,
        y: start.y + (point.y - start.y) * fraction,
        ...(Number.isFinite(event.facing) ? { facing: event.facing } : {}),
      })
      if (moved === next) return null
      next = moved
    }
  }
  return next
}

function invariantErrors(state) {
  const errors = []
  const inventory = state.inventory || {}
  if (!Number.isSafeInteger(inventory.currency) || inventory.currency < 0) errors.push('wallet is negative or unsafe')
  if ((inventory.slots || []).length > (inventory.capacity || 0)) errors.push('carried inventory exceeds capacity')
  if ((inventory.bank?.slots || []).length > (inventory.bank?.capacity || 0)) errors.push('bank exceeds capacity')
  for (const [shopId, definition] of Object.entries(SHOP_DEFS)) {
    const stock = state.economy?.shops?.[shopId]?.stock || {}
    for (const listing of Object.values(definition.listings)) {
      const value = stock[listing.itemId]
      if (!Number.isSafeInteger(value) || value < 0 || value > listing.maxStock) errors.push(`invalid stock: ${shopId}/${listing.itemId}`)
    }
  }
  return errors
}

export function enumerateDirectMerchantRoundTrips() {
  const pairs = []
  for (const [shopId, shop] of Object.entries(SHOP_DEFS)) {
    for (const listing of Object.values(shop.listings)) {
      const startingCurrency = listing.buyPrice
      const inventory = { ...createInitialInventory(), currency: startingCurrency, slots: [] }
      const bought = buyFromShop({ economy: createInitialEconomy(), inventory, shopId, itemId: listing.itemId, quantity: 1, transactionId: `economy-sim:buy:${shopId}:${listing.itemId}` })
      const sold = sellToShop({ economy: bought.economy, inventory: bought.inventory, shopId, itemId: listing.itemId, quantity: 1, transactionId: `economy-sim:sell:${shopId}:${listing.itemId}` })
      pairs.push(Object.freeze({ shopId, itemId: listing.itemId, buySucceeded: bought.changed, sellSucceeded: sold.changed, netCurrency: sold.inventory.currency - startingCurrency }))
    }
  }
  return Object.freeze(pairs)
}

// This enumerates only recipes whose complete input and output sides have a
// current merchant listing. It deliberately excludes unlisted resource-only
// recipes rather than assigning them invented values. The actual buy/craft/sell
// operations are the production domain functions, not a shadow price model.
export function enumerateMerchantListedCraftRoundTrips() {
  const listingIndex = Object.fromEntries(Object.entries(SHOP_DEFS).map(([shopId, shop]) => [shopId, shop.listings]))
  const listingsFor = (itemId) => Object.entries(listingIndex).filter(([, listings]) => listings[itemId]).map(([shopId]) => shopId)
  const routes = []
  for (const recipe of RECIPES) {
    const inputShops = recipe.ingredients.map((entry) => ({ entry, shops: listingsFor(entry.itemId) }))
    const outputShops = recipe.outputs.map((entry) => ({ entry, shops: listingsFor(entry.itemId) }))
    if (inputShops.some(({ shops }) => shops.length === 0) || outputShops.some(({ shops }) => shops.length === 0)) continue
    const startingCurrency = inputShops.reduce((total, { entry, shops }) => total + SHOP_DEFS[shops[0]].listings[entry.itemId].buyPrice * entry.quantity, 0)
    let economy = createInitialEconomy()
    let inventory = { ...createInitialInventory(), currency: startingCurrency, slots: [] }
    let bought = true
    for (const { entry, shops } of inputShops) {
      const shopId = shops[0]
      const result = buyFromShop({ economy, inventory, shopId, itemId: entry.itemId, quantity: entry.quantity, transactionId: `economy-sim:craft-buy:${recipe.id}:${entry.itemId}` })
      bought &&= result.changed
      economy = result.economy
      inventory = result.inventory
    }
    const skills = createInitialSkills()
    skills[recipe.skillId] = { xp: xpForLevel(recipe.level) }
    const crafted = craft({ inventory, skills, stationId: recipe.stationId }, recipe.id, 1)
    inventory = crafted.inventory
    let sold = crafted.result.ok
    for (const { entry, shops } of outputShops) {
      const shopId = shops[0]
      const result = sellToShop({ economy, inventory, shopId, itemId: entry.itemId, quantity: entry.quantity, transactionId: `economy-sim:craft-sell:${recipe.id}:${entry.itemId}` })
      sold &&= result.changed
      economy = result.economy
      inventory = result.inventory
    }
    routes.push(Object.freeze({ recipeId: recipe.id, skillId: recipe.skillId, stationId: recipe.stationId, inputShopIds: Object.freeze(inputShops.map(({ shops }) => shops[0])), outputShopIds: Object.freeze(outputShops.map(({ shops }) => shops[0])), inputCost: startingCurrency, outputRevenue: inventory.currency, bought, crafted: crafted.result.ok, sold, netCurrency: inventory.currency - startingCurrency }))
  }
  return Object.freeze(routes)
}

function validateScenario(scenario) {
  if (!scenario || scenario.schemaVersion !== 1 || typeof scenario.id !== 'string' || !Number.isSafeInteger(scenario.seed)
    || !Number.isSafeInteger(scenario.days) || scenario.days < 1 || !Number.isSafeInteger(scenario.startingCurrency) || scenario.startingCurrency < 0
    || !Array.isArray(scenario.itinerary)) return 'invalid scenario schema'
  if (scenario.itinerary.some((step) => !step || !Number.isSafeInteger(step.day) || step.day < 1 || step.day > scenario.days || !step.event?.type)) return 'invalid itinerary step'
  return null
}

export function runEconomySimulation({ scenario = ECONOMY_SIMULATION_SCENARIOS['early-survival'] } = {}) {
  const schemaError = validateScenario(scenario)
  if (schemaError) return Object.freeze({ ok: false, errors: Object.freeze([schemaError]), actions: Object.freeze([]), scenarioId: scenario?.id || null })
  let state = createInitialState()
  state = { ...state, inventory: { ...state.inventory, currency: scenario.startingCurrency } }
  const actions = []
  const errors = []
  for (const step of scenario.itinerary) {
    const event = eventForStep(state, step, scenario)
    const before = state
    const next = event && (event.type === 'MOVE' ? applyItineraryMove(state, event) : applyEvent(state, event))
    const accepted = Boolean(event) && next !== before
    actions.push(Object.freeze({ day: step.day, label: step.label, type: event?.type || step.event.type, accepted, event: event ? { ...event } : null, currencyAfter: next?.inventory?.currency }))
    if (!accepted) errors.push(`rejected intended action: day ${step.day} ${step.label}`)
    state = next || state
    errors.push(...invariantErrors(state))
  }
  const directRoundTrips = enumerateDirectMerchantRoundTrips()
  for (const pair of directRoundTrips) {
    if (!pair.buySucceeded || !pair.sellSucceeded || pair.netCurrency >= 0) errors.push(`direct arbitrage or failed round trip: ${pair.shopId}/${pair.itemId}`)
  }
  const merchantListedCraftRoundTrips = scenario.id === 'regional-craft-trade' ? enumerateMerchantListedCraftRoundTrips() : Object.freeze([])
  for (const route of merchantListedCraftRoundTrips) {
    if (!route.bought || !route.crafted || !route.sold || route.netCurrency > 0) errors.push(`craft arbitrage or failed route: ${route.recipeId}`)
  }
  const foodCost = SHOP_DEFS['beacon-provisioner'].listings[scenario.affordability?.foodItemId]?.buyPrice
  const peakCurrency = Math.max(scenario.startingCurrency, ...actions.map((action) => action.currencyAfter).filter(Number.isSafeInteger))
  if (!Number.isSafeInteger(foodCost) || foodCost > scenario.affordability.maximumFoodCost || peakCurrency < foodCost + scenario.affordability.maximumCraftCurrencyCost) errors.push('early affordability budget is not met')
  if (state.playtimeTicks < SHOP_RESTOCK_INTERVAL_TICKS * scenario.minimumRestockIntervals) errors.push('scenario did not reach required merchant restock intervals')
  let earnedCurrency = 0
  let spentCurrency = 0
  let priorCurrency = scenario.startingCurrency
  for (const action of actions) {
    const current = action.currencyAfter
    if (!Number.isSafeInteger(current)) continue
    const delta = current - priorCurrency
    if (delta > 0) earnedCurrency += delta
    if (delta < 0) spentCurrency += -delta
    priorCurrency = current
  }
  if (scenario.startingCurrency + earnedCurrency - spentCurrency !== state.inventory.currency) errors.push('currency reconciliation failed')
  const report = {
    schemaVersion: 1,
    scenarioId: scenario.id,
    seed: scenario.seed,
    days: scenario.days,
    startingCurrency: scenario.startingCurrency,
    actions: Object.freeze(actions),
    final: Object.freeze({ currency: state.inventory.currency, playtimeTicks: state.playtimeTicks, mapId: state.world.mapId, pendingEnemyId: state.wilderness.pendingEnemyId, stock: state.economy.shops['beacon-provisioner'].stock['barley-flatbread'] }),
    directRoundTrips,
    merchantListedCraftRoundTrips,
    currencyReconciliation: Object.freeze({ declaredCurrency: scenario.startingCurrency, earnedCurrency, spentCurrency, finalCurrency: state.inventory.currency }),
    errors: Object.freeze([...new Set(errors)]),
  }
  return Object.freeze({ ...report, ok: report.errors.length === 0 })
}
