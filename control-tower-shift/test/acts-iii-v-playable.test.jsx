// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { ACT5_LIGHT_FLAG, applyEvent, conversationRequiredChoicesMet, createInitialState, currentObjective, resolveConversationId } from '../src/rpg/state.js'
import { loadRPG, saveRPG } from '../src/rpg/save.js'
import { rpgMapById, rpgSpawnById } from '../src/rpg/registry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function laterState({ questId, objectiveIndex, mapId, spawnId, position, flags = {} }) {
  const initial = createInitialState()
  const map = rpgMapById(mapId)
  const spawn = rpgSpawnById(mapId, spawnId)
  return {
    ...initial,
    protagonist: { ...initial.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
    mainQuestId: questId,
    quests: { ...initial.quests, [questId]: { state: 'active', objectiveIndex, objectiveCounts: {} } },
    flags,
    world: {
      regionId: map.region,
      mapId,
      spawnId: spawn.id,
      position,
      facing: 0,
    },
  }
}

async function mountRPG(state) {
  expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
}

async function unmountRPG() {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = root = null
}

async function interact() {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Interact')
  expect(button).toBeTruthy()
  await act(async () => button.dispatchEvent(new Event('pointerdown', { bubbles: true })))
  await act(async () => { await Promise.resolve() })
}

async function clickWorldTarget(label) {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === label)
  expect(button).toBeTruthy()
  await act(async () => button.click())
  await act(async () => { await Promise.resolve() })
}

const send = (state, type, payload = {}) => applyEvent(state, { type, ...payload })

// Build the real Act V boss boundary through public story events. Only the
// accepted Act IV chapter boundary is seeded; map changes use authored gates.
function actFiveGuardianBoundary() {
  const initial = createInitialState()
  let state = {
    ...initial,
    status: 'ending',
    protagonist: { ...initial.protagonist, activePatronId: 'apollo', unlockedPatronIds: ['apollo'] },
    quests: {
      ...initial.quests,
      'mq-act2-salt-covenant': { state: 'completed', objectiveIndex: 9, objectiveCounts: {} },
      'mq-act3-withered-year': { state: 'completed', objectiveIndex: 8, objectiveCounts: {} },
      'mq-act4-false-constellation': { state: 'completed', objectiveIndex: 8, objectiveCounts: {} },
    },
    flags: {
      'act1-far-sighted-restored': true,
      'act2-salt-covenant-ratified': true,
      'act3-covenant-joined': true,
      'act4-mortal-draft-ratified': true,
      'mq-act4-false-constellation-completed': true,
    },
    inventory: { ...initial.inventory, epithetFragments: ['far-sighted'] },
  }
  state = send(state, 'BEGIN_ACT', { act: 5 })
  state = send(state, 'TALK', { npcId: 'thessa', conversationId: 'act5-nyx-muster' })
  state = send(state, 'DIALOGUE_END', { npcId: 'thessa', conversationId: 'act5-nyx-muster' })
  state = send(state, 'TRAVERSE', { viaGate: 'foothold-to-night-stair' })
  for (const entityId of ['memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4']) {
    state = send(state, 'INTERACT', { entityId })
  }
  state = send(state, 'TALK', { npcId: 'selene', conversationId: 'act5-selene-reflection' })
  state = send(state, 'DIALOGUE_END', { npcId: 'selene', conversationId: 'act5-selene-reflection' })
  state = send(state, 'TRAVERSE', { viaGate: 'night-stair-to-false-sky' })
  for (const entityId of ['sun-mirror-1', 'sun-mirror-2', 'sun-mirror-3']) {
    state = send(state, 'INTERACT', { entityId })
  }
  state = send(state, 'REACH', { mapId: 'false-sky', markerId: 'fracture-exit' })
  state = send(state, 'TRAVERSE', { viaGate: 'false-sky-to-loom-approach' })
  for (const entityId of ['seal-far-sighted', 'seal-salt-covenant', 'seal-she-who-returns', 'seal-shared-fire']) {
    state = send(state, 'INTERACT', { entityId })
  }
  state = send(state, 'TRAVERSE', { viaGate: 'loom-approach-to-silent-loom' })
  expect(state.world.mapId).toBe('silent-loom')
  expect(currentObjective(state)?.id).toBe('defeat-loom-guardian')
  return state
}

