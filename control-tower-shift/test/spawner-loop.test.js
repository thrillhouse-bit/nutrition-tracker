import { describe, it, expect } from 'vitest'
import { createSpawner, stepSpawner, mulberry32 } from '../src/spawner.js'
import { stepFrame, threatAt, nearestThreatToDeity } from '../src/loop.js'
import { createInitialState, pause, FIELD_RADIUS } from '../src/game/index.js'
import { threatsForWave } from '../src/game/waves.js'
import { spawnInterval } from '../src/spawner.js'

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

  it('spawns sit on the arena edge and move inward toward deity', () => {
    const s = createInitialState()
    const [t] = runTicks(s, createSpawner(9), 200)
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(s.config.arenaRadius, -1)
    // Threat should have a speed (not vx/vy in the old model)
    expect(t.speed).toBeGreaterThan(0)
  })

  it('spawn interval shrinks with wave and floors at 30 ticks', () => {
    expect(spawnInterval(2)).toBeLessThan(spawnInterval(1))
    expect(spawnInterval(50)).toBe(22) // floors at MIN_INTERVAL
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
    const run = () => stepFrame(createInitialState(), createSpawner(11), 300)
    const a = run()
    expect(a.tick).toBe(300)
    expect(a).toEqual(run())
  })

  it('a full unattended shift fails deterministically (threats reach deity)', () => {
    let g = createInitialState()
    const spawner = createSpawner(3)
    for (let i = 0; i < 20000 && g.status === 'running'; i++) g = stepFrame(g, spawner, 1)
    expect(g.status).toBe('failed')
    expect(g.deity.health).toBe(0)
  })

  it('nearestThreatToDeity picks the closest threat', () => {
    const deity = { x: 100, y: 0 }
    const threats = [
      { id: 'a', x: 0, y: 0, radius: 5 },   // 100 from deity
      { id: 'b', x: 130, y: 0, radius: 5 }, // 30 from deity
    ]
    expect(nearestThreatToDeity({ deity, threats }).id).toBe('b')
  })

  it('control: an empty field has no nearest threat', () => {
    expect(nearestThreatToDeity({ deity: { x: 0, y: 0 }, threats: [] })).toBeNull()
  })

  it('nearestThreatToDeity breaks ties deterministically, not by order', () => {
    const deity = { x: 0, y: 0 }
    const mk = (ids) => ({
      deity,
      threats: ids.map((id) => ({ id, x: 50, y: 0, radius: 5 })),
    })
    expect(nearestThreatToDeity(mk(['z', 'a'])).id).toBe('a')
    expect(nearestThreatToDeity(mk(['a', 'z'])).id).toBe('a')
  })

  it('threatAt hit-tests with slop and picks the nearest', () => {
    const threats = [
      { id: 'far', x: 0, y: 0, radius: 10 },
      { id: 'near', x: 5, y: 0, radius: 10 },
    ]
    expect(threatAt({ threats }, 6, 0).id).toBe('near')
    expect(threatAt({ threats }, 40, 0, 18)).toBeNull()
    expect(threatAt({ threats }, 0, 37, 18)).toBeNull()
  })
})
