import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { resourceNodeKey } from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

// Stewardship had two tiers (Beacon Overlook's Act I fallow field, Pelagos
// Harbor's Act II salt garden) but no third — short of the contract's "at
// least five useful level bands" floor and the pattern Fishing/Quarrying/
// Foraging/Woodcutting already follow. This gives it an Act III tier that
// ties directly into Wheat Village's own "stilled year" story (the harvest
// frozen mid-cycle, with an already-authored "First Thaw" marker on this
// same map) — thawing a frost-locked terrace with purchased warmed must,
// rather than reusing compost or water casks from earlier tiers, matching
// how every earlier tier used its own thematically distinct restore cost.
const TERRACE_ID = 'wheat-village-frost-terrace'
const RESTORED_FLAG = 'steward:restored:wheat-village:wheat-village-frost-terrace'
const TERRACE_KEY = resourceNodeKey('wheat-village', TERRACE_ID)

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

// Physical system access requires the concrete shop/bank entity on the current
// map and a protagonist standing beside it. Resolve the matching entity for the
// map the caller already set, reposition west of it (validated reachable), and
// open through the reducer so later SHOP_*/BANK_* events carry real authority.
function systemOpenNear(state, kind, systemId) {
  const map = rpgMapById(state.world.mapId)
  const isShop = kind === 'shop'
  const entity = map.entities.find((candidate) =>
    isShop ? candidate.kind === 'shop' && candidate.shopId === systemId : candidate.kind === 'bank')
  const near = { ...state, world: { ...state.world, position: { x: entity.x - 8, y: entity.y } } }
  const payload = isShop ? { shopId: systemId } : {}
  const type = isShop ? 'OPEN_SHOP' : 'OPEN_BANK'
  return applyEvent(near, { type, entityId: entity.id, ...payload })
}

function atMap(state, mapId, position) {
  const map = rpgMapById(mapId)
  const target = mapId === 'wheat-village' ? map.entities.find((candidate) => candidate.id === TERRACE_ID) : null
  return {
    ...state,
    world: {
      ...state.world,
      regionId: map.region,
      mapId,
      spawnId: map.spawn.id,
      position: target ? { x: target.x, y: target.y } : (position || { x: map.spawn.x, y: map.spawn.y }),
      facing: map.spawn.facing || 0,
    },
  }
}

function moveNearEntity(state, entityId) {
  const map = rpgMapById(state.world.mapId)
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  const endpoint = findWorldPath(map, state.world.position, entity).at(-1)
  expect(endpoint, `${state.world.mapId}:${entityId}`).toBeTruthy()
  expect(Math.hypot(endpoint.x - entity.x, endpoint.y - entity.y)).toBeLessThan(56)
  return moveAlongWorldPath(state, endpoint)
}

function stewardshipState(level) {
  const base = createInitialState()
  return {
    ...base,
    progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(level) } } },
  }
}

function restoredState() {
  const base = stewardshipState(25)
  const withMust = addInventoryItem(base.inventory, 'spiced-must', 2, ALL_ITEM_DEFS).inventory
  const state = atMap({ ...base, inventory: withMust }, 'wheat-village', { x: 600, y: 460 })
  const restored = applyEvent(state, { type: 'RESTORE_LAND', entityId: TERRACE_ID })
  expect(restored.flags[RESTORED_FLAG]).toBe(true)
  return restored
}

describe('stewardship tier-3 items', () => {
  it('registers spiced-must and threshed-grain with the exact material contract', () => {
    expect(ALL_ITEM_DEFS['spiced-must']).toMatchObject({
      id: 'spiced-must', name: 'Spiced Must', category: 'material', stackable: false, tier: 25,
    })
    expect(ALL_ITEM_DEFS['threshed-grain']).toMatchObject({
      id: 'threshed-grain', name: 'Threshed Grain', category: 'grain', stackable: false, tier: 30,
    })
  })

  it('reports zero new content-validation errors and lists both items as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toEqual(expect.arrayContaining(['spiced-must', 'threshed-grain']))
  })
})

