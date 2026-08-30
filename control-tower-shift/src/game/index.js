export { DEFAULT_CONFIG } from './config.js'
export {
  createInitialState,
  spawnThreat,
  advanceTick,
  pause,
  resume,
  restart,
} from './state.js'
export { circlesCollide, distance, detectCollisions, threatsHittingTower } from './collision.js'
export { waveSpeedMultiplier, threatsForWave, waveComplete, advanceWave } from './waves.js'
export { clearPoints, addScore, clearThreat } from './scoring.js'
export {
  abilityActive,
  abilityReady,
  activateAbility,
  threatSpeedScale,
} from './abilities.js'
export { loadHighScores, saveHighScore, isHighScore, HIGH_SCORE_KEY } from './persistence.js'
