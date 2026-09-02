import { describe, expect, it } from 'vitest'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Priority 2 (economy network): before this pass, only Beacon Overlook (Act I)
// had a physical bank, leaving Acts II-V with zero account-safe storage.
// One regional bank per remaining act closes the most acute gap first.
const NEW_BANKS = [
  { mapId: 'pelagos-harbor', entityId: 'pelagos-storehouse', routeStates: ACT2_TIDE_ORDER },
  { mapId: 'wheat-village', entityId: 'wheat-village-granary-bank', routeStates: null },
  { mapId: 'slag-road', entityId: 'slag-road-muster-bank', routeStates: null },
  { mapId: 'nyx-foothold', entityId: 'nyx-foothold-bank', routeStates: null },
]

function atMap(state, mapId) {
  const map = rpgMapById(mapId)
  return {
    ...state,
    world: {
      ...state.world,
      regionId: map.region,
      mapId,
      spawnId: map.spawn.id,
      position: { x: map.spawn.x, y: map.spawn.y },
      facing: map.spawn.facing || 0,
    },
  }
}

describe('regional bank placement', () => {
  it('places each new bank on its authored map with a stable id, name, and label', () => {
    for (const { mapId, entityId } of NEW_BANKS) {
      const map = REGISTERED_MAPS[mapId]
      expect(map, mapId).toBeTruthy()
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      expect(entity, `${mapId}:${entityId}`).toBeTruthy()
      expect(entity.kind).toBe('bank')
      expect(typeof entity.name).toBe('string')
      expect(entity.name.length).toBeGreaterThan(0)
      expect(typeof entity.label).toBe('string')
      expect(entity.label.length).toBeGreaterThan(0)
    }
  })

  it('is reachable from every spawn on its map within gameplay interaction distance', () => {
    for (const { mapId, entityId, routeStates } of NEW_BANKS) {
      const map = REGISTERED_MAPS[mapId]
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      const states = routeStates || [undefined]
      for (const routeStateId of states) {
        for (const spawn of Object.values(map.spawns)) {
          const path = findWorldPath(map, spawn, entity, routeStateId ? { routeStateId } : {})
          expect(path.length, `${mapId}:${spawn.id}->${entityId}${routeStateId ? `@${routeStateId}` : ''}`).toBeGreaterThan(0)
          expect(
            Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y),
            `${mapId}:${spawn.id}->${entityId} interaction distance`,
          ).toBeLessThan(56)
        }
      }
    }
  })

  it('keeps every new bank physically distinct from its neighbors', () => {
    for (const { mapId, entityId } of NEW_BANKS) {
      const map = REGISTERED_MAPS[mapId]
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      const targets = [...(map.entities || []), ...(map.exits || [])]
      for (const sibling of targets) {
        if (sibling.id === entityId || !Number.isFinite(sibling.x) || !Number.isFinite(sibling.y)) continue
        expect(
          Math.hypot(entity.x - sibling.x, entity.y - sibling.y),
          `${mapId}:${entityId}<->${sibling.id}`,
        ).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('introduces no new content-validation errors', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
  })
})

describe('regional bank reducer integration', () => {
  it.each(NEW_BANKS)('deposits and withdraws at $mapId without cross-region access', ({ mapId }) => {
    let state = atMap(createInitialState(), mapId)
    state = { ...state, inventory: addInventoryItem(state.inventory, 'copper-ore', 1, ALL_ITEM_DEFS).inventory }

    // A map with no physical bank cannot be used for deposits/withdrawals.
    const remote = { ...state, world: { ...state.world, mapId: 'olive-road' } }
    expect(applyEvent(remote, { type: 'BANK_DEPOSIT', itemId: 'copper-ore', quantity: 1 })).toBe(remote)

    const deposited = applyEvent(state, { type: 'BANK_DEPOSIT', itemId: 'copper-ore', quantity: 1 })
    expect(deposited.inventory.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(false)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'copper-ore', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'copper-ore', quantity: 1 })
    expect(withdrawn.inventory.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(true)
    expect(withdrawn.inventory.bank.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(false)
  })

  it('shares one account-wide bank: a deposit at one regional bank is withdrawable at another', () => {
    let state = atMap(createInitialState(), 'wheat-village')
    state = { ...state, inventory: addInventoryItem(state.inventory, 'copper-ore', 1, ALL_ITEM_DEFS).inventory }
    state = applyEvent(state, { type: 'BANK_DEPOSIT', itemId: 'copper-ore', quantity: 1 })
    expect(state.inventory.bank.slots).toContainEqual({ itemId: 'copper-ore', quantity: 1 })

    state = atMap(state, 'nyx-foothold')
    state = applyEvent(state, { type: 'BANK_WITHDRAW', itemId: 'copper-ore', quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(true)
    expect(state.inventory.bank.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(false)
  })
})
