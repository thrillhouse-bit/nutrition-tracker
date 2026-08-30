import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  spawnThreat,
  advanceTick,
  pause,
  resume,
  restart,
  circlesCollide,
  detectCollisions,
  waveSpeedMultiplier,
  threatsForWave,
  clearThreat,
  clearPoints,
  activateAbility,
  abilityActive,
  abilityReady,
  threatSpeedScale,
  loadHighScores,
  saveHighScore,
  isHighScore,
  HIGH_SCORE_KEY,
} from '../src/game/index.js'

const deepFreeze = (obj) => {
  Object.values(obj).forEach((v) => v && typeof v === 'object' && deepFreeze(v))
  return Object.freeze(obj)
}

// A state with one wave's worth of budget and no threats yet, small numbers.
const smallState = (overrides = {}) =>
  createInitialState({
    finalWave: 3,
    baseThreatsPerWave: 1,
    threatsPerWaveGrowth: 1,
    ...overrides,
  })

describe('collision thresholds', () => {
  it('touching circles collide (boundary is inclusive)', () => {
    const a = { x: 0, y: 0, radius: 5 }
    const b = { x: 10, y: 0, radius: 5 }
    expect(circlesCollide(a, b)).toBe(true)
  })

  it('circles a hair apart do NOT collide', () => {
    const a = { x: 0, y: 0, radius: 5 }
    const b = { x: 10, y: 0, radius: 4.999 }
    expect(circlesCollide(a, b)).toBe(false)
  })

  it('detectCollisions finds each overlapping pair once, ordered', () => {
    const entities = [
      { id: 'a', x: 0, y: 0, radius: 5 },
      { id: 'b', x: 6, y: 0, radius: 5 },
      { id: 'c', x: 100, y: 100, radius: 5 },
    ]
    expect(detectCollisions(entities)).toEqual([['a', 'b']])
  })

  it('a threat overlapping the tower damages integrity and is removed', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: s.config.towerRadius + 11, y: 0, vx: -2, vy: 0 })
    const before = s.integrity
    s = advanceTick(s) // moves to within towerRadius+radius → hit
    expect(s.integrity).toBe(before - s.config.collisionDamage)
    expect(s.threats).toHaveLength(0)
  })

  it('control: a distant threat (inside the field) does NOT damage the tower', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: -1, vy: 0 })
    s = advanceTick(s)
    expect(s.integrity).toBe(s.config.maxIntegrity)
    expect(s.threats).toHaveLength(1)
  })
})

describe('wave progression', () => {
  it('speed accelerates per wave and is capped', () => {
    const cfg = { waveSpeedAccel: 0.15, waveSpeedCap: 2.5 }
    expect(waveSpeedMultiplier(1, cfg)).toBe(1)
    expect(waveSpeedMultiplier(2, cfg)).toBeCloseTo(1.15)
    expect(waveSpeedMultiplier(3, cfg)).toBeGreaterThan(waveSpeedMultiplier(2, cfg))
    expect(waveSpeedMultiplier(100, cfg)).toBe(2.5)
  })

  it('threat count grows per wave', () => {
    const cfg = { baseThreatsPerWave: 4, threatsPerWaveGrowth: 2 }
    expect(threatsForWave(1, cfg)).toBe(4)
    expect(threatsForWave(2, cfg)).toBe(6)
    expect(threatsForWave(5, cfg)).toBe(12)
  })

  it('clearing the last threat of a wave advances the wave', () => {
    let s = smallState() // wave 1 budget = 1
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: 0, vy: 0 })
    s = clearThreat(s, 't1')
    s = advanceTick(s)
    expect(s.wave).toBe(2)
    expect(s.threatsRemainingInWave).toBe(2)
  })

  it('control: the wave does NOT advance while threats remain', () => {
    let s = smallState({ baseThreatsPerWave: 2 })
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: 0, vy: 0 })
    s = clearThreat(s, 't1')
    s = advanceTick(s)
    expect(s.wave).toBe(1)
  })

  it('clearing the final wave wins the shift', () => {
    let s = smallState({ finalWave: 1 })
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: 0, vy: 0 })
    s = clearThreat(s, 't1')
    s = advanceTick(s)
    expect(s.status).toBe('won')
  })

  it('a threat leaving the field is culled and counts against the wave', () => {
    let s = smallState({ baseThreatsPerWave: 2 }) // budget 2 so the wave itself doesn't turn over
    s = spawnThreat(s, { id: 'runaway', x: s.config.escapeRadius - 1, y: 0, vx: 5, vy: 0 })
    s = advanceTick(s)
    expect(s.threats).toHaveLength(0)
    expect(s.threatsRemainingInWave).toBe(1)
    expect(s.wave).toBe(1)
    expect(s.integrity).toBe(s.config.maxIntegrity) // no damage for a miss
    expect(s.score).toBe(0) // and no points either
  })

  it('control: a threat inside the field is NOT culled', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 'inbound', x: s.config.escapeRadius - 10, y: 0, vx: -1, vy: 0 })
    s = advanceTick(s)
    expect(s.threats).toHaveLength(1)
  })

  // The cull measured from the ORIGIN while collision.js and pulseClear measure
  // from config.towerX/towerY, so with a displaced tower a threat closing on it
  // was deleted as "escaped": no damage, no score, wave budget spent.
  it('the escape cull measures from the configured tower, not the origin', () => {
    let s = smallState({ towerX: 380, baseThreatsPerWave: 4 })
    s = spawnThreat(s, { id: 'inbound', x: 420, y: 0, vx: -2, vy: 0 })
    s = advanceTick(s)
    expect(s.threats.map((t) => t.id)).toEqual(['inbound']) // 40 units out, not escaped
  })

  it('control: a threat far from the DISPLACED tower is still culled', () => {
    let s = smallState({ towerX: 380, baseThreatsPerWave: 4 })
    s = spawnThreat(s, { id: 'gone', x: -100, y: 0, vx: -2, vy: 0 })
    s = advanceTick(s)
    expect(s.threats).toHaveLength(0)
  })

  it('threats move faster in later waves (acceleration is real)', () => {
    const mk = (wave) => {
      let s = smallState()
      s = { ...s, wave }
      s = spawnThreat(s, { id: 't', x: 300, y: 0, vx: -10, vy: 0 })
      return advanceTick(s).threats[0].x
    }
    expect(mk(3)).toBeLessThan(mk(1)) // moved farther toward tower
  })
})

