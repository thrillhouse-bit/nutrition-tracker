import { describe, expect, it } from 'vitest'
import { RECIPES } from '../src/rpg/crafting.js'
import { REGISTERED_MAPS } from '../src/rpg/registry.js'
import {
  CRAFTING_ACCESS_BY_STATION,
  SYSTEM_ACCESS_BY_MAP,
  WILDERNESS_ACCESS_BY_REGION,
  craftingAccessDecision,
  craftingAccessForStation,
  craftingStationMaps,
  systemAccessForMap,
  validateSystemAccess,
  wildernessAccessDecision,
  wildernessAccessForRegion,
  wildernessMaps,
} from '../src/rpg/systemAccess.js'
import { REGIONS } from '../src/rpg/wilderness.js'

const stationIds = [...new Set(RECIPES.map((recipe) => recipe.stationId))]
const regionIds = REGIONS.map((region) => region.id)

describe('physical system-access coverage', () => {
  it('covers every current wilderness region on at least one authored map', () => {
    expect(Object.keys(WILDERNESS_ACCESS_BY_REGION).sort()).toEqual([...regionIds].sort())
    for (const regionId of regionIds) {
      const access = wildernessAccessForRegion(regionId)
      expect(access, regionId).toBeTruthy()
      expect(access.mapIds.length, `${regionId} maps`).toBeGreaterThan(0)
      expect(access.entryLabel, `${regionId} label`).toBeTruthy()
      for (const mapId of access.mapIds) expect(REGISTERED_MAPS[mapId], `${regionId}:${mapId}`).toBeTruthy()
    }
  })

  it('covers every recipe station ID without inventing unknown stations', () => {
    expect(Object.keys(CRAFTING_ACCESS_BY_STATION).sort()).toEqual([...stationIds].sort())
    for (const stationId of stationIds) {
      const access = craftingAccessForStation(stationId)
      expect(access, stationId).toBeTruthy()
      expect(access.mapIds.length, `${stationId} maps`).toBeGreaterThan(0)
      expect(access.accessLabel, `${stationId} label`).toBeTruthy()
      for (const mapId of access.mapIds) expect(REGISTERED_MAPS[mapId], `${stationId}:${mapId}`).toBeTruthy()
    }
    expect(validateSystemAccess()).toEqual([])
  })

  it('provides a complete immutable map-first lookup surface', () => {
    expect(Object.keys(SYSTEM_ACCESS_BY_MAP).sort()).toEqual(Object.keys(REGISTERED_MAPS).sort())
    for (const [mapId, access] of Object.entries(SYSTEM_ACCESS_BY_MAP)) {
      expect(access.mapId).toBe(mapId)
      expect(access.label).toBeTruthy()
      for (const regionId of access.wildernessRegionIds) expect(regionIds).toContain(regionId)
      for (const stationId of access.craftingStationIds) expect(stationIds).toContain(stationId)
    }
  })
})

describe('lore-coherent representative placements', () => {
  it('anchors every wilderness band to the requested world geography', () => {
    expect(wildernessMaps('olive-road')).toEqual(['olive-road'])
    expect(wildernessMaps('cephissus-shallows')).toEqual(expect.arrayContaining(['breakwater-road', 'storm-anchorage']))
    expect(wildernessMaps('asphodel-fringe')).toEqual(['asphodel-gate'])
    expect(wildernessMaps('cursed-grove-of-hecate')).toEqual(expect.arrayContaining(['winter-orchard']))
    expect(wildernessMaps('tartarus-rift')).toEqual(expect.arrayContaining(['false-constellation', 'night-stair']))
  })

  it('places representative stations at their authored physical homes', () => {
    expect(craftingStationMaps('bronze-forge')).toEqual(['beacon-overlook', 'bronze-foundry'])
    expect(craftingStationMaps('shipwright')).toContain('pelagos-harbor')
    expect(craftingStationMaps('loom')).toEqual(['silent-loom'])
    expect(craftingStationMaps('field-kitchen')).toEqual(expect.arrayContaining(['beacon-overlook', 'nyx-foothold']))
    expect(craftingStationMaps('alchemy-lab')).toEqual(['beacon-overlook', 'kore-sanctuary'])
  })
})

