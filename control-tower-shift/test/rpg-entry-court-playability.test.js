import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/rpg/state.js'
import { startEncounter, stepCombat, OUTCOME_FAILED, OUTCOME_WON } from '../src/rpg/combatAdapter.js'

function nearestThreat(arena) {
  return arena.threats.reduce((nearest, threat) => {
    if (!nearest) return threat
    const currentDistance = Math.hypot(threat.x - arena.deity.x, threat.y - arena.deity.y)
    const nearestDistance = Math.hypot(nearest.x - arena.deity.x, nearest.y - arena.deity.y)
    return currentDistance < nearestDistance ? threat : nearest
  }, null)
}

describe('Acropolis Entry Court onboarding combat', () => {
  const signaturePower = { apollo: 'solarBow', athena: 'aegisWard', ares: 'warCry' }

  function orbitAndFire(session, godId, ticks) {
    for (let tick = 0; tick < ticks && !session.settled; tick += 1) {
      const target = nearestThreat(session.arena)
      const aimX = target ? target.x - session.arena.deity.x : 1
      const aimY = target ? target.y - session.arena.deity.y : 0
      session = stepCombat(session, {
        moveX: -aimY / (Math.hypot(aimX, aimY) || 1),
        moveY: aimX / (Math.hypot(aimX, aimY) || 1),
        aimX,
        aimY,
        firing: true,
        // Athena's ward is defensive. Repeating the normal visible J action
        // is therefore part of a competent keyboard-only clear rather than
        // treating held fire as a different patron's burst kit.
        attack: tick % 22 === 0,
        guard: true,
        powerId: tick % 22 === 0 ? signaturePower[godId] : null,
      })
    }
    return session
  }

  // Models the normal browser path rather than an ideal held-input bot: the
  // player acts in sparse bursts and bridge/render pauses leave genuine gaps.
  function sparsePausedCourt(session, godId, ticks) {
    for (let tick = 0; tick < ticks && !session.settled; tick += 1) {
      // A deliberately harsh normal-UI cadence: a short combat burst followed
      // by a multi-second bridge/render pause. This is stricter than held
      // desktop input and reflects the Luna browser replay failure mode.
      if (tick % 380 >= 70) {
        session = stepCombat(session, {})
        continue
      }
      const target = nearestThreat(session.arena)
      const aimX = target ? target.x - session.arena.deity.x : 1
      const aimY = target ? target.y - session.arena.deity.y : 0
      const distance = Math.hypot(aimX, aimY) || 1
      session = stepCombat(session, {
        moveX: -aimY / distance,
        moveY: aimX / distance,
        aimX,
        aimY,
        firing: tick % 10 === 0,
        attack: tick % 70 === 0,
        guard: tick % 4 === 0,
        powerId: tick % 230 === 0 ? signaturePower[godId] : null,
      })
    }
    return session
  }

  for (const godId of ['apollo', 'athena', 'ares']) it(`clears with normal movement, held fire, guard, and the visible ${godId} power`, () => {
    let story = createInitialState()
    story = { ...story, protagonist: { ...story.protagonist, activePatronId: godId } }
    let session = startEncounter(story, 'enc-act1-entry')

    // This is the same input vocabulary as the UI: a held aim/fire pointer,
    // WASD-style orbit, Guard, and recurring K/Solar Bow presses. No arena
    // state is injected after the encounter begins.
    session = orbitAndFire(session, godId, 3000)

    expect(session.outcome).toBe(OUTCOME_WON)
    expect(session.arena.deity.health).toBeGreaterThan(0)
  })

  it('lets all three tier-one patrons clear Sun Court with sparse normal inputs and realistic bridge pauses', () => {
    for (const godId of ['apollo', 'athena', 'ares']) {
      let story = createInitialState()
      story = { ...story, protagonist: { ...story.protagonist, activePatronId: godId } }
      const session = sparsePausedCourt(startEncounter(story, 'enc-act1-sun'), godId, 9000)
      expect(session.outcome, godId).toBe(OUTCOME_WON)
      expect(session.arena.deity.health, godId).toBeGreaterThan(35)
    }
  })

  it('retains the Sun Court defeat path when the player supplies no combat input', () => {
    let story = createInitialState()
    story = { ...story, protagonist: { ...story.protagonist, activePatronId: 'apollo' } }
    let session = startEncounter(story, 'enc-act1-sun')
    for (let tick = 0; tick < 7000 && !session.settled; tick += 1) session = stepCombat(session, {})
    expect(session.outcome).toBe(OUTCOME_FAILED)
  })

  it('keeps the conservative pause-recovery profile scoped to Sun Court', () => {
    let story = createInitialState()
    story = { ...story, protagonist: { ...story.protagonist, activePatronId: 'apollo' } }
    const entry = startEncounter(story, 'enc-act1-entry')
    const sunCourt = startEncounter(story, 'enc-act1-sun')

    // Starter equipment modifiers are shared; only the known browser-pause
    // bottleneck receives this lower profile.
    expect(sunCourt.arena.config.threatDamage).toBeLessThan(entry.arena.config.threatDamage)
    expect(sunCourt.arena.config.threatBaseSpeed).toBeLessThan(entry.arena.config.threatBaseSpeed)
    expect(sunCourt.arena.config.threatHealthMultiplier).toBe(0.6)
  })
})
