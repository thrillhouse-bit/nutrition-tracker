import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState, MAX_WORLD_MOVE_STEP } from '../src/rpg/state.js'

function at(state, entityId, offset = { x: -8, y: 0 }) {
  const map = rpgMapById('beacon-overlook')
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  return { ...state, world: { ...state.world, mapId: map.id, regionId: map.region, position: { x: entity.x + offset.x, y: entity.y + offset.y } } }
}

function walkTo(state, target) {
  const map = rpgMapById(state.world.mapId)
  const path = findWorldPath(map, state.world.position, target)
  expect(path.length).toBeGreaterThan(0)
  let next = state
  for (const point of path) {
    const from = next.world.position
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / (MAX_WORLD_MOVE_STEP / 2)))
    for (let index = 1; index <= steps; index += 1) {
      next = applyEvent(next, { type: 'MOVE', x: from.x + (point.x - from.x) * index / steps, y: from.y + (point.y - from.y) * index / steps })
    }
  }
  return next
}

describe('physical bank, shop, and station authorization', () => {
  afterEach(() => {
    vi.doUnmock('../src/rpg/registry.js')
    vi.resetModules()
  })

  it('rejects a close bank across an impassable collision wall', async () => {
    const bankBehindWall = {
      id: 'collision-bank-fixture',
      bounds: { w: 960, h: 540 },
      // Clearance expands this barrier beyond the playable bounds, leaving no
      // route around it despite the player being only 50px from the bank.
      collisions: [{ x: 67, y: 40, w: 12, h: 460 }],
      entities: [{ id: 'wall-bank', kind: 'bank', x: 100, y: 260 }],
    }
    const position = { x: 50, y: 260 }
    vi.resetModules()
    vi.doMock('../src/rpg/registry.js', () => ({
      REGISTERED_MAPS: { 'collision-bank-fixture': bankBehindWall },
    }))
    const { findWorldPath } = await import('../src/rpg/pathfinding.js')
    const { physicalSystemAccessDecision } = await import('../src/rpg/systemAccess.js')

    expect(Math.hypot(position.x - 100, position.y - 260)).toBeLessThan(56)
    expect(findWorldPath(bankBehindWall, position, { x: 100, y: 260 })).toEqual([])
    expect(physicalSystemAccessDecision({
      mapId: 'collision-bank-fixture',
      position,
      entityId: 'wall-bank',
      kind: 'bank',
    })).toMatchObject({ available: false, reason: 'No clear path reaches this system object.' })
  })

  it('rejects far, stale, and wrong entity access without mutating inventory or currency', () => {
    let state = createInitialState()
    state = { ...state, inventory: { ...addInventoryItem(state.inventory, 'thyme', 1, ALL_ITEM_DEFS).inventory, currency: 100 } }
    const far = { ...state, world: { ...state.world, mapId: 'beacon-overlook', position: { x: 160, y: 400 } } }
    expect(applyEvent(far, { type: 'OPEN_BANK', entityId: 'beacon-bank' })).toBe(far)
    expect(applyEvent(far, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner', entityId: 'myrrine-provisioner' })).toBe(far)
    expect(applyEvent(far, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab', entityId: 'beacon-alchemy-bench' })).toBe(far)

    const bank = applyEvent(at(state, 'beacon-bank'), { type: 'OPEN_BANK', entityId: 'beacon-bank' })
    const moved = { ...bank, world: { ...bank.world, position: { x: 160, y: 400 } } }
    expect(applyEvent(moved, { type: 'BANK_DEPOSIT', itemId: 'thyme', quantity: 1 })).toBe(moved)
    const wrongEntity = at(state, 'beacon-bank')
    expect(applyEvent(wrongEntity, { type: 'OPEN_BANK', entityId: 'myrrine-provisioner' })).toBe(wrongEntity)
  })

  it('permits valid nearby concrete targets and revokes shop and station actions after movement', () => {
    let bank = at(createInitialState(), 'beacon-bank')
    bank = { ...bank, inventory: addInventoryItem(bank.inventory, 'thyme', 1, ALL_ITEM_DEFS).inventory }
    bank = applyEvent(bank, { type: 'OPEN_BANK', entityId: 'beacon-bank' })
    expect(applyEvent(bank, { type: 'BANK_DEPOSIT', itemId: 'thyme', quantity: 1 }).inventory.bank.slots).toContainEqual({ itemId: 'thyme', quantity: 1 })

    let shop = at({ ...createInitialState(), inventory: { ...createInitialState().inventory, currency: 100 } }, 'myrrine-provisioner')
    shop = applyEvent(shop, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner', entityId: 'myrrine-provisioner' })
    expect(shop.economy.openShopId).toBe('beacon-provisioner')
    const staleShop = { ...shop, world: { ...shop.world, position: { x: 160, y: 400 } } }
    expect(applyEvent(staleShop, { type: 'SHOP_BUY', itemId: 'thyme', quantity: 1, transactionId: 'stale' })).toBe(staleShop)

    let station = at(createInitialState(), 'beacon-alchemy-bench')
    station = applyEvent(station, { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab', entityId: 'beacon-alchemy-bench' })
    expect(station.crafting.stationId).toBe('alchemy-lab')
    const staleStation = { ...station, world: { ...station.world, position: { x: 160, y: 400 } } }
    expect(applyEvent(staleStation, { type: 'CRAFT', recipeId: 'dried-herbs', quantity: 1 })).toBe(staleStation)
  })

  it('clears active physical contexts on explicit close and movement', () => {
    let bank = applyEvent(at(createInitialState(), 'beacon-bank'), { type: 'OPEN_BANK', entityId: 'beacon-bank' })
    expect(bank.flags['rpg:active-bank-entity']).toBe('beacon-bank')
    bank = applyEvent(bank, { type: 'CLOSE_BANK' })
    expect(bank.flags['rpg:active-bank-entity']).toBeUndefined()

    let shop = applyEvent(at(createInitialState(), 'myrrine-provisioner'), { type: 'OPEN_SHOP', shopId: 'beacon-provisioner', entityId: 'myrrine-provisioner' })
    shop = walkTo(shop, { x: 160, y: 400 })
    expect(shop.flags['rpg:active-shop-entity']).toBeUndefined()

    let station = applyEvent(at(createInitialState(), 'beacon-alchemy-bench'), { type: 'OPEN_CRAFTING', stationId: 'alchemy-lab', entityId: 'beacon-alchemy-bench' })
    station = walkTo(station, { x: 160, y: 400 })
    expect(station.flags['rpg:active-crafting-entity']).toBeUndefined()
  })
})
