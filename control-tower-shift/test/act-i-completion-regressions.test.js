import { describe, expect, it } from 'vitest'
import { levelById } from '../src/game/campaign.js'
import {
  TIER1_PATRON_IDS,
  encounterById,
  questDefById,
} from '../src/rpg/content.js'
import {
  applyEvent,
  createInitialState,
  currentObjective,
  isEncounterCleared,
  questProgress,
} from '../src/rpg/state.js'
import { loadRPG, saveRPG } from '../src/rpg/save.js'
import { startEncounter, stepCombat, arenaProgress, sessionEliteName, OUTCOME_WON } from '../src/rpg/combatAdapter.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'

const MAIN_QUEST = 'mq-act1-ash-at-dawn'
const ENTRY_ENCOUNTER = 'enc-act1-entry'
const SUN_ENCOUNTER = 'enc-act1-sun'

function memoryStore() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function atNpc(state, npcId) {
  const map = rpgMapById(state.world.mapId)
  const npc = map.entities.find((entity) => entity.id === npcId && entity.kind === 'npc')
  const path = findWorldPath(map, state.world.position, npc)
  expect(path.length, `reachable ${map.id}:${npcId}`).toBeGreaterThan(0)
  return { ...state, world: { ...state.world, position: path.at(-1) } }
}

// Drive only public RPG events. This is deliberately the same ordered path a
// player takes, so the tests cannot pass by manufacturing an impossible quest
// state or by awarding progress from combat score.
function clearEntryCourt() {
  let state = createInitialState()
  const shrine = rpgMapById('beacon-overlook').entities.find((entity) => entity.id === 'shrine')
  state = atNpc(state, 'thessa')
  state = applyEvent(state, {
    type: 'TALK',
    npcId: 'thessa',
    conversationId: 'act1-thessa-overlook',
  })
  state = { ...state, world: { ...state.world, position: { x: shrine.x, y: shrine.y } } }
  state = applyEvent(state, {
    type: 'DIALOGUE_END',
    conversationId: 'act1-thessa-overlook',
  })
  state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
  state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })
  const exit = rpgMapById('beacon-overlook').exits.find((candidate) => candidate.id === 'to-olive-road')
  state = { ...state, world: { ...state.world, position: { x: exit.x, y: exit.y } } }
  state = applyEvent(state, {
    type: 'TRAVERSE',
    viaGate: 'to-olive-road',
    toMapId: 'olive-road',
    spawnId: 'from-beacon',
  })
  state = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: ENTRY_ENCOUNTER })
  return applyEvent(state, { type: 'COMBAT_WON', encounterId: ENTRY_ENCOUNTER })
}

function clearSunCourt() {
  let state = clearEntryCourt()
  state = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: SUN_ENCOUNTER })
  return applyEvent(state, { type: 'COMBAT_WON', encounterId: SUN_ENCOUNTER })
}

function finishExitConversation() {
  let state = clearSunCourt()
  const objective = currentObjective(state)
  if (!objective || objective.kind !== 'talk') return state
  state = atNpc(state, objective.npcId)
  state = applyEvent(state, {
    type: 'TALK',
    npcId: objective.npcId,
    conversationId: objective.conversationId,
  })
  return applyEvent(state, {
    type: 'DIALOGUE_END',
    conversationId: objective.conversationId,
  })
}

describe('Act I completion content', () => {
  it('defines Sun Court as the authored second RPG encounter', () => {
    const encounter = encounterById(SUN_ENCOUNTER)
    const campaignLevel = levelById('sun-court')

    expect(encounter).toMatchObject({
      id: SUN_ENCOUNTER,
      activationMapId: 'beacon-overlook',
      campaignLevelId: 'sun-court',
      completionFlag: 'enc-act1-sun-cleared',
      repeatable: false,
    })
    expect(campaignLevel?.id).toBe('sun-court')
    expect(campaignLevel?.shortName).toBe('Sun Court')
  })

  it('orders the Sun Court objective immediately after Entry Court', () => {
    const def = questDefById(MAIN_QUEST)
    const entryIndex = def.objectives.findIndex((objective) =>
      objective.kind === 'clear-encounter' && objective.encounterId === ENTRY_ENCOUNTER)
    const sunIndex = def.objectives.findIndex((objective) =>
      objective.kind === 'clear-encounter' && objective.encounterId === SUN_ENCOUNTER)

    expect(entryIndex).toBeGreaterThanOrEqual(0)
    expect(sunIndex).toBe(entryIndex + 1)

    const state = clearEntryCourt()
    expect(questProgress(state, MAIN_QUEST)?.state).toBe('active')
    expect(currentObjective(state)).toMatchObject({
      kind: 'clear-encounter',
      encounterId: SUN_ENCOUNTER,
    })
  })
})

