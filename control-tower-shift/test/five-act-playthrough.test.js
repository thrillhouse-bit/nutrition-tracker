import { describe, expect, it } from 'vitest'
import { rpgMapById, rpgSpawnById } from '../src/rpg/registry.js'
import { applyEvent, createInitialState, currentObjective } from '../src/rpg/state.js'

const send = (state, type, payload = {}) => applyEvent(state, { type, ...payload })

function atMap(state, mapId, spawnId) {
  const map = rpgMapById(mapId)
  const spawn = rpgSpawnById(mapId, spawnId)
  expect(map, mapId).toBeTruthy()
  expect(spawn, `${mapId}:${spawnId}`).toBeTruthy()
  return {
    ...state,
    status: 'playing',
    world: {
      regionId: map.region,
      mapId,
      spawnId: spawn.id,
      position: { x: spawn.x, y: spawn.y },
      facing: spawn.facing || 0,
    },
  }
}

function clearEncounter(state, encounterId, mapId, spawnId) {
  let next = atMap(state, mapId, spawnId)
  next = send(next, 'ENTER_ENCOUNTER', { encounterId })
  expect(next.status, encounterId).toBe('in-combat')
  next = send(next, 'COMBAT_WON', { encounterId })
  expect(next.status, encounterId).toBe('playing')
  return next
}

function finishDialogue(state, npcId, conversationId) {
  let next = send(state, 'TALK', { npcId, conversationId })
  expect(next.status, conversationId).toBe('in-dialogue')
  return send(next, 'DIALOGUE_END', { npcId, conversationId })
}

