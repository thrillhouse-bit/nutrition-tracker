// Act III playable-world geometry contract.
// Pure deterministic data assertions: no DOM, clock, network, or randomness.

import { describe, expect, it } from 'vitest'
import {
  ACT3_CONNECTIONS,
  ACT3_ENCOUNTERS,
  ACT3_MAIN_QUEST,
  ACT3_POCKETS,
  ACT3_SEASONAL_STATES,
  ACT3_SIDE_QUEST,
} from '../src/rpg/act3Content.js'
import {
  ACT3_RENDERABLE_MAPS,
  ACT3_RUNTIME_MAPS,
  act3RenderablePocketById,
  act3RuntimeEntityById,
  act3RuntimeExitById,
  act3RuntimeMapById,
  act3RuntimeMarkerById,
  act3RuntimeSpawnById,
  validateAct3Runtime,
} from '../src/rpg/act3Runtime.js'
import { findWorldPath, isWorldPointWalkable } from '../src/rpg/pathfinding.js'

const SAFE_MARGIN = 28
const pocketIds = Object.keys(ACT3_POCKETS)

function withinBounds(item, bounds, margin = 0) {
  return Number.isFinite(item.x) && Number.isFinite(item.y)
    && item.x >= margin && item.y >= margin
    && item.x <= bounds.w - margin && item.y <= bounds.h - margin
}

function pointInsideRect(item, rect) {
  return item.x >= rect.x && item.x <= rect.x + rect.w
    && item.y >= rect.y && item.y <= rect.y + rect.h
}

function interactionEndpoint(map, start, target, routeStateId) {
  const direct = Math.hypot(start.x - target.x, start.y - target.y)
  if (direct < 56) return start
  const path = findWorldPath(map, start, target, { routeStateId })
  const endpoint = path.at(-1)
  expect(endpoint, `${map.id}:${routeStateId}:${start.id || 'start'}→${target.id}`).toBeTruthy()
  return endpoint
}

function interactionEndpointDistance(map, start, target, routeStateId) {
  const endpoint = interactionEndpoint(map, start, target, routeStateId)
  return Math.hypot(endpoint.x - target.x, endpoint.y - target.y)
}

// Liang–Barsky segment/rectangle test. Runtime lanes are rejected even when
// only their traversable width (plus Kallias's radius) clips a solid.
function segmentHitsRect(a, b, rect) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let near = 0
  let far = 1
  const checks = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.w - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.h - a.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0 && q < 0) return false
    if (p === 0) continue
    const t = q / p
    if (p < 0) near = Math.max(near, t)
    else far = Math.min(far, t)
    if (near > far) return false
  }
  return true
}

function allEntities() {
  return Object.values(ACT3_RUNTIME_MAPS).flatMap((map) => map.entities)
}