describe('Act I completion reducer', () => {
  it('advances Sun Court exactly once and never duplicates its completion reward', () => {
    const before = clearEntryCourt()
    const beforeProgress = questProgress(before, MAIN_QUEST)
    const entered = applyEvent(before, { type: 'ENTER_ENCOUNTER', encounterId: SUN_ENCOUNTER })
    const won = applyEvent(entered, { type: 'COMBAT_WON', encounterId: SUN_ENCOUNTER })

    expect(entered.status).toBe('in-combat')
    expect(isEncounterCleared(won, SUN_ENCOUNTER)).toBe(true)
    expect(questProgress(won, MAIN_QUEST)?.objectiveIndex).toBe(beforeProgress.objectiveIndex + 1)

    // The Sun fight advances to the authored exit conversation; it must not
    // skip that story beat or award the final main-quest reward early.
    expect(currentObjective(won)).toMatchObject({ kind: 'talk' })
    expect(won.flags['mq-act1-ash-at-dawn-complete']).not.toBe(true)

    const replayEntry = applyEvent(won, { type: 'ENTER_ENCOUNTER', encounterId: SUN_ENCOUNTER })
    const replayWin = applyEvent(replayEntry, { type: 'COMBAT_WON', encounterId: SUN_ENCOUNTER })
    expect(replayEntry).toBe(won)
    expect(replayWin).toBe(won)
    expect(replayWin.quests).toEqual(won.quests)
    expect(replayWin.flags).toEqual(won.flags)
    expect(replayWin.inventory).toEqual(won.inventory)
    expect(replayWin.progression).toEqual(won.progression)
  })

  it('completes the exit conversation at the post-mission checkpoint', () => {
    const completed = finishExitConversation()
    const main = questProgress(completed, MAIN_QUEST)

    expect.soft(main?.state).toBe('completed')
    expect.soft(completed.flags['enc-act1-entry-cleared']).toBe(true)
    expect.soft(completed.flags['enc-act1-sun-cleared']).toBe(true)
    expect.soft(completed.flags['mq-act1-ash-at-dawn-complete']).toBe(true)
    expect.soft(completed.world.mapId).toBe('beacon-overlook')
    expect.soft(completed.world.spawnId).toBe('post-mission')
    expect.soft(completed.combatSnapshot).toBeNull()
    expect.soft(
      completed.inventory.epithetFragments.some((id) => /far[-_]?sighted/i.test(id)),
    ).toBe(true)
  })

  it('round-trips the completed mission checkpoint without losing story state', () => {
    const completed = finishExitConversation()
    const store = memoryStore()

    expect(saveRPG(store, completed)).toBe(true)
    const { save, error } = loadRPG(store)

    expect.soft(error).toBe('none')
    expect.soft(save).not.toBeNull()
    expect.soft(save?.world.mapId).toBe('beacon-overlook')
    expect.soft(save?.world.spawnId).toBe('post-mission')
    expect.soft(save?.quests[MAIN_QUEST]).toEqual(completed.quests[MAIN_QUEST])
    expect.soft(save?.protagonist).toEqual(completed.protagonist)
    expect.soft(save?.inventory).toEqual(completed.inventory)
    expect.soft(save?.progression).toEqual(completed.progression)
    expect.soft(save?.flags['enc-act1-entry-cleared']).toBe(true)
    expect.soft(save?.flags['enc-act1-sun-cleared']).toBe(true)
    expect.soft(save?.flags['mq-act1-ash-at-dawn-complete']).toBe(true)
    expect.soft(save?.combatSnapshot).toBeNull()
  })

  it('normalizes an unknown saved spawn to the map default and reports it', () => {
    const completed = finishExitConversation()
    const store = memoryStore()
    const invalid = {
      ...completed,
      world: { ...completed.world, spawnId: 'invented-empty-region' },
    }

    expect(saveRPG(store, invalid)).toBe(true)
    const { save, error } = loadRPG(store)

    expect(error).toBe('unknown')
    expect(save?.world.mapId).toBe('beacon-overlook')
    expect(save?.world.spawnId).toBe('start')
    // Unknown spawns retain a valid saved position when it is still walkable;
    // normalization no longer overwrites it with the map's default spawn.
    expect(save?.world.position).toEqual({ x: 430, y: 300 })
  })
})

