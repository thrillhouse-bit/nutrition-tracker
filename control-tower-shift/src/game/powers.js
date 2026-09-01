// Deity powers — typed, data-driven unique abilities.
//
// Every deity in the roster has its own myth-grounded power definition
// (name, description, kind, cooldown, duration) and a deterministic gameplay
// effect. Effects are pure functions over game state: no RNG, no time reads,
// no DOM — the same (state, aim) always yields the same next state, which is
// what makes each power unit-testable.
//
// Apollo's kit is the arena slice's showcase: solarBow (luminous arrow
// projectile), radiantBurst (area mark at an aim point), goldenLyre (tempo —
// faster bow + bonus score). Other deities share the arena renderer but their
// signature power works in the simulation and is selectable/testable.
//
// Phase B (story RPG) reuses power IDs as the stable ability contracts.

import { distance } from './collision.js'
import { clearPoints, addScore } from './scoring.js'

// ─── Definition type ───────────────────────────────────────────
// kind: 'active' (player casts it) | 'passive' (always on, god-gated)
// duration: ticks of the effect window; cooldown: ticks until ready again.
// 0 duration = instant effect (still sets a cooldown).
export const POWER_DEFS = {
  // ── Apollo — the three HUD powers ─────────────────────────────
  solarBow: {
    id: 'solarBow', deity: 'apollo', name: 'Solar Bow', kind: 'active',
    cooldown: 22, duration: 0, tags: ['projectile', 'ranged'],
    description: 'Loose a blazing arrow at your aim point. Shots land fast and true.',
  },
  radiantBurst: {
    id: 'radiantBurst', deity: 'apollo', name: 'Radiant Burst', kind: 'active',
    cooldown: 130, duration: 0, tags: ['area', 'aimed'],
    description: 'Scorch the ground at your aim point — a burst that burns everything in its light.',
  },
  goldenLyre: {
    id: 'goldenLyre', deity: 'apollo', name: 'Golden Lyre', kind: 'active',
    cooldown: 300, duration: 150, tags: ['tempo', 'buff'],
    description: 'Strike a chord of tempo: the bow cools down faster and every clear earns double.',
  },
  // ── Tier 1 ───────────────────────────────────────────────────
  wingedStride: {
    id: 'wingedStride', deity: 'hermes', name: 'Winged Stride', kind: 'active',
    cooldown: 200, duration: 60, tags: ['mobility'],
    description: 'Herald-born speed — move twice as fast while it lasts.',
  },
  aegisWard: {
    id: 'aegisWard', deity: 'athena', name: 'Aegis Ward', kind: 'active',
    cooldown: 300, duration: 120, tags: ['defense'],
    description: 'Raise the aegis and turn aside all harm for a time.',
  },
  warCry: {
    id: 'warCry', deity: 'ares', name: 'War Cry', kind: 'active',
    cooldown: 220, duration: 0, tags: ['area'],
    description: 'A bellow that shatters the air — damage every beast within reach.',
  },
  arrowStorm: {
    id: 'arrowStorm', deity: 'artemis', name: 'Arrow Storm', kind: 'active',
    cooldown: 300, duration: 0, tags: ['projectile', 'spread'],
    description: 'Three silver shafts in a fan toward your aim.',
  },
  bewilder: {
    id: 'bewilder', deity: 'aphrodite', name: 'Bewilder', kind: 'active',
    cooldown: 280, duration: 90, tags: ['control'],
    description: 'Cloud the nearest foe’s mind — it recoils instead of attacking.',
  },
  herosWrath: {
    id: 'herosWrath', deity: 'hercules', name: "Hero's Wrath", kind: 'active',
    cooldown: 320, duration: 120, tags: ['buff'],
    description: 'Twelve-labour strength — every blow lands twice as hard.',
  },
  // ── Tier 2 ───────────────────────────────────────────────────
  thunderbolt: {
    id: 'thunderbolt', deity: 'zeus', name: 'Thunderbolt', kind: 'active',
    cooldown: 320, duration: 0, tags: ['strike', 'chain'],
    description: 'A bolt from the sky — it leaps from one foe to the next.',
  },
  queensGrace: {
    id: 'queensGrace', deity: 'hera', name: "Queen's Grace", kind: 'active',
    cooldown: 300, duration: 40, tags: ['heal', 'defense'],
    description: 'Restore your health and walk untouched a moment longer.',
  },
  earthshaker: {
    id: 'earthshaker', deity: 'poseidon', name: 'Earthshaker', kind: 'active',
    cooldown: 340, duration: 0, tags: ['area', 'knockback'],
    description: 'The ground heaves — nearby beasts are hurled away and hurt.',
  },
  gateOfTheDead: {
    id: 'gateOfTheDead', deity: 'hades', name: 'Gate of the Dead', kind: 'active',
    cooldown: 360, duration: 90, tags: ['control', 'damage'],
    description: 'Open a gate that drags every beast toward it and grinds them down.',
  },
  seasonalShift: {
    id: 'seasonalShift', deity: 'persephone', name: 'Seasonal Shift', kind: 'active',
    cooldown: 260, duration: 150, tags: ['buff'],
    description: 'The turn of the season — your clears bear richer fruit.',
  },
  inebriation: {
    id: 'inebriation', deity: 'dionysus', name: 'Inebriation', kind: 'active',
    cooldown: 300, duration: 100, tags: ['control'],
    description: 'A wine-soaked haze — every beast staggers and loses its way.',
  },
  harvestMoon: {
    id: 'harvestMoon', deity: 'demeter', name: 'Harvest Moon', kind: 'active',
    cooldown: 360, duration: 180, tags: ['heal', 'buff'],
    description: 'The sickle moon rises — you mend slowly and gather more per clear.',
  },
  // ── Tier 3 ───────────────────────────────────────────────────
  temporalRewind: {
    id: 'temporalRewind', deity: 'cronus', name: 'Temporal Rewind', kind: 'active',
    cooldown: 400, duration: 0, tags: ['heal'],
    description: 'Fold time back — your wounds never happened.',
  },
  sunChariot: {
    id: 'sunChariot', deity: 'helios', name: 'Sun Chariot', kind: 'active',
    cooldown: 320, duration: 120, tags: ['control', 'debuff'],
    description: 'The blinding chariot — beasts freeze in its glare and suffer double.',
  },
  lunarVeil: {
    id: 'lunarVeil', deity: 'selene', name: 'Lunar Veil', kind: 'active',
    cooldown: 240, duration: 80, tags: ['defense'],
    description: 'Vanish under the moon — nothing can reach you.',
  },
  fireBrand: {
    id: 'fireBrand', deity: 'prometheus', name: 'Fire Brand', kind: 'active',
    cooldown: 260, duration: 0, tags: ['damage', 'dot'],
    description: 'Touch the nearest beast with stolen fire — it burns on and on.',
  },
  primordialDark: {
    id: 'primordialDark', deity: 'nyx', name: 'Primordial Dark', kind: 'active',
    cooldown: 300, duration: 150, tags: ['debuff'],
    description: 'Night itself slows every beast to a crawl.',
  },
  loveArrow: {
    id: 'loveArrow', deity: 'eros', name: 'Love Arrow', kind: 'active',
    cooldown: 340, duration: 0, tags: ['control', 'damage'],
    description: 'Pierce a beast’s heart — it turns on its own kind.',
  },
  worldBearer: {
    id: 'worldBearer', deity: 'atlas', name: 'World Bearer', kind: 'passive',
    cooldown: 0, duration: 0, tags: ['defense'],
    description: 'Shoulders that hold the sky — more health, and blows land softer.',
  },
  worldRiver: {
    id: 'worldRiver', deity: 'oceanus', name: 'World River', kind: 'active',
    cooldown: 300, duration: 90, tags: ['area', 'damage'],
    description: 'The river that rings the world — it churns around you and wears beasts down.',
  },
}

