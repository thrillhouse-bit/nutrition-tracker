import { describe, expect, it } from 'vitest'
import { findWorldPath, isWorldPathStepReachable, isWorldPointWalkable } from '../src/rpg/pathfinding.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState, MAX_WORLD_MOVE_STEP } from '../src/rpg/state.js'

// Test-only legal movement: production only receives individual bounded MOVE
// events from the animation loop. This helper intentionally follows the
// registered collision-aware path in short steps; it is not an escape hatch.
function walkTo(state, map, target) {
  const path = findWorldPath(map, state.world.position, target, { routeStateId: state.flags['act2:tide-state'] })
  expect(path.length).toBeGreaterThan(0)
  let next = state
  for (const point of path) {
    const distance = Math.hypot(point.x - next.world.position.x, point.y - next.world.position.y)
    const steps = Math.max(1, Math.ceil(distance / (MAX_WORLD_MOVE_STEP / 2)))
    const from = next.world.position
    for (let index = 1; index <= steps; index += 1) {
      next = applyEvent(next, {
        type: 'MOVE',
        x: from.x + (point.x - from.x) * index / steps,
        y: from.y + (point.y - from.y) * index / steps,
      })
    }
  }
  return next
}

describe('world MOVE authority', () => {
  it('rejects one-event teleports before they can authorize a remote reward', () => {
    const initial = createInitialState()
    const map = rpgMapById(initial.world.mapId)
    const copper = map.entities.find((entity) => entity.id === 'copper-seam')
    const teleported = applyEvent(initial, { type: 'MOVE', x: copper.x, y: copper.y })
    expect(teleported).toBe(initial)
    expect(applyEvent(teleported, { type: 'GATHER', entityId: copper.id })).toBe(teleported)
  })

  it('rejects collision and inactive-lane coordinates even when the event is short', () => {
    const initial = createInitialState()
    const beacon = rpgMapById('nereid-caves')
    const collision = beacon.collisions[0]
    const intoWall = { x: collision.x + 1, y: collision.y + 1 }
    expect(isWorldPointWalkable(beacon, intoWall)).toBe(false)
    const wallState = { ...initial, world: { ...initial.world, regionId: beacon.region, mapId: beacon.id, spawnId: 'threshold', position: { x: collision.x - 20, y: collision.y + 1 } } }
    expect(applyEvent(wallState, { type: 'MOVE', ...intoWall })).toBe(wallState)

    const caves = rpgMapById('nereid-caves')
    const inactive = { x: 452, y: 420 }
    expect(isWorldPointWalkable(caves, inactive, { routeStateId: 'ebb' })).toBe(false)
    const caveState = {
      ...initial,
      flags: { ...initial.flags, 'act2:tide-state': 'ebb' },
      world: { ...initial.world, regionId: caves.region, mapId: caves.id, spawnId: 'threshold', position: { x: 430, y: 400 } },
    }
    expect(applyEvent(caveState, { type: 'MOVE', ...inactive })).toBe(caveState)
  })

  it('accepts bounded keyboard/click-equivalent path steps through normal world geometry', () => {
    const initial = createInitialState()
    const map = rpgMapById(initial.world.mapId)
    const bank = map.entities.find((entity) => entity.id === 'beacon-bank')
    const arrived = walkTo(initial, map, bank)
    expect(Math.hypot(arrived.world.position.x - bank.x, arrived.world.position.y - bank.y)).toBeLessThan(56)
    expect(applyEvent(arrived, { type: 'OPEN_BANK', entityId: bank.id }).flags['rpg:active-bank-entity']).toBe(bank.id)
  })

  it('never returns an adjacent-grid route across a thin Bronze Foundry collision edge', () => {
    const map = rpgMapById('bronze-foundry')
    const routeStateId = 'safe'
    // Both grid centers are individually valid, but their shared edge crosses
    // collision geometry. A reducer MOVE must reject that segment and A* must
    // route around it rather than advertising an unusable path.
    expect(isWorldPointWalkable(map, { x: 640, y: 380 }, { routeStateId })).toBe(true)
    expect(isWorldPointWalkable(map, { x: 660, y: 380 }, { routeStateId })).toBe(true)
    expect(isWorldPathStepReachable(map, { x: 640, y: 380 }, { x: 660, y: 380 }, { routeStateId })).toBe(false)

    const forge = map.entities.find((entity) => entity.id === 'bronze-foundry-forge')
    const path = findWorldPath(map, map.spawn, forge, { routeStateId })
    expect(path.length).toBeGreaterThan(0)
    const points = [{ x: map.spawn.x, y: map.spawn.y }, ...path]
    for (let index = 1; index < points.length; index += 1) {
      expect(isWorldPathStepReachable(map, points[index - 1], points[index], { routeStateId })).toBe(true)
    }
  })
})
