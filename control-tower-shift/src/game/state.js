import { DEFAULT_CONFIG } from './config.js'
import { threatsForWave, advanceWave } from './waves.js'
import { distance, circlesCollide } from './collision.js'
import { abilityActive, abilityReady, deitySpeedScale, activateAbility } from './abilities.js'
import { clearPoints, addScore } from './scoring.js'

// ─── GAME STATE ────────────────────────────────────────────────
// Arena combat model: the player controls a deity that moves around
// the arena and fights waves of monsters. Monsters pursue the deity.
// Pure functions — every export takes state, returns new state.

export function createInitialState(configOverrides = {}) {
  // Deep-merge ability specs: a partial override like { shield: { duration: 60 } }
  // must keep the unspecified fields (cooldown etc.) and leave other abilities
  // untouched. A shallow spread would replace the whole abilities object.
  const config = { ...DEFAULT_CONFIG, ...configOverrides }
  if (configOverrides.abilities) {
    config.abilities = { ...DEFAULT_CONFIG.abilities }
    for (const [name, spec] of Object.entries(configOverrides.abilities)) {
      config.abilities[name] = { ...(DEFAULT_CONFIG.abilities[name] || {}), ...spec }
    }
  }
  return {
    status: 'running',
    tick: 0,
    score: 0,
    wave: 1,
    // Player-controlled deity
    deity: {
      x: 0, y: 0,           // position (center of arena)
      health: config.deityBaseHealth,
      maxHealth: config.deityBaseHealth,
      facing: 0,             // radians — direction deity faces (for rendering)
    },
    // Input state (set by render layer)
    input: {
      moveX: 0, moveY: 0,   // normalized movement vector
      casting: null,         // name of ability being aimed (mouse at aimX/aimY)
      aimX: 0, aimY: 0,
    },
    // Monsters
    threats: [],
    threatsRemainingInWave: threatsForWave(1, config),
    // Projectiles (from ranged abilities)
    projectiles: [],
    // Auto-attack timer
    nextAutoAttack: 0,
    // Abilities
    abilities: {},
    config,
    god: null,
    unlockedTier: 1,
    tokenUsage: 0,
  }
}

// Spawn a monster from spawner output, or create one randomly at arena edge
export function spawnThreat(state, opts = {}) {
  if (state.status !== 'running') return state
  const { arenaRadius, threatRadius, threatBaseSpeed } = state.config
  const angle = opts.angle !== undefined ? opts.angle : (opts.x !== undefined ? Math.atan2(opts.y, opts.x) : Math.random() * Math.PI * 2)
  const r = arenaRadius
  const t = {
    id: opts.id !== undefined ? opts.id : state.tick,
    x: opts.x !== undefined ? opts.x : Math.cos(angle) * r,
    y: opts.y !== undefined ? opts.y : Math.sin(angle) * r,
    vx: opts.vx || 0,
    vy: opts.vy || 0,
    radius: opts.radius || threatRadius,
    health: opts.health || state.config.threatBaseHealth,
    maxHealth: opts.health || state.config.threatBaseHealth,
    speed: opts.speed || threatBaseSpeed,
    monsterType: opts.monsterType || 'hydra',
    glyph: opts.glyph || 'hydra',
    behavior: opts.behavior || 'default',
  }
  return { ...state, threats: [...state.threats, t] }
}

// Fire a projectile from the deity toward a target position
export function spawnProjectile(state, name, aimX, aimY) {
  const d = state.deity
  const dx = aimX - d.x
  const dy = aimY - d.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return state
  return {
    ...state,
    projectiles: [
      ...state.projectiles,
      {
        id: state.tick + state.projectiles.length,
        x: d.x, y: d.y,
        vx: (dx / dist) * state.config.projectileSpeed,
        vy: (dy / dist) * state.config.projectileSpeed,
        radius: state.config.projectileRadius,
        damage: state.config.abilities[name]?.damage || 25,
        ability: name,
      },
    ],
  }
}

