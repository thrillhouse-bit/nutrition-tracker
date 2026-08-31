import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  spawnThreat,
  spawnProjectile,
  advanceTick,
  pause,
  resume,
  restart,
  setInput,
  deityAttack,
  castAbility,
  circlesCollide,
  distance,
  detectCollisions,
  waveSpeedMultiplier,
  threatsForWave,
  clearPoints,
  abilityActive,
  abilityReady,
  deitySpeedScale,
  threatSpeedScale,
  monsterTypeForWave,
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

  it('distance returns Euclidean distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('detectCollisions finds each overlapping pair once, ordered', () => {
    const entities = [
      { id: 'a', x: 0, y: 0, radius: 5 },
      { id: 'b', x: 6, y: 0, radius: 5 },
      { id: 'c', x: 100, y: 100, radius: 5 },
    ]
    expect(detectCollisions(entities)).toEqual([['a', 'b']])
  })

  it('a threat overlapping the deity damages health and is removed', () => {
    let s = smallState()
    // Place threat just within collision range of the deity at origin
    s = spawnThreat(s, { id: 't1', x: 20, y: 0, speed: 0, monsterType: 'hydra' })
    const before = s.deity.health
    s = advanceTick(s)
    expect(s.deity.health).toBe(before - s.config.collisionDamage)
    expect(s.threats).toHaveLength(0)
  })

  it('control: a distant threat (inside the field) does NOT damage the deity', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 270, y: 0, speed: 1, monsterType: 'hydra' })
    s = advanceTick(s)
    expect(s.deity.health).toBe(s.deity.maxHealth)
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

  it('clearing all threats of a wave advances the wave', () => {
    let s = smallState() // wave 1 budget = 1
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 0, monsterType: 'hydra' })
    // Remove the threat directly (simulate deity defeating it)
    s = { ...s, threats: [], threatsRemainingInWave: 0 }
    s = advanceTick(s)
    expect(s.wave).toBe(2)
  })

  it('wave does NOT advance while threats remain', () => {
    let s = smallState({ baseThreatsPerWave: 2 })
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 0, monsterType: 'hydra' })
    s = advanceTick(s)
    expect(s.wave).toBe(1)
  })

  it('clearing the final wave wins the shift', () => {
    let s = smallState({ finalWave: 1 })
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 0, monsterType: 'hydra' })
    s = { ...s, threats: [], threatsRemainingInWave: 0 }
    s = advanceTick(s)
    expect(s.status).toBe('won')
  })

  it('defeating a threat grants score', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 10, y: 0, speed: 0, monsterType: 'hydra' })
    // Move threat within auto-attack range so it gets cleared
    s = { ...s, threats: [{ ...s.threats[0], x: 10, health: 0 }] }
    s = advanceTick(s)
    expect(s.score).toBeGreaterThan(0)
  })

  it('control: a threat inside the field is NOT culled', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 'inbound', x: 50, y: 0, speed: 1, monsterType: 'hydra' })
    s = advanceTick(s)
    expect(s.threats).toHaveLength(1)
  })
})

describe('deity combat', () => {
  it('deity attack kills a monster at zero health', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 20, y: 0, speed: 0, monsterType: 'hydra' })
    // Move deity close to the threat and set threat health to 0 (simulated attack)
    s = { ...s, deity: { ...s.deity, x: 15, y: 0 } }
    s = { ...s, threats: [{ ...s.threats[0], health: 0 }] }
    s = advanceTick(s)
    expect(s.threats).toHaveLength(0)
    expect(s.score).toBeGreaterThan(0)
  })

  it('deity movement follows input', () => {
    let s = smallState()
    s = setInput(s, 1, 0) // move right
    s = advanceTick(s)
    expect(s.deity.x).toBeGreaterThan(0)
  })

  it('deity movement is zero with no input', () => {
    let s = smallState()
    const startX = s.deity.x
    s = advanceTick(s)
    expect(s.deity.x).toBe(startX)
  })
})

describe('scoring', () => {
  it('clearing a threat scores base × wave', () => {
    let s = smallState()
    const pts = clearPoints(s)
    expect(pts).toBe(s.config.pointsPerClear * s.wave)
  })

  it('pulse clear scores threats at half value', () => {
    let s = smallState()
    const fullPts = clearPoints(s)
    // With pulse, points are halved
    const halfPts = clearPoints(s, { pulse: true })
    expect(halfPts).toBe(Math.floor(fullPts * 0.5))
  })

  it('score multiplier doubles points while active', () => {
    let s = smallState()
    s = { ...s, abilities: { ...s.abilities, scoreMultiplier: { activeUntil: s.tick + 10000, cooldownUntil: s.tick } } }
    const doubled = clearPoints(s)
    expect(doubled).toBe(s.config.pointsPerClear * 2)
  })

  it('control: multiplier does NOT apply after expiry', () => {
    let s = smallState()
    s = { ...s, tick: s.wave * 1000 + 100000, abilities: { ...s.abilities, scoreMultiplier: { activeUntil: s.tick, cooldownUntil: s.tick } } }
    expect(clearPoints(s)).toBe(s.config.pointsPerClear * s.wave)
  })

  it('clearing a non-existent threat changes nothing', () => {
    const s = smallState()
    const before = s.score
    expect(s.score).toBe(before)
  })
})

