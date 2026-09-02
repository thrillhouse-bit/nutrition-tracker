import { describe, expect, it } from 'vitest'
import {
  CHARACTER_DIRECTIONS,
  createCharacterAnimationState,
  directionForFacing,
  resolveCharacterAnimationFrame,
  selectCharacterAnimation,
} from '../src/rpg/characterAnimation.js'

function pose(overrides = {}) {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 0,
    gaitPhase: 0,
    moving: false,
    ...overrides,
  }
}

describe('deterministic planted character animation', () => {
  it('quantizes the full facing circle into stable eight-direction clips', () => {
    const directions = Array.from({ length: 8 }, (_, index) => directionForFacing(index * Math.PI / 4))
    expect(directions).toEqual(CHARACTER_DIRECTIONS)
  })

  it('uses a turn threshold to avoid clip flicker at an octant boundary', () => {
    expect(directionForFacing(Math.PI / 8 + 0.04, { previousDirection: 'east' })).toBe('east')
    expect(directionForFacing(Math.PI / 4, { previousDirection: 'east' })).toBe('south-east')
  })

  it('selects idle, start, walk, brake and idle from velocity changes', () => {
    const idle = createCharacterAnimationState()
    const start = selectCharacterAnimation(pose({ vx: 24, moving: true }), idle)
    const walk = selectCharacterAnimation(pose({ vx: 96, moving: true, gaitPhase: 1 }), start)
    const brake = selectCharacterAnimation(pose({ vx: 42, moving: true, gaitPhase: 2 }), walk)
    const settled = selectCharacterAnimation(pose(), brake)
    expect([idle.animation, start.animation, walk.animation, brake.animation, settled.animation]).toEqual([
      'idle', 'start', 'walk', 'brake', 'idle',
    ])
  })

  it('derives alternating planted feet from distance-driven gait phase', () => {
    const walking = { ...createCharacterAnimationState(), animation: 'walk', speed: 96 }
    const left = selectCharacterAnimation(pose({ vx: 96, moving: true, gaitPhase: 0 }), walking)
    const airborne = selectCharacterAnimation(pose({ vx: 96, moving: true, gaitPhase: Math.PI / 2 }), left)
    const right = selectCharacterAnimation(pose({ vx: 96, moving: true, gaitPhase: Math.PI }), airborne)
    expect(left.contactFoot).toBe('left')
    expect(left.plantStrength).toBe(1)
    expect(airborne.contactFoot).toBe('none')
    expect(right.contactFoot).toBe('right')
    expect(right.plantStrength).toBe(1)
  })

  it('keeps movement and direction while reducing decorative animation', () => {
    const reduced = selectCharacterAnimation(
      pose({ vx: 60, vy: 60, moving: true, gaitPhase: 2.4 }),
      createCharacterAnimationState({ reducedMotion: true }),
      { reducedMotion: true },
    )
    expect(reduced.moving).toBe(true)
    expect(reduced.direction).toBe('south-east')
    expect(reduced.frameIndex).toBe(0)
    expect(reduced.bodyBob).toBe(0)
    expect(reduced.weightShift).toBe(0)
    expect(reduced.contactFoot).toBe('both')
  })

  it('resolves generated directional clips without changing locomotion code', () => {
    const selection = { animation: 'walk', direction: 'south', frameProgress: 0.6 }
    const resolved = resolveCharacterAnimationFrame({
      clips: { walk: { south: ['/walk-s-0.webp', '/walk-s-1.webp', '/walk-s-2.webp'] } },
    }, selection, '/static.webp')
    expect(resolved).toEqual({
      src: '/walk-s-1.webp',
      frameIndex: 1,
      flipX: false,
      directional: true,
      usedFallback: false,
    })
  })

  it('gracefully keeps the current static cutout when the manifest is empty', () => {
    expect(resolveCharacterAnimationFrame({ clips: {} }, {
      animation: 'walk', direction: 'west', frameProgress: 0.5,
    }, '/kallias-static.webp')).toEqual({
      src: '/kallias-static.webp',
      frameIndex: 0,
      flipX: false,
      directional: false,
      usedFallback: true,
    })
  })
})
