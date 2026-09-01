import { describe, it, expect } from 'vitest'
import {
  CAMPAIGN,
  CAMPAIGN_LENGTH,
  levelForIndex,
  levelById,
  encounterSize,
  levelComplete,
  advanceLevel,
  objectiveProgress,
  createInitialState,
  spawnThreat,
} from '../src/game/index.js'

describe('campaign data', () => {
  it('has at least three original locations that progress in order', () => {
    expect(CAMPAIGN_LENGTH).toBeGreaterThanOrEqual(3)
    expect(CAMPAIGN[0].name).toContain('Acropolis')
    expect(CAMPAIGN[1].name).toContain('Sun Court')
    expect(CAMPAIGN[2].name).toContain('Foundry')
    // Strict progression: each level's order field increments.
    const orders = CAMPAIGN.map((l) => l.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('every level is fully authored', () => {
    for (const level of CAMPAIGN) {
      expect(level.id).toBeTruthy()
      expect(level.name).toBeTruthy()
      expect(level.location).toBeTruthy()
      expect(level.subtitle).toBeTruthy()
      expect(level.introTitle).toBeTruthy()
      expect(level.introSubtitle).toBeTruthy()
      expect(level.completion).toBeTruthy()
      // Palette + materials.
      expect(level.palette.marble).toMatch(/^#/)
      expect(level.palette.terracotta).toMatch(/^#/)
      expect(level.palette.name).toBeTruthy()
      // Architecture / obstacles.
      expect(Array.isArray(level.architecture)).toBe(true)
      expect(level.architecture.length).toBeGreaterThan(0)
      for (const o of level.architecture) {
        // Phase B renderer adds sculpted prop kinds (statue/ruin/urn) on top
        // of the original column/brazier contract — same data shape.
        expect(['column', 'brazier', 'statue', 'ruin', 'urn']).toContain(o.kind)
        expect(typeof o.x).toBe('number')
        expect(typeof o.y).toBe('number')
      }
      // Encounter composition.
      expect(level.encounter.order.length).toBe(level.objective.target)
      for (const e of level.encounter.order) expect(typeof e).toBe('string')
      expect(level.encounter.pacing).toBeGreaterThan(0)
    }
  })

  it('stable ids resolve via levelById', () => {
    expect(levelById('acropolis-entry').name).toContain('Acropolis')
    expect(levelById('nope')).toBeNull()
  })

  it('the bronze foundry includes a minotaur elite', () => {
    const foundry = levelById('bronze-foundry')
    expect(foundry.encounter.order).toContain('minotaur')
  })

  it('index lookups clamp safely', () => {
    expect(levelForIndex(-5).id).toBe(CAMPAIGN[0].id)
    expect(levelForIndex(999).id).toBe(CAMPAIGN[CAMPAIGN_LENGTH - 1].id)
  })
})

describe('campaign progression helpers', () => {
  it('levelComplete is false while threats remain', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 0, monsterType: 'hydra' })
    expect(levelComplete(s)).toBe(false)
  })

  it('levelComplete is true with no threats and nothing pending', () => {
    const s = { ...createInitialState(), threats: [], threatsRemainingInLevel: 0 }
    expect(levelComplete(s)).toBe(true)
  })

  it('advanceLevel is a no-op before completion', () => {
    let s = createInitialState()
    s = spawnThreat(s, { id: 't1', x: 200, y: 0, speed: 0, monsterType: 'hydra' })
    const before = s.levelIndex
    expect(advanceLevel(s).levelIndex).toBe(before)
  })

  it('advanceLevel moves to the next authored map and resets its encounter', () => {
    let s = { ...createInitialState(), threats: [], threatsRemainingInLevel: 0 }
    s = advanceLevel(s)
    expect(s.levelIndex).toBe(1)
    expect(s.threatsRemainingInLevel).toBe(encounterSize(levelForIndex(1)))
  })

  it('advanceLevel beyond the last map wins the campaign', () => {
    let s = {
      ...createInitialState(),
      levelIndex: CAMPAIGN_LENGTH - 1,
      threats: [],
      threatsRemainingInLevel: 0,
    }
    s = advanceLevel(s)
    expect(s.status).toBe('won')
  })

  it('objectiveProgress reports remaining enemies as progress', () => {
    let s = createInitialState()
    const target = levelForIndex(0).objective.target
    expect(objectiveProgress(s)).toBe(`0 / ${target}`)
    s = { ...s, threatsRemainingInLevel: 2 }
    expect(objectiveProgress(s)).toBe(`${target - 2} / ${target}`)
  })
})
