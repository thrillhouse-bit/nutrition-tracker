import { DEFAULT_CONFIG } from './config.js'
import { threatsForWave, waveSpeedMultiplier, advanceWave } from './waves.js'
import { threatsHittingTower } from './collision.js'
import { abilityActive, threatSpeedScale } from './abilities.js'

export function createInitialState(configOverrides = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...configOverrides,
    abilities: { ...DEFAULT_CONFIG.abilities, ...(configOverrides.abilities || {}) },
  }
  return {
    status: 'running',
    tick: 0,
    score: 0,
    wave: 1,
    integrity: config.maxIntegrity,
    threats: [],
    threatsRemainingInWave: threatsForWave(1, config),
    abilities: {},
    config,
  }
}

// Spawning is the caller's concern (it decides where and when, typically from
// a seeded RNG) so the core stays deterministic. Spawns count against the
// wave's remaining budget.
export function spawnThreat(state, { id, x, y, vx, vy, radius = 10 }) {
  if (state.status !== 'running') return state
  return {
    ...state,
    threats: [...state.threats, { id, x, y, vx, vy, radius }],
  }
}

// One deterministic simulation step: move threats, resolve tower impacts,
// expire nothing (ability expiry is a pure read on tick), advance wave/status.
export function advanceTick(state, dt = 1) {
  if (state.status !== 'running') return state

  const speed = waveSpeedMultiplier(state.wave, state.config) * threatSpeedScale(state)
  const moved = state.threats.map((t) => ({
    ...t,
    x: t.x + t.vx * speed * dt,
    y: t.y + t.vy * speed * dt,
  }))

  let next = { ...state, tick: state.tick + dt, threats: moved }

  const hits = threatsHittingTower(next)
  if (hits.length > 0) {
    const hitIds = new Set(hits.map((t) => t.id))
    next = {
      ...next,
      threats: next.threats.filter((t) => !hitIds.has(t.id)),
      threatsRemainingInWave: Math.max(0, next.threatsRemainingInWave - hits.length),
    }
    if (!abilityActive(next, 'shield')) {
      next = {
        ...next,
        integrity: Math.max(0, next.integrity - hits.length * next.config.collisionDamage),
      }
    }
  }

  if (next.integrity <= 0) return { ...next, status: 'failed' }
  return advanceWave(next)
}

export function checkEndState(state) {
  if (state.integrity <= 0) return 'failed'
  if (
    state.config.finalWave !== null &&
    state.wave >= state.config.finalWave &&
    state.threatsRemainingInWave === 0 &&
    state.threats.length === 0
  ) {
    return 'won'
  }
  return null
}

export function pause(state) {
  return state.status === 'running' ? { ...state, status: 'paused' } : state
}

export function resume(state) {
  return state.status === 'paused' ? { ...state, status: 'running' } : state
}

export function restart(state) {
  return createInitialState(state.config)
}
