import { DEFAULT_CONFIG } from './config.js'
import { levelForIndex, encounterSize, levelComplete, advanceLevel, CAMPAIGN_LENGTH } from './campaign.js'
import { distance, circlesCollide } from './collision.js'
import { clearPoints, addScore } from './scoring.js'
import {
  castPower,
  deitySpeedScale,
  deityDamageScale,
  threatSpeedScale,
  healPerTick,
  riverDamagePerTick,
  riverRadius,
  deityInvulnerable,
  spawnProjectile,
  powersForGod,
} from './powers.js'

// ─── GAME STATE ────────────────────────────────────────────────
// Arena campaign model: the player controls a deity through authored levels,
// using deity powers + a deliberate melee strike. Monsters pursue the deity.
// Pure functions — every export takes state, returns new state.

// Deterministic per-threat "wander" direction for confused beasts: hashed from
// the threat id + tick so no RNG ever enters the simulation.
function wanderAngle(id, tick) {
  let h = 0
  const s = String(id) + ':' + tick
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 628) / 100
}

export function createInitialState(configOverrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides }
  const god = configOverrides.god || config.god || null
  const first = levelForIndex(0)
  // Atlas's passive: shoulders that hold the sky grant more health.
  const baseHealth = config.deityBaseHealth * (god === 'atlas' ? 1.5 : 1)
  return {
    status: 'running',
    tick: 0,
    score: 0,
    levelIndex: 0,
    wave: 1, // internal pacing only — never player-facing
    deity: {
      x: 0, y: 0,
      health: baseHealth,
      maxHealth: baseHealth,
      invulnUntil: 0,
      armored: god === 'atlas',
    },
    input: {
      moveX: 0, moveY: 0,
      aimX: 0, aimY: -1,
      firing: false, // a fire button is held (pointer/touch)
    },
    threats: [],
    threatsRemainingInLevel: encounterSize(first),
    projectiles: [],
    powerState: {},
    gate: null,
    nextAutoAttack: 0,
    config,
    god,
    loadout: powersForGod(god),
    unlockedTier: 1,
    tokenUsage: 0,
  }
}

// Apply a god's passive once at selection (currently only Atlas).
export function applyDeityPassive(state, god) {
  if (!god || god === state.god) return state
  const cfg = state.config
  const base = cfg.deityBaseHealth * (god === 'atlas' ? 1.5 : 1)
  return {
    ...state,
    god,
    deity: {
      ...state.deity,
      maxHealth: base,
      health: base,
      armored: god === 'atlas',
    },
  }
}

// Spawn a monster from the spawner output. Story-variant fields (storyVariantId,
// name, elite stats, damageMult) are passed through additively when present so
// an RPG-local elite overlay can ride on canonical monster behavior without
// mutating the shared monster registries. Non-overlaid threats are unchanged.
export function spawnThreat(state, opts = {}) {
  if (state.status !== 'running') return state
  const { arenaRadius, threatRadius, threatBaseSpeed, threatBaseHealth } = state.config
  const t = {
    id: opts.id !== undefined ? opts.id : state.tick,
    x: opts.x !== undefined ? opts.x : Math.cos(opts.angle || 0) * arenaRadius,
    y: opts.y !== undefined ? opts.y : Math.sin(opts.angle || 0) * arenaRadius,
    vx: opts.vx || 0,
    vy: opts.vy || 0,
    radius: opts.radius || threatRadius,
    health: opts.health || threatBaseHealth,
    maxHealth: opts.health || threatBaseHealth,
    // Optional authored baseline for progression attribution. Arena health can
    // be encounter-tuned for accessibility without lowering earned XP.
    progressionHealth: opts.progressionHealth || opts.health || threatBaseHealth,
    speed: opts.speed || threatBaseSpeed,
    monsterType: opts.monsterType || 'hydra',
    glyph: opts.glyph || 'hydra',
    behavior: opts.behavior || 'default',
  }
  // Additive story-variant passthrough (elite overlay marker + tuned stats).
  if (opts.storyVariantId) t.storyVariantId = opts.storyVariantId
  if (opts.name) t.name = opts.name
  if (opts.damageMult != null) t.damageMult = opts.damageMult
  if (opts.armorMult != null) t.armorMult = opts.armorMult
  return { ...state, threats: [...state.threats, t] }
}

