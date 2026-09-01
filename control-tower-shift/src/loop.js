import { spawnThreat, advanceTick, deityAttack } from './game/state.js'
import { stepSpawner } from './spawner.js'
import { distance } from './game/collision.js'

export const LOGIC_HZ = 30 // config durations are in these ticks

// Fixed-timestep frame clock: how many logic steps a frame arriving at `now`
// has earned. Deltas are measured against the PREVIOUS FRAME's timestamp, so
// every reading comes from whichever clock the caller's rAF supplies and no
// second clock is ever subtracted from the first.
//
// That is the whole point. A browser's rAF timestamp and performance.now()
// share a time origin, so seeding `last = performance.now()` looked equivalent
// and shipped. jsdom does NOT share it: rAF timestamps run from the window's
// creation while performance.now() runs from the Node process start, and under
// vitest the gap between them is however long the worker had been alive —
// measured at 1413-1712 ms. The first frame therefore computed
// (now - last) = -1.4s, the accumulator went that far into debt, and it had to
// climb back out at 16 ms of real time per frame before the first logic tick
// ever ran. The game sat frozen for ~1.4s of wall clock on every mount, which
// is ~70% of what the keyboard-play test spent before it saw a threat.
//
// Returning 0 on the first frame (rather than stepping off a made-up delta)
// costs one frame of simulation and buys an origin that is correct by
// construction. acc is floored at 0 as well as capped: a clock that jumps
// backwards should cost the loop nothing, never bank negative time.
export function createFrameClock(stepMs, maxCatchUp = 250) {
  let last = null
  let acc = 0
  return function stepsFor(now) {
    if (last === null) {
      last = now // first frame only establishes the origin
      return 0
    }
    // Cap: a backgrounded tab must not fast-forward the whole gap at once.
    acc = Math.min(Math.max(acc + (now - last), 0), maxCatchUp)
    last = now
    const steps = Math.floor(acc / stepMs)
    acc -= steps * stepMs
    return steps
  }
}

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
