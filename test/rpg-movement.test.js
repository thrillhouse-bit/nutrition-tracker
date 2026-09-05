import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOCOMOTION_CONFIG } from '../control-tower-shift/src/rpg/locomotion.js'
import { rpgMapById } from '../control-tower-shift/src/rpg/registry.js'
import { createInitialState } from '../control-tower-shift/src/rpg/state.js'
import {
  MOVE_INTENT_MAX_WAYPOINTS,
  MOVE_PLAN_MAX_BYTES,
  SERVER_MOVE_SPEED_UNITS_PER_SECOND,
  materializeMovePlan,
  movementOverlay,
  movementIntentDigest,
  parseMoveIntent,
  planMoveIntent,
  rebaseMovePlanStart,
  validateMovementEnvelope,
  validateMovementArrivalEnvelope,
  validateMovementCompletionResponse,
  validateMovementRecord,
  validateMovementResponse,
  validateMovePlan,
} from '../server/rpgMovement.js'

function atMap(state, mapId, position, flags = {}) {
  const map = rpgMapById(mapId)
  return {
    ...state,
    flags: { ...state.flags, ...flags },
    world: { ...state.world, regionId: map.region, mapId, spawnId: 'test', position: { x: position.x, y: position.y }, facing: 0 },
  }
}

function intent(target) {
  return { type: 'MOVE_INTENT', target }
}

function planForBeacon() {
  const state = createInitialState()
  const map = rpgMapById('beacon-overlook')
  const target = map.entities.find((entity) => entity.id === 'beacon-bank')
  const result = planMoveIntent({ state, intent: intent({ x: target.x, y: target.y }), trustedNowMs: 1_000 })
  expect(result.ok).toBe(true)
  return { state, target, plan: result.plan }
}

function planDistance(plan) {
  let previous = plan.origin
  return plan.waypoints.reduce((total, waypoint) => {
    const next = total + Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y)
    previous = waypoint
    return next
  }, 0)
}