// ─── SIMULATION STEP ───────────────────────────────────────────
export function advanceTick(state, dt = 1) {
  if (state.status !== 'running') return state
  const g = state
  const cfg = g.config
  let next = { ...g, tick: g.tick + dt }

  // ── 1. Move deity ──
  const moveSpeed = cfg.deitySpeed * deitySpeedScale(next)
  const nx = next.deity.x + next.input.moveX * moveSpeed * dt
  const ny = next.deity.y + next.input.moveY * moveSpeed * dt
  const dist = Math.hypot(nx, ny)
  const maxR = cfg.arenaRadius - cfg.deityRadius
  if (dist > maxR && dist > 0) {
    const s = maxR / dist
    next.deity = { ...next.deity, x: nx * s, y: ny * s }
  } else {
    next.deity = { ...next.deity, x: nx, y: ny }
  }
  if (next.input.moveX !== 0 || next.input.moveY !== 0) {
    next.deity = { ...next.deity, facing: Math.atan2(next.input.moveY, next.input.moveX) }
  }

  // Passive heal (demeter's harvest moon)
  const heal = healPerTick(next)
  if (heal > 0 && next.deity.health < next.deity.maxHealth) {
    next.deity = { ...next.deity, health: Math.min(next.deity.maxHealth, next.deity.health + heal) }
  }

  // ── 2. Move projectiles ──
  next.projectiles = next.projectiles
    .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt }))
    .filter((p) => Math.hypot(p.x, p.y) < cfg.arenaRadius + 50)

  // ── 3. Move threats (status-aware pursuit) ──
  const slow = threatSpeedScale(next)
  const gate = next.gate
  next.threats = next.threats.map((t) => {
    const d = next.deity
    // Oceanus's world river wears down anyone in the ring.
    if (riverDamagePerTick(next) > 0 && distance(t, d) <= riverRadius(next) + t.radius) {
      t = { ...t, health: t.health - riverDamagePerTick(next) }
    }
    // Prometheus's fire brand burns.
    if (t.burningUntil && next.tick < t.burningUntil) {
      t = { ...t, health: t.health - (t.burnDps || 0) }
    }
    let dx = d.x - t.x
    let dy = d.y - t.y
    let dd = Math.hypot(dx, dy)
    // Gate of the Dead: drag toward the gate origin.
    if (t.pulledUntil && next.tick < t.pulledUntil && gate && gate.until > next.tick) {
      dx = gate.x - t.x
      dy = gate.y - t.y
      dd = Math.hypot(dx, dy)
    } else if (t.charmedUntil && next.tick < t.charmedUntil) {
      // Charmed beasts recoil — away from the deity.
      dx = t.x - d.x
      dy = t.y - d.y
      dd = Math.hypot(dx, dy)
    } else if (t.confusedUntil && next.tick < t.confusedUntil) {
      const a = wanderAngle(t.id, next.tick)
      dx = Math.cos(a)
      dy = Math.sin(a)
      dd = 1
    } else if (t.blindedUntil && next.tick < t.blindedUntil) {
      dx = 0
      dy = 0
      dd = 0
    }
    if (dd <= 0) return { ...t, vx: 0, vy: 0 }
    const aimSpd = (t.speed || cfg.threatBaseSpeed) * slow
    return {
      ...t,
      vx: (dx / dd) * aimSpd,
      vy: (dy / dd) * aimSpd,
      x: t.x + (dx / dd) * aimSpd * dt,
      y: t.y + (dy / dd) * aimSpd * dt,
    }
  })

  // ── 4. Projectile hits ──
  for (const proj of next.projectiles) {
    for (const t of next.threats) {
      if (circlesCollide(proj, t)) {
        const dmg = Math.round(proj.damage * deityDamageScale(next))
        next.threats = next.threats.map((tt) => (tt.id === t.id ? { ...tt, health: tt.health - dmg } : tt))
        next.projectiles = next.projectiles.filter((p) => p.id !== proj.id)
        break
      }
    }
  }

  // ── 5. Threats hit the deity, then recoil. They are not defeated merely by
  // touching the player, so an unattended campaign cannot clear itself.
  const hits = next.threats.filter((t) =>
    distance(t, next.deity) < cfg.deityRadius + t.radius &&
    next.tick >= (t.contactCooldownUntil || 0),
  )
  if (hits.length > 0) {
    const hitIds = new Set(hits.map((t) => t.id))
    next.threats = next.threats.map((t) => {
      if (!hitIds.has(t.id)) return t
      let dx = t.x - next.deity.x
      let dy = t.y - next.deity.y
      let mag = Math.hypot(dx, dy)
      if (mag < 0.001) {
        const angle = wanderAngle(t.id, next.tick)
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        mag = 1
      }
      const separation = cfg.deityRadius + t.radius + cfg.threatKnockback
      return {
        ...t,
        x: next.deity.x + (dx / mag) * separation,
        y: next.deity.y + (dy / mag) * separation,
        contactCooldownUntil: next.tick + cfg.threatContactCooldown,
      }
    })
    if (!deityInvulnerable(next)) {
      let dmg = cfg.threatDamage * hits.length
      if (next.deity.armored) dmg = Math.round(dmg * 0.8)
      next.deity = { ...next.deity, health: Math.max(0, next.deity.health - dmg) }
    }
  }

  // ── 6. Remove dead threats + score kills ──
  const alive = next.threats.filter((t) => t.health > 0)
  const kills = next.threats.length - alive.length
  next = { ...next, threats: alive }
  if (kills > 0) {
    next = addScore(next, clearPoints(g, { ability: 'kill' }) * kills)
    next.threatsRemainingInLevel = Math.max(0, next.threatsRemainingInLevel - kills)
  }

  // ── 7. Threat escapes (left the arena) ──
  const escaped = next.threats.filter((t) => distance(t, { x: 0, y: 0 }) > cfg.arenaRadius)
  if (escaped.length > 0) {
    const gone = new Set(escaped.map((t) => t.id))
    next.threats = next.threats.filter((t) => !gone.has(t.id))
    next.threatsRemainingInLevel = Math.max(0, next.threatsRemainingInLevel - escaped.length)
  }

  // ── 8. Fail first — death trumps advancement ──
  if (next.deity.health <= 0) return { ...next, status: 'failed' }

  // ── 9. Level progression ──
  if (next.status === 'running' && levelComplete(next)) {
    return advanceLevel(next)
  }
  return next
}

