import { describe, expect, it, vi } from 'vitest'

const finalEncounterFixture = vi.hoisted(() => ({
  questId: 'test-final-clear-encounter',
  encounterId: 'enc-act1-entry',
  definition: {
    id: 'test-final-clear-encounter',
    kind: 'side',
    act: 1,
    objectives: [{ id: 'final-clear', kind: 'clear-encounter', encounterId: 'enc-act1-entry' }],
    rewards: [{ kind: 'item', itemId: 'tin-ore', quantity: 1 }],
  },
}))

vi.mock('../src/rpg/registry.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    rpgQuestDefById: (id) => id === finalEncounterFixture.questId
      ? finalEncounterFixture.definition
      : actual.rpgQuestDefById(id),
    rpgEncounterOwnerQuestId: (id) => id === finalEncounterFixture.encounterId
      ? finalEncounterFixture.questId
      : actual.rpgEncounterOwnerQuestId(id),
  }
})

import { applyEvent, createInitialState } from '../src/rpg/state.js'

function finalCombatState(overrides = {}) {
  const initial = createInitialState()
  return {
    ...initial,
    mainQuestId: finalEncounterFixture.questId,
    quests: {
      ...initial.quests,
      [finalEncounterFixture.questId]: { state: 'active', objectiveIndex: 0, objectiveCounts: {} },
    },
    status: 'in-combat',
    combatSnapshot: { encounterId: finalEncounterFixture.encounterId },
    ...overrides,
  }
}

describe('final clear-encounter settlement atomicity', () => {
  it('keeps the live combat snapshot, status, and completion flag byte-identical when final rewards cannot fit', () => {
    const initial = createInitialState()
    const state = finalCombatState({
      inventory: {
        ...initial.inventory,
        capacity: 28,
        slots: Array.from({ length: 28 }, () => ({ itemId: 'copper-ore', quantity: 1 })),
      },
    })

    const rejected = applyEvent(state, { type: 'COMBAT_WON', encounterId: finalEncounterFixture.encounterId })
    expect(rejected).toBe(state)
    expect(rejected.status).toBe('in-combat')
    expect(rejected.combatSnapshot).toBe(state.combatSnapshot)
    expect(rejected.flags['enc-act1-entry-cleared']).toBeUndefined()
  })

  it('commits a valid final encounter exactly once after the full settlement preflight succeeds', () => {
    const state = finalCombatState()
    const won = applyEvent(state, { type: 'COMBAT_WON', encounterId: finalEncounterFixture.encounterId })

    expect(won.status).toBe('playing')
    expect(won.combatSnapshot).toBeNull()
    expect(won.flags['enc-act1-entry-cleared']).toBe(true)
    expect(won.quests[finalEncounterFixture.questId]).toMatchObject({ state: 'completed', objectiveIndex: 1 })
    expect(won.inventory.slots).toContainEqual({ itemId: 'tin-ore', quantity: 1 })
    expect(applyEvent(won, { type: 'COMBAT_WON', encounterId: finalEncounterFixture.encounterId })).toBe(won)
  })
})
