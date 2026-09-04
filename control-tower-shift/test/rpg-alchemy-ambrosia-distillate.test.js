import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { consumableEffect } from '../src/rpg/itemEffects.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// ambrosia-distillate had a real tonic-slot consumable effect defined in
// itemEffects.js and a full item entry in crafting.js's ITEM_EXTENSIONS, but
// no recipe produced it and no shop sold it — it was completely unobtainable
// anywhere in the game, exactly the class of silent gap
// content-validation's own obtainability check does not catch for an item
// with no referencing recipe at all (it only checks ingredients recipes
// already declare). This closes it with a genuine mastery-tier Alchemy
// recipe — distilling a crafted Moly Tonic further with more ambrosia bloom
// — which also gives Alchemy its fifth level band (1/12/20/30/45),
// completing the same 5-tier floor every gathering skill already has.
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

describe('ambrosia-distillate recipe', () => {
  it('registers the ambrosia-distillate recipe as Alchemy\'s fifth tier, above moly-tonic', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'ambrosia-distillate')
    expect(recipe).toMatchObject({
      name: 'Distill Ambrosia', skillId: 'alchemy', stationId: 'alchemy-lab', level: 45, xp: 160,
      ingredients: [{ itemId: 'moly-tonic', quantity: 1 }, { itemId: 'ambrosia-bloom', quantity: 2 }],
      outputs: [{ itemId: 'ambrosia-distillate', quantity: 1 }],
    })
  })

  it('gives Alchemy exactly five distinct level bands', () => {
    const alchemyLevels = new Set(RECIPES.filter((recipe) => recipe.skillId === 'alchemy').map((recipe) => recipe.level))
    expect(alchemyLevels).toEqual(new Set([1, 12, 20, 30, 45]))
  })

  it('has its pre-existing tonic-slot consumable effect, now genuinely reachable', () => {
    const effect = consumableEffect('ambrosia-distillate')
    expect(effect).toMatchObject({ activation: 'next-encounter', kind: 'tonic', slot: 'tonic', modifiers: { maxHealthBonus: 25, statusWard: 'Ambrosial vigor' } })
  })

  it('reports zero new content-validation errors and lists ambrosia-distillate as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toContain('ambrosia-distillate')
  })
})

describe('CRAFT reducer — distilling ambrosia', () => {
  it('refuses below the authored level gate', () => {
    const base = alchemyState(44)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'moly-tonic', 1, ALL_ITEM_DEFS).inventory,
        'ambrosia-bloom', 2, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'alchemy-lab')
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'ambrosia-distillate', quantity: 1 })
    expect(crafted.crafting.lastResult).toMatchObject({ ok: false, reason: 'level_too_low' })
    expect(itemQuantity(crafted.inventory, 'ambrosia-distillate')).toBe(0)
  })

  it('refuses to craft without both ingredients carried', () => {
    let state = atMap(alchemyState(45), 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'alchemy-lab')
    const crafted = applyEvent(state, { type: 'CRAFT', recipeId: 'ambrosia-distillate', quantity: 1 })
    expect(crafted.crafting.lastResult.ok).toBe(false)
    expect(itemQuantity(crafted.inventory, 'ambrosia-distillate')).toBe(0)
  })

  it('consumes exactly 1 moly-tonic and 2 ambrosia-bloom, awards 160 Alchemy XP, and yields exactly 1 ambrosia-distillate', () => {
    const base = alchemyState(45)
    const withIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'moly-tonic', 1, ALL_ITEM_DEFS).inventory,
        'ambrosia-bloom', 2, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withIngredients, 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'alchemy-lab')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'ambrosia-distillate', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 160 })
    expect(itemQuantity(state.inventory, 'moly-tonic')).toBe(0)
    expect(itemQuantity(state.inventory, 'ambrosia-bloom')).toBe(0)
    expect(itemQuantity(state.inventory, 'ambrosia-distillate')).toBe(1)
    expect(state.progression.skills.alchemy.xp).toBe(xpForLevel(45) + 160)
  })
})

describe('ambrosia-distillate economy and full alchemy chain', () => {
  it('lets Asteria sell ambrosia-distillate at Nyx Foothold, above moly-tonic in price', () => {
    let state = { ...alchemyState(45), inventory: { ...alchemyState(45).inventory, currency: 2000 } }
    state = atMap(state, 'nyx-foothold')
    state = systemOpenNear(state, 'shop', 'nyx-witness-exchange')
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'ambrosia-distillate', quantity: 1, transactionId: 'alchemy:buy-distillate' })
    expect(itemQuantity(bought.inventory, 'ambrosia-distillate')).toBe(1)

    const sold = applyEvent(bought, { type: 'SHOP_SELL', itemId: 'ambrosia-distillate', quantity: 1, transactionId: 'alchemy:sell-distillate' })
    expect(itemQuantity(sold.inventory, 'ambrosia-distillate')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })

  it('lets a real player craft moly-tonic, then refine it further into ambrosia-distillate — the full alchemy chain this closes', () => {
    const base = alchemyState(45)
    const withRawIngredients = {
      ...base,
      inventory: addInventoryItem(
        addInventoryItem(base.inventory, 'moly', 2, ALL_ITEM_DEFS).inventory,
        'ambrosia-bloom', 3, ALL_ITEM_DEFS,
      ).inventory,
    }
    let state = atMap(withRawIngredients, 'beacon-overlook')
    state = systemOpenNear(state, 'station', 'alchemy-lab')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'moly-tonic', quantity: 1 })
    expect(itemQuantity(state.inventory, 'moly-tonic')).toBe(1)
    expect(itemQuantity(state.inventory, 'ambrosia-bloom')).toBe(2)

    state = applyEvent(state, { type: 'CRAFT', recipeId: 'ambrosia-distillate', quantity: 1 })
    expect(itemQuantity(state.inventory, 'ambrosia-distillate')).toBe(1)
    expect(itemQuantity(state.inventory, 'moly-tonic')).toBe(0)
    expect(itemQuantity(state.inventory, 'ambrosia-bloom')).toBe(0)

    const prepared = applyEvent(state, { type: 'USE_ITEM', itemId: 'ambrosia-distillate' })
    expect(prepared.flags['consumable:prepared:tonic']).toBe('ambrosia-distillate')
  })
})
