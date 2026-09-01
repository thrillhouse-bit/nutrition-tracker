// Act IV playable-world geometry contract.
// Pure deterministic assertions: no DOM, clock, network, or randomness.

import { describe, expect, it } from 'vitest'
import {
  ACT4_ATLAS_IDENTITY,
  ACT4_CONNECTIONS,
  ACT4_ENCOUNTERS,
  ACT4_MAIN_QUEST,
  ACT4_POCKETS,
  ACT4_PRESSURE_LANES,
  ACT4_PRESSURE_STATES,
  ACT4_SIDE_QUEST,
} from '../src/rpg/act4Content.js'
import {
  ACT4_RENDERABLE_MAPS,
  ACT4_RUNTIME_MAPS,
  act4RenderablePocketById,
  act4RuntimeEntityById,
  act4RuntimeExitById,
  act4RuntimeMapById,
  act4RuntimeMarkerById,
  act4RuntimeSpawnById,
  validateAct4Runtime,
} from '../src/rpg/act4Runtime.js'

const SAFE_MARGIN = 28
const PLAYER_RADIUS = 16
const pocketIds = Object.keys(ACT4_POCKETS)

function withinBounds(point, bounds, margin = 0) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= margin && point.y >= margin
    && point.x <= bounds.w - margin && point.y <= bounds.h - margin
}

function pointInsideExpandedRect(point, rect, padding = 0) {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.w + padding
    && point.y >= rect.y - padding && point.y <= rect.y + rect.h + padding
}

