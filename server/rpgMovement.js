// Pure, server-timed movement planning. Clients submit a destination only;
// map, origin, active route state, path, speed, and clock all remain trusted
// server inputs. This module deliberately has no persistence or HTTP layer.
import { DEFAULT_LOCOMOTION_CONFIG } from '../control-tower-shift/src/rpg/locomotion.js'
import { findWorldPath, isWorldPathStepReachable, isWorldPointWalkable } from '../control-tower-shift/src/rpg/pathfinding.js'
import { rpgMapById } from '../control-tower-shift/src/rpg/registry.js'
import { routeStateForMap } from '../control-tower-shift/src/rpg/routeState.js'

export const MOVE_INTENT_MAX_WAYPOINTS = 128
export const MOVE_INTENT_MAX_DISTANCE = 4096
export const MOVE_PLAN_MAX_BYTES = 16 * 1024
export const MOVE_INTENT_NOOP_RADIUS = 4
export const SERVER_MOVE_SPEED_UNITS_PER_SECOND = DEFAULT_LOCOMOTION_CONFIG.walkSpeed

const PLAN_VERSION = 1
const DUPLICATE_EPSILON = 1e-9
const planKeys = Object.freeze(['mapId', 'origin', 'routeStateId', 'speedUnitsPerSecond', 'startedAtMs', 'target', 'version', 'waypoints'])

function plain(value) {
  try {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  } catch {
    return false
  }
}

function exact(value, keys) {
  try {
    return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  } catch {
    return false
  }
}

function point(value) {
  return exact(value, ['x', 'y']) && Number.isFinite(value.x) && Number.isFinite(value.y)
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function fail(code) {
  return Object.freeze({ ok: false, code })
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) freeze(child)
  return Object.freeze(value)
}

function metrics(origin, waypoints) {
  let previous = origin
  let totalDistance = 0
  const segments = []
  for (const waypoint of waypoints) {
    const length = distance(previous, waypoint)
    totalDistance += length
    segments.push({ from: previous, to: waypoint, length, endDistance: totalDistance })
    previous = waypoint
  }
  return { totalDistance, segments }
}

function encodedBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return Infinity
  }
}

function currentMapState(state) {
  const world = state?.world
  if (state?.status !== 'playing' || !plain(world) || typeof world.mapId !== 'string' || !point(world.position)) return null
  const map = rpgMapById(world.mapId)
  if (!map) return null
  return { map, origin: { x: world.position.x, y: world.position.y }, routeStateId: routeStateForMap(state, map) }
}

function pathIsReachable(map, origin, waypoints, routeStateId) {
  let previous = origin
  for (const waypoint of waypoints) {
    if (!isWorldPathStepReachable(map, previous, waypoint, { routeStateId })) return false
    previous = waypoint
  }
  return true
}

function storedRouteStateIsValid(map, routeStateId) {
  const stateIds = new Set((map.traversalLanes || []).flatMap((lane) => lane.stateIds || []))
  return stateIds.size ? typeof routeStateId === 'string' && stateIds.has(routeStateId) : routeStateId === null
}

function canonicalWaypoints(origin, path, target) {
  const out = []
  let previous = origin
  for (const raw of path) {
    if (!point(raw) || distance(previous, raw) <= DUPLICATE_EPSILON) continue
    const next = { x: raw.x, y: raw.y }
    out.push(next)
    previous = next
  }
  if (!out.length || !samePoint(out.at(-1), target)) return null
  return out
}

export function parseMoveIntent(value) {
  if (!exact(value, ['target', 'type']) || value.type !== 'MOVE_INTENT' || !point(value.target)) return fail('MOVE_INTENT_INVALID')
  return freeze({ ok: true, intent: { type: 'MOVE_INTENT', target: { x: value.target.x, y: value.target.y } } })
}

// Strictly validates a stored/server-created plan shape and its bounded,
// canonical geometry representation. Current-map collision revalidation is
// intentionally deferred to materialization because route state can change.
export function validateMovePlan(value) {
  if (!exact(value, planKeys)) return fail('MOVE_PLAN_INVALID')
  if (encodedBytes(value) > MOVE_PLAN_MAX_BYTES) return fail('MOVE_PLAN_SIZE_LIMIT')
  if (
    value.version !== PLAN_VERSION
    || typeof value.mapId !== 'string'
    || !point(value.origin) || !point(value.target)
    || !(value.routeStateId === null || typeof value.routeStateId === 'string')
    || !Number.isSafeInteger(value.startedAtMs) || value.startedAtMs < 0
    || value.speedUnitsPerSecond !== SERVER_MOVE_SPEED_UNITS_PER_SECOND
    || !Array.isArray(value.waypoints) || value.waypoints.length === 0) return fail('MOVE_PLAN_INVALID')
  if (value.waypoints.length > MOVE_INTENT_MAX_WAYPOINTS) return fail('MOVE_PLAN_WAYPOINT_LIMIT')
  if (!value.waypoints.every(point) || !samePoint(value.waypoints.at(-1), value.target)) return fail('MOVE_PLAN_INVALID')
  let previous = value.origin
  for (const waypoint of value.waypoints) {
    if (distance(previous, waypoint) <= DUPLICATE_EPSILON) return fail('MOVE_PLAN_INVALID')
    previous = waypoint
  }
  const measured = metrics(value.origin, value.waypoints)
  if (measured.totalDistance <= MOVE_INTENT_NOOP_RADIUS) return fail('MOVE_NOOP')
  if (measured.totalDistance > MOVE_INTENT_MAX_DISTANCE) return fail('MOVE_PLAN_DISTANCE_LIMIT')
  const map = rpgMapById(value.mapId)
  if (!map || !storedRouteStateIsValid(map, value.routeStateId)) return fail('MOVE_PLAN_INVALID')
  if (!isWorldPointWalkable(map, value.origin, { routeStateId: value.routeStateId })
    || !isWorldPointWalkable(map, value.target, { routeStateId: value.routeStateId })
    || !pathIsReachable(map, value.origin, value.waypoints, value.routeStateId)) return fail('MOVE_PATH_INVALID')
  return freeze({
    ok: true,
    plan: {
      version: PLAN_VERSION,
      mapId: value.mapId,
      origin: { x: value.origin.x, y: value.origin.y },
      target: { x: value.target.x, y: value.target.y },
      routeStateId: value.routeStateId,
      waypoints: value.waypoints.map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
      startedAtMs: value.startedAtMs,
      speedUnitsPerSecond: value.speedUnitsPerSecond,
    },
  })
}

