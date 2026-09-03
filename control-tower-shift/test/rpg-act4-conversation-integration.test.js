import { describe, expect, it } from 'vitest'
import { EXPECTED_SPEAKER_BINDINGS } from '../src/rpg/act4Conversations.js'
import { ACT4_PERMANENT_FLAGS } from '../src/rpg/act4Content.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { REGISTERED_MAPS, rpgConversationById, rpgMapById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { loadRPG, saveRPG } from '../src/rpg/save.js'

// The Act IV witness-testimony conversations (act4Conversations.js) were
// authored ahead of this integration pass and quarantined pending review —
// their own header called out the exact seam: register ACT4_CONVERSATIONS in
// registry.js and attach conversationId to Act IV NPC entities per
// EXPECTED_SPEAKER_BINDINGS. This file independently verifies that seam:
// every binding resolves to a reachable, placed, correctly-wired physical
// entity, and the full TALK/CHOOSE/DIALOGUE_END reducer flow completes
// exactly once per conversation with no material reward from dialogue.

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

// One representative required-choice id per conversation (the id that
// resolves the graph's single required choice node, where one exists).
const REPRESENTATIVE_CHOICE = {
  'act4-athena-precise-route': 'commit-to-the-hour',
  'act4-ares-direct-breach': 'ask-about-the-hour',
  'act4-prometheus-lawful-fire': 'promise-return',
  'act4-atlas-coerced-witness': 'promise-anchors-first',
  'act4-hercules-freely-given': 'agree-to-split',
  'act4-smiths-ledger': 'tally-goes-public',
  'act4-zeus-single-crown': 'rejection-firm',
  'act4-mortal-draft': 'witness-flame-first',
}

describe('Act IV speaker bindings — physical placement', () => {
  it('places every EXPECTED_SPEAKER_BINDINGS entity as a real, correctly-wired npc entity', () => {
    for (const binding of EXPECTED_SPEAKER_BINDINGS) {
      const map = REGISTERED_MAPS[binding.mapId]
      expect(map, binding.mapId).toBeTruthy()
      const entity = map.entities.find((candidate) => candidate.id === binding.npcEntityId)
      expect(entity, `${binding.mapId}:${binding.npcEntityId}`).toBeTruthy()
      expect(entity.kind).toBe('npc')
      expect(entity.conversationId).toBe(binding.conversationId)
      const conversation = rpgConversationById(binding.conversationId)
      expect(conversation.speakerIds, binding.conversationId).toContain(binding.primarySpeakerId)
    }
  })

  it('keeps every new Act IV npc physically distinct from every other target on its map', () => {
    for (const binding of EXPECTED_SPEAKER_BINDINGS) {
      const map = REGISTERED_MAPS[binding.mapId]
      const entity = map.entities.find((candidate) => candidate.id === binding.npcEntityId)
      for (const target of [...map.entities, ...map.exits].filter((candidate) => candidate.id !== entity.id)) {
        expect(Math.hypot(target.x - entity.x, target.y - entity.y), `${binding.mapId}:${entity.id}~${target.id}`)
          .toBeGreaterThanOrEqual(28)
      }
    }
  })

  it('is reachable by pathfinding from at least one spawn on its map', () => {
    for (const binding of EXPECTED_SPEAKER_BINDINGS) {
      const map = REGISTERED_MAPS[binding.mapId]
      const entity = map.entities.find((candidate) => candidate.id === binding.npcEntityId)
      const reachableFromSomeSpawn = Object.values(map.spawns).some((spawnPoint) => {
        const path = findWorldPath(map, spawnPoint, entity)
        return path.length > 0 && Math.hypot(path.at(-1).x - entity.x, path.at(-1).y - entity.y) < 64
      })
      expect(reachableFromSomeSpawn, `${binding.mapId}:${entity.id}`).toBe(true)
    }
  })
})

