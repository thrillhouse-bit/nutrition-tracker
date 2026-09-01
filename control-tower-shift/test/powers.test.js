import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  spawnThreat,
  advanceTick,
  castPowerOn,
  powerActive,
  powerReady,
  deitySpeedScale,
  deityDamageScale,
  threatSpeedScale,
  deityInvulnerable,
  healPerTick,
  riverDamagePerTick,
  POWER_DEFS,
  DEITY_LOADOUT,
  powersForGod,
  GODS_BY_TIER,
  distance,
  clearPoints,
} from '../src/game/index.js'

// A deterministic field with a few threats placed at known positions.
const field = (overrides = {}) => {
  let s = createInitialState(overrides)
  s = spawnThreat(s, { id: 'near1', x: 60, y: 0, speed: 0, monsterType: 'hydra' })
  s = spawnThreat(s, { id: 'near2', x: -60, y: 40, speed: 0, monsterType: 'cerberus' })
  s = spawnThreat(s, { id: 'far', x: 250, y: -200, speed: 0, monsterType: 'chronos' })
  return s
}

describe('power definitions exist for every deity in the roster', () => {
  it('every god maps to at least one defined, distinct power', () => {
    for (const tier of [1, 2, 3]) {
      for (const god of GODS_BY_TIER[tier]) {
        const list = powersForGod(god.key)
        expect(list.length, `${god.key} has no powers`).toBeGreaterThan(0)
        for (const id of list) {
          const def = POWER_DEFS[id]
          expect(def, `${god.key} -> ${id} missing`).toBeTruthy()
          expect(def.name).toBeTruthy()
          expect(def.description).toBeTruthy()
          expect(typeof def.cooldown).toBe('number')
        }
      }
    }
  })

  it('Apollo has exactly three distinct HUD powers', () => {
    expect(powersForGod('apollo')).toEqual(['solarBow', 'radiantBurst', 'goldenLyre'])
  })

  it('control: power ids are stable contracts (no silent renames)', () => {
    const ids = Object.values(POWER_DEFS).map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('solarBow')
    expect(ids).toContain('radiantBurst')
    expect(ids).toContain('goldenLyre')
  })
})

describe('Apollo: solar bow', () => {
  it('fires one luminous projectile toward the aim point', () => {
    let s = field()
    s = castPowerOn(s, 'solarBow', 200, 0)
    expect(s.projectiles).toHaveLength(1)
    expect(s.projectiles[0].ability).toBe('solarBow')
    expect(s.projectiles[0].vx).toBeGreaterThan(0)
  })

  it('projectiles damage the first threat they hit, deterministically', () => {
    let s = createInitialState()
    // Out of melee range so only the arrow lands; 24 dmg vs 30 hp hydra.
    s = spawnThreat(s, { id: 'target', x: 150, y: 0, speed: 0, monsterType: 'hydra' })
    s = castPowerOn(s, 'solarBow', 150, 0)
    let steps = 0
    while (s.projectiles.length && steps < 80) {
      s = advanceTick(s)
      steps += 1
    }
    const target = s.threats.find((t) => t.id === 'target')
    expect(target).toBeTruthy()
    expect(target.health).toBe(30 - 24)
  })
})

describe('Apollo: radiant burst', () => {
  it('kills threats inside the blast radius at the aim point, leaves the rest', () => {
    let s = field()
    const hpFar = s.threats.find((t) => t.id === 'far').health
    s = castPowerOn(s, 'radiantBurst', 60, 0)
    // near1 at (60,0) is inside the blast (45 dmg > 30 hp) → removed outright.
    expect(s.threats.find((t) => t.id === 'near1')).toBeUndefined()
    // far at (250,-200) is outside the 130-radius blast and untouched.
    expect(s.threats.find((t) => t.id === 'far').health).toBe(hpFar)
  })

  it('starts a cooldown after use', () => {
    let s = field()
    s = castPowerOn(s, 'radiantBurst', 60, 0)
    expect(powerReady(s, 'radiantBurst')).toBe(false)
  })
})

describe('Apollo: golden lyre', () => {
  it('opens a tempo window that doubles clear points', () => {
    let s = field()
    s = castPowerOn(s, 'goldenLyre', 0, 0)
    expect(powerActive(s, 'goldenLyre')).toBe(true)
    expect(clearPoints(s)).toBe(s.config.pointsPerClear * 2)
  })

  it('tempo halves the bow cooldown while active', () => {
    let s = field()
    s = castPowerOn(s, 'goldenLyre', 0, 0)
    s = castPowerOn(s, 'solarBow', 200, 0)
    const cd = s.powerState.solarBow.cooldownUntil - s.tick
    expect(cd).toBe(Math.ceil(POWER_DEFS.solarBow.cooldown / 2))
  })

  it('control: without tempo the bow uses its full cooldown', () => {
    let s = field()
    s = castPowerOn(s, 'solarBow', 200, 0)
    const cd = s.powerState.solarBow.cooldownUntil - s.tick
    expect(cd).toBe(POWER_DEFS.solarBow.cooldown)
  })
})

