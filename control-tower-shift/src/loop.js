import { spawnThreat, advanceTick } from './game/state.js'
import { stepSpawner } from './spawner.js'

export const LOGIC_HZ = 30 // config durations are in these ticks

// One or more fixed logic steps: spawn, then advance. Pure in the game state
// (returns a new one); the spawner is loop-owned and advances in place.
export function stepFrame(game, spawner, steps = 1) {
  let g = game
  for (let i = 0; i < steps; i++) {
    for (const s of stepSpawner(spawner, g)) g = spawnThreat(g, s)
    g = advanceTick(g)
  }
  return g
}

// Nearest threat within its radius plus touch slop, or null. Slop makes small
// fast triangles tappable on a phone without changing collision truth.
export function threatAt(state, x, y, slop = 18) {
  let best = null
  let bestD = Infinity
  for (const t of state.threats) {
    const d = Math.hypot(t.x - x, t.y - y)
    if (d <= t.radius + slop && d < bestD) {
      best = t
      bestD = d
    }
  }
  return best
}
