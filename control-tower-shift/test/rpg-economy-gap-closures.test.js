import { describe, expect, it } from 'vitest'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { craftingAccessDecision, craftingStationMaps } from '../src/rpg/systemAccess.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Two of Oathbearer's twenty-one bronzework recipes were unobtainable in
// practice despite passing content validation: bronze-bar (level 2) needed
// tin-ore, which only existed on a level-5 Act II resource node, and every
// level-15 iron-tier recipe needed iron-ore, which only existed on a single
// Act IV resource node. Worse, the bronze-forge station itself — required by
// all 21 bronzework recipes, including the level-1 ones — was only
// physically accessible at the Act IV Bronze Foundry. A pass auditing every
// other crafting station the same way found the entire alchemy skill (all
// three of its recipes, including its own level-1 one) in the identical
// shape: alchemy-lab was only physically accessible at Act III's Kore
// Sanctuary, with no narrative justification for the exclusivity (unlike the
// Act V Silent Loom's `loom` station, which genuinely is a one-of-a-kind,
// flag-gated "restored" location and was deliberately left alone). Closing
// iron-ore's gap then surfaced a second-order one: every iron-tier recipe
// also needs cypress-plank (a carpentry output of cypress-log), and
// cypress-log only existed on a single Act III resource node — so the
// recipes were still unreachable even after iron-ore and the forge itself
// became available earlier. A systematic re-audit comparing every recipe's
// ingredient reachability against its own station's earliest map then found
// a third instance of the identical shape: kiln, required by four of
// hearthkeeping's five recipes including the level-1 one, was only
// physically accessible at Acts III and IV. This file proves every gap is
// closed: the missing materials are now purchasable early, all three
// stations are now reachable from the Act I hub, and both a full iron-tier
// tool and a hearthkeeping clay brick can be made start to finish without
// ever reaching Act III or IV.

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

describe('new merchants: tin-ore and iron-ore', () => {
  const MERCHANTS = [
    { mapId: 'olive-road', entityId: 'philyra-roadside-stall', shopId: 'olive-road-trader', itemId: 'tin-ore', routeStates: null },
    { mapId: 'storm-anchorage', entityId: 'straton-garrison-quartermaster', shopId: 'anchorage-garrison-quartermaster', itemId: 'iron-ore', routeStates: ACT2_TIDE_ORDER },
  ]

  it('places each merchant on its authored map, reachable from every spawn', () => {
    for (const { mapId, entityId, routeStates } of MERCHANTS) {
      const map = REGISTERED_MAPS[mapId]
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      expect(entity, `${mapId}:${entityId}`).toBeTruthy()
      expect(entity.kind).toBe('shop')
      const states = routeStates || [undefined]
      for (const routeStateId of states) {
        for (const spawn of Object.values(map.spawns)) {
          const path = findWorldPath(map, spawn, entity, routeStateId ? { routeStateId } : {})
          expect(path.length, `${mapId}:${spawn.id}->${entityId}`).toBeGreaterThan(0)
          expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
        }
      }
    }
  })

  it('keeps each merchant physically distinct from its neighbors', () => {
    for (const { mapId, entityId } of MERCHANTS) {
      const map = REGISTERED_MAPS[mapId]
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      for (const sibling of [...(map.entities || []), ...(map.exits || [])]) {
        if (sibling.id === entityId || !Number.isFinite(sibling.x) || !Number.isFinite(sibling.y)) continue
        expect(Math.hypot(entity.x - sibling.x, entity.y - sibling.y), `${mapId}:${entityId}<->${sibling.id}`).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('introduces no new content-validation errors', () => {
    expect(validateRPGContent().summary.errors).toBe(0)
  })

  it.each(MERCHANTS)('sells $itemId at $mapId for real currency through the reducer', ({ mapId, shopId, itemId }) => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 200 } }
    state = atMap(state, mapId)
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId })
    expect(state.economy.openShopId).toBe(shopId)
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId, quantity: 1, transactionId: `test:buy:${itemId}` })
    expect(bought.inventory.slots.some((entry) => entry.itemId === itemId)).toBe(true)
    expect(bought.inventory.currency).toBeLessThan(200)
  })
})

