import { describe, expect, it } from 'vitest'
import { ACT5_LIGHT_POLARITY_RULES } from '../src/rpg/act5Content.js'
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

// Woodcutting's curve — olive-tree(1) -> orchard-cypress(15) -> slag-road-cedar(30)
// -> nyx-laurel(45) — previously stopped short of ambrosial-ash (tier 70 in
// progression.js), leaving it obtainable only as wilderness combat loot. This
// suite covers the new Act V Accord Overlook node that closes that gap and
// gives woodcutting its first rare/mastery-tier direct-gathering outcome.
const NEW_ENTITY = {
  mapId: 'accord-overlook',
  entity: {
    id: 'accord-overlook-ambrosial-ash', kind: 'resource', x: 770, y: 380,
    name: 'Covenant-Grown Ash', label: 'Cut a bough from the covenant-grown ash',
    skillId: 'woodcutting', itemId: 'ambrosial-ash', level: 70, xp: 145,
    capacity: 1, respawnTicks: 1000,
  },
}

// Accord Overlook routes on Act V's shadow/moon/sun light-polarity state
// machine like every other Act V map, but both of its traversal lanes are
// already tagged with every light state, so no route state ever actually
// restricts movement here (only collisions do). We still exercise every
// state explicitly rather than assuming that — night-stair and false-sky in
// this same act genuinely do gate lanes per state, and a resource placed
// there without checking every state (or, when a spur is needed to reach it,
// without checking that the spur doesn't collide with the exact per-state
// lane lists asserted in act-v-light-ui.test.jsx) can silently break either
// reachability or that lane-selection contract.
const ROUTE_STATES_BY_MAP = {
  'accord-overlook': ACT5_LIGHT_POLARITY_RULES.stateIds,
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

describe('woodcutting expansion: ambrosial-ash node', () => {
  it('places the new node on the Night Stair with the authored fields', () => {
    const { mapId, entity } = NEW_ENTITY
    const map = REGISTERED_MAPS[mapId]
    expect(map, mapId).toBeTruthy()
    const placed = map.entities.find((candidate) => candidate.id === entity.id)
    expect(placed, `${mapId}:${entity.id}`).toEqual(entity)
  })

  it('registers the new node against a real item and a real skill', () => {
    const { entity } = NEW_ENTITY
    expect(ALL_ITEM_DEFS[entity.itemId], `${entity.id} item`).toBeTruthy()
    expect(ALL_ITEM_DEFS[entity.itemId].tier).toBe(70)
    expect(SKILL_DEF_BY_ID[entity.skillId], `${entity.id} skill`).toBeTruthy()
    expect(entity.skillId).toBe('woodcutting')
  })

  it('is reachable from every spawn on the Night Stair under every light-polarity route state', () => {
    const { mapId, entity } = NEW_ENTITY
    const map = REGISTERED_MAPS[mapId]
    expectReachableFromEverySpawn(map, entity)
  })

  it('keeps the new node at least 60px from every other entity and exit on its map', () => {
    const { mapId, entity } = NEW_ENTITY
    const map = REGISTERED_MAPS[mapId]
    const siblings = [...(map.entities || []), ...(map.exits || [])]
    for (const sibling of siblings) {
      if (sibling.id === entity.id || !Number.isFinite(sibling.x) || !Number.isFinite(sibling.y)) continue
      expect(
        Math.hypot(entity.x - sibling.x, entity.y - sibling.y),
        `${mapId}:${entity.id}<->${sibling.id}`,
      ).toBeGreaterThanOrEqual(60)
    }
  })

  it('closes the validator gap without introducing new errors or unexpected warning codes', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    const { mapId, entity } = NEW_ENTITY
    const path = `maps.${mapId}.entities.${entity.id}`
    const related = report.issues.filter((issue) => issue.path === path)
    // The pre-existing authoring-schema sweep flags every entity without an
    // `authoring` block as legacy (matching every other Act IV-V entity
    // today); anything else here would be a genuinely new defect.
    expect([...new Set(related.map((issue) => issue.code))], path).toEqual(['LEGACY_AUTHORING_RECORD'])
  })
})

describe('gather() reducer integration for the ambrosial-ash node', () => {
  function woodcuttingReadyState(level) {
    const initial = createInitialState()
    return {
      ...initial,
      progression: {
        ...initial.progression,
        skills: { ...initial.progression.skills, woodcutting: { xp: xpForLevel(level) } },
      },
      world: { ...initial.world, mapId: 'accord-overlook', position: { x: 770, y: 380 } },
    }
  }

  it('lets a level-70 woodcutter harvest ambrosial-ash from the covenant-grown ash and gain XP', () => {
    const state = woodcuttingReadyState(70)
    const startingXp = state.progression.skills.woodcutting.xp
    expect(itemQuantity(state.inventory, 'ambrosial-ash')).toBe(0)

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'accord-overlook-ambrosial-ash' })

    expect(gathered).not.toBe(state)
    expect(itemQuantity(gathered.inventory, 'ambrosial-ash')).toBe(1)
    expect(gathered.progression.skills.woodcutting.xp).toBe(startingXp + 145)
    expect(gathered.progression.totalXp).toBe(state.progression.totalXp + 145)
  })

  it('refuses the harvest below the authored level-70 gate', () => {
    const state = woodcuttingReadyState(69)
    const attempt = applyEvent(state, { type: 'GATHER', entityId: 'accord-overlook-ambrosial-ash' })
    expect(attempt).toBe(state)
    expect(itemQuantity(attempt.inventory, 'ambrosial-ash')).toBe(0)
  })
})

describe('covenant-grown ash respawn cadence', () => {
  it('takes 1000 ticks to respawn — a far slower cadence than the 300-tick default, matching the other rare/mastery nodes', () => {
    const request = { mapId: 'accord-overlook', entityId: 'accord-overlook-ambrosial-ash', capacity: 1, respawnTicks: 1000 }
    const resources = createInitialResourceNodes()

    const harvested = harvestResourceNode({ resources, ...request, quantity: 1, playtimeTicks: 0 })
    expect(harvested.changed).toBe(true)
    expect(harvested.node.remaining).toBe(0)
    expect(harvested.node.nextRespawnTick).toBe(1000)
    expect(harvested.node.nextRespawnTick).toBeGreaterThan(DEFAULT_RESOURCE_RESPAWN_TICKS)

    // A default-cadence node would already have respawned by this tick; the
    // ambrosial-ash node must still be unavailable.
    const stillDepleted = resourceNodeStatus({
      resources: harvested.resources, ...request, playtimeTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    })
    expect(stillDepleted.available).toBe(false)
    expect(stillDepleted.waitTicks).toBe(1000 - DEFAULT_RESOURCE_RESPAWN_TICKS)

    // It does respawn exactly at its authored boundary.
    const respawned = resourceNodeStatus({ resources: harvested.resources, ...request, playtimeTicks: 1000 })
    expect(respawned.available).toBe(true)
    expect(respawned.waitTicks).toBe(0)
  })
})
