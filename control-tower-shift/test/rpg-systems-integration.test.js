import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { normalizeState } from '../src/rpg/save.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { startWildernessEncounter } from '../src/rpg/combatAdapter.js'
import { rpgMapById } from '../src/rpg/registry.js'

function atMap(state, mapId) {
  const map = rpgMapById(mapId)
  return {
    ...state,
    world: {
      ...state.world,
      regionId: map.region,
      mapId,
      spawnId: map.spawn.id,
      position: { x: map.spawn.x, y: map.spawn.y },
      facing: map.spawn.facing || 0,
    },
  }
}

describe('crafting reducer integration', () => {
  it('crafts through the reducer, awards XP, and preserves extension items on save normalization', () => {
    let state = atMap(createInitialState(), 'bronze-foundry')
    state = {
      ...state,
      inventory: addInventoryItem(state.inventory, 'copper-ore', 2, ALL_ITEM_DEFS).inventory,
    }
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'copper-bar', quantity: 1 })

    expect(state.crafting.stationId).toBe('bronze-forge')
    expect(state.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: 12 })
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'copper-ore')).toHaveLength(0)
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'copper-bar')).toHaveLength(1)
    expect(state.progression.skills.bronzework.xp).toBe(12)

    const reloaded = normalizeState(JSON.parse(JSON.stringify(state)))
    expect(reloaded.inventory.slots.some((entry) => entry.itemId === 'copper-bar')).toBe(true)
    expect(reloaded.progression.skills.bronzework.xp).toBe(12)
    expect(reloaded.crafting.stationId).toBe('bronze-forge')
  })

  it('banks and withdraws crafted material without losing its item definition', () => {
    let state = atMap(createInitialState(), 'bronze-foundry')
    state = {
      ...state,
      inventory: addInventoryItem(state.inventory, 'copper-bar', 1, ALL_ITEM_DEFS).inventory,
    }
    const remote = applyEvent(state, { type: 'BANK_DEPOSIT_MATERIALS' })
    expect(remote).toBe(state)
    state = atMap(state, 'beacon-overlook')
    state = applyEvent(state, { type: 'BANK_DEPOSIT_MATERIALS' })
    expect(state.inventory.bank.slots).toContainEqual({ itemId: 'copper-bar', quantity: 1 })
    state = applyEvent(state, { type: 'BANK_WITHDRAW', itemId: 'copper-bar', quantity: 1 })
    expect(state.inventory.slots.some((entry) => entry.itemId === 'copper-bar')).toBe(true)
    expect(state.inventory.bank.slots.some((entry) => entry.itemId === 'copper-bar')).toBe(false)
  })

  it('stores structured crafting failure without consuming materials', () => {
    let state = atMap(createInitialState(), 'bronze-foundry')
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })
    const before = state.inventory
    state = applyEvent(state, { type: 'CRAFT', recipeId: 'copper-bar', quantity: 1 })
    expect(state.crafting.lastResult.reason).toBe('insufficient_materials')
    expect(state.inventory).toBe(before)
  })
})

