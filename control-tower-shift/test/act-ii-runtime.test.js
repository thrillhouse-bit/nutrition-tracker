// Act II playable-world geometry contract.
// Pure deterministic data assertions: no DOM, clock, network, or randomness.

import { describe, expect, it } from 'vitest'
import {
  ACT2_CONNECTIONS,
  ACT2_ENCOUNTERS,
  ACT2_MAIN_QUEST,
  ACT2_POCKETS,
  ACT2_SIDE_QUEST,
  ACT2_TIDE_STATES,
} from '../src/rpg/act2Content.js'
import {
  ACT2_RENDERABLE_MAPS,
  ACT2_RUNTIME_MAPS,
  act2RenderablePocketById,
  act2RuntimeEntityById,
  act2RuntimeExitById,
  act2RuntimeMapById,
  act2RuntimeMarkerById,
  act2RuntimeSpawnById,
  validateAct2Runtime,
} from '../src/rpg/act2Runtime.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'

const SAFE_MARGIN = 28
const pocketIds = Object.keys(ACT2_POCKETS)

function withinBounds(point, bounds, margin = 0) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= margin && point.y >= margin
    && point.x <= bounds.w - margin && point.y <= bounds.h - margin
}

function pointInsideRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w
    && point.y >= rect.y && point.y <= rect.y + rect.h
}

function interactionEndpointDistance(map, start, target, routeStateId) {
  const direct = Math.hypot(start.x - target.x, start.y - target.y)
  if (direct < 56) return direct
  const path = findWorldPath(map, start, target, { routeStateId })
  const endpoint = path.at(-1)
  expect(endpoint, `${map.id}:${routeStateId}:${start.id || 'start'}→${target.id}`).toBeTruthy()
  return Math.hypot(endpoint.x - target.x, endpoint.y - target.y)
}

function allEntities() {
  return Object.values(ACT2_RUNTIME_MAPS).flatMap((map) => map.entities)
}