describe('server-timed MOVE_INTENT kernel', () => {
  afterEach(() => {
    vi.doUnmock('../control-tower-shift/src/rpg/registry.js')
    vi.resetModules()
  })

  it('accepts only an exact client target and creates a deterministic canonical server path', () => {
    const state = createInitialState()
    const map = rpgMapById('beacon-overlook')
    const target = map.entities.find((entity) => entity.id === 'beacon-bank')
    const first = planMoveIntent({ state, intent: intent({ x: target.x, y: target.y }), trustedNowMs: 1_000 })
    const second = planMoveIntent({ state, intent: intent({ x: target.x, y: target.y }), trustedNowMs: 1_000 })

    expect(first).toEqual(second)
    expect(first).toMatchObject({ ok: true, plan: { mapId: map.id, origin: state.world.position, target: { x: target.x, y: target.y } } })
    expect(first.plan.waypoints.at(-1)).toEqual({ x: target.x, y: target.y })
    expect(first.plan.waypoints).not.toContainEqual(first.plan.origin)
    expect(first.plan.speedUnitsPerSecond).toBe(DEFAULT_LOCOMOTION_CONFIG.walkSpeed)
    expect(Object.keys(first.plan).sort()).toEqual(['mapId', 'origin', 'routeStateId', 'speedUnitsPerSecond', 'startedAtMs', 'target', 'version', 'waypoints'])
    expect(Object.isFrozen(first.plan)).toBe(true)
    expect(first.plan.waypoints.every((waypoint, index, points) => {
      const prior = index ? points[index - 1] : first.plan.origin
      return Math.hypot(waypoint.x - prior.x, waypoint.y - prior.y) > 1e-9
    })).toBe(true)

    expect(parseMoveIntent({ type: 'MOVE_INTENT', target: { x: target.x, y: target.y }, origin: state.world.position })).toEqual({ ok: false, code: 'MOVE_INTENT_INVALID' })
    expect(parseMoveIntent({ type: 'MOVE_INTENT', target: { x: Infinity, y: target.y } })).toEqual({ ok: false, code: 'MOVE_INTENT_INVALID' })
  })

  it('uses sequence as the sole movement identity and validates canonical persisted responses', () => {
    const { plan } = planForBeacon()
    const body = {
      protocolVersion: 1, sequence: 1, expectedStoryRevision: 1,
      expectedInventoryRevision: 1, expectedMovementRevision: 1,
      intent: intent({ x: plan.target.x, y: plan.target.y }),
    }
    const first = validateMovementEnvelope(body)
    const stale = validateMovementEnvelope({ ...body, expectedStoryRevision: 9 })
    expect(first.ok && stale.ok && first.envelope.digest).toBe(stale.ok && stale.envelope.digest)
    expect(validateMovementEnvelope({ ...body, sequence: 0 })).toEqual({ ok: false, code: 'MOVEMENT_ENVELOPE_INVALID' })
    expect(validateMovementEnvelope({ ...body, intent: { ...body.intent, mapId: 'forged' } })).toEqual({ ok: false, code: 'MOVEMENT_ENVELOPE_INVALID' })
    const rebased = rebaseMovePlanStart(plan, 9_999)
    expect(rebased).toMatchObject({ ok: true, plan: { startedAtMs: 9_999 } })
    const response = {
      protocolVersion: 1, sequence: 1, digest: first.envelope.digest,
      storyRevision: 1, inventoryRevision: 1, movementRevision: 2, plan: rebased.plan,
    }
    expect(validateMovementResponse(response)).toMatchObject({ ok: true })
    expect(validateMovementRecord({ movementRevision: 2, activePlan: rebased.plan, lastResponse: response })).toMatchObject({ ok: true })
    expect(validateMovementRecord({ movementRevision: 2, activePlan: plan, lastResponse: response })).toEqual({ ok: false, code: 'MOVEMENT_RECORD_INVALID' })
    expect(movementIntentDigest(first.envelope)).toBe(first.envelope.digest)
  })

  it('accepts an exact terminal arrival envelope and derives a non-authoritative overlay', () => {
    const { state, plan } = planForBeacon()
    const envelope = validateMovementArrivalEnvelope({ protocolVersion: 1, sequence: 1, planDigest: 'a'.repeat(64), expectedStoryRevision: 1, expectedInventoryRevision: 1, expectedMovementRevision: 2 })
    expect(envelope.ok).toBe(true)
    expect(validateMovementArrivalEnvelope({ ...envelope.envelope, position: { x: 1, y: 1 } })).toEqual({ ok: false, code: 'MOVEMENT_ARRIVAL_INVALID' })
    const response = { protocolVersion: 1, sequence: 1, digest: 'a'.repeat(64), storyRevision: 1, inventoryRevision: 1, movementRevision: 2, plan }
    const overlay = movementOverlay({ state, response, trustedNowMs: plan.startedAtMs })
    expect(overlay).toMatchObject({ ok: true, overlay: { mapId: plan.mapId, position: plan.origin, complete: false, observedAtMs: plan.startedAtMs } })
  })

  it('fails closed on poisoned completion receipt payloads', () => {
    const valid = { protocolVersion: 1, sequence: 1, planDigest: 'a'.repeat(64), storyRevision: 2, inventoryRevision: 1, movementRevision: 3, position: { x: 1, y: 2 }, facing: 0, complete: true }
    expect(validateMovementCompletionResponse(valid)).toMatchObject({ ok: true })
    expect(validateMovementCompletionResponse({ ...valid, extra: true })).toEqual({ ok: false, code: 'MOVEMENT_COMPLETION_INVALID' })
    expect(validateMovementCompletionResponse({ ...valid, planDigest: 'bad' })).toEqual({ ok: false, code: 'MOVEMENT_COMPLETION_INVALID' })
    expect(validateMovementCompletionResponse({ ...valid, facing: Infinity })).toEqual({ ok: false, code: 'MOVEMENT_COMPLETION_INVALID' })
  })

  it('rejects no-ops, collision targets, and inactive dynamic-route targets without trusting client geometry', () => {
    const initial = createInitialState()
    expect(planMoveIntent({ state: initial, intent: intent({ ...initial.world.position }), trustedNowMs: 1 })).toEqual({ ok: false, code: 'MOVE_NOOP' })

    const caves = rpgMapById('nereid-caves')
    const ebb = atMap(initial, caves.id, caves.spawns.threshold, { 'act2:tide-state': 'ebb' })
    const wall = caves.collisions[0]
    expect(planMoveIntent({ state: ebb, intent: intent({ x: wall.x + 1, y: wall.y + 1 }), trustedNowMs: 1 })).toEqual({ ok: false, code: 'MOVE_TARGET_INVALID' })
    expect(planMoveIntent({ state: ebb, intent: intent({ x: 452, y: 420 }), trustedNowMs: 1 })).toEqual({ ok: false, code: 'MOVE_TARGET_INVALID' })
  })

  it('materializes constant-speed arc-length motion at trusted-time boundaries without storing timing duplicates', () => {
    const { state, target, plan } = planForBeacon()
    const total = planDistance(plan)
    const start = materializeMovePlan({ state, plan, trustedNowMs: plan.startedAtMs })
    expect(start).toMatchObject({ ok: true, motion: { position: plan.origin, complete: false } })
    expect(start.motion.facing).toBeCloseTo(Math.atan2(plan.waypoints[0].y - plan.origin.y, plan.waypoints[0].x - plan.origin.x))

    const half = materializeMovePlan({ state, plan, trustedNowMs: plan.startedAtMs + Math.floor((total / plan.speedUnitsPerSecond) * 500) })
    expect(half.ok).toBe(true)
    expect(Math.hypot(half.motion.position.x - plan.origin.x, half.motion.position.y - plan.origin.y)).toBeGreaterThan(0)
    expect(half.motion.complete).toBe(false)

    const arrived = materializeMovePlan({ state, plan, trustedNowMs: plan.startedAtMs + Math.ceil((total / plan.speedUnitsPerSecond) * 1000) + 1 })
    expect(arrived).toEqual(expect.objectContaining({ ok: true, motion: expect.objectContaining({ position: { x: target.x, y: target.y }, complete: true }) }))
    expect(materializeMovePlan({ state, plan, trustedNowMs: plan.startedAtMs - 1 })).toEqual({ ok: false, code: 'MOVE_TRUSTED_TIME_INVALID' })

    const foundry = rpgMapById('bronze-foundry')
    const foundryState = atMap(state, foundry.id, foundry.spawn)
    const valve = foundry.entities.find((entity) => entity.id === 'pressure-valve-2')
    const multi = planMoveIntent({ state: foundryState, intent: intent({ x: valve.x, y: valve.y }), trustedNowMs: 5_000 })
    expect(multi).toMatchObject({ ok: true })
    expect(multi.plan.waypoints.length).toBeGreaterThan(1)
    const firstLength = Math.hypot(multi.plan.waypoints[0].x - multi.plan.origin.x, multi.plan.waypoints[0].y - multi.plan.origin.y)
    const atFirstBoundary = materializeMovePlan({
      state: foundryState,
      plan: multi.plan,
      trustedNowMs: multi.plan.startedAtMs + Math.ceil((firstLength / multi.plan.speedUnitsPerSecond) * 1000),
    })
    // Millisecond server clocks cannot generally represent an irrational
    // segment duration exactly. ceil() is at most one millisecond into the
    // next segment, which must preserve constant-speed interpolation rather
    // than snapping backward to the waypoint.
    expect(Math.hypot(
      atFirstBoundary.motion.position.x - multi.plan.waypoints[0].x,
      atFirstBoundary.motion.position.y - multi.plan.waypoints[0].y,
    )).toBeLessThanOrEqual((multi.plan.speedUnitsPerSecond / 1000) + 1e-9)
    expect(atFirstBoundary.motion.facing).toBeCloseTo(Math.atan2(
      multi.plan.waypoints[1].y - multi.plan.waypoints[0].y,
      multi.plan.waypoints[1].x - multi.plan.waypoints[0].x,
    ))
  })

  it('strictly rejects malformed, duplicate, oversized, and noncanonical persisted plans', () => {
    const { plan } = planForBeacon()
    expect(validateMovePlan({ ...plan, cumulativeDistances: [] })).toEqual({ ok: false, code: 'MOVE_PLAN_INVALID' })
    expect(validateMovePlan({ ...plan, target: { x: plan.origin.x + 1, y: plan.origin.y + 1 }, waypoints: [{ x: plan.origin.x + 1, y: plan.origin.y + 1 }] })).toEqual({ ok: false, code: 'MOVE_NOOP' })
    expect(validateMovePlan({ ...plan, waypoints: [{ ...plan.origin }, ...plan.waypoints] })).toEqual({ ok: false, code: 'MOVE_PLAN_INVALID' })
    expect(validateMovePlan({ ...plan, waypoints: Array.from({ length: MOVE_INTENT_MAX_WAYPOINTS + 1 }, (_, index) => ({ x: index + 1, y: 0 })), target: { x: MOVE_INTENT_MAX_WAYPOINTS + 1, y: 0 } })).toEqual({ ok: false, code: 'MOVE_PLAN_WAYPOINT_LIMIT' })
    expect(validateMovePlan({ ...plan, origin: { x: 0, y: 0 }, target: { x: 5_000, y: 0 }, waypoints: [{ x: 5_000, y: 0 }] })).toEqual({ ok: false, code: 'MOVE_PLAN_DISTANCE_LIMIT' })
    expect(validateMovePlan({ ...plan, mapId: 'x'.repeat(MOVE_PLAN_MAX_BYTES) })).toEqual({ ok: false, code: 'MOVE_PLAN_SIZE_LIMIT' })
  })

  it('revalidates current route geometry and origin before materialization', () => {
    const initial = createInitialState()
    const caves = rpgMapById('nereid-caves')
    const crossing = atMap(initial, caves.id, caves.spawns.threshold, { 'act2:tide-state': 'crossing' })
    const shell = caves.entities.find((entity) => entity.id === 'pressure-shell-1')
    const planned = planMoveIntent({ state: crossing, intent: intent({ x: shell.x, y: shell.y }), trustedNowMs: 1_000 })
    expect(planned.ok).toBe(true)

    const ebb = { ...crossing, flags: { ...crossing.flags, 'act2:tide-state': 'ebb' } }
    expect(materializeMovePlan({ state: ebb, plan: planned.plan, trustedNowMs: 1_001 })).toEqual({ ok: false, code: 'MOVE_ROUTE_STATE_CHANGED' })
    const movedOrigin = atMap(crossing, caves.id, { x: crossing.world.position.x + 1, y: crossing.world.position.y }, { 'act2:tide-state': 'crossing' })
    expect(materializeMovePlan({ state: movedOrigin, plan: planned.plan, trustedNowMs: 1_001 })).toEqual({ ok: false, code: 'MOVE_PLAN_ORIGIN_STALE' })
  })

  it('fails a previously valid plan if authoritative geometry changes at runtime', async () => {
    const map = { id: 'm1-runtime-drift', bounds: { w: 320, h: 200 }, collisions: [], decor: [], traversalLanes: [] }
    vi.resetModules()
    vi.doMock('../control-tower-shift/src/rpg/registry.js', () => ({ rpgMapById: (id) => id === map.id ? map : null }))
    const { planMoveIntent: plan, materializeMovePlan: materialize } = await import('../server/rpgMovement.js')
    const state = { status: 'playing', flags: {}, world: { mapId: map.id, position: { x: 40, y: 100 }, facing: 0 } }
    const planned = plan({ state, intent: intent({ x: 280, y: 100 }), trustedNowMs: 1 })
    expect(planned.ok).toBe(true)
    map.collisions.push({ x: 140, y: 0, w: 40, h: 200 })
    expect(materialize({ state, plan: planned.plan, trustedNowMs: 2 })).toEqual({ ok: false, code: 'MOVE_PATH_INVALID' })
  })

  it('does not mutate caller state, intent, or materialized plan inputs', () => {
    const state = createInitialState()
    const map = rpgMapById('beacon-overlook')
    const bank = map.entities.find((entity) => entity.id === 'beacon-bank')
    const originalState = structuredClone(state)
    const input = intent({ x: bank.x, y: bank.y })
    const originalInput = structuredClone(input)
    const planned = planMoveIntent({ state, intent: input, trustedNowMs: 10 })
    expect(planned.ok).toBe(true)
    const beforePlan = structuredClone(planned.plan)
    materializeMovePlan({ state, plan: planned.plan, trustedNowMs: 11 })
    expect(state).toEqual(originalState)
    expect(input).toEqual(originalInput)
    expect(planned.plan).toEqual(beforePlan)
    expect(SERVER_MOVE_SPEED_UNITS_PER_SECOND).toBe(DEFAULT_LOCOMOTION_CONFIG.walkSpeed)
  })
})
