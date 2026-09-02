import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Beastbond — "track, calm, and call mythic creatures" — had no obtainable
// XP source anywhere in the game, the same severity Devotion and Guile had
// before their fixes. This gives it a first loop (deliberately skipping any
// persistent companion mechanic): the Sacred Hind at Beacon Overlook, calmed
// with a purchased honeyed figs offering for a one-time currency payout and
// Beastbond XP. It reuses the exact same claimExactOnceReward contract Guile's
// locked chest already proved out — only CALM_CREATURE, the entity kind, and
// the verbs differ. Buying the figs also closes an independent pre-existing
// gap: honeyed-figs (a real food consumable) had no obtainable source either.
const HIND_ID = 'beacon-sacred-hind'
const CALMED_FLAG = 'beastbond:calmed:beacon-overlook:beacon-sacred-hind'

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

function stateWithFigs(quantity = 1) {
  const base = createInitialState()
  return { ...base, inventory: addInventoryItem(base.inventory, 'honeyed-figs', quantity, ALL_ITEM_DEFS).inventory }
}

describe('beastbond items', () => {
  it('registers honeyed figs and sells them at Myrrine’s table', () => {
    expect(ALL_ITEM_DEFS['honeyed-figs']).toMatchObject({ id: 'honeyed-figs', name: 'Honeyed Figs', category: 'food', stackable: false })
  })

  it('reports zero new content-validation errors and lists honeyed figs as obtainable', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.obtainableItemIds).toContain('honeyed-figs')
  })
})

describe('sacred hind placement', () => {
  it('places the hind on Beacon Overlook with the authored calm contract', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === HIND_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({
      kind: 'wild-creature', skillId: 'beastbond', level: 1, xp: 18,
      requiresFlag: CALMED_FLAG,
      cost: [{ itemId: 'honeyed-figs', quantity: 1 }],
      reward: { currency: 30 },
    })
  })

  it('is reachable from every spawn', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === HIND_ID)
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity)
      expect(path.length, spawn.id).toBeGreaterThan(0)
      expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
    }
  })

  it('stays physically distinct from every other Beacon Overlook target', () => {
    const map = REGISTERED_MAPS['beacon-overlook']
    const entity = map.entities.find((candidate) => candidate.id === HIND_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== HIND_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('CALM_CREATURE reducer', () => {
  it('refuses without honeyed figs carried, leaving state byte-identical', () => {
    const state = atMap(createInitialState(), 'beacon-overlook')
    const result = applyEvent(state, { type: 'CALM_CREATURE', entityId: HIND_ID })
    expect(result).toBe(state)
  })

  it('consumes exactly 1 honeyed figs, awards 18 Beastbond XP, pays out 30 drachmae, and sets the flag exact-once', () => {
    const state = atMap(stateWithFigs(1), 'beacon-overlook')
    const startingCurrency = state.inventory.currency || 0
    const calmed = applyEvent(state, { type: 'CALM_CREATURE', entityId: HIND_ID })
    expect(calmed).not.toBe(state)
    expect(calmed.flags[CALMED_FLAG]).toBe(true)
    expect(itemQuantity(calmed.inventory, 'honeyed-figs')).toBe(0)
    expect(calmed.progression.skills.beastbond.xp).toBe(18)
    expect(calmed.inventory.currency).toBe(startingCurrency + 30)

    // A second attempt — even with more figs carried — is a no-op.
    const withMoreFigs = { ...calmed, inventory: addInventoryItem(calmed.inventory, 'honeyed-figs', 2, ALL_ITEM_DEFS).inventory }
    const secondAttempt = applyEvent(withMoreFigs, { type: 'CALM_CREATURE', entityId: HIND_ID })
    expect(secondAttempt).toBe(withMoreFigs)
    expect(secondAttempt.inventory.currency).toBe(startingCurrency + 30)
  })

  it('leaves surplus honeyed figs untouched beyond the exact authored cost', () => {
    const state = atMap(stateWithFigs(3), 'beacon-overlook')
    const calmed = applyEvent(state, { type: 'CALM_CREATURE', entityId: HIND_ID })
    expect(itemQuantity(calmed.inventory, 'honeyed-figs')).toBe(2)
  })

  it('refuses away from Beacon Overlook', () => {
    const state = atMap(stateWithFigs(1), 'olive-road')
    const result = applyEvent(state, { type: 'CALM_CREATURE', entityId: HIND_ID })
    expect(result).toBe(state)
  })
})

describe('beastbond economy interaction', () => {
  it('lets a real player buy honeyed figs from Myrrine and calm the hind at Beacon Overlook — the exact loop this closes', () => {
    let state = { ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 100 } }
    state = atMap(state, 'beacon-overlook')
    state = applyEvent(state, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner' })
    state = applyEvent(state, { type: 'SHOP_BUY', itemId: 'honeyed-figs', quantity: 1, transactionId: 'beastbond:buy-figs' })
    expect(itemQuantity(state.inventory, 'honeyed-figs')).toBe(1)
    const afterBuying = state.inventory.currency

    const calmed = applyEvent(state, { type: 'CALM_CREATURE', entityId: HIND_ID })
    expect(calmed.flags[CALMED_FLAG]).toBe(true)
    expect(calmed.inventory.currency).toBe(afterBuying + 30)
    expect(itemQuantity(calmed.inventory, 'honeyed-figs')).toBe(0)
  })
})
