// Act V playable-world geometry contract.
// Pure deterministic data assertions: no DOM, clock, network, or randomness.

import { describe, expect, it } from 'vitest'
import {
  ACT5_CONNECTIONS,
  ACT5_ENCOUNTERS,
  ACT5_ENDING_VARIANTS,
  ACT5_LIGHT_POLARITY_STATES,
  ACT5_MAIN_QUEST,
  ACT5_POCKETS,
  ACT5_SIDE_QUEST,
  ACT5_WITNESSED_DEEDS,
} from '../src/rpg/act5Content.js'
import {
  ACT5_RENDERABLE_MAPS,
  ACT5_RUNTIME_MAPS,
  act5RenderablePocketById,
  act5RuntimeEntityById,
  act5RuntimeExitById,
  act5RuntimeMapById,
  act5RuntimeMarkerById,
  act5RuntimeSpawnById,
  validateAct5Runtime,
} from '../src/rpg/act5Runtime.js'
import { rpgMapById, rpgSpawnById } from '../src/rpg/registry.js'
import { findWorldPath, isWorldPointWalkable } from '../src/rpg/pathfinding.js'
import { ACT5_LIGHT_FLAG, applyEvent, createInitialState } from '../src/rpg/state.js'

const SAFE_MARGIN = 28
const pocketIds = Object.keys(ACT5_POCKETS)

function withinBounds(location, bounds, margin = 0) {
  return Number.isFinite(location.x) && Number.isFinite(location.y)
    && location.x >= margin && location.y >= margin
    && location.x <= bounds.w - margin && location.y <= bounds.h - margin
}

function pointInsideRect(location, rect) {
  return location.x >= rect.x && location.x <= rect.x + rect.w
    && location.y >= rect.y && location.y <= rect.y + rect.h
}

function allEntities() {
  return Object.values(ACT5_RUNTIME_MAPS).flatMap((map) => map.entities)
}

function semanticTarget(map, id) {
  return map.entities.find((entity) => entity.id === id)
    || map.exits.find((exit) => exit.id === id)
    || map.spawns[id]
}

function expectReachable(mapId, stateId, startId, targetIds) {
  const map = ACT5_RUNTIME_MAPS[mapId]
  const start = semanticTarget(map, startId)
  for (const targetId of targetIds) {
    const target = semanticTarget(map, targetId)
    const path = findWorldPath(map, start, target, { routeStateId: stateId })
    expect(path.length, `${mapId}:${stateId}:${startId}->${targetId}`).toBeGreaterThan(0)
    expect(path.every((location) => isWorldPointWalkable(map, location, { routeStateId: stateId })), `${mapId}:${stateId}:${startId}->${targetId} walkability`).toBe(true)
    const endpoint = path.at(-1)
    expect(Math.hypot(endpoint.x - target.x, endpoint.y - target.y), `${mapId}:${stateId}:${startId}->${targetId} endpoint`).toBeLessThan(56)
  }
}

