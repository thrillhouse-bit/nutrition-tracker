import { describe, it, expect } from 'vitest'
import { createSpawner, stepSpawner, spawnInterval, FIELD_RADIUS, mulberry32 } from '../src/spawner.js'
import { stepFrame, threatAt, nearestThreatToTower } from '../src/loop.js'
import { createInitialState, pause } from '../src/game/index.js'
import { threatsForWave } from '../src/game/waves.js'

const runTicks = (state, spawner, n) => {
  const out = []
  for (let i = 0; i < n; i++) out.push(...stepSpawner(spawner, state))
  return out
}

describe('spawner', () => {
  it('the same seed replays the identical spawn sequence', () => {
    const s = createInitialState()
    const a = runTicks(s, createSpawner(42), 600)
    const b = runTicks(s, createSpawner(42), 600)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('control: different seeds diverge', () => {
    const s = createInitialState()
    const a = runTicks(s, createSpawner(1), 600)
    const b = runTicks(s, createSpawner(2), 600)
    expect(a).not.toEqual(b)
  })

  it('spawns exactly the wave budget, then stops', () => {
    const s = createInitialState()
    const spawner = createSpawner(7)
    const spawned = runTicks(s, spawner, 100000)
    expect(spawned).toHaveLength(threatsForWave(1, s.config))
  })

  it('control: a paused game spawns nothing', () => {
    const s = pause(createInitialState())
    expect(runTicks(s, createSpawner(7), 5000)).toHaveLength(0)
  })

  it('spawns sit on the field ring and move inward', () => {
    const s = createInitialState()
    const [t] = runTicks(s, createSpawner(9), 200)
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(FIELD_RADIUS)
    // Radial velocity component points at the tower.
    expect(t.vx * t.x + t.vy * t.y).toBeLessThan(0)
  })

  it('spawn interval shrinks with wave and floors', () => {
    expect(spawnInterval(2)).toBeLessThan(spawnInterval(1))
    expect(spawnInterval(50)).toBe(30)
  })

  it('mulberry32 emits stable values in [0,1)', () => {
    const r = mulberry32(123)
    const seq = [r(), r(), r()]
    const r2 = mulberry32(123)
    expect([r2(), r2(), r2()]).toEqual(seq)
    seq.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    })
  })
})

describe('loop', () => {
  it('stepFrame is deterministic for a fixed seed', () => {
    const run = () => stepFrame(createInitialState(), createSpawner(11), 900)
    expect(run()).toEqual(run())
  })

  it('a full unattended shift fails deterministically (threats reach the tower)', () => {
    let g = createInitialState()
    const spawner = createSpawner(3)
    for (let i = 0; i < 20000 && g.status === 'running'; i++) g = stepFrame(g, spawner, 1)
    expect(g.status).toBe('failed')
    expect(g.integrity).toBe(0)
  })

  it('nearestThreatToTower picks the closest to the CONFIGURED tower', () => {
    const g = {
      config: { towerX: 100, towerY: 0 },
      threats: [
        { id: 'a', x: 0, y: 0 },   // 100 from the tower, 0 from the origin
        { id: 'b', x: 130, y: 0 }, // 30 from the tower
      ],
    }
    // An origin-relative implementation would answer 'a'.
    expect(nearestThreatToTower(g).id).toBe('b')
  })

  it('control: an empty field has no nearest threat', () => {
    expect(nearestThreatToTower({ config: { towerX: 0, towerY: 0 }, threats: [] })).toBeNull()
  })

  it('nearestThreatToTower breaks ties deterministically, not by order', () => {
    const mk = (ids) => ({
      config: { towerX: 0, towerY: 0 },
      threats: ids.map((id) => ({ id, x: 50, y: 0 })),
    })
    expect(nearestThreatToTower(mk(['z', 'a'])).id).toBe('a')
    expect(nearestThreatToTower(mk(['a', 'z'])).id).toBe('a')
  })

  it('threatAt hit-tests with slop and picks the nearest', () => {
    const g = {
      threats: [
        { id: 'far', x: 0, y: 0, radius: 10 },
        { id: 'near', x: 5, y: 0, radius: 10 },
      ],
    }
    expect(threatAt(g, 6, 0).id).toBe('near')
    expect(threatAt(g, 40, 0, 18)).toBeNull() // 35 from 'near': outside radius+slop (28)
    expect(threatAt(g, 0, 37, 18)).toBeNull() // 37 from 'far': outside 28 too
  })
})
