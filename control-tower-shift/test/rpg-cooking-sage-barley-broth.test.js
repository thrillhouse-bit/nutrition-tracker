import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { consumableEffect } from '../src/rpg/itemEffects.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Cooking had the same wide-gap problem Alchemy just had: Grain Pottage at
// level 1, Herb Cake at level 5, then straight to Tuna Stew at level 25.
// This gives it a mid-tier recipe at Wheat Village's own hearth — the same
// station Tuna Stew already uses — with a heal value that genuinely sits
// between Herb Cake and Tuna Stew rather than a token addition. Ingredients
// (barley-sheaf, sage) are the same two already proven obtainable well
// before their consuming recipe's level by the Alchemy Sage Tonic checkpoint.
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
  const endpoint = findWorldPath(map, state.world.position, entity).at(-1)
  const near = { ...state, world: { ...state.world, position: { x: endpoint.x, y: endpoint.y } } }
  const payload = isStation ? { stationId: systemId } : isShop ? { shopId: systemId } : {}
  const type = isStation ? 'OPEN_CRAFTING' : isShop ? 'OPEN_SHOP' : 'OPEN_BANK'
  return applyEvent(near, { type, entityId: entity.id, ...payload })
}

function cookingState(level) {
  const base = createInitialState()
  return {
    ...base,
    progression: { ...base.progression, skills: { ...base.progression.skills, cooking: { xp: xpForLevel(level) } } },
  }
}

describe('sage-barley-broth item and recipe', () => {
  it('registers sage-barley-broth', () => {
    expect(ALL_ITEM_DEFS['sage-barley-broth']).toMatchObject({ id: 'sage-barley-broth', name: 'Sage-Barley Broth', category: 'food', stackable: false })
  })

  it('registers the sage-barley-broth recipe between herb-cake and tuna-stew in the cooking curve', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'sage-barley-broth')
    expect(recipe).toMatchObject({
      name: 'Simmer Sage-Barley Broth', skillId: 'cooking', stationId: 'hearth', level: 12, xp: 40,
      ingredients: [{ itemId: 'barley-sheaf', quantity: 2 }, { itemId: 'sage', quantity: 1 }],
      outputs: [{ itemId: 'sage-barley-broth', quantity: 1 }],
    })
  })

  it('heals for a real amount that sits between herb-cake and tuna-stew', () => {
    const effect = consumableEffect('sage-barley-broth')
    expect(effect).toMatchObject({ activation: 'combat', kind: 'heal' })
    expect(effect.heal).toBeGreaterThan(consumableEffect('herb-cake').heal)
    expect(effect.heal).toBeLessThan(consumableEffect('tuna-stew').heal)
  })

  it('reports zero new content-validation errors and lists sage-barley-broth as obtainable with no inert output', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toContain('sage-barley-broth')
    const inert = report.issues.filter((entry) => entry.code === 'INERT_CRAFTED_OUTPUT' && entry.reference === 'sage-barley-broth')
    expect(inert).toEqual([])
  })
})

describe('CRAFT reducer — simmering a sage-barley broth', () => {
  it('refuses below the authored level gate', () => {
    const base = cookingState(11)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'barley-sheaf', 2, ALL_ITEM_DEFS).inventory,
        'sage', 1, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'wheat-village')
    state = systemOpenNear(state, 'station', 'hearth')
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-barley-broth', quantity: 1 })
    expect(crafted.crafting.lastResult).toMatchObject({ ok: false, reason: 'level_too_low' })
    expect(itemQuantity(crafted.inventory, 'sage-barley-broth')).toBe(0)
  })

  it('refuses to craft without both ingredients carried', () => {
    let state = atMap(cookingState(12), 'wheat-village')
    state = systemOpenNear(state, 'station', 'hearth')
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-barley-broth', quantity: 1 })
    expect(crafted.crafting.lastResult.ok).toBe(false)
    expect(itemQuantity(crafted.inventory, 'sage-barley-broth')).toBe(0)
  })

  it('refuses away from Wheat Village, where the hearth actually is', () => {
    const base = cookingState(12)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'barley-sheaf', 2, ALL_ITEM_DEFS).inventory,
        'sage', 1, ALL_ITEM_DEFS,
      ).inventory,
    }
    const state = atMap(withIngredients, 'beacon-overlook')
    const open = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'hearth' })
    expect(open).toBe(state)
  })

  it('consumes exactly 2 barley-sheaf and 1 sage, awards 40 Cooking XP, and yields exactly 1 sage-barley-broth', () => {
    const base = cookingState(12)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'barley-sheaf', 2, ALL_ITEM_DEFS).inventory,
        'sage', 1, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'wheat-village')
    state = systemOpenNear(state, 'station', 'hearth')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-barley-broth', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 40 })
    expect(itemQuantity(state.inventory, 'barley-sheaf')).toBe(0)
    expect(itemQuantity(state.inventory, 'sage')).toBe(0)
    expect(itemQuantity(state.inventory, 'sage-barley-broth')).toBe(1)
    expect(state.progression.skills.cooking.xp).toBe(xpForLevel(12) + 40)
  })
})

describe('sage-barley-broth economy interaction', () => {
  it('lets Eirene sell sage-barley-broth at Wheat Village, alongside herb-cake', () => {
    let state = { ...cookingState(12), inventory: { ...cookingState(12).inventory, currency: 500 } }
    state = atMap(state, 'wheat-village')
    state = systemOpenNear(state, 'shop', 'wheat-village-exchange')
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'sage-barley-broth', quantity: 1, transactionId: 'cooking:buy-broth' })
    expect(itemQuantity(bought.inventory, 'sage-barley-broth')).toBe(1)

    const sold = applyEvent(bought, { type: 'SHOP_SELL', itemId: 'sage-barley-broth', quantity: 1, transactionId: 'cooking:sell-broth' })
    expect(itemQuantity(sold.inventory, 'sage-barley-broth')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })

  it('lets a real player forage sage at Wheat Village and cook it into broth at the hearth — the exact loop this closes', () => {
    // barley-sheaf is Stewardship's own Act I gather (rpg-stewardship-fallow-field.test.js
    // already proves that source); this test focuses on the new part — sage
    // foraged right on the same map as the hearth that consumes it.
    const base = cookingState(12)
    const withBarley = { ...base, inventory: addInventoryItem(base.inventory, 'barley-sheaf', 2, ALL_ITEM_DEFS).inventory }
    const forageState = {
      ...withBarley,
      progression: { ...withBarley.progression, skills: { ...withBarley.progression.skills, foraging: { xp: xpForLevel(10) } } },
    }
    const map = rpgMapById('wheat-village')
    const sage = map.entities.find((entity) => entity.id === 'wheat-village-sage')
    let state = atMap(forageState, 'wheat-village', findWorldPath(map, map.spawn, sage).at(-1))
    state = applyEvent(state, { type: 'GATHER', entityId: 'wheat-village-sage' })
    expect(itemQuantity(state.inventory, 'sage')).toBe(1)

    state = systemOpenNear(state, 'station', 'hearth')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-barley-broth', quantity: 1 })
    expect(itemQuantity(state.inventory, 'sage-barley-broth')).toBe(1)
  })
})