describe('wilderness reducer integration', () => {
  it('builds a deterministic one-enemy arena session from a pending wilderness encounter', () => {
    let state = createInitialState()
    state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
    state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: 'apollo' })
    state = atMap(state, 'olive-road')
    state = applyEvent(state, { type: 'WILDERNESS_ENTER', regionId: 'olive-road' })
    state = { ...state, wilderness: { ...state.wilderness, pendingEnemyId: 'wild-boar', step: 3 } }

    const input = { enemyId: 'wild-boar', encounterKey: 'olive-road:3:wild-boar' }
    const first = startWildernessEncounter(state, input)
    const replay = startWildernessEncounter(state, input)
    expect(first).toBeTruthy()
    expect(first.seed).toBe(replay.seed)
    expect(first.authoredOrder).toHaveLength(1)
    expect(first.wilderness).toEqual({ ...input, enemyName: 'Wild Boar' })
    expect(first.arena.threatsRemainingInLevel).toBe(1)
  })

  it('moves into and out of wilderness combat while awarding a victory exactly once', () => {
    let state = applyEvent(atMap(createInitialState(), 'olive-road'), { type: 'WILDERNESS_ENTER', regionId: 'olive-road' })
    state = { ...state, wilderness: { ...state.wilderness, pendingEnemyId: 'wild-boar', step: 1 } }
    const encounterKey = 'olive-road:1:wild-boar'
    state = applyEvent(state, { type: 'WILDERNESS_COMBAT_START', enemyId: 'wild-boar', encounterKey })
    expect(state.status).toBe('in-combat')

    const won = applyEvent(state, {
      type: 'WILDERNESS_VICTORY',
      enemyId: 'wild-boar',
      encounterKey,
      damageByStyle: { spearcraft: 1 },
    })
    expect(won.status).toBe('playing')
    expect(won.wilderness.pendingEnemyId).toBeNull()
    expect(won.flags['wilderness:reward:olive-road:1:wild-boar']).toBe(true)
    expect(won.progression.skills.spearcraft.xp).toBeGreaterThan(0)
  })

  it('rolls a deterministic encounter and awards its victory exactly once', () => {
    let state = applyEvent(atMap(createInitialState(), 'olive-road'), { type: 'WILDERNESS_ENTER', regionId: 'olive-road' })
    for (let i = 0; i < 20 && !state.wilderness.pendingEnemyId; i += 1) {
      state = applyEvent(state, { type: 'WILDERNESS_STEP', seed: 17 })
    }
    expect(state.wilderness.pendingEnemyId).toBeTruthy()
    const enemyId = state.wilderness.pendingEnemyId
    const encounterKey = `test-${enemyId}`
    const won = applyEvent(state, {
      type: 'WILDERNESS_VICTORY',
      enemyId,
      encounterKey,
      damageByStyle: { spearcraft: 10 },
    })
    expect(won.wilderness.pendingEnemyId).toBeNull()
    expect(won.flags[`wilderness:reward:${encounterKey}`]).toBe(true)
    expect(won.progression.skills.spearcraft.xp).toBeGreaterThan(0)
    expect(won.inventory.currency).toBeGreaterThan(0)

    const replayed = applyEvent(won, {
      type: 'WILDERNESS_VICTORY',
      enemyId,
      encounterKey,
      damageByStyle: { spearcraft: 10 },
    })
    expect(replayed).toBe(won)
  })

  it('applies deterministic death loss while preserving bank, equipment, and quest collections', () => {
    let state = applyEvent(atMap(createInitialState(), 'asphodel-gate'), { type: 'WILDERNESS_ENTER', regionId: 'asphodel-fringe' })
    state = { ...state, wilderness: { ...state.wilderness, pendingEnemyId: 'shade' } }
    const encounterKey = `asphodel-fringe:${state.wilderness.step}:shade`
    state = applyEvent(state, { type: 'WILDERNESS_COMBAT_START', enemyId: 'shade', encounterKey })
    state = {
      ...state,
      inventory: {
        ...state.inventory,
        currency: 100,
        slots: [
          { itemId: 'copper-ore', quantity: 1 },
          { itemId: 'thyme', quantity: 1 },
          { itemId: 'barley-flatbread', quantity: 1 },
        ],
        bank: { ...state.inventory.bank, slots: [{ itemId: 'olive-log', quantity: 3 }] },
        questItems: ['sealed-oath'],
      },
    }
    const defeated = applyEvent(state, { type: 'WILDERNESS_DEFEAT', enemyId: 'shade', encounterKey, cause: 'shade' })
    expect(defeated.inventory.slots).toHaveLength(2)
    expect(defeated.inventory.currency).toBe(50)
    expect(defeated.inventory.bank).toEqual(state.inventory.bank)
    expect(defeated.inventory.equipment).toEqual(state.inventory.equipment)
    expect(defeated.inventory.questItems).toEqual(['sealed-oath'])
    expect(defeated.wilderness.lastDeathDrop).toMatchObject({ lostCurrency: 50, cause: 'shade' })
  })

  it('normalizes wilderness state and rejects unknown regions safely', () => {
    const state = createInitialState()
    const normalized = normalizeState({
      ...state,
      wilderness: { ...state.wilderness, regionId: 'unknown-depth', step: -4 },
    })
    expect(normalized.wilderness.regionId).toBeNull()
    expect(normalized.wilderness.step).toBe(0)
  })

  it('rejects remote wilderness and crafting entry while accepting their physical maps', () => {
    const beacon = createInitialState()
    expect(applyEvent(beacon, { type: 'WILDERNESS_ENTER', regionId: 'olive-road' })).toBe(beacon)
    expect(applyEvent(beacon, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })).toBe(beacon)

    const road = atMap(beacon, 'olive-road')
    expect(applyEvent(road, { type: 'WILDERNESS_ENTER', regionId: 'olive-road' }).wilderness.regionId).toBe('olive-road')

    const foundry = atMap(beacon, 'bronze-foundry')
    expect(applyEvent(foundry, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' }).crafting.stationId).toBe('bronze-forge')
  })
})
