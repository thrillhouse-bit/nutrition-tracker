// Deterministic resource-node depletion and respawn for Oathbearer.
//
// This is a pure domain module. Node identity is the authored map/entity pair,
// time is the persisted playtime tick, and depleted/partially depleted nodes
// are stored sparsely. No wall clock, timers, randomness, inventory mutation,
// or UI state lives here.

export const RESOURCE_NODE_STATE_VERSION = 1
export const DEFAULT_RESOURCE_NODE_CAPACITY = 1
export const DEFAULT_RESOURCE_RESPAWN_TICKS = 300
export const MAX_RESOURCE_NODE_ID_LENGTH = 96

const NODE_KEY_SEPARATOR = '::'

function strictPositiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

function strictTick(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function validId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_RESOURCE_NODE_ID_LENGTH
    && !value.includes(NODE_KEY_SEPARATOR)
}

export function resourceNodeKey(mapId, entityId) {
  return validId(mapId) && validId(entityId)
    ? `${mapId}${NODE_KEY_SEPARATOR}${entityId}`
    : null
}

export function parseResourceNodeKey(key) {
  if (typeof key !== 'string') return null
  const parts = key.split(NODE_KEY_SEPARATOR)
  if (parts.length !== 2 || !validId(parts[0]) || !validId(parts[1])) return null
  return { mapId: parts[0], entityId: parts[1] }
}

export function createInitialResourceNodes() {
  return { version: RESOURCE_NODE_STATE_VERSION, nodes: {} }
}

function canonicalSavedNode(raw) {
  if (!raw || typeof raw !== 'object') return null
  const capacity = strictPositiveInteger(raw.capacity)
  const respawnTicks = strictPositiveInteger(raw.respawnTicks)
  if (!capacity || !respawnTicks) return null

  const remaining = typeof raw.remaining === 'number' && Number.isSafeInteger(raw.remaining)
    ? Math.max(0, Math.min(capacity, raw.remaining))
    : capacity
  if (remaining >= capacity) return null

  if (remaining > 0) {
    return { remaining, capacity, respawnTicks, depletedAtTick: null, nextRespawnTick: null }
  }

  const nextRespawnTick = strictTick(raw.nextRespawnTick)
  if (nextRespawnTick === null) return null
  const suppliedDepletedAt = strictTick(raw.depletedAtTick)
  const depletedAtTick = suppliedDepletedAt !== null && suppliedDepletedAt <= nextRespawnTick
    ? suppliedDepletedAt
    : Math.max(0, nextRespawnTick - respawnTicks)
  return { remaining: 0, capacity, respawnTicks, depletedAtTick, nextRespawnTick }
}

function allowedKeySet(allowedNodeKeys) {
  if (allowedNodeKeys == null) return null
  if (!Array.isArray(allowedNodeKeys) && !(allowedNodeKeys instanceof Set)) return new Set()
  return new Set([...allowedNodeKeys].filter((key) => parseResourceNodeKey(key)))
}

// Forgiving at the save boundary: malformed records are discarded, values are
// bounded, full nodes are omitted, and nodes whose respawn boundary has passed
// become full by disappearing from the sparse state.
export function normalizeResourceNodes(raw, playtimeTicks = 0, options = {}) {
  const tick = strictTick(playtimeTicks) ?? 0
  const allowed = allowedKeySet(options.allowedNodeKeys)
  const nodes = {}
  const entries = raw?.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes)
    ? Object.entries(raw.nodes)
    : []

  for (const [key, saved] of entries) {
    if (!parseResourceNodeKey(key) || (allowed && !allowed.has(key))) continue
    const node = canonicalSavedNode(saved)
    if (!node) continue
    if (node.remaining === 0 && tick >= node.nextRespawnTick) continue
    nodes[key] = node
  }

  return { version: RESOURCE_NODE_STATE_VERSION, nodes }
}

export function advanceResourceNodes(raw, playtimeTicks = 0, options = {}) {
  return normalizeResourceNodes(raw, playtimeTicks, options)
}

