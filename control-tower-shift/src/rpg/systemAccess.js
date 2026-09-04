// Physical access policy for wilderness and crafting systems.
//
// Domain modules define what wilderness regions and recipes exist. This pure
// policy defines where the player may enter or use them so future UI/state
// integration can remove global menus without duplicating lore placement.

import { RECIPES } from './crafting.js'
import { REGISTERED_MAPS } from './registry.js'
import { findWorldPath } from './pathfinding.js'
import { REGIONS } from './wilderness.js'

// This is the same semantic interaction radius used by the world UI. System
// panels are conveniences for an already-reached object, never remote menus.
export const SYSTEM_INTERACTION_RADIUS = 56

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const WILDERNESS_PLACEMENT = {
  'olive-road': {
    label: 'Olive Road Wilds',
    mapIds: ['olive-road'],
    entryLabel: 'Leave the civic road for the Olive Road wilds',
  },
  'cephissus-shallows': {
    label: 'Cephissus Shallows',
    mapIds: ['breakwater-road', 'storm-anchorage'],
    entryLabel: 'Enter the river-fed shallows beyond the Pelagos breakwater',
  },
  'asphodel-fringe': {
    label: 'Asphodel Fringe',
    mapIds: ['asphodel-gate'],
    entryLabel: 'Cross the gate into the unsettled Asphodel fringe',
  },
  'cursed-grove-of-hecate': {
    label: 'Cursed Grove of Hecate',
    mapIds: ['winter-orchard', 'kore-sanctuary'],
    entryLabel: 'Follow the winter orchard paths into Hecate’s cursed grove',
  },
  'tartarus-rift': {
    label: 'Tartarus Rift',
    mapIds: ['false-constellation', 'night-stair', 'silent-loom-approach'],
    entryLabel: 'Descend through the late covenant threshold to the Tartarus rift',
  },
}

const CRAFTING_PLACEMENT = {
  'chartwright-open-table': { label: 'Open Chart Table', mapIds: ['chartwright-hall'], accessLabel: 'Work at the public chart table' },
  'signal-buoy-workbench': { label: 'Signal Buoy Workbench', mapIds: ['submerged-signal-shoal'], accessLabel: 'Work at the drowned signal buoy' },
  'bronze-forge': {
    label: 'Bronze Forge',
    mapIds: ['beacon-overlook', 'bronze-foundry'],
    accessLabel: 'Work metal at a bronze forge',
  },
  'woodwork-bench': {
    label: 'Woodwork Bench',
    mapIds: ['olive-road', 'pelagos-harbor'],
    accessLabel: 'Shape timber at a road or harbor workbench',
  },
  shipwright: {
    label: 'Shipwright',
    mapIds: ['pelagos-harbor', 'archive-barge-deck'],
    accessLabel: 'Work at a Pelagos shipwright’s station',
  },
  'field-kitchen': {
    label: 'Field Kitchen',
    mapIds: ['beacon-overlook', 'nyx-foothold'],
    accessLabel: 'Cook at a staffed expedition camp',
  },
  hearth: {
    label: 'Village Hearth',
    mapIds: ['wheat-village'],
    accessLabel: 'Prepare food at the Wheat Village hearth',
  },
  'alchemy-lab': {
    label: 'Alchemy Laboratory',
    mapIds: ['beacon-overlook', 'kore-sanctuary'],
    accessLabel: 'Brew remedies at an alchemy laboratory',
  },
  loom: {
    label: 'Covenant Loom',
    mapIds: ['silent-loom'],
    accessLabel: 'Weave at the restored Silent Loom',
  },
  kiln: {
    label: 'Foundry Kiln',
    mapIds: ['beacon-overlook', 'bronze-foundry', 'wheat-village'],
    accessLabel: 'Fire clay at a kiln',
  },
  'shrine-fire': {
    label: 'Shrine Fire',
    mapIds: ['beacon-overlook', 'nyx-foothold'],
    accessLabel: 'Consecrate the offering at a tended shrine fire',
  },
  'votive-stand': {
    label: 'Votive Stand',
    mapIds: ['beacon-overlook'],
    accessLabel: 'Leave a votive offering',
  },
}

export const WILDERNESS_ACCESS_BY_REGION = deepFreeze(Object.fromEntries(
  Object.entries(WILDERNESS_PLACEMENT).map(([regionId, definition]) => [
    regionId,
    { regionId, ...definition, mapIds: [...definition.mapIds] },
  ]),
))

export const CRAFTING_ACCESS_BY_STATION = deepFreeze(Object.fromEntries(
  Object.entries(CRAFTING_PLACEMENT).map(([stationId, definition]) => [
    stationId,
    { stationId, ...definition, mapIds: [...definition.mapIds] },
  ]),
))


function idsAtMap(definitions, mapId, idKey) {
  return Object.values(definitions)
    .filter((definition) => definition.mapIds.includes(mapId))
    .map((definition) => definition[idKey])
}

// Canonical map-first view for renderers and interaction discovery.
export const SYSTEM_ACCESS_BY_MAP = deepFreeze(Object.fromEntries(
  Object.entries(REGISTERED_MAPS).map(([mapId, map]) => [
    mapId,
    {
      mapId,
      label: map.name || mapId,
      wildernessRegionIds: idsAtMap(WILDERNESS_ACCESS_BY_REGION, mapId, 'regionId'),
      craftingStationIds: idsAtMap(CRAFTING_ACCESS_BY_STATION, mapId, 'stationId'),
    },
  ]),
))

