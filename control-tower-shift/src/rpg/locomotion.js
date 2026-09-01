// Deterministic, grounded locomotion primitive for Oathbearer.
//
// A RuneScape-style click-to-move controller: given a target point, an actor
// accelerates toward it (never teleporting its velocity), decelerates as it
// closes in, and settles exactly on the destination without idle drift.
// Gait is advanced by distance actually traveled, never by wall time, so the
// same inputs always produce the same pose.
//
// This module is intentionally free of timers, DOM access, randomness,
// persistence, and any game-state imports so it can be unit-tested in
// isolation and replayed deterministically.

const TAU = Math.PI * 2

export const DEFAULT_LOCOMOTION_CONFIG = Object.freeze({
  // World units per second at full walk.
  walkSpeed: 120,
  // World units per second^2 while building speed.
  acceleration: 600,
  // World units per second^2 while braking near the destination.
  deceleration: 900,
  // Radians per second of maximum facing turn. The grounded primitive faces
  // actual motion directly; this knob is exposed for higher layers that want
  // to blend the body angle over time instead of snapping it.
  turnResponse: 12,
  // Full gait cycles per world unit of travel. Advances gaitPhase by distance.
  gaitCyclesPerWorldUnit: 0.02,
  // World units within which the actor settles onto the exact target.
  arrivalRadius: 4,
})

function moveToward(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta)
  if (value > target) return Math.max(target, value - maxDelta)
  return target
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

// Create a fresh, fully serializable pose. All fields are plain numbers so the
// pose survives JSON round-trips and can be stored/replayed.
export function createLocomotionPose({ x = 0, y = 0, facing = 0 } = {}) {
  return {
    x: finiteOr(x, 0),
    y: finiteOr(y, 0),
    vx: 0,
    vy: 0,
    facing: finiteOr(facing, 0),
    gaitPhase: 0,
    moving: false,
    stride: 0,
    lean: 0,
  }
}

// Derive the presentation fields (stride, lean) from the movement state. Kept
// shared so every exit path of stepLocomotion produces consistent, bounded
// values.
function present(fields, config) {
  const speed = Math.hypot(fields.vx, fields.vy)
  const speedFraction = config.walkSpeed > 0 ? clamp(speed / config.walkSpeed, 0, 1) : 0
  const baseStride = config.gaitCyclesPerWorldUnit > 0 ? 1 / config.gaitCyclesPerWorldUnit : 0
  return {
    x: fields.x,
    y: fields.y,
    vx: fields.vx,
    vy: fields.vy,
    facing: fields.facing,
    gaitPhase: fields.gaitPhase,
    moving: fields.moving,
    stride: fields.moving ? baseStride * speedFraction : 0,
    lean: fields.moving ? speedFraction : 0,
  }
}