describe('Act V renderable pockets', () => {
  it('provides one finite 960x540 authored map for every pocket', () => {
    expect(Object.keys(ACT5_RUNTIME_MAPS).sort()).toEqual([...pocketIds].sort())
    for (const id of pocketIds) {
      const map = act5RuntimeMapById(id)
      expect(map, `${id} runtime map`).toBeTruthy()
      expect(map.bounds).toEqual({ w: 960, h: 540 })
      expect(map.palette.name).toBe(id)
      expect(typeof map.themeId).toBe('string')
      expect(typeof map.decorSetId).toBe('string')
    }
  })

  it('gives every named spawn finite safe coordinates outside collisions', () => {
    for (const [mapId, pocket] of Object.entries(ACT5_POCKETS)) {
      const runtime = act5RuntimeMapById(mapId)
      for (const spawnId of Object.keys(pocket.spawns)) {
        const location = act5RuntimeSpawnById(mapId, spawnId)
        expect(location, `${mapId}:${spawnId}`).toBeTruthy()
        expect(location.id).toBe(spawnId)
        expect(Number.isFinite(location.facing), `${mapId}:${spawnId} facing`).toBe(true)
        expect(withinBounds(location, runtime.bounds, SAFE_MARGIN), `${mapId}:${spawnId} safe bounds`).toBe(true)
        for (const collision of runtime.collisions) {
          expect(pointInsideRect(location, collision), `${mapId}:${spawnId} inside ${collision.id}`).toBe(false)
        }
      }
    }
  })

  it('provides bounded collisions and readable shape-coded traversal lanes', () => {
    for (const map of Object.values(ACT5_RUNTIME_MAPS)) {
      expect(map.collisions.length, `${map.id} collisions`).toBeGreaterThan(0)
      expect(map.traversalLanes.length, `${map.id} traversal lanes`).toBeGreaterThan(0)
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
        expect(lane.accessibleLabel, `${map.id}:${lane.id} accessible label`).toBeTruthy()
        for (const stateId of lane.stateIds) expect(ACT5_LIGHT_POLARITY_STATES[stateId]).toBeTruthy()
        for (const location of lane.points) expect(withinBounds(location, map.bounds), `${map.id}:${lane.id}`).toBe(true)
      }
    }
  })

  it('merges geometry into static definitions without mutating either source', () => {
    const staticBefore = JSON.stringify(ACT5_POCKETS)
    const runtimeBefore = JSON.stringify(ACT5_RUNTIME_MAPS)
    const merged = act5RenderablePocketById('silent-loom')

    expect(merged.name).toBe('The Silent Loom')
    expect(merged.spawn).toMatchObject({ id: 'from-approach', x: 76, y: 400 })
    expect(merged.spawns['from-approach'].note).toBe(ACT5_POCKETS['silent-loom'].spawns['from-approach'].note)
    merged.entities[0].x = -1
    merged.spawns['from-approach'].x = -1
    merged.spawns['from-approach'].arrivalState.lightStateId = 'shadow'
    merged.traversalLanes[0].points[0].x = -1
    expect(JSON.stringify(ACT5_POCKETS)).toBe(staticBefore)
    expect(JSON.stringify(ACT5_RUNTIME_MAPS)).toBe(runtimeBefore)
    expect(ACT5_RENDERABLE_MAPS['silent-loom'].spawn.x).toBe(76)
    expect(ACT5_RENDERABLE_MAPS['silent-loom'].spawn.arrivalState.lightStateId).toBe('sun')
  })

  it('gives every authored spawn an immutable canonical arrival light state', () => {
    for (const [mapId, pocket] of Object.entries(ACT5_POCKETS)) {
      for (const spawnId of Object.keys(pocket.spawns)) {
        const authored = pocket.spawns[spawnId]
        const runtime = act5RuntimeSpawnById(mapId, spawnId)
        const registered = rpgSpawnById(mapId, spawnId)
        for (const candidate of [authored, runtime, registered]) {
          expect(ACT5_LIGHT_POLARITY_STATES[candidate.arrivalState.lightStateId], `${mapId}:${spawnId}`).toBeTruthy()
          expect(Object.isFrozen(candidate.arrivalState), `${mapId}:${spawnId} nested state`).toBe(true)
        }
      }
    }
  })

  it('returns null for unknown runtime IDs', () => {
    expect(act5RuntimeMapById('missing')).toBeNull()
    expect(act5RuntimeSpawnById('silent-loom', 'missing')).toBeNull()
    expect(act5RuntimeEntityById('silent-loom', 'missing')).toBeNull()
    expect(act5RuntimeExitById('missing')).toBeNull()
    expect(act5RuntimeMarkerById('silent-loom', 'missing')).toBeNull()
    expect(act5RenderablePocketById('missing')).toBeNull()
  })
})

