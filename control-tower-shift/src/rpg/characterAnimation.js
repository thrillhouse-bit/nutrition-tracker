// Deterministic presentation state for authored world characters.
//
// Locomotion owns position, collision, velocity, facing and distance-driven
// gait. This module turns that data into a stable animation clip/direction and
// a planted-foot presentation without timers, DOM access, randomness or save
// state. Directional frame assets can be introduced later through a manifest;
// an empty manifest intentionally falls back to the current static cutout.

const TAU = Math.PI * 2
const OCTANT = TAU / 8

export const CHARACTER_ANIMATION_STATES = Object.freeze(['idle', 'start', 'walk', 'brake'])
export const CHARACTER_DIRECTIONS = Object.freeze([
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
])

export const DEFAULT_CHARACTER_ANIMATION_CONFIG = Object.freeze({
  walkSpeed: 96,
  idleSpeed: 1,
  startExitSpeedFraction: 0.68,
  brakeExitSpeedFraction: 0.82,
  speedDeltaThreshold: 0.5,
  // The normal octant boundary is 22.5deg. Five degrees of hysteresis keeps
  // diagonal/cardinal clips from flickering as a collision path bends.
  turnThreshold: Math.PI / 8 + Math.PI / 36,
  plantWindow: 0.12,
  frameCount: 8,
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

function wrapRadians(value) {
  const wrapped = finiteOr(value, 0) % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

function shortestAngleDistance(a, b) {
  const delta = Math.abs(wrapRadians(a) - wrapRadians(b))
  return Math.min(delta, TAU - delta)
}

function circularUnitDistance(a, b) {
  const delta = Math.abs(a - b)
  return Math.min(delta, 1 - delta)
}

function directionIndex(direction) {
  return CHARACTER_DIRECTIONS.indexOf(direction)
}

export function directionForFacing(facing, {
  previousDirection = null,
  turnThreshold = DEFAULT_CHARACTER_ANIMATION_CONFIG.turnThreshold,
} = {}) {
  const angle = wrapRadians(facing)
  const previousIndex = directionIndex(previousDirection)
  if (previousIndex >= 0) {
    const previousAngle = previousIndex * OCTANT
    if (shortestAngleDistance(angle, previousAngle) <= Math.max(0, finiteOr(turnThreshold, 0))) {
      return previousDirection
    }
  }
  const index = Math.round(angle / OCTANT) % CHARACTER_DIRECTIONS.length
  return CHARACTER_DIRECTIONS[index]
}

export function createCharacterAnimationState({ facing = 0, reducedMotion = false } = {}) {
  const direction = directionForFacing(facing)
  return {
    animation: 'idle',
    direction,
    frameIndex: 0,
    frameProgress: 0,
    contactFoot: 'both',
    plantStrength: 1,
    bodyBob: 0,
    bodyLean: 0,
    weightShift: 0,
    shadowScale: 1,
    speed: 0,
    speedFraction: 0,
    moving: false,
    turning: false,
    reducedMotion: Boolean(reducedMotion),
  }
}

function animationStateFor({ moving, speed, speedFraction, previous, config }) {
  if (!moving) return 'idle'
  const previousSpeed = finiteOr(previous?.speed, 0)
  const slowing = previousSpeed - speed > config.speedDeltaThreshold
  if (slowing) return 'brake'
  if (previous?.animation === 'brake' && speedFraction < config.brakeExitSpeedFraction) return 'brake'
  if (previous?.animation === 'idle') return 'start'
  if (previous?.animation === 'start' && speedFraction < config.startExitSpeedFraction) return 'start'
  return 'walk'
}

function contactForPhase(gaitPhase, plantWindow) {
  const cycle = wrapRadians(gaitPhase) / TAU
  const leftDistance = circularUnitDistance(cycle, 0)
  const rightDistance = circularUnitDistance(cycle, 0.5)
  const isLeft = leftDistance <= rightDistance
  const distance = isLeft ? leftDistance : rightDistance
  if (distance > plantWindow) {
    return { cycle, contactFoot: 'none', plantStrength: 0 }
  }
  return {
    cycle,
    contactFoot: isLeft ? 'left' : 'right',
    plantStrength: 1 - distance / plantWindow,
  }
}

export function selectCharacterAnimation(pose, previous, options = {}) {
  const config = {
    ...DEFAULT_CHARACTER_ANIMATION_CONFIG,
    ...(options && typeof options === 'object' ? options.config : null),
  }
  const prior = previous && typeof previous === 'object'
    ? previous
    : createCharacterAnimationState({ facing: pose?.facing, reducedMotion: options.reducedMotion })
  const vx = finiteOr(pose?.vx, 0)
  const vy = finiteOr(pose?.vy, 0)
  const speed = Math.hypot(vx, vy)
  const moving = Boolean(pose?.moving) && speed > config.idleSpeed
  const speedFraction = config.walkSpeed > 0 ? clamp(speed / config.walkSpeed, 0, 1) : 0
  const motionFacing = speed > config.idleSpeed ? Math.atan2(vy, vx) : finiteOr(pose?.facing, 0)
  const direction = directionForFacing(motionFacing, {
    previousDirection: prior.direction,
    turnThreshold: config.turnThreshold,
  })
  const animation = animationStateFor({ moving, speed, speedFraction, previous: prior, config })
  const reducedMotion = Boolean(options.reducedMotion)
  const contact = moving && !reducedMotion
    ? contactForPhase(pose?.gaitPhase, clamp(config.plantWindow, 0.01, 0.24))
    : { cycle: 0, contactFoot: 'both', plantStrength: 1 }

  let frameProgress = 0
  if (!reducedMotion) {
    if (animation === 'walk') frameProgress = contact.cycle
    else if (animation === 'start') frameProgress = clamp(speedFraction / config.startExitSpeedFraction, 0, 0.999999)
    else if (animation === 'brake') frameProgress = clamp(1 - speedFraction, 0, 0.999999)
  }
  const frameCount = Math.max(1, Math.floor(finiteOr(config.frameCount, 1)))
  const frameIndex = reducedMotion ? 0 : Math.min(frameCount - 1, Math.floor(frameProgress * frameCount))
  const strideWave = reducedMotion || !moving ? 0 : Math.sin(contact.cycle * TAU)
  const transitionLean = animation === 'start' ? 1.15 : animation === 'brake' ? -0.85 : 0.35
  const bodyBob = reducedMotion || !moving ? 0 : (1 - contact.plantStrength) * 1.2

  return {
    animation,
    direction,
    frameIndex,
    frameProgress,
    contactFoot: contact.contactFoot,
    plantStrength: contact.plantStrength,
    bodyBob,
    bodyLean: reducedMotion || !moving ? 0 : transitionLean * speedFraction,
    weightShift: reducedMotion || !moving ? 0 : strideWave * 1.15,
    shadowScale: reducedMotion || !moving ? 1 : 1 - bodyBob * 0.035,
    speed,
    speedFraction,
    moving,
    turning: direction !== prior.direction,
    reducedMotion,
  }
}

function clipFrames(clip) {
  if (Array.isArray(clip)) return clip
  return Array.isArray(clip?.frames) ? clip.frames : []
}

// Manifest shape:
// {
//   clips: {
//     walk: { east: ['/walk-e-0.webp', ...], default: [...] },
//     idle: { east: [{ src: '/idle-e.webp', flipX: false }] }
//   }
// }
//
// Missing clips resolve to fallbackSrc and keep the legacy left/right mirror.
// Exact/generated frames opt out of that legacy mirror; a frame may request an
// explicit mirror with { src, flipX: true }.
export function resolveCharacterAnimationFrame(manifest, selection, fallbackSrc = '') {
  const clips = manifest?.clips && typeof manifest.clips === 'object' ? manifest.clips : {}
  const animation = CHARACTER_ANIMATION_STATES.includes(selection?.animation) ? selection.animation : 'idle'
  const direction = CHARACTER_DIRECTIONS.includes(selection?.direction) ? selection.direction : 'east'
  const candidates = [
    clips[animation]?.[direction],
    clips[animation]?.default,
    clips.idle?.[direction],
    clips.idle?.default,
  ]
  const frames = candidates.map(clipFrames).find((candidate) => candidate.length > 0)
  if (!frames) {
    return {
      src: manifest?.fallback || fallbackSrc,
      frameIndex: 0,
      flipX: false,
      directional: false,
      usedFallback: true,
    }
  }
  const progress = clamp(finiteOr(selection?.frameProgress, 0), 0, 0.999999)
  const index = Math.min(frames.length - 1, Math.floor(progress * frames.length))
  const frame = frames[index]
  if (typeof frame === 'string') {
    return { src: frame, frameIndex: index, flipX: false, directional: true, usedFallback: false }
  }
  return {
    src: typeof frame?.src === 'string' ? frame.src : manifest?.fallback || fallbackSrc,
    frameIndex: index,
    flipX: Boolean(frame?.flipX),
    directional: typeof frame?.src === 'string',
    usedFallback: typeof frame?.src !== 'string',
  }
}