describe('strict lookups and user-facing access decisions', () => {
  it('rejects unknown maps, wilderness IDs, and station IDs', () => {
    expect(systemAccessForMap('not-a-map')).toBeNull()
    expect(wildernessAccessForRegion('not-a-region')).toBeNull()
    expect(craftingAccessForStation('not-a-station')).toBeNull()
    expect(wildernessMaps('not-a-region')).toBeNull()
    expect(craftingStationMaps('not-a-station')).toBeNull()
    expect(wildernessAccessDecision('not-a-map', 'olive-road')).toBeNull()
    expect(wildernessAccessDecision('olive-road', 'not-a-region')).toBeNull()
    expect(craftingAccessDecision('not-a-map', 'bronze-forge')).toBeNull()
    expect(craftingAccessDecision('olive-road', 'not-a-station')).toBeNull()
  })

  it('returns labeled available decisions only at physical access maps', () => {
    expect(wildernessAccessDecision('olive-road', 'olive-road')).toMatchObject({
      available: true,
      mapId: 'olive-road',
      regionId: 'olive-road',
    })
    expect(wildernessAccessDecision('olive-road', 'olive-road').label).toContain('Olive Road')
    expect(craftingAccessDecision('bronze-foundry', 'bronze-forge')).toMatchObject({
      available: true,
      mapId: 'bronze-foundry',
      stationId: 'bronze-forge',
    })
    expect(craftingAccessDecision('bronze-foundry', 'bronze-forge').label).toContain('forge')
  })

  it('explains known but unavailable access with a useful destination', () => {
    const wild = wildernessAccessDecision('beacon-overlook', 'asphodel-fringe')
    expect(wild.available).toBe(false)
    expect(wild.reason).toContain('Beacon Overlook')
    expect(wild.reason).toContain('Asphodel Gate')

    const craft = craftingAccessDecision('olive-road', 'loom')
    expect(craft.available).toBe(false)
    expect(craft.reason).toContain('Olive Road')
    expect(craft.reason).toContain('Silent Loom')
  })
})

describe('immutable policy data', () => {
  it('freezes exported definitions, nested arrays, map entries, and decisions', () => {
    expect(Object.isFrozen(WILDERNESS_ACCESS_BY_REGION)).toBe(true)
    expect(Object.isFrozen(WILDERNESS_ACCESS_BY_REGION['olive-road'])).toBe(true)
    expect(Object.isFrozen(wildernessMaps('olive-road'))).toBe(true)
    expect(Object.isFrozen(CRAFTING_ACCESS_BY_STATION)).toBe(true)
    expect(Object.isFrozen(craftingStationMaps('bronze-forge'))).toBe(true)
    expect(Object.isFrozen(SYSTEM_ACCESS_BY_MAP)).toBe(true)
    expect(Object.isFrozen(systemAccessForMap('olive-road').craftingStationIds)).toBe(true)
    expect(Object.isFrozen(wildernessAccessDecision('olive-road', 'olive-road'))).toBe(true)
    expect(Object.isFrozen(craftingAccessDecision('bronze-foundry', 'bronze-forge'))).toBe(true)
  })

  it('cannot be mutated through returned lookup data', () => {
    expect(() => wildernessMaps('olive-road').push('beacon-overlook')).toThrow()
    expect(() => craftingStationMaps('bronze-forge').splice(0, 1)).toThrow()
    expect(() => { systemAccessForMap('olive-road').label = 'Remote menu' }).toThrow()
    expect(wildernessMaps('olive-road')).toEqual(['olive-road'])
    expect(craftingStationMaps('bronze-forge')).toEqual(['beacon-overlook', 'bronze-foundry'])
  })
})
