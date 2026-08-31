// All tunables in one place so tests and the future UI read the same numbers.
// REWRITTEN for Hades-style arena combat: the player controls the deity directly,
// moving around the arena and fighting waves of monsters.
export const DEFAULT_CONFIG = {
  // Arena
  arenaRadius: 280,        // playable area radius in logical px
  // Player (deity) properties
  deityRadius: 16,         // collision radius for the deity
  deitySpeed: 1.8,         // logical px per tick (base)
  deityBaseHealth: 100,    // max health per deity
  // Combat
  autoAttackRange: 48,     // melee range (deity radius + weapon reach)
  autoAttackDamage: 15,    // damage per auto-attack
  pointsPerClear: 10,      // points for clearing one threat
  pulseClearFraction: 0.5, // pulse clear scores threats at half value
  autoAttackCooldown: 18,  // ticks between auto-attacks
  projectileSpeed: 4.5,    // ranged ability projectile speed
  projectileRadius: 5,     // collision radius for projectiles
  threatDamage: 20,        // damage per hit when a monster reaches the deity
  collisionDamage: 20,     // damage when a threat overlaps the deity (used in tests)
  // Waves
  finalWave: 10,           // null = endless
  baseThreatsPerWave: 3,
  threatsPerWaveGrowth: 2,
  // Threat (monster) base stats — scaled by wave
  threatBaseSpeed: 0.9,
  threatBaseHealth: 30,
  threatRadius: 11,
  // Wave scaling
  waveSpeedAccel: 0.15,    // threat speed multiplier growth per wave
  waveSpeedCap: 2.5,       // cap on wave speed multiplier
  // Abilities: duration/cooldown in ticks; 0 = instant
  abilities: {
    shield: { duration: 120, cooldown: 600 },
    pulseClear: { duration: 0, cooldown: 900, radius: 180, damage: 40 },
    speedBurst: { duration: 90, cooldown: 450, factor: 2.0, threatSlowFactor: 0.5 },
    scoreMultiplier: { duration: 150, cooldown: 750, factor: 2 },
    repair: { duration: 0, cooldown: 500, amount: 40 },
  },
  spawnInterval: 45,       // base ticks between spawns (scaled by wave)
}