export function systemAccessForMap(mapId) {
  return (typeof mapId === 'string' && SYSTEM_ACCESS_BY_MAP[mapId]) || null
}

export function wildernessAccessForRegion(regionId) {
  return (typeof regionId === 'string' && WILDERNESS_ACCESS_BY_REGION[regionId]) || null
}

export function craftingAccessForStation(stationId) {
  return (typeof stationId === 'string' && CRAFTING_ACCESS_BY_STATION[stationId]) || null
}

export function wildernessMaps(regionId) {
  return wildernessAccessForRegion(regionId)?.mapIds || null
}

export function craftingStationMaps(stationId) {
  return craftingAccessForStation(stationId)?.mapIds || null
}

function unavailableReason(label, map, destinations) {
  const destinationLabels = destinations
    .map((mapId) => REGISTERED_MAPS[mapId]?.name || mapId)
    .join(destinations.length > 2 ? ', ' : ' or ')
  return `${label} is not available at ${map.label}. Travel to ${destinationLabels}.`
}

export function wildernessAccessDecision(mapId, regionId) {
  const map = systemAccessForMap(mapId)
  const access = wildernessAccessForRegion(regionId)
  if (!map || !access) return null
  const available = map.wildernessRegionIds.includes(regionId)
  return Object.freeze({
    available,
    mapId,
    regionId,
    label: access.entryLabel,
    reason: available ? `${access.label} is physically accessible here.` : unavailableReason(access.label, map, access.mapIds),
  })
}

export function craftingAccessDecision(mapId, stationId) {
  const map = systemAccessForMap(mapId)
  const access = craftingAccessForStation(stationId)
  if (!map || !access) return null
  const available = map.craftingStationIds.includes(stationId)
  return Object.freeze({
    available,
    mapId,
    stationId,
    label: access.accessLabel,
    reason: available ? `${access.label} is physically available here.` : unavailableReason(access.label, map, access.mapIds),
  })
}

// Resolve one concrete world object and prove that it is both close enough and
// reachable under the active route state. Reducers call this for every
// mutable bank, merchant, and crafting operation; matching a map alone is
// deliberately insufficient authority.
export function physicalSystemAccessDecision({
  mapId,
  position,
  entityId,
  kind,
  stationId,
  shopId,
  routeStateId = null,
} = {}) {
  const map = typeof mapId === 'string' ? REGISTERED_MAPS[mapId] : null
  if (!map || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || typeof entityId !== 'string') return null
  const entity = map.entities?.find((candidate) => candidate.id === entityId)
  if (!entity || (kind && entity.kind !== kind)) return Object.freeze({ available: false, reason: 'That system object is not available here.' })
  if (stationId && entity.stationId !== stationId) return Object.freeze({ available: false, reason: 'That is not the selected crafting station.' })
  if (shopId && entity.shopId !== shopId) return Object.freeze({ available: false, reason: 'That is not the selected merchant.' })
  const distance = Math.hypot(position.x - entity.x, position.y - entity.y)
  if (distance >= SYSTEM_INTERACTION_RADIUS) return Object.freeze({ available: false, reason: 'Move closer to use this system object.' })
  const path = findWorldPath(map, position, entity, routeStateId ? { routeStateId } : {})
  const endpoint = path.at(-1)
  const reachable = Boolean(endpoint) && Math.hypot(endpoint.x - entity.x, endpoint.y - entity.y) < SYSTEM_INTERACTION_RADIUS
  return Object.freeze({
    available: reachable,
    mapId,
    entityId,
    kind: entity.kind,
    stationId: entity.stationId || null,
    shopId: entity.shopId || null,
    reason: reachable ? '' : 'No clear path reaches this system object.',
  })
}

// Static seam validation for build tooling. Unknown or newly added domain IDs
// remain a deliberate failure until the physical placement policy is updated.
export function validateSystemAccess() {
  const errors = []
  const regionIds = new Set(REGIONS.map((region) => region.id))
  const stationIds = new Set(RECIPES.map((recipe) => recipe.stationId))

  for (const regionId of regionIds) {
    const access = wildernessAccessForRegion(regionId)
    if (!access || access.mapIds.length === 0) errors.push(`missing wilderness access: ${regionId}`)
  }
  for (const regionId of Object.keys(WILDERNESS_ACCESS_BY_REGION)) {
    if (!regionIds.has(regionId)) errors.push(`unknown wilderness region: ${regionId}`)
  }
  for (const stationId of stationIds) {
    const access = craftingAccessForStation(stationId)
    if (!access || access.mapIds.length === 0) errors.push(`missing crafting access: ${stationId}`)
  }
  for (const stationId of Object.keys(CRAFTING_ACCESS_BY_STATION)) {
    if (!stationIds.has(stationId)) errors.push(`unknown crafting station: ${stationId}`)
  }
  for (const definition of [
    ...Object.values(WILDERNESS_ACCESS_BY_REGION),
    ...Object.values(CRAFTING_ACCESS_BY_STATION),
  ]) {
    for (const mapId of definition.mapIds) {
      if (!REGISTERED_MAPS[mapId]) errors.push(`unknown authored map: ${mapId}`)
    }
  }
  return errors
}