describe('Act III renderable pockets', () => {
  it('supplies finite 960x540 runtime geometry for every authored pocket', () => {
    expect(Object.keys(ACT3_RUNTIME_MAPS).sort()).toEqual([...pocketIds].sort())
    for (const id of pocketIds) {
      const map = act3RuntimeMapById(id)
      expect(map.bounds).toEqual({ w: 960, h: 540 })
      expect(map.palette.name).toBe(id)
      expect(typeof map.themeId).toBe('string')
      expect(typeof map.decorSetId).toBe('string')
      expect(map.collisions.length).toBeGreaterThan(0)
      expect(map.traversalLanes.length).toBeGreaterThan(0)
    }
  })

  it('places every named spawn safely with finite facing', () => {
    for (const [mapId, pocket] of Object.entries(ACT3_POCKETS)) {
      const runtime = act3RuntimeMapById(mapId)
      for (const spawnId of Object.keys(pocket.spawns)) {
        const location = act3RuntimeSpawnById(mapId, spawnId)
        expect(location, `${mapId}:${spawnId}`).toBeTruthy()
        expect(location.id).toBe(spawnId)
        expect(Number.isFinite(location.facing)).toBe(true)
        expect(withinBounds(location, runtime.bounds, SAFE_MARGIN), `${mapId}:${spawnId} unsafe`).toBe(true)
        for (const collision of runtime.collisions) {
          expect(pointInsideRect(location, collision), `${mapId}:${spawnId} inside ${collision.id}`).toBe(false)
        }
      }
    }
  })

  it('keeps every traversal lane clear of collision solids at playable width', () => {
    for (const map of Object.values(ACT3_RUNTIME_MAPS)) {
      for (const lane of map.traversalLanes) {
        expect(lane.width).toBeGreaterThanOrEqual(44)
        expect(lane.points.length).toBeGreaterThanOrEqual(2)
        for (const point of lane.points) expect(withinBounds(point, map.bounds), `${map.id}:${lane.id}`).toBe(true)
        for (let index = 1; index < lane.points.length; index += 1) {
          for (const solid of map.collisions) {
            const padding = lane.width / 2 + 16
            const expanded = {
              x: solid.x - padding,
              y: solid.y - padding,
              w: solid.w + padding * 2,
              h: solid.h + padding * 2,
            }
            expect(
              segmentHitsRect(lane.points[index - 1], lane.points[index], expanded),
              `${map.id}:${lane.id} segment ${index - 1}-${index} blocked by ${solid.id}`,
            ).toBe(false)
          }
        }
      }
    }
  })

  it('returns independent merge copies without mutating static or runtime sources', () => {
    const staticBefore = JSON.stringify(ACT3_POCKETS)
    const runtimeBefore = JSON.stringify(ACT3_RUNTIME_MAPS)
    const merged = act3RenderablePocketById('winter-orchard')
    expect(merged.spawn).toMatchObject({ id: 'from-village', x: 74, y: 286 })
    expect(merged.spawns['from-village'].note).toBe(ACT3_POCKETS['winter-orchard'].spawns['from-village'].note)
    merged.entities[0].x = -1
    merged.spawns['from-village'].x = -1
    expect(JSON.stringify(ACT3_POCKETS)).toBe(staticBefore)
    expect(JSON.stringify(ACT3_RUNTIME_MAPS)).toBe(runtimeBefore)
    expect(ACT3_RENDERABLE_MAPS['winter-orchard'].spawn.x).toBe(74)
  })

  it('returns null for unknown IDs', () => {
    expect(act3RuntimeMapById('not-a-map')).toBeNull()
    expect(act3RuntimeSpawnById('wheat-village', 'not-a-spawn')).toBeNull()
    expect(act3RuntimeEntityById('wheat-village', 'not-an-entity')).toBeNull()
    expect(act3RuntimeMarkerById('wheat-village', 'not-a-marker')).toBeNull()
    expect(act3RuntimeExitById('not-an-exit')).toBeNull()
    expect(act3RenderablePocketById('not-a-map')).toBeNull()
  })
})

describe('Act III graph and encounter geometry', () => {
  it('matches every authored connection, arrival, return, and gate exactly', () => {
    expect(validateAct3Runtime()).toEqual([])
    for (const connection of ACT3_CONNECTIONS) {
      const runtimeExit = act3RuntimeExitById(connection.id)
      expect(runtimeExit).toEqual(expect.objectContaining({
        id: connection.id,
        toMapId: connection.to,
        spawnId: connection.arrivalSpawnId,
        returnSpawnId: connection.returnSpawnId,
        kind: connection.kind,
        gate: connection.gate || [],
      }))
      expect(act3RuntimeSpawnById(connection.to, connection.arrivalSpawnId)).toBeTruthy()
      expect(act3RuntimeSpawnById(connection.from, connection.returnSpawnId)).toBeTruthy()
    }
  })

  it('exposes one explicit combat activator on each encounter activation map', () => {
    const activators = Object.values(ACT3_RUNTIME_MAPS).flatMap((map) =>
      map.exits.filter((item) => item.kind === 'combat').map((item) => ({ ...item, mapId: map.id })))
    expect(new Set(activators.map((item) => item.encounterId))).toEqual(new Set(Object.keys(ACT3_ENCOUNTERS)))
    for (const encounter of Object.values(ACT3_ENCOUNTERS)) {
      expect(activators.find((item) => item.encounterId === encounter.id)?.mapId).toBe(encounter.activationMapId)
      expect(act3RuntimeSpawnById(encounter.returnMapId, encounter.returnSpawnId)).toBeTruthy()
    }
  })

  it('keeps the threshing route visibly gated by the joined covenant', () => {
    expect(act3RuntimeExitById('village-to-threshing').gate).toEqual([
      { kind: 'flag', flagId: 'act3-covenant-joined', value: true },
    ])
    for (const connection of ACT3_CONNECTIONS.filter((item) => item.id !== 'village-to-threshing')) {
      expect(act3RuntimeExitById(connection.id).gate).toEqual([])
    }
  })
})

