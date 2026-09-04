import { describe, expect, it } from 'vitest'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, SKILL_DEF_BY_ID, xpForLevel } from '../src/rpg/progression.js'
import { REGISTERED_MAPS, rpgMapById } from '../src/rpg/registry.js'
import {
  DEFAULT_RESOURCE_RESPAWN_TICKS,
  createInitialResourceNodes,
  harvestResourceNode,
  resourceNodeStatus,
} from '../src/rpg/resources.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Fishing previously had only two node tiers (sardine lvl1 in Act I, tuna
// lvl30 in Act II) and no tool at all. This closes the mid/high-level gap
// with red-mullet, sturgeon, and hippocamp-roe (already-defined item tiers
// with no prior in-world source) placed on existing Act II maps.
const NEW_NODES = [
  {
    mapId: 'pelagos-harbor',
    entityId: 'pelagos-red-mullet-run',
    fields: {
      kind: 'resource', x: 300, y: 400, name: 'Pelagos Red Mullet Run',
      label: 'Fish the harbor red mullet run', skillId: 'fishing', itemId: 'red-mullet', level: 15, xp: 27,
    },
  },
  {
    mapId: 'storm-anchorage',
    entityId: 'anchorage-sturgeon-run',
    fields: {
      kind: 'resource', x: 620, y: 310, name: 'Deepwater Sturgeon Run',
      label: 'Fish the deepwater sturgeon run', skillId: 'fishing', itemId: 'sturgeon', level: 50, xp: 72,
    },
  },
  {
    mapId: 'archive-barge-deck',
    entityId: 'archive-hippocamp-shoal',
    fields: {
      kind: 'resource', x: 300, y: 420, name: 'Archive Hippocamp Shoal',
      label: 'Draw roe from the warded hippocamp shoal', skillId: 'fishing', itemId: 'hippocamp-roe', level: 75, xp: 135,
      capacity: 1, respawnTicks: 1100,
    },
  },
]

const NEW_ENTITY_IDS = new Set(NEW_NODES.map((node) => node.entityId))

