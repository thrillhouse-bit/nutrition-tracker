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
export function advanceWave(state) {
  if (!waveComplete(state) || state.status !== 'running') return state
  const { finalWave } = state.config
  if (finalWave !== null && state.wave >= finalWave) {
    return { ...state, status: 'won' }
  }
  const nextWave = state.wave + 1
  return {
    ...state,
    wave: nextWave,
    threatsRemainingInWave: threatsForWave(nextWave, state.config),
  }
}
