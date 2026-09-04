import { describe, expect, it } from 'vitest'
import { applyEvent, createInitialState, currentObjective } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { normalizeState } from '../src/rpg/save.js'

function finishThessa(state) {
  const map = rpgMapById(state.world.mapId)
  const thessa = map.entities.find((entity) => entity.id === 'thessa')
  const path = findWorldPath(map, state.world.position, thessa)
  expect(path.length).toBeGreaterThan(0)
  const nearby = { ...state, world: { ...state.world, position: path.at(-1) } }
  let next = applyEvent(nearby, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
  return applyEvent(next, { type: 'DIALOGUE_END', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
}

function reachEntryCourt(state) {
  const exit = rpgMapById('beacon-overlook').exits.find((candidate) => candidate.id === 'to-olive-road')
  const atExit = { ...state, world: { ...state.world, position: { x: exit.x, y: exit.y } } }
  return applyEvent(atExit, {
    type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon',
  })
}

function atFirstShrine(state) {
  const shrine = rpgMapById('beacon-overlook').entities.find((entity) => entity.id === 'shrine')
  return { ...state, world: { ...state.world, position: { x: shrine.x, y: shrine.y } } }
}

describe('first-patron onboarding boundary', () => {
  for (const godId of ['apollo', 'athena', 'ares']) {
    it(`requires Thessa, then reaches the Entry Court for ${godId}`, () => {
      let state = atFirstShrine(createInitialState())

      // A physical shrine interaction before the required conversation cannot
      // manufacture a patron or put the quest into the invisible-guide state.
      expect(applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })).toBe(state)
      expect(applyEvent(state, { type: 'CHOOSE_PATRON', godId })).toBe(state)

      state = finishThessa(state)
      expect(currentObjective(state)?.id).toBe('choose-patron')
      state = atFirstShrine(state)
      state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
      state = applyEvent(state, { type: 'CHOOSE_PATRON', godId })
      expect(currentObjective(state)?.id).toBe('reach-olive-road')

      // The checkpoint shape survives normalization before the arrival event.
      state = normalizeState(state)
      state = reachEntryCourt(state)
      expect(currentObjective(state)?.id).toBe('clear-entry')
      const entered = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
      expect(entered.status).toBe('in-combat')
    })
  }

  it('recovers a legacy early-patron save without granting objective progress', () => {
    let state = createInitialState()
    state = {
      ...state,
      protagonist: { ...state.protagonist, activePatronId: 'athena', unlockedPatronIds: ['athena'] },
    }
    state = normalizeState(state)
    expect(currentObjective(state)?.id).toBe('talk-thessa')

    state = finishThessa(state)
    expect(currentObjective(state)?.id).toBe('choose-patron')
    state = atFirstShrine(state)
    state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
    state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: 'athena' })
    expect(currentObjective(state)?.id).toBe('reach-olive-road')
  })
})
