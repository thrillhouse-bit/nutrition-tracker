import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCOMOTION_CONFIG,
  createLocomotionPose,
  locomotionPresentation,
  stepLocomotion,
} from '../src/rpg/locomotion.js'

const TAU = Math.PI * 2
const { walkSpeed, acceleration, deceleration, gaitCyclesPerWorldUnit, arrivalRadius } = DEFAULT_LOCOMOTION_CONFIG

function runTo(pose, desiredX, desiredY, frames, dt = 1 / 60) {
  let current = pose
  for (let i = 0; i < frames; i += 1) {
    current = stepLocomotion(current, { desiredX, desiredY, dt })
  }
  return current
}

const speedOf = (pose) => Math.hypot(pose.vx, pose.vy)

describe('createLocomotionPose', () => {
  it('returns a complete serializable pose', () => {
    const pose = createLocomotionPose({ x: 10, y: 20, facing: 1 })
    expect(pose).toEqual({
      x: 10, y: 20, vx: 0, vy: 0, facing: 1,
      gaitPhase: 0, moving: false, stride: 0, lean: 0,
    })
    expect(JSON.parse(JSON.stringify(pose))).toEqual(pose)
  })

  it('defaults missing and malformed fields safely', () => {
    expect(createLocomotionPose()).toEqual({
      x: 0, y: 0, vx: 0, vy: 0, facing: 0,
      gaitPhase: 0, moving: false, stride: 0, lean: 0,
    })
    expect(createLocomotionPose({ x: NaN, y: 'bad' }).x).toBe(0)
    expect(createLocomotionPose({ x: NaN, y: 'bad' }).y).toBe(0)
  })
})

describe('stepLocomotion — acceleration', () => {
  it('accelerates toward walk speed instead of teleporting velocity', () => {
    const pose = createLocomotionPose({ x: 0, y: 0, facing: 0 })
    const first = stepLocomotion(pose, { desiredX: 1000, desiredY: 0, dt: 1 / 60 })
    expect(speedOf(first)).toBeGreaterThan(0)
    expect(speedOf(first)).toBeLessThan(walkSpeed)
    expect(speedOf(first)).toBeCloseTo(acceleration * (1 / 60), 8)
  })

  it('reaches and never exceeds walk speed over time', () => {
    let pose = createLocomotionPose({ x: 0, y: 0 })
    let maxSpeed = 0
    for (let i = 0; i < 240; i += 1) {
      pose = stepLocomotion(pose, { desiredX: 10000, desiredY: 0, dt: 1 / 60 })
      maxSpeed = Math.max(maxSpeed, speedOf(pose))
    }
    expect(maxSpeed).toBeLessThanOrEqual(walkSpeed + 1e-9)
    expect(speedOf(pose)).toBeCloseTo(walkSpeed, 6)
  })
})

describe('stepLocomotion — diagonal normalization', () => {
  it('walks a diagonal no faster than a cardinal direction', () => {
    let diagonal = createLocomotionPose({ x: 0, y: 0 })
    for (let i = 0; i < 240; i += 1) {
      diagonal = stepLocomotion(diagonal, { desiredX: 10000, desiredY: 10000, dt: 1 / 60 })
    }
    expect(speedOf(diagonal)).toBeCloseTo(walkSpeed, 6)
    expect(speedOf(diagonal)).toBeLessThanOrEqual(walkSpeed + 1e-9)
    // Diagonal (1,1) would be sqrt(2)*walkSpeed if components were summed raw.
    expect(speedOf(diagonal)).toBeLessThan(walkSpeed * Math.SQRT2)
  })
})

