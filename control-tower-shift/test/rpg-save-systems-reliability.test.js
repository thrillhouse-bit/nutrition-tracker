import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { loadRPG, normalizeState, RPG_SAVE_KEY } from '../src/rpg/save.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { moveAlongWorldPath } from './helpers/legalMovement.js'

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

// Physical system access requires the concrete station/shop/bank entity on the
// current map and a protagonist standing beside it. Resolve the matching entity
// for the map the caller already set, reposition west of it (validated
// reachable), and open through the reducer so later CRAFT/BANK_* events carry
// real physical authority.
function systemOpenNear(state, kind, systemId) {
  const map = rpgMapById(state.world.mapId)
  const isStation = kind === 'station'
  const entity = map.entities.find((candidate) =>
    isStation
      ? candidate.kind === 'station' && candidate.stationId === systemId
      : candidate.kind === 'bank')
  const near = moveAlongWorldPath(state, entity)
  const payload = isStation ? { stationId: systemId } : {}
  const type = isStation ? 'OPEN_CRAFTING' : 'OPEN_BANK'
  return applyEvent(near, { type, entityId: entity.id, ...payload })
}

function storeFor(raw) {
  return {
    getItem(key) {
      return key === RPG_SAVE_KEY ? JSON.stringify(raw) : null
    },
  }
}

function inventoryWith(state, itemId, quantity) {
  return addInventoryItem(state.inventory, itemId, quantity, ALL_ITEM_DEFS).inventory
}