describe('Act III objective hooks', () => {
  it('resolves every pocket landmark and quest NPC/entity/marker', () => {
    for (const [mapId, pocket] of Object.entries(ACT3_POCKETS)) {
      for (const landmarkId of pocket.landmarks) {
        expect(act3RuntimeMarkerById(mapId, landmarkId), `${mapId}:${landmarkId}`).toBeTruthy()
      }
    }
    const entities = allEntities()
    for (const quest of [ACT3_MAIN_QUEST, ACT3_SIDE_QUEST]) {
      for (const objective of quest.objectives) {
        for (const npcId of objective.speakerIds || (objective.npcId ? [objective.npcId] : [])) {
          expect(entities.find((item) => item.id === npcId && item.kind === 'npc'), `${objective.id}:${npcId}`).toBeTruthy()
        }
        for (const entityId of objective.entityIds || []) {
          expect(entities.find((item) => item.id === entityId), `${objective.id}:${entityId}`).toBeTruthy()
        }
        if (objective.markerId) {
          expect(act3RuntimeMarkerById(objective.mapId, objective.markerId), `${objective.id}:${objective.markerId}`).toBeTruthy()
        }
      }
    }
  })

  it('provides bounded optional-quest acceptance and both authored choice surfaces', () => {
    expect(act3RuntimeEntityById('winter-orchard', 'cup-between-seasons-invitation')).toMatchObject({
      sideQuest: 'sq-act3-cup-between-seasons',
    })
    expect(act3RuntimeEntityById('winter-orchard', 'seasonal-rite-table')).toMatchObject({
      kind: 'choice', choiceIds: ['rite-renewed', 'rite-released'],
    })
    expect(act3RuntimeEntityById('asphodel-gate', 'return-covenant-table')).toMatchObject({
      kind: 'choice', choiceIds: ['continuity-kept', 'departure-protected', 'witnessed-cycle'],
    })
  })

  it('gives every talk hook an explicit conversation identifier', () => {
    for (const entity of allEntities().filter((item) => item.kind === 'npc')) {
      expect(typeof entity.conversationId, entity.id).toBe('string')
      expect(entity.conversationId.length, entity.id).toBeGreaterThan(0)
    }
  })
})