describe('bronze-forge access widened to the Act I hub', () => {
  it('is reachable from Beacon Overlook, not only the Act IV Bronze Foundry', () => {
    expect(craftingStationMaps('bronze-forge')).toEqual(['beacon-overlook', 'bronze-foundry'])
    expect(craftingAccessDecision('beacon-overlook', 'bronze-forge')).toMatchObject({ available: true })
    expect(craftingAccessDecision('bronze-foundry', 'bronze-forge')).toMatchObject({ available: true })
  })

  it('places a physical forge entity at Beacon Overlook, reachable from every spawn', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === 'beacon-bronze-forge')
    expect(entity).toBeTruthy()
    expect(entity.kind).toBe('station')
    expect(entity.stationId).toBe('bronze-forge')
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('every bronzework recipe now has a physically reachable Act I station', () => {
    const bronzework = RECIPES.filter((recipe) => recipe.skillId === 'bronzework')
    expect(bronzework.length).toBeGreaterThan(0)
    for (const recipe of bronzework) {
      expect(craftingAccessDecision('beacon-overlook', recipe.stationId)?.available, recipe.id).toBe(true)
    }
  })

  it('lets a real player buy tin-ore at Olive Road, then forge Alloy Bronze Bar at Beacon Overlook — the exact gap this closes', () => {
    const base = createInitialState()
    let state = {
      ...base,
      inventory: { ...base.inventory, currency: 200 },
      progression: { ...base.progression, skills: { ...base.progression.skills, bronzework: { xp: xpForLevel(2) } } },
    }
    // Copper ore is already free at Beacon Overlook's copper seam; simulate having
    // gathered some. The node is capacity-1, so TICK forward between gathers.
    state = atMap(state, 'beacon-overlook', { x: 780, y: 408 })
    for (let i = 0; i < 3; i += 1) {
      state = applyEvent(state, { type: 'GATHER', entityId: 'copper-seam' })
      state = applyEvent(state, { type: 'TICK', n: 300 })
    }
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'copper-ore')).toHaveLength(3)

    state = atMap(state, 'olive-road')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'olive-road-trader' })
    state = applyEvent(state, { type: 'SHOP_BUY', itemId: 'tin-ore', quantity: 1, transactionId: 'gap-closure:tin' })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'tin-ore')).toBe(true)

    state = atMap(state, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })
    expect(state.crafting.stationId).toBe('bronze-forge')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'bronze-bar', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'bronze-bar')).toBe(true)
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'copper-ore')).toHaveLength(0)
    expect(state.inventory.slots.some((entry) => entry.itemId === 'tin-ore')).toBe(false)
  })
})

describe('alchemy-lab access widened to the Act I hub', () => {
  it('is reachable from Beacon Overlook, not only Act III Kore Sanctuary', () => {
    expect(craftingStationMaps('alchemy-lab')).toEqual(['beacon-overlook', 'kore-sanctuary'])
    expect(craftingAccessDecision('beacon-overlook', 'alchemy-lab')).toMatchObject({ available: true })
    expect(craftingAccessDecision('kore-sanctuary', 'alchemy-lab')).toMatchObject({ available: true })
  })

  it('places a physical bench entity at Beacon Overlook, reachable from every spawn', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === 'beacon-alchemy-bench')
    expect(entity).toBeTruthy()
    expect(entity.kind).toBe('station')
    expect(entity.stationId).toBe('alchemy-lab')
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('every one of alchemy’s recipes now has a physically reachable Act I station', () => {
    const alchemy = RECIPES.filter((recipe) => recipe.skillId === 'alchemy')
    expect(alchemy).toHaveLength(4)
    for (const recipe of alchemy) {
      expect(craftingAccessDecision('beacon-overlook', recipe.stationId)?.available, recipe.id).toBe(true)
    }
  })

  it('lets a real player dry herbs at Beacon Overlook with no travel at all — the exact gap this closes', () => {
    const base = createInitialState()
    let state = {
      ...base,
      inventory: { ...addInventoryItem(base.inventory, 'thyme', 3, ALL_ITEM_DEFS).inventory },
    }
    state = atMap(state, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab' })
    expect(state.crafting.stationId).toBe('alchemy-lab')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'dried-herbs', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'dried-herbs')).toBe(true)
    expect(state.inventory.slots.some((entry) => entry.itemId === 'thyme')).toBe(false)
  })
})

