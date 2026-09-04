import { describe, expect, it } from 'vitest'
import { startWildernessEncounter } from '../src/rpg/combatAdapter.js'
import { loadRPG, saveRPG } from '../src/rpg/save.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'

function memoryStore() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function withApollo() {
  let state = createInitialState()
  const map = rpgMapById('beacon-overlook')
  const thessa = map.entities.find((entity) => entity.id === 'thessa')
  const thessaPath = findWorldPath(map, state.world.position, thessa)
  expect(thessaPath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: thessaPath.at(-1) } }
  state = applyEvent(state, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
  state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
  const shrine = map.entities.find((entity) => entity.id === 'shrine')
  const shrinePath = findWorldPath(map, state.world.position, shrine)
  expect(shrinePath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: shrinePath.at(-1) } }
  state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
  state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: 'apollo' })
  expect(state.protagonist.activePatronId).toBe('apollo')
  return state
}

// Drive only public wilderness events until the deterministic roller produces
// an authored pending enemy. The bounded loop mirrors the existing integration
// convention and never manufactures combat status or encounter identity.
function pendingEncounter(regionId = 'asphodel-fringe', seed = 17) {
  const mapId = regionId === 'olive-road' ? 'olive-road' : 'asphodel-gate'
  const positioned = withApollo()
  const map = rpgMapById(mapId)
  const world = {
    ...positioned.world,
    regionId: map.region,
    mapId,
    spawnId: map.spawn.id,
    position: { x: map.spawn.x, y: map.spawn.y },
    facing: map.spawn.facing || 0,
  }
  let state = applyEvent({ ...positioned, world }, { type: 'WILDERNESS_ENTER', regionId })
  for (let index = 0; index < 100 && !state.wilderness.pendingEnemyId; index += 1) {
    state = applyEvent(state, { type: 'WILDERNESS_STEP', seed })
  }
  expect(state.wilderness.pendingEnemyId).toBeTruthy()
  return state
}

function startPendingCombat(state) {
  const enemyId = state.wilderness.pendingEnemyId
  const encounterKey = `${state.wilderness.regionId}:${state.wilderness.step}:${enemyId}`
  const started = applyEvent(state, { type: 'WILDERNESS_COMBAT_START', enemyId, encounterKey })
  expect(started.status).toBe('in-combat')
  expect(started.wilderness.activeEncounterKey).toBe(encounterKey)
  return started
}

describe('wilderness defeat settlement', () => {
  it('applies loss exactly once, clears the pending enemy, and returns to playing', () => {
    let state = pendingEncounter()
    state = {
      ...state,
      inventory: {
        ...state.inventory,
        currency: 100,
        slots: [
          { itemId: 'orichalcum', quantity: 1 },
          { itemId: 'moly', quantity: 1 },
          { itemId: 'copper-ore', quantity: 1 },
          { itemId: 'thyme', quantity: 1 },
        ],
      },
    }
    const enemyId = state.wilderness.pendingEnemyId
    const fighting = startPendingCombat(state)
    const encounterKey = fighting.wilderness.activeEncounterKey

    const defeated = applyEvent(fighting, {
      type: 'WILDERNESS_DEFEAT',
      enemyId,
      encounterKey,
      cause: enemyId,
    })

    expect(defeated.status).toBe('playing')
    expect(defeated.wilderness.pendingEnemyId).toBeNull()
    expect(defeated.inventory.currency).toBe(50)
    expect(defeated.inventory.slots.map((entry) => entry.itemId)).toEqual(['orichalcum', 'moly'])
    expect(defeated.wilderness.lastDeathDrop).toEqual({
      dropped: [
        { itemId: 'copper-ore', quantity: 1 },
        { itemId: 'thyme', quantity: 1 },
      ],
      lostCurrency: 50,
      cause: enemyId,
    })

    const duplicate = applyEvent(defeated, {
      type: 'WILDERNESS_DEFEAT',
      enemyId,
      encounterKey,
      cause: enemyId,
    })
    expect(duplicate).toBe(defeated)
  })

  it('ignores a stale defeat delivered after the pending encounter already won', () => {
    const pending = pendingEncounter('olive-road')
    const enemyId = pending.wilderness.pendingEnemyId
    const fighting = startPendingCombat(pending)
    const encounterKey = fighting.wilderness.activeEncounterKey
    const won = applyEvent(fighting, {
      type: 'WILDERNESS_VICTORY',
      enemyId,
      encounterKey,
      damageByStyle: { spearcraft: 10 },
    })
    expect(won.status).toBe('playing')
    expect(won.wilderness.pendingEnemyId).toBeNull()

    const stale = applyEvent(won, { type: 'WILDERNESS_DEFEAT', enemyId, encounterKey, cause: enemyId })
    expect(stale).toBe(won)
  })

  it('rejects wrong-enemy, stale-key, missing, and malformed defeat callbacks', () => {
    const fighting = startPendingCombat(pendingEncounter('olive-road'))
    const enemyId = fighting.wilderness.pendingEnemyId
    const encounterKey = fighting.wilderness.activeEncounterKey
    const otherEnemyId = enemyId === 'wild-boar' ? 'feral-goat' : 'wild-boar'
    const callbacks = [
      { type: 'WILDERNESS_DEFEAT', enemyId: otherEnemyId, encounterKey, cause: 'wrong enemy' },
      { type: 'WILDERNESS_DEFEAT', enemyId, encounterKey: `${encounterKey}:stale`, cause: 'stale key' },
      { type: 'WILDERNESS_DEFEAT', enemyId, cause: 'missing key' },
      { type: 'WILDERNESS_DEFEAT', encounterKey, cause: 'missing enemy' },
      { type: 'WILDERNESS_DEFEAT', enemyId: null, encounterKey: null, cause: { malformed: true } },
    ]
    for (const callback of callbacks) expect(applyEvent(fighting, callback), JSON.stringify(callback)).toBe(fighting)
  })

  it('keeps authored extension items in the owned-item settlement ledger', () => {
    let fighting = startPendingCombat(pendingEncounter())
    fighting = {
      ...fighting,
      inventory: {
        ...fighting.inventory,
        slots: [
          { itemId: 'orichalcum', quantity: 1 },
          { itemId: 'moly', quantity: 1 },
          { itemId: 'bronze-bar', quantity: 1 },
        ],
      },
    }
    const defeated = applyEvent(fighting, {
      type: 'WILDERNESS_DEFEAT',
      enemyId: fighting.wilderness.pendingEnemyId,
      encounterKey: fighting.wilderness.activeEncounterKey,
      cause: 'authored test defeat',
    })
    expect(defeated.inventory.slots.map((entry) => entry.itemId)).toEqual(['orichalcum', 'moly'])
    expect(defeated.wilderness.lastDeathDrop.dropped).toEqual([{ itemId: 'bronze-bar', quantity: 1 }])
  })
})

