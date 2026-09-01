import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  spawnThreat,
  advanceTick,
  pause,
  resume,
  restart,
  restartLevel,
  setInput,
  deityAttack,
  castPowerOn,
  circlesCollide,
  distance,
  detectCollisions,
  clearPoints,
  powerActive,
  powerReady,
  deitySpeedScale,
  CAMPAIGN_LENGTH,
  levelForIndex,
  objectiveProgress,
  loadHighScores,
  saveHighScore,
  isHighScore,
  HIGH_SCORE_KEY,
} from '../src/game/index.js'

const deepFreeze = (obj) => {
  Object.values(obj).forEach((v) => v && typeof v === 'object' && deepFreeze(v))
  return Object.freeze(obj)
}

describe('collision thresholds', () => {
  it('touching circles collide (boundary is inclusive)', () => {
    expect(circlesCollide({ x: 0, y: 0, radius: 5 }, { x: 10, y: 0, radius: 5 })).toBe(true)
  })

  it('circles a hair apart do NOT collide', () => {
    expect(circlesCollide({ x: 0, y: 0, radius: 5 }, { x: 10, y: 0, radius: 4.999 })).toBe(false)
  })

  it('distance returns Euclidean distance', () => {
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

  it('a threat overlapping the deity damages health and recoils without counting as defeated', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 20, y: 0, speed: 0, monsterType: 'hydra' })
    const before = s.deity.health
    s = advanceTick(s)
    expect(s.deity.health).toBe(before - s.config.threatDamage)
    expect(s.threats).toHaveLength(1)
    expect(s.threats[0].contactCooldownUntil).toBeGreaterThan(s.tick)
    expect(s.threatsRemainingInLevel).toBe(levelForIndex(0).encounter.order.length)
  })

  it('control: a distant threat does NOT damage the deity', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 270, y: 0, speed: 1, monsterType: 'hydra' })
    s = advanceTick(s)
    expect(s.deity.health).toBe(s.deity.maxHealth)
    expect(s.threats).toHaveLength(1)
  })
})

describe('campaign progression', () => {
  it('has three authored levels in order', () => {
    expect(CAMPAIGN_LENGTH).toBe(3)
    expect(levelForIndex(0).id).toBe('acropolis-entry')
    expect(levelForIndex(1).id).toBe('sun-court')
    expect(levelForIndex(2).id).toBe('bronze-foundry')
  })

  it('a fresh game starts on level 1 with the full encounter pending', () => {
    const s = createInitialState()
    expect(s.levelIndex).toBe(0)
    expect(s.threatsRemainingInLevel).toBe(levelForIndex(0).encounter.order.length)
  })

  it('a level does not advance while a threat remains', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 0, monsterType: 'hydra' })
    const before = s.levelIndex
    s = advanceTick(s)
    expect(s.levelIndex).toBe(before)
  })

  it('clearing every threat of a level advances to the next', () => {
    let s = createInitialState()
    s = { ...s, threats: [], threatsRemainingInLevel: 0 }
    s = advanceTick(s)
    expect(s.levelIndex).toBe(1)
    expect(s.threatsRemainingInLevel).toBe(levelForIndex(1).encounter.order.length)
  })

  it('clearing the final level wins the campaign', () => {
    let s = createInitialState()
    s = { ...s, levelIndex: CAMPAIGN_LENGTH - 1, threats: [], threatsRemainingInLevel: 0 }
    s = advanceTick(s)
    expect(s.status).toBe('won')
  })

  it('objective progress counts cleared enemies', () => {
    let s = createInitialState()
    expect(objectiveProgress(s)).toMatch(/0 \/ 4/)
    s = { ...s, threatsRemainingInLevel: 1 }
    expect(objectiveProgress(s)).toMatch(/3 \/ 4/)
  })
})

