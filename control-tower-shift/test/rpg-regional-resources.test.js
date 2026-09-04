import { describe, expect, it } from 'vitest'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { ACT3_SEASONAL_STATES } from '../src/rpg/act3Content.js'
import { ACT4_PRESSURE_RULES } from '../src/rpg/act4Content.js'
import { ACT5_LIGHT_POLARITY_RULES } from '../src/rpg/act5Content.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { SKILL_DEF_BY_ID } from '../src/rpg/progression.js'
import { REGISTERED_MAPS } from '../src/rpg/registry.js'
import { CRAFTING_ACCESS_BY_STATION } from '../src/rpg/systemAccess.js'

const REQUIRED_SOURCE_ITEMS = [
  'cedar-log',
  'charred-ember',
  'cypress-log',
  'laurel-branch',
  'tin-ore',
  'tuna',
]

const NEW_ENTITY_IDS = new Set([
  'pelagos-woodwork-bench',
  'pelagos-shipwright',
  'olive-road-carpenter-bench',
  'archive-barge-shipwright',
  'nereid-tin-vein',
  'anchorage-tuna-run',
  'wheat-village-hearth',
  'wheat-village-kiln',
  'orchard-cypress',
  'kore-alchemy-lab',
  'slag-road-cedar',
  'foundry-charred-ember',
  'bronze-foundry-forge',
  'bronze-foundry-kiln',
  'beacon-field-kitchen',
  'beacon-shrine-fire',
  'nyx-laurel',
  'nyx-field-kitchen',
  'nyx-shrine-fire',
  'restored-covenant-loom',
])

const ROUTE_STATES_BY_MAP = {
  'pelagos-harbor': ACT2_TIDE_ORDER,
  'nereid-caves': ACT2_TIDE_ORDER,
  'storm-anchorage': ACT2_TIDE_ORDER,
  'wheat-village': Object.keys(ACT3_SEASONAL_STATES),
  'winter-orchard': Object.keys(ACT3_SEASONAL_STATES),
  'kore-sanctuary': Object.keys(ACT3_SEASONAL_STATES),
  'slag-road': ACT4_PRESSURE_RULES.states,
  'bronze-foundry': ACT4_PRESSURE_RULES.states,
  'nyx-foothold': ACT5_LIGHT_POLARITY_RULES.stateIds,
  'silent-loom': ACT5_LIGHT_POLARITY_RULES.stateIds,
}

function regionalEntities(predicate) {
  return Object.values(REGISTERED_MAPS).flatMap((map) => (
    (map.entities || [])
      .filter(predicate)
      .map((entity) => ({ map, entity }))
  ))
}

function expectReachableFromEverySpawn(map, entity) {
  for (const routeStateId of ROUTE_STATES_BY_MAP[map.id] || [undefined]) {
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

describe('regional gathering sources and crafting stations', () => {
  it('provides one legitimate, typed gathering source for each missing base ingredient', () => {
    const sources = regionalEntities(({ kind, itemId }) => kind === 'resource' && REQUIRED_SOURCE_ITEMS.includes(itemId))
    expect(sources.map(({ entity }) => entity.itemId).sort()).toEqual(REQUIRED_SOURCE_ITEMS)

    for (const { map, entity } of sources) {
      expect(ALL_ITEM_DEFS[entity.itemId], `${map.id}:${entity.id} item`).toBeTruthy()
      expect(SKILL_DEF_BY_ID[entity.skillId], `${map.id}:${entity.id} skill`).toBeTruthy()
      expect(Number.isSafeInteger(entity.level), `${map.id}:${entity.id} level`).toBe(true)
      expect(entity.level).toBeGreaterThan(0)
      expect(Number.isSafeInteger(entity.xp), `${map.id}:${entity.id} xp`).toBe(true)
      expect(entity.xp).toBeGreaterThan(0)
      expectReachableFromEverySpawn(map, entity)
    }

    const directResourceItems = new Set(regionalEntities(({ kind }) => kind === 'resource').map(({ entity }) => entity.itemId))
    expect(directResourceItems.has('bronze-bar')).toBe(false)
    expect(directResourceItems.has('cypress-plank')).toBe(false)
  })

  it('physically places every crafting station on a map authorized by system access', () => {
    const placements = regionalEntities((entity) => entity.kind === 'station')
    // A station may have more than one physical placement (e.g. bronze-forge
    // is reachable from both Beacon Overlook and the Act IV Bronze Foundry) —
    // every authored station id must have at least one, and every placement
    // must sit on a map that station's access policy actually authorizes.
    expect(new Set(placements.map(({ entity }) => entity.stationId))).toEqual(
      new Set(Object.keys(CRAFTING_ACCESS_BY_STATION)),
    )

    for (const { map, entity } of placements) {
      expect(CRAFTING_ACCESS_BY_STATION[entity.stationId].mapIds, `${map.id}:${entity.id}`).toContain(map.id)
      expectReachableFromEverySpawn(map, entity)
    }

    // Every advertised map placement is a real world object, not a map-wide
    // permission that can be opened remotely from the Systems journal.
    for (const [stationId, access] of Object.entries(CRAFTING_ACCESS_BY_STATION)) {
      for (const mapId of access.mapIds) {
        const map = REGISTERED_MAPS[mapId]
        const entity = map.entities.find((candidate) => candidate.kind === 'station' && candidate.stationId === stationId)
        expect(entity, `${stationId}:${mapId} concrete station`).toBeTruthy()
        expectReachableFromEverySpawn(map, entity)
      }
    }
  })

  it('keeps every new semantic target physically distinct from its neighbors', () => {
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

  it('closes the unobtainable-ingredient and virtual-station validator gaps', () => {
    const report = validateRPGContent()
    expect(report.issues.filter((issue) => issue.code === 'UNOBTAINABLE_RECIPE_INGREDIENT')).toEqual([])
    expect(report.issues.filter((issue) => issue.code === 'UNPLACED_STATION')).toEqual([])
    for (const itemId of REQUIRED_SOURCE_ITEMS) expect(report.obtainableItemIds).toContain(itemId)
  })
})