// All three new nodes sit on lanes that carry every Act II tide state, so
// reachability holds across the whole tide cycle, not just one snapshot.
const ROUTE_STATES_BY_MAP = {
  'pelagos-harbor': ACT2_TIDE_ORDER,
  'storm-anchorage': ACT2_TIDE_ORDER,
  'archive-barge-deck': ACT2_TIDE_ORDER,
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

function atMap(state, mapId, position) {
  return { ...state, world: { ...state.world, mapId, ...(position ? { position } : {}) } }
}

// Physical bank access requires the concrete storehouse entity on the current
// map and a protagonist standing beside it. Position west of the bank (validated
// reachable) and open it through the reducer so deposits/withdrawals carry real
// physical authority.
function openBankNear(state) {
  const map = rpgMapById(state.world.mapId)
  const entity = map.entities.find((candidate) => candidate.kind === 'bank')
  const near = { ...state, world: { ...state.world, position: { x: entity.x - 8, y: entity.y } } }
  return applyEvent(near, { type: 'OPEN_BANK', entityId: entity.id })
}

describe('fishing expansion: red-mullet, sturgeon, and hippocamp-roe nodes', () => {
  it('places all three new resource nodes on their authored maps with the authored fields', () => {
    for (const { mapId, entityId, fields } of NEW_NODES) {
      const map = REGISTERED_MAPS[mapId]
      expect(map, mapId).toBeTruthy()
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      expect(entity, `${mapId}:${entityId}`).toBeTruthy()
      expect(entity).toMatchObject(fields)
      expect(ALL_ITEM_DEFS[entity.itemId], `${mapId}:${entityId} item`).toBeTruthy()
      expect(SKILL_DEF_BY_ID[entity.skillId], `${mapId}:${entityId} skill`).toBeTruthy()
      expect(entity.skillId).toBe('fishing')
    }
  })

  it('is reachable from every spawn on its map within gameplay interaction distance across the full tide cycle', () => {
    for (const { mapId, entityId } of NEW_NODES) {
      const map = REGISTERED_MAPS[mapId]
      const entity = map.entities.find((candidate) => candidate.id === entityId)
      expectReachableFromEverySpawn(map, entity)
    }
  })

  it('keeps every new fishing node physically distinct from its neighbors', () => {
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

  it('lets a sufficiently leveled fishing player harvest red-mullet from the pelagos harbor run', () => {
    const base = createInitialState()
    const leveledXp = xpForLevel(15)
    const state = {
      ...atMap(base, 'pelagos-harbor', { x: 300, y: 400 }),
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: leveledXp } } },
    }
    expect(itemQuantity(state.inventory, 'red-mullet')).toBe(0)

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(gathered).not.toBe(state)
    expect(itemQuantity(gathered.inventory, 'red-mullet')).toBe(1)
    expect(gathered.progression.skills.fishing.xp).toBe(leveledXp + 27)
    expect(gathered.progression.totalXp).toBe(state.progression.totalXp + 27)
  })

  it('refuses to harvest red-mullet below the authored level gate, leaving state byte-identical', () => {
    const base = createInitialState()
    const belowLevelXp = Math.max(0, xpForLevel(15) - 1)
    const state = {
      ...atMap(base, 'pelagos-harbor', { x: 300, y: 400 }),
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: belowLevelXp } } },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(gathered).toBe(state)
    expect(itemQuantity(gathered.inventory, 'red-mullet')).toBe(0)
  })

  it('refuses to harvest sturgeon below its level gate and grants it exactly at the gate', () => {
    const base = createInitialState()
    const belowLevelXp = Math.max(0, xpForLevel(50) - 1)
    const belowState = {
      ...atMap(base, 'storm-anchorage', { x: 620, y: 310 }),
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: belowLevelXp } } },
    }
    const refused = applyEvent(belowState, { type: 'GATHER', entityId: 'anchorage-sturgeon-run' })
    expect(refused).toBe(belowState)

    const atLevelXp = xpForLevel(50)
    const atLevelState = {
      ...atMap(base, 'storm-anchorage', { x: 620, y: 310 }),
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: atLevelXp } } },
    }
    const gathered = applyEvent(atLevelState, { type: 'GATHER', entityId: 'anchorage-sturgeon-run' })
    expect(itemQuantity(gathered.inventory, 'sturgeon')).toBe(1)
    expect(gathered.progression.skills.fishing.xp).toBe(atLevelXp + 72)
  })

  it('depletes each node exactly once per available charge and respawns on schedule', () => {
    const base = createInitialState()
    const leveledXp = xpForLevel(15)
    const state = {
      ...atMap(base, 'pelagos-harbor', { x: 300, y: 400 }),
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: leveledXp } } },
    }
    const firstHarvest = applyEvent(state, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(itemQuantity(firstHarvest.inventory, 'red-mullet')).toBe(1)

    // The node is now depleted; a second GATHER before respawn is a no-op.
    const secondAttempt = applyEvent(firstHarvest, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(secondAttempt).toBe(firstHarvest)
    expect(itemQuantity(secondAttempt.inventory, 'red-mullet')).toBe(1)

    // Advance exactly to the default respawn boundary and harvest again.
    const respawned = applyEvent(firstHarvest, { type: 'TICK', n: DEFAULT_RESOURCE_RESPAWN_TICKS })
    const thirdHarvest = applyEvent(respawned, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(itemQuantity(thirdHarvest.inventory, 'red-mullet')).toBe(2)
  })

  it('gives the hippocamp shoal a far slower respawn cadence than the default resource node', () => {
    const request = { mapId: 'archive-barge-deck', entityId: 'archive-hippocamp-shoal', capacity: 1, respawnTicks: 1100 }
    const resources = createInitialResourceNodes()

    const harvested = harvestResourceNode({ resources, ...request, quantity: 1, playtimeTicks: 0 })
    expect(harvested.changed).toBe(true)
    expect(harvested.node.remaining).toBe(0)
    expect(harvested.node.nextRespawnTick).toBe(1100)
    expect(harvested.node.nextRespawnTick).toBeGreaterThan(DEFAULT_RESOURCE_RESPAWN_TICKS)

    const stillDepleted = resourceNodeStatus({
      resources: harvested.resources, ...request, playtimeTicks: DEFAULT_RESOURCE_RESPAWN_TICKS,
    })
    expect(stillDepleted.available).toBe(false)
    expect(stillDepleted.waitTicks).toBe(1100 - DEFAULT_RESOURCE_RESPAWN_TICKS)

    const respawnedStatus = resourceNodeStatus({ resources: harvested.resources, ...request, playtimeTicks: 1100 })
    expect(respawnedStatus.available).toBe(true)
    expect(respawnedStatus.waitTicks).toBe(0)
  })

  it('carrying only the iron fishing rod grants exactly the tier-2 bonus on the new nodes, never the stacked total', () => {
    const base = createInitialState()
    const leveledXp = xpForLevel(15)
    const withBronze = addInventoryItem(base.inventory, 'bronze-fishing-rod', 1, ALL_ITEM_DEFS).inventory
    const withBoth = addInventoryItem(withBronze, 'iron-fishing-rod', 1, ALL_ITEM_DEFS).inventory
    const state = {
      ...atMap(base, 'pelagos-harbor', { x: 300, y: 400 }),
      inventory: withBoth,
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: leveledXp } } },
    }
    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    // base 1 + max(1, 2) = 3, never 1 + 1 + 2 = 4.
    expect(itemQuantity(gathered.inventory, 'red-mullet')).toBe(3)
  })

  it('never partially harvests a node when the yield cannot fit in a full inventory', () => {
    const base = createInitialState()
    const leveledXp = xpForLevel(15)
    const filled = addInventoryItem(base.inventory, 'barley-flatbread', 25, ALL_ITEM_DEFS).inventory
    expect(filled.slots.length).toBe(28)
    const state = {
      ...atMap(base, 'pelagos-harbor', { x: 300, y: 400 }),
      inventory: filled,
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: leveledXp } } },
    }

    const gathered = applyEvent(state, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    // The whole event is a no-op: no red-mullet granted, and the node's
    // charge is not consumed either — an inventory-full failure never
    // silently burns the resource node's availability.
    expect(gathered).toBe(state)
    expect(itemQuantity(gathered.inventory, 'red-mullet')).toBe(0)

    const stillFull = { ...state, inventory: gathered.inventory }
    const nowWithRoom = {
      ...stillFull,
      inventory: { ...stillFull.inventory, slots: stillFull.inventory.slots.slice(0, 27) },
    }
    const secondAttempt = applyEvent(nowWithRoom, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(itemQuantity(secondAttempt.inventory, 'red-mullet')).toBe(1)
  })

  it('lets a caught fish be deposited into and withdrawn from the physical bank', () => {
    const base = createInitialState()
    const leveledXp = xpForLevel(15)
    const state = {
      ...atMap(base, 'pelagos-harbor', { x: 300, y: 400 }),
      progression: { ...base.progression, skills: { ...base.progression.skills, fishing: { xp: leveledXp } } },
    }
    const caught = applyEvent(state, { type: 'GATHER', entityId: 'pelagos-red-mullet-run' })
    expect(itemQuantity(caught.inventory, 'red-mullet')).toBe(1)

    // Depositing away from any physical bank is a no-op.
    const remote = atMap(caught, 'breakwater-road')
    const remoteDeposit = applyEvent(remote, { type: 'BANK_DEPOSIT', itemId: 'red-mullet', quantity: 1 })
    expect(remoteDeposit).toBe(remote)

    // Pelagos Harbor now has its own regional bank (the Pelagos Storehouse) —
    // no need to travel back to Beacon Overlook to secure a catch. Open it
    // physically first so the deposit carries real authority.
    const atBank = openBankNear(caught)
    const deposited = applyEvent(atBank, { type: 'BANK_DEPOSIT', itemId: 'red-mullet', quantity: 1 })
    expect(itemQuantity(deposited.inventory, 'red-mullet')).toBe(0)
    expect(deposited.inventory.bank.slots).toContainEqual({ itemId: 'red-mullet', quantity: 1 })

    const withdrawn = applyEvent(deposited, { type: 'BANK_WITHDRAW', itemId: 'red-mullet', quantity: 1 })
    expect(itemQuantity(withdrawn.inventory, 'red-mullet')).toBe(1)
    expect(withdrawn.inventory.bank.slots.some((entry) => entry.itemId === 'red-mullet')).toBe(false)
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
