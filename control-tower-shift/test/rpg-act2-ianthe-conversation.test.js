import { describe, expect, it } from 'vitest'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { ACT2_TIDE_ORDER } from '../src/rpg/act2Content.js'
import { REGISTERED_MAPS, rpgConversationById, rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

// Thessa's closing line in Act I promises Ianthe: "Ianthe keeps the old
// tide-charts on the Pelagos strand — if anyone can read what the fragment
// remembers, it is her." Ianthe never actually appeared anywhere in Act II
// until this scene. Drafted by a governed Hermes worker (qwen/qwen3.8-flash)
// per CLAUDE-HERMES-SWARM-DIRECTIVE.md's dialogue factory and independently
// re-verified here (schema, word count, graph integrity, prohibited-reveals
// list) before integration — a Hermes handoff is a claim, not accepted work.
const CONVERSATION_ID = 'act2-ianthe-first-meeting'
const NPC_ID = 'ianthe-tidecharts'

function atMap(state, mapId, position) {
  const map = rpgMapById(mapId)
  return {
    ...state,
    status: 'playing',
    world: {
      ...state.world,
      regionId: map.region,
      mapId,
      spawnId: map.spawn.id,
      position: position || { x: map.spawn.x, y: map.spawn.y },
      facing: map.spawn.facing || 0,
    },
  }
}

describe('Ianthe world placement', () => {
  it('places a physical npc entity at Pelagos Harbor with the authored conversation', () => {
    const map = REGISTERED_MAPS['pelagos-harbor']
    const entity = map.entities.find((candidate) => candidate.id === NPC_ID)
    expect(entity).toBeTruthy()
    expect(entity).toMatchObject({ kind: 'npc', name: 'Ianthe', conversationId: CONVERSATION_ID })
  })

  it('is reachable from every spawn across the full tide cycle', () => {
    const map = REGISTERED_MAPS['pelagos-harbor']
    const entity = map.entities.find((candidate) => candidate.id === NPC_ID)
    for (const routeStateId of ACT2_TIDE_ORDER) {
      for (const spawn of Object.values(map.spawns)) {
        const path = findWorldPath(map, spawn, entity, { routeStateId })
        expect(path.length, `${spawn.id}@${routeStateId}`).toBeGreaterThan(0)
        expect(Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y)).toBeLessThan(56)
      }
    }
  })

  it('stays physically distinct from every other Pelagos Harbor target', () => {
    const map = REGISTERED_MAPS['pelagos-harbor']
    const entity = map.entities.find((candidate) => candidate.id === NPC_ID)
    for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== NPC_ID)) {
      expect(Math.hypot(target.x - entity.x, target.y - entity.y), target.id).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('Ianthe conversation registration', () => {
  it('registers a real, frozen, multi-node line graph with resolvable links', () => {
    const convo = rpgConversationById(CONVERSATION_ID)
    expect(convo).toBeTruthy()
    expect(convo.speakerIds).toEqual(['ianthe', 'kallias'])
    expect(convo.nodes[convo.start]).toBeTruthy()
    expect(Object.keys(convo.nodes).length).toBeGreaterThanOrEqual(8)
    expect(Object.isFrozen(convo)).toBe(true)
    expect(Object.isFrozen(convo.nodes)).toBe(true)

    let totalWords = 0
    const effectIds = []
    for (const [nodeId, node] of Object.entries(convo.nodes)) {
      if (node.text) {
        expect(node.speakerId, nodeId).toMatch(/\S/)
        totalWords += node.text.trim().split(/\s+/).length
      }
      if (node.next) expect(convo.nodes[node.next], `${nodeId}→${node.next}`).toBeTruthy()
      for (const choice of node.choices || []) {
        expect(choice.id).toMatch(/^[a-z0-9-]+$/)
        totalWords += choice.text.trim().split(/\s+/).length
        if (choice.next) expect(convo.nodes[choice.next], `${nodeId}:${choice.id}→${choice.next}`).toBeTruthy()
      }
      for (const effect of node.effects || []) {
        expect(effect.kind).toBe('flag')
        effectIds.push(effect.id)
      }
    }
    expect(new Set(effectIds).size).toBe(effectIds.length)
    expect(totalWords).toBeGreaterThanOrEqual(220)
    expect(totalWords).toBeLessThanOrEqual(380)
  })

  it('carries exactly one required, reconverging player choice', () => {
    const convo = rpgConversationById(CONVERSATION_ID)
    const choiceNodes = Object.values(convo.nodes).filter((node) => node.choices?.length > 0)
    expect(choiceNodes).toHaveLength(1)
    const [choiceNode] = choiceNodes
    expect(choiceNode.choices).toHaveLength(2)
    const ids = choiceNode.choices.map((choice) => choice.id)
    expect(new Set(ids).size).toBe(2)
    // Both branches must reconverge (not stay permanently divergent) before
    // the conversation's single terminal node.
    const targets = choiceNode.choices.map((choice) => convo.nodes[choice.next])
    const reconvergeAt = new Set(targets.map((node) => node.next))
    expect(reconvergeAt.size).toBe(1)
  })

  it('reports zero new content-validation errors and no missing/unresolved conversation issues', () => {
    const report = validateRPGContent()
    expect(report.summary.errors).toBe(0)
    expect(report.issues.filter((issue) => issue.code === 'MISSING_CONVERSATION')).toEqual([])
    expect(report.issues.filter((issue) => issue.code === 'UNRESOLVED_CONVERSATION_NODE')).toEqual([])
  })

  it('never uses "Oathbearer" as visible dialogue text and never resolves a Salt Covenant formulation', () => {
    const convo = rpgConversationById(CONVERSATION_ID)
    for (const node of Object.values(convo.nodes)) {
      if (node.text) expect(node.text).not.toMatch(/Oathbearer/i)
      for (const choice of node.choices || []) expect(choice.text).not.toMatch(/Oathbearer/i)
    }
    for (const formulation of ['harbor-first', 'boundary-first', 'shared-crossing']) {
      const mentioned = Object.values(convo.nodes).some((node) => node.text?.includes(formulation))
      expect(mentioned, formulation).toBe(false)
    }
  })
})

describe('TALK / CHOOSE / DIALOGUE_END — meeting Ianthe', () => {
  it('refuses to talk to her away from Pelagos Harbor', () => {
    const state = atMap(createInitialState(), 'olive-road')
    const result = applyEvent(state, { type: 'TALK', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    expect(result).toBe(state)
  })

  it('enters dialogue on TALK and refuses to end before the required choice is made', () => {
    let state = atMap(createInitialState(), 'pelagos-harbor')
    state = applyEvent(state, { type: 'TALK', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    expect(state.status).toBe('in-dialogue')

    const stillOpen = applyEvent(state, { type: 'DIALOGUE_END', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    expect(stillOpen.status).toBe('in-dialogue')
  })

  it('completes exact-once after the required choice, setting ianthe-met and the completion flag', () => {
    let state = atMap(createInitialState(), 'pelagos-harbor')
    state = applyEvent(state, { type: 'TALK', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    state = applyEvent(state, { type: 'CHOOSE', choiceId: 'ianthe-hand-over-fragment' })
    expect(state.flags['conversation-choice:act2-ianthe-first-meeting:ianthe-hand-over-fragment']).toBe(true)

    state = applyEvent(state, { type: 'DIALOGUE_END', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    expect(state.status).toBe('playing')
    expect(state.flags['ianthe-met']).toBe(true)
    expect(state.flags['conversation:completed:act2-ianthe-first-meeting']).toBe(true)

    // Talking to her again replays the same completed conversation without
    // duplicating its effect.
    const before = state
    state = applyEvent(state, { type: 'TALK', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    state = applyEvent(state, { type: 'CHOOSE', choiceId: 'ianthe-keep-fragment-close' })
    state = applyEvent(state, { type: 'DIALOGUE_END', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    expect(state.flags).toEqual(before.flags)
  })

  it('accepts the other branch of the choice identically', () => {
    let state = atMap(createInitialState(), 'pelagos-harbor')
    state = applyEvent(state, { type: 'TALK', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    state = applyEvent(state, { type: 'CHOOSE', choiceId: 'ianthe-keep-fragment-close' })
    state = applyEvent(state, { type: 'DIALOGUE_END', npcId: NPC_ID, conversationId: CONVERSATION_ID })
    expect(state.status).toBe('playing')
    expect(state.flags['ianthe-met']).toBe(true)
  })
})
