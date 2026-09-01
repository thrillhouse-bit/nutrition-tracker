import { spawnThreat, advanceTick, deityAttack } from './game/state.js'
import { stepSpawner } from './spawner.js'
import { distance } from './game/collision.js'

export const LOGIC_HZ = 30 // config durations are in these ticks

// One or more fixed logic steps: spawn, then advance. Pure in the game state
// (returns a new one); the spawner is loop-owned and advances in place.
export function stepFrame(game, spawner, steps = 1) {
  let g = game
  for (let i = 0; i < steps; i++) {
    const spawns = stepSpawner(spawner, g)
    for (const s of spawns) {
      g = spawnThreat(g, s)
    }
    g = advanceTick(g)
  }
  return g
}

// The threat closest to the deity — the most urgent one on the field.
export function nearestThreatToDeity(state) {
  const d = state.deity
  if (!d) return null
  let best = null
  let bestD = Infinity
  for (const t of state.threats) {
    const dist = distance(t, d)
    if (dist < bestD || (dist === bestD && best && t.id < best.id)) {
      best = t
      bestD = dist
    }
  }
  return best
}

// Nearest threat within its radius plus touch slop, or null. Slop makes small
// fast sprites tappable on a phone without changing collision truth.
export function threatAt(state, x, y, slop = 24) {
  let best = null
  let bestD = Infinity
  for (const t of state.threats) {
    const dist = Math.hypot(t.x - x, t.y - y)
    if (dist <= t.radius + slop && dist < bestD) {
      best = t
      bestD = dist
    }
  }
  return best
}

// Auto-attack: the deity's melee on the nearest threat.
export function autoAttackNearest(state) {
  const target = nearestThreatToDeity(state)
  if (!target) return state
  return deityAttack(state)
}
