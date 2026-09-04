import { describe, expect, it } from 'vitest'
import {
  combatStyleForInput,
  combatXpFromContributions,
  combatXpFromDamage,
  observedThreatDamage,
  recordCombatContributions,
} from '../src/rpg/combatProgression.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { normalizeCombatMultiplier, stepCombat } from '../src/rpg/combatAdapter.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { createInitialState as createArenaState, spawnThreat } from '../src/game/state.js'
import { createSpawner } from '../src/spawner.js'

const threat = (id, health) => ({ id, health })

// A point-blank threat (distance 0 from the deity) is simultaneously in
// deityAttack's melee range and inside the deity's contact-hit radius, so a
// single tick both deals and takes damage — enough to observe both sides of
// stepCombat's telemetry without depending on movement/pursuit physics.
function sessionWithPointBlankThreat() {
  let arena = spawnThreat(createArenaState({ god: 'apollo' }), { id: 'target', x: 0, y: 0, health: 999999, radius: 5 })
  return {
    arena,
    spawner: createSpawner(1),
    eliteOverlay: null,
    authoredOrder: null,
    startLevelIndex: 0,
    settled: false,
    damageByStyle: {},
    lastOffenseSkill: null,
    damageTaken: 0,
    guardedDamageTaken: 0,
  }
}

function enteredStoryFight() {
  let state = createInitialState()
  const map = rpgMapById('beacon-overlook')
  const thessa = map.entities.find((entity) => entity.id === 'thessa')
  const thessaPath = findWorldPath(map, state.world.position, thessa)
  expect(thessaPath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: thessaPath.at(-1) } }
  state = applyEvent(state, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
  state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
  const shrine = rpgMapById('beacon-overlook').entities.find((entity) => entity.id === 'shrine')
  const shrinePath = findWorldPath(map, state.world.position, shrine)
  expect(shrinePath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: shrinePath.at(-1) } }
  state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
  state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: 'apollo' })
  const exit = rpgMapById('beacon-overlook').exits.find((candidate) => candidate.id === 'to-olive-road')
  const exitPath = findWorldPath(map, state.world.position, exit)
  expect(exitPath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: exitPath.at(-1) } }
  state = applyEvent(state, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
  return applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
}

describe('action-derived combat contribution', () => {
  it('attributes only observed arena damage to the action actually used', () => {
    const before = { threats: [threat('a', 30), threat('b', 20)] }
    const after = { threats: [threat('a', 18)] }
    expect(observedThreatDamage(before, after)).toBe(32)
    const first = recordCombatContributions({}, before, after, { attack: true })
    expect(first).toEqual({ damageByStyle: { spearcraft: 32 }, lastOffenseSkill: 'spearcraft', damageTaken: 0, guardedDamageTaken: 0 })
    const second = recordCombatContributions(first, { threats: [threat('c', 40)] }, { threats: [threat('c', 30)] }, {})
    expect(second.damageByStyle).toEqual({ spearcraft: 42 })
  })

  it('preserves canonical XP damage when accessibility tuning reduces live threat health', () => {
    const before = { threats: [{ id: 'sun-threat', health: 60, maxHealth: 60, progressionHealth: 100 }] }
    const after = { threats: [{ id: 'sun-threat', health: 30, maxHealth: 60, progressionHealth: 100 }] }
    expect(observedThreatDamage(before, after)).toBe(50)
    expect(observedThreatDamage(before, { threats: [] })).toBe(100)
  })

  it('fails subnormal and invalid encounter multipliers closed to canonical combat', () => {
    expect(normalizeCombatMultiplier(0.05)).toBe(0.05)
    expect(normalizeCombatMultiplier(0.09)).toBe(0.09)
    for (const invalid of [0, 0.049, -1, NaN, Infinity, 1.01, '0.5']) {
      expect(normalizeCombatMultiplier(invalid)).toBe(1)
    }
  })

  it('uses explicit divine and ranged inputs before any fallback style', () => {
    expect(combatStyleForInput({ powerId: 'thunderbolt', firing: true, attack: true }, 'spearcraft')).toBe('stormcalling')
    expect(combatStyleForInput({ firing: true, attack: true }, 'stormcalling')).toBe('marksmanship')
    expect(combatStyleForInput({ attack: true }, 'stormcalling')).toBe('spearcraft')
    expect(combatStyleForInput({}, 'marksmanship')).toBe('marksmanship')
  })

  it('derives XP from demonstrated damage and never grants unused styles', () => {
    expect(combatXpFromDamage({ spearcraft: 100, stormcalling: 40 })).toEqual([
      { skillId: 'spearcraft', amount: 60 },
      { skillId: 'might', amount: 35 },
      { skillId: 'stormcalling', amount: 30 },
    ])
    expect(combatXpFromDamage({})).toEqual([])
    expect(combatXpFromDamage({ spearcraft: -10, marksmanship: Infinity })).toEqual([])
    expect(combatXpFromContributions({
      damageByStyle: { marksmanship: 40 }, damageTaken: 20, guardedDamageTaken: 10,
    })).toEqual([
      { skillId: 'marksmanship', amount: 30 },
      { skillId: 'guard', amount: 8 },
      { skillId: 'vitality', amount: 8 },
    ])
  })

  it('settles demonstrated story XP exactly once instead of granting a fixed bundle', () => {
    const entered = enteredStoryFight()
    const won = applyEvent(entered, {
      type: 'COMBAT_WON',
      encounterId: 'enc-act1-entry',
      damageByStyle: { spearcraft: 100, stormcalling: 40 },
    })
    expect(won.progression.skills.spearcraft.xp).toBe(60)
    expect(won.progression.skills.might.xp).toBe(35)
    expect(won.progression.skills.stormcalling.xp).toBe(30)
    expect(won.progression.skills.marksmanship.xp).toBe(0)
    expect(won.progression.skills.guard.xp).toBe(0)
    expect(applyEvent(won, {
      type: 'COMBAT_WON', encounterId: 'enc-act1-entry', damageByStyle: { spearcraft: 999 },
    })).toBe(won)
  })

  it('settles the full combatContributions shape at reducer settlement, including guard and vitality', () => {
    const entered = enteredStoryFight()
    const won = applyEvent(entered, {
      type: 'COMBAT_WON',
      encounterId: 'enc-act1-entry',
      combatContributions: {
        damageByStyle: { spearcraft: 100, marksmanship: 40 },
        damageTaken: 20,
        guardedDamageTaken: 10,
      },
    })
    // spearcraft: floor(100*0.6)=60; might: floor(100*0.35)=35; marksmanship: floor(40*0.75)=30
    expect(won.progression.skills.spearcraft.xp).toBe(60)
    expect(won.progression.skills.might.xp).toBe(35)
    expect(won.progression.skills.marksmanship.xp).toBe(30)
    // guard: floor(10*0.8)=8; vitality: floor(20*0.4)=8
    expect(won.progression.skills.guard.xp).toBe(8)
    expect(won.progression.skills.vitality.xp).toBe(8)
    expect(won.progression.skills.stormcalling.xp).toBe(0)
  })
})

