// Oura sync observability (persisted, not console-only): the last-attempted-
// sync timestamp, records fetched/accepted/deduplicated from the most recent
// backfill, the classified token-refresh/backfill failure reason, and the
// "actively syncing" in-memory flag — see server/providers.js and
// docs/oura-sync-runbook.md. These are pure-function/store-fixture tests;
// the end-to-end persistence-through-the-real-routes proof lives in
// test/api-routes.test.js ("Oura sync observability" describe block).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  classifyOuraRefreshError,
  recordOuraAttempt,
  markSyncing,
  clearSyncing,
  isSyncing,
  providerStatus,
} from '../server/providers.js'

describe('classifyOuraRefreshError', () => {
  it('classifies a 400/401 postToken error (Oura OAuth token endpoint) as an expired/revoked grant', () => {
    const err400 = Object.assign(new Error('Oura token endpoint error (400): invalid_grant'), { status: 400 })
    const err401 = Object.assign(new Error('Oura token endpoint error (401)'), { status: 401 })
    expect(classifyOuraRefreshError(err400)).toBe('refresh_token_expired')
    expect(classifyOuraRefreshError(err401)).toBe('refresh_token_expired')
  })

  it('recognizes invalid_grant/invalid_client in the message even under an unexpected status', () => {
    const err = Object.assign(new Error('weird proxy wrapped: invalid_grant'), { status: 502 })
    expect(classifyOuraRefreshError(err)).toBe('refresh_token_expired')
  })

  it('classifies any other HTTP status from the token endpoint as an Oura API error, naming the status', () => {
    const err = Object.assign(new Error('Oura token endpoint error (503)'), { status: 503 })
    expect(classifyOuraRefreshError(err)).toBe('oura_api_error_503')
  })

  it('classifies a network-level failure (no .status at all) as unreachable', () => {
    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    const networkErr = new Error('fetch failed')
    expect(classifyOuraRefreshError(abortErr)).toBe('oura_api_unreachable')
    expect(classifyOuraRefreshError(networkErr)).toBe('oura_api_unreachable')
  })

  it('falls back to a generic reason for anything else', () => {
    expect(classifyOuraRefreshError(new Error('something unexpected'))).toBe('oura_refresh_failed')
    expect(classifyOuraRefreshError(undefined)).toBe('oura_refresh_failed')
  })
})

// A minimal store fixture with real getIntegration/setIntegration semantics
// (shallow-merge patch onto the full current row) — matching server/db.js's
// two real implementations closely enough to prove recordOuraAttempt's own
// read-merge-write behavior, not just that it calls the store somehow.
function makeStore(initial = {}) {
  const rows = { oura: { user_id: 1, provider: 'oura', enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {}, ...initial } }
  return {
    async getIntegration(userId, provider) {
      return rows[provider] || { user_id: userId, provider, enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} }
    },
    async setIntegration(userId, provider, patch) {
      const cur = rows[provider] || { user_id: userId, provider, enabled: true, demo: true, settings: {} }
      rows[provider] = { ...cur, ...patch, user_id: userId, provider }
      return rows[provider]
    },
    listOuraAccounts: async () => [{ id: 1 }],
    listGarminAccounts: async () => [],
  }
}

describe('recordOuraAttempt', () => {
  it('a failed attempt sets last_attempted_sync and the error reason, leaving last_synced_at untouched', async () => {
    const store = makeStore()
    const before = await store.getIntegration(1, 'oura')
    expect(before.last_synced_at).toBeNull()
    const row = await recordOuraAttempt(store, 1, { ok: false, reason: 'refresh_token_expired' })
    expect(row.error).toBe('refresh_token_expired')
    expect(row.last_synced_at).toBeNull() // a failure never advances this
    expect(row.settings.last_attempted_sync).toBeTruthy()
    expect(row.settings.last_sync_counts).toBeUndefined() // no counts on a failure with none given
  })

  it('a successful attempt with synced:true advances last_synced_at, clears any prior error, and stores counts', async () => {
    const store = makeStore({ error: 'refresh_token_expired' }) // simulate a previously-recorded failure
    const row = await recordOuraAttempt(store, 1, {
      ok: true, synced: true, counts: { fetched: 10, accepted: 7, deduplicated: 3 },
    })
    expect(row.error).toBeNull() // cleared by the success
    expect(row.last_synced_at).toBeTruthy()
    expect(row.settings.last_attempted_sync).toBeTruthy()
    expect(row.settings.last_sync_counts).toMatchObject({ fetched: 10, accepted: 7, deduplicated: 3 })
    expect(row.settings.last_sync_counts.at).toBeTruthy()
  })

  it('a successful attempt WITHOUT synced:true (the live-fetch path) still clears an old error but does not advance last_synced_at', async () => {
    // realSignals' own success path never calls recordOuraAttempt at all (see
    // its comment) — this proves what WOULD happen if it did, and pins the
    // distinction ok:true-without-synced is meant to carry, since a future
    // caller could plausibly reach for it.
    const store = makeStore({ error: 'oura_api_unreachable', last_synced_at: '2026-08-01T00:00:00.000Z' })
    const row = await recordOuraAttempt(store, 1, { ok: true })
    expect(row.error).toBeNull()
    expect(row.last_synced_at).toBe('2026-08-01T00:00:00.000Z') // unchanged
  })

  it('preserves other existing settings keys already on the row (shallow-merge is done by recordOuraAttempt itself, not the store)', async () => {
    const store = makeStore({ settings: { some_other_key: 'keep-me' } })
    const row = await recordOuraAttempt(store, 1, { ok: false, reason: 'oura_api_unreachable' })
    expect(row.settings.some_other_key).toBe('keep-me')
    expect(row.settings.last_attempted_sync).toBeTruthy()
  })
})