function runtimeDefinition({ mapId, entityId, capacity, respawnTicks }) {
  const key = resourceNodeKey(mapId, entityId)
  const canonicalCapacity = capacity === undefined
    ? DEFAULT_RESOURCE_NODE_CAPACITY
    : strictPositiveInteger(capacity)
  const canonicalRespawnTicks = respawnTicks === undefined
    ? DEFAULT_RESOURCE_RESPAWN_TICKS
    : strictPositiveInteger(respawnTicks)
  if (!key || !canonicalCapacity || !canonicalRespawnTicks) return null
  return { key, mapId, entityId, capacity: canonicalCapacity, respawnTicks: canonicalRespawnTicks }
}

function nodeAtTick(raw, definition, playtimeTicks) {
  const normalized = normalizeResourceNodes(raw, playtimeTicks)
  const saved = normalized.nodes[definition.key]
  if (!saved) {
    return {
      resources: normalized,
      node: {
        ...definition,
        remaining: definition.capacity,
        depletedAtTick: null,
        nextRespawnTick: null,
      },
    }
  }

  // Authored runtime values remain authoritative if a later content revision
  // changes a node's capacity or cadence. Persisted progress is clamped into
  // the current definition rather than reviving stale configuration.
  const remaining = Math.min(definition.capacity, saved.remaining)
  if (remaining >= definition.capacity) {
    const nodes = { ...normalized.nodes }
    delete nodes[definition.key]
    return {
      resources: { ...normalized, nodes },
      node: {
        ...definition,
        remaining: definition.capacity,
        depletedAtTick: null,
        nextRespawnTick: null,
      },
    }
  }
  return {
    resources: normalized,
    node: {
      ...definition,
      remaining,
      depletedAtTick: remaining === 0 ? saved.depletedAtTick : null,
      nextRespawnTick: remaining === 0 ? saved.nextRespawnTick : null,
    },
  }
}

export function resourceNodeStatus({
  resources,
  mapId,
  entityId,
  capacity,
  respawnTicks,
  playtimeTicks = 0,
}) {
  const tick = strictTick(playtimeTicks)
  const definition = runtimeDefinition({ mapId, entityId, capacity, respawnTicks })
  if (tick === null || !definition) return null
  const current = nodeAtTick(resources, definition, tick)
  return {
    resources: current.resources,
    node: current.node,
    available: current.node.remaining > 0,
    waitTicks: current.node.nextRespawnTick === null
      ? 0
      : Math.max(0, current.node.nextRespawnTick - tick),
  }
}

function harvestResult(resources, node, changed, reason, quantity = 0) {
  return { resources, node, changed, reason, quantity }
}

// Atomically consumes an exact number of charges. Requests that are malformed
// or exceed the available charges never partially deplete a node.
export function harvestResourceNode({
  resources,
  mapId,
  entityId,
  quantity = 1,
  capacity,
  respawnTicks,
  playtimeTicks = 0,
}) {
  const count = strictPositiveInteger(quantity)
  const tick = strictTick(playtimeTicks)
  const definition = runtimeDefinition({ mapId, entityId, capacity, respawnTicks })
  if (!count || tick === null || !definition) {
    return harvestResult(resources, null, false, 'invalid_request')
  }

  const current = nodeAtTick(resources, definition, tick)
  if (current.node.remaining === 0) {
    return harvestResult(current.resources, current.node, false, 'depleted')
  }
  if (count > current.node.remaining) {
    return harvestResult(current.resources, current.node, false, 'insufficient_charges')
  }

  const remaining = current.node.remaining - count
  const nextRespawnTick = remaining === 0 ? tick + definition.respawnTicks : null
  if (nextRespawnTick !== null && !Number.isSafeInteger(nextRespawnTick)) {
    return harvestResult(current.resources, current.node, false, 'invalid_request')
  }
  const node = {
    ...definition,
    remaining,
    depletedAtTick: remaining === 0 ? tick : null,
    nextRespawnTick,
  }
  const nextResources = {
    ...current.resources,
    nodes: {
      ...current.resources.nodes,
      [definition.key]: {
        remaining: node.remaining,
        capacity: definition.capacity,
        respawnTicks: definition.respawnTicks,
        depletedAtTick: node.depletedAtTick,
        nextRespawnTick: node.nextRespawnTick,
      },
    },
  }
  return harvestResult(nextResources, node, true, 'harvested', count)
}