describe('deity combat', () => {
  it('deity attack kills a monster at zero health', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 20, y: 0, speed: 0, monsterType: 'hydra' })
    s = { ...s, deity: { ...s.deity, x: 15, y: 0 }, threats: [{ ...s.threats[0], health: 0 }] }
    s = advanceTick(s)
    expect(s.threats).toHaveLength(0)
    expect(s.score).toBeGreaterThan(0)
  })

  it('deity movement follows input and is zero with no input', () => {
    let s = createInitialState()
    const startX = s.deity.x
    s = advanceTick(s)
    expect(s.deity.x).toBe(startX)
    s = setInput(s, 1, 0)
    s = advanceTick(s)
    expect(s.deity.x).toBeGreaterThan(0)
  })
})

describe('scoring', () => {
  it('clearing a threat scores base × level', () => {
    let s = createInitialState()
    expect(clearPoints(s)).toBe(s.config.pointsPerClear * (s.levelIndex + 1))
  })

  it('golden lyre tempo doubles points while active', () => {
    let s = createInitialState()
    s = castPowerOn(s, 'goldenLyre', 0, 0)
    expect(clearPoints(s)).toBe(s.config.pointsPerClear * 2)
  })

  it('control: no tempo boost after expiry', () => {
    let s = createInitialState()
    s = castPowerOn(s, 'goldenLyre', 0, 0)
    s = { ...s, tick: s.powerState.goldenLyre.activeUntil + 1 }
    expect(clearPoints(s)).toBe(s.config.pointsPerClear)
  })
})

describe('power dispatch basics', () => {
  it('solar bow fires a projectile and starts its cooldown', () => {
    let s = createInitialState()
    s = castPowerOn(s, 'solarBow', 200, 0)
    expect(s.projectiles).toHaveLength(1)
    expect(s.projectiles[0].ability).toBe('solarBow')
    expect(powerReady(s, 'solarBow')).toBe(false)
  })

  it('control: an ability on cooldown does NOT activate again', () => {
    let s = createInitialState()
    s = castPowerOn(s, 'solarBow', 200, 0)
    const count = s.projectiles.length
    const after = castPowerOn({ ...s, tick: s.tick + 1 }, 'solarBow', 200, 0)
    expect(after.projectiles).toHaveLength(count)
    expect(powerReady(after, 'solarBow')).toBe(false)
  })

  it('powers do nothing while paused', () => {
    let s = pause(createInitialState())
    const after = castPowerOn(s, 'solarBow', 200, 0)
    expect(after).toEqual(s)
  })

  it('token usage increments on a successful power use', () => {
    let s = createInitialState()
    s = castPowerOn(s, 'solarBow', 200, 0)
    expect(s.tokenUsage).toBe(1)
    s = castPowerOn(s, 'radiantBurst', 50, 50)
    expect(s.tokenUsage).toBe(2)
  })
})

describe('win/fail state', () => {
  it('deity health reaching zero fails the campaign', () => {
    let s = createInitialState()
    s = { ...s, deity: { ...s.deity, health: s.config.threatDamage } }
    s = spawnThreat(s, { id: 't1', x: 5, y: 0, speed: 0, monsterType: 'hydra' })
    s = { ...s, threats: [{ ...s.threats[0], x: s.deity.x + 1 }] }
    s = advanceTick(s)
    expect(s.deity.health).toBe(0)
    expect(s.status).toBe('failed')
  })

  it('a failed game no longer advances', () => {
    const s = { ...createInitialState(), status: 'failed' }
    expect(advanceTick(s)).toEqual(s)
  })
})

describe('pause, restart, restart level', () => {
  it('advanceTick is a no-op while paused; resume restores it', () => {
    let s = createInitialState()
    s = setInput(s, 1, 0)
    const paused = pause(s)
    expect(advanceTick(paused)).toEqual(paused)
    const resumed = resume(paused)
    s = advanceTick(resumed)
    expect(s.deity.x).not.toBe(paused.deity.x)
  })

  it('control: resume does NOT revive a failed game', () => {
    const failed = { ...createInitialState(), status: 'failed' }
    expect(resume(failed).status).toBe('failed')
  })

  it('restart returns a fresh campaign state with the same config', () => {
    let s = createInitialState({ god: 'apollo' })
    s = spawnThreat(s, { id: 't1', x: 300, y: 0, speed: 0, monsterType: 'hydra' })
    s = castPowerOn(s, 'solarBow', 200, 0)
    const fresh = restart(s)
    expect(fresh.score).toBe(0)
    expect(fresh.threats).toEqual([])
    expect(fresh.status).toBe('running')
    expect(fresh.levelIndex).toBe(0)
    expect(fresh.deity.health).toBe(fresh.deity.maxHealth)
    expect(fresh.god).toBe('apollo')
  })

  it('restartLevel replays the current level, not the whole campaign', () => {
    let s = createInitialState()
    s = { ...s, levelIndex: 1 }
    const fresh = restartLevel(s)
    expect(fresh.levelIndex).toBe(1)
    expect(fresh.threatsRemainingInLevel).toBe(levelForIndex(1).encounter.order.length)
  })
})

