import { describe, expect, it } from 'vitest'
import { SHOP_RESTOCK_INTERVAL_TICKS } from '../src/rpg/economy.js'
import { ECONOMY_SIMULATION_SCENARIOS, enumerateDirectMerchantRoundTrips, enumerateMerchantListedCraftRoundTrips, runEconomySimulation } from '../src/rpg/economySimulation.js'

describe('early-survival economy simulation', () => {
  it('is a frozen seven-day reducer-backed scenario with a conservative explicit budget', () => {
    const scenario = ECONOMY_SIMULATION_SCENARIOS['early-survival']
    expect(Object.isFrozen(scenario)).toBe(true)
    expect(scenario.days).toBe(7)
    expect(scenario.startingCurrency).toBe(100)
    expect(scenario.affordability).toMatchObject({ foodItemId: 'barley-flatbread', maximumFoodCost: 6, maximumCraftCurrencyCost: 0 })
  })

  it('is byte-identical for the same seed and completes each intended production action', () => {
    const first = runEconomySimulation()
    const second = runEconomySimulation()
    expect(first.ok, first.errors.join('\n')).toBe(true)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.actions.every((action) => action.accepted)).toBe(true)
    expect(first.final.playtimeTicks).toBe(SHOP_RESTOCK_INTERVAL_TICKS)
    expect(first.final.currency).toBeGreaterThanOrEqual(0)
    // Flatbread starts at 12, the scenario buys one, then its live listing
    // restocks two at tick 1800: this distinguishes the boundary from a
    // generic later-time stock check.
    expect(first.final.stock).toBe(13)
  })

  it('keeps the seed limited to the wilderness portion of an otherwise identical itinerary', () => {
    const base = ECONOMY_SIMULATION_SCENARIOS['early-survival']
    const changed = { ...base, seed: 8 }
    const first = runEconomySimulation({ scenario: base })
    const second = runEconomySimulation({ scenario: changed })
    expect(second.ok, second.errors.join('\n')).toBe(true)
    // Reward value is intentionally allowed to flow into later wallet snapshots;
    // only the non-wilderness action plan and its reducer acceptance must stay
    // seed-independent.
    const nonWilderness = (report) => report.actions
      .filter((action) => !action.type.startsWith('WILDERNESS') && action.type !== 'USE_ITEM')
      .map(({ day, label, type, accepted, event }) => ({ day, label, type, accepted, event }))
    expect(nonWilderness(first)).toEqual(nonWilderness(second))
    expect(first.actions.find((action) => action.label === 'seeded wilderness step').event.seed).toBe(4)
    expect(second.actions.find((action) => action.label === 'seeded wilderness step').event.seed).toBe(8)
  })

  it('derives direct buy-sell losses from the live merchant transaction functions', () => {
    const pairs = enumerateDirectMerchantRoundTrips()
    expect(pairs.length).toBeGreaterThan(0)
    for (const pair of pairs) {
      expect(pair.buySucceeded, `${pair.shopId}/${pair.itemId}`).toBe(true)
      expect(pair.sellSucceeded, `${pair.shopId}/${pair.itemId}`).toBe(true)
      expect(pair.netCurrency, `${pair.shopId}/${pair.itemId}`).toBeLessThan(0)
    }
  })

  it('fails closed for a tampered impossible itinerary', () => {
    const base = ECONOMY_SIMULATION_SCENARIOS['early-survival']
    const impossible = {
      ...base,
      itinerary: [...base.itinerary, { day: 7, label: 'forged remote purchase', event: { type: 'SHOP_BUY', itemId: 'thyme', quantity: 1, transactionId: 'economy-sim:forged' } }],
    }
    const report = runEconomySimulation({ scenario: impossible })
    expect(report.ok).toBe(false)
    expect(report.errors).toContain('rejected intended action: day 7 forged remote purchase')
  })
})

describe('regional craft-trade economy simulation', () => {
  it('is deterministic, self-funds its operating purchase, renews resources, and crosses four merchant restocks', () => {
    const scenario = ECONOMY_SIMULATION_SCENARIOS['regional-craft-trade']
    const first = runEconomySimulation({ scenario })
    const second = runEconomySimulation({ scenario })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.actions.every((action) => action.accepted)).toBe(true)
    expect(first.final.playtimeTicks).toBeGreaterThanOrEqual(SHOP_RESTOCK_INTERVAL_TICKS * 4)
    expect(first.final.stock).toBeLessThanOrEqual(24)
    expect(first.final.currency).toBeGreaterThanOrEqual(0)
    expect(first.currencyReconciliation).toEqual({ declaredCurrency: 1, earnedCurrency: 11, spentCurrency: 6, finalCurrency: 6 })
    expect(first.actions.some((action) => action.label === 'gather renewed olive log' && action.accepted)).toBe(true)
    expect(first.actions.some((action) => action.label === 'buy affordable craft input' && action.accepted)).toBe(true)
  })

  it('keeps every merchant-listed craft route non-positive', () => {
    const report = runEconomySimulation({ scenario: ECONOMY_SIMULATION_SCENARIOS['regional-craft-trade'] })
    expect(report.ok, report.errors.join('\n')).toBe(true)
    const routes = enumerateMerchantListedCraftRoundTrips()
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((route) => route.netCurrency <= 0)).toBe(true)
    expect(routes).toEqual(expect.arrayContaining([expect.objectContaining({
      recipeId: 'votive-offering', skillId: 'devotion', stationId: 'votive-stand',
      inputCost: 10, outputRevenue: 9, netCurrency: -1,
    })]))
  })

  it('rejects a tampered regional itinerary rather than silently dropping an intended action', () => {
    const base = ECONOMY_SIMULATION_SCENARIOS['regional-craft-trade']
    const tampered = { ...base, itinerary: [...base.itinerary, { day: 28, label: 'forged regional sale', event: { type: 'SHOP_SELL', itemId: 'olive-plank', quantity: 1, transactionId: 'economy-sim:forged-regional' } }] }
    const report = runEconomySimulation({ scenario: tampered })
    expect(report.errors).toContain('rejected intended action: day 28 forged regional sale')
  })
})