describe('scoring', () => {
  it('clearing a threat scores base × wave', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: 0, vy: 0 })
    s = clearThreat(s, 't1')
    expect(s.score).toBe(s.config.pointsPerClear * 1)
  })

  it('score multiplier doubles points while active', () => {
    let s = smallState()
    s = activateAbility(s, 'scoreMultiplier')
    expect(clearPoints(s)).toBe(s.config.pointsPerClear * 2)
  })

  it('control: multiplier does NOT apply after expiry', () => {
    let s = smallState()
    s = activateAbility(s, 'scoreMultiplier')
    s = { ...s, tick: s.abilities.scoreMultiplier.activeUntil }
    expect(clearPoints(s)).toBe(s.config.pointsPerClear)
  })

  it('clearing an unknown threat changes nothing', () => {
    const s = smallState()
    expect(clearThreat(s, 'nope')).toEqual(s)
  })
})

describe('abilities', () => {
  it('shield absorbs tower damage while active', () => {
    let s = smallState()
    s = activateAbility(s, 'shield')
    s = spawnThreat(s, { id: 't1', x: s.config.towerRadius + 11, y: 0, vx: -2, vy: 0 })
    s = advanceTick(s)
    expect(s.integrity).toBe(s.config.maxIntegrity)
    expect(s.threats).toHaveLength(0) // the threat is still consumed
  })

  // The boundary the shield got wrong: it read the POST-step tick, so a hit on
  // the step out of the last active tick dealt full damage while the HUD (which
  // reads the rest tick) still said "Shield up". This is the firing sibling of
  // the expired-shield control below — together they pin both sides of the edge.
  it('a shield still absorbs on the step out of its LAST active tick', () => {
    let s = smallState()
    s = activateAbility(s, 'shield')
    s = { ...s, tick: s.abilities.shield.activeUntil - 1 }
    expect(abilityActive(s, 'shield')).toBe(true) // what the HUD renders
    s = spawnThreat(s, { id: 't1', x: s.config.towerRadius + 11, y: 0, vx: -2, vy: 0 })
    s = advanceTick(s)
    expect(s.integrity).toBe(s.config.maxIntegrity)
  })

  it('control: an expired shield does NOT absorb damage', () => {
    let s = smallState()
    s = activateAbility(s, 'shield')
    s = { ...s, tick: s.abilities.shield.activeUntil, abilities: { ...s.abilities } }
    s = spawnThreat(s, { id: 't1', x: s.config.towerRadius + 11, y: 0, vx: -2, vy: 0 })
    s = advanceTick(s)
    expect(s.integrity).toBe(s.config.maxIntegrity - s.config.collisionDamage)
  })

  it('pulse clear removes threats in radius, scores them at half, spares the far one', () => {
    let s = smallState({ baseThreatsPerWave: 3 })
    s = spawnThreat(s, { id: 'near1', x: 50, y: 0, vx: 0, vy: 0 })
    s = spawnThreat(s, { id: 'near2', x: 0, y: 100, vx: 0, vy: 0 })
    s = spawnThreat(s, { id: 'far', x: 5000, y: 0, vx: 0, vy: 0 })
    s = activateAbility(s, 'pulseClear')
    expect(s.threats.map((t) => t.id)).toEqual(['far'])
    const half = Math.floor(s.config.pointsPerClear * s.config.pulseClearFraction)
    expect(s.score).toBe(half * 2)
  })

  it('speed burst slows threat movement, and not after it expires', () => {
    let s = smallState()
    s = activateAbility(s, 'speedBurst')
    expect(threatSpeedScale(s)).toBe(0.5)
    s = { ...s, tick: s.abilities.speedBurst.activeUntil }
    expect(threatSpeedScale(s)).toBe(1)
  })

  it('repair restores integrity and caps at max', () => {
    let s = smallState()
    s = { ...s, integrity: 50 }
    s = activateAbility(s, 'repair')
    expect(s.integrity).toBe(80)
    // second repair would exceed max — force cooldown ready and check the cap
    s = { ...s, tick: s.abilities.repair.cooldownUntil }
    s = activateAbility(s, 'repair')
    expect(s.integrity).toBe(s.config.maxIntegrity)
  })

  it('stacking: re-activation extends the window, factor does not compound', () => {
    let s = smallState({
      abilities: { scoreMultiplier: { duration: 100, cooldown: 0, factor: 2 } },
    })
    s = activateAbility(s, 'scoreMultiplier')
    const firstEnd = s.abilities.scoreMultiplier.activeUntil
    s = { ...s, tick: 50 }
    s = activateAbility(s, 'scoreMultiplier')
    expect(s.abilities.scoreMultiplier.activeUntil).toBe(firstEnd + 100)
    expect(clearPoints(s)).toBe(s.config.pointsPerClear * 2) // still 2x, not 4x
  })

  it('control: an ability on cooldown does NOT activate', () => {
    let s = smallState()
    s = activateAbility(s, 'shield')
    const after = activateAbility({ ...s, tick: 1 }, 'shield')
    expect(after.abilities.shield).toEqual(s.abilities.shield)
    expect(abilityReady(s, 'shield')).toBe(false)
  })

  it('abilities do nothing while paused', () => {
    let s = pause(smallState())
    const after = activateAbility(s, 'repair')
    expect(after).toEqual(s)
  })
})