describe('stepLocomotion — braking, overshoot, and settle', () => {
  it('decelerates while closing in on the target', () => {
    const target = { desiredX: 120, desiredY: 0, dt: 1 / 60 }
    let current = createLocomotionPose({ x: 0, y: 0 })
    const movingSpeeds = []
    for (let i = 0; i < 400; i += 1) {
      current = stepLocomotion(current, target)
      if (current.moving) movingSpeeds.push(speedOf(current))
    }
    const peak = Math.max(...movingSpeeds)
    const finalApproach = movingSpeeds.at(-1)
    // It should cruise near full speed, then brake as it arrives — the last
    // moving frame is slower than the peak, and speed never overshoots.
    expect(peak).toBeGreaterThan(walkSpeed * 0.9)
    expect(finalApproach).toBeLessThan(peak)
  })

  it('settles exactly on the target without overshooting', () => {
    const pose = createLocomotionPose({ x: 0, y: 0 })
    const target = { desiredX: 100, desiredY: 0, dt: 1 / 60 }
    let current = pose
    let maxX = -Infinity
    for (let i = 0; i < 400; i += 1) {
      current = stepLocomotion(current, target)
      maxX = Math.max(maxX, current.x)
    }
    expect(maxX).toBeLessThanOrEqual(100 + 1e-9)
    expect(current.x).toBe(100)
    expect(current.y).toBe(0)
    expect(current.vx).toBe(0)
    expect(current.vy).toBe(0)
    expect(current.moving).toBe(false)
  })

  it('has zero idle drift once settled', () => {
    const settled = runTo(createLocomotionPose({ x: 0, y: 0 }), 100, 0, 400)
    const again = stepLocomotion(settled, { desiredX: 100, desiredY: 0, dt: 1 / 60 })
    expect(again.x).toBe(settled.x)
    expect(again.y).toBe(settled.y)
    expect(again.vx).toBe(0)
    expect(again.vy).toBe(0)
  })

  it('never exceeds a finite maxDistance per step', () => {
    // Build up near full speed first.
    let pose = runTo(createLocomotionPose({ x: 0, y: 0 }), 10000, 0, 120)
    const cap = 0.5
    let previousX = pose.x
    for (let i = 0; i < 60; i += 1) {
      pose = stepLocomotion(pose, { desiredX: 10000, desiredY: 0, dt: 1 / 60, maxDistance: cap })
      expect(pose.x - previousX).toBeLessThanOrEqual(cap + 1e-9)
      expect(speedOf(pose) * (1 / 60)).toBeLessThanOrEqual(cap + 1e-9)
      previousX = pose.x
    }
  })
})

describe('stepLocomotion — distance-driven gait', () => {
  it('advances gaitPhase by distance traveled, not wall time', () => {
    const pose = createLocomotionPose({ x: 0, y: 0 })
    const next = stepLocomotion(pose, { desiredX: 10000, desiredY: 0, dt: 1 / 60 })
    const traveled = Math.hypot(next.x - pose.x, next.y - pose.y)
    expect(next.gaitPhase).toBeCloseTo(traveled * gaitCyclesPerWorldUnit * TAU, 8)
  })

  it('accumulates the same gait for the same total distance', () => {
    // Two independent walks of equal total distance should add equal gaitPhase.
    const a = stepLocomotion(createLocomotionPose({ x: 0, y: 0 }), { desiredX: 10000, desiredY: 0, dt: 1 / 30 })
    const b = stepLocomotion(createLocomotionPose({ x: 0, y: 0 }), { desiredX: 10000, desiredY: 0, dt: 1 / 60 })
    const phasePerDist = (p) => p.gaitPhase / Math.hypot(p.x, p.y)
    expect(phasePerDist(a)).toBeCloseTo(phasePerDist(b), 8)
  })
})

describe('stepLocomotion — facing actual horizontal motion', () => {
  it('faces east when moving east', () => {
    const next = stepLocomotion(createLocomotionPose({ x: 0, y: 0, facing: 0 }), { desiredX: 1000, desiredY: 0, dt: 1 / 60 })
    expect(next.facing).toBeCloseTo(0, 6)
  })

  it('faces south when moving south', () => {
    const next = stepLocomotion(createLocomotionPose({ x: 0, y: 0, facing: 0 }), { desiredX: 0, desiredY: 1000, dt: 1 / 60 })
    expect(next.facing).toBeCloseTo(Math.PI / 2, 6)
  })

  it('faces diagonally along the actual motion', () => {
    const next = stepLocomotion(createLocomotionPose({ x: 0, y: 0, facing: 0 }), { desiredX: 500, desiredY: 500, dt: 1 / 60 })
    expect(next.facing).toBeCloseTo(Math.PI / 4, 6)
  })
})

