// All tunables in one place so tests and the future UI read the same numbers.
export const DEFAULT_CONFIG = {
  towerX: 0,
  towerY: 0,
  towerRadius: 24,
  maxIntegrity: 100,
  collisionDamage: 20,
  // A threat farther than this from the tower has left the field: it is
  // culled and still counts against the wave budget (no damage, no score).
  // Without this a grazing miss flies forever and the wave can never end —
  // caught by the unattended-shift loop test, not by inspection.
  escapeRadius: 400,

  // Waves
  finalWave: 10, // null = endless shift
  baseThreatsPerWave: 4,
  threatsPerWaveGrowth: 2,
  waveSpeedAccel: 0.15, // +15% threat speed per wave
  waveSpeedCap: 2.5,

  // Scoring
  pointsPerClear: 100,
  pulseClearFraction: 0.5, // pulse-cleared threats score half

  // Abilities: duration/cooldown in ticks; 0 duration = instant
  abilities: {
    shield: { duration: 120, cooldown: 600 },
    pulseClear: { duration: 0, cooldown: 900, radius: 180 },
    speedBurst: { duration: 90, cooldown: 450, threatSlowFactor: 0.5 },
    scoreMultiplier: { duration: 150, cooldown: 750, factor: 2 },
    repair: { duration: 0, cooldown: 500, amount: 30 },
  },
}
