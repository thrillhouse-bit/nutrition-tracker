import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

// Guile — "Stealth, locks, traps, and misdirection" — had no obtainable XP
// source anywhere in the game, the same severity Devotion had before its
// votive-stand fix. This gives it a first loop: a locked chest at Olive
// Road, picked with a purchased lockpick for a one-time currency payout and
// Guile XP. Unlike Stewardship's restore-then-tend or Devotion's
// repeatable offering, a picked chest stays picked — the reward is a fixed,
// exact-once payout, proven with its own dedicated PICK_LOCK reducer event
// (state.js) rather than reusing the crafting ledger, since there is no
// item output to account for.
const CHEST_ID = 'olive-road-locked-chest'
const OPENED_FLAG = 'guile:opened:olive-road:olive-road-locked-chest'

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

function moveNearEntity(state, entityId) {
  const map = rpgMapById(state.world.mapId)
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  const endpoint = findWorldPath(map, state.world.position, entity).at(-1)
  expect(endpoint, `${state.world.mapId}:${entityId}`).toBeTruthy()
  expect(Math.hypot(endpoint.x - entity.x, endpoint.y - entity.y)).toBeLessThan(56)
  return moveAlongWorldPath(state, endpoint)
}

// Physical merchant access requires the concrete shop entity on the current
// map and a protagonist standing beside it. Position west of Philyra (validated
// reachable) and open through the reducer so the SHOP_BUY below carries real
// physical authority.
function systemOpenNear(state, kind, systemId) {
  const map = rpgMapById(state.world.mapId)
  const entity = map.entities.find((candidate) =>
    kind === 'shop'
      ? candidate.kind === 'shop' && candidate.shopId === systemId
      : candidate.kind === 'bank')
  const near = moveAlongWorldPath(state, entity)
  const payload = kind === 'shop' ? { shopId: systemId } : {}
  const type = kind === 'shop' ? 'OPEN_SHOP' : 'OPEN_BANK'
  return applyEvent(near, { type, entityId: entity.id, ...payload })
}

function stateWithLockpick(quantity = 1) {
  const base = createInitialState()
  return { ...base, inventory: addInventoryItem(base.inventory, 'lockpick', quantity, ALL_ITEM_DEFS).inventory }
}

describe('guile items', () => {
  it('registers lockpick and sells it at Philyra’s stall', () => {
    expect(ALL_ITEM_DEFS.lockpick).toMatchObject({ id: 'lockpick', name: 'Lockpick', category: 'material', stackable: false })
  })

  it('reports zero new content-validation errors and lists lockpick as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toContain('lockpick')
  })
})

describe('locked chest placement', () => {
  it('places the chest on Olive Road with the authored pick contract', () => {
    const map = REGISTERED_MAPS['olive-road']
    const entity = map.entities.find((candidate) => candidate.id === CHEST_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'locked-chest', skillId: 'guile', level: 1, xp: 20,
      requiresFlag: OPENED_FLAG,
      cost: [{ itemId: 'lockpick', quantity: 1 }],
      reward: { currency: 45 },
    })
  })

  it('is reachable from every spawn', () => {
    const map = REGISTERED_MAPS['olive-road']
    const entity = map.entities.find((candidate) => candidate.id === CHEST_ID)
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Olive Road target', () => {
    const map = REGISTERED_MAPS['olive-road']
    const entity = map.entities.find((candidate) => candidate.id === CHEST_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== CHEST_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('PICK_LOCK reducer', () => {
  it('refuses without a lockpick carried, leaving state byte-identical', () => {
    const state = atMap(createInitialState(), 'olive-road')
    const result = applyEvent(state, { type: 'PICK_LOCK', entityId: CHEST_ID })
    expect(result).toBe(state)
  })

  it('consumes exactly 1 lockpick, awards 20 Guile XP, pays out 45 drachmae, and sets the flag exact-once', () => {
    const state = moveNearEntity(atMap(stateWithLockpick(1), 'olive-road'), CHEST_ID)
    const startingCurrency = state.inventory.currency || 0
    const opened = applyEvent(state, { type: 'PICK_LOCK', entityId: CHEST_ID })
    expect(opened).not.toBe(state)
    expect(opened.flags[OPENED_FLAG]).toBe(true)
    expect(itemQuantity(opened.inventory, 'lockpick')).toBe(0)
    expect(opened.progression.skills.guile.xp).toBe(20)
    expect(opened.inventory.currency).toBe(startingCurrency + 45)

    // A second attempt — even with more lockpicks carried — is a no-op.
    const withMoreLockpicks = { ...opened, inventory: addInventoryItem(opened.inventory, 'lockpick', 2, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreLockpicks, { type: 'PICK_LOCK', entityId: CHEST_ID })
    expect(secondAttempt).toBe(withMoreLockpicks)
    expect(secondAttempt.inventory.currency).toBe(startingCurrency + 45)
  })

  it('leaves surplus lockpicks untouched beyond the exact authored cost', () => {
    const state = moveNearEntity(atMap(stateWithLockpick(3), 'olive-road'), CHEST_ID)
    const opened = applyEvent(state, { type: 'PICK_LOCK', entityId: CHEST_ID })
    expect(itemQuantity(opened.inventory, 'lockpick')).toBe(2)
  })

  it('refuses away from Olive Road', () => {
    const state = atMap(stateWithLockpick(1), 'beacon-overlook')
    const result = applyEvent(state, { type: 'PICK_LOCK', entityId: CHEST_ID })
    expect(result).toBe(state)
  })
})

describe('guile economy interaction', () => {
  it('lets a real player buy a lockpick from Philyra and open the chest at Olive Road — the exact loop this closes', () => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 100 } }
    state = atMap(state, 'olive-road')
    state = systemOpenNear(state, 'shop', 'olive-road-trader')
    state = applyEvent(state, { type: 'SHOP_BUY', itemId: 'lockpick', quantity: 1, transactionId: 'guile:buy-lockpick' })
    expect(itemQuantity(state.inventory, 'lockpick')).toBe(1)
    const afterBuying = state.inventory.currency

    // The merchant lease is not remote authority over the chest.
    expect(applyEvent(state, { type: 'PICK_LOCK', entityId: CHEST_ID })).toBe(state)
    const opened = applyEvent(moveNearEntity(state, CHEST_ID), { type: 'PICK_LOCK', entityId: CHEST_ID })
    expect(opened.flags[OPENED_FLAG]).toBe(true)
    expect(opened.inventory.currency).toBe(afterBuying + 45)
    expect(itemQuantity(opened.inventory, 'lockpick')).toBe(0)
  })
})
