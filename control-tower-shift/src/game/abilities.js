import { distance } from './collision.js'
import { addScore, clearPoints } from './scoring.js'

// Ability state lives as { activeUntil, cooldownUntil } per ability, in ticks.
// Stacking rule: re-activating a timed ability while active EXTENDS the window
// by the full duration; factors never compound (2x stays 2x). Pinned by tests.
export function abilityActive(state, name) {
  const a = state.abilities[name]
  return Boolean(a) && state.tick < a.activeUntil
}

export function abilityReady(state, name) {
  const a = state.abilities[name]
  return !a || state.tick >= a.cooldownUntil
}

export function activateAbility(state, name) {
  if (state.status !== 'running') return state
  const spec = state.config.abilities[name]
  if (!spec || !abilityReady(state, name)) return state

  const prev = state.abilities[name]
  const base = abilityActive(state, name) ? prev.activeUntil : state.tick
  let next = {
    ...state,
    abilities: {
      ...state.abilities,
      [name]: {
        activeUntil: base + spec.duration,
        cooldownUntil: state.tick + spec.cooldown,
      },
    },
  }

  if (name === 'repair') {
    next = {
      ...next,
      integrity: Math.min(next.config.maxIntegrity, next.integrity + spec.amount),
    }
  }

  if (name === 'pulseClear') {
    const tower = { x: next.config.towerX, y: next.config.towerY }
    const inRange = next.threats.filter((t) => distance(t, tower) <= spec.radius)
    const perThreat = clearPoints(next, { pulse: true })
    next = addScore(next, perThreat * inRange.length)
    next = {
      ...next,
      threats: next.threats.filter((t) => distance(t, tower) > spec.radius),
      threatsRemainingInWave: Math.max(0, next.threatsRemainingInWave - inRange.length),
    }
  }

  return {
    ...next,
    tokenUsage: (next.tokenUsage || 0) + 1, // each ability use costs a token
  }
}

// Global movement scale on threats: speed burst dilates time against them.
export function threatSpeedScale(state) {
  return abilityActive(state, 'speedBurst')
    ? state.config.abilities.speedBurst.threatSlowFactor
    : 1
}
