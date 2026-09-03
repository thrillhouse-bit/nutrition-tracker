import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// A broader orphan audit (every ITEM_DEFS/ITEM_EXTENSIONS entry compared
// against every recipe output, shop listing, resource-node itemId,
// wilderness loot table, and starting-equipment default — the same audit
// that found ambrosia-distillate) surfaced three items with genuinely no
// source anywhere and no consumable effect either: copper-wire,
// olive-figurehead, and woven-tape. (oath-spear, traveler-tunic, and
// celestial-bronze were checked too and are NOT bugs — the first two are
// granted as starting equipment in progression.js, and celestial-bronze
// drops from a wilderness encounter's loot table.) This closes all three
// with a small recipe at the natural early tier of their own skill's
// existing chain, plus a shop sink at a thematically fitting existing
// merchant — no new stations or merchants needed.
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

function skillState(skillId, level) {
  const base = createInitialState()
  return {
    ...base,
    progression: { ...base.progression, skills: { ...base.progression.skills, [skillId]: { xp: xpForLevel(level) } } },
  }
}

describe('orphan closures — content integrity', () => {
  it('reports zero new content-validation errors and lists all three items as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['copper-wire', 'olive-figurehead', 'woven-tape']))
  })
})

describe('copper-wire (Bronzework)', () => {
  it('registers the recipe with the exact contract', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'copper-wire')
    expect(recipe).toMatchObject({
      name: 'Draw Copper Wire', skillId: 'bronzework', stationId: 'bronze-forge', level: 3, xp: 15,
      ingredients: [{ itemId: 'copper-bar', quantity: 2 }],
      outputs: [{ itemId: 'copper-wire', quantity: 1 }],
    })
  })

  it('lets a real player smelt copper ore into a bar, then draw it into wire, then sell it to Doros', () => {
    const base = skillState('bronzework', 3)
    const withOre = { ...base, inventory: addInventoryItem(base.inventory, 'copper-ore', 2, ALL_ITEM_DEFS).inventory }
    let state = atMap(withOre, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'copper-bar', quantity: 1 })
    expect(itemQuantity(state.inventory, 'copper-bar')).toBe(1)

    const withMoreBars = { ...state, inventory: addInventoryItem(state.inventory, 'copper-bar', 1, ALL_ITEM_DEFS).inventory }
    let wired = applyEvent(withMoreBars, { type: 'CRAFT', recipeId: 'copper-wire', quantity: 1 })
    expect(wired.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 15 })
    expect(itemQuantity(wired.inventory, 'copper-wire')).toBe(1)
    expect(itemQuantity(wired.inventory, 'copper-bar')).toBe(0)

    wired = atMap(wired, 'slag-road')
    wired = applyEvent(wired, { type: 'OPEN_SHOP', shopId: 'forge-march-quartermaster' })
    const sold = applyEvent(wired, { type: 'SHOP_SELL', itemId: 'copper-wire', quantity: 1, transactionId: 'orphan:sell-wire' })
    expect(itemQuantity(sold.inventory, 'copper-wire')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })
})

describe('olive-figurehead (Carpentry)', () => {
  it('registers the recipe with the exact contract', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'olive-figurehead')
    expect(recipe).toMatchObject({
      name: 'Carve Olive Figurehead', skillId: 'carpentry', stationId: 'woodwork-bench', level: 2, xp: 18,
      ingredients: [{ itemId: 'olive-plank', quantity: 1 }],
      outputs: [{ itemId: 'olive-figurehead', quantity: 1 }],
    })
  })

  it('lets a real player split an olive plank, carve a figurehead, and sell it to Thaleia at Pelagos Harbor', () => {
    const base = skillState('carpentry', 2)
    const withLogs = { ...base, inventory: addInventoryItem(base.inventory, 'olive-log', 2, ALL_ITEM_DEFS).inventory }
    let state = atMap(withLogs, 'olive-road')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'woodwork-bench' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'olive-plank', quantity: 1 })
    expect(itemQuantity(state.inventory, 'olive-plank')).toBe(1)

    let carved = applyEvent(state, { type: 'CRAFT', recipeId: 'olive-figurehead', quantity: 1 })
    expect(carved.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 18 })
    expect(itemQuantity(carved.inventory, 'olive-figurehead')).toBe(1)
    expect(itemQuantity(carved.inventory, 'olive-plank')).toBe(0)

    carved = atMap(carved, 'pelagos-harbor')
    carved = applyEvent(carved, { type: 'OPEN_SHOP', shopId: 'pelagos-chandler' })
    const sold = applyEvent(carved, { type: 'SHOP_SELL', itemId: 'olive-figurehead', quantity: 1, transactionId: 'orphan:sell-figurehead' })
    expect(itemQuantity(sold.inventory, 'olive-figurehead')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })
})

describe('woven-tape (Weaving)', () => {
  it('registers the recipe with the exact contract', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'woven-tape')
    expect(recipe).toMatchObject({
      name: 'Weave Flax Tape', skillId: 'weaving', stationId: 'loom', level: 2, xp: 15,
      ingredients: [{ itemId: 'flax-fiber', quantity: 2 }],
      outputs: [{ itemId: 'woven-tape', quantity: 1 }],
    })
  })

  it('lets a real player ret flax to fiber, weave it into tape, and sell it to Asteria at Nyx Foothold — reusing the same narrative-gated Silent Loom every other Weaving recipe already depends on', () => {
    const base = skillState('weaving', 2)
    const withThyme = { ...base, inventory: addInventoryItem(base.inventory, 'thyme', 1, ALL_ITEM_DEFS).inventory }
    let state = atMap(withThyme, 'silent-loom')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'loom' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'flax-fiber', quantity: 1 })
    expect(itemQuantity(state.inventory, 'flax-fiber')).toBe(3)

    let woven = applyEvent(state, { type: 'CRAFT', recipeId: 'woven-tape', quantity: 1 })
    expect(woven.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 15 })
    expect(itemQuantity(woven.inventory, 'woven-tape')).toBe(1)
    expect(itemQuantity(woven.inventory, 'flax-fiber')).toBe(1)

    woven = atMap(woven, 'nyx-foothold')
    woven = applyEvent(woven, { type: 'OPEN_SHOP', shopId: 'nyx-witness-exchange' })
    const sold = applyEvent(woven, { type: 'SHOP_SELL', itemId: 'woven-tape', quantity: 1, transactionId: 'orphan:sell-tape' })
    expect(itemQuantity(sold.inventory, 'woven-tape')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(0)
  })
})
