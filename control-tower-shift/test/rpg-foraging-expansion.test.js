import { describe, expect, it } from 'vitest'
import { ACT3_SEASONAL_STATES } from '../src/rpg/act3Content.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { SKILL_DEF_BY_ID, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS } from '../src/rpg/registry.js'
import {
  DEFAULT_RESOURCE_RESPAWN_TICKS,
  createInitialResourceNodes,
  harvestResourceNode,
  resourceNodeStatus,
} from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Foraging previously offered only two gatherable nodes (wild-thyme at level
// 1 and foundry-charred-ember at level 20) even though sage, asphodel, moly,
// and ambrosia-bloom were already priced into the item tier table and only
// obtainable as wilderness combat drops. This suite covers the four new
// Act III foraging nodes that close that gap across the mid-to-endgame level
// band, including a deliberately scarce "rare" node (moly).
const NEW_ENTITIES = [
  {
    mapId: 'wheat-village',
    entity: {
      id: 'wheat-village-sage', kind: 'resource', x: 520, y: 120,
      name: 'Wheat Village Sage Row', label: 'Gather mountain sage',
      skillId: 'foraging', itemId: 'sage', level: 10, xp: 22,
    },
  },
  {
    mapId: 'asphodel-gate',
    entity: {
      id: 'asphodel-gate-bloom', kind: 'resource', x: 480, y: 180,
      name: 'Asphodel Meadow', label: 'Gather asphodel blooms',
      skillId: 'foraging', itemId: 'asphodel', level: 30, xp: 42,
    },
  },
  {
    mapId: 'kore-sanctuary',
    entity: {
      id: 'kore-sanctuary-moly', kind: 'resource', x: 480, y: 420,
      name: 'Kore Sanctuary Moly Patch', label: 'Gather the warded moly',
      skillId: 'foraging', itemId: 'moly', level: 55, xp: 78,
      capacity: 1, respawnTicks: 900,
    },
  },
  {
    mapId: 'threshing-circle',
    entity: {
      id: 'threshing-circle-ambrosia', kind: 'resource', x: 480, y: 180,
      name: 'Threshing Circle Ambrosia Bloom', label: 'Gather the ambrosia bloom',
      skillId: 'foraging', itemId: 'ambrosia-bloom', level: 80, xp: 130,
    },
  },
]

// All four host maps carry Act III's seasonal overlay: wheat-village,
// asphodel-gate, and kore-sanctuary tag every one of their traversal lanes
// with both season states (so route state never actually restricts them),
// while threshing-circle additionally authors two single-season half-lanes
// for its boss encounter. Checking every state on every map, rather than
// assuming only threshing-circle needs it, is what caught the placement
// defect fixed below.
const SEASONS = Object.keys(ACT3_SEASONAL_STATES)
const ROUTE_STATES_BY_MAP = {
  'wheat-village': SEASONS,
  'asphodel-gate': SEASONS,
  'kore-sanctuary': SEASONS,
  'threshing-circle': SEASONS,
}

function expectReachableFromEverySpawn(map, entity) {
  for (const routeStateId of ROUTE_STATES_BY_MAP[map.id]) {
    for (const spawn of Object.values(map.spawns)) {
      const path = findWorldPath(map, spawn, entity, { routeStateId })
      expect(path.length, `${map.id}:${spawn.id}->${entity.id}@${routeStateId}`).toBeGreaterThan(0)
      expect(
        Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y),
        `${map.id}:${spawn.id}->${entity.id}@${routeStateId} interaction distance`,
      ).toBeLessThan(56)
    }
  }
}

function itemQuantity(inventory, itemId) {
  return (inventory.slots || [])
    .filter((slot) => slot.itemId === itemId)
    .reduce((total, slot) => total + slot.quantity, 0)
}