describe('Tier 1 powers', () => {
  it('hermes: winged stride speeds the deity', () => {
    let s = field()
    expect(deitySpeedScale(s)).toBe(1)
    s = castPowerOn(s, 'wingedStride', 0, 0)
    expect(deitySpeedScale(s)).toBeCloseTo(s.config.wingedStrideFactor)
    s = { ...s, tick: s.powerState.wingedStride.activeUntil + 1 }
    expect(deitySpeedScale(s)).toBe(1)
  })

  it('athena: aegis ward turns aside all damage', () => {
    let s = field()
    s = castPowerOn(s, 'aegisWard', 0, 0)
    expect(deityInvulnerable(s)).toBe(true)
    // Overlap a threat on the deity.
    s = { ...s, threats: [{ ...s.threats[0], x: s.deity.x + 1, y: 0 }] }
    const hp = s.deity.health
    s = advanceTick(s)
    expect(s.deity.health).toBe(hp)
  })

  it('control: without the ward the same overlap damages', () => {
    let s = field()
    s = { ...s, threats: [{ ...s.threats[0], x: s.deity.x + 1, y: 0 }] }
    const hp = s.deity.health
    s = advanceTick(s)
    expect(s.deity.health).toBe(hp - s.config.threatDamage)
  })

  it('ares: war cry damages every threat in the pulse radius', () => {
    let s = field()
    const hpFar = s.threats.find((t) => t.id === 'far').health
    s = castPowerOn(s, 'warCry', 0, 0)
    // near1 + near2 are within pulse radius of the deity (origin).
    expect(s.threats.find((t) => t.id === 'near1')).toBeUndefined()
    expect(s.threats.find((t) => t.id === 'near2')).toBeUndefined()
    expect(s.threats.find((t) => t.id === 'far').health).toBe(hpFar)
  })

  it('artemis: arrow storm fires three projectiles in a fan', () => {
    let s = field()
    s = castPowerOn(s, 'arrowStorm', 200, 0)
    expect(s.projectiles).toHaveLength(3)
  })

  it('aphrodite: bewilder makes the nearest threat recoil (charmed)', () => {
    let s = field()
    s = castPowerOn(s, 'bewilder', 0, 0)
    const near1 = s.threats.find((t) => t.id === 'near1')
    expect(near1.charmedUntil).toBeGreaterThan(s.tick)
  })

  it('hercules: hero’s wrath doubles outgoing damage', () => {
    let s = field()
    expect(deityDamageScale(s)).toBe(1)
    s = castPowerOn(s, 'herosWrath', 0, 0)
    expect(deityDamageScale(s)).toBe(s.config.herosWrathFactor)
  })
})

