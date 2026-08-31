import { describe, it, expect } from 'vitest'
import { createSpawner, stepSpawner, spawnInterval, FIELD_RADIUS, mulberry32 } from '../src/spawner.js'
import { stepFrame, threatAt, nearestThreatToTower, createFrameClock } from '../src/loop.js'
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
    const a = run()
    // PROVE THE RUN IS NON-TRIVIAL FIRST. Two identical no-ops compare equal,
    // so `run() === run()` alone would still pass if stepFrame returned its
    // input untouched — a determinism test that cannot tell determinism from
    // doing nothing. Assert the simulation actually moved before comparing.
    // (Not "the wave budget went down": by tick 900 the run is on wave 2,
    // whose budget is LARGER than wave 1's. Measured, after the first draft of
    // this guard asserted exactly that and failed.)
    expect(a.tick).toBe(900)
    expect(a.wave).toBeGreaterThan(1) // a wave was cleared
    expect(a.integrity).toBeLessThan(a.config.maxIntegrity) // threats landed
    expect(a).toEqual(run())
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

// The loop's accumulator, on its own. It shipped seeded from performance.now()
// while every later reading came from the rAF timestamp — two clocks that a
// browser happens to share a time origin for and jsdom does not. Under vitest
// the gap was the worker's age (1413-1712 ms measured, 30 Aug 2026): the first
// frame handed the accumulator that much negative time, and the game stood
// still for ~1.4s of real clock on every mount while it paid the debt off at
// 16ms per frame. game-view.test.jsx drives the loop through its own frame
// pump now and so cannot see this — these are the tests that hold the fix.
describe('frame clock', () => {
  const STEP = 1000 / 30

  it('takes its origin from the FIRST frame, whatever that timestamp reads', () => {
    const stepsFor = createFrameClock(STEP)
    // A timestamp nowhere near any other clock's zero — the jsdom case, where
    // rAF counts from the window and performance.now() counts from the
    // process. Seeding from a second clock made this first delta hugely
    // negative; taking the origin from the frame itself makes it structurally
    // impossible.
    expect(stepsFor(1_000_000)).toBe(0) // origin only, never a step off a made-up delta
    expect(stepsFor(1_000_000 + STEP * 3)).toBe(3) // and the very next frame is already earning
  })

  it('control: no debt is carried out of that first frame', () => {
    const stepsFor = createFrameClock(STEP)
    stepsFor(1_000_000)
    // One step's worth of time must buy exactly one step. If the first frame
    // had banked -1_000_000ms this returns 0 here and for the next 30_000
    // frames, which is precisely the bug: a game that renders but never moves.
    expect(stepsFor(1_000_000 + STEP)).toBe(1)
  })

  it('accrues fractional time instead of dropping it', () => {
    const stepsFor = createFrameClock(STEP)
    stepsFor(0)
    // 16ms frames against 33.3ms steps. Two frames buy the first step; the
    // 14.7ms left over is kept, so from then on a step falls every other
    // frame. Rounding the remainder away instead would earn nothing, ever.
    const earned = [16, 32, 48, 64, 80, 96].map((t) => stepsFor(t))
    expect(earned).toEqual([0, 0, 1, 0, 1, 0])
    expect(earned.reduce((a, b) => a + b, 0)).toBe(2) // 96ms of frames -> 2 steps
  })

  it('caps catch-up so a backgrounded tab does not fast-forward the shift', () => {
    const stepsFor = createFrameClock(STEP, 250)
    stepsFor(0)
    // Ten minutes in another tab. Without the cap this returns 18_000 steps
    // and the whole shift resolves in one frame.
    expect(stepsFor(600_000)).toBe(Math.floor(250 / STEP))
  })

  it('control: a clock that jumps backwards costs the loop nothing', () => {
    const stepsFor = createFrameClock(STEP)
    stepsFor(1000)
    expect(stepsFor(400)).toBe(0) // no steps off negative time...
    // ...and no debt banked against the next frame either. 50ms is one step
    // plus change rather than exactly STEP: a frame landing on the boundary
    // is a float coin-flip, and that is the test's own artifact, not a claim
    // about the clock.
    expect(stepsFor(450)).toBe(1)
  })
})
