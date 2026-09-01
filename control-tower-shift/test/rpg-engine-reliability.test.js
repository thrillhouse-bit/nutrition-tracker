import { describe, expect, it } from 'vitest'
import { startEncounter, sessionPhaseLabel } from '../src/rpg/combatAdapter.js'
import { normalizeState } from '../src/rpg/save.js'
import { createInitialState, seedForEncounter } from '../src/rpg/state.js'

function playableState() {
  return {
    ...createInitialState(),
    protagonist: {
      ...createInitialState().protagonist,
      activePatronId: 'apollo',
    },
  }
}

describe('RPG save reliability', () => {
  it('restores a missing Act I main-quest progress record from the fresh-save baseline', () => {
    const raw = createInitialState()
    raw.quests = {}

    const normalized = normalizeState(raw)

    expect(normalized.mainQuestId).toBe('mq-act1-ash-at-dawn')
    expect(normalized.quests[normalized.mainQuestId]).toEqual({
      state: 'active',
      objectiveIndex: 1,
      objectiveCounts: {},
    })
  })

  it('seeds a registered later-act main quest when a partial save omitted its progress', () => {
    const raw = {
      ...createInitialState(),
      world: {
        regionId: 'night-stair',
        mapId: 'night-stair-foothold',
        spawnId: 'arrival',
        position: { x: 0, y: 0 },
        facing: 0,
      },
      mainQuestId: 'mq-act5-last-name',
      quests: {},
    }

    const normalized = normalizeState(raw)

    expect(normalized.mainQuestId).toBe('mq-act5-last-name')
    expect(normalized.quests['mq-act5-last-name']).toEqual({
      state: 'active',
      objectiveIndex: 0,
      objectiveCounts: {},
    })
  })

  it('normalizes a malformed later-act main-quest record to active progress', () => {
    const raw = {
      ...createInitialState(),
      mainQuestId: 'mq-act5-last-name',
      quests: { 'mq-act5-last-name': { state: 'invented', objectiveIndex: 'first' } },
    }

    const normalized = normalizeState(raw)

    expect(normalized.quests['mq-act5-last-name']).toMatchObject({
      state: 'active',
      objectiveIndex: 0,
      objectiveCounts: {},
    })
  })

  it('falls an unknown main quest back to Act I with a matching progress record', () => {
    const raw = { ...createInitialState(), mainQuestId: 'mq-invented', quests: {} }

    const normalized = normalizeState(raw)

    expect(normalized.mainQuestId).toBe('mq-act1-ash-at-dawn')
    expect(normalized.quests[normalized.mainQuestId]).toBeTruthy()
  })
})

describe('authored combat-session reliability', () => {
  it('uses a valid authored encounter seed and keeps the hashed fallback for legacy encounters', () => {
    const rpg = playableState()

    const authored = startEncounter(rpg, 'enc-act5-night-stair')
    const legacy = startEncounter(rpg, 'enc-act2-breakwater')

    expect(authored.seed).toBe(5101)
    expect(authored.spawner.seed).toBe(5101)
    expect(legacy.seed).toBe(seedForEncounter('enc-act2-breakwater'))
  })

  it('retains an ordinary authored overlay without treating it as an elite overlay', () => {
    const session = startEncounter(playableState(), 'enc-act2-breakwater')

    expect(session.overlay).toEqual({ kind: 'reef', note: 'Reef overlays on all spawns' })
    expect(session.eliteOverlay).toBeNull()
    expect(session.encounterMetadata.overlay).toBe(session.overlay)
  })

  it('retains the Act I elite overlay while preserving the existing simulation contract', () => {
    const session = startEncounter(playableState(), 'enc-act1-sun')

    expect(session.eliteOverlay).toMatchObject({ id: 'name-cutter-captain' })
    expect(session.encounterMetadata.eliteOverlay).toBe(session.eliteOverlay)
  })

  it('carries boss contracts and translates targetable overlays into deterministic ward stages', () => {
    const guardian = startEncounter(playableState(), 'boss-act5-loom-guardian')
    const regent = startEncounter(playableState(), 'boss-act5-quiet-regent')

    expect(guardian.boss.core.baseMonsterType).toBe('atlas')
    expect(guardian.phases).toEqual(['weft-lock', 'witness-break', 'open-pattern'])
    expect(guardian.boss.overlays[0]).toMatchObject({ kind: 'suppressible-seals', count: 4 })
    expect(guardian.authoredOrder).toEqual(['sphinx', 'sphinx', 'sphinx', 'sphinx', 'atlas'])
    expect(guardian.bossWardCount).toBe(4)
    expect(sessionPhaseLabel(guardian)).toBe('Wards 1 of 4')
    expect(regent.testimonyInterruptRequired).toBe(true)
    expect(regent.authoredOrder).toEqual(['minotaur', 'chronos'])
    expect(regent.resolution).toMatchObject({ authored: true, executionPrompt: false })
    expect(regent.encounterMetadata).toMatchObject({
      testimonyInterruptRequired: true,
      seal: null,
      seals: null,
    })
  })
})