describe('Act II renderable pockets', () => {
  it('provides explicit world activators for every authored encounter', () => {
    const activators = Object.values(ACT2_RUNTIME_MAPS)
      .flatMap((map) => map.exits)
      .filter((exit) => exit.kind === 'combat')
    expect(new Set(activators.map((exit) => exit.encounterId))).toEqual(new Set([
      'enc-act2-breakwater',
      'enc-act2-nereid-caves',
      'enc-act2-anchorage',
      'boss-act2-archive-leviathan',
      'enc-act2-unmoored-charmed',
    ]))
  })

  it('exposes bounded hooks for optional-quest acceptance and covenant ratification', () => {
    expect(act2RuntimeEntityById('nereid-caves', 'unmoored-heart-invitation')).toMatchObject({ sideQuest: 'sq-act2-unmoored-heart' })
    expect(act2RuntimeEntityById('pelagos-harbor', 'salt-covenant-table')).toMatchObject({
      kind: 'choice',
      choiceIds: ['harbor-first', 'boundary-first', 'shared-crossing'],
    })
  })

  it('supplies one finite, nonzero authored map for every static pocket', () => {
    expect(Object.keys(ACT2_RUNTIME_MAPS).sort()).toEqual(pocketIds.sort())
    for (const id of pocketIds) {
      const map = act2RuntimeMapById(id)
      expect(map, `${id} runtime map missing`).toBeTruthy()
      expect(Number.isFinite(map.bounds.w), `${id} width`).toBe(true)
      expect(Number.isFinite(map.bounds.h), `${id} height`).toBe(true)
      expect(map.bounds.w).toBeGreaterThan(0)
      expect(map.bounds.h).toBeGreaterThan(0)
      expect(typeof map.themeId).toBe('string')
      expect(typeof map.decorSetId).toBe('string')
      expect(map.palette.name).toBe(id)
    }
  })

  it('gives every named spawn stable safe coordinates and facing', () => {
    for (const [mapId, pocket] of Object.entries(ACT2_POCKETS)) {
      const runtime = act2RuntimeMapById(mapId)
      for (const spawnId of Object.keys(pocket.spawns)) {
        const location = act2RuntimeSpawnById(mapId, spawnId)
        expect(location, `${mapId}:${spawnId}`).toBeTruthy()
        expect(location.id).toBe(spawnId)
        expect(Number.isFinite(location.facing), `${mapId}:${spawnId} facing`).toBe(true)
        expect(withinBounds(location, runtime.bounds, SAFE_MARGIN), `${mapId}:${spawnId} unsafe`).toBe(true)
        for (const collision of runtime.collisions) {
          expect(pointInsideRect(location, collision), `${mapId}:${spawnId} inside ${collision.id}`).toBe(false)
        }
      }
    }
  })

  it('provides bounded collision rectangles and readable authored lanes', () => {
    for (const map of Object.values(ACT2_RUNTIME_MAPS)) {
      expect(map.collisions.length, `${map.id} collisions`).toBeGreaterThan(0)
      expect(map.traversalLanes.length, `${map.id} lanes`).toBeGreaterThan(0)
      for (const rect of map.collisions) {
        expect(rect.kind).toBe('solid')
        expect(rect.w).toBeGreaterThan(0)
        expect(rect.h).toBeGreaterThan(0)
        expect(withinBounds(rect, map.bounds), `${map.id}:${rect.id} origin`).toBe(true)
        expect(rect.x + rect.w).toBeLessThanOrEqual(map.bounds.w)
        expect(rect.y + rect.h).toBeLessThanOrEqual(map.bounds.h)
      }
      for (const lane of map.traversalLanes) {
        expect(lane.width, `${map.id}:${lane.id} width`).toBeGreaterThanOrEqual(44)
        expect(lane.points.length, `${map.id}:${lane.id} points`).toBeGreaterThanOrEqual(2)
        expect(lane.stateIds.length, `${map.id}:${lane.id} states`).toBeGreaterThan(0)
        for (const stateId of lane.stateIds) expect(ACT2_TIDE_STATES[stateId]).toBeTruthy()
        for (const p of lane.points) expect(withinBounds(p, map.bounds), `${map.id}:${lane.id} point`).toBe(true)
      }
    }
  })

  it('merges geometry with static definitions without mutating either source', () => {
    const staticBefore = JSON.stringify(ACT2_POCKETS)
    const runtimeBefore = JSON.stringify(ACT2_RUNTIME_MAPS)
    const merged = act2RenderablePocketById('pelagos-harbor')
    expect(merged.name).toBe(ACT2_POCKETS['pelagos-harbor'].name)
    expect(merged.spawn).toEqual(expect.objectContaining({ id: 'keeper-jetty', x: 150, y: 382 }))
    expect(merged.spawns['keeper-jetty'].note).toBe(ACT2_POCKETS['pelagos-harbor'].spawns['keeper-jetty'].note)
    merged.entities[0].x = -1
    merged.spawns['keeper-jetty'].x = -1
    expect(JSON.stringify(ACT2_POCKETS)).toBe(staticBefore)
    expect(JSON.stringify(ACT2_RUNTIME_MAPS)).toBe(runtimeBefore)
    expect(ACT2_RENDERABLE_MAPS['pelagos-harbor'].spawn.x).toBe(150)
  })

  it('returns null for unknown runtime IDs', () => {
    expect(act2RuntimeMapById('not-a-pocket')).toBeNull()
    expect(act2RuntimeSpawnById('pelagos-harbor', 'not-a-spawn')).toBeNull()
    expect(act2RuntimeEntityById('pelagos-harbor', 'not-an-entity')).toBeNull()
    expect(act2RuntimeMarkerById('pelagos-harbor', 'not-a-marker')).toBeNull()
    expect(act2RuntimeExitById('not-an-exit')).toBeNull()
    expect(act2RenderablePocketById('not-a-pocket')).toBeNull()
  })
})