describe('Act I elite overlay isolation', () => {
  it('keeps the Name-Cutter overlay in RPG data without mutating Sun Court campaign data', () => {
    const encounter = encounterById(SUN_ENCOUNTER)
    const campaignLevel = levelById('sun-court')
    const baseOrder = [...campaignLevel.encounter.order]
    const overlay = encounter.eliteOverlay

    // Story variants are data overlays over canonical monster behavior. The
    // final Chronos is replaced for this encounter only; it is not registered
    // as a new global arena monster or written into CAMPAIGN.
    expect(overlay).toMatchObject({ baseMonsterType: 'chronos' })
    expect(String(overlay.id || overlay.variantId || '')).toMatch(/name-cutter/i)
    expect(baseOrder.at(-1)).toBe('chronos')
    expect(campaignLevel).not.toHaveProperty('eliteOverlay')

    const story = clearEntryCourt()
    const session = startEncounter(story, SUN_ENCOUNTER)
    expect(session?.campaignLevelId).toBe('sun-court')
    expect(campaignLevel.encounter.order).toEqual(baseOrder)
  })

  it('plays the six authored Sun Court spawns and overlays only the final Chronos', () => {
    const story = clearEntryCourt()
    const session = startEncounter(story, SUN_ENCOUNTER)
    expect(session).not.toBeNull()
    expect(session.campaignLevelId).toBe('sun-court')

    // Step the RPG-owned one-tick sequence to completion, recording every
    // threat that ever carried the story-variant marker.
    const eliteSeen = new Set()
    let s = session
    let guard = 0
    while (!s.settled && guard < 60000) {
      s = stepCombat(s, { moveX: 0, moveY: 0, firing: true, attack: true })
      for (const t of s.arena.threats) {
        if (t.storyVariantId) eliteSeen.add(`${t.storyVariantId}:${t.name}:${t.monsterType}`)
      }
      guard += 1
    }

    expect(s.settled).toBe(true)
    expect(s.outcome).toBe(OUTCOME_WON)
    // Exactly one elite threat, and it is the Name-Cutter over a Chronos base.
    expect([...eliteSeen]).toEqual(['name-cutter-captain:Name-Cutter Captain:chronos'])
    // The HUD exposes the elite name and a fixed authored progress denominator.
    expect(sessionEliteName(s)).toBe('Name-Cutter Captain')
    expect(arenaProgress(s).total).toBe(6)
  })
})

describe('Act I progression guards', () => {
  it('rejects premature Sun Court entry before Entry Court is cleared', () => {
    // Reach the Sun Court gate on Beacon Overlook but do NOT clear Entry.
    let state = createInitialState()
    state = atNpc(state, 'thessa')
    state = applyEvent(state, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
    state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
    state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
    state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: TIER1_PATRON_IDS[0] })

    // The current objective is NOT clear-sun (it is still reach-olive-road or
        // earlier), so Sun must be gated regardless of the activation map.
        expect(currentObjective(state).encounterId).not.toBe(SUN_ENCOUNTER)

        const rejected = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: SUN_ENCOUNTER })
        expect(rejected).toBe(state)
        expect(rejected.status).toBe('playing')
        expect(isEncounterCleared(rejected, SUN_ENCOUNTER)).toBe(false)
  })

  it('restores the exact post-Entry checkpoint on Sun defeat', () => {
    const before = clearEntryCourt()
    const entered = applyEvent(before, { type: 'ENTER_ENCOUNTER', encounterId: SUN_ENCOUNTER })
    expect(entered.status).toBe('in-combat')

    const failed = applyEvent(entered, { type: 'COMBAT_FAILED', encounterId: SUN_ENCOUNTER })
    // Entry stays cleared, Sun stays uncleared, quest still points at clear-sun.
    expect(failed.status).toBe('playing')
    expect(isEncounterCleared(failed, ENTRY_ENCOUNTER)).toBe(true)
    expect(isEncounterCleared(failed, SUN_ENCOUNTER)).toBe(false)
    expect(currentObjective(failed)).toMatchObject({ kind: 'clear-encounter', encounterId: SUN_ENCOUNTER })
    expect(failed.protagonist).toEqual(before.protagonist)
    expect(failed.quests).toEqual(before.quests)
    expect(failed.flags).toEqual(before.flags)
    expect(failed.combatSnapshot).toBeNull()
  })

  it('keeps exactly one far-sighted fragment and raises the ending boundary', () => {
    const completed = finishExitConversation()
    const fragments = completed.inventory.epithetFragments.filter((id) => /far[-_]?sighted/i.test(id))
    expect(fragments).toHaveLength(1)
    expect(completed.status).toBe('ending')
    expect(completed.world.mapId).toBe('beacon-overlook')
    expect(completed.world.spawnId).toBe('post-mission')
  })

  it('acknowledging the boundary is idempotent and returns to post-mission play', () => {
    const completed = finishExitConversation()
    const acked = applyEvent(completed, { type: 'ACK_ENDING' })
    expect(acked.status).toBe('playing')
    expect(acked.world.mapId).toBe('beacon-overlook')
    expect(acked.world.spawnId).toBe('post-mission')
    // A second acknowledgment is a no-op.
    expect(applyEvent(acked, { type: 'ACK_ENDING' })).toBe(acked)
  })

  it('replaying the exit dialogue cannot duplicate rewards', () => {
    const completed = finishExitConversation()
    // Replaying DIALOGUE_END after completion is a no-op (status is not
    // in-dialogue), so the fragment count and quest state cannot duplicate.
    const replay = applyEvent(completed, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-exit' })
    expect(replay).toBe(completed)
    expect(replay.inventory.epithetFragments).toEqual(completed.inventory.epithetFragments)
    expect(replay.quests).toEqual(completed.quests)
  })
})
