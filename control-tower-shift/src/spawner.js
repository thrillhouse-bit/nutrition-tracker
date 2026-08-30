import { threatsForWave } from './game/waves.js'

// Deterministic spawner: all randomness comes from a seeded mulberry32 stream,
// so a given seed replays the identical shift. The spawner is the ONLY place
// randomness exists — the core in game/ never sees an RNG.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const FIELD_RADIUS = 320 // threats spawn on this ring around the tower

const BASE_INTERVAL = 75 // ticks between spawns at wave 1 (30 Hz → 2.5 s)
const MIN_INTERVAL = 30

export function createSpawner(seed) {
  return { rng: mulberry32(seed), seed, wave: 1, spawned: 0, untilNext: 20, serial: 0 }
}

export function spawnInterval(wave) {
  return Math.max(MIN_INTERVAL, BASE_INTERVAL - (wave - 1) * 6)
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
  const x = Math.cos(angle) * FIELD_RADIUS
  const y = Math.sin(angle) * FIELD_RADIUS
  // Aim at the tower with jittered speed and a slight tangential drift so
  // approaches vary instead of all running straight down their radius. The
  // drift is capped so every spawn still intersects the tower footprint:
  // |drift|/speed <= 0.05/0.55 ≈ 0.09, and 0.09 × 320 ≈ 29 < towerRadius +
  // threatRadius (34). Wider drift shipped first and made most threats miss
  // and fly off forever — the unattended-shift test is what caught it.
  const speed = 0.55 + spawner.rng() * 0.4
  const drift = (spawner.rng() - 0.5) * 0.1
  const nx = -x / FIELD_RADIUS
  const ny = -y / FIELD_RADIUS
  return [
    {
      id: `w${state.wave}-${spawner.serial}`,
      x,
      y,
      vx: nx * speed - ny * drift,
      vy: ny * speed + nx * drift,
      radius: 10,
    },
  ]
}