describe('Act II graph geometry', () => {
  it('matches every static connection exactly, including gates and arrivals', () => {
    expect(validateAct2Runtime()).toEqual([])
    for (const connection of ACT2_CONNECTIONS) {
      const exit = act2RuntimeExitById(connection.id)
      expect(exit).toEqual(expect.objectContaining({
        id: connection.id,
        toMapId: connection.to,
        spawnId: connection.arrivalSpawnId,
        returnSpawnId: connection.returnSpawnId,
        kind: connection.kind,
        gate: connection.gate || [],
      }))
      expect(withinBounds(exit, ACT2_RUNTIME_MAPS[connection.from].bounds), connection.id).toBe(true)
      expect(act2RuntimeSpawnById(connection.to, connection.arrivalSpawnId)).toBeTruthy()
      expect(act2RuntimeSpawnById(connection.from, connection.returnSpawnId)).toBeTruthy()
    }
  })

  it('keeps every foot route reciprocal and the skiff circuit returnable', () => {
    const foot = ACT2_CONNECTIONS.filter((connection) => connection.kind === 'foot')
    for (const connection of foot) {
      const reverse = foot.find((candidate) => candidate.from === connection.to && candidate.to === connection.from)
      expect(reverse, `${connection.id} has no reverse foot route`).toBeTruthy()
      expect(reverse.arrivalSpawnId).toBe(connection.returnSpawnId)
      expect(reverse.returnSpawnId).toBe(connection.arrivalSpawnId)
    }

    const adjacency = new Map(pocketIds.map((id) => [id, []]))
    for (const connection of ACT2_CONNECTIONS) adjacency.get(connection.from).push(connection.to)
    for (const start of pocketIds) {
      const seen = new Set([start])
      const queue = [start]
      while (queue.length) {
        for (const next of adjacency.get(queue.shift())) {
          if (!seen.has(next)) { seen.add(next); queue.push(next) }
        }
      }
      expect([...seen].sort(), `${start} cannot traverse the full region`).toEqual([...pocketIds].sort())
    }
  })

  it('keeps the archive route visibly gated and all other gates empty', () => {
    for (const connection of ACT2_CONNECTIONS) {
      const exit = act2RuntimeExitById(connection.id)
      if (connection.id === 'anchorage-to-barge') {
        expect(exit.gate).toEqual([{ kind: 'flag', flagId: 'act2-anchorage-cleared', value: true }])
      } else {
        expect(exit.gate).toEqual([])
      }
    }
  })
})

describe('Act II objective and landmark resolution', () => {
  it('resolves every authored pocket landmark to geometry', () => {
    for (const [mapId, pocket] of Object.entries(ACT2_POCKETS)) {
      for (const landmarkId of pocket.landmarks) {
        expect(act2RuntimeMarkerById(mapId, landmarkId), `${mapId}:${landmarkId}`).toBeTruthy()
      }
    }
  })

  it('resolves every objective NPC, entity, and map marker', () => {
    const entities = allEntities()
    for (const quest of [ACT2_MAIN_QUEST, ACT2_SIDE_QUEST]) {
      for (const objective of quest.objectives) {
        if (objective.npcId) {
          expect(entities.find((entity) => entity.id === objective.npcId), `${objective.id}:${objective.npcId}`).toBeTruthy()
        }
        for (const entityId of objective.entityIds || []) {
          expect(entities.find((entity) => entity.id === entityId), `${objective.id}:${entityId}`).toBeTruthy()
        }
        if (objective.markerId) {
          expect(act2RuntimeMarkerById(objective.mapId, objective.markerId), `${objective.id}:${objective.markerId}`).toBeTruthy()
        }
      }
    }
  })

  it('places every encounter activation and return checkpoint on a real map', () => {
    for (const encounter of Object.values(ACT2_ENCOUNTERS)) {
      expect(act2RuntimeMapById(encounter.activationMapId), `${encounter.id} activation`).toBeTruthy()
      expect(act2RuntimeMapById(encounter.returnMapId), `${encounter.id} return`).toBeTruthy()
      expect(act2RuntimeSpawnById(encounter.returnMapId, encounter.returnSpawnId), `${encounter.id} return spawn`).toBeTruthy()
    }
  })
})

