import { powerActive } from './powers.js'

// Points for clearing one threat right now. Level index raises the stakes;
// Apollo's Golden Lyre tempo doubles the take while active.
export function clearPoints(state, { pulse = false, auto = false, ability = null } = {}) {
  let pts = state.config.pointsPerClear * (state.levelIndex + 1)
  if (pulse) pts *= 0.5
  if (auto) pts = Math.floor(pts * 0.8)
  if (ability) pts = Math.floor(pts * 1.5)
  if (powerActive(state, 'goldenLyre')) {
    pts *= 2
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
    threatsRemainingInLevel: Math.max(0, (next.threatsRemainingInLevel || 0) - 1),
  }
}