// The three HUD powers for Apollo, and the signature power for every other god.
export const DEITY_LOADOUT = {
  apollo: ['solarBow', 'radiantBurst', 'goldenLyre'],
  hermes: ['wingedStride'],
  athena: ['aegisWard'],
  ares: ['warCry'],
  artemis: ['arrowStorm'],
  aphrodite: ['bewilder'],
  hercules: ['herosWrath'],
  zeus: ['thunderbolt'],
  hera: ['queensGrace'],
  poseidon: ['earthshaker'],
  hades: ['gateOfTheDead'],
  persephone: ['seasonalShift'],
  dionysus: ['inebriation'],
  demeter: ['harvestMoon'],
  cronus: ['temporalRewind'],
  helios: ['sunChariot'],
  selene: ['lunarVeil'],
  prometheus: ['fireBrand'],
  nyx: ['primordialDark'],
  eros: ['loveArrow'],
  atlas: ['worldBearer'],
  oceanus: ['worldRiver'],
}

// Powers a given god can actually cast (the HUD renders this list).
export function powersForGod(god) {
  return (DEITY_LOADOUT[god] || ['solarBow']).filter((id) => POWER_DEFS[id])
}

// A power's shared timer state lives on state.powerState[id] as
// { activeUntil, cooldownUntil } in ticks.
export function powerActive(state, id) {
  const p = state.powerState && state.powerState[id]
  return Boolean(p) && state.tick < p.activeUntil
}