export function planMoveIntent({ state, intent, trustedNowMs } = {}) {
  const parsed = parseMoveIntent(intent)
  if (!parsed.ok) return parsed
  if (!Number.isSafeInteger(trustedNowMs) || trustedNowMs < 0) return fail('MOVE_TRUSTED_TIME_INVALID')
  const current = currentMapState(state)
  if (!current || !isWorldPointWalkable(current.map, current.origin, { routeStateId: current.routeStateId })) return fail('MOVE_STATE_INVALID')
  const target = parsed.intent.target
  if (!isWorldPointWalkable(current.map, target, { routeStateId: current.routeStateId })) return fail('MOVE_TARGET_INVALID')
  if (distance(current.origin, target) <= MOVE_INTENT_NOOP_RADIUS) return fail('MOVE_NOOP')

  const found = findWorldPath(current.map, current.origin, target, { routeStateId: current.routeStateId })
  if (!found.length) return fail('MOVE_PATH_NOT_FOUND')
  // A* can represent a same-grid-cell direct approach with a snapped grid
  // point. The server still requires findWorldPath, but replaces that benign
  // representation with the exact direct segment when it is collision-safe.
  const rawPath = isWorldPathStepReachable(current.map, current.origin, target, { routeStateId: current.routeStateId })
    ? [target]
    : found
  const waypoints = canonicalWaypoints(current.origin, rawPath, target)
  if (!waypoints || !pathIsReachable(current.map, current.origin, waypoints, current.routeStateId)) return fail('MOVE_PATH_INVALID')
  const candidate = {
    version: PLAN_VERSION,
    mapId: current.map.id,
    origin: current.origin,
    target: { x: target.x, y: target.y },
    routeStateId: current.routeStateId,
    waypoints,
    startedAtMs: trustedNowMs,
    speedUnitsPerSecond: SERVER_MOVE_SPEED_UNITS_PER_SECOND,
  }
  return validateMovePlan(candidate)
}

export function materializeMovePlan({ state, plan, trustedNowMs } = {}) {
  const checked = validateMovePlan(plan)
  if (!checked.ok) return checked
  if (!Number.isSafeInteger(trustedNowMs) || trustedNowMs < checked.plan.startedAtMs) return fail('MOVE_TRUSTED_TIME_INVALID')
  const current = currentMapState(state)
  if (!current || current.map.id !== checked.plan.mapId) return fail('MOVE_STATE_INVALID')
  if (!samePoint(current.origin, checked.plan.origin)) return fail('MOVE_PLAN_ORIGIN_STALE')
  if (current.routeStateId !== checked.plan.routeStateId) return fail('MOVE_ROUTE_STATE_CHANGED')
  if (!isWorldPointWalkable(current.map, checked.plan.origin, { routeStateId: current.routeStateId })
    || !isWorldPointWalkable(current.map, checked.plan.target, { routeStateId: current.routeStateId })) {
    return fail('MOVE_PATH_INVALID')
  }
  if (!pathIsReachable(current.map, checked.plan.origin, checked.plan.waypoints, current.routeStateId)) {
    return fail('MOVE_PATH_INVALID')
  }

  const { totalDistance, segments } = metrics(checked.plan.origin, checked.plan.waypoints)
  const traveled = Math.min(totalDistance, ((trustedNowMs - checked.plan.startedAtMs) / 1000) * checked.plan.speedUnitsPerSecond)
  let position = checked.plan.origin
  let facing = Number.isFinite(state.world.facing) ? state.world.facing : 0
  for (const segment of segments) {
    const startDistance = segment.endDistance - segment.length
    if (traveled < segment.endDistance || segment === segments.at(-1)) {
      const fraction = segment.length ? Math.max(0, Math.min(1, (traveled - startDistance) / segment.length)) : 1
      position = {
        x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
        y: segment.from.y + (segment.to.y - segment.from.y) * fraction,
      }
      facing = Math.atan2(segment.to.y - segment.from.y, segment.to.x - segment.from.x)
      break
    }
  }
  return freeze({ ok: true, motion: { position, facing, complete: traveled >= totalDistance } })
}