describe('Act II tide traversal metadata', () => {
  it('maps static tide lanes to authored breakwater geometry', () => {
    const lanes = new Map(ACT2_RUNTIME_MAPS['breakwater-road'].traversalLanes.map((item) => [item.id, item]))
    for (const state of Object.values(ACT2_TIDE_STATES)) {
      for (const laneId of state.walkableLanes) {
        expect(lanes.get(laneId), `${state.id}:${laneId}`).toBeTruthy()
        expect(lanes.get(laneId).stateIds).toContain(state.id)
      }
      for (const laneId of state.lockedLanes) {
        expect(lanes.get(laneId), `${state.id}:${laneId}`).toBeTruthy()
        expect(lanes.get(laneId).stateIds).not.toContain(state.id)
      }
    }
  })

  it('resolves every well, skiff node, and rope lift to an authored entity', () => {
    for (const map of Object.values(ACT2_RUNTIME_MAPS)) {
      for (const laneId of map.tide.laneIds) {
        expect(map.traversalLanes.find((item) => item.id === laneId), `${map.id}:${laneId}`).toBeTruthy()
      }
      for (const id of [...map.tide.wellIds, ...map.tide.skiffNodeIds, ...map.tide.ropeLiftIds]) {
        expect(act2RuntimeEntityById(map.id, id), `${map.id}:${id}`).toBeTruthy()
      }
    }
  })

  it('keeps breakwater controllers, exits, and combat within strict interaction range in every tide state', () => {
    const map = ACT2_RUNTIME_MAPS['breakwater-road']
    const starts = ['from-harbor', 'from-caves', 'surge-witness'].map((id) => map.spawns[id])
    const targets = [
      ...['tide-well-harbor', 'tide-well-caves'].map((id) => map.entities.find((entity) => entity.id === id)),
      ...['breakwater-to-harbor', 'breakwater-to-caves', 'combat-act2-breakwater'].map((id) => map.exits.find((exit) => exit.id === id)),
    ]

    for (const routeStateId of ['ebb', 'crossing', 'surge']) {
      for (const start of starts) {
        for (const target of targets) {
          const distance = interactionEndpointDistance(map, start, target, routeStateId)
          expect(distance, `${routeStateId}:${start.id}→${target.id}`).toBeLessThan(56)
        }
      }
    }
  })

  it('keeps the First Surge witness reachable when its objective is active and separates every semantic target', () => {
    const map = ACT2_RUNTIME_MAPS['breakwater-road']
    const witness = map.entities.find((entity) => entity.id === 'surge-witness')
    for (const routeStateId of ['ebb', 'crossing']) {
      for (const startId of ['from-harbor', 'from-caves', 'surge-witness']) {
        const distance = interactionEndpointDistance(map, map.spawns[startId], witness, routeStateId)
        expect(distance, `${routeStateId}:${startId}→${witness.id}`).toBeLessThan(56)
      }
    }

    const semanticTargets = [...map.entities, ...map.exits]
    for (let left = 0; left < semanticTargets.length; left += 1) {
      for (let right = left + 1; right < semanticTargets.length; right += 1) {
        const a = semanticTargets[left]
        const b = semanticTargets[right]
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id}↔${b.id}`).toBeGreaterThanOrEqual(48)
      }
    }
  })

  it('contains only fixed authored placement semantics', () => {
    const forbidden = /\b(?:wave|random|rng|procedural)\b/i
    function inspect(value) {
      if (typeof value === 'string') expect(value).not.toMatch(forbidden)
      else if (Array.isArray(value)) value.forEach(inspect)
      else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          expect(key).not.toMatch(forbidden)
          inspect(item)
        }
      }
    }
    inspect(ACT2_RUNTIME_MAPS)
  })
})