// Liang-Barsky segment/AABB intersection, expanded by the player radius. A
// centerline intersection means the shared collision clamp and authored lane
// disagree about where Kallias may stand.
function segmentIntersectsExpandedRect(a, b, rect, padding = 0) {
  const x0 = rect.x - padding
  const y0 = rect.y - padding
  const x1 = rect.x + rect.w + padding
  const y1 = rect.y + rect.h + padding
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

function allEntities() {
  return Object.values(ACT4_RUNTIME_MAPS).flatMap((map) => map.entities)
}

describe('Act IV renderable pockets', () => {
  it('supplies finite 960x540 geometry and a renderer palette for every pocket', () => {
    expect(Object.keys(ACT4_RUNTIME_MAPS).sort()).toEqual(pocketIds.sort())
    for (const id of pocketIds) {
      const map = act4RuntimeMapById(id)
      expect(map, `${id} runtime map missing`).toBeTruthy()
      expect(map.bounds).toEqual({ w: 960, h: 540 })
      expect(map.palette.name).toBe(id)
      for (const key of ['sky', 'skyLow', 'sun', 'marble', 'marbleMid', 'marbleShadow', 'stone', 'stoneDark', 'gold', 'glow', 'ink', 'outline', 'danger', 'void', 'path']) {
        expect(typeof map.palette[key], `${id}:${key}`).toBe('string')
      }
      expect(typeof map.themeId).toBe('string')
      expect(typeof map.decorSetId).toBe('string')
      expect(map.collisions.length).toBeGreaterThan(0)
      expect(map.traversalLanes.length).toBeGreaterThan(0)
    }
  })

  it('gives every named spawn safe finite coordinates and facing', () => {
    for (const [mapId, pocket] of Object.entries(ACT4_POCKETS)) {
      const runtime = act4RuntimeMapById(mapId)
      expect(Object.keys(runtime.spawns).sort()).toEqual(Object.keys(pocket.spawns).sort())
      for (const spawnId of Object.keys(pocket.spawns)) {
        const location = act4RuntimeSpawnById(mapId, spawnId)
        expect(location, `${mapId}:${spawnId}`).toBeTruthy()
        expect(location.id).toBe(spawnId)
        expect(Number.isFinite(location.facing), `${mapId}:${spawnId} facing`).toBe(true)
        expect(withinBounds(location, runtime.bounds, SAFE_MARGIN), `${mapId}:${spawnId} bounds`).toBe(true)
        for (const collision of runtime.collisions) {
          expect(pointInsideExpandedRect(location, collision, PLAYER_RADIUS), `${mapId}:${spawnId} too close to ${collision.id}`).toBe(false)
        }
      }
    }
  })

  it('keeps all entities, exits, collisions, and lane points inside their maps', () => {
    for (const map of Object.values(ACT4_RUNTIME_MAPS)) {
      for (const item of [...map.entities, ...map.exits]) {
        expect(withinBounds(item, map.bounds, SAFE_MARGIN), `${map.id}:${item.id}`).toBe(true)
        for (const collision of map.collisions) {
          expect(pointInsideExpandedRect(item, collision, PLAYER_RADIUS), `${map.id}:${item.id} too close to ${collision.id}`).toBe(false)
        }
      }
      for (const rect of map.collisions) {
        expect(rect.kind).toBe('solid')
        expect(rect.w).toBeGreaterThan(0)
        expect(rect.h).toBeGreaterThan(0)
        expect(withinBounds(rect, map.bounds), `${map.id}:${rect.id} origin`).toBe(true)
        expect(rect.x + rect.w).toBeLessThanOrEqual(map.bounds.w)
        expect(rect.y + rect.h).toBeLessThanOrEqual(map.bounds.h)
      }
      for (const authoredLane of map.traversalLanes) {
        expect(authoredLane.width, `${map.id}:${authoredLane.id} width`).toBeGreaterThanOrEqual(44)
        expect(authoredLane.points.length, `${map.id}:${authoredLane.id} points`).toBeGreaterThanOrEqual(2)
        expect(authoredLane.stateIds.length, `${map.id}:${authoredLane.id} states`).toBeGreaterThan(0)
        for (const stateId of authoredLane.stateIds) expect(ACT4_PRESSURE_STATES[stateId], `${authoredLane.id}:${stateId}`).toBeTruthy()
        for (const authoredPoint of authoredLane.points) expect(withinBounds(authoredPoint, map.bounds), `${map.id}:${authoredLane.id}`).toBe(true)
      }
    }
  })

  it('keeps every traversal centerline clear of player-expanded solid geometry', () => {
    for (const map of Object.values(ACT4_RUNTIME_MAPS)) {
      for (const authoredLane of map.traversalLanes) {
        for (let index = 1; index < authoredLane.points.length; index += 1) {
          for (const collision of map.collisions) {
            expect(
              segmentIntersectsExpandedRect(authoredLane.points[index - 1], authoredLane.points[index], collision, PLAYER_RADIUS),
              `${map.id}:${authoredLane.id} segment ${index - 1}-${index} crosses ${collision.id}`,
            ).toBe(false)
          }
        }
      }
    }
  })

  it('merges static semantics and runtime geometry without mutating either source', () => {
    const staticBefore = JSON.stringify(ACT4_POCKETS)
    const runtimeBefore = JSON.stringify(ACT4_RUNTIME_MAPS)
    const merged = act4RenderablePocketById('slag-road')
    expect(merged.name).toBe(ACT4_POCKETS['slag-road'].name)
    expect(merged.spawn).toEqual(expect.objectContaining({ id: 'refugee-camp', x: 150, y: 382 }))
    expect(merged.spawns['refugee-camp'].note).toBe(ACT4_POCKETS['slag-road'].spawns['refugee-camp'].note)
    merged.entities[0].x = -1
    merged.spawns['refugee-camp'].x = -1
    expect(JSON.stringify(ACT4_POCKETS)).toBe(staticBefore)
    expect(JSON.stringify(ACT4_RUNTIME_MAPS)).toBe(runtimeBefore)
    expect(ACT4_RENDERABLE_MAPS['slag-road'].spawn.x).toBe(150)
  })

  it('returns null for unknown runtime IDs', () => {
    expect(act4RuntimeMapById('not-a-pocket')).toBeNull()
    expect(act4RuntimeSpawnById('slag-road', 'not-a-spawn')).toBeNull()
    expect(act4RuntimeEntityById('slag-road', 'not-an-entity')).toBeNull()
    expect(act4RuntimeMarkerById('slag-road', 'not-a-marker')).toBeNull()
    expect(act4RuntimeExitById('not-an-exit')).toBeNull()
    expect(act4RenderablePocketById('not-a-pocket')).toBeNull()
  })
})

describe('Act IV graph and activation geometry', () => {
  it('matches every authored connection exactly, including plan and gate semantics', () => {
    expect(validateAct4Runtime()).toEqual([])
    for (const connection of ACT4_CONNECTIONS) {
      const exit = act4RuntimeExitById(connection.id)
      expect(exit).toEqual(expect.objectContaining({
        id: connection.id,
        toMapId: connection.to,
        spawnId: connection.arrivalSpawnId,
        returnSpawnId: connection.returnSpawnId,
        kind: connection.kind,
        gate: connection.gate || [],
      }))
      expect(exit.planId || null).toBe(connection.planId || null)
      expect(typeof exit.label).toBe('string')
      expect(act4RuntimeSpawnById(connection.to, connection.arrivalSpawnId)).toBeTruthy()
      expect(act4RuntimeSpawnById(connection.from, connection.returnSpawnId)).toBeTruthy()
    }
  })

  it('keeps both plan-specific first edges on the same required encounter graph', () => {
    const planEdges = ACT4_CONNECTIONS.filter((connection) => connection.planId)
    expect(planEdges.map((edge) => edge.planId).sort()).toEqual(['ares-direct-breach', 'athena-precise-route'])
    expect(new Set(planEdges.map((edge) => `${edge.from}:${edge.to}`))).toEqual(new Set(['slag-road:bronze-foundry']))

    const adjacency = new Map(pocketIds.map((id) => [id, []]))
    for (const connection of ACT4_CONNECTIONS) adjacency.get(connection.from).push(connection.to)
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

  it('provides one explicit bounded world activator for every encounter', () => {
    const activators = Object.values(ACT4_RUNTIME_MAPS)
      .flatMap((map) => map.exits.map((exit) => ({ mapId: map.id, exit })))
      .filter(({ exit }) => exit.kind === 'combat')
    expect(activators).toHaveLength(Object.keys(ACT4_ENCOUNTERS).length)
    expect(new Set(activators.map(({ exit }) => exit.encounterId))).toEqual(new Set(Object.keys(ACT4_ENCOUNTERS)))
    for (const { mapId, exit } of activators) {
      const encounter = ACT4_ENCOUNTERS[exit.encounterId]
      expect(mapId, `${exit.id} activation map`).toBe(encounter.activationMapId)
      expect(typeof exit.label).toBe('string')
      expect(exit.gate).toEqual([])
      expect(
        ACT4_RUNTIME_MAPS[mapId].entities.some((entity) => entity.x === exit.x && entity.y === exit.y),
        `${exit.id} is masked by an entity at the same interaction point`,
      ).toBe(false)
      expect(act4RuntimeSpawnById(encounter.returnMapId, encounter.returnSpawnId), `${encounter.id} return spawn`).toBeTruthy()
    }
  })
})

describe('Act IV objective and mechanic hooks', () => {
  it('resolves every authored landmark and objective entity to geometry', () => {
    for (const [mapId, pocket] of Object.entries(ACT4_POCKETS)) {
      for (const landmarkId of pocket.landmarks) {
        expect(act4RuntimeMarkerById(mapId, landmarkId), `${mapId}:${landmarkId}`).toBeTruthy()
      }
    }

    const entities = allEntities()
    const ids = entities.map((entity) => entity.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const quest of [ACT4_MAIN_QUEST, ACT4_SIDE_QUEST]) {
      for (const objective of quest.objectives) {
        for (const entityId of objective.entityIds || []) {
          expect(entities.find((entity) => entity.id === entityId), `${objective.id}:${entityId}`).toBeTruthy()
        }
        if (objective.markerId) {
          expect(act4RuntimeMarkerById(objective.mapId, objective.markerId), `${objective.id}:${objective.markerId}`).toBeTruthy()
        }
      }
    }
  })

  it('exposes exact choice activators for all three authored choice objectives', () => {
    const choiceEntities = allEntities().filter((entity) => entity.kind === 'choice')
    for (const objective of ACT4_MAIN_QUEST.objectives.filter((item) => item.kind === 'choose')) {
      const activator = choiceEntities.find((entity) => entity.objectiveId === objective.id)
      expect(activator, objective.id).toBeTruthy()
      expect(activator.choiceIds).toEqual(objective.choiceIds)
      expect(typeof activator.label).toBe('string')
    }
  })

  it('provides an optional-quest acceptance hook and every optional interaction', () => {
    expect(act4RuntimeEntityById('atlas-vault', 'one-more-sky-invitation')).toMatchObject({
      kind: 'interact',
      sideQuest: ACT4_SIDE_QUEST.id,
    })
    for (const id of ['collapsed-side-vault', 'gate-hercules-lift', 'gate-counterweight', 'constellation-tablets']) {
      expect(act4RuntimeMarkerById('atlas-vault', id), id).toBeTruthy()
    }
  })

  it('keeps Atlas the NPC structurally distinct from the atlas monster ID', () => {
    expect(ACT4_ATLAS_IDENTITY.idsAreDistinct).toBe(true)
    expect(act4RuntimeEntityById('atlas-vault', ACT4_ATLAS_IDENTITY.npcId)).toMatchObject({ kind: 'npc', identityRole: 'coerced-witness' })
    expect(allEntities().find((entity) => entity.id === ACT4_ATLAS_IDENTITY.monsterTypeId)).toBeUndefined()
  })

  it('maps all three pressure lanes and every visible valve to runtime geometry', () => {
    const foundry = ACT4_RUNTIME_MAPS['bronze-foundry']
    expect(foundry.pressure.initialStateId).toBe('safe')
    expect(foundry.pressure.laneIds).toEqual(ACT4_PRESSURE_LANES)
    for (const laneId of ACT4_PRESSURE_LANES) {
      const authoredLane = foundry.traversalLanes.find((item) => item.id === laneId)
      expect(authoredLane, laneId).toBeTruthy()
      expect(authoredLane.stateIds).toEqual(Object.keys(ACT4_PRESSURE_STATES))
    }
    for (const valveId of foundry.pressure.valveIds) {
      expect(act4RuntimeEntityById('bronze-foundry', valveId)).toMatchObject({ kind: 'pressure-valve' })
    }
    for (const map of Object.values(ACT4_RUNTIME_MAPS)) {
      expect(ACT4_PRESSURE_STATES[map.pressure.initialStateId]).toBeTruthy()
      for (const laneId of map.pressure.laneIds) expect(map.traversalLanes.find((item) => item.id === laneId), `${map.id}:${laneId}`).toBeTruthy()
      for (const valveId of map.pressure.valveIds) expect(act4RuntimeEntityById(map.id, valveId), `${map.id}:${valveId}`).toBeTruthy()
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
    inspect(ACT4_RUNTIME_MAPS)
  })
})
