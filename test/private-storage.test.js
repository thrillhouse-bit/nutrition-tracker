import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accountStorageKey,
  purgeAccountStorage,
  purgeLegacyPrivateCaches,
  purgeUnownedLegacyStorage,
  readAccountJson,
  writeAccountJson,
} from '../src/lib/privateStorage.js'

beforeEach(() => {
  const values = {}
  globalThis.localStorage = {
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = String(value) },
    removeItem: (key) => { delete values[key] },
  }
  delete globalThis.caches
})

describe('account-scoped private browser storage', () => {
  it('uses a distinct key for every account', () => {
    expect(accountStorageKey('recents', 10)).not.toBe(accountStorageKey('recents', 11))
    writeAccountJson('recents', 10, [{ name: 'Account A food' }])
    writeAccountJson('recents', 11, [{ name: 'Account B food' }])
    expect(readAccountJson('recents', 10, [])).toEqual([{ name: 'Account A food' }])
    expect(readAccountJson('recents', 11, [])).toEqual([{ name: 'Account B food' }])
  })

  it('does not allow an anonymous private-storage namespace', () => {
    expect(() => accountStorageKey('recents')).toThrow(/authenticated user id/i)
  })

  it('removes browser-global keys from pre-isolation releases', () => {
    globalThis.localStorage.setItem('nt_outbox_v1', '[{"private":true}]')
    globalThis.localStorage.setItem('nt_recents_v1', '[{"private":true}]')
    purgeUnownedLegacyStorage()
    expect(globalThis.localStorage.getItem('nt_outbox_v1')).toBeNull()
    expect(globalThis.localStorage.getItem('nt_recents_v1')).toBeNull()
  })

  it('removes only the deleted account\'s current private storage', () => {
    writeAccountJson('outbox', 10, [{ clientId: 'a' }])
    writeAccountJson('recents', 10, [{ name: 'Private food' }])
    writeAccountJson('outbox', 11, [{ clientId: 'b' }])
    purgeAccountStorage(10)
    expect(readAccountJson('outbox', 10, [])).toEqual([])
    expect(readAccountJson('recents', 10, [])).toEqual([])
    expect(readAccountJson('outbox', 11, [])).toEqual([{ clientId: 'b' }])
  })

  it('deletes the old authenticated API cache without touching the app shell', async () => {
    const del = vi.fn(async () => true)
    globalThis.caches = {
      keys: vi.fn(async () => ['api-cache', 'workbox-precache-v2']),
      delete: del,
    }
    await purgeLegacyPrivateCaches()
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith('api-cache')
  })
})