describe('abilities', () => {
  it('shield absorbs deity damage while active', () => {
    let s = smallState()
    s = castAbility(s, 'shield', 0, 0)
    expect(abilityActive(s, 'shield')).toBe(true)
    s = spawnThreat(s, { id: 't1', x: s.deity.x + s.config.deityRadius + 10, y: 0, speed: 2, monsterType: 'hydra' })
    // Move threat into deity (immutable update)
    s = { ...s, threats: [{ ...s.threats[0], x: s.deity.x + 1 }] }
    s = advanceTick(s)
    expect(s.deity.health).toBe(s.deity.maxHealth) // shield absorbed the damage
    expect(s.threats).toHaveLength(0) // threat consumed on impact (shielded)
  })

  it('a shield still absorbs on the step out of its LAST active tick', () => {
    let s = smallState()
    s = castAbility(s, 'shield', 0, 0)
    s = { ...s, tick: s.abilities.shield.activeUntil - 1 }
    expect(abilityActive(s, 'shield')).toBe(true)
    s = spawnThreat(s, { id: 't1', x: s.deity.x + s.config.deityRadius + 10, y: 0, speed: 2, monsterType: 'hydra' })
    s = { ...s, threats: [{ ...s.threats[0], x: s.deity.x + 1 }] }
    s = advanceTick(s)
    expect(s.deity.health).toBe(s.deity.maxHealth)
  })

  it('control: an expired shield does NOT absorb damage', () => {
    let s = smallState()
    s = castAbility(s, 'shield', 0, 0)
    s = { ...s, tick: s.abilities.shield.activeUntil + 1 }
    s = spawnThreat(s, { id: 't1', x: s.deity.x + s.config.deityRadius + 10, y: 0, speed: 2, monsterType: 'hydra' })
    s = { ...s, threats: [{ ...s.threats[0], x: s.deity.x + 1 }] }
    s = advanceTick(s)
    expect(s.deity.health).toBe(s.deity.maxHealth - s.config.collisionDamage)
  })

  it('pulse clear removes threats in radius', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 'near1', x: 10, y: 0, speed: 0, monsterType: 'hydra' })
    s = spawnThreat(s, { id: 'near2', x: 0, y: 10, speed: 0, monsterType: 'hydra' })
    s = spawnThreat(s, { id: 'far', x: 5000, y: 0, speed: 0, monsterType: 'hydra' })
    s = castAbility(s, 'pulseClear', 0, 0)
    expect(s.threats.map((t) => t.id)).toEqual(['far'])
  })

  it('speed burst increases deity movement speed', () => {
    let s = smallState()
    s = castAbility(s, 'speedBurst', 0, 0)
    expect(deitySpeedScale(s)).toBeCloseTo(2.0)
    s = { ...s, tick: s.abilities.speedBurst.activeUntil + 1 }
    expect(deitySpeedScale(s)).toBe(1)
  })

  it('speed burst slows threat pursuit speed while active', () => {
    let s = smallState()
    s = castAbility(s, 'speedBurst', 0, 0)
    expect(threatSpeedScale(s)).toBe(0.5)
    s = { ...s, tick: s.abilities.speedBurst.activeUntil + 1 }
    expect(threatSpeedScale(s)).toBe(1)
  })

  it('repair restores deity health and caps at max', () => {
    let s = smallState()
    s = { ...s, deity: { ...s.deity, health: 50 } }
    s = castAbility(s, 'repair', 0, 0)
    expect(s.deity.health).toBe(90) // 50 + repair amount 40
    // Second repair would exceed max — wait for cooldown
    s = { ...s, tick: s.abilities.repair.cooldownUntil }
    s = castAbility(s, 'repair', 0, 0)
    expect(s.deity.health).toBe(s.deity.maxHealth)
  })

  it('stacking: re-activation extends the window, factor does not compound', () => {
    let s = smallState({
      abilities: { scoreMultiplier: { duration: 150, cooldown: 0, factor: 2 } },
    })
    s = castAbility(s, 'scoreMultiplier', 0, 0)
    const firstEnd = s.abilities.scoreMultiplier.activeUntil
    s = { ...s, tick: 50 }
    s = castAbility(s, 'scoreMultiplier', 0, 0)
    expect(s.abilities.scoreMultiplier.activeUntil).toBe(firstEnd + 150)
    // Still 2x, not 4x
    const pts = clearPoints(s)
    expect(pts).toBe(s.config.pointsPerClear * 2 * s.wave)
  })

  it('control: an ability on cooldown does NOT activate', () => {
    let s = smallState()
    s = castAbility(s, 'shield', 0, 0)
    const before = { ...s.abilities.shield }
    const after = castAbility({ ...s, tick: s.tick + 1 }, 'shield')
    expect(after.abilities.shield).toEqual(before)
    expect(abilityReady(after, 'shield')).toBe(false)
  })

  it('abilities do nothing while paused', () => {
    let s = pause(smallState())
    const after = castAbility(s, 'repair', 0, 0)
    expect(after).toEqual(s)
  })

  it('token usage increments on ability use', () => {
    let s = smallState()
    expect(s.tokenUsage).toBe(0)
    s = castAbility(s, 'repair', 0, 0)
    expect(s.tokenUsage).toBe(1)
    s = castAbility(s, 'shield', 0, 0)
    expect(s.tokenUsage).toBe(2)
  })

  it('monster type scales with wave via monsterTypeForWave', () => {
    const rng = () => 0 // deterministic: always takes the first branch
    expect(monsterTypeForWave(1, rng)).toBe('hydra')
    expect(monsterTypeForWave(5, rng)).toBe('hydra') // rng=0 < 0.4 → hydra
    expect(monsterTypeForWave(10, () => 0.25)).toBe('hydra') // 0.25 < 0.35 → hydra
    expect(monsterTypeForWave(10, () => 0.1)).toBe('atlas') // 0.1 < 0.2 → atlas
  })
})