describe('save normalization system boundaries', () => {
  it('rejects corrupt or inactive-lane positions and recovers to a deterministic valid spawn', () => {
    const raw = createInitialState()
    raw.world = {
      ...raw.world,
      regionId: 'pelagos-isles',
      mapId: 'nereid-caves',
      spawnId: 'threshold',
      // The echo branch is excluded at ebb, even though this point is in
      // bounds and would otherwise be usable to forge a physical interaction.
      position: { x: 452, y: 420 },
    }
    raw.flags = { ...raw.flags, 'act2:tide-state': 'ebb' }
    const normalized = normalizeState(raw)
    const caves = rpgMapById('nereid-caves')
    expect(normalized.world).toMatchObject({ mapId: 'nereid-caves', spawnId: 'threshold', position: { x: caves.spawns.threshold.x, y: caves.spawns.threshold.y } })
  })

  it('recovers first-thaw and name-press checkpoints using the first state-valid declared spawn', () => {
    const firstThaw = createInitialState()
    firstThaw.flags = { ...firstThaw.flags, 'act3:season-state': 'harvest' }
    firstThaw.world = {
      ...firstThaw.world,
      regionId: rpgMapById('wheat-village').region,
      mapId: 'wheat-village',
      spawnId: 'first-thaw',
      position: { x: 474, y: 282 },
    }
    const recoveredThaw = normalizeState(firstThaw)
    expect(recoveredThaw.world).toMatchObject({
      mapId: 'wheat-village',
      spawnId: 'granary',
      position: { x: rpgMapById('wheat-village').spawns.granary.x, y: rpgMapById('wheat-village').spawns.granary.y },
    })

    const namePress = createInitialState()
    namePress.flags = { ...namePress.flags, 'act4:pressure-state': 'critical' }
    namePress.world = {
      ...namePress.world,
      regionId: rpgMapById('name-press').region,
      mapId: 'name-press',
      spawnId: 'name-press-relief',
      position: { x: 480, y: 402 },
    }
    const recoveredPress = normalizeState(namePress)
    expect(recoveredPress.world).toMatchObject({
      mapId: 'name-press',
      spawnId: 'name-press-relief',
      position: { x: rpgMapById('name-press').spawns['name-press-relief'].x, y: rpgMapById('name-press').spawns['name-press-relief'].y },
    })
  })

  it('derives wilderness risk from the authored region and retains only a local pending enemy', () => {
    const raw = createInitialState()
    raw.wilderness = {
      ...raw.wilderness,
      regionId: 'olive-road',
      riskBand: 'extreme',
      step: 3,
      pendingEnemyId: 'wild-boar',
      activeEncounterKey: 'forged-key',
    }

    const normalized = normalizeState(raw)
    expect(normalized.wilderness).toMatchObject({
      regionId: 'olive-road',
      riskBand: 'low',
      step: 3,
      pendingEnemyId: 'wild-boar',
      activeEncounterKey: null,
    })

    raw.wilderness.pendingEnemyId = 'shade'
    expect(normalizeState(raw).wilderness.pendingEnemyId).toBeNull()
    raw.wilderness.pendingEnemyId = 'not-an-enemy'
    expect(normalizeState(raw).wilderness.pendingEnemyId).toBeNull()
  })

  it('clears an invalid expedition without retaining hostile state', () => {
    const raw = createInitialState()
    raw.wilderness = {
      ...raw.wilderness,
      regionId: 'unknown-depth',
      riskBand: 'extreme',
      step: 9,
      skulled: true,
      devotionActive: true,
      pendingEnemyId: 'fury',
      activeEncounterKey: 'unknown-depth:9:fury',
    }

    expect(normalizeState(raw).wilderness).toMatchObject({
      regionId: null,
      riskBand: 'low',
      step: 0,
      skulled: false,
      devotionActive: false,
      pendingEnemyId: null,
      activeEncounterKey: null,
    })
  })

  it('recovers valid interrupted wilderness combat to a restartable encounter boundary', () => {
    const raw = createInitialState()
    raw.status = 'in-combat'
    raw.combatSnapshot = { phase: 'active' }
    raw.wilderness = {
      ...raw.wilderness,
      regionId: 'olive-road',
      riskBand: 'severe',
      step: 3,
      pendingEnemyId: 'wild-boar',
      activeEncounterKey: 'olive-road:3:wild-boar',
    }

    const recovered = normalizeState(raw)
    expect(recovered.status).toBe('playing')
    expect(recovered.combatSnapshot).toBeNull()
    expect(recovered.wilderness.pendingEnemyId).toBe('wild-boar')
    expect(recovered.wilderness.activeEncounterKey).toBeNull()

    const restarted = applyEvent(recovered, {
      type: 'WILDERNESS_COMBAT_START',
      enemyId: 'wild-boar',
      encounterKey: 'olive-road:3:wild-boar',
    })
    expect(restarted.status).toBe('in-combat')
    expect(restarted.wilderness.activeEncounterKey).toBe('olive-road:3:wild-boar')
  })

  it('clears live system leases on reload while retaining the last crafting result', () => {
    const atFoundry = atMap(createInitialState(), 'bronze-foundry')
    atFoundry.crafting = { stationId: 'bronze-forge', lastResult: { ok: true, quantity: 1 } }
    atFoundry.economy.openShopId = 'beacon-provisioner'
    atFoundry.flags = {
      ...atFoundry.flags,
      'rpg:active-bank-entity': 'beacon-bank',
      'rpg:active-shop-entity': 'myrrine-provisioner',
      'rpg:active-crafting-entity': 'bronze-foundry-forge',
    }
    const normalized = normalizeState(atFoundry)
    expect(normalized.crafting).toEqual({ stationId: null, lastResult: { ok: true, quantity: 1 } })
    expect(normalized.economy.openShopId).toBeNull()
    expect(normalized.flags['rpg:active-bank-entity']).toBeUndefined()
    expect(normalized.flags['rpg:active-shop-entity']).toBeUndefined()
    expect(normalized.flags['rpg:active-crafting-entity']).toBeUndefined()

    const remote = atMap(createInitialState(), 'olive-road')
    remote.crafting = { stationId: 'bronze-forge', lastResult: { ok: true, quantity: 1 } }
    expect(normalizeState(remote).crafting).toMatchObject({ stationId: null })
  })
})

