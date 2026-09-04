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
import { findWorldPath, isWorldPointWalkable } from '../src/rpg/pathfinding.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

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

  it('authors a Crossing-only west connector rather than pathing across the harbor/channel gap', () => {
    const map = ACT2_RUNTIME_MAPS['breakwater-road']
    const connector = map.traversalLanes.find((lane) => lane.id === 'crossing-harbor-connector')
    expect(connector).toMatchObject({ stateIds: ['crossing'], points: [{ x: 72, y: 274 }, { x: 60, y: 300 }] })
    const route = findWorldPath(map, map.spawns['from-harbor'], map.entities.find((entity) => entity.id === 'tide-well-harbor'), { routeStateId: 'crossing' })
    expect(route.length).toBeGreaterThan(0)
    expect(Math.hypot(route.at(-1).x - 286, route.at(-1).y - 292)).toBeLessThan(56)
  })

  it('keeps reciprocal Breakwater arrivals actionable when traversal preserves Surge', () => {
    const map = ACT2_RUNTIME_MAPS['breakwater-road']
    for (const spawnId of ['from-harbor', 'from-caves']) {
      const start = map.spawns[spawnId]
      expect(isWorldPointWalkable(map, start, { routeStateId: 'surge' }), spawnId).toBe(true)
      const route = findWorldPath(map, start, map.entities.find((entity) => entity.id === 'tide-well-harbor'), { routeStateId: 'surge' })
      expect(route.length, `${spawnId}: first Surge MOVE`).toBeGreaterThan(0)
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

  it('keeps every post-combat Nereid witness within the real interaction radius and records each release once', () => {
    const map = ACT2_RUNTIME_MAPS['nereid-caves']
    const witnesses = ['nereid-witness-1', 'nereid-witness-2', 'nereid-witness-3']
      .map((id) => map.entities.find((entity) => entity.id === id))

    for (const routeStateId of ['ebb', 'crossing', 'surge']) {
      for (const start of Object.values(map.spawns)) {
        for (const witness of witnesses) {
          const path = findWorldPath(map, start, witness, { routeStateId })
          expect(path.length, `${routeStateId}:${start.id}→${witness.id}`).toBeGreaterThan(0)
          expect(path.every((point) => isWorldPointWalkable(map, point, { routeStateId })), `${routeStateId}:${start.id}→${witness.id} walkability`).toBe(true)
          const endpoint = path.at(-1)
          expect(Math.hypot(endpoint.x - witness.x, endpoint.y - witness.y), `${routeStateId}:${start.id}→${witness.id}`).toBeLessThan(56)
        }
      }
    }

    let state = createInitialState()
    state = {
      ...state,
      status: 'playing',
      protagonist: { ...state.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
      mainQuestId: 'mq-act2-salt-covenant',
      flags: { ...state.flags, 'act2-nereid-caves-cleared': true, 'act2:tide-state': 'crossing' },
      quests: {
        ...state.quests,
        'mq-act2-salt-covenant': { state: 'active', objectiveIndex: 2, objectiveCounts: {} },
      },
      world: { regionId: 'pelagos-isles', mapId: 'nereid-caves', spawnId: 'threshold', position: { x: 216, y: 284 }, facing: 0 },
    }
    for (const witness of witnesses) {
      const path = findWorldPath(map, state.world.position, witness, { routeStateId: 'crossing' })
      const endpoint = path.at(-1)
      expect(path.length, `interaction path to ${witness.id}`).toBeGreaterThan(0)
      state = { ...state, world: { ...state.world, position: { x: endpoint.x, y: endpoint.y } } }
      state = applyEvent(state, { type: 'INTERACT', entityId: witness.id })
    }
    expect(state.quests['mq-act2-salt-covenant'].objectiveCounts['free-nereid-witnesses']).toBe(3)
    const repeated = applyEvent(state, { type: 'INTERACT', entityId: witnesses[2].id })
    expect(repeated.quests['mq-act2-salt-covenant'].objectiveCounts['free-nereid-witnesses']).toBe(3)
  })

  it('keeps the Unmoored Heart route physically playable only in Crossing or Surge', () => {
    const map = ACT2_RUNTIME_MAPS['nereid-caves']
    const invitation = map.entities.find((entity) => entity.id === 'unmoored-heart-invitation')
    const echo = map.entities.find((entity) => entity.id === 'echo-cavern')
    const medusa = map.exits.find((exit) => exit.id === 'combat-act2-unmoored-charmed')

    for (const routeStateId of ['crossing', 'surge']) {
      for (const spawn of Object.values(map.spawns)) {
        for (const target of [invitation, echo, medusa]) {
          expect(interactionEndpointDistance(map, spawn, target, routeStateId), `${routeStateId}:${spawn.id}→${target.id}`).toBeLessThan(56)
        }
      }
    }
    // The invitation remains a readable landmark beside the main cavern lane,
    // but the marker and combat gate that constitute the side branch stay
    // outside the reducer's <56px physical-authorisation radius at Ebb.
    for (const target of [echo, medusa]) {
      expect(interactionEndpointDistance(map, map.spawns.threshold, target, 'ebb'), `ebb excludes ${target.id}`).toBeGreaterThanOrEqual(56)
    }

    let state = createInitialState()
    state = {
      ...state,
      protagonist: { ...state.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
      flags: { ...state.flags, 'act2:tide-state': 'crossing' },
      world: { regionId: 'pelagos-isles', mapId: map.id, spawnId: 'threshold', position: { ...map.spawns.threshold }, facing: 0 },
    }
    const moveTo = (target) => {
      const path = findWorldPath(map, state.world.position, target, { routeStateId: 'crossing' })
      expect(path.length, `path to ${target.id}`).toBeGreaterThan(0)
      const endpoint = path.at(-1)
      state = { ...state, world: { ...state.world, position: { x: endpoint.x, y: endpoint.y } } }
    }
    moveTo(invitation)
    state = applyEvent(state, { type: 'INTERACT', entityId: invitation.id })
    expect(state.quests['sq-act2-unmoored-heart']).toMatchObject({ state: 'active', objectiveIndex: 0 })
    moveTo(echo)
    state = applyEvent(state, { type: 'REACH', mapId: map.id, markerId: echo.id })
    expect(state.quests['sq-act2-unmoored-heart'].objectiveIndex).toBe(1)
    moveTo(medusa)
    state = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: medusa.encounterId })
    expect(state.status).toBe('in-combat')
    expect(state.combatSnapshot.encounterId).toBe('enc-act2-unmoored-charmed')
  })

  it('keeps the Archive Barge Return Folio within physical interaction reach from every arrival in every tide', () => {
    const map = ACT2_RUNTIME_MAPS['archive-barge-deck']
    const folio = map.entities.find((entity) => entity.id === 'cipher-folio-2')
    for (const routeStateId of ['ebb', 'crossing', 'surge']) {
      for (const spawn of Object.values(map.spawns)) {
        expect(interactionEndpointDistance(map, spawn, folio, routeStateId), `${routeStateId}:${spawn.id}→${folio.id}`).toBeLessThan(56)
      }
    }
  })

  it('keeps all required pressure shells reachable and exact-once in the crossing tide', () => {
    const map = ACT2_RUNTIME_MAPS['nereid-caves']
    const shells = ['pressure-shell-1', 'pressure-shell-2', 'pressure-shell-3']
      .map((id) => map.entities.find((entity) => entity.id === id))

    let state = createInitialState()
    state = {
      ...state,
      status: 'playing',
      protagonist: { ...state.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
      mainQuestId: 'mq-act2-salt-covenant',
      flags: { ...state.flags, 'act2-nereid-caves-cleared': true, 'act2:tide-state': 'crossing' },
      quests: {
        ...state.quests,
        'mq-act2-salt-covenant': { state: 'active', objectiveIndex: 3, objectiveCounts: {} },
      },
      world: { regionId: 'pelagos-isles', mapId: 'nereid-caves', spawnId: 'threshold', position: { x: 216, y: 284 }, facing: 0 },
    }
    for (const shell of shells) {
      const path = findWorldPath(map, state.world.position, shell, { routeStateId: 'crossing' })
      expect(path.length, `crossing path to ${shell.id}`).toBeGreaterThan(0)
      const endpoint = path.at(-1)
      expect(Math.hypot(endpoint.x - shell.x, endpoint.y - shell.y), shell.id).toBeLessThan(56)
      state = { ...state, world: { ...state.world, position: endpoint } }
      state = applyEvent(state, { type: 'INTERACT', entityId: shell.id })
    }
    expect(state.quests['mq-act2-salt-covenant'].objectiveIndex).toBe(4)
    expect(applyEvent(state, { type: 'INTERACT', entityId: shells[2].id })).toBe(state)
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