// ─── Input ─────────────────────────────────────────────────────
export function setInput(state, moveX = 0, moveY = 0) {
  return { ...state, input: { ...state.input, moveX, moveY } }
}

export function setAim(state, aimX, aimY) {
  return { ...state, input: { ...state.input, aimX, aimY } }
}

export function setFiring(state, firing) {
  return { ...state, input: { ...state.input, firing: Boolean(firing) } }
}

// ─── Combat helpers ────────────────────────────────────────────
export function deityAttack(state) {
  if (state.status !== 'running') return state
  const cfg = state.config
  const range = cfg.deityRadius + cfg.autoAttackRange + cfg.threatRadius
  const target = state.threats.find((t) => distance(t, state.deity) < range)
  if (!target) return state
  if (state.tick < (state.nextAutoAttack || 0)) return state
  const dmg = Math.round(cfg.autoAttackDamage * deityDamageScale(state))
  let next = {
    ...state,
    nextAutoAttack: state.tick + cfg.autoAttackCooldown,
    threats: state.threats.map((t) => (t.id === target.id ? { ...t, health: t.health - dmg } : t)),
  }
  const killed = next.threats.find((t) => t.id === target.id)
  if (killed && killed.health <= 0) {
    next = addScore(next, clearPoints(state, { auto: true }))
    next.threats = next.threats.filter((t) => t.health > 0)
    next.threatsRemainingInLevel = Math.max(0, next.threatsRemainingInLevel - 1)
  }
  return next
}

// Cast a deity power toward an aim point. The dispatch (cooldowns, effect
// routing, token metering) lives in powers.js.
export function castPowerOn(state, powerId, aimX, aimY) {
  return castPower(state, powerId, aimX, aimY)
}

export { spawnProjectile }

// ─── Pause / Resume / Restart ──────────────────────────────────
export function pause(state) {
  return state.status === 'running' ? { ...state, status: 'paused' } : state
}

export function resume(state) {
  return state.status === 'paused' ? { ...state, status: 'running' } : state
}

// Restart the whole campaign from level 1, keeping the chosen deity + unlocks.
export function restart(state) {
  const fresh = createInitialState({ ...state.config, god: state.god })
  return {
    ...fresh,
    unlockedTier: state.unlockedTier || 1,
    tokenUsage: state.tokenUsage || 0,
  }
}

// Replay just the current level (used from the level-complete / defeat UI).
export function restartLevel(state) {
  const levelIdx = state.status === 'won' ? 0 : state.levelIndex
  const fresh = createInitialState({ ...state.config, god: state.god })
  return {
    ...fresh,
    levelIndex: Math.min(levelIdx, CAMPAIGN_LENGTH - 1),
    threatsRemainingInLevel: encounterSize(levelForIndex(levelIdx)),
    unlockedTier: state.unlockedTier || 1,
    tokenUsage: state.tokenUsage || 0,
  }
}
