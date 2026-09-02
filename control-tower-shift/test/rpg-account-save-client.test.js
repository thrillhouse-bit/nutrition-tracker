import { describe, expect, it, vi } from 'vitest'
import {
  AccountSaveConflict,
  accountSaveCacheKey,
  confirmLegacyRpgImport,
  createAccountSaveCoordinator,
  inspectLegacyRpgSave,
  readAccountSaveCache,
} from '../src/rpg/accountSave.js'
import { RPG_SAVE_KEY } from '../src/rpg/save.js'
import { createInitialState, SCHEMA_VERSION } from '../src/rpg/state.js'

class MemoryStorage {
  constructor() { this.values = new Map() }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function stateAt(mapId = 'beacon-overlook') {
  const state = createInitialState()
  return mapId === state.world.mapId ? state : { ...state, flags: { ...state.flags, [`test:${mapId}`]: true } }
}

function remoteSave(payload, revision = 1, gameSchemaVersion = payload.schemaVersion) {
  return {
    payload, revision, gameSchemaVersion,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:01:00.000Z',
  }
}

function cache(storage, userId, payload, options = {}) {
  storage.setItem(accountSaveCacheKey(userId), JSON.stringify({
    cacheVersion: 1,
    accountId: String(userId),
    payload,
    gameSchemaVersion: options.gameSchemaVersion ?? payload.schemaVersion,
    revision: options.revision ?? 0,
    pending: options.pending ?? false,
    cachedAt: '2026-09-01T00:00:00.000Z',
  }))
}

describe('account-scoped boot and legacy boundaries', () => {
  it('uses the remote save first, migrates it, and replaces a non-pending same-account cache', async () => {
    const storage = new MemoryStorage()
    cache(storage, 'account-a', stateAt('cached'))
    const legacyV1 = { ...createInitialState(), schemaVersion: 1 }
    delete legacyV1.economy
    delete legacyV1.resources
    const api = {
      getRpgSave: vi.fn(async () => ({ save: remoteSave(legacyV1, 7, 1) })),
      putRpgSave: vi.fn(),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'account-a' })
    const boot = await coordinator.boot()
    expect(boot).toMatchObject({ status: 'ready', source: 'remote', revision: 7, gameSchemaVersion: 1 })
    expect(boot.state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(readAccountSaveCache(storage, 'account-a')).toMatchObject({ revision: 7, pending: false })
  })

  it('never reads another account cache or implicitly adopts the global legacy save', async () => {
    const storage = new MemoryStorage()
    cache(storage, 'account-a', stateAt('a'), { pending: true })
    storage.setItem(RPG_SAVE_KEY, JSON.stringify(stateAt('legacy')))
    const api = { getRpgSave: vi.fn(async () => ({ save: null })), putRpgSave: vi.fn() }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'account-b' })
    expect(await coordinator.boot()).toMatchObject({ status: 'empty', state: null })
    expect(readAccountSaveCache(storage, 'account-b')).toBeNull()
    expect(readAccountSaveCache(storage, 'account-a')).not.toBeNull()

    const inspection = inspectLegacyRpgSave(storage)
    expect(inspection.available).toBe(true)
    expect(confirmLegacyRpgImport({ storage, userId: 'account-b', inspection, confirmed: false })).toEqual({
      imported: false, reason: 'confirmation_required',
    })
    expect(confirmLegacyRpgImport({ storage, userId: 'account-b', inspection, confirmed: true }).imported).toBe(true)
    expect(readAccountSaveCache(storage, 'account-b')).toMatchObject({ pending: true, revision: 0 })
  })

  it('falls back offline only to the same account cache and does not bypass an authenticated HTTP failure', async () => {
    const storage = new MemoryStorage()
    cache(storage, 11, stateAt('offline'), { revision: 4, pending: true })
    const offline = createAccountSaveCoordinator({
      api: { getRpgSave: vi.fn(async () => { throw new TypeError('offline') }), putRpgSave: vi.fn() },
      storage, userId: 11,
    })
    expect(await offline.boot()).toMatchObject({ status: 'ready', source: 'offline-cache', revision: 4, pending: true })

    const unauthorized = createAccountSaveCoordinator({
      api: { getRpgSave: vi.fn(async () => { throw Object.assign(new Error('signed out'), { status: 401 }) }), putRpgSave: vi.fn() },
      storage, userId: 11,
    })
    expect(await unauthorized.boot()).toMatchObject({ status: 'error', source: 'remote', state: null })
  })
})