describe('stepLocomotion — malformed input safety', () => {
  it('is safe for dt <= 0 and leaves position unchanged', () => {
    const pose = createLocomotionPose({ x: 10, y: 20 })
    for (const dt of [0, -1, NaN]) {
      expect(() => stepLocomotion(pose, { desiredX: 500, desiredY: 0, dt })).not.toThrow()
      const out = stepLocomotion(pose, { desiredX: 500, desiredY: 0, dt })
      expect(out.x).toBe(10)
      expect(out.y).toBe(20)
    }
  })

  it('treats a missing/NaN target as "stay put"', () => {
    const pose = createLocomotionPose({ x: 10, y: 20 })
    const out = stepLocomotion(pose, { desiredX: NaN, desiredY: undefined, dt: 1 / 60 })
    expect(out.x).toBe(10)
    expect(out.y).toBe(20)
    expect(out.vx).toBe(0)
  })

  it('is safe for a missing or malformed pose', () => {
    expect(() => stepLocomotion(undefined, { desiredX: 500, desiredY: 0, dt: 1 / 60 })).not.toThrow()
    expect(() => stepLocomotion(null, { desiredX: 500, desiredY: 0, dt: 1 / 60 })).not.toThrow()
    const out = stepLocomotion({ x: NaN, vx: NaN }, { desiredX: 500, desiredY: 0, dt: 1 / 60 })
    for (const key of ['x', 'y', 'vx', 'vy', 'facing', 'gaitPhase']) {
      expect(Number.isFinite(out[key])).toBe(true)
    }
  })

  it('never produces NaN or non-finite coordinates', () => {
    const out = stepLocomotion(createLocomotionPose({ x: 0, y: 0 }), { desiredX: 100, desiredY: 50, dt: 1 / 60 })
    for (const key of ['x', 'y', 'vx', 'vy', 'facing', 'gaitPhase', 'stride', 'lean']) {
      expect(Number.isFinite(out[key])).toBe(true)
    }
  })
})

describe('stepLocomotion — deterministic replay', () => {
  it('returns identical poses for identical inputs', () => {
    const pose = createLocomotionPose({ x: 0, y: 0 })
    const options = { desiredX: 500, desiredY: 300, dt: 1 / 60 }
    expect(stepLocomotion(pose, options)).toEqual(stepLocomotion(pose, options))
  })

  it('replays a whole sequence identically', () => {
    const replay = (seed) => {
      let current = seed
      for (let i = 0; i < 300; i += 1) {
        current = stepLocomotion(current, { desiredX: 200, desiredY: 150, dt: 1 / 60 })
      }
      return current
    }
    const a = replay(createLocomotionPose({ x: 0, y: 0 }))
    const b = replay(createLocomotionPose({ x: 0, y: 0 }))
    expect(a).toEqual(b)
  })
})

describe('locomotionPresentation', () => {
  it('returns bounded values for a moving pose across the gait cycle', () => {
    let pose = createLocomotionPose({ x: 0, y: 0 })
    for (let i = 0; i < 120; i += 1) {
      pose = stepLocomotion(pose, { desiredX: 10000, desiredY: 0, dt: 1 / 60 })
      const p = locomotionPresentation(pose)
      expect(p.footLift).toBeGreaterThanOrEqual(0)
      expect(p.footLift).toBeLessThanOrEqual(1)
      expect(p.bodyBob).toBeGreaterThanOrEqual(0)
      expect(p.bodyBob).toBeLessThanOrEqual(1)
      expect(p.bodyLean).toBeGreaterThanOrEqual(0)
      expect(p.bodyLean).toBeLessThanOrEqual(0.22)
      expect(p.shadowScale).toBeGreaterThanOrEqual(0.88)
      expect(p.shadowScale).toBeLessThanOrEqual(1)
    }
  })

  it('idles flat with zero foot lift and bob', () => {
    const settled = runTo(createLocomotionPose({ x: 0, y: 0 }), 100, 0, 400)
    const p = locomotionPresentation(settled)
    expect(p.footLift).toBe(0)
    expect(p.bodyBob).toBe(0)
  })

  it('is safe for a malformed pose', () => {
    const p = locomotionPresentation(null)
    expect(Number.isFinite(p.footLift)).toBe(true)
    expect(Number.isFinite(p.bodyBob)).toBe(true)
    expect(Number.isFinite(p.bodyLean)).toBe(true)
    expect(Number.isFinite(p.shadowScale)).toBe(true)
  })
})