describe('Act V graph and encounter geometry', () => {
  it('keeps independently interactive Night Stair and False Sky targets spatially distinct', () => {
    for (const mapId of ['night-stair', 'false-sky']) {
      const map = ACT5_RUNTIME_MAPS[mapId]
      const targets = [...map.entities, ...map.exits]
      for (let index = 0; index < targets.length; index += 1) {
        for (let sibling = index + 1; sibling < targets.length; sibling += 1) {
          const first = targets[index]
          const second = targets[sibling]
          const distance = Math.hypot(first.x - second.x, first.y - second.y)
          expect(distance, `${mapId}:${first.id}<->${second.id}`).toBeGreaterThanOrEqual(48)
        }
      }
    }
  })

  it('routes every relevant Act V spawn to required targets in each applicable light state', () => {
    const matrices = {
      'night-stair': {
        shadow: [
          'memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4',
          'nyx-seal', 'selene-witness', 'combat-act5-night-stair', 'night-stair-to-foothold',
        ],
        moon: [
          'selene', 'selene-overlook', 'selene-path-split', 'true-sky-invitation',
          'nyx-seal', 'selene-witness', 'night-stair-to-false-sky',
        ],
        sun: ['nyx-seal', 'selene-witness'],
      },
      'false-sky': {
        moon: ['helios', 'sun-mirror-1', 'selene-return-witness', 'false-sky-to-night-stair'],
        sun: [
          'sun-mirror-1', 'selene-return-witness', 'sun-mirror-2', 'sun-mirror-3',
          'fracture-room-a', 'fracture-room-b', 'fracture-exit',
          'combat-act5-false-sky', 'false-sky-to-loom-approach',
        ],
        shadow: ['sun-mirror-1', 'selene-return-witness'],
      },
      'accord-overlook': {
        shadow: ['epilogue-sky'], moon: ['epilogue-sky'], sun: ['epilogue-sky'],
      },
    }

    for (const [mapId, stateTargets] of Object.entries(matrices)) {
      for (const [stateId, targetIds] of Object.entries(stateTargets)) {
        for (const spawnId of Object.keys(ACT5_RUNTIME_MAPS[mapId].spawns)) {
          expectReachable(mapId, stateId, spawnId, targetIds)
        }
      }
    }
  })

  it('keeps the Star of Mercy match target reachable from every moonlit Night Stair arrival', () => {
    const map = ACT5_RUNTIME_MAPS['night-stair']
    for (const spawnId of Object.keys(map.spawns)) expectReachable('night-stair', 'moon', spawnId, ['star-deed-mercy'])
  })

  it('matches every static connection exactly, including gates and reciprocal spawns', () => {
    expect(validateAct5Runtime()).toEqual([])
    for (const connection of ACT5_CONNECTIONS) {
      const exit = act5RuntimeExitById(connection.id)
      expect(exit).toEqual(expect.objectContaining({
        id: connection.id,
        toMapId: connection.to,
        spawnId: connection.arrivalSpawnId,
        returnSpawnId: connection.returnSpawnId,
        kind: connection.kind,
        gate: connection.gate || [],
      }))
      expect(withinBounds(exit, ACT5_RUNTIME_MAPS[connection.from].bounds), connection.id).toBe(true)
      expect(act5RuntimeSpawnById(connection.to, connection.arrivalSpawnId), `${connection.id} arrival`).toBeTruthy()
      expect(act5RuntimeSpawnById(connection.from, connection.returnSpawnId), `${connection.id} return`).toBeTruthy()
    }
  })

  it('keeps the full region traversable through authored reciprocal routes', () => {
    const adjacency = new Map(pocketIds.map((id) => [id, []]))
    for (const connection of ACT5_CONNECTIONS) adjacency.get(connection.from).push(connection.to)
    for (const start of pocketIds) {
      const seen = new Set([start])
      const queue = [start]
      while (queue.length) {
        for (const next of adjacency.get(queue.shift())) {
          if (!seen.has(next)) { seen.add(next); queue.push(next) }
        }
      }
      expect([...seen].sort(), `${start} region reachability`).toEqual([...pocketIds].sort())
    }
  })

  it('places every encounter activation and return checkpoint on real geometry', () => {
    const combatExits = Object.values(ACT5_RUNTIME_MAPS)
      .flatMap((map) => map.exits)
      .filter((exit) => exit.kind === 'combat')
    expect(new Set(combatExits.map((exit) => exit.encounterId))).toEqual(new Set(Object.keys(ACT5_ENCOUNTERS)))

    for (const encounter of Object.values(ACT5_ENCOUNTERS)) {
      expect(act5RuntimeMapById(encounter.activationMapId), `${encounter.id} activation map`).toBeTruthy()
      expect(act5RuntimeSpawnById(encounter.returnMapId, encounter.returnSpawnId), `${encounter.id} return spawn`).toBeTruthy()
    }
  })

  it('exposes distinct Guardian and Regent boss activators without faking phase execution', () => {
    const guardian = act5RuntimeExitById('combat-act5-loom-guardian')
    const regent = act5RuntimeExitById('combat-act5-quiet-regent')
    expect(guardian).toMatchObject({ kind: 'combat', encounterId: 'boss-act5-loom-guardian', gate: [] })
    expect(regent).toMatchObject({
      kind: 'combat',
      encounterId: 'boss-act5-quiet-regent',
      gate: [{ kind: 'flag', flagId: 'act5-loom-guardian-defeated', value: true }],
    })
    expect(guardian).not.toHaveProperty('phases')
    expect(regent).not.toHaveProperty('testimonyInterruptImplemented')
  })
})