// ─── SIMULATION STEP ───────────────────────────────────────────
export function advanceTick(state, dt = 1) {
  if (state.status !== 'running') return state

  const g = state
  const cfg = g.config

  let next = { ...g, tick: g.tick + dt }

  // ── 1. Move deity (Hades-style: you control the god directly) ──
  const moveSpeed = cfg.deitySpeed * deitySpeedScale(next)
  const mx = next.input.moveX * moveSpeed * dt
  const my = next.input.moveY * moveSpeed * dt
  const nx = next.deity.x + mx
  const ny = next.deity.y + my
  // Clamp to arena
  const dist = Math.hypot(nx, ny)
  if (dist > cfg.arenaRadius - cfg.deityRadius) {
    if (dist > 0) {
      const scale = (cfg.arenaRadius - cfg.deityRadius) / dist
      next.deity = { ...next.deity, x: nx * scale, y: ny * scale }
    }
  } else {
    next.deity = { ...next.deity, x: nx, y: ny }
  }
  // Track facing direction
  if (next.input.moveX !== 0 || next.input.moveY !== 0) {
    next.deity = { ...next.deity, facing: Math.atan2(next.input.moveY, next.input.moveX) }
  }

  // ── 2. Move projectiles ──
  next.projectiles = next.projectiles.map((p) => ({
    ...p,
    x: p.x + p.vx * dt,
    y: p.y + p.vy * dt,
  })).filter((p) => {
    // Remove if it flies off the arena
    const d = Math.hypot(p.x, p.y)
    return d < cfg.arenaRadius + 50
  })

  // ── 3. Move threats (they chase the deity) ──
  next.threats = next.threats.map((t) => {
    // Re-aim toward the deity's CURRENT position each tick
    const dx = next.deity.x - t.x
    const dy = next.deity.y - t.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0) {
      const aimSpd = t.speed || cfg.threatBaseSpeed
      return {
        ...t,
        vx: (dx / dist) * aimSpd,
        vy: (dy / dist) * aimSpd,
        x: t.x + (dx / dist) * aimSpd * dt,
        y: t.y + (dy / dist) * aimSpd * dt,
      }
    }
    return t
  })

  // ── 4. Auto-attack: if a monster is in melee range and cooldown ready ──
  if (g.tick >= g.nextAutoAttack) {
    const meleeRange = cfg.deityRadius + cfg.autoAttackRange
    const nearby = next.threats.find((t) => distance(t, next.deity) < meleeRange + t.radius)
    if (nearby) {
      const perThreat = clearPoints(g, { auto: true })
      next = addScore(next, perThreat)
      next.threats = next.threats.map((t) =>
        t.id === nearby.id
          ? { ...t, health: t.health - cfg.autoAttackDamage, maxHealth: t.maxHealth }
          : t
      )
      next.nextAutoAttack = g.tick + cfg.autoAttackCooldown
    }
  }

  // ── 5. Projectile hits ──
  for (const proj of next.projectiles) {
    for (const t of next.threats) {
      if (circlesCollide(proj, t)) {
        const perThreat = clearPoints(g, { ability: proj.ability })
        next = addScore(next, perThreat)
        next.threats = next.threats.map((tt) =>
          tt.id === t.id
            ? { ...tt, health: tt.health - proj.damage, maxHealth: tt.maxHealth }
            : tt
        )
        next.projectiles = next.projectiles.filter((p) => p.id !== proj.id)
        break
      }
    }
  }

  // ── 6. Threats hit the deity ──
  const hits = next.threats.filter((t) => distance(t, next.deity) < cfg.deityRadius + t.radius)
  if (hits.length > 0) {
    // Shield check uses the PRE-step tick: a shield active on the last tick
    // of its window still protects on the step out of it.
    const hasShield = abilityActive(g, 'shield')
    // Only one hit per tick (tick-invulnerability window)
    if (!hasShield) {
      next.deity = {
        ...next.deity,
        health: Math.max(0, next.deity.health - cfg.threatDamage),
      }
    }
    // Hitting threats are consumed (destroyed on impact)
    const hitIds = new Set(hits.map((t) => t.id))
    next.threats = next.threats.filter((t) => !hitIds.has(t.id))
    next.threatsRemainingInWave = Math.max(0, next.threatsRemainingInWave - hits.length)
  }

  // ── 7. Remove dead threats ──
  next.threats = next.threats.filter((t) => t.health > 0)

  // ── 8. Threat escapes (left arena) ──
  const escaped = next.threats.filter((t) => distance(t, { x: 0, y: 0 }) > cfg.arenaRadius)
  if (escaped.length > 0) {
    const goneIds = new Set(escaped.map((t) => t.id))
    next.threats = next.threats.filter((t) => !goneIds.has(t.id))
    next.threatsRemainingInWave = Math.max(0, next.threatsRemainingInWave - escaped.length)
  }

  // ── 9. Check fail first — death trumps wave advancement ──
  if (next.deity.health <= 0) {
    return { ...next, status: 'failed' }
  }

  // ── 10. Wave progression ──
  // (Spawning is handled by the deterministic spawner in stepFrame/loop.js,
  // not here — advanceTick is pure game logic.)
  if (next.threats.length === 0 && next.threatsRemainingInWave <= 0 && next.status === 'running') {
    return advanceWave(next)
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

export function startCasting(state, abilityName) {
  return { ...state, input: { ...state.input, casting: abilityName } }
}

export function stopCasting(state) {
  return { ...state, input: { ...state.input, casting: null } }
}

// ─── Combat helpers ────────────────────────────────────────────
export function deityAttack(state) {
  if (state.status !== 'running') return state
  const cfg = state.config
  const range = cfg.deityRadius + cfg.autoAttackRange + cfg.threatRadius
  const target = state.threats.find((t) => distance(t, state.deity) < range)
  if (!target) return state
  if (state.tick < (state.nextAutoAttack || 0)) return state

  let next = {
    ...state,
    nextAutoAttack: state.tick + cfg.autoAttackCooldown,
    threats: state.threats.map((t) =>
      t.id === target.id ? { ...t, health: t.health - cfg.autoAttackDamage } : t
    ),
  }

  // Score only on the kill
  const killed = next.threats.find((t) => t.id === target.id)
  if (killed && killed.health <= 0) {
    next = addScore(next, clearPoints(state, { auto: true }))
    next.threats = next.threats.filter((t) => t.health > 0)
    next.threatsRemainingInWave = Math.max(0, next.threatsRemainingInWave - 1)
  }

  return next
}

export function castAbility(state, abilityName, aimX, aimY) {
  if (state.status !== 'running') return state
  const spec = state.config.abilities[abilityName]
  if (!spec) return state
  if (!abilityReady(state, abilityName)) return state

  // All ability effects (shield, pulseClear, repair, etc.) are applied by
  // activateAbility in abilities.js — castAbility just handles aim for
  // future projectile abilities and token metering.
  let next = activateAbility(state, abilityName)
  if (next === state) return state // not ready / failed
  next = { ...next, tokenUsage: (next.tokenUsage || 0) + 1 }
  return next
}

// ─── Pause / Resume / Restart ──────────────────────────────────
export function pause(state) {
  return state.status === 'running' ? { ...state, status: 'paused' } : state
}

export function resume(state) {
  return state.status === 'paused' ? { ...state, status: 'running' } : state
}

export function restart(state) {
  const fresh = createInitialState(state.config)
  return {
    ...fresh,
    unlockedTier: state.unlockedTier || 1,
    tokenUsage: state.tokenUsage || 0,
    god: state.god || 'apollo',
  }
}
