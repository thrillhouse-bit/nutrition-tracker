import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { consumableEffect } from '../src/rpg/itemEffects.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Alchemy had only two recipes (Dry Herbs at level 1, Herbal Salve at level
// 12) before jumping straight to Moly Tonic at level 30 — a wide gap, and
// short of the "at least five useful level bands" floor every skill needs.
// This gives it a genuine mid-tier recipe using only ingredients already
// obtainable well before level 20 (dried-herbs, itself crafted from thyme;
// sage, foraged from level 10), so it slots into the existing curve without
// depending on anything from a later act. It also fills a real gap in the
// tonic loadout slot, which previously had nothing before Moly Tonic.
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

function alchemyState(level) {
  const base = createInitialState()
  return {
    ...base,
    progression: { ...base.progression, skills: { ...base.progression.skills, alchemy: { xp: xpForLevel(level) } } },
  }
}

describe('sage-tonic item and recipe', () => {
  it('registers sage-tonic', () => {
    expect(ALL_ITEM_DEFS['sage-tonic']).toMatchObject({ id: 'sage-tonic', name: 'Sage Tonic', category: 'herb', stackable: false })
  })

  it('registers the sage-tonic recipe between herbal-salve and moly-tonic in the alchemy curve', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'sage-tonic')
    expect(recipe).toMatchObject({
      name: 'Distill Sage Tonic', skillId: 'alchemy', stationId: 'alchemy-lab', level: 20, xp: 70,
      ingredients: [{ itemId: 'dried-herbs', quantity: 2 }, { itemId: 'sage', quantity: 2 }],
      outputs: [{ itemId: 'sage-tonic', quantity: 1 }],
    })
  })

  it('gives sage-tonic a real tonic-slot consumable effect, weaker than moly-tonic', () => {
    const effect = consumableEffect('sage-tonic')
    expect(effect).toMatchObject({ activation: 'next-encounter', kind: 'tonic', slot: 'tonic' })
    expect(effect.modifiers.incomingDamageMultiplier).toBeLessThan(1)
    expect(effect.modifiers.incomingDamageMultiplier).toBeGreaterThan(consumableEffect('moly-tonic').modifiers.incomingDamageMultiplier)
  })

  it('reports zero new content-validation errors and lists sage-tonic as obtainable with no inert output', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toContain('sage-tonic')
    const inert = report.issues.filter((entry) => entry.code === 'INERT_CRAFTED_OUTPUT' && entry.reference === 'sage-tonic')
    expect(inert).toEqual([])
  })
})

describe('CRAFT reducer — distilling a sage tonic', () => {
  it('refuses below the authored level gate', () => {
    const base = alchemyState(19)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'dried-herbs', 2, ALL_ITEM_DEFS).inventory,
        'sage', 2, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab' })
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-tonic', quantity: 1 })
    expect(crafted.crafting.lastResult).toMatchObject({ ok: false, reason: 'level_too_low' })
    expect(itemQuantity(crafted.inventory, 'sage-tonic')).toBe(0)
  })

  it('refuses to craft without both ingredients carried', () => {
    let state = atMap(alchemyState(20), 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab' })
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-tonic', quantity: 1 })
    expect(crafted.crafting.lastResult.ok).toBe(false)
    expect(itemQuantity(crafted.inventory, 'sage-tonic')).toBe(0)
  })

  it('consumes exactly 2 dried-herbs and 2 sage, awards 70 Alchemy XP, and yields exactly 1 sage-tonic', () => {
    const base = alchemyState(20)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'dried-herbs', 2, ALL_ITEM_DEFS).inventory,
        'sage', 2, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-tonic', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 70 })
    expect(itemQuantity(state.inventory, 'dried-herbs')).toBe(0)
    expect(itemQuantity(state.inventory, 'sage')).toBe(0)
    expect(itemQuantity(state.inventory, 'sage-tonic')).toBe(1)
    expect(state.progression.skills.alchemy.xp).toBe(xpForLevel(20) + 70)
  })
})

describe('sage-tonic economy and consumable interaction', () => {
  it('lets Eirene sell sage-tonic at Wheat Village, alongside herbal-salve', () => {
    let state = { ...alchemyState(20), inventory: { ...alchemyState(20).inventory, currency: 500 } }
    state = atMap(state, 'wheat-village')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'wheat-village-exchange' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'sage-tonic', quantity: 1, transactionId: 'alchemy:buy-sage-tonic' })
    expect(itemQuantity(bought.inventory, 'sage-tonic')).toBe(1)

    const sold = applyEvent(bought, { type: 'SHOP_SELL', itemId: 'sage-tonic', quantity: 1, transactionId: 'alchemy:sell-sage-tonic' })
    expect(itemQuantity(sold.inventory, 'sage-tonic')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })

  it('lets a crafted sage-tonic actually be prepared as a pre-encounter tonic through the real USE_ITEM reducer path', () => {
    const base = alchemyState(20)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'dried-herbs', 2, ALL_ITEM_DEFS).inventory,
        'sage', 2, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'sage-tonic', quantity: 1 })
    expect(itemQuantity(state.inventory, 'sage-tonic')).toBe(1)

    const prepared = applyEvent(state, { type: 'USE_ITEM', itemId: 'sage-tonic' })
    expect(prepared.flags['consumable:prepared:tonic']).toBe('sage-tonic')
    expect(itemQuantity(prepared.inventory, 'sage-tonic')).toBe(0)
  })
})
