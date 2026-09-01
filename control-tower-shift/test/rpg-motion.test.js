import { describe, expect, it } from 'vitest'
import {
  MOVEMENT_COMMIT_INTERVAL_MS,
  createWorldProjection,
  playerSpriteTransform,
  projectedPointIsVisible,
  projectPoint,
  projectWorldPoint,
  shouldCommitMovement,
  unprojectPoint,
} from '../src/rpg/motion.js'

describe('RPG movement presentation', () => {
  it('projects world coordinates into a matching 16:9 stage', () => {
    expect(projectWorldPoint({
      x: 480, y: 270,
      viewportWidth: 960, viewportHeight: 540,
      worldWidth: 960, worldHeight: 540,
    })).toEqual({ x: 480, y: 270 })
  })

  it('keeps the player centered while the portrait camera can track them', () => {
    const point = projectWorldPoint({
      x: 700, y: 270, focusX: 700, focusY: 270,
      viewportWidth: 360, viewportHeight: 720,
      worldWidth: 960, worldHeight: 540,
    })
    expect(point.x).toBeCloseTo(180)
    expect(point.y).toBeCloseTo(360)
  })

  it('projects the audited portrait camera vectors without raw-world drift', () => {
    const dimensions = {
      viewportWidth: 390, viewportHeight: 844,
      worldWidth: 960, worldHeight: 540,
    }
    expect(projectWorldPoint({ x: 600, y: 270, focusX: 500, focusY: 270, ...dimensions }).x).toBeCloseTo(351.3, 1)
    expect(projectWorldPoint({ x: 800, y: 270, focusX: 800, focusY: 270, ...dimensions }).x).toBeCloseTo(195, 1)
  })

  it('uses one reversible projection for desktop drawing and pointer inversion', () => {
    const projection = createWorldProjection({
      focusX: 800, focusY: 300,
      viewportWidth: 1440, viewportHeight: 810,
      worldWidth: 960, worldHeight: 540,
    })
    const screen = projectPoint(projection, { x: 800, y: 300 })
    expect(screen).toEqual({ x: 1200, y: 450 })
    expect(unprojectPoint(projection, screen)).toEqual({ x: 800, y: 300 })
    expect(projectedPointIsVisible(projection, screen)).toBe(true)
  })

  it('marks portrait anchors outside the live camera as offscreen', () => {
    const projection = createWorldProjection({
      focusX: 160, focusY: 400,
      viewportWidth: 390, viewportHeight: 844,
      worldWidth: 960, worldHeight: 540,
    })
    const treatyStone = projectPoint(projection, { x: 430, y: 268 })
    expect(treatyStone.x).toBeGreaterThan(390)
    expect(projectedPointIsVisible(projection, treatyStone)).toBe(false)
  })

  it('commits reducer movement at 10 Hz or immediately at a boundary', () => {
    expect(shouldCommitMovement(1000, 1000 + MOVEMENT_COMMIT_INTERVAL_MS - 1)).toBe(false)
    expect(shouldCommitMovement(1000, 1000 + MOVEMENT_COMMIT_INTERVAL_MS)).toBe(true)
    expect(shouldCommitMovement(1000, 1001, true)).toBe(true)
  })

  it('uses compositor transforms and preserves facing', () => {
    expect(playerSpriteTransform({ x: 10, y: 20 }, 0)).toContain('translate3d(10.00px, 20.00px, 0)')
    expect(playerSpriteTransform({ x: 10, y: 20 }, Math.PI)).toContain('scaleX(-1)')
  })
})