describe('Act III seasonal runtime metadata', () => {
  it('uses only the two canonical season IDs and resolves every paired altar/lane', () => {
    for (const map of Object.values(ACT3_RUNTIME_MAPS).filter((item) => item.season)) {
      expect(ACT3_SEASONAL_STATES[map.season.initialStateId]).toBeTruthy()
      for (const altarId of map.season.altarIds) {
        expect(act3RuntimeEntityById(map.id, altarId)).toMatchObject({ kind: 'season-altar' })
      }
      for (const laneId of map.season.laneIds) {
        const runtimeLane = map.traversalLanes.find((item) => item.id === laneId)
        expect(runtimeLane, `${map.id}:${laneId}`).toBeTruthy()
        for (const stateId of runtimeLane.stateIds) expect(ACT3_SEASONAL_STATES[stateId]).toBeTruthy()
      }
    }
  })

  it('contains fixed authored placement semantics only', () => {
    const source = JSON.stringify(ACT3_RUNTIME_MAPS)
    expect(source).not.toMatch(/\b(?:random|rng|procedural)\b/i)
  })

  it('keeps both orchard altars reachable from every spawn and each other in either season', () => {
    const map = act3RuntimeMapById('winter-orchard')
    const altars = map.entities.filter((item) => item.kind === 'season-altar')
    const starts = [...Object.values(map.spawns), ...altars]

    for (const stateId of ['winter', 'harvest']) {
      for (const start of starts) {
        for (const altar of altars) {
          if (start.id === altar.id) continue
          expect(
            interactionEndpointDistance(map, start, altar, stateId),
            `${stateId}:${start.id}→${altar.id}`,
          ).toBeLessThan(56)
        }
      }
    }
  })

  it('keeps every Cup Between Seasons target reachable from every legitimate orchard arrival in harvest', () => {
    const map = act3RuntimeMapById('winter-orchard')
    const targets = [
      'vineyard-between', 'cup-between-seasons-invitation', 'ceremonial-cup', 'seasonal-rite-table',
    ].map((id) => act3RuntimeEntityById(map.id, id))

    for (const start of Object.values(map.spawns)) {
      for (const target of targets) {
        const path = findWorldPath(map, start, target, { routeStateId: 'harvest' })
        expect(path.length, `harvest:${start.id}→${target.id}`).toBeGreaterThan(0)
        expect(path.every((point) => isWorldPointWalkable(map, point, { routeStateId: 'harvest' })), `harvest:${start.id}→${target.id} walkability`).toBe(true)
        expect(Math.hypot(path.at(-1).x - target.x, path.at(-1).y - target.y), `harvest:${start.id}→${target.id} endpoint`).toBeLessThan(56)
      }
    }
  })

  it('leaves Kallias on walkable terrain after either altar changes the active season', () => {
    const map = act3RuntimeMapById('winter-orchard')
    const altars = map.entities.filter((item) => item.kind === 'season-altar')
    for (const altar of altars) {
      const previousStateId = altar.seasonId === 'winter' ? 'harvest' : 'winter'
      const start = altars.find((item) => item.id !== altar.id)
      const endpoint = interactionEndpoint(map, start, altar, previousStateId)
      expect(
        isWorldPointWalkable(map, endpoint, { routeStateId: altar.seasonId }),
        `${altar.id} is not walkable after switching to ${altar.seasonId}`,
      ).toBe(true)
    }
  })

  it('keeps both orchard exits and the guardian reachable from every spawn in either season', () => {
    const map = act3RuntimeMapById('winter-orchard')
    const targets = map.exits
    for (const stateId of ['winter', 'harvest']) {
      for (const start of Object.values(map.spawns)) {
        for (const target of targets) {
          expect(
            interactionEndpointDistance(map, start, target, stateId),
            `${stateId}:${start.id}→${target.id}`,
          ).toBeLessThan(56)
        }
      }
    }
  })

  it('keeps the ordered Kore Sanctuary seals physically reachable from every arrival in either season', () => {
    const map = act3RuntimeMapById('kore-sanctuary')
    const seals = ['pomegranate-seal-1', 'pomegranate-seal-2', 'pomegranate-seal-3', 'pomegranate-seal-4']
      .map((id) => act3RuntimeEntityById(map.id, id))
    for (const stateId of ['winter', 'harvest']) {
      for (const start of Object.values(map.spawns)) {
        for (const seal of seals) {
          expect(interactionEndpointDistance(map, start, seal, stateId), `${stateId}:${start.id}→${seal.id}`).toBeLessThan(56)
        }
      }
    }
  })

  it('keeps the Asphodel Return Covenant table physically reachable from both arrivals in either season', () => {
    const map = act3RuntimeMapById('asphodel-gate')
    const table = act3RuntimeEntityById(map.id, 'return-covenant-table')
    for (const stateId of ['winter', 'harvest']) {
      for (const start of Object.values(map.spawns)) {
        expect(interactionEndpointDistance(map, start, table, stateId), `${stateId}:${start.id}→${table.id}`).toBeLessThan(56)
      }
    }
  })

  it('separates every orchard semantic target by at least one 48px hit target', () => {
    const map = act3RuntimeMapById('winter-orchard')
    const targets = [...map.entities, ...map.exits]
    for (let index = 0; index < targets.length; index += 1) {
      for (let other = index + 1; other < targets.length; other += 1) {
        expect(
          Math.hypot(targets[index].x - targets[other].x, targets[index].y - targets[other].y),
          `${targets[index].id} overlaps ${targets[other].id}`,
        ).toBeGreaterThanOrEqual(48)
      }
    }
  })
})