export function powerReady(state, id) {
  const def = POWER_DEFS[id]
  if (!def || def.kind === 'passive') return false
  const p = state.powerState && state.powerState[id]
  return !p || state.tick >= p.cooldownUntil
}

// ─── Projectile spawn (shared by bow powers) ───────────────────
export function spawnProjectile(state, opts = {}) {
  const d = state.deity
  const dx = opts.x - d.x
  const dy = opts.y - d.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return state
  const speed = opts.speed || state.config.projectileSpeed
  const damage = opts.damage || state.config.projectileDamage
  return {
    ...state,
    projectiles: [
      ...state.projectiles,
      {
        id: `${state.tick}-${state.projectiles.length}`,
        x: d.x,
        y: d.y,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        radius: opts.radius || state.config.projectileRadius,
        damage,
        ability: opts.ability || 'shot',
        tickBorn: state.tick,
      },
    ],
  }
}

// Apply damage to every threat matching `pred`, scoring on kills. Returns the
// new state; never mutates. `kind` feeds clearPoints (ability = 1.5x).
export function damageThreats(state, pred, damage, kind = 'ability') {
  let scored = 0
  const threats = []
  for (const t of state.threats) {
    if (!pred(t)) {
      threats.push(t)
      continue
    }
    const hp = t.health - damage
    if (hp <= 0) {
      scored += clearPoints(state, { ability: kind })
    } else {
      threats.push({ ...t, health: hp })
    }
  }
  const next = scored ? addScore(state, scored) : state
  return {
    ...next,
    threats,
    threatsRemainingInLevel: Math.max(0, (next.threatsRemainingInLevel || 0) - scoredCount(state, threats, pred)),
  }
}

// Number of threats removed by a damage pass — used to decrement the level
// counter exactly once per kill.
function scoredCount(prev, threats, pred) {
  const before = prev.threats.length
  return before - threats.length
}

// Set a status on every current threat (pure).
function tagThreats(state, tag, until) {
  return {
    ...state,
    threats: state.threats.map((t) => ({ ...t, [tag]: until })),
  }
}

function nearestThreat(state, maxDist = Infinity) {
  let best = null
  let bestD = Infinity
  const d = state.deity
  for (const t of state.threats) {
    const dd = distance(t, d)
    if (dd < bestD && dd <= maxDist) {
      best = t
      bestD = dd
    }
  }
  return best
}

// ─── Effect implementations (all pure) ─────────────────────────
// Each returns the next state. Aim is { x, y } in arena coordinates.

function effect_solarBow(state, aim) {
  // Tempo (golden lyre) halves the bow's cooldown while active.
  const cooldown = powerActive(state, 'goldenLyre') ? Math.ceil(POWER_DEFS.solarBow.cooldown / 2) : POWER_DEFS.solarBow.cooldown
  let next = spawnProjectile(state, { x: aim.x, y: aim.y, ability: 'solarBow', damage: state.config.powerDamage })
  next = {
    ...next,
    powerState: {
      ...next.powerState,
      solarBow: { activeUntil: 0, cooldownUntil: state.tick + cooldown },
    },
  }
  return next
}

function effect_radiantBurst(state, aim) {
  let next = damageThreats(state, (t) => distance(t, aim) <= state.config.powerBurstRadius, state.config.powerBurstDamage)
  next = {
    ...next,
    powerState: { ...next.powerState, radiantBurst: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.radiantBurst.cooldown } },
  }
  return next
}

function effect_goldenLyre(state) {
  return {
    ...state,
    powerState: {
      ...state.powerState,
      goldenLyre: {
        activeUntil: state.tick + POWER_DEFS.goldenLyre.duration,
        cooldownUntil: state.tick + POWER_DEFS.goldenLyre.cooldown,
      },
    },
  }
}

function effect_wingedStride(state) {
  return setWindow(state, 'wingedStride')
}
function effect_aegisWard(state) {
  return setWindow(state, 'aegisWard')
}
function effect_herosWrath(state) {
  return setWindow(state, 'herosWrath')
}
function effect_seasonalShift(state) {
  return setWindow(state, 'seasonalShift')
}
function effect_lunarVeil(state) {
  // Vanish under the moon: nothing can reach you while the veil holds.
  return {
    ...state,
    deity: { ...state.deity, invulnUntil: state.tick + POWER_DEFS.lunarVeil.duration },
    powerState: {
      ...state.powerState,
      lunarVeil: {
        activeUntil: state.tick + POWER_DEFS.lunarVeil.duration,
        cooldownUntil: state.tick + POWER_DEFS.lunarVeil.cooldown,
      },
    },
  }
}
function effect_primordialDark(state) {
  return setWindow(state, 'primordialDark')
}
function effect_worldRiver(state) {
  return setWindow(state, 'worldRiver')
}
function effect_harvestMoon(state) {
  return setWindow(state, 'harvestMoon')
}