describe('win/fail state', () => {
  it('integrity reaching zero fails the shift', () => {
    let s = smallState({ maxIntegrity: 20 })
    s = spawnThreat(s, { id: 't1', x: s.config.towerRadius + 11, y: 0, vx: -2, vy: 0 })
    s = advanceTick(s)
    expect(s.integrity).toBe(0)
    expect(s.status).toBe('failed')
  })

  it('a failed game no longer advances', () => {
    let s = { ...smallState(), status: 'failed' }
    expect(advanceTick(s)).toEqual(s)
    expect(clearThreat(s, 'x')).toEqual(s)
  })
})

describe('pause and restart', () => {
  it('advanceTick is a no-op while paused; resume restores it', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: -1, vy: 0 })
    const paused = pause(s)
    expect(advanceTick(paused)).toEqual(paused)
    const resumed = resume(paused)
    expect(advanceTick(resumed).threats[0].x).toBeLessThan(300)
  })

  it('control: resume does NOT revive a failed game', () => {
    const failed = { ...smallState(), status: 'failed' }
    expect(resume(failed).status).toBe('failed')
  })

  it('restart returns a fresh state with the same config', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, vx: 0, vy: 0 })
    s = clearThreat(s, 't1')
    const fresh = restart(s)
    expect(fresh.score).toBe(0)
    expect(fresh.threats).toEqual([])
    expect(fresh.status).toBe('running')
    expect(fresh.config).toEqual(s.config)
  })
})