describe('foraging expansion: four new Act III gathering nodes', () => {
  it('places each new node on its correct map with the exact authored fields', () => {
    for (const { mapId, entity } of NEW_ENTITIES) {
      const map = REGISTERED_MAPS[mapId]
      expect(map, mapId).toBeTruthy()
      const placed = map.entities.find((candidate) => candidate.id === entity.id)
      expect(placed, `${mapId}:${entity.id}`).toEqual(entity)
    }
  })

  it('registers every new node against a real item and a real skill', () => {
    for (const { mapId, entity } of NEW_ENTITIES) {
      expect(ALL_ITEM_DEFS[entity.itemId], `${mapId}:${entity.id} item`).toBeTruthy()
      expect(SKILL_DEF_BY_ID[entity.skillId], `${mapId}:${entity.id} skill`).toBeTruthy()
      expect(entity.skillId).toBe('foraging')
    }
  })

  it('is reachable from every spawn on its host map under every seasonal route state', () => {
    for (const { mapId, entity } of NEW_ENTITIES) {
      const map = REGISTERED_MAPS[mapId]
      expectReachableFromEverySpawn(map, entity)
    }
  })

  it('keeps every new node at least 60px from every other entity and exit on its map', () => {
    for (const { mapId, entity } of NEW_ENTITIES) {
      const map = REGISTERED_MAPS[mapId]
      const siblings = [...(map.entities || []), ...(map.exits || [])]
      for (const sibling of siblings) {
        if (sibling.id === entity.id || !Number.isFinite(sibling.x) || !Number.isFinite(sibling.y)) continue
        expect(
          Math.hypot(entity.x - sibling.x, entity.y - sibling.y),
          `${mapId}:${entity.id}<->${sibling.id}`,
        ).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('closes the validator gap without introducing new errors or unexpected warning codes', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    for (const { mapId, entity } of NEW_ENTITIES) {
      const path = `maps.${mapId}.entities.${entity.id}`
      const related = report.issues.filter((issue) => issue.path === path)
      // The pre-existing authoring-schema sweep flags every entity without an
      // `authoring` block as legacy (matching every other Act III-V entity
      // today); anything else here would be a genuinely new defect.
      expect([...new Set(related.map((issue) => issue.code))], path).toEqual(['LEGACY_AUTHORING_RECORD'])
    }
  })
})

describe('gather() reducer integration for the new sage node', () => {
  function forageReadyState(level) {
    const initial = createInitialState()
    const map = REGISTERED_MAPS['wheat-village']
    const sage = map.entities.find((candidate) => candidate.id === 'wheat-village-sage')
    return {
      ...initial,
      progression: {
        ...initial.progression,
        skills: { ...initial.progression.skills, foraging: { xp: xpForLevel(level) } },
      },
      world: { ...initial.world, regionId: map.region, mapId: map.id, spawnId: map.spawn.id, position: { x: sage.x, y: sage.y } },
    }
  }

  it('lets a level-10 forager harvest sage from the Wheat Village Sage Row and gain XP', () => {
    const state = forageReadyState(10)
    const startingXp = state.progression.skills.foraging.xp

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'wheat-village-sage' })

    expect(gathered).not.toBe(state)
    expect(itemQuantity(gathered.inventory, 'sage')).toBe(1)
    expect(gathered.progression.skills.foraging.xp).toBe(startingXp + 22)
    expect(gathered.progression.totalXp).toBe(state.progression.totalXp + 22)
  })

  it('refuses the harvest below the authored level gate', () => {
    const belowLevel = {
      ...createInitialState(),
      world: { ...createInitialState().world, mapId: 'wheat-village', position: { x: 520, y: 120 } },
    }
    // Default foraging xp is 0, well under the level-10 requirement.
    const attempt = applyEvent(belowLevel, { type: 'GATHER', entityId: 'wheat-village-sage' })
    expect(attempt).toBe(belowLevel)
    expect(itemQuantity(attempt.inventory, 'sage')).toBe(0)
  })
})

describe('moly node respawn cadence', () => {
  it('takes 900 ticks to respawn — a slower cadence than the 300-tick default', () => {
    const harvested = harvestResourceNode({
      resources: createInitialResourceNodes(),
      mapId: 'kore-sanctuary',
      entityId: 'kore-sanctuary-moly',
      quantity: 1,
      capacity: 1,
      respawnTicks: 900,
      playtimeTicks: 0,
    })
    expect(harvested.changed).toBe(true)
    expect(harvested.node.nextRespawnTick).toBe(900)

    // A default-cadence node would already be full again at 300 ticks; the
    // moly patch must still be empty at that point.
    const atDefaultCadence = resourceNodeStatus({
      resources: harvested.resources,
      mapId: 'kore-sanctuary',
      entityId: 'kore-sanctuary-moly',
      capacity: 1,
      respawnTicks: 900,
      playtimeTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    })
    expect(atDefaultCadence.available).toBe(false)
    expect(atDefaultCadence.waitTicks).toBe(900 - DEFAULT_RESOURCE_RESPAWN_TICKS)

    const atRespawn = resourceNodeStatus({
      resources: harvested.resources,
      mapId: 'kore-sanctuary',
      entityId: 'kore-sanctuary-moly',
      capacity: 1,
      respawnTicks: 900,
      playtimeTicks: 900,
    })
    expect(atRespawn.available).toBe(true)
    expect(atRespawn.waitTicks).toBe(0)
  })
})