function actFiveRegentTestimony() {
  let state = actFiveGuardianBoundary()
  for (const encounterId of ['boss-act5-loom-guardian', 'boss-act5-quiet-regent']) {
    state = send(state, 'ENTER_ENCOUNTER', { encounterId })
    expect(state.status).toBe('in-combat')
    state = send(state, 'COMBAT_WON', { encounterId })
  }
  expect(currentObjective(state)?.id).toBe('write-the-new-accord')
  return send(state, 'BEGIN_DIALOGUE', { conversationId: 'act5-regent-interruption' })
}

function threeLightsReadyState({ mainObjectiveIndex = 4, completedDefaults = true } = {}) {
  const state = laterState({
    questId: 'mq-act5-last-name',
    objectiveIndex: mainObjectiveIndex,
    mapId: 'night-stair',
    spawnId: 'selene-overlook',
    position: { x: 476, y: 92 },
    // Selene's overlook is reachable through the moon lane in the public
    // story flow. Keep the fixture physically valid even when the default
    // conversations are intentionally incomplete; otherwise this UI test
    // asks a shadow-state player to interact from an unreachable moon pocket
    // and tests path rejection instead of dialogue routing.
    flags: {
      [ACT5_LIGHT_FLAG]: 'moon',
      ...(completedDefaults ? {
        'conversation:completed:act5-selene-reflection': true,
        'conversation:completed:act5-helios-false-dawn': true,
      } : {}),
    },
  })
  return {
    ...state,
    quests: {
      ...state.quests,
      'sq-act5-light-no-map-remembers': { state: 'active', objectiveIndex: 2, objectiveCounts: {} },
    },
  }
}

function placeAtNpc(state, mapId, npcId) {
  const map = rpgMapById(mapId)
  const npc = map.entities.find((entity) => entity.id === npcId && entity.kind === 'npc')
  const spawnId = Object.keys(map.spawns || {})[0]
  expect(npc, `${mapId}:${npcId}`).toBeTruthy()
  expect(rpgSpawnById(mapId, spawnId), `${mapId}:${spawnId}`).toBeTruthy()
  return {
    state: {
      ...state,
      status: 'playing',
      world: {
        regionId: map.region,
        mapId,
        spawnId,
        position: { x: npc.x, y: npc.y },
        facing: 0,
      },
    },
    npc,
  }
}

function contributeLight(state, mapId, npcId) {
  const placed = placeAtNpc(state, mapId, npcId)
  const conversationId = resolveConversationId(placed.state, placed.npc)
  expect(conversationId).toBe('act5-three-lights')
  let next = send(placed.state, 'TALK', { npcId, conversationId })
  expect(next.status).toBe('in-dialogue')
  next = send(next, 'DIALOGUE_END', { npcId, conversationId })
  expect(next.status).toBe('playing')
  return next
}

afterEach(async () => {
  await unmountRPG()
  window.localStorage.clear()
})