describe('Act V objective and interaction resolution', () => {
  it('resolves every pocket landmark to concrete geometry', () => {
    for (const [mapId, pocket] of Object.entries(ACT5_POCKETS)) {
      for (const landmarkId of pocket.landmarks) {
        expect(act5RuntimeMarkerById(mapId, landmarkId), `${mapId}:${landmarkId}`).toBeTruthy()
      }
    }
  })

  it('resolves every objective NPC, entity, and map marker', () => {
    const entities = allEntities()
    for (const quest of [ACT5_MAIN_QUEST, ACT5_SIDE_QUEST]) {
      for (const objective of quest.objectives) {
        if (objective.npcId) {
          expect(entities.find((entity) => entity.id === objective.npcId), `${objective.id}:${objective.npcId}`).toBeTruthy()
        }
        for (const npcId of objective.npcIds || []) {
          expect(entities.find((entity) => entity.id === npcId), `${objective.id}:${npcId}`).toBeTruthy()
        }
        for (const entityId of objective.entityIds || []) {
          expect(entities.find((entity) => entity.id === entityId), `${objective.id}:${entityId}`).toBeTruthy()
        }
        if (objective.markerId) {
          expect(act5RuntimeMarkerById(objective.mapId, objective.markerId), `${objective.id}:${objective.markerId}`).toBeTruthy()
        }
      }
    }
  })

  it('authors Nyx, Selene, and Helios interactions with non-color accessibility cues', () => {
    expect(act5RuntimeEntityById('nyx-foothold', 'nyx')).toMatchObject({ conversationId: 'act5-nyx-muster' })
    expect(act5RuntimeEntityById('night-stair', 'selene')).toMatchObject({ conversationId: 'act5-selene-reflection' })
    expect(act5RuntimeEntityById('false-sky', 'helios')).toMatchObject({ conversationId: 'act5-helios-false-dawn' })
    expect(act5RuntimeEntityById('nyx-foothold', 'shadow-seal-first')).toMatchObject({ shapeGlyph: 'filled-crescent', lightStateId: 'shadow' })
    expect(act5RuntimeEntityById('night-stair', 'selene-witness')).toMatchObject({ shapeGlyph: 'split-disc', lightStateId: 'moon' })
    expect(act5RuntimeEntityById('false-sky', 'sun-mirror-1')).toMatchObject({ shapeGlyph: 'rayed-disc', lightStateId: 'sun' })
  })

  it('aligns every runtime switch with canonical source, glyph, and label metadata', () => {
    for (const map of Object.values(ACT5_RUNTIME_MAPS)) {
      for (const controllerId of map.light.controllerIds) {
        const controller = act5RuntimeEntityById(map.id, controllerId)
        const canonical = ACT5_LIGHT_POLARITY_STATES[controller.lightStateId]
        expect(controller.controllerSourceId, `${map.id}:${controllerId}`).toBe(canonical.controller)
        expect(controller.shapeGlyph, `${map.id}:${controllerId}`).toBe(canonical.shapeGlyph)
        expect(controller.label, `${map.id}:${controllerId}`).toBe(canonical.label)
      }
    }
  })

  it('provides an explicit optional-loop invitation and dispatch-compatible star interactions', () => {
    expect(act5RuntimeEntityById('night-stair', 'true-sky-invitation')).toMatchObject({
      kind: 'interact',
      sideQuest: 'sq-act5-light-no-map-remembers',
    })
    for (const id of ['star-deed-mercy', 'star-deed-vigil', 'star-deed-return', 'star-deed-refusal']) {
      expect(act5RuntimeEntityById('night-stair', id)).toMatchObject({ kind: 'interact', interactionType: 'match' })
    }
  })

  it('places the four witnessed-deed seals in fixed act order with exact IDs', () => {
    const entities = ACT5_RUNTIME_MAPS['silent-loom-approach'].entities
    const seals = entities.filter((entity) => entity.epithetId)
    expect(seals.map((seal) => seal.id)).toEqual(ACT5_WITNESSED_DEEDS.map((deed) => deed.sealId))
    expect(seals.map((seal) => seal.act)).toEqual([1, 2, 3, 4])
    for (const seal of seals) expect(seal.accessibleLabel).toContain(`${seal.act} of four`)
  })

  it('exposes the exact three endings with visible promise and cost metadata', () => {
    const activator = act5RuntimeEntityById('silent-loom', 'accord-table')
    const endingIds = ACT5_ENDING_VARIANTS.map((ending) => ending.id)
    expect(activator).toMatchObject({ kind: 'choice', choiceIds: endingIds })
    expect(activator.options.map((option) => option.id)).toEqual(endingIds)
    for (const option of activator.options) {
      expect(option.name).toBeTruthy()
      expect(option.promise).toBeTruthy()
      expect(option.cost).toBeTruthy()
    }
    expect(activator.accessibleLabel).toContain('three covenant endings')
  })
})

