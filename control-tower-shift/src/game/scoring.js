import { abilityActive } from './abilities.js'

// Points for clearing one threat right now. Wave raises the stakes; the
// multiplier ability applies its factor without compounding (see abilities.js).
export function clearPoints(state, { pulse = false } = {}) {
  let pts = state.config.pointsPerClear * state.wave
  if (pulse) pts *= state.config.pulseClearFraction
  if (abilityActive(state, 'scoreMultiplier')) {
    pts *= state.config.abilities.scoreMultiplier.factor
  }
  return Math.floor(pts)
}

export function addScore(state, points) {
  return { ...state, score: state.score + Math.max(0, Math.floor(points)) }
}

// Player clears a specific threat (the core scoring action).
export function clearThreat(state, threatId) {
  if (state.status !== 'running') return state
  const threat = state.threats.find((t) => t.id === threatId)
  if (!threat) return state
  const next = addScore(state, clearPoints(state))
  return {
    ...next,
    threats: next.threats.filter((t) => t.id !== threatId),
    threatsRemainingInWave: Math.max(0, next.threatsRemainingInWave - 1),
  }
}