// Advance a pose by one step toward (desiredX, desiredY). The returned pose is
// a new object; the input is never mutated.
//
//   options.dt          seconds elapsed (<= 0 is safe: no integration happens)
//   options.desiredX/Y  target point (non-finite => treated as "stay put")
//   options.maxDistance  hard cap on this step's displacement (units)
//
// Behavior guarantees: diagonal targets are normalized so a diagonal walk is
// no faster than a cardinal one; velocity accelerates/dec accelerates instead of
// snapping; speed never exceeds walkSpeed; displacement never exceeds
// maxDistance; facing follows the actual horizontal motion; gaitPhase advances
// only by distance traveled; the actor settles exactly on the target.
export function stepLocomotion(pose, options = {}) {
  const config = {
    ...DEFAULT_LOCOMOTION_CONFIG,
    ...(options && typeof options === 'object' ? options.config : null),
  }

  const src = pose && typeof pose === 'object' ? pose : {}
  const base = {
    x: finiteOr(src.x, 0),
    y: finiteOr(src.y, 0),
    vx: finiteOr(src.vx, 0),
    vy: finiteOr(src.vy, 0),
    facing: finiteOr(src.facing, 0),
    gaitPhase: finiteOr(src.gaitPhase, 0),
  }

  const dt = finiteOr(options.dt, 0)
  const desiredX = finiteOr(options.desiredX, base.x)
  const desiredY = finiteOr(options.desiredY, base.y)
  const maxDistance = Number.isFinite(options.maxDistance) && options.maxDistance >= 0
    ? options.maxDistance
    : Infinity

  const cyclesRad = config.gaitCyclesPerWorldUnit * TAU

  // dt <= 0: nothing may move this step, but still emit a normalized pose with
  // consistent presentation fields. Existing velocity is preserved so a paused
  // clock never introduces drift or teleportation.
  if (!(dt > 0)) {
    const speed = Math.hypot(base.vx, base.vy)
    return present({
      ...base,
      gaitPhase: speed > 0 ? base.gaitPhase : 0,
      moving: speed > 0,
    }, config)
  }

  const dx = desiredX - base.x
  const dy = desiredY - base.y
  const dist = Math.hypot(dx, dy)

  // Arrival: snap exactly onto the target, zero the velocity, and settle. The
  // exact coordinates and zero velocity together guarantee no idle drift.
  if (dist <= config.arrivalRadius) {
    return present({
      x: desiredX,
      y: desiredY,
      vx: 0,
      vy: 0,
      facing: base.facing,
      gaitPhase: 0,
      moving: false,
    }, config)
  }

  // Normalized diagonal direction. Normalizing the vector means a diagonal
  // click produces the same walk speed as a cardinal one (no sqrt(2) boost).
  const dirX = dx / dist
  const dirY = dy / dist

  // Brake as the actor closes in: pick a desired speed that can be stopped by
  // deceleration within the remaining distance, otherwise walk at full speed.
  const remaining = Math.max(0, dist - config.arrivalRadius)
  const currentSpeed = Math.hypot(base.vx, base.vy)
  const brakeDist = (currentSpeed * currentSpeed) / (2 * config.deceleration)
  const desiredSpeed = brakeDist >= remaining
    ? Math.sqrt(2 * config.deceleration * remaining)
    : config.walkSpeed
  const targetSpeed = Math.min(desiredSpeed, config.walkSpeed)
  const targetVx = dirX * targetSpeed
  const targetVy = dirY * targetSpeed

  // Accelerate/decelerate toward the target velocity rather than setting it.
  const rate = config.acceleration * dt
  let vx = moveToward(base.vx, targetVx, rate)
  let vy = moveToward(base.vy, targetVy, rate)

  // Hard cap: never exceed walkSpeed, even if the incoming velocity was high.
  let speed = Math.hypot(vx, vy)
  if (speed > config.walkSpeed) {
    const scale = config.walkSpeed / speed
    vx *= scale
    vy *= scale
    speed = config.walkSpeed
  }

  let stepDx = vx * dt
  let stepDy = vy * dt
  let stepDist = Math.hypot(stepDx, stepDy)

  // Hard cap: never exceed maxDistance this step.
  if (stepDist > maxDistance) {
    const scale = maxDistance / stepDist
    stepDx *= scale
    stepDy *= scale
    stepDist = maxDistance
    vx = stepDx / dt
    vy = stepDy / dt
    speed = Math.hypot(vx, vy)
  }

  let newX = base.x + stepDx
  let newY = base.y + stepDy
  let traveled = stepDist
  let arrived = false

  // If this step reaches the arrival zone, settle exactly on the destination so
  // the actor never coasts past it or drifts once stopped.
  if (stepDist >= remaining) {
    newX = desiredX
    newY = desiredY
    traveled = dist
    vx = 0
    vy = 0
    speed = 0
    arrived = true
  }

  const moving = !arrived && traveled > 0
  // Face the actual horizontal motion (the displacement that really happened).
  const facing = traveled > 0
    ? Math.atan2(newY - base.y, newX - base.x)
    : base.facing

  return present({
    x: newX,
    y: newY,
    vx,
    vy,
    facing,
    gaitPhase: arrived ? 0 : base.gaitPhase + traveled * cyclesRad,
    moving,
  }, config)
}

// Bounded presentation values for DOM/canvas animation. Every field is clamped
// into a fixed range so animation code never has to guard against runaway
// numbers, even when handed a malformed pose.
export function locomotionPresentation(pose) {
  const src = pose && typeof pose === 'object' ? pose : {}
  const gaitPhase = finiteOr(src.gaitPhase, 0)
  const moving = Boolean(src.moving)
  const lean = finiteOr(src.lean, 0)

  const footLift = moving ? clamp((1 - Math.cos(gaitPhase)) / 2, 0, 1) : 0
  const bodyBob = moving ? clamp(Math.abs(Math.sin(gaitPhase)), 0, 1) : 0
  const bodyLean = clamp(lean, 0, 1) * 0.22
  const shadowScale = 1 - footLift * 0.12

  return { footLift, bodyBob, bodyLean, shadowScale }
}