describe('conditional account writes', () => {
  it('updates revision and cache after successful and idempotent responses', async () => {
    const storage = new MemoryStorage()
    const initial = stateAt()
    const api = {
      getRpgSave: vi.fn(async () => ({ save: null })),
      putRpgSave: vi.fn()
        .mockResolvedValueOnce({ save: remoteSave(initial, 1), idempotent: false })
        .mockResolvedValueOnce({ save: remoteSave({ ...initial, playtimeTicks: 12 }, 2), idempotent: true }),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'writer' })
    await coordinator.boot()
    expect(await coordinator.save(initial)).toMatchObject({ status: 'saved', revision: 1 })
    expect(await coordinator.save({ ...initial, playtimeTicks: 12 })).toMatchObject({ status: 'idempotent', revision: 2 })
    expect(api.putRpgSave.mock.calls.map(([body]) => body.expectedRevision)).toEqual([0, 1])
    expect(readAccountSaveCache(storage, 'writer')).toMatchObject({ pending: false, revision: 2 })
  })

  it('fetches authoritative state on 409 and preserves the pending local snapshot', async () => {
    const storage = new MemoryStorage()
    const base = stateAt()
    const remote = { ...base, playtimeTicks: 30 }
    const local = { ...base, playtimeTicks: 20 }
    const conflictError = Object.assign(new Error('conflict'), {
      status: 409, body: { code: 'RPG_SAVE_REVISION_CONFLICT', currentRevision: 3 },
    })
    const api = {
      getRpgSave: vi.fn()
        .mockResolvedValueOnce({ save: remoteSave(base, 2) })
        .mockResolvedValueOnce({ save: remoteSave(remote, 3) }),
      putRpgSave: vi.fn(async () => { throw conflictError }),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'conflict-user' })
    await coordinator.boot()
    const result = await coordinator.save(local)
    expect(result.status).toBe('conflict')
    expect(result.conflict).toBeInstanceOf(AccountSaveConflict)
    expect(result.conflict).toMatchObject({ expectedRevision: 2, currentRevision: 3, localState: { playtimeTicks: 20 }, remoteState: { playtimeTicks: 30 } })
    expect(readAccountSaveCache(storage, 'conflict-user')).toMatchObject({ pending: true, revision: 2, payload: { playtimeTicks: 20 } })
  })

  it('resolves a conflict only through an explicit remote or conditional local choice', async () => {
    const storage = new MemoryStorage()
    const base = stateAt()
    const local = { ...base, playtimeTicks: 20 }
    const remote = { ...base, playtimeTicks: 30 }
    const writes = []
    const api = {
      getRpgSave: vi.fn(async () => ({ save: remoteSave(remote, 3) })),
      putRpgSave: vi.fn(async (body) => {
        writes.push(body)
        return { save: remoteSave(body.payload, 4), idempotent: false }
      }),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'resolver' })
    await coordinator.boot()
    const conflict = new AccountSaveConflict({
      localState: local,
      remoteState: remote,
      expectedRevision: 2,
      currentRevision: 3,
    })

    const remoteResult = await coordinator.resolveConflict(conflict, 'remote')
    expect(remoteResult).toMatchObject({ status: 'resolved-remote', state: { playtimeTicks: 30 }, revision: 3 })
    expect(readAccountSaveCache(storage, 'resolver')).toMatchObject({ pending: false, revision: 3, payload: { playtimeTicks: 30 } })

    const localResult = await coordinator.resolveConflict(conflict, 'local')
    expect(localResult).toMatchObject({ status: 'saved', state: { playtimeTicks: 20 }, revision: 4 })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ expectedRevision: 3, payload: { playtimeTicks: 20 } })
  })

  it('keeps a pending snapshot after network failure and retries it explicitly', async () => {
    const storage = new MemoryStorage()
    const state = { ...stateAt(), playtimeTicks: 8 }
    const api = {
      getRpgSave: vi.fn(async () => ({ save: null })),
      putRpgSave: vi.fn()
        .mockRejectedValueOnce(new TypeError('offline'))
        .mockResolvedValueOnce({ save: remoteSave(state, 1), idempotent: false }),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'retry-user' })
    await coordinator.boot()
    expect(await coordinator.save(state)).toMatchObject({ status: 'pending', revision: 0 })
    expect(readAccountSaveCache(storage, 'retry-user')).toMatchObject({ pending: true, revision: 0 })
    expect(await coordinator.retryPending()).toMatchObject({ status: 'saved', revision: 1 })
    expect(readAccountSaveCache(storage, 'retry-user')).toMatchObject({ pending: false, revision: 1 })
  })

  it('coalesces same-turn writes to the latest normalized snapshot', async () => {
    const storage = new MemoryStorage()
    const base = stateAt()
    const api = {
      getRpgSave: vi.fn(async () => ({ save: null })),
      putRpgSave: vi.fn(async (body) => ({ save: remoteSave(body.payload, 1), idempotent: false })),
    }
    const coordinator = createAccountSaveCoordinator({ api, storage, userId: 'coalesce-user' })
    await coordinator.boot()
    const first = coordinator.save({ ...base, playtimeTicks: 1 })
    const second = coordinator.save({ ...base, playtimeTicks: 2 })
    const third = coordinator.save({ ...base, playtimeTicks: 3 })
    const results = await Promise.all([first, second, third])
    expect(api.putRpgSave).toHaveBeenCalledTimes(1)
    expect(api.putRpgSave.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, payload: { playtimeTicks: 3 } })
    expect(results.every((result) => result.status === 'saved' && result.state.playtimeTicks === 3)).toBe(true)
  })
})
