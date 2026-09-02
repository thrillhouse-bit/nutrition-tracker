import { describe, expect, it } from 'vitest'
import { ACT3_CONVERSATIONS, act3ConversationById } from '../src/rpg/act3Conversations.js'
import { ACT3_MAIN_QUEST_ID } from '../src/rpg/act3Content.js'
import { ACT3_RUNTIME_MAPS } from '../src/rpg/act3Runtime.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import {
  REGISTERED_CONVERSATIONS,
  rpgConversationById,
} from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

const EXPECTED_IDS = Object.freeze([
  'act3-demeter-stilled-year',
  'act3-kleio-testimony',
  'act3-myrto-stilled-year',
  'act3-persephone-stilled-year',
  'act3-phaon-stilled-year',
])

function allAct3Npcs() {
  return Object.values(ACT3_RUNTIME_MAPS)
    .flatMap((map) => map.entities || [])
    .filter((entity) => entity.kind === 'npc')
}

function stateAtObjective(objectiveIndex, mapId, spawnId = 'test-spawn') {
  const initial = createInitialState()
  return {
    ...initial,
    status: 'playing',
    mainQuestId: ACT3_MAIN_QUEST_ID,
    world: {
      ...initial.world,
      regionId: 'fields-of-kore',
      mapId,
      spawnId,
      position: { x: 300, y: 300 },
    },
    quests: {
      ...initial.quests,
      [ACT3_MAIN_QUEST_ID]: {
        state: 'active',
        objectiveIndex,
        objectiveCounts: {},
      },
    },
  }
}

describe('Act III authored conversation registry', () => {
  it('registers every exact conversation reference used by Act III NPCs', () => {
    const npcConversationIds = [...new Set(allAct3Npcs().map((npc) => npc.conversationId))].sort()
    expect(npcConversationIds).toEqual(EXPECTED_IDS)
    expect(Object.keys(ACT3_CONVERSATIONS).sort()).toEqual(EXPECTED_IDS)

    for (const npc of allAct3Npcs()) {
      const conversation = rpgConversationById(npc.conversationId)
      expect(conversation, `${npc.id}:${npc.conversationId}`).toBe(ACT3_CONVERSATIONS[npc.conversationId])
      expect(conversation.speakerIds).toContain(npc.id)
      expect(REGISTERED_CONVERSATIONS[npc.conversationId]).toBe(conversation)
    }
  })

  it('uses real multi-node line graphs with resolvable links and stable effects', () => {
    for (const conversationId of EXPECTED_IDS) {
      const conversation = act3ConversationById(conversationId)
      expect(conversation.id).toBe(conversationId)
      expect(conversation.nodes[conversation.start]).toBeTruthy()
      expect(Object.keys(conversation.nodes).length).toBeGreaterThanOrEqual(3)
      expect(Object.isFrozen(conversation)).toBe(true)
      expect(Object.isFrozen(conversation.nodes)).toBe(true)

      const effectIds = []
      for (const [nodeId, node] of Object.entries(conversation.nodes)) {
        expect(node.speakerId, `${conversationId}:${nodeId}`).toMatch(/\S/)
        expect(node.text.trim().split(/\s+/).length, `${conversationId}:${nodeId}`).toBeGreaterThanOrEqual(8)
        if (node.next) expect(conversation.nodes[node.next], `${conversationId}:${nodeId}→${node.next}`).toBeTruthy()
        for (const choice of node.choices || []) {
          expect(choice.id).toMatch(/^[a-z0-9-]+$/)
          if (choice.next) expect(conversation.nodes[choice.next]).toBeTruthy()
        }
        for (const effect of node.effects || []) {
          expect(['flag', 'marker']).toContain(effect.kind)
          if (effect.kind === 'flag') effectIds.push(effect.id)
          if (effect.kind === 'marker') {
            expect(ACT3_RUNTIME_MAPS[effect.mapId]?.entities.some((entity) => entity.id === effect.entityId)).toBe(true)
          }
        }
      }
      expect(new Set(effectIds).size).toBe(effectIds.length)
    }
  })

  it('resolves the petition objective conversation canonically', () => {
    const petition = rpgConversationById('act3-kleio-testimony')
    expect(petition).toBe(ACT3_CONVERSATIONS['act3-kleio-testimony'])
    expect(petition.speakerIds).toEqual(['kleio', 'kallias'])
    expect(petition.nodes['join-after-witness'].effects).toContainEqual({
      kind: 'flag', id: 'act3-kleio-witness-identified', value: true,
    })
  })

  it('closes every MISSING_CONVERSATION issue in the canonical validator', () => {
    const report = validateRPGContent()
    expect(report.issues.filter((issue) => issue.code === 'MISSING_CONVERSATION')).toEqual([])
    expect(report.issues.filter((issue) => issue.code === 'UNRESOLVED_CONVERSATION_NODE')).toEqual([])
  })
})

describe('Act III conversation progression compatibility', () => {
  it('records each order-free village testimony exactly once after its dialogue ends', () => {
    let state = stateAtObjective(0, 'wheat-village', 'granary')
    const witnesses = [
      ['villager-2', 'act3-phaon-stilled-year'],
      ['demeter', 'act3-demeter-stilled-year'],
      ['villager-1', 'act3-myrto-stilled-year'],
      ['persephone', 'act3-persephone-stilled-year'],
    ]

    for (let index = 0; index < witnesses.length; index += 1) {
      const [npcId, conversationId] = witnesses[index]
      state = applyEvent(state, { type: 'TALK', npcId, conversationId })
      expect(state.status, conversationId).toBe('in-dialogue')
      state = applyEvent(state, { type: 'DIALOGUE_END', npcId, conversationId })
      expect(state.status, conversationId).toBe('playing')
      const progress = state.quests[ACT3_MAIN_QUEST_ID]
      if (index < witnesses.length - 1) {
        expect(progress.objectiveIndex).toBe(0)
        expect(progress.objectiveCounts['hear-the-stilled-year']).toBe(index + 1)
      } else {
        expect(progress.objectiveIndex).toBe(1)
      }
    }

    const completed = state
    state = applyEvent(state, {
      type: 'TALK', npcId: 'demeter', conversationId: 'act3-demeter-stilled-year',
    })
    state = applyEvent(state, {
      type: 'DIALOGUE_END', npcId: 'demeter', conversationId: 'act3-demeter-stilled-year',
    })
    expect(state.quests[ACT3_MAIN_QUEST_ID]).toEqual(completed.quests[ACT3_MAIN_QUEST_ID])
  })

  it('advances Kleio testimony once while retaining its authored witness effects', () => {
    let state = stateAtObjective(4, 'asphodel-gate', 'from-sanctuary')
    state = applyEvent(state, {
      type: 'TALK', npcId: 'kleio', conversationId: 'act3-kleio-testimony',
    })
    expect(state.status).toBe('in-dialogue')
    state = applyEvent(state, {
      type: 'DIALOGUE_END', npcId: 'kleio', conversationId: 'act3-kleio-testimony',
    })

    expect(state.status).toBe('playing')
    expect(state.quests[ACT3_MAIN_QUEST_ID].objectiveIndex).toBe(5)
    expect(state.flags['act3-kleio-witness-identified']).toBe(true)
    expect(state.flags['marker:wheat-village:return-covenant-table']).toBe(true)
  })
})