function setWindow(state, id) {
  const def = POWER_DEFS[id]
  return {
    ...state,
    powerState: {
      ...state.powerState,
      [id]: {
        activeUntil: state.tick + (def.duration || 0),
        cooldownUntil: state.tick + def.cooldown,
      },
    },
  }
}

function effect_warCry(state) {
  const d = state.deity
  let next = damageThreats(
    state,
    (t) => distance(t, d) <= state.config.powerPulseRadius,
    state.config.powerPulseDamage,
  )
  next = { ...next, powerState: { ...next.powerState, warCry: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.warCry.cooldown } } }
  return next
}

function effect_arrowStorm(state, aim) {
  const base = Math.atan2(aim.y - state.deity.y, aim.x - state.deity.x)
  let next = state
  const spread = [base - 0.4, base, base + 0.4]
  for (const a of spread) {
    const tx = state.deity.x + Math.cos(a) * 400
    const ty = state.deity.y + Math.sin(a) * 400
    next = spawnProjectile(next, { x: tx, y: ty, ability: 'arrowStorm', damage: state.config.powerDamage })
  }
  next = { ...next, powerState: { ...next.powerState, arrowStorm: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.arrowStorm.cooldown } } }
  return next
}

function effect_bewilder(state) {
  const t = nearestThreat(state)
  if (!t) return state
  const until = state.tick + POWER_DEFS.bewilder.duration
  return {
    ...state,
    threats: state.threats.map((x) => (x.id === t.id ? { ...x, charmedUntil: until } : x)),
    powerState: { ...state.powerState, bewilder: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.bewilder.cooldown } },
  }
}

function effect_thunderbolt(state) {
  const first = nearestThreat(state)
  if (!first) return state
  let next = damageThreats(state, (t) => t.id === first.id, state.config.powerStrikeDamage)
  // Chain: up to two more threats near the first.
  let chained = 0
  for (const t of next.threats) {
    if (chained >= 2) break
    if (distance(t, first) <= state.config.powerChainRadius) {
      next = damageThreats(next, (tt) => tt.id === t.id, state.config.powerChainDamage)
      chained += 1
    }
  }
  next = { ...next, powerState: { ...next.powerState, thunderbolt: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.thunderbolt.cooldown } } }
  return next
}

function effect_queensGrace(state) {
  let next = {
    ...state,
    deity: {
      ...state.deity,
      health: Math.min(state.deity.maxHealth, state.deity.health + state.config.powerHeal),
      invulnUntil: state.tick + POWER_DEFS.queensGrace.duration,
    },
  }
  next = { ...next, powerState: { ...next.powerState, queensGrace: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.queensGrace.cooldown } } }
  return next
}

function effect_earthshaker(state) {
  const d = state.deity
  let next = damageThreats(
    state,
    (t) => distance(t, d) <= state.config.powerPulseRadius,
    state.config.powerPulseDamage,
  )
  // Knockback: shove surviving threats outward.
  next = {
    ...next,
    threats: next.threats.map((t) => {
      if (distance(t, d) > state.config.powerPulseRadius) return t
      const dx = t.x - d.x
      const dy = t.y - d.y
      const dd = Math.hypot(dx, dy) || 1
      return { ...t, x: t.x + (dx / dd) * 60, y: t.y + (dy / dd) * 60 }
    }),
    powerState: { ...next.powerState, earthshaker: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.earthshaker.cooldown } },
  }
  return next
}

function effect_gateOfTheDead(state) {
  const until = state.tick + POWER_DEFS.gateOfTheDead.duration
  const origin = { x: state.deity.x, y: state.deity.y }
  return {
    ...state,
    gate: { until, x: origin.x, y: origin.y },
    threats: state.threats.map((t) => ({ ...t, pulledUntil: until })),
    powerState: { ...state.powerState, gateOfTheDead: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.gateOfTheDead.cooldown } },
  }
}

function effect_inebriation(state) {
  const until = state.tick + POWER_DEFS.inebriation.duration
  return {
    ...tagThreats(state, 'confusedUntil', until),
    powerState: { ...state.powerState, inebriation: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.inebriation.cooldown } },
  }
}

