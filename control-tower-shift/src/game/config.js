// All tunables in one place so tests and the future UI read the same numbers.
// Arena campaign: the player controls a deity moving through authored levels,
// using deity powers and a deliberate melee strike to clear each level's encounter.
export const DEFAULT_CONFIG = {
  // Arena
  arenaRadius: 280,        // playable area radius in logical px
  // Player (deity) properties
  deityRadius: 15,         // collision radius for the deity
  deitySpeed: 1.9,         // logical px per tick (base)
  deityBaseHealth: 100,    // max health per deity (Atlas passive raises it)
  // Combat
  autoAttackRange: 46,     // melee range (deity radius + weapon reach)
  autoAttackDamage: 16,    // damage per auto-attack
  autoAttackCooldown: 20,  // ticks between auto-attacks
  pointsPerClear: 10,      // points for clearing one threat
  projectileSpeed: 5.5,    // ranged power projectile speed
  projectileRadius: 5,     // collision radius for projectiles
  projectileDamage: 22,    // solar bow shot damage
  threatDamage: 10,        // contact damage; several attackers can still punish standing still
  threatContactCooldown: 75, // ticks before the same monster can hit again
  threatKnockback: 95,     // logical px pushed away after contacting the deity
  // Powers (shared numeric tuning — the definitions live in powers.js)
  powerDamage: 24,            // bow-type power damage
  powerBurstRadius: 130,      // radiant burst blast radius
  powerBurstDamage: 45,       // radiant burst damage
  powerPulseRadius: 175,      // war cry / earthshaker radius
  powerPulseDamage: 40,       // war cry / earthshaker damage
  powerStrikeDamage: 60,      // thunderbolt primary strike
  powerChainRadius: 120,      // thunderbolt / love arrow chain range
  powerChainDamage: 40,       // thunderbolt chain damage
  powerHeal: 40,              // queens grace heal
  powerBurnDps: 5,            // fire brand burn per tick
  worldRiverRadius: 135,      // oceanus ring radius
  worldRiverDps: 12,          // oceanus damage per tick
  harvestMoonHeal: 1,         // demeter heal per tick
  wingedStrideFactor: 1.9,    // hermes speed multiplier
  herosWrathFactor: 2,        // hercules damage multiplier
  primordialDarkFactor: 0.4,  // nyx global threat slow
  // Threat (monster) base stats — scaled per level
  threatBaseSpeed: 0.85,
  threatBaseHealth: 30,
  threatRadius: 11,
  // Per-level internal pacing (never player-facing)
  levelSpeedAccel: 0.12,   // threat speed growth per level
  levelSpeedCap: 2.0,      // cap on the level speed multiplier
}