describe('Tier 2 powers', () => {
  it('zeus: thunderbolt strikes the nearest threat dead and leaves the rest', () => {
    let s = field()
    const near2Hp = s.threats.find((t) => t.id === 'near2').health
    const farHp = s.threats.find((t) => t.id === 'far').health
    s = castPowerOn(s, 'thunderbolt', 0, 0)
    // Primary strike is 60 dmg vs 30 hp → nearest threat dies outright.
    expect(s.threats.find((t) => t.id === 'near1')).toBeUndefined()
    // near2 and far are outside the 120 chain radius and untouched.
    expect(s.threats.find((t) => t.id === 'near2').health).toBe(near2Hp)
    expect(s.threats.find((t) => t.id === 'far').health).toBe(farHp)
  })

  it('hera: queen’s grace restores health and grants brief invulnerability', () => {
    let s = field()
    s = { ...s, deity: { ...s.deity, health: 50 } }
    s = castPowerOn(s, 'queensGrace', 0, 0)
    expect(s.deity.health).toBe(Math.min(s.deity.maxHealth, 50 + s.config.powerHeal))
    expect(deityInvulnerable(s)).toBe(true)
  })

  it('poseidon: earthshaker clears nearby threats and hurls survivors outward', () => {
    let s = field()
    const farHp = s.threats.find((t) => t.id === 'far').health
    s = castPowerOn(s, 'earthshaker', 0, 0)
    // near1 (60,0) + near2 are inside the pulse radius and take 40 dmg vs 30 hp.
    expect(s.threats.find((t) => t.id === 'near1')).toBeUndefined()
    // far is outside the 175 radius and untouched.
    expect(s.threats.find((t) => t.id === 'far').health).toBe(farHp)
  })

  it('hades: gate of the dead pulls and grinds every threat', () => {
    let s = field()
    s = castPowerOn(s, 'gateOfTheDead', 0, 0)
    expect(s.gate).toBeTruthy()
    expect(s.threats.every((t) => t.pulledUntil > s.tick)).toBe(true)
    // Threats converge toward the deity over ticks.
    const dBefore = distance(s.threats[0], { x: 0, y: 0 })
    for (let i = 0; i < 5 && s.status === 'running'; i++) s = advanceTick(s)
    const dAfter = distance(s.threats[0], { x: 0, y: 0 })
    expect(dAfter).toBeLessThanOrEqual(dBefore)
  })

  it('persephone: seasonal shift opens a harvest window', () => {
    let s = field()
    s = castPowerOn(s, 'seasonalShift', 0, 0)
    expect(powerActive(s, 'seasonalShift')).toBe(true)
  })

  it('dionysus: inebriation confuses every threat on the field', () => {
    let s = field()
    s = castPowerOn(s, 'inebriation', 0, 0)
    expect(s.threats.every((t) => t.confusedUntil > s.tick)).toBe(true)
  })

  it('demeter: harvest moon heals over time while active', () => {
    let s = field()
    s = castPowerOn(s, 'harvestMoon', 0, 0)
    expect(healPerTick(s)).toBe(s.config.harvestMoonHeal)
    s = { ...s, deity: { ...s.deity, health: 50 } }
    s = advanceTick(s)
    expect(s.deity.health).toBe(50 + s.config.harvestMoonHeal)
  })
})

describe('Tier 3 powers', () => {
  it('cronus: temporal rewind restores full health', () => {
    let s = field()
    s = { ...s, deity: { ...s.deity, health: 30 } }
    s = castPowerOn(s, 'temporalRewind', 0, 0)
    expect(s.deity.health).toBe(s.deity.maxHealth)
  })

  it('helios: sun chariot blinds every threat', () => {
    let s = field()
    s = castPowerOn(s, 'sunChariot', 0, 0)
    expect(s.threats.every((t) => t.blindedUntil > s.tick)).toBe(true)
  })

  it('selene: lunar veil makes the deity untouchable', () => {
    let s = field()
    s = castPowerOn(s, 'lunarVeil', 0, 0)
    expect(deityInvulnerable(s)).toBe(true)
  })

  it('prometheus: fire brand sets the nearest threat burning', () => {
    let s = field()
    s = castPowerOn(s, 'fireBrand', 0, 0)
    const near1 = s.threats.find((t) => t.id === 'near1')
    expect(near1.burningUntil).toBeGreaterThan(s.tick)
    expect(near1.burnDps).toBe(s.config.powerBurnDps)
    // Burning deals damage over time.
    const hp = near1.health
    s = advanceTick(s)
    const after = s.threats.find((t) => t.id === 'near1')
    if (after) expect(after.health).toBeLessThan(hp)
  })

  it('nyx: primordial dark slows every threat', () => {
    let s = field()
    expect(threatSpeedScale(s)).toBe(1)
    s = castPowerOn(s, 'primordialDark', 0, 0)
    expect(threatSpeedScale(s)).toBeCloseTo(s.config.primordialDarkFactor)
  })

  it('eros: love arrow charms the nearest and damages its kin', () => {
    let s = field()
    s = castPowerOn(s, 'loveArrow', 0, 0)
    const near1 = s.threats.find((t) => t.id === 'near1')
    expect(near1.charmedUntil).toBeGreaterThan(s.tick)
  })

  it('oceanus: world river damages threats that stay in the ring', () => {
    let s = field()
    s = castPowerOn(s, 'worldRiver', 0, 0)
    expect(riverDamagePerTick(s)).toBe(s.config.worldRiverDps)
    const near1 = s.threats.find((t) => t.id === 'near1') // at 60,0 inside 135 radius
    const hp = near1.health
    s = advanceTick(s)
    const after = s.threats.find((t) => t.id === 'near1')
    if (after) expect(after.health).toBeLessThan(hp)
  })
})

describe('control gates', () => {
  it('a power with no target leaves state unchanged (no free token)', () => {
    let s = createInitialState()
    s = castPowerOn(s, 'bewilder', 0, 0) // no threats → no-op
    expect(s.tokenUsage).toBe(0)
  })

  it('passive powers cannot be cast', () => {
    let s = createInitialState({ god: 'atlas' })
    const before = s.tokenUsage
    s = castPowerOn(s, 'worldBearer', 0, 0)
    expect(s.tokenUsage).toBe(before)
  })
})