function seededActOneBoundary() {
  const initial = createInitialState()
  return {
    ...initial,
    status: 'ending',
    protagonist: { ...initial.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
    quests: {
      ...initial.quests,
      'mq-act1-ash-at-dawn': { state: 'completed', objectiveIndex: 7, objectiveCounts: {} },
    },
    flags: { 'act1-far-sighted-restored': true },
    inventory: { ...initial.inventory, epithetFragments: ['far-sighted'] },
  }
}

describe('registered five-act playthrough contract', () => {
  it('completes every authored main objective and crosses every chapter boundary', () => {
    let state = send(seededActOneBoundary(), 'BEGIN_ACT', { act: 2 })
    expect(state.world.mapId).toBe('pelagos-harbor')

    state = finishDialogue(state, 'melite', 'act2-melite-oath-post')
    state = send(state, 'REACH', { mapId: 'breakwater-road', markerId: 'surge-witness' })
    state = clearEncounter(state, 'enc-act2-nereid-caves', 'nereid-caves', 'from-breakwater')
    for (const entityId of ['nereid-witness-1', 'nereid-witness-2', 'nereid-witness-3']) state = send(state, 'INTERACT', { entityId })
    for (const entityId of ['pressure-shell-1', 'pressure-shell-2', 'pressure-shell-3']) state = send(state, 'INTERACT', { entityId })
    state = clearEncounter(state, 'enc-act2-anchorage', 'storm-anchorage', 'from-caves')
    state = atMap(state, 'archive-barge-deck', 'from-anchorage')
    for (const entityId of ['cipher-folio-1', 'cipher-folio-2']) state = send(state, 'INTERACT', { entityId })
    state = clearEncounter(state, 'boss-act2-archive-leviathan', 'archive-barge-deck', 'from-anchorage')
    state = send(state, 'CHOOSE', { choiceId: 'shared-crossing' })
    expect(state.status).toBe('ending')
    expect(state.quests['mq-act2-salt-covenant'].state).toBe('completed')

    state = send(state, 'BEGIN_ACT', { act: 3 })
    expect(state.world.mapId).toBe('wheat-village')
    expect(state.flags['act2-salt-covenant-ratified']).toBe(true)
    for (const [npcId, conversationId] of [
      ['demeter', 'act3-demeter-stilled-year'], ['persephone', 'act3-persephone-stilled-year'],
      ['villager-1', 'act3-myrto-stilled-year'], ['villager-2', 'act3-phaon-stilled-year'],
    ]) state = finishDialogue(state, npcId, conversationId)
    state = atMap(state, 'winter-orchard', 'from-village')
    state = send(state, 'INTERACT', { entityId: 'harvest-altar' })
    state = send(state, 'INTERACT', { entityId: 'winter-altar' })
    state = clearEncounter(state, 'enc-act3-orchard-tracks', 'winter-orchard', 'from-village')
    state = atMap(state, 'kore-sanctuary', 'from-orchard')
    for (const entityId of ['pomegranate-seal-1', 'pomegranate-seal-2', 'pomegranate-seal-3', 'pomegranate-seal-4']) state = send(state, 'INTERACT', { entityId })
    state = atMap(state, 'asphodel-gate', 'from-sanctuary')
    state = finishDialogue(state, 'kleio', 'act3-kleio-testimony')
    state = send(state, 'CHOOSE', { choiceId: 'witnessed-cycle' })
    state = clearEncounter(state, 'boss-act3-winter-mother-echo', 'threshing-circle', 'from-village')
    state = send(atMap(state, 'wheat-village', 'first-thaw'), 'REACH', { mapId: 'wheat-village', markerId: 'first-thaw' })
    expect(state.status).toBe('ending')

    state = send(state, 'BEGIN_ACT', { act: 4 })
    expect(state.world.mapId).toBe('slag-road')
    state = send(state, 'CHOOSE', { choiceId: 'athena-precise-route' })
    state = clearEncounter(state, 'enc-act4-foundry-threshold', 'bronze-foundry', 'from-slag-road')
    state = atMap(state, 'name-press', 'from-foundry')
    state = send(state, 'INTERACT', { entityId: 'prometheus-brazier' })
    state = atMap(state, 'atlas-vault', 'from-name-press')
    for (const entityId of ['chain-anchor-1', 'chain-anchor-2', 'chain-anchor-3', 'chain-anchor-4']) state = send(state, 'INTERACT', { entityId })
    for (const entityId of ['cell-hercules', 'cell-smith-1', 'cell-smith-2']) state = send(state, 'INTERACT', { entityId })
    state = send(state, 'CHOOSE', { choiceId: 'rejection-firm' })
    state = clearEncounter(state, 'boss-act4-name-press-colossus', 'false-constellation', 'from-vault')
    state = send(state, 'CHOOSE', { choiceId: 'revocable-hearths' })
    expect(state.status).toBe('ending')
    expect(state.flags['act4-mortal-draft-ratified']).toBe(true)

    state = send(state, 'BEGIN_ACT', { act: 5 })
    expect(state.world.mapId).toBe('nyx-foothold')
    state = finishDialogue(state, 'thessa', 'act5-nyx-muster')
    state = atMap(state, 'night-stair', 'from-foothold')
    for (const entityId of ['memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4']) state = send(state, 'INTERACT', { entityId })
    state = finishDialogue(state, 'selene', 'act5-selene-reflection')
    state = atMap(state, 'false-sky', 'from-night-stair')
    for (const entityId of ['sun-mirror-1', 'sun-mirror-2', 'sun-mirror-3']) state = send(state, 'INTERACT', { entityId })
    state = send(state, 'REACH', { mapId: 'false-sky', markerId: 'fracture-exit' })
    state = atMap(state, 'silent-loom-approach', 'from-false-sky')
    for (const entityId of ['seal-far-sighted', 'seal-salt-covenant', 'seal-she-who-returns', 'seal-shared-fire']) state = send(state, 'INTERACT', { entityId })
    state = clearEncounter(state, 'boss-act5-loom-guardian', 'silent-loom', 'from-approach')
    state = clearEncounter(state, 'boss-act5-quiet-regent', 'silent-loom', 'regent-phase')
    expect(currentObjective(state).id).toBe('write-the-new-accord')
    state = send(state, 'BEGIN_DIALOGUE', { conversationId: 'act5-regent-interruption' })
    state = send(state, 'CHOOSE', { choiceId: 'keeper-testimony' })
    state = send(state, 'DIALOGUE_END', { conversationId: 'act5-regent-interruption' })
    expect(state.flags['act5-neutral-keeper-testified']).toBe(true)
    expect(state.flags['act5-regent-testimony-heard']).toBe(true)
    state = send(state, 'CHOOSE', { choiceId: 'renewed-compact' })
    expect(state.flags['act5-ending']).toBe('renewed-compact')
    state = atMap(state, 'silent-loom', 'accord-chamber')
    state = finishDialogue(state, 'kallias', 'act5-epilogue')

    expect(state.status).toBe('ending')
    expect(state.world.mapId).toBe('accord-overlook')
    expect(state.quests['mq-act5-last-name'].state).toBe('completed')
    expect(state.flags['mq-act5-last-name-completed']).toBe(true)
    expect(state.quests['sq-act5-light-no-map-remembers']).toBeUndefined()
    expect(state.flags['evidence-independent-light']).toBeUndefined()
    expect(send(state, 'ACK_ENDING').status).toBe('playing')
  })
})