describe('stepCombat adapter integration', () => {
  it('accumulates real offensive and defensive telemetry from actual arena state transitions', () => {
    const session = sessionWithPointBlankThreat()
    const next = stepCombat(session, { attack: true })
    // The point-blank threat is hit by the deity's melee (offense) and hits
    // the deity back on contact (defense) in the same real tick.
    expect(next.damageByStyle.spearcraft).toBeGreaterThan(0)
    expect(next.lastOffenseSkill).toBe('spearcraft')
    expect(next.damageTaken).toBeGreaterThan(0)
    expect(next.arena.threats[0].health).toBeLessThan(session.arena.threats[0].health)
    expect(next.arena.deity.health).toBeLessThan(session.arena.deity.health)

    // A second, fresh engagement (simulating a later real hit rather than
    // waiting out cooldown/knockback/pursuit timing) must ADD onto the
    // running totals rather than reset them, proving stepCombat threads
    // real accumulated telemetry through the session instead of
    // recomputing only the latest tick's damage each call.
    const reEngaged = {
      ...next,
      arena: { ...spawnThreat(next.arena, { id: 'target-2', x: 0, y: 0, health: 999999, radius: 5 }), nextAutoAttack: 0 },
    }
    const second = stepCombat(reEngaged, { attack: true })
    expect(second.damageByStyle.spearcraft).toBeGreaterThan(next.damageByStyle.spearcraft)
    expect(second.damageTaken).toBeGreaterThan(next.damageTaken)
  })

  it('does not attribute damage to an offensive style when no offensive input is given', () => {
    const session = sessionWithPointBlankThreat()
    const next = stepCombat(session, {})
    expect(next.damageByStyle.spearcraft).toBeUndefined()
    expect(next.lastOffenseSkill).toBeNull()
    // The threat still lands its contact hit even without a player action.
    expect(next.damageTaken).toBeGreaterThan(0)
    expect(next.guardedDamageTaken).toBe(0)
  })

  it('holding Guard actually reduces incoming damage this tick without permanently mutating arena config', () => {
    const baseline = sessionWithPointBlankThreat()
    const unguarded = stepCombat(sessionWithPointBlankThreat(), { guard: false })
    const guarded = stepCombat(sessionWithPointBlankThreat(), { guard: true })

    expect(unguarded.damageTaken).toBeGreaterThan(0)
    expect(guarded.damageTaken).toBeGreaterThan(0)
    expect(guarded.damageTaken).toBeCloseTo(unguarded.damageTaken * 0.55, 5)
    expect(guarded.guardedDamageTaken).toBeCloseTo(guarded.damageTaken, 5)
    expect(unguarded.guardedDamageTaken).toBe(0)

    // The reduction is scoped to the guarded frame only: threatDamage is
    // restored to the pre-guard value on the returned arena, not left
    // permanently reduced for the next (possibly unguarded) tick.
    expect(guarded.arena.config.threatDamage).toBe(baseline.arena.config.threatDamage)

    // A fresh contact hit with guard released this time — not waiting out
    // the original threat's cooldown/knockback/pursuit timing — must deal
    // the full unreduced amount, proving the earlier 0.55x reduction did
    // not leak forward onto a later, unguarded tick.
    const freshContact = {
      ...guarded,
      arena: spawnThreat(guarded.arena, { id: 'target-2', x: 0, y: 0, health: 999999, radius: 5 }),
    }
    const releasedGuard = stepCombat(freshContact, { guard: false })
    const secondHitDamage = releasedGuard.damageTaken - guarded.damageTaken
    expect(secondHitDamage).toBeCloseTo(baseline.arena.config.threatDamage, 5)
  })
})