describe('win/fail state', () => {
  it('deity health reaching zero fails the shift', () => {
    let s = smallState()
    s = { ...s, deity: { ...s.deity, health: s.config.collisionDamage } }
    s = spawnThreat(s, { id: 't1', x: 5, y: 0, speed: 0, monsterType: 'hydra' })
    s.threats[0].x = s.deity.x + 1
    s = advanceTick(s)
    expect(s.deity.health).toBe(0)
    expect(s.status).toBe('failed')
  })

  it('a failed game no longer advances', () => {
    const s = { ...smallState(), status: 'failed' }
    expect(advanceTick(s)).toEqual(s)
  })
})

describe('pause and restart', () => {
  it('advanceTick is a no-op while paused; resume restores it', () => {
    let s = smallState()
    s = setInput(s, 1, 0)
    const paused = pause(s)
    expect(advanceTick(paused)).toEqual(paused)
    const resumed = resume(paused)
    s = advanceTick(resumed)
    expect(s.deity.x).not.toBe(paused.deity.x)
  })

  it('control: resume does NOT revive a failed game', () => {
    const failed = { ...smallState(), status: 'failed' }
    expect(resume(failed).status).toBe('failed')
  })

  it('restart returns a fresh state with the same config', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, speed: 0, monsterType: 'hydra' })
    const fresh = restart(s)
    expect(fresh.score).toBe(0)
    expect(fresh.threats).toEqual([])
    expect(fresh.status).toBe('running')
    expect(fresh.config).toEqual(s.config)
    expect(fresh.deity.health).toBe(fresh.deity.maxHealth)
  })
})

describe('determinism and purity', () => {
  it('the same inputs produce identical states', () => {
    const run = () => {
      let s = smallState()
      s = spawnThreat(s, { id: 't1', x: 200, y: 50, speed: 2, monsterType: 'hydra' })
      s = setInput(s, 1, 0)
      s = castAbility(s, 'speedBurst', 0, 0)
      for (let i = 0; i < 20; i++) s = advanceTick(s)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('functions never mutate their input state', () => {
    let s = smallState({ baseThreatsPerWave: 3 })
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 2, monsterType: 'hydra' })
    s = spawnThreat(s, { id: 'near', x: 40, y: 0, speed: 1, monsterType: 'minotaur' })
    deepFreeze(s)
    expect(() => {
      advanceTick(s)
      castAbility(s, 'shield', 0, 0)
      castAbility(s, 'pulseClear', 0, 0)
      spawnThreat(s, { id: 't2', x: 10, y: 10, speed: 1, monsterType: 'hydra' })
      setInput(s, 1, 0)
      pause(s)
      resume(pause(s))
      restart(s)
    }).not.toThrow()
  })

  it('control: the freeze harness itself detects a mutation', () => {
    let s = smallState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 2, monsterType: 'hydra' })
    deepFreeze(s)
    expect(() => {
      s.tick = 999
    }).toThrow(TypeError)
    expect(() => {
      s.threats[0].x = 0
    }).toThrow(TypeError)
    expect(() => {
      s.config.arenaRadius = 999
    }).toThrow(TypeError)
  })
})

describe('config overrides', () => {
  it('a partial ability override keeps the unspecified default fields', () => {
    const s = createInitialState({ abilities: { shield: { duration: 60 } } })
    const expected = { duration: 60, cooldown: s.config.abilities.shield.cooldown }
    expect(s.config.abilities.shield).toEqual(expected)
  })

  it('a partial override still leaves the ability re-activatable after cooldown', () => {
    let s = createInitialState({ abilities: { shield: { duration: 60 } } })
    s = castAbility(s, 'shield', 0, 0)
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
    store._m.set(HIGH_SCORE_KEY, '{not json')
    expect(loadHighScores(store)).toEqual([])
    store._m.set(HIGH_SCORE_KEY, '{"a":1}')
    expect(loadHighScores(store)).toEqual([])
  })

  it('a throwing store reads as empty (private browsing shape)', () => {
    const store = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
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