// Fixing iron-ore's reachability wasn't enough on its own: every iron-tier
// recipe also needs cypress-plank (a carpentry output), which needs
// cypress-log — and cypress-log only existed on a single Act III resource
// node. bronze-forge/iron-ore being reachable from Act II didn't matter if
// the other half of the recipe still couldn't be assembled until Act III.
describe('cypress-log now purchasable alongside iron-ore', () => {
  it('is sold at Straton’s Garrison Stores', () => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 200 } }
    state = atMap(state, 'storm-anchorage')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'anchorage-garrison-quartermaster' })
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'cypress-log', quantity: 2, transactionId: 'gap-closure:cypress' })
    expect(bought.inventory.slots.filter((entry) => entry.itemId === 'cypress-log')).toHaveLength(2)
  })

  it('lets a real player assemble a full iron-tier tool without ever reaching Act III: buy iron-ore and cypress-log at Storm Anchorage, plank it at the Pelagos woodwork bench, forge Iron Hoe at Beacon Overlook', () => {
    const base = createInitialState()
    let state = {
      ...base,
      inventory: { ...base.inventory, currency: 300 },
      progression: {
        ...base.progression,
        skills: { ...base.progression.skills, bronzework: { xp: xpForLevel(15) }, carpentry: { xp: xpForLevel(10) } },
      },
    }

    state = atMap(state, 'storm-anchorage')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'anchorage-garrison-quartermaster' })
    state = applyEvent(state, { type: 'SHOP_BUY', itemId: 'iron-ore', quantity: 2, transactionId: 'iron-hoe-chain:ore' })
    state = applyEvent(state, { type: 'SHOP_BUY', itemId: 'cypress-log', quantity: 2, transactionId: 'iron-hoe-chain:log' })
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'iron-ore')).toHaveLength(2)
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'cypress-log')).toHaveLength(2)

    state = atMap(state, 'pelagos-harbor')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'woodwork-bench' })
    expect(state.crafting.stationId).toBe('woodwork-bench')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'cypress-plank', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'cypress-plank')).toBe(true)

    state = atMap(state, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })
    expect(state.crafting.stationId).toBe('bronze-forge')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'iron-hoe', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'iron-hoe')).toBe(true)
    expect(state.inventory.slots.some((entry) => entry.itemId === 'cypress-plank')).toBe(false)
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'iron-ore')).toHaveLength(0)
  })
})

// A systematic re-audit (comparing every recipe's ingredient reachability
// against its own station's earliest map, not just eyeballing individual
// stations) found a third whole-skill-blocking gap in the identical shape:
// kiln — required by four of hearthkeeping's five recipes, including the
// level-1 Clay Brick one — was only physically accessible at Act III's
// Wheat Village and Act IV's Bronze Foundry. Clay Brick's only ingredient
// (copper-ore) is already free at Beacon Overlook, so the station was the
// entire blocker.
describe('kiln access widened to the Act I hub', () => {
  it('is reachable from Beacon Overlook, not only Acts III/IV', () => {
    expect(craftingStationMaps('kiln')).toEqual(['beacon-overlook', 'bronze-foundry', 'wheat-village'])
    expect(craftingAccessDecision('beacon-overlook', 'kiln')).toMatchObject({ available: true })
    expect(craftingAccessDecision('wheat-village', 'kiln')).toMatchObject({ available: true })
    expect(craftingAccessDecision('bronze-foundry', 'kiln')).toMatchObject({ available: true })
  })

  it('places a physical kiln entity at Beacon Overlook, reachable from every spawn', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === 'beacon-kiln')
    expect(entity).toBeTruthy()
    expect(entity.kind).toBe('station')
    expect(entity.stationId).toBe('kiln')
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('every kiln-based hearthkeeping recipe now has a physically reachable Act I station', () => {
    const kilnRecipes = RECIPES.filter((recipe) => recipe.skillId === 'hearthkeeping' && recipe.stationId === 'kiln')
    expect(kilnRecipes.length).toBe(4)
    for (const recipe of kilnRecipes) {
      expect(craftingAccessDecision('beacon-overlook', recipe.stationId)?.available, recipe.id).toBe(true)
    }
  })

  it('lets a real player mold a clay brick at Beacon Overlook with no travel at all — the exact gap this closes', () => {
    const base = createInitialState()
    let state = atMap(base, 'beacon-overlook')
    state = applyEvent(state, { type: 'GATHER', entityId: 'copper-seam' })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(true)
    state = applyEvent(state, { type: 'TICK', n: 300 })
    state = applyEvent(state, { type: 'GATHER', entityId: 'copper-seam' })
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'copper-ore')).toHaveLength(2)

    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'kiln' })
    expect(state.crafting.stationId).toBe('kiln')
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'clay-brick', quantity: 1 })
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'clay-brick')).toBe(true)
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'copper-ore')).toHaveLength(0)
  })
})
