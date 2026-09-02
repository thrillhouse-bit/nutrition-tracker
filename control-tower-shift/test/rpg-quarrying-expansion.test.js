import { describe, expect, it } from 'vitest'
import { ACT4_PRESSURE_RULES } from '../src/rpg/act4Content.js'
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

// Quarrying gained three new direct-gathering nodes so iron-ore, silver-ore,
// and orichalcum (already defined as craftable item tiers) have an in-world
// source instead of only dropping from wilderness combat loot.
const NEW_NODES = [
  {
    mapId: 'name-press',
    entityId: 'name-press-iron-vein',
    fields: {
      kind: 'resource', x: 760, y: 400, name: 'Forge March Iron Vein',
      label: 'Mine the forge march iron vein', skillId: 'quarrying', itemId: 'iron-ore', level: 10, xp: 24,
    },
  },
  {
    mapId: 'false-constellation',
    entityId: 'constellation-silver-seam',
    fields: {
      kind: 'resource', x: 480, y: 420, name: 'Bronze Firmament Silver Seam',
      label: 'Mine the firmament silver seam', skillId: 'quarrying', itemId: 'silver-ore', level: 20, xp: 38,
    },
  },
  {
    mapId: 'atlas-vault',
    entityId: 'vault-orichalcum-cache',
    fields: {
      kind: 'resource', x: 740, y: 230, name: 'Atlas Vault Orichalcum Cache',
      label: 'Pry loose the orichalcum cache', skillId: 'quarrying', itemId: 'orichalcum', level: 60, xp: 110,
      capacity: 1, respawnTicks: 1200,
    },
  },
]

const NEW_ENTITY_IDS = new Set(NEW_NODES.map((node) => node.entityId))

// All three new nodes live on Act IV maps, which route on the forge-march
// pressure state machine rather than tide/season/light-polarity cycles.
const ROUTE_STATES_BY_MAP = {
  'name-press': ACT4_PRESSURE_RULES.states,
  'false-constellation': ACT4_PRESSURE_RULES.states,
  'atlas-vault': ACT4_PRESSURE_RULES.states,
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
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

describe('quarrying expansion: iron, silver, and orichalcum nodes', () => {
  it('places all three new resource nodes on their authored maps with the authored fields', () => {
    for (const { mapId, entityId, fields } of NEW_NODES) {
      const map = REGISTERED_MAPS[mapId]
      expect(map, mapId).toBeTruthy()
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      expect(entity, `${mapId}:${entityId}`).toBeTruthy()
      expect(entity).toMatchObject(fields)
      expect(ALL_ITEM_DEFS[entity.itemId], `${mapId}:${entityId} item`).toBeTruthy()
      expect(SKILL_DEF_BY_ID[entity.skillId], `${mapId}:${entityId} skill`).toBeTruthy()
      expect(entity.skillId).toBe('quarrying')
    }
  })

  it('is reachable from every spawn on its map within gameplay interaction distance', () => {
    for (const { mapId, entityId } of NEW_NODES) {
      const map = REGISTERED_MAPS[mapId]
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      expectReachableFromEverySpawn(map, entity)
    }
  })

  it('keeps every new quarrying node physically distinct from its neighbors', () => {
    for (const map of Object.values(REGISTERED_MAPS)) {
      const targets = [...(map.entities || []), ...(map.exits || [])]
      for (const entity of targets.filter((target) => NEW_ENTITY_IDS.has(target.id))) {
        for (const sibling of targets) {
          if (entity === sibling || !Number.isFinite(sibling.x) || !Number.isFinite(sibling.y)) continue
          expect(
            Math.hypot(entity.x - sibling.x, entity.y - sibling.y),
            `${map.id}:${entity.id}<->${sibling.id}`,
          ).toBeGreaterThanOrEqual(60)
        }
      }
    }
  })

  it('lets a sufficiently leveled quarrying player harvest iron-ore from the forge march iron vein', () => {
    const base = createInitialState()
    const leveledXp = xpForLevel(10)
    const state = {
      ...base,
      world: { ...base.world, mapId: 'name-press', position: { x: 760, y: 400 } },
      progression: {
        ...base.progression,
        skills: { ...base.progression.skills, quarrying: { xp: leveledXp } },
      },
    }
    expect(itemQuantity(state.inventory, 'iron-ore')).toBe(0)

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'name-press-iron-vein' })
    expect(gathered).not.toBe(state)
    expect(itemQuantity(gathered.inventory, 'iron-ore')).toBe(1)
    expect(gathered.progression.skills.quarrying.xp).toBe(leveledXp + 24)
    expect(gathered.progression.totalXp).toBe(state.progression.totalXp + 24)
  })

  it('refuses to harvest the iron vein below the authored level gate', () => {
    const base = createInitialState()
    const belowLevelXp = Math.max(0, xpForLevel(10) - 1)
    const state = {
      ...base,
      world: { ...base.world, mapId: 'name-press', position: { x: 760, y: 400 } },
      progression: {
        ...base.progression,
        skills: { ...base.progression.skills, quarrying: { xp: belowLevelXp } },
      },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'name-press-iron-vein' })
    expect(gathered).toBe(state)
    expect(itemQuantity(gathered.inventory, 'iron-ore')).toBe(0)
  })

  it('gives the orichalcum cache a far slower respawn cadence than the default resource node', () => {
    const request = { mapId: 'atlas-vault', entityId: 'vault-orichalcum-cache', capacity: 1, respawnTicks: 1200 }
    const resources = createInitialResourceNodes()

    const harvested = harvestResourceNode({ resources, ...request, quantity: 1, playtimeTicks: 0 })
    expect(harvested.changed).toBe(true)
    expect(harvested.node.remaining).toBe(0)
    expect(harvested.node.nextRespawnTick).toBe(1200)
    expect(harvested.node.nextRespawnTick).toBeGreaterThan(DEFAULT_RESOURCE_RESPAWN_TICKS)

    // A default-cadence node would already have respawned by this tick; the
    // orichalcum cache must still be unavailable.
    const stillDepleted = resourceNodeStatus({
      resources: harvested.resources, ...request, playtimeTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    })
    expect(stillDepleted.available).toBe(false)
    expect(stillDepleted.waitTicks).toBe(1200 - DEFAULT_RESOURCE_RESPAWN_TICKS)

    // It does respawn exactly at its authored boundary.
    const respawned = resourceNodeStatus({ resources: harvested.resources, ...request, playtimeTicks: 1200 })
    expect(respawned.available).toBe(true)
    expect(respawned.waitTicks).toBe(0)
  })

  it('introduces no new content-validation errors, and only the expected legacy-authoring warning', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)

    for (const { mapId, entityId } of NEW_NODES) {
      const related = report.issues.filter((entry) => entry.path === `maps.${mapId}.entities.${entityId}`)
      for (const entry of related) {
        expect(entry.code, `${mapId}:${entityId} unexpected issue code`).toBe('LEGACY_AUTHORING_RECORD')
        expect(entry.severity).toBe('warning')
      }
    }
  })
})