describe('Acts III–V shared playable UI', () => {
  it('switches the visible Act III season and records altar objective progress', async () => {
    await mountRPG(laterState({
      questId: 'mq-act3-withered-year', objectiveIndex: 1,
      mapId: 'winter-orchard', spawnId: 'from-village', position: { x: 314, y: 362 },
      flags: { 'act3:season-state': 'winter' },
    }))
    await interact()
    const { save } = loadRPG(window.localStorage)
    expect(save.flags['act3:season-state']).toBe('harvest')
    expect(save.quests['mq-act3-withered-year'].objectiveCounts['restore-orchard-paths']).toBe(1)
  })

  it.each([
    ['harvest then winter', 'harvest-altar', { x: 314, y: 362 }, 'winter-altar', { x: 646, y: 354 }, 'winter'],
    ['winter then harvest', 'winter-altar', { x: 646, y: 354 }, 'harvest-altar', { x: 314, y: 362 }, 'harvest'],
  ])('advances each altar exactly once and launches the ready-gated orchard guardian after %s', async (
    _order, firstId, firstPosition, secondId, secondPosition, endingSeason,
  ) => {
    let staged = laterState({
      questId: 'mq-act3-withered-year', objectiveIndex: 1,
      mapId: 'winter-orchard', spawnId: 'from-village', position: firstPosition,
      flags: { 'act3:season-state': 'winter' },
    })
    await mountRPG(staged)
    await interact()
    await interact()

    let saved = loadRPG(window.localStorage).save
    expect(saved.flags['act3:season-state']).toBe(firstId === 'harvest-altar' ? 'harvest' : 'winter')
    expect(saved.quests['mq-act3-withered-year']).toMatchObject({
      objectiveIndex: 1,
      objectiveCounts: { 'restore-orchard-paths': 1 },
    })

    await unmountRPG()
    staged = {
      ...saved,
      status: 'playing',
      world: { ...saved.world, position: secondPosition },
    }
    await mountRPG(staged)
    await interact()
    await interact()

    saved = loadRPG(window.localStorage).save
    expect(saved.flags['act3:season-state']).toBe(endingSeason)
    expect(saved.quests['mq-act3-withered-year']).toMatchObject({
      objectiveIndex: 2,
      objectiveCounts: { 'restore-orchard-paths': 2 },
    })

    await unmountRPG()
    staged = {
      ...saved,
      status: 'playing',
      world: { ...saved.world, position: { x: 550, y: 300 } },
    }
    await mountRPG(staged)
    await clickWorldTarget('Face the orchard guardian')

    expect(container.querySelector('[aria-label="Combat controls"]')).not.toBeNull()
    expect(container.textContent).toContain('Begin encounter')
    expect(container.querySelector('[data-testid="combat-hud"]')).toMatchObject({
      dataset: expect.objectContaining({ combatReady: 'false', arenaTick: '0', arenaHealth: '100' }),
    })
    const combatSave = loadRPG(window.localStorage).save
    // Combat is deliberately transient and the durable save remains at its
    // recoverable pre-encounter boundary while the mounted UI owns the arena.
    expect(combatSave.status).toBe('playing')
    expect(combatSave.flags['act3:season-state']).toBe(endingSeason)
  })

  it('cycles an Act IV pressure valve with a non-color HUD label', async () => {
    await mountRPG(laterState({
      questId: 'mq-act4-false-constellation', objectiveIndex: 1,
      mapId: 'bronze-foundry', spawnId: 'from-slag-road', position: { x: 298, y: 350 },
      flags: { 'act4:pressure-state': 'safe' },
    }))
    expect(container.textContent).toContain('Pressure: safe')
    await interact()
    const { save } = loadRPG(window.localStorage)
    expect(save.flags['act4:pressure-state']).toBe('venting')
  })

  it('shows only eligible Act V Accord choices with their promise and cost', async () => {
    await mountRPG(laterState({
      questId: 'mq-act5-last-name', objectiveIndex: 8,
      mapId: 'silent-loom', spawnId: 'accord-chamber', position: { x: 718, y: 266 },
      flags: {
        'choice:ratify-salt-covenant': 'shared-crossing',
        'choice:join-the-covenant': 'witnessed-cycle',
        'choice:ratify-mortal-draft': 'revocable-hearths',
      },
    }))
    await interact()
    expect(container.textContent).toContain('Renewed Compact')
    expect(container.textContent).toContain('Promise:')
    expect(container.textContent).toContain('Cost:')
    expect(container.textContent).not.toContain('Bounded Patrons')
    expect(container.textContent).not.toContain('Mortal Witness')
  })

  it('does not launch the Quiet Regent arena before the Loom Guardian is defeated', async () => {
    let state = actFiveGuardianBoundary()
    state = send(state, 'MOVE', { x: 592, y: 240 })
    await mountRPG(state)

    await clickWorldTarget('Begin the Quiet Regent boss encounter with testimony interruption')

    expect(container.querySelector('button[aria-label="Melee attack"]')).toBeNull()
    expect(container.textContent).toContain('That encounter is not available yet.')
    expect(loadRPG(window.localStorage).save.status).toBe('playing')
  })

  it('does not visually replay a cleared non-repeatable story encounter', async () => {
    let state = actFiveGuardianBoundary()
    state = send(state, 'ENTER_ENCOUNTER', { encounterId: 'boss-act5-loom-guardian' })
    expect(state.status).toBe('in-combat')
    state = send(state, 'COMBAT_WON', { encounterId: 'boss-act5-loom-guardian' })
    expect(state.flags['act5-loom-guardian-defeated']).toBe(true)
    state = send(state, 'MOVE', { x: 336, y: 294 })
    await mountRPG(state)

    await clickWorldTarget('Begin the Loom Guardian boss encounter')

    expect(container.querySelector('button[aria-label="Melee attack"]')).toBeNull()
    expect(container.textContent).toContain('That encounter is not available yet.')
    expect(loadRPG(window.localStorage).save.status).toBe('playing')
  })

  it('requires exactly one authored Regent witness before dialogue completion', () => {
    const testimony = actFiveRegentTestimony()
    expect(testimony.status).toBe('in-dialogue')
    expect(conversationRequiredChoicesMet(testimony, 'act5-regent-interruption')).toBe(false)

    const prematureEnd = send(testimony, 'DIALOGUE_END', { conversationId: 'act5-regent-interruption' })
    expect(prematureEnd).toBe(testimony)
    expect(prematureEnd.flags['act5-regent-testimony-heard']).toBeUndefined()
    expect(prematureEnd.flags['conversation:completed:act5-regent-interruption']).toBeUndefined()

    // Ianthe is authored but unavailable without her reveal prerequisite.
    expect(send(testimony, 'CHOOSE', { choiceId: 'ianthe-testimony' })).toBe(testimony)

    const accepted = send(testimony, 'CHOOSE', { choiceId: 'keeper-testimony' })
    expect(accepted.flags['act5-neutral-keeper-testified']).toBe(true)
    expect(accepted.flags['act5-ianthe-testified']).toBeUndefined()
    expect(accepted.flags['conversation-choice:act5-regent-interruption:keeper-testimony']).toBe(true)
    expect(conversationRequiredChoicesMet(accepted, 'act5-regent-interruption')).toBe(true)

    expect(send(accepted, 'CHOOSE', { choiceId: 'keeper-testimony' })).toBe(accepted)
    expect(send(accepted, 'CHOOSE', { choiceId: 'ianthe-testimony' })).toBe(accepted)

    const completed = send(accepted, 'DIALOGUE_END', { conversationId: 'act5-regent-interruption' })
    expect(completed.status).toBe('playing')
    expect(completed.flags['act5-regent-testimony-heard']).toBe(true)
    expect(completed.flags['conversation:completed:act5-regent-interruption']).toBe(true)
    expect(completed.flags['act5-neutral-keeper-testified']).toBe(true)
    expect(completed.flags['act5-ianthe-testified']).toBeUndefined()
  })

  it('records Apollo, Helios, and Selene in any order and rewards only the third unique contribution', () => {
    const speakers = [
      ['false-sky', 'apollo'],
      ['false-sky', 'helios'],
      ['night-stair', 'selene'],
    ]
    for (const order of [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ]) {
      let state = threeLightsReadyState()
      state = contributeLight(state, ...speakers[order[0]])
      expect(state.quests['sq-act5-light-no-map-remembers'].state).toBe('active')
      expect(state.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBe(1)
      expect(state.flags['evidence-independent-light']).toBeUndefined()

      const duplicate = contributeLight(state, ...speakers[order[0]])
      expect(duplicate.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBe(1)
      expect(duplicate.flags['evidence-independent-light']).toBeUndefined()
      state = contributeLight(duplicate, ...speakers[order[1]])
      expect(state.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBe(2)
      expect(state.flags['evidence-independent-light']).toBeUndefined()

      window.localStorage.clear()
      expect(saveRPG(window.localStorage, state)).toBe(true)
      state = loadRPG(window.localStorage).save
      expect(state.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBe(2)

      state = contributeLight(state, ...speakers[order[2]])
      expect(state.quests['sq-act5-light-no-map-remembers'].state).toBe('completed')
      expect(state.flags['evidence-independent-light']).toBe(true)
      expect(state.flags['act5-true-sky-restored']).toBe(true)
      expect(state.inventory.currency).toBe(50)
    }
  })

  it('keeps missing and unknown multi-NPC dialogue completion events inert', () => {
    const placed = placeAtNpc(threeLightsReadyState(), 'false-sky', 'apollo')
    const conversationId = resolveConversationId(placed.state, placed.npc)
    const talking = send(placed.state, 'TALK', { npcId: 'apollo', conversationId })
    expect(send(talking, 'DIALOGUE_END', { conversationId })).toBe(talking)
    expect(send(talking, 'DIALOGUE_END', { conversationId, npcId: 'unknown-light' })).toBe(talking)
    expect(talking.flags['evidence-independent-light']).toBeUndefined()
    expect(talking.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBeUndefined()
  })

  it('rejects an unreachable semantic target without queuing movement or a pending action', async () => {
    await mountRPG(laterState({
      questId: 'mq-act2-salt-covenant', objectiveIndex: 7,
      mapId: 'archive-barge-deck', spawnId: 'from-anchorage', position: { x: 82, y: 392 },
    }))
    const canvas = container.querySelector('canvas[aria-description]')
    const before = { x: canvas.dataset.playerX, y: canvas.dataset.playerY }

    // The mast is centered inside blocking geometry. A* can find a nearest
    // walkable cell, but that endpoint remains outside the 56 px interaction
    // radius and therefore must not become a latent semantic action.
    await clickWorldTarget('Avoid the falling mast')
    expect(container.textContent).toContain('No clear path to that point.')
    expect(container.querySelector('.rpg-move-marker')).toBeNull()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)) })
    expect(canvas.dataset.playerX).toBe(before.x)
    expect(canvas.dataset.playerY).toBe(before.y)
    expect(container.querySelector('.rpg-move-marker')).toBeNull()
  })

  it('continues to queue ordinary reachable ground-click movement', async () => {
    await mountRPG(laterState({
      questId: 'mq-act2-salt-covenant', objectiveIndex: 7,
      mapId: 'archive-barge-deck', spawnId: 'from-anchorage', position: { x: 82, y: 392 },
    }))
    const canvas = container.querySelector('canvas[aria-description]')
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540 })

    await act(async () => canvas.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, button: 0, clientX: 160, clientY: 392,
    })))

    expect(container.querySelector('.rpg-move-marker')).not.toBeNull()
    expect(container.textContent).not.toContain('No clear path to that point.')
  })

  it('prefers authored accessible target names while preserving visible action copy', async () => {
    await mountRPG(laterState({
      questId: 'mq-act5-last-name', objectiveIndex: 1,
      mapId: 'night-stair', spawnId: 'from-foothold', position: { x: 76, y: 390 },
    }))

    expect(container.querySelector('button[aria-label="Memory anchor one of four"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Stabilize the first witnessed deed"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Return to Nyx Foothold"]')).not.toBeNull()
    expect(container.textContent).toContain('Travel to Nyx Foothold')
  })

  it('stabilizes every Night Stair anchor exactly once without launching combat or changing polarity', async () => {
    const map = rpgMapById('night-stair')
    let staged = laterState({
      questId: 'mq-act5-last-name', objectiveIndex: 1,
      mapId: 'night-stair', spawnId: 'from-foothold', position: { x: 76, y: 390 },
      flags: { [ACT5_LIGHT_FLAG]: 'shadow' },
    })
    const anchorIds = ['memory-anchor-1', 'memory-anchor-2', 'memory-anchor-3', 'memory-anchor-4']

    for (let index = 0; index < anchorIds.length; index += 1) {
      const anchor = map.entities.find((entity) => entity.id === anchorIds[index])
      staged = {
        ...staged,
        status: 'playing',
        world: { ...staged.world, position: { x: anchor.x, y: anchor.y } },
      }
      await mountRPG(staged)
      await clickWorldTarget(anchor.accessibleLabel)

      let saved = loadRPG(window.localStorage).save
      expect(saved.quests['mq-act5-last-name'].objectiveCounts['cross-night-stair']).toBe(index + 1)
      expect(saved.flags[ACT5_LIGHT_FLAG]).toBe('shadow')
      expect(saved.status).toBe('playing')
      expect(container.querySelector('[aria-label="Combat controls"]')).toBeNull()

      // The physical target remains present, but reducer exact-once handling
      // makes a repeat click inert even after the fourth anchor advances.
      await clickWorldTarget(anchor.accessibleLabel)
      saved = loadRPG(window.localStorage).save
      expect(saved.quests['mq-act5-last-name'].objectiveCounts['cross-night-stair']).toBe(index + 1)
      expect(saved.flags[ACT5_LIGHT_FLAG]).toBe('shadow')
      expect(saved.status).toBe('playing')

      await unmountRPG()
      staged = saved
    }

    expect(staged.quests['mq-act5-last-name'].objectiveIndex).toBe(2)
    expect(staged.flags['act5-anchors-stable']).toBe(true)
  })

  it('keeps the Night Stair encounter, moon control, Selene, and moon bridge independently actionable', async () => {
    const map = rpgMapById('night-stair')
    const anchorCounts = { 'cross-night-stair': 4 }
    const quest = { state: 'active', objectiveIndex: 2, objectiveCounts: anchorCounts }
    const base = laterState({
      questId: 'mq-act5-last-name', objectiveIndex: 2,
      mapId: 'night-stair', spawnId: 'anchors-stable', position: { x: 696, y: 238 },
      flags: { [ACT5_LIGHT_FLAG]: 'shadow', 'act5-anchors-stable': true },
    })

    const moon = map.entities.find((entity) => entity.id === 'selene-witness')
    await mountRPG({ ...base, quests: { ...base.quests, 'mq-act5-last-name': quest }, world: { ...base.world, position: { x: moon.x, y: moon.y } } })
    await clickWorldTarget(moon.accessibleLabel)
    let saved = loadRPG(window.localStorage).save
    expect(saved.flags[ACT5_LIGHT_FLAG]).toBe('moon')
    expect(saved.status).toBe('playing')

    await unmountRPG()
    const selene = map.entities.find((entity) => entity.id === 'selene')
    await mountRPG({ ...saved, status: 'playing', world: { ...saved.world, position: { x: selene.x, y: selene.y } } })
    await clickWorldTarget(selene.accessibleLabel)
    expect(container.textContent).toContain('Reflection is not a lesser truth.')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip').click())
    saved = loadRPG(window.localStorage).save
    expect(saved.flags['act5-moon-witnesses-aligned']).toBe(true)

    await unmountRPG()
    const encounter = map.exits.find((exit) => exit.id === 'combat-act5-night-stair')
    await mountRPG({ ...saved, status: 'playing', world: { ...saved.world, position: { x: encounter.x, y: encounter.y } } })
    await clickWorldTarget(encounter.accessibleLabel)
    expect(container.textContent).toContain('Erasure on the Stair')
    expect(container.textContent).toContain('Begin encounter')

    await unmountRPG()
    const bridge = map.exits.find((exit) => exit.id === 'night-stair-to-false-sky')
    await mountRPG({ ...saved, status: 'playing', world: { ...saved.world, position: { x: bridge.x, y: bridge.y } } })
    await clickWorldTarget(bridge.accessibleLabel)
    expect(loadRPG(window.localStorage).save.world).toMatchObject({ mapId: 'false-sky', spawnId: 'from-night-stair' })
  })

  it('keeps False Sky mirrors, polarity controls, fracture combat, and exit distinct', async () => {
    const map = rpgMapById('false-sky')
    let staged = laterState({
      questId: 'mq-act5-last-name', objectiveIndex: 3,
      mapId: 'false-sky', spawnId: 'from-night-stair', position: { x: 76, y: 382 },
      flags: { [ACT5_LIGHT_FLAG]: 'moon', 'act5-moon-witnesses-aligned': true },
    })

    for (const [index, mirrorId] of ['sun-mirror-1', 'sun-mirror-2', 'sun-mirror-3'].entries()) {
      const mirror = map.entities.find((entity) => entity.id === mirrorId)
      staged = { ...staged, status: 'playing', world: { ...staged.world, position: { x: mirror.x, y: mirror.y } } }
      await mountRPG(staged)
      await clickWorldTarget(mirror.accessibleLabel)
      const saved = loadRPG(window.localStorage).save
      expect(saved.quests['mq-act5-last-name'].objectiveCounts['turn-the-false-dawn']).toBe(index + 1)
      expect(saved.flags[ACT5_LIGHT_FLAG]).toBe('sun')
      expect(saved.status).toBe('playing')
      await unmountRPG()
      staged = saved
    }

    const encounter = map.exits.find((exit) => exit.id === 'combat-act5-false-sky')
    await mountRPG({ ...staged, status: 'playing', world: { ...staged.world, position: { x: encounter.x, y: encounter.y } } })
    await clickWorldTarget(encounter.accessibleLabel)
    expect(container.textContent).toContain('Counterfeit Dawn')
    expect(container.textContent).toContain('Begin encounter')

    await unmountRPG()
    const fractureExit = map.entities.find((entity) => entity.id === 'fracture-exit')
    await mountRPG({ ...staged, status: 'playing', world: { ...staged.world, position: { x: fractureExit.x, y: fractureExit.y } } })
    await clickWorldTarget(fractureExit.accessibleLabel)
    const saved = loadRPG(window.localStorage).save
    expect(saved.quests['mq-act5-last-name'].objectiveIndex).toBe(5)
    expect(saved.flags['act5-time-fractures-crossed']).toBe(true)
  })

  it('routes Selene main-first and then into her active optional contribution through the UI', async () => {
    await mountRPG(threeLightsReadyState({ mainObjectiveIndex: 2, completedDefaults: false }))
    await clickWorldTarget('Speak with Selene at the reflected-light overlook')
    expect(container.textContent).toContain('Reflection is not a lesser truth.')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip').click())

    expect(loadRPG(window.localStorage).save.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBeUndefined()
    await clickWorldTarget('Speak with Selene at the reflected-light overlook')
    expect(container.textContent).toContain('I reveal the road before the traveler commits.')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip').click())

    const saved = loadRPG(window.localStorage).save
    expect(saved.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBe(1)
    expect(saved.flags['evidence-independent-light']).toBeUndefined()
  })

  it('routes Helios default-first and then into his active optional contribution through the UI', async () => {
    const placed = placeAtNpc(threeLightsReadyState({ mainObjectiveIndex: 3, completedDefaults: false }), 'false-sky', 'helios')
    await mountRPG(placed.state)
    await clickWorldTarget('Speak with Helios beside the first sun mirror')
    expect(container.textContent).toContain('The false sky copies brightness')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip').click())

    expect(loadRPG(window.localStorage).save.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBeUndefined()
    await clickWorldTarget('Speak with Helios beside the first sun mirror')
    expect(container.textContent).toContain('I reveal the road before the traveler commits.')
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Skip').click())

    const saved = loadRPG(window.localStorage).save
    expect(saved.quests['sq-act5-light-no-map-remembers'].objectiveCounts['witness-three-lights']).toBe(1)
    expect(saved.flags['evidence-independent-light']).toBeUndefined()
  })
})