describe('determinism and purity', () => {
  it('the same inputs produce identical states', () => {
    const run = () => {
      let s = smallState()
      s = spawnThreat(s, { id: 't1', x: 200, y: 50, vx: -3, vy: -1 })
      s = activateAbility(s, 'speedBurst')
      for (let i = 0; i < 20; i++) s = advanceTick(s)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('functions never mutate their input state', () => {
    let s = smallState({ baseThreatsPerWave: 3 })
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, vx: -3, vy: 0 })
    s = spawnThreat(s, { id: 'near', x: 40, y: 0, vx: 0, vy: 0 })
    deepFreeze(s)
    // Throws in strict mode (ES modules) if anything mutates the frozen input.
    // Covers the write-heaviest paths too: spawnThreat appends, restart rebuilds
    // config, and pulseClear rewrites threats + score + the wave budget at once.
    expect(() => {
      advanceTick(s)
      clearThreat(s, 't1')
      activateAbility(s, 'shield')
      activateAbility(s, 'pulseClear')
      spawnThreat(s, { id: 't2', x: 10, y: 10, vx: 0, vy: 0 })
      pause(s)
      resume(pause(s))
      restart(s)
    }).not.toThrow()
  })

  // The CONTROL for the gate above. Without it the purity test asserts only the
  // absence of an exception: if deepFreeze regressed to a no-op, mutations would
  // succeed silently and the test would still pass. This proves the harness can
  // actually see a mutation — at the top level AND inside a nested object, since
  // Object.freeze is shallow and a half-reaching freeze fails the same way.
  it('control: the freeze harness itself detects a mutation', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, vx: -3, vy: 0 })
    deepFreeze(s)
    expect(() => {
      s.tick = 999
    }).toThrow(TypeError)
    expect(() => {
      s.threats[0].x = 0
    }).toThrow(TypeError)
    expect(() => {
      s.config.towerRadius = 999
    }).toThrow(TypeError)
  })
})

describe('config overrides', () => {
  // A partial ability override used to REPLACE the whole spec, so `cooldown`
  // vanished, activateAbility wrote cooldownUntil: NaN, and every later
  // `tick >= NaN` read false — the ability fired once and was dead for the rest
  // of the shift with nothing thrown anywhere.
  it('a partial ability override keeps the unspecified default fields', () => {
    const s = createInitialState({ abilities: { shield: { duration: 60 } } })
    expect(s.config.abilities.shield).toEqual({ duration: 60, cooldown: 600 })
  })

  it('a partial override still leaves the ability re-activatable after cooldown', () => {
    let s = createInitialState({ abilities: { shield: { duration: 60 } } })
    s = activateAbility(s, 'shield')
    expect(Number.isFinite(s.abilities.shield.cooldownUntil)).toBe(true)
    s = { ...s, tick: s.abilities.shield.cooldownUntil }
    expect(abilityReady(s, 'shield')).toBe(true)
  })

  it('control: an unspecified ability keeps its defaults untouched', () => {
    const s = createInitialState({ abilities: { shield: { duration: 60 } } })
    expect(s.config.abilities.pulseClear).toEqual(
      createInitialState().config.abilities.pulseClear,
    )
  })

  it('restart round-trips a config without degrading its ability specs', () => {
    const s = createInitialState({ abilities: { shield: { duration: 60 } } })
    expect(restart(s).config.abilities).toEqual(s.config.abilities)
  })
})

describe('score persistence (mock storage)', () => {
  const mockStore = () => {
    const m = new Map()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), _m: m }
  }

  it('round-trips a saved score', () => {
    const store = mockStore()
    saveHighScore(store, { score: 1200, wave: 4 })
    expect(loadHighScores(store)).toEqual([{ score: 1200, wave: 4, at: null }])
  })

  it('keeps the top 10 sorted descending', () => {
    const store = mockStore()
    for (let i = 1; i <= 15; i++) saveHighScore(store, { score: i * 100 })
    const list = loadHighScores(store)
    expect(list).toHaveLength(10)
    expect(list[0].score).toBe(1500)
    expect(list[9].score).toBe(600)
  })

  it('corrupt stored data degrades to an empty list, not a throw', () => {
    const store = mockStore()
    store.setItem(HIGH_SCORE_KEY, '{not json')
    expect(loadHighScores(store)).toEqual([])
    store.setItem(HIGH_SCORE_KEY, '{"a":1}')
    expect(loadHighScores(store)).toEqual([])
  })

  it('a throwing store reads as empty (private browsing shape)', () => {
    const store = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadHighScores(store)).toEqual([])
    expect(saveHighScore(store, { score: 10 })).toEqual([{ score: 10, wave: null, at: null }])
  })

  it('isHighScore is true only above the floor once the board is full', () => {
    const store = mockStore()
    expect(isHighScore(store, 1)).toBe(true) // empty board
    expect(isHighScore(store, 0)).toBe(false)
    for (let i = 1; i <= 10; i++) saveHighScore(store, { score: i * 100 })
    expect(isHighScore(store, 100)).toBe(false) // ties the floor, not above it
    expect(isHighScore(store, 101)).toBe(true)
  })
})