describe('reducer quantity and access hardening', () => {
  it('rejects a forged remote CRAFT event and closes the stale station', () => {
    // Beacon Overlook now also has a bronze-forge, so use a map with no
    // bronze-forge access at all to exercise the forged/remote case.
    let state = atMap(createInitialState(), 'olive-road')
    state = {
      ...state,
      inventory: inventoryWith(state, 'copper-ore', 2),
      crafting: { stationId: 'bronze-forge', lastResult: { ok: true } },
    }
    const inventory = state.inventory

    const next = applyEvent(state, { type: 'CRAFT', recipeId: 'copper-bar', quantity: 1 })
    expect(next.crafting).toEqual({ stationId: null, lastResult: null })
    expect(next.inventory).toBe(inventory)
    expect(next.inventory.slots.some((entry) => entry.itemId === 'copper-bar')).toBe(false)
  })

  it('rejects explicit invalid CRAFT quantities while preserving the omitted default', () => {
    let base = atMap(createInitialState(), 'bronze-foundry')
    base = {
      ...base,
      inventory: inventoryWith(base, 'copper-ore', 6),
    }
    base = systemOpenNear(base, 'station', 'bronze-forge')

    for (const quantity of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
      const rejected = applyEvent(base, { type: 'CRAFT', recipeId: 'copper-bar', quantity })
      expect(rejected.crafting.lastResult?.reason).toBe('invalid_quantity')
      expect(rejected.inventory).toBe(base.inventory)
      expect(rejected.inventory.slots.some((entry) => entry.itemId === 'copper-bar')).toBe(false)
    }

    const defaulted = applyEvent(base, { type: 'CRAFT', recipeId: 'copper-bar' })
    expect(defaulted.crafting.lastResult).toMatchObject({ ok: true, quantity: 1 })
    expect(defaulted.inventory.slots.some((entry) => entry.itemId === 'copper-bar')).toBe(true)
  })

  it('rejects explicit invalid ADD_ITEM and BANK_WITHDRAW quantities', () => {
    let state = createInitialState()
    state = {
      ...state,
      inventory: {
        ...state.inventory,
        bank: { ...state.inventory.bank, slots: [{ itemId: 'copper-ore', quantity: 4 }] },
      },
    }

    for (const quantity of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
      expect(applyEvent(state, { type: 'ADD_ITEM', itemId: 'copper-ore', quantity })).toBe(state)
      expect(applyEvent(state, { type: 'BANK_WITHDRAW', itemId: 'copper-ore', quantity })).toBe(state)
    }

    const added = applyEvent(state, { type: 'ADD_ITEM', itemId: 'copper-ore' })
    const opened = systemOpenNear(state, 'bank')
    const withdrawn = applyEvent(opened, { type: 'BANK_WITHDRAW', itemId: 'copper-ore' })
    expect(added.inventory.slots.some((entry) => entry.itemId === 'copper-ore')).toBe(true)
    expect(withdrawn.inventory.bank.slots).toContainEqual({ itemId: 'copper-ore', quantity: 3 })
  })
})

describe('raw save unknown-ID diagnostics', () => {
  it.each([
    ['inventory item', (raw) => { raw.inventory.slots = [{ itemId: 'unknown-item', quantity: 1 }] }],
    ['bank item', (raw) => { raw.inventory.bank.slots = [{ itemId: 'unknown-bank-item', quantity: 1 }] }],
    ['equipped item', (raw) => { raw.inventory.equipment.weapon = 'unknown-weapon' }],
    ['wilderness region', (raw) => { raw.wilderness.regionId = 'unknown-depth' }],
    ['wilderness enemy', (raw) => {
      raw.wilderness.regionId = 'olive-road'
      raw.wilderness.pendingEnemyId = 'unknown-enemy'
    }],
    ['foreign wilderness enemy', (raw) => {
      raw.wilderness.regionId = 'olive-road'
      raw.wilderness.pendingEnemyId = 'shade'
    }],
    ['crafting station', (raw) => { raw.crafting.stationId = 'unknown-station' }],
    ['structured recipe', (raw) => {
      raw.crafting.lastResult = { ok: false, reason: 'unknown_recipe', detail: { recipeId: 'unknown-recipe' } }
    }],
    ['structured result item', (raw) => {
      raw.crafting.lastResult = { ok: false, detail: { missing: [{ itemId: 'unknown-result', needed: 1 }] } }
    }],
    ['structured result station', (raw) => {
      raw.crafting.lastResult = {
        ok: false,
        reason: 'wrong_station',
        detail: { required: 'bronze-forge', actual: 'unknown-result-station' },
      }
    }],
  ])('reports unknown for a raw %s ID even when normalization strips it', (_name, mutate) => {
    const raw = createInitialState()
    mutate(raw)

    const loaded = loadRPG(storeFor(raw))
    expect(loaded.save).toBeTruthy()
    expect(loaded.error).toBe('unknown')
  })

  it('does not warn on a valid legacy schema-v1 save', () => {
    const raw = createInitialState({ savedAt: '2026-01-01T00:00:00.000Z' })
    delete raw.wilderness.activeEncounterKey

    const loaded = loadRPG(storeFor(raw))
    expect(loaded.error).toBe('none')
    expect(loaded.save).toBeTruthy()
    expect(loaded.save.wilderness.activeEncounterKey).toBeNull()
    expect(loaded.save.inventory.equipment).toMatchObject({
      weapon: 'oath-spear',
      body: 'traveler-tunic',
    })
  })
})
