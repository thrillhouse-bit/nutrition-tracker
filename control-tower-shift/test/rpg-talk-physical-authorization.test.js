import { describe, expect, it } from 'vitest'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

function atNpc(state, npcId) {
  const map = rpgMapById('beacon-overlook')
  const npc = map.entities.find((entity) => entity.id === npcId)
  const spawn = Object.values(map.spawns)[0]
  const path = findWorldPath(map, spawn, npc)
  expect(path.length).toBeGreaterThan(0)
  return { ...state, world: { regionId: map.region, mapId: map.id, spawnId: spawn.id, position: path.at(-1), facing: 0 } }
}

describe('TALK physical authorization', () => {
  it('requires the exact nearby authored NPC before entering dialogue', () => {
    const nearby = atNpc(createInitialState(), 'thessa')
    const remote = { ...nearby, world: { ...nearby.world, position: { x: 40, y: 40 } } }
    expect(applyEvent(remote, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })).toBe(remote)
    expect(applyEvent(remote, { type: 'TALK_COMPLETE', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })).toBe(remote)
    expect(applyEvent(nearby, { type: 'TALK', npcId: 'forged', conversationId: 'act1-thessa-overlook' })).toBe(nearby)
    expect(applyEvent(nearby, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })).toMatchObject({ status: 'in-dialogue' })
  })

  it('keeps an unintegrated authored-objective fallback physical and exact-NPC-bound', () => {
    const base = createInitialState()
    const seeded = {
      ...base,
      mainQuestId: 'mq-act1-ash-at-dawn',
      quests: {
        ...base.quests,
        'mq-act1-ash-at-dawn': { state: 'active', objectiveIndex: 0, objectiveCounts: {} },
      },
    }
    // The real Act I objective remains an ordinary conversation; an unknown
    // fallback cannot pass resolveConversationId unless an authored objective
    // requested that exact NPC/conversation pair.
    const nearby = atNpc(seeded, 'thessa')
    expect(applyEvent(nearby, { type: 'TALK', npcId: 'thessa', conversationId: 'forged-conversation' })).toBe(nearby)
  })
})
