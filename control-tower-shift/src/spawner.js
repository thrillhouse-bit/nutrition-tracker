import { levelForIndex } from './game/campaign.js'
import { resolveMonsterType } from './game/characters.js'

// Deterministic spawner: all randomness comes from a seeded mulberry32 stream,
// so a given seed replays the identical encounter. The spawner is the ONLY
// place randomness exists — the core in game/ never sees an RNG.
//
// The spawner is an INTERNAL pacing mechanism: it feeds each level's authored
// encounter composition into the simulation at a per-level rhythm. It never
// owns campaign progression — completing a level is decided by the campaign
// module (all spawned enemies gone), not by the spawner.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Arena spawn ring — threats appear at the edge, then chase the deity.
export const FIELD_RADIUS = 280

export function createSpawner(seed) {
  return { rng: mulberry32(seed), seed, levelIndex: null, spawned: 0, untilNext: 20, serial: 0 }
}

// Advance the spawner by one tick against the current game state; returns the
// spawn descriptors due this tick (usually none). Mutates the spawner — it is
// loop-owned bookkeeping, not game state.
export function stepSpawner(spawner, state) {
  if (state.status !== 'running') return []
  const level = levelForIndex(state.levelIndex)
  if (!level) return []
  // A level change resets the encounter feed (progress is campaign-owned, so
  // the spawner simply restarts each new level's authored list).
  if (spawner.levelIndex !== state.levelIndex) {
    spawner.levelIndex = state.levelIndex
    spawner.spawned = 0
    spawner.untilNext = 20
    spawner.serial = 0
  }
  const order = level.encounter.order
  if (spawner.spawned >= order.length) return []
  spawner.untilNext -= 1
  if (spawner.untilNext > 0) return []
  spawner.untilNext = level.encounter.pacing
  spawner.serial += 1

  const monsterType = order[spawner.spawned]
  spawner.spawned += 1
  const spec = resolveMonsterType(monsterType)
  const angle = spawner.rng() * Math.PI * 2
  const x = Math.cos(angle) * FIELD_RADIUS
  const y = Math.sin(angle) * FIELD_RADIUS

  // Threat stats scale gently per level (internal difficulty curve).
  const speedMul = Math.min(
    state.config.levelSpeedCap,
    1 + state.levelIndex * state.config.levelSpeedAccel,
  )
  const baseSpeed = state.config.threatBaseSpeed * speedMul

  return [
    {
      id: `l${state.levelIndex}-${spawner.serial}`,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: spec.size,
      angle,
      god: monsterType,
      glyph: spec.glyph,
      behavior: spec.behavior,
      speed: baseSpeed,
      health: spec.size * 3,
      monsterType,
    },
  ]
}
