// @vitest-environment jsdom
//
// Phase B regression gates for bugs found during independent browser review.
// This file intentionally exercises only public/testable contracts. Renderer
// projection and React-owned pointer state do not currently expose helpers, so
// adding tests for those here would only duplicate their formulas rather than
// test production behavior.
import { describe, expect, it } from 'vitest'
import {
  advanceTick,
  castPowerOn,
  createInitialState,
  deityAttack,
  objectiveProgress,
  restart,
  spawnThreat,
} from '../src/game/index.js'
import { stepFrame } from '../src/loop.js'
import { createSpawner } from '../src/spawner.js'
import { prefersReducedMotion } from '../src/ControlTowerShift.jsx'

describe('Phase B combat regressions', () => {
  it('the public melee command damages an in-range enemy and honors cooldown', () => {
    let state = createInitialState({
      autoAttackDamage: 40,
      autoAttackCooldown: 9,
    })
    state = spawnThreat(state, {
      id: 'melee-target',
      x: 30,
      y: 0,
      health: 100,
      monsterType: 'minotaur',
    })

    const struck = deityAttack(state)
    expect(struck.threats.find((threat) => threat.id === 'melee-target')?.health).toBe(60)
    expect(struck.nextAutoAttack).toBe(9)

    // Holding/repeating Enter cannot bypass the melee cooldown.
    expect(deityAttack(struck)).toBe(struck)
  })

  it('rejects a known power that is outside the selected deity loadout', () => {
    const state = createInitialState({ god: 'hermes' })
    expect(state.loadout).toEqual(['wingedStride'])

    // All input paths ultimately call castPowerOn/castPower. Authorization
    // therefore belongs at this shared boundary, not only in the HUD.
    const unauthorized = castPowerOn(state, 'radiantBurst', 100, 0)
    expect(unauthorized).toBe(state)
    expect(unauthorized.tokenUsage).toBe(0)
    expect(unauthorized.powerState).toEqual({})
  })
})

describe('Phase B campaign regressions', () => {
  it('spawning enemies does not advance the defeat objective; defeating one does', () => {
    let state = createInitialState({ autoAttackDamage: 999 })
    const initialProgress = objectiveProgress(state)

    state = spawnThreat(state, {
      id: 'objective-target',
      x: 30,
      y: 0,
      health: 1,
      monsterType: 'hydra',
    })
    expect(objectiveProgress(state)).toBe(initialProgress)

    state = deityAttack(state)
    expect(state.threats.some((threat) => threat.id === 'objective-target')).toBe(false)
    expect(objectiveProgress(state)).toBe('1 / 4')
  })

  it('an idle state cannot complete a level or win the campaign', () => {
    let state = createInitialState()
    const spawner = createSpawner(7)
    for (let tick = 0; tick < 2_000 && state.status === 'running'; tick += 1) {
      state = stepFrame(state, spawner, 1)
    }

    expect(state.status).toBe('failed')
    expect(state.levelIndex).toBe(0)
    expect(objectiveProgress(state)).toBe('0 / 4')
  })

  it('a new-campaign restart always returns to level 1 with fresh progress', () => {
    const state = {
      ...createInitialState({ god: 'athena' }),
      status: 'won',
      levelIndex: 3,
      score: 9_999,
      threatsRemainingInLevel: 0,
    }

    const fresh = restart(state)
    expect(fresh.status).toBe('running')
    expect(fresh.levelIndex).toBe(0)
    expect(fresh.score).toBe(0)
    expect(fresh.god).toBe('athena')
    expect(objectiveProgress(fresh)).toBe('0 / 4')
  })
})

describe('Phase B accessibility regression', () => {
  it('derives the reduced-motion effect flag from the media query', () => {
    const reduced = {
      matchMedia: (query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
      }),
    }
    const animated = { matchMedia: () => ({ matches: false }) }

    expect(prefersReducedMotion(reduced)).toBe(true)
    expect(prefersReducedMotion(animated)).toBe(false)
    expect(prefersReducedMotion(null)).toBe(false)
  })
})
