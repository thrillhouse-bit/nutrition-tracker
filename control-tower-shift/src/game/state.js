import { DEFAULT_CONFIG } from './config.js'
import { threatsForWave, waveSpeedMultiplier, advanceWave } from './waves.js'
import { threatsHittingTower, distance } from './collision.js'
import { abilityActive, threatSpeedScale } from './abilities.js'

// Ability specs merge PER ABILITY, not as one map. Spreading the map alone
// let a partial override ({shield: {duration: 60}}) replace the whole spec,
// dropping `cooldown` — activateAbility then wrote cooldownUntil: NaN, every
// `tick >= NaN` read false, and the ability fired once and was dead for the
// rest of the shift with nothing thrown. The house failure mode exactly:
// reporting success while doing nothing. Names come from both sides so an
// override may still add an ability the defaults don't carry.
function mergeAbilities(overrides = {}) {
  const names = new Set([...Object.keys(DEFAULT_CONFIG.abilities), ...Object.keys(overrides)])
  return Object.fromEntries(
    [...names].map((name) => [
      name,
      { ...(DEFAULT_CONFIG.abilities[name] || {}), ...(overrides[name] || {}) },
    ]),
  )
}

export function createInitialState(configOverrides = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...configOverrides,
    abilities: mergeAbilities(configOverrides.abilities),
  }
  return {
    status: 'running',
    tick: 0,
    score: 0,
    wave: 1,
    integrity: config.maxIntegrity,
    threats: [],
    threatsRemainingInWave: threatsForWave(1, config),
    abilities: {},
    config,
  }
}

// Spawning is the caller's concern (it decides where and when, typically from
// a seeded RNG) so the core stays deterministic. Spawns count against the
// wave's remaining budget.
export function spawnThreat(state, { id, x, y, vx, vy, radius = 10 }) {
  if (state.status !== 'running') return state
  return {
    ...state,
    threats: [...state.threats, { id, x, y, vx, vy, radius }],
  }
}

// One deterministic simulation step: move threats, resolve tower impacts,
// expire nothing (ability expiry is a pure read on tick), advance wave/status.
export function advanceTick(state, dt = 1) {
  if (state.status !== 'running') return state

  const speed = waveSpeedMultiplier(state.wave, state.config) * threatSpeedScale(state)
  // Read the shield from the PRE-step tick, the same convention threatSpeedScale
  // uses one line above. Reading it off `next` compared the post-increment tick
  // against activeUntil, so a hit landing on the step out of the shield's last
  // active tick dealt full damage while the HUD — which reads the rest tick —
  // still said "Shield up". Two conventions in one function; this is now one.
  const shielded = abilityActive(state, 'shield')
  const moved = state.threats.map((t) => ({
    ...t,
    x: t.x + t.vx * speed * dt,
    y: t.y + t.vy * speed * dt,
  }))

  let next = { ...state, tick: state.tick + dt, threats: moved }

  // Tower-relative, not origin-relative: collision.js and pulseClear both honour
  // config.towerX/towerY, so an origin-measured cull silently deleted threats
  // closing on a displaced tower (no damage, wave budget consumed).
  const tower = { x: next.config.towerX, y: next.config.towerY }
  const escaped = next.threats.filter(
    (t) => distance(t, tower) > next.config.escapeRadius,
  )
  if (escaped.length > 0) {
    const goneIds = new Set(escaped.map((t) => t.id))
    next = {
      ...next,
      threats: next.threats.filter((t) => !goneIds.has(t.id)),
      threatsRemainingInWave: Math.max(0, next.threatsRemainingInWave - escaped.length),
    }
  }

  const hits = threatsHittingTower(next)
  if (hits.length > 0) {
    const hitIds = new Set(hits.map((t) => t.id))
    next = {
      ...next,
      threats: next.threats.filter((t) => !hitIds.has(t.id)),
      threatsRemainingInWave: Math.max(0, next.threatsRemainingInWave - hits.length),
    }
    if (!shielded) {
      next = {
        ...next,
        integrity: Math.max(0, next.integrity - hits.length * next.config.collisionDamage),
      }
    }
  }

  if (next.integrity <= 0) return { ...next, status: 'failed' }
  return advanceWave(next)
}

export function checkEndState(state) {
  if (state.integrity <= 0) return 'failed'
  if (
    state.config.finalWave !== null &&
    state.wave >= state.config.finalWave &&
    state.threatsRemainingInWave === 0 &&
    state.threats.length === 0
  ) {
    return 'won'
  }
  return null
}

export function pause(state) {
  return state.status === 'running' ? { ...state, status: 'paused' } : state
}

export function resume(state) {
  return state.status === 'paused' ? { ...state, status: 'running' } : state
}

export function restart(state) {
  return createInitialState(state.config)
}
