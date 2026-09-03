import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { consumableEffect } from '../src/rpg/itemEffects.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Cooking had two remaining problems. First, clay-loaf: a complete item
// definition with a real food-heal effect already written in
// itemEffects.js, but — like ambrosia-distillate before it — no recipe or
// shop referenced it at all, another find from the same orphan audit.
// Second, hippocamp-roe: a level-75 mastery fishing catch with zero
// culinary use anywhere, despite being the single rarest ingredient in the
// game. This closes both: a cheap level-1 alternative to Grain Pottage, and
// a genuine mastery-tier feast pairing hippocamp-roe with ambrosia-bloom —
// giving Cooking its fifth level band (1/1/5/12/25/60) to match the same
// 5-tier floor Alchemy just reached.
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

function cookingState(level) {
  const base = createInitialState()
  return {
    ...base,
    progression: { ...base.progression, skills: { ...base.progression.skills, cooking: { xp: xpForLevel(level) } } },
  }
}

describe('clay-loaf recipe', () => {
  it('registers the recipe with the exact contract', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'clay-loaf')
    expect(recipe).toMatchObject({
      name: 'Bake Clay-Oven Loaf', skillId: 'cooking', stationId: 'field-kitchen', level: 1, xp: 8,
      ingredients: [{ itemId: 'barley-flatbread', quantity: 1 }],
      outputs: [{ itemId: 'clay-loaf', quantity: 1 }],
    })
  })

  it('lets a real player buy barley-flatbread at Myrrine\'s, bake a loaf, and sell it back — all at Beacon Overlook', () => {
    let state = { ...cookingState(1), inventory: { ...cookingState(1).inventory, currency: 100 } }
    state = atMap(state, 'beacon-overlook')
    const startingFlatbread = itemQuantity(state.inventory, 'barley-flatbread')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    state = applyEvent(state, { type: 'SHOP_BUY', itemId: 'barley-flatbread', quantity: 1, transactionId: 'cooking:buy-flatbread' })
    expect(itemQuantity(state.inventory, 'barley-flatbread')).toBe(startingFlatbread + 1)

    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'field-kitchen' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'clay-loaf', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 8 })
    expect(itemQuantity(state.inventory, 'clay-loaf')).toBe(1)

    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    const sold = applyEvent(state, { type: 'SHOP_SELL', itemId: 'clay-loaf', quantity: 1, transactionId: 'cooking:sell-loaf' })
    expect(itemQuantity(sold.inventory, 'clay-loaf')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })
})

describe('ambrosial-roe-feast (Cooking\'s fifth tier)', () => {
  it('registers the recipe with the exact contract', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'ambrosial-roe-feast')
    expect(recipe).toMatchObject({
      name: 'Prepare Ambrosial Roe Feast', skillId: 'cooking', stationId: 'field-kitchen', level: 60, xp: 260,
      ingredients: [{ itemId: 'hippocamp-roe', quantity: 1 }, { itemId: 'ambrosia-bloom', quantity: 1 }],
      outputs: [{ itemId: 'ambrosial-roe-feast', quantity: 1 }],
    })
  })

  it('gives Cooking exactly five distinct level bands', () => {
    const cookingLevels = new Set(RECIPES.filter((recipe) => recipe.skillId === 'cooking').map((recipe) => recipe.level))
    expect(cookingLevels).toEqual(new Set([1, 5, 12, 25, 60]))
  })

  it('heals for more than every other cooked food, closing hippocamp-roe\'s culinary gap', () => {
    const effect = consumableEffect('ambrosial-roe-feast')
    expect(effect).toMatchObject({ activation: 'combat', kind: 'heal' })
    expect(effect.heal).toBeGreaterThan(consumableEffect('tuna-stew').heal)
  })

  it('reports zero new content-validation errors and lists both items as obtainable with no inert output', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['clay-loaf', 'ambrosial-roe-feast']))
    const inert = report.issues.filter((entry) => entry.code === 'INERT_CRAFTED_OUTPUT' && ['clay-loaf', 'ambrosial-roe-feast'].includes(entry.reference))
    expect(inert).toEqual([])
  })

  it('refuses below the authored level gate', () => {
    const base = cookingState(59)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'hippocamp-roe', 1, ALL_ITEM_DEFS).inventory,
        'ambrosia-bloom', 1, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'nyx-foothold')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'field-kitchen' })
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'ambrosial-roe-feast', quantity: 1 })
    expect(crafted.crafting.lastResult).toMatchObject({ ok: false, reason: 'level_too_low' })
    expect(itemQuantity(crafted.inventory, 'ambrosial-roe-feast')).toBe(0)
  })

  it('consumes exactly 1 hippocamp-roe and 1 ambrosia-bloom, awards 260 Cooking XP, and yields exactly 1 feast', () => {
    const base = cookingState(60)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'hippocamp-roe', 1, ALL_ITEM_DEFS).inventory,
        'ambrosia-bloom', 1, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'nyx-foothold')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'field-kitchen' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'ambrosial-roe-feast', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 260 })
    expect(itemQuantity(state.inventory, 'hippocamp-roe')).toBe(0)
    expect(itemQuantity(state.inventory, 'ambrosia-bloom')).toBe(0)
    expect(itemQuantity(state.inventory, 'ambrosial-roe-feast')).toBe(1)
    expect(state.progression.skills.cooking.xp).toBe(xpForLevel(60) + 260)
  })

  it('lets Asteria sell the feast at Nyx Foothold, above every other cooked food', () => {
    let state = { ...cookingState(60), inventory: { ...cookingState(60).inventory, currency: 2000 } }
    state = atMap(state, 'nyx-foothold')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'nyx-witness-exchange' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'ambrosial-roe-feast', quantity: 1, transactionId: 'cooking:buy-feast' })
    expect(itemQuantity(bought.inventory, 'ambrosial-roe-feast')).toBe(1)

    const sold = applyEvent(bought, { type: 'SHOP_SELL', itemId: 'ambrosial-roe-feast', quantity: 1, transactionId: 'cooking:sell-feast' })
    expect(itemQuantity(sold.inventory, 'ambrosial-roe-feast')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })
})
