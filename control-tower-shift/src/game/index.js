export { DEFAULT_CONFIG } from './config.js'
export { CAMPAIGN, CAMPAIGN_LENGTH, levelForIndex, levelById, encounterSize, levelComplete, advanceLevel, objectiveProgress } from './campaign.js'
export {
  createInitialState,
  applyDeityPassive,
  spawnThreat,
  advanceTick,
  setInput,
  setAim,
  setFiring,
  deityAttack,
  castPowerOn,
  pause, resume, restart, restartLevel,
} from './state.js'
export { circlesCollide, distance, detectCollisions } from './collision.js'
export { clearPoints, addScore, clearThreat } from './scoring.js'
export {
  POWER_DEFS,
  DEITY_LOADOUT,
  powersForGod,
  powerActive,
  powerReady,
  castPower,
  spawnProjectile,
  deitySpeedScale,
  deityDamageScale,
  threatSpeedScale,
  healPerTick,
  riverDamagePerTick,
  deityInvulnerable,
} from './powers.js'
export { loadHighScores, saveHighScore, isHighScore, HIGH_SCORE_KEY } from './persistence.js'
export { drawGlyph, GODS, GODS_TIER_1, GODS_TIER_2, GODS_TIER_3, GODS_BY_TIER, MONSTER_TYPES, MONSTER_DEPRECATED, resolveMonsterType, ABILITY_GLYPHS } from './characters.js'
export { createSpawner, mulberry32, FIELD_RADIUS, stepSpawner } from '../spawner.js'
