// Wave difficulty curves. Pure functions of (wave, config) so the same wave
// number always yields the same difficulty — no hidden counters.
export function waveSpeedMultiplier(wave, config) {
  const raw = 1 + (wave - 1) * config.waveSpeedAccel
  return Math.min(raw, config.waveSpeedCap)
}

export function threatsForWave(wave, config) {
  return config.baseThreatsPerWave + (wave - 1) * config.threatsPerWaveGrowth
}

// A wave is complete when every threat it spawned is gone (cleared or crashed).
export function waveComplete(state) {
  return state.threatsRemainingInWave === 0 && state.threats.length === 0
}

// Advance to the next wave, or win the shift if the final wave was just
// cleared. Not applicable while threats remain — returns state unchanged.
// Upon winning, unlock the next god tier and award a token bonus.
export function advanceWave(state) {
  if (!waveComplete(state) || state.status !== 'running') return state
  const { finalWave } = state.config
  if (finalWave !== null && state.wave >= finalWave) {
    // Survived all waves — unlock next tier and award tokens
    const currentTier = state.unlockedTier || 1
    const nextTier = Math.min(currentTier + 1, 3)
    const tokenBonus = nextTier > currentTier ? 7 : 3
    return {
      ...state,
      status: 'won',
      unlockedTier: nextTier,
      tokenUsage: (state.tokenUsage || 0) + tokenBonus,
    }
  }
  const nextWave = state.wave + 1
  // Increment token usage every 3 waves as a reward
  const tokenReward = nextWave % 3 === 0 ? 1 : 0
  return {
    ...state,
    wave: nextWave,
    threatsRemainingInWave: threatsForWave(nextWave, state.config),
    tokenUsage: (state.tokenUsage || 0) + tokenReward,
  }
}