describe('determinism and purity', () => {
  it('the same inputs produce identical states', () => {
    const run = () => {
      let s = createInitialState()
      s = spawnThreat(s, { id: 't1', x: 200, y: 50, speed: 2, monsterType: 'hydra' })
      s = setInput(s, 1, 0)
      s = castPowerOn(s, 'solarBow', 200, 0)
      for (let i = 0; i < 20; i++) s = advanceTick(s)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('functions never mutate their input state', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 2, monsterType: 'hydra' })
    s = spawnThreat(s, { id: 'near', x: 40, y: 0, speed: 1, monsterType: 'minotaur' })
    deepFreeze(s)
    expect(() => {
      advanceTick(s)
      castPowerOn(s, 'aegisWard', 0, 0)
      castPowerOn(s, 'radiantBurst', 10, 10)
      spawnThreat(s, { id: 't2', x: 10, y: 10, speed: 1, monsterType: 'hydra' })
      setInput(s, 1, 0)
      pause(s)
      resume(pause(s))
      restart(s)
      restartLevel(s)
    }).not.toThrow()
  })

  it('control: the freeze harness itself detects a mutation', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 2, monsterType: 'hydra' })
    deepFreeze(s)
    expect(() => { s.tick = 999 }).toThrow(TypeError)
    expect(() => { s.threats[0].x = 0 }).toThrow(TypeError)
    expect(() => { s.config.arenaRadius = 999 }).toThrow(TypeError)
  })
})

describe('score persistence (mock storage)', () => {
  const mockStore = () => {
    const m = new Map()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), _m: m }
  }

  it('round-trips a saved score', () => {
    const store = mockStore()
    saveHighScore(store, { score: 1200, level: 3 })
    expect(loadHighScores(store)).toEqual([{ score: 1200, level: 3, at: null }])
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
  })

  it('isHighScore is true only above the floor once the board is full', () => {
    const store = mockStore()
    expect(isHighScore(store, 1)).toBe(true)
    expect(isHighScore(store, 0)).toBe(false)
    for (let i = 1; i <= 10; i++) saveHighScore(store, { score: i * 100 })
    expect(isHighScore(store, 100)).toBe(false)
    expect(isHighScore(store, 101)).toBe(true)
  })
})

describe('movement speed power', () => {
  it('winged stride raises deity speed scale while active, then restores', () => {
    let s = createInitialState()
    expect(deitySpeedScale(s)).toBe(1)
    s = castPowerOn(s, 'wingedStride', 0, 0)
    expect(deitySpeedScale(s)).toBeCloseTo(1.9)
    s = { ...s, tick: s.powerState.wingedStride.activeUntil + 1 }
    expect(deitySpeedScale(s)).toBe(1)
  })
})

describe('passive powers', () => {
  it('atlas world bearer grants more max health and is not castable', () => {
    const s = createInitialState({ god: 'atlas' })
    expect(s.deity.maxHealth).toBe(s.config.deityBaseHealth * 1.5)
    expect(powerReady(s, 'worldBearer')).toBe(false)
    expect(powerActive(s, 'worldBearer')).toBe(false)
  })

  it('control: a non-atlas god keeps base health', () => {
    const s = createInitialState({ god: 'apollo' })
    expect(s.deity.maxHealth).toBe(s.config.deityBaseHealth)
  })
})