describe('wilderness combat start validation', () => {
  it('rejects a start whose enemy does not match the pending authored enemy', () => {
    const state = pendingEncounter('olive-road')
    const otherEnemy = state.wilderness.pendingEnemyId === 'wild-boar' ? 'feral-goat' : 'wild-boar'
    const encounterKey = `${state.wilderness.regionId}:${state.wilderness.step}:${state.wilderness.pendingEnemyId}`

    expect(applyEvent(state, { type: 'WILDERNESS_COMBAT_START', enemyId: otherEnemy, encounterKey })).toBe(state)
    expect(applyEvent(state, { type: 'WILDERNESS_COMBAT_START', enemyId: state.wilderness.pendingEnemyId })).toBe(state)
    expect(applyEvent(state, { type: 'WILDERNESS_COMBAT_START', enemyId: state.wilderness.pendingEnemyId, encounterKey: `${encounterKey}:stale` })).toBe(state)
    expect(startWildernessEncounter(state, {
      enemyId: otherEnemy,
      encounterKey: `mismatched-enemy:${otherEnemy}`,
    })).toBeNull()
    expect(startWildernessEncounter(state, {
      enemyId: 'not-an-authored-enemy',
      encounterKey: 'invalid-enemy',
    })).toBeNull()
  })

  it('rejects a session when the active patron is not registered', () => {
    const state = pendingEncounter('olive-road')
    const invalidPatronState = {
      ...state,
      protagonist: { ...state.protagonist, activePatronId: 'not-a-patron' },
    }

    expect(startWildernessEncounter(invalidPatronState, {
      enemyId: state.wilderness.pendingEnemyId,
      encounterKey: `invalid-patron:${state.wilderness.pendingEnemyId}`,
    })).toBeNull()
  })
})

describe('in-combat wilderness save normalization', () => {
  it('reloads at the combat boundary as playing while preserving the pending encounter', () => {
    const fighting = startPendingCombat(pendingEncounter('olive-road'))
    const store = memoryStore()

    expect(saveRPG(store, fighting)).toBe(true)
    const loaded = loadRPG(store)

    expect(loaded.error).toBe('none')
    expect(loaded.save.status).toBe('playing')
    expect(loaded.save.combatSnapshot).toBeNull()
    expect(loaded.save.wilderness).toMatchObject({
      regionId: 'olive-road',
      riskBand: 'low',
      step: fighting.wilderness.step,
      pendingEnemyId: fighting.wilderness.pendingEnemyId,
      lastDeathDrop: null,
    })
    expect(loaded.save.protagonist.activePatronId).toBe('apollo')
  })
})
