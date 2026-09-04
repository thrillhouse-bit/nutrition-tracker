import { describe, expect, it } from 'vitest'
import { createInitialState, SCHEMA_VERSION } from '../src/rpg/state.js'
import { migrateSave, normalizeState, serializeRPG } from '../src/rpg/save.js'
import { createAccountSaveCoordinator, readAccountSaveCache } from '../src/rpg/accountSave.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
}

describe('Wayfinding schema-v4 migration', () => {
  it('initializes a serializable empty Wayfinding root in fresh state', () => {
    const state = createInitialState()
    expect(SCHEMA_VERSION).toBe(4)
    expect(state.wayfinding).toEqual({ discoveries: {}, practices: {}, shortcuts: {} })
    expect(JSON.parse(serializeRPG(state)).wayfinding).toEqual(state.wayfinding)
  })

  it('migrates v3 narrowly without mutating its input or unrelated data', () => {
    const legacy = { ...createInitialState(), schemaVersion: 3, flags: { witness: true }, economy: { openShopId: null, marker: 'keep' } }
    delete legacy.wayfinding
    const before = JSON.parse(JSON.stringify(legacy))
    const migrated = migrateSave(legacy)
    expect(migrated).toMatchObject({ schemaVersion: 4, flags: { witness: true }, economy: { marker: 'keep' }, wayfinding: { discoveries: {}, practices: {}, shortcuts: {} } })
    expect(legacy).toEqual(before)
    expect(migrated).not.toBe(legacy)
  })

  it('sanitizes malformed nested Wayfinding records fail-closed and preserves valid entries', () => {
    const raw = {
      ...createInitialState(),
      wayfinding: {
        discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 4 }, unknown: { discoveredAtTick: 5 } },
        practices: { 'pelagos-harbor-soundings': { lastAwardedTick: 7, count: 2 }, bad: { lastAwardedTick: -1, count: 1 } },
        shortcuts: { 'shortcut:pelagos-chartwright-hall': true, unknown: true },
      },
    }
    const normalized = normalizeState(raw)
    expect(normalized.wayfinding).toEqual({
      discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 4 } },
      practices: { 'pelagos-harbor-soundings': { lastAwardedTick: 7, count: 2 } },
      shortcuts: { 'shortcut:pelagos-chartwright-hall': true },
    })
    expect(raw.wayfinding.discoveries.unknown).toBeTruthy()
  })

  it('drops a shortcut forged without its matching completed survey discovery', () => {
    const raw = {
      ...createInitialState(),
      wayfinding: { discoveries: {}, practices: {}, shortcuts: { 'shortcut:pelagos-chartwright-hall': true } },
    }
    expect(normalizeState(raw).wayfinding).toEqual({ discoveries: {}, practices: {}, shortcuts: {} })
  })

  it('round-trips v4 through local and account/cloud save normalization', async () => {
    const state = createInitialState()
    state.wayfinding = { discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 9 } }, practices: {}, shortcuts: { 'shortcut:pelagos-chartwright-hall': true } }
    expect(normalizeState(JSON.parse(serializeRPG(state))).wayfinding).toEqual(state.wayfinding)
    const storage = memoryStorage()
    const api = {
      getRpgSave: async () => ({ save: { revision: 1, gameSchemaVersion: 4, payload: state } }),
      putRpgSave: async () => ({ save: { revision: 2, gameSchemaVersion: 4, payload: state } }),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'wayfinder' })
    const boot = await coordinator.boot()
    expect(boot.state.wayfinding).toEqual(state.wayfinding)
    expect(readAccountSaveCache(storage, 'wayfinder')).toMatchObject({ gameSchemaVersion: 4, payload: { wayfinding: state.wayfinding } })
  })
})