describe('Act V arrival-state reducer contract', () => {
  function stateAt(mapId, spawnId, lightStateId = 'shadow') {
    const initial = createInitialState()
    const map = rpgMapById(mapId)
    const spawn = rpgSpawnById(mapId, spawnId)
    return {
      ...initial,
      status: 'playing',
      protagonist: { ...initial.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
      flags: { ...initial.flags, [ACT5_LIGHT_FLAG]: lightStateId },
      world: {
        regionId: map.region,
        mapId,
        spawnId,
        position: { x: spawn.x, y: spawn.y },
        facing: spawn.facing,
      },
    }
  }

  it('starts Act V in the entry spawn\'s authored shadow state', () => {
    const initial = createInitialState()
    const ready = {
      ...initial,
      status: 'ending',
      flags: {
        ...initial.flags,
        'mq-act4-false-constellation-completed': true,
        'act4-mortal-draft-ratified': true,
        [ACT5_LIGHT_FLAG]: 'sun',
      },
    }
    const begun = applyEvent(ready, { type: 'BEGIN_ACT', act: 5 })
    expect(begun.world).toMatchObject({ mapId: 'nyx-foothold', spawnId: 'keeper-camp' })
    expect(begun.flags[ACT5_LIGHT_FLAG]).toBe('shadow')
  })

  it('restores the destination spawn state on forward and backtrack traversal', () => {
    // Traversal is intentionally local: use the foothold arrival, which is
    // physically at the authored return bridge, rather than forging a remote
    // gate event from the False Sky arrival.
    let state = stateAt('night-stair', 'from-foothold', 'shadow')
    state = applyEvent(state, { type: 'TRAVERSE', viaGate: 'night-stair-to-foothold' })
    expect(state.world).toMatchObject({ mapId: 'nyx-foothold', spawnId: 'from-night-stair' })
    expect(state.flags[ACT5_LIGHT_FLAG]).toBe('shadow')

    state = stateAt('false-sky', 'from-night-stair', 'shadow')
    state = applyEvent(state, { type: 'TRAVERSE', viaGate: 'false-sky-to-night-stair' })
    expect(state.world).toMatchObject({ mapId: 'night-stair', spawnId: 'from-false-sky' })
    expect(state.flags[ACT5_LIGHT_FLAG]).toBe('moon')

    state = stateAt('silent-loom-approach', 'from-false-sky', 'moon')
    state = applyEvent(state, { type: 'TRAVERSE', viaGate: 'loom-approach-to-false-sky' })
    expect(state.world).toMatchObject({ mapId: 'false-sky', spawnId: 'from-approach' })
    expect(state.flags[ACT5_LIGHT_FLAG]).toBe('sun')
  })

  it('restores authored checkpoint polarity after combat without changing defeat snapshots', () => {
    const beforeCombat = stateAt('night-stair', 'from-foothold', 'moon')
    let state = {
      ...beforeCombat,
      status: 'in-combat',
      combatSnapshot: { encounterId: 'enc-act5-night-stair', checkpoint: beforeCombat },
    }
    state = applyEvent(state, { type: 'COMBAT_WON', encounterId: 'enc-act5-night-stair' })
    expect(state.world).toMatchObject({ mapId: 'night-stair', spawnId: 'anchors-stable' })
    expect(state.flags[ACT5_LIGHT_FLAG]).toBe('shadow')

    state = {
      ...beforeCombat,
      status: 'in-combat',
      combatSnapshot: { encounterId: 'enc-act5-night-stair', checkpoint: beforeCombat },
    }
    state = applyEvent(state, { type: 'COMBAT_FAILED', encounterId: 'enc-act5-night-stair' })
    expect(state.world).toEqual(beforeCombat.world)
    expect(state.flags[ACT5_LIGHT_FLAG]).toBe('moon')
  })
})
