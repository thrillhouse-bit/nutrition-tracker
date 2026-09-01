import { describe, expect, it } from 'vitest'
import { mapById } from '../src/rpg/content.js'
import { ACT5_RUNTIME_MAPS } from '../src/rpg/act5Runtime.js'
import { findWorldPath, isWorldPointWalkable } from '../src/rpg/pathfinding.js'

function act5Target(map, id) {
  return map.entities.find((entity) => entity.id === id)
    || map.exits.find((exit) => exit.id === id)
    || map.spawns[id]
}

function expectAct5Route(mapId, routeStateId, startId, targetIds) {
  const map = ACT5_RUNTIME_MAPS[mapId]
  const start = act5Target(map, startId)
  expect(start, `${mapId}:${startId}`).toBeTruthy()
  for (const targetId of targetIds) {
    const target = act5Target(map, targetId)
    expect(target, `${mapId}:${targetId}`).toBeTruthy()
    const path = findWorldPath(map, start, target, { routeStateId })
    expect(path.length, `${mapId}:${routeStateId}:${startId}->${targetId}`).toBeGreaterThan(0)
    const last = path.at(-1)
    expect(Math.hypot(last.x - target.x, last.y - target.y), `${mapId}:${routeStateId}:${targetId}`).toBeLessThan(56)
    expect(path.every((point) => isWorldPointWalkable(map, point, { routeStateId })), `${mapId}:${routeStateId}:${targetId} walkability`).toBe(true)
  }
}

describe('collision-aware RPG pathfinding', () => {
  it('finds a finite walkable route from the Act I spawn to Thessa', () => {
    const map = mapById('beacon-overlook')
    const thessa = map.entities.find((entity) => entity.id === 'thessa')
    const path = findWorldPath(map, map.spawn, thessa)

    expect(path.length).toBeGreaterThan(0)
    expect(path.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(path.every((point) => isWorldPointWalkable(map, point))).toBe(true)
    expect(Math.hypot(path.at(-1).x - thessa.x, path.at(-1).y - thessa.y)).toBeLessThan(24)
  })

  it('routes around expanded collision geometry instead of crossing it', () => {
    const map = {
      id: 'test-road', bounds: { w: 400, h: 300 }, decor: [],
      collisions: [{ id: 'wall', x: 180, y: 40, w: 40, h: 180 }],
    }
    const path = findWorldPath(map, { x: 100, y: 100 }, { x: 300, y: 100 })

    expect(path.length).toBeGreaterThan(1)
    expect(path.every((point) => isWorldPointWalkable(map, point))).toBe(true)
    expect(path.some((point) => point.y >= 240)).toBe(true)
  })

  it('returns no route when a solid divides the entire playable world', () => {
    const map = {
      id: 'sealed-road', bounds: { w: 400, h: 300 }, decor: [],
      collisions: [{ id: 'wall', x: 180, y: 0, w: 40, h: 400 }],
    }
    expect(findWorldPath(map, { x: 100, y: 100 }, { x: 300, y: 100 })).toEqual([])
  })

  it('keeps every Night Stair polarity recoverable while blocking inactive branches', () => {
    expectAct5Route('night-stair', 'shadow', 'from-foothold', [
      'memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4',
      'nyx-seal', 'selene-witness', 'combat-act5-night-stair', 'night-stair-to-foothold',
    ])
    expectAct5Route('night-stair', 'moon', 'from-false-sky', [
      'selene', 'nyx-seal', 'selene-witness', 'night-stair-to-false-sky',
    ])
    expectAct5Route('night-stair', 'sun', 'from-false-sky', ['nyx-seal', 'selene-witness'])

    const map = ACT5_RUNTIME_MAPS['night-stair']
    expect(isWorldPointWalkable(map, act5Target(map, 'selene'), { routeStateId: 'shadow' })).toBe(false)
    expect(isWorldPointWalkable(map, act5Target(map, 'selene'), { routeStateId: 'sun' })).toBe(false)
    for (const controllerId of ['nyx-seal', 'selene-witness']) {
      const controller = act5Target(map, controllerId)
      for (const stateId of ['shadow', 'moon', 'sun']) {
        expect(isWorldPointWalkable(map, controller, { routeStateId: stateId }), `${controllerId}:${stateId}`).toBe(true)
      }
    }
  })

  it('keeps every False Sky polarity recoverable and requires sun for its forward branch', () => {
    expectAct5Route('false-sky', 'moon', 'from-night-stair', [
      'helios', 'sun-mirror-1', 'selene-return-witness', 'false-sky-to-night-stair',
    ])
    expectAct5Route('false-sky', 'sun', 'from-approach', [
      'sun-mirror-1', 'selene-return-witness', 'sun-mirror-2', 'sun-mirror-3',
      'fracture-room-a', 'fracture-room-b', 'fracture-exit', 'false-sky-to-loom-approach',
    ])
    expectAct5Route('false-sky', 'shadow', 'from-night-stair', ['sun-mirror-1', 'selene-return-witness'])

    const map = ACT5_RUNTIME_MAPS['false-sky']
    expect(isWorldPointWalkable(map, act5Target(map, 'sun-mirror-3'), { routeStateId: 'moon' })).toBe(false)
    expect(isWorldPointWalkable(map, act5Target(map, 'fracture-exit'), { routeStateId: 'shadow' })).toBe(false)
    for (const controllerId of ['sun-mirror-1', 'selene-return-witness']) {
      const controller = act5Target(map, controllerId)
      for (const stateId of ['shadow', 'moon', 'sun']) {
        expect(isWorldPointWalkable(map, controller, { routeStateId: stateId }), `${controllerId}:${stateId}`).toBe(true)
      }
    }
  })

  it('keeps return and checkpoint spawns within one safe route of an objective or controller', () => {
    expectAct5Route('night-stair', 'shadow', 'anchors-stable', ['nyx-seal', 'selene-witness'])
    expectAct5Route('night-stair', 'moon', 'selene-overlook', ['selene', 'selene-witness'])
    expectAct5Route('false-sky', 'sun', 'mirrors-aligned', ['sun-mirror-2', 'fracture-exit', 'false-sky-to-loom-approach'])
    expectAct5Route('false-sky', 'sun', 'from-approach', ['selene-return-witness'])
  })

  it('gives every Act V spawn a reachable objective or polarity controller in its authored state', () => {
    const safeTargetByMap = {
      'nyx-foothold': 'shadow-seal-first',
      'night-stair': 'nyx-seal',
      'false-sky': 'sun-mirror-1',
      'silent-loom-approach': 'seal-far-sighted',
      'silent-loom': 'accord-table',
      'accord-overlook': 'public-accord',
    }
    for (const [mapId, map] of Object.entries(ACT5_RUNTIME_MAPS)) {
      for (const spawn of Object.values(map.spawns)) {
        expectAct5Route(mapId, spawn.arrivalState.lightStateId, spawn.id, [safeTargetByMap[mapId]])
      }
    }
  })
})