describe('markSyncing / clearSyncing / isSyncing (in-memory, per userId+provider)', () => {
  it('is false until marked, true while marked, false again after clearing', () => {
    expect(isSyncing(999, 'oura')).toBe(false)
    markSyncing(999, 'oura')
    expect(isSyncing(999, 'oura')).toBe(true)
    clearSyncing(999, 'oura')
    expect(isSyncing(999, 'oura')).toBe(false)
  })

  it('is scoped per user AND per provider — marking one never marks another', () => {
    markSyncing(1001, 'oura')
    expect(isSyncing(1001, 'oura')).toBe(true)
    expect(isSyncing(1001, 'garmin')).toBe(false) // different provider, same user
    expect(isSyncing(1002, 'oura')).toBe(false) // different user, same provider
    clearSyncing(1001, 'oura')
  })

  it('clearing an id that was never marked is a harmless no-op (control)', () => {
    expect(() => clearSyncing(555555, 'oura')).not.toThrow()
    expect(isSyncing(555555, 'oura')).toBe(false)
  })
})

describe('providerStatus: oura not-configured / syncing / stale, and observability fields', () => {
  const OURA_ENV = ['OURA_CLIENT_ID', 'OURA_CLIENT_SECRET', 'OURA_REDIRECT_URI', 'OURA_TOKEN']
  const saved = {}
  beforeEach(() => {
    for (const k of OURA_ENV) { saved[k] = process.env[k]; delete process.env[k] }
  })
  afterEach(() => {
    for (const k of OURA_ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    clearSyncing(1, 'oura')
  })

  it('reports not-configured (never demo/disconnected) when the server has no Oura credentials at all', async () => {
    const store = makeStore()
    const st = await providerStatus(store, 1, 'oura', new Date())
    expect(st.status).toBe('not-configured')
    expect(st.demo).toBe(true) // demo can still show even though nobody could ever connect
  })

  it('not-configured AND demo disabled still reads not-configured, not disconnected — env-level trumps the user toggle', async () => {
    const store = makeStore({ demo: false })
    const st = await providerStatus(store, 1, 'oura', new Date())
    expect(st.status).toBe('not-configured')
    expect(st.demo).toBe(false)
  })

  it('surfaces last_attempted_sync/last_sync_counts/sync_error from settings/error even in the not-configured branch', async () => {
    const store = makeStore({
      error: 'refresh_token_expired',
      settings: { last_attempted_sync: '2026-08-20T00:00:00.000Z', last_sync_counts: { fetched: 5, accepted: 2, deduplicated: 3, at: '2026-08-20T00:00:00.000Z' } },
    })
    const st = await providerStatus(store, 1, 'oura', new Date())
    expect(st.sync_error).toBe('refresh_token_expired')
    expect(st.last_attempted_sync).toBe('2026-08-20T00:00:00.000Z')
    expect(st.last_sync_counts).toMatchObject({ fetched: 5, accepted: 2, deduplicated: 3 })
  })

  it('reports syncing (before connected/stale) whenever markSyncing was called for this user+oura', async () => {
    process.env.OURA_CLIENT_ID = 'cid'; process.env.OURA_CLIENT_SECRET = 'sec'; process.env.OURA_REDIRECT_URI = 'https://x/callback'
    const store = makeStore({ last_synced_at: new Date().toISOString() }) // would otherwise read 'connected'
    markSyncing(1, 'oura')
    const st = await providerStatus(store, 1, 'oura', new Date())
    expect(st.status).toBe('syncing')
  })

  it('is connected within 48h of the last successful sync, stale just past it, and stale (not connected) when never synced at all', async () => {
    process.env.OURA_CLIENT_ID = 'cid'; process.env.OURA_CLIENT_SECRET = 'sec'; process.env.OURA_REDIRECT_URI = 'https://x/callback'
    const now = new Date('2026-08-25T12:00:00.000Z')
    const within = new Date(now.getTime() - 47 * 3600000).toISOString()
    const past = new Date(now.getTime() - 49 * 3600000).toISOString()

    const connectedStore = makeStore({ last_synced_at: within })
    expect((await providerStatus(connectedStore, 1, 'oura', now)).status).toBe('connected')

    const staleStore = makeStore({ last_synced_at: past })
    expect((await providerStatus(staleStore, 1, 'oura', now)).status).toBe('stale')

    const neverSyncedStore = makeStore({ last_synced_at: null })
    expect((await providerStatus(neverSyncedStore, 1, 'oura', now)).status).toBe('stale')
  })
})

describe('providerStatus: garmin not-configured is distinct from demo/disconnected', () => {
  const GARMIN_ENV = ['GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET', 'GARMIN_REDIRECT_URI']
  const saved = {}
  beforeEach(() => { for (const k of GARMIN_ENV) { saved[k] = process.env[k]; delete process.env[k] } })
  afterEach(() => {
    for (const k of GARMIN_ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('reports not-configured when the server has no Garmin OAuth credentials, regardless of the demo toggle', async () => {
    const demoOnStore = { getIntegration: async () => ({ demo: true, settings: {} }), listGarminAccounts: async () => [] }
    const demoOffStore = { getIntegration: async () => ({ demo: false, settings: {} }), listGarminAccounts: async () => [] }
    expect((await providerStatus(demoOnStore, 1, 'garmin', new Date())).status).toBe('not-configured')
    expect((await providerStatus(demoOffStore, 1, 'garmin', new Date())).status).toBe('not-configured')
  })
})