describe('frost terrace world placement', () => {
  it('places the terrace on Wheat Village with the authored restore contract', () => {
    const map = REGISTERED_MAPS['wheat-village']
    const entity = map.entities.find((candidate) => candidate.id === TERRACE_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'resource', skillId: 'stewardship', itemId: 'threshed-grain', level: 30, xp: 50,
      requiresFlag: RESTORED_FLAG,
      restore: { level: 25, xp: 45, cost: [{ itemId: 'spiced-must', quantity: 2 }] },
    })
  })

  it('is reachable from every spawn', () => {
    const map = REGISTERED_MAPS['wheat-village']
    const entity = map.entities.find((candidate) => candidate.id === TERRACE_ID)
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Wheat Village target', () => {
    const map = REGISTERED_MAPS['wheat-village']
    const entity = map.entities.find((candidate) => candidate.id === TERRACE_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== TERRACE_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('RESTORE_LAND — the frost terrace', () => {
  it('refuses to restore below the authored level gate, leaving state byte-identical', () => {
    const base = stewardshipState(24)
    const withMust = addInventoryItem(base.inventory, 'spiced-must', 2, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withMust }, 'wheat-village', { x: 600, y: 460 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: TERRACE_ID })
    expect(result).toBe(state)
  })

  it('is a no-op with insufficient spiced must', () => {
    const base = stewardshipState(25)
    const withMust = addInventoryItem(base.inventory, 'spiced-must', 1, ALL_ITEM_DEFS).inventory
    const state = atMap({ ...base, inventory: withMust }, 'wheat-village', { x: 600, y: 460 })
    const result = applyEvent(state, { type: 'RESTORE_LAND', entityId: TERRACE_ID })
    expect(result).toBe(state)
    expect(itemQuantity(result.inventory, 'spiced-must')).toBe(1)
  })

  it('consumes exactly the authored cost, sets the flag, and awards restore XP once', () => {
    const restored = restoredState()
    expect(itemQuantity(restored.inventory, 'spiced-must')).toBe(0)
    expect(restored.progression.skills.stewardship.xp).toBe(xpForLevel(25) + 45)
  })

  it('is exact-once: a second restoration attempt is a no-op', () => {
    const restored = restoredState()
    const withMoreMust = { ...restored, inventory: addInventoryItem(restored.inventory, 'spiced-must', 2, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreMust, { type: 'RESTORE_LAND', entityId: TERRACE_ID })
    expect(secondAttempt).toBe(withMoreMust)
  })
})

describe('GATHER — the frost terrace before and after restoration', () => {
  it('refuses to harvest an unrestored terrace, leaving state byte-identical', () => {
    const state = atMap(stewardshipState(30), 'wheat-village', { x: 600, y: 460 })
    const gathered = applyEvent(state, { type: 'GATHER', entityId: TERRACE_ID })
    expect(gathered).toBe(state)
  })

  it('refuses to harvest a restored terrace below the tend level gate', () => {
    const restored = restoredState()
    const belowLevel = { ...restored, progression: { ...restored.progression, skills: { ...restored.progression.skills, stewardship: { xp: xpForLevel(29) } } } }
    const gathered = applyEvent(belowLevel, { type: 'GATHER', entityId: TERRACE_ID })
    expect(gathered).toBe(belowLevel)
  })

  it('grants exactly 1 threshed grain once restored and at the tend level gate', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(30) } } } }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: TERRACE_ID })
    expect(itemQuantity(gathered.inventory, 'threshed-grain')).toBe(1)
    expect(gathered.progression.skills.stewardship.xp).toBe(xpForLevel(30) + 50)
    expect(gathered.resources.nodes[TERRACE_KEY]).toBeTruthy()
    expect(gathered.resources.nodes[TERRACE_KEY].remaining).toBe(0)
  })

  it('grants a tool-bonus yield when iron-hoe is carried, reusing the existing gathering-tool mechanism', () => {
    const base = restoredState()
    const withHoe = addInventoryItem(base.inventory, 'iron-hoe', 1, ALL_ITEM_DEFS).inventory
    const state = {
      ...base, inventory: withHoe,
      progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(30) } } },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: TERRACE_ID })
    expect(itemQuantity(gathered.inventory, 'threshed-grain')).toBe(3)
  })
})

describe('frost terrace economy interaction', () => {
  it('lets Eirene sell spiced must and buy back threshed grain, closing the third-tier economy loop', () => {
    let state = { ...stewardshipState(30), inventory: { ...stewardshipState(30).inventory, currency: 200 } }
    state = atMap(state, 'wheat-village', { x: 670, y: 410 })
    state = systemOpenNear(state, 'shop', 'wheat-village-exchange')
    const bought = applyEvent(state, { type: 'SHOP_BUY', itemId: 'spiced-must', quantity: 2, transactionId: 'gap:must' })
    expect(itemQuantity(bought.inventory, 'spiced-must')).toBe(2)

    // Eirene's merchant panel is not remote authority over the terrace.
    expect(applyEvent(bought, { type: 'RESTORE_LAND', entityId: TERRACE_ID })).toBe(bought)
    const restored = applyEvent(moveNearEntity(bought, TERRACE_ID), { type: 'RESTORE_LAND', entityId: TERRACE_ID })
    expect(restored.flags[RESTORED_FLAG]).toBe(true)
    const gathered = applyEvent(restored, { type: 'GATHER', entityId: TERRACE_ID })
    expect(itemQuantity(gathered.inventory, 'threshed-grain')).toBe(1)

    const reopened = systemOpenNear(gathered, 'shop', 'wheat-village-exchange')
    const sold = applyEvent(reopened, { type: 'SHOP_SELL', itemId: 'threshed-grain', quantity: 1, transactionId: 'gap:grain' })
    expect(itemQuantity(sold.inventory, 'threshed-grain')).toBe(0)
    expect(sold.inventory.currency).toBeGreaterThan(gathered.inventory.currency)
  })

  it('lets a harvested threshed grain be deposited into and withdrawn from the Wheat Village Granary Store', () => {
    const base = restoredState()
    const state = { ...base, progression: { ...base.progression, skills: { ...base.progression.skills, stewardship: { xp: xpForLevel(30) } } } }
    const caught = applyEvent(state, { type: 'GATHER', entityId: TERRACE_ID })
    expect(itemQuantity(caught.inventory, 'threshed-grain')).toBe(1)

    const deposited = applyEvent(systemOpenNear(caught, 'bank'), { type: 'BANK_DEPOSIT', itemId: 'threshed-grain', quantity: 1 })
    expect(itemQuantity(deposited.inventory, 'threshed-grain')).toBe(0)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'threshed-grain', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'threshed-grain', quantity: 1 })
    expect(itemQuantity(withdrawn.inventory, 'threshed-grain')).toBe(1)
  })
})