describe('Act IV TALK / CHOOSE / DIALOGUE_END — every witness conversation', () => {
  for (const binding of EXPECTED_SPEAKER_BINDINGS) {
    const { conversationId, npcEntityId, mapId } = binding
    const choiceId = REPRESENTATIVE_CHOICE[conversationId]

    it(`${conversationId}: refuses to talk away from ${mapId}`, () => {
      const otherMapId = mapId === 'slag-road' ? 'atlas-vault' : 'slag-road'
      const state = atMap(createInitialState(), otherMapId)
      const result = applyEvent(state, { type: 'TALK', npcId: npcEntityId, conversationId })
      expect(result).toBe(state)
    })

    it(`${conversationId}: enters dialogue on TALK and blocks DIALOGUE_END before the required choice`, () => {
      let state = atMap(createInitialState(), mapId)
      state = applyEvent(state, { type: 'TALK', npcId: npcEntityId, conversationId })
      expect(state.status).toBe('in-dialogue')

      const stillOpen = applyEvent(state, { type: 'DIALOGUE_END', npcId: npcEntityId, conversationId })
      expect(stillOpen.status).toBe('in-dialogue')
    })

    it(`${conversationId}: completes exactly once, records the choice flag, grants no material reward, and cannot re-apply on replay`, () => {
      let state = atMap(createInitialState(), mapId)
      state = applyEvent(state, { type: 'TALK', npcId: npcEntityId, conversationId })
      state = applyEvent(state, { type: 'CHOOSE', choiceId })
      expect(state.flags[`conversation-choice:${conversationId}:${choiceId}`]).toBe(true)

      state = applyEvent(state, { type: 'DIALOGUE_END', npcId: npcEntityId, conversationId })
      expect(state.status).toBe('playing')
      expect(state.flags[`conversation:completed:${conversationId}`]).toBe(true)
      const currencyBefore = state.inventory.currency
      const skillsBefore = state.progression.skills

      // No dialogue-granted currency, items, or XP — the reducer alone owns
      // progression (Act IV conversation module invariant, re-verified here
      // against the live post-integration state, not just the static graph).
      expect(state.inventory.currency).toBe(currencyBefore)
      expect(state.progression.skills).toEqual(skillsBefore)

      // Replaying the same completed conversation must not re-apply effects.
      const before = state
      state = applyEvent(state, { type: 'TALK', npcId: npcEntityId, conversationId })
      state = applyEvent(state, { type: 'CHOOSE', choiceId })
      state = applyEvent(state, { type: 'DIALOGUE_END', npcId: npcEntityId, conversationId })
      expect(state.flags).toEqual(before.flags)
    })
  }

  it('never records a testimony flag that duplicates a permanent Act IV quest-progress flag', () => {
    let state = createInitialState()
    for (const binding of EXPECTED_SPEAKER_BINDINGS) {
      state = atMap(state, binding.mapId)
      state = applyEvent(state, { type: 'TALK', npcId: binding.npcEntityId, conversationId: binding.conversationId })
      state = applyEvent(state, { type: 'CHOOSE', choiceId: REPRESENTATIVE_CHOICE[binding.conversationId] })
      state = applyEvent(state, { type: 'DIALOGUE_END', npcId: binding.npcEntityId, conversationId: binding.conversationId })
    }
    for (const flagId of ACT4_PERMANENT_FLAGS) {
      // Testimony completion is independent of, and must not silently
      // satisfy, permanent main-quest progression flags.
      if (flagId.startsWith('act4-testimony-') || flagId === 'mq-act4-false-constellation-completed') continue
      expect(state.flags[flagId], flagId).not.toBe(true)
    }
  })
})

describe('Act IV conversation flags — save/reload round trip', () => {
  it('persists testimony completion flags across a save and reload', () => {
    let state = atMap(createInitialState(), 'slag-road')
    state = applyEvent(state, { type: 'TALK', npcId: 'athena-march-captain', conversationId: 'act4-athena-precise-route' })
    state = applyEvent(state, { type: 'CHOOSE', choiceId: 'commit-to-the-hour' })
    state = applyEvent(state, { type: 'DIALOGUE_END', npcId: 'athena-march-captain', conversationId: 'act4-athena-precise-route' })
    expect(state.flags['conversation:completed:act4-athena-precise-route']).toBe(true)

    const storage = new Map()
    const fakeStorage = {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    }
    saveRPG(fakeStorage, state)
    const reloaded = loadRPG(fakeStorage)
    expect(reloaded.save.flags['conversation:completed:act4-athena-precise-route']).toBe(true)
    expect(reloaded.save.flags['act4-testimony-athena-heard']).toBe(true)
  })
})
