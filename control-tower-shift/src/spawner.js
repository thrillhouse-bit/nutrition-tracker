import { threatsForWave } from './game/waves.js'
import { GODS, MONSTER_TYPES } from './game/characters.js'

// Deterministic spawner: all randomness comes from a seeded mulberry32 stream,
// so a given seed replays the identical shift. The spawner is the ONLY place
// randomness exists — the core in game/ never sees an RNG.
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

// Arena spawn ring — threats appear at the edge, then chase the deity
export const FIELD_RADIUS = 280

const BASE_INTERVAL = 60 // ticks between spawns at wave 1 (30 Hz → 2.0 s)
const MIN_INTERVAL = 22

export function createSpawner(seed) {
  return { rng: mulberry32(seed), seed, wave: 1, spawned: 0, untilNext: 20, serial: 0 }
}

export function spawnInterval(wave) {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - (wave - 1) * 5)
}

// Assign a monster type to each threat based on the wave number.
// Early waves get weaker monsters; later waves bring the tankier ones.
export function monsterTypeForWave(wave, rng) {
  const keys = Object.keys(MONSTER_TYPES)
  if (wave <= 2) {
    return rng() < 0.6 ? 'hydra' : 'chronos'
  } else if (wave <= 5) {
    return rng() < 0.4 ? 'hydra' : rng() < 0.7 ? 'cerberus' : rng() < 0.85 ? 'chronos' : 'apollo'
  } else if (wave <= 7) {
    return rng() < 0.3 ? 'hydra' : rng() < 0.5 ? 'cerberus' : rng() < 0.7 ? 'chronos' : rng() < 0.85 ? 'apollo' : rng() < 0.95 ? 'sphinx' : 'minotaur'
  } else {
    return rng() < 0.2 ? 'atlas' : rng() < 0.35 ? 'hydra' : rng() < 0.55 ? 'cerberus' : rng() < 0.75 ? 'chronos' : rng() < 0.9 ? 'apollo' : 'atlas'
  }
}

// Advance the spawner by one tick against the current game state; returns the
// spawn descriptors due this tick (usually none). Mutates the spawner — it is
// loop-owned bookkeeping, not game state.
export function stepSpawner(spawner, state) {
  if (state.status !== 'running') return []
  if (state.wave !== spawner.wave) {
    spawner.wave = state.wave
    spawner.spawned = 0
    spawner.untilNext = 20
  }
  const budget = threatsForWave(state.wave, state.config)
  if (spawner.spawned >= budget) return []
  spawner.untilNext -= 1
  if (spawner.untilNext > 0) return []
  spawner.untilNext = spawnInterval(state.wave)
  spawner.spawned += 1
  spawner.serial += 1

  const angle = spawner.rng() * Math.PI * 2
  const r = FIELD_RADIUS
  const x = Math.cos(angle) * r
  const y = Math.sin(angle) * r

  // Assign a monster type based on wave and RNG
  const monsterType = monsterTypeForWave(state.wave, spawner.rng)
  const monsterSpec = MONSTER_TYPES[monsterType]
  const radius = monsterSpec ? monsterSpec.size : 10

  // Base speed with wave scaling
  const baseSpeed = state.config.threatBaseSpeed * (1 + (state.wave - 1) * state.config.waveSpeedAccel * 0.5)
  // Monsters chase the deity — velocity set in state.spawnThreat based on deity position
  // but spawner provides the initial spawn position

  return [
    {
      id: `w${state.wave}-${spawner.serial}`,
      x,
      y,
      vx: 0, // will be set by spawnThreat based on deity position
      vy: 0,
      radius,
      angle, // for rendering
      god: monsterType,
      glyph: monsterSpec ? monsterSpec.glyph : 'hydra',
      behavior: monsterSpec ? monsterSpec.behavior : 'default',
      speed: baseSpeed,
      health: monsterSpec ? monsterSpec.size * 3 : 30,
      monsterType: monsterType,
    },
  ]
}