function effect_sunChariot(state) {
  const until = state.tick + POWER_DEFS.sunChariot.duration
  return {
    ...tagThreats(state, 'blindedUntil', until),
    powerState: { ...state.powerState, sunChariot: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.sunChariot.cooldown } },
  }
}

function effect_fireBrand(state) {
  const t = nearestThreat(state)
  if (!t) return state
  const until = state.tick + 120
  return {
    ...state,
    threats: state.threats.map((x) => (x.id === t.id ? { ...x, burningUntil: until, burnDps: state.config.powerBurnDps } : x)),
    powerState: { ...state.powerState, fireBrand: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.fireBrand.cooldown } },
  }
}

function effect_temporalRewind(state) {
  return {
    ...state,
    deity: { ...state.deity, health: state.deity.maxHealth },
    powerState: { ...state.powerState, temporalRewind: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.temporalRewind.cooldown } },
  }
}

function effect_loveArrow(state) {
  const t = nearestThreat(state)
  if (!t) return state
  // The pierced beast turns on its own: damage everything near it.
  let next = damageThreats(state, (x) => x.id !== t.id && distance(x, t) <= state.config.powerChainRadius, state.config.powerChainDamage)
  next = {
    ...next,
    threats: next.threats.map((x) => (x.id === t.id ? { ...x, charmedUntil: state.tick + 90 } : x)),
    powerState: { ...next.powerState, loveArrow: { activeUntil: 0, cooldownUntil: state.tick + POWER_DEFS.loveArrow.cooldown } },
  }
  return next
}

const EFFECTS = {
  solarBow: effect_solarBow,
  radiantBurst: effect_radiantBurst,
  goldenLyre: effect_goldenLyre,
  wingedStride: effect_wingedStride,
  aegisWard: effect_aegisWard,
  warCry: effect_warCry,
  arrowStorm: effect_arrowStorm,
  bewilder: effect_bewilder,
  herosWrath: effect_herosWrath,
  thunderbolt: effect_thunderbolt,
  queensGrace: effect_queensGrace,
  earthshaker: effect_earthshaker,
  gateOfTheDead: effect_gateOfTheDead,
  seasonalShift: effect_seasonalShift,
  inebriation: effect_inebriation,
  harvestMoon: effect_harvestMoon,
  temporalRewind: effect_temporalRewind,
  sunChariot: effect_sunChariot,
  lunarVeil: effect_lunarVeil,
  fireBrand: effect_fireBrand,
  primordialDark: effect_primordialDark,
  loveArrow: effect_loveArrow,
  worldBearer: effect_worldBearer,
  worldRiver: effect_worldRiver,
}

function effect_worldBearer(state) {
  // Passive — no window; loadout filter prevents casting.
  return state
}

// ─── Shared dispatch ───────────────────────────────────────────
// The single entry point every input (keyboard, pointer, touch, HUD button)
// uses to activate a power. Returns state unchanged when not castable.
// Authorization boundary: once a deity is SELECTED, the state's `loadout` is
// authoritative — a known power outside that deity's loadout is rejected here,
// not only in the HUD. A godless state (bare harness/sandbox) has no selected
// loadout, so anything defined stays castable there.
export function castPower(state, powerId, aimX = 0, aimY = 0) {
  if (state.status !== 'running') return state
  const def = POWER_DEFS[powerId]
  if (!def || def.kind === 'passive') return state
  if (state.god && Array.isArray(state.loadout) && !state.loadout.includes(powerId)) return state
  if (!powerReady(state, powerId)) return state
  const fx = EFFECTS[powerId]
  if (!fx) return state
  const next = fx(state, { x: aimX, y: aimY })
  if (next === state) return state // effect bailed (e.g. no target)
  return { ...next, tokenUsage: (next.tokenUsage || 0) + 1 }
}

// ─── Buff readers used by advanceTick ──────────────────────────
export function deitySpeedScale(state) {
  return powerActive(state, 'wingedStride') ? state.config.wingedStrideFactor : 1
}

export function deityDamageScale(state) {
  return powerActive(state, 'herosWrath') ? state.config.herosWrathFactor : 1
}

export function threatSpeedScale(state) {
  return powerActive(state, 'primordialDark') ? state.config.primordialDarkFactor : 1
}

export function healPerTick(state) {
  return powerActive(state, 'harvestMoon') ? state.config.harvestMoonHeal : 0
}

export function riverDamagePerTick(state) {
  return powerActive(state, 'worldRiver') ? state.config.worldRiverDps : 0
}

export function deityInvulnerable(state) {
  if (powerActive(state, 'aegisWard')) return true
  return state.deity && state.tick < (state.deity.invulnUntil || 0)
}

export function riverRadius(state) {
  return state.config.worldRiverRadius
}
