import { normalizeState, RPG_SAVE_KEY } from './save.js'

export const ACCOUNT_SAVE_CACHE_PREFIX = 'control-tower-shift:rpg-account-save:v1:'
export const ACCOUNT_SAVE_CACHE_VERSION = 1

function accountIdString(userId) {
  if (typeof userId !== 'string' && typeof userId !== 'number') return null
  const value = String(userId).trim()
  return value && value.length <= 256 ? value : null
}

export function accountSaveCacheKey(userId) {
  const id = accountIdString(userId)
  if (!id) throw new TypeError('A stable account id is required for RPG save caching.')
  return `${ACCOUNT_SAVE_CACHE_PREFIX}${encodeURIComponent(id)}`
}

function safeGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null
  } catch {
    return null
  }
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value)
    return typeof storage?.setItem === 'function'
  } catch {
    return false
  }
}

function cacheEnvelope(userId, state, {
  revision = 0,
  gameSchemaVersion = state.schemaVersion,
  pending = false,
  cachedAt = new Date().toISOString(),
} = {}) {
  return {
    cacheVersion: ACCOUNT_SAVE_CACHE_VERSION,
    accountId: accountIdString(userId),
    payload: state,
    gameSchemaVersion,
    revision,
    pending,
    cachedAt,
  }
}

export function readAccountSaveCache(storage, userId) {
  const id = accountIdString(userId)
  if (!id) return null
  const raw = safeGet(storage, accountSaveCacheKey(id))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed?.cacheVersion !== ACCOUNT_SAVE_CACHE_VERSION
      || parsed.accountId !== id
      || !Number.isSafeInteger(parsed.revision)
      || parsed.revision < 0
      || !Number.isSafeInteger(parsed.gameSchemaVersion)
      || parsed.gameSchemaVersion < 1
      || typeof parsed.pending !== 'boolean'
    ) return null
    const state = normalizeState(parsed.payload)
    if (!state) return null
    return { ...parsed, payload: state }
  } catch {
    return null
  }
}

function writeAccountSaveCache(storage, userId, state, options) {
  const envelope = cacheEnvelope(userId, state, options)
  return safeSet(storage, accountSaveCacheKey(userId), JSON.stringify(envelope))
    ? envelope
    : null
}

function normalizedRemoteSave(value) {
  if (!value || typeof value !== 'object') return null
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) return null
  if (!Number.isSafeInteger(value.gameSchemaVersion) || value.gameSchemaVersion < 1) return null
  const state = normalizeState(value.payload)
  if (!state) return null
  return {
    state,
    revision: value.revision,
    gameSchemaVersion: value.gameSchemaVersion,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function sameState(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function isOfflineFailure(error) {
  return !Number.isInteger(error?.status) || error.status >= 500
}

export class AccountSaveConflict extends Error {
  constructor({ localState, remoteState, expectedRevision, currentRevision }) {
    super('Account RPG save conflict.')
    this.name = 'AccountSaveConflict'
    this.code = 'RPG_SAVE_REVISION_CONFLICT'
    this.localState = localState
    this.remoteState = remoteState
    this.expectedRevision = expectedRevision
    this.currentRevision = currentRevision
  }
}

export function inspectLegacyRpgSave(storage, legacyKey = RPG_SAVE_KEY) {
  const raw = safeGet(storage, legacyKey)
  if (!raw) return { available: false, state: null, error: 'none', legacyKey }
  try {
    const parsed = JSON.parse(raw)
    const state = normalizeState(parsed)
    return state
      ? { available: true, state, error: 'none', legacyKey }
      : { available: false, state: null, error: 'invalid', legacyKey }
  } catch {
    return { available: false, state: null, error: 'corrupt', legacyKey }
  }
}

export function confirmLegacyRpgImport({ storage, userId, inspection, confirmed }) {
  if (confirmed !== true) return { imported: false, reason: 'confirmation_required' }
  const id = accountIdString(userId)
  if (!id) return { imported: false, reason: 'invalid_account' }
  if (readAccountSaveCache(storage, id)) return { imported: false, reason: 'account_cache_exists' }
  const state = normalizeState(inspection?.state)
  if (!inspection?.available || !state) return { imported: false, reason: 'invalid_legacy_save' }
  const cache = writeAccountSaveCache(storage, id, state, {
    revision: 0,
    gameSchemaVersion: state.schemaVersion,
    pending: true,
  })
  return cache
    ? { imported: true, cache }
    : { imported: false, reason: 'cache_unavailable' }
}

export function createAccountSaveCoordinator({ api, storage, userId, now = () => new Date().toISOString() }) {
  const id = accountIdString(userId)
  if (!id) throw new TypeError('A stable account id is required.')
  if (typeof api?.getRpgSave !== 'function' || typeof api?.putRpgSave !== 'function') {
    throw new TypeError('An RPG save API adapter is required.')
  }

  let booted = false
  let revision = 0
  let gameSchemaVersion = null
  let queued = null
  let pumping = false
  let scheduled = false

  const persistCache = (state, options) => writeAccountSaveCache(storage, id, state, {
    ...options,
    cachedAt: now(),
  })

  async function boot() {
    const cached = readAccountSaveCache(storage, id)
    try {
      const response = await api.getRpgSave()
      const remoteValue = response?.save ?? null
      if (!remoteValue) {
        booted = true
        revision = cached?.revision || 0
        gameSchemaVersion = cached?.gameSchemaVersion || null
        if (cached?.pending) {
          return {
            status: 'ready', source: 'pending-cache', state: cached.payload,
            revision, gameSchemaVersion, pending: true,
          }
        }
        return { status: 'empty', source: 'remote', state: null, revision: 0, gameSchemaVersion: null, pending: false }
      }
      const remote = normalizedRemoteSave(remoteValue)
      if (!remote) {
        booted = true
        return { status: 'error', source: 'remote', state: null, code: 'INVALID_REMOTE_SAVE' }
      }
      if (cached?.pending) {
        // A lost response can leave a local pending snapshot even though the
        // server accepted it. Recognize that exact next revision as success.
        if (remote.revision === cached.revision + 1 && sameState(remote.state, cached.payload)) {
          revision = remote.revision
          gameSchemaVersion = remote.gameSchemaVersion
          persistCache(remote.state, { revision, gameSchemaVersion, pending: false })
          booted = true
          return { status: 'ready', source: 'remote', ...remote, pending: false }
        }
        if (remote.revision === cached.revision) {
          revision = cached.revision
          gameSchemaVersion = cached.gameSchemaVersion
          booted = true
          return {
            status: 'ready', source: 'pending-cache', state: cached.payload,
            revision, gameSchemaVersion, pending: true,
          }
        }
        revision = cached.revision
        gameSchemaVersion = cached.gameSchemaVersion
        booted = true
        const conflict = new AccountSaveConflict({
          localState: cached.payload,
          remoteState: remote.state,
          expectedRevision: cached.revision,
          currentRevision: remote.revision,
        })
        return { status: 'conflict', source: 'boot', conflict, state: cached.payload, remoteState: remote.state }
      }
      revision = remote.revision
      gameSchemaVersion = remote.gameSchemaVersion
      persistCache(remote.state, { revision, gameSchemaVersion, pending: false })
      booted = true
      return { status: 'ready', source: 'remote', ...remote, pending: false }
    } catch (error) {
      booted = true
      if (!isOfflineFailure(error)) {
        return { status: 'error', source: 'remote', state: null, error }
      }
      if (!cached) return { status: 'offline-empty', source: 'cache', state: null, error }
      revision = cached.revision
      gameSchemaVersion = cached.gameSchemaVersion
      return {
        status: 'ready', source: 'offline-cache', state: cached.payload,
        revision, gameSchemaVersion, pending: cached.pending, error,
      }
    }
  }

  async function performWrite(state) {
    const expectedRevision = revision
    const outgoingGameSchemaVersion = state.schemaVersion
    persistCache(state, {
      revision: expectedRevision,
      gameSchemaVersion: outgoingGameSchemaVersion,
      pending: true,
    })
    try {
      const response = await api.putRpgSave({
        payload: state,
        gameSchemaVersion: outgoingGameSchemaVersion,
        expectedRevision,
      })
      const remote = normalizedRemoteSave(response?.save)
      if (!remote) {
        return { status: 'pending', state, revision: expectedRevision, code: 'INVALID_SAVE_RESPONSE' }
      }
      revision = remote.revision
      gameSchemaVersion = remote.gameSchemaVersion
      persistCache(remote.state, { revision, gameSchemaVersion, pending: false })
      return {
        status: response.idempotent ? 'idempotent' : 'saved',
        state: remote.state,
        revision,
        gameSchemaVersion,
      }
    } catch (error) {
      if (error?.status !== 409) {
        return { status: 'pending', state, revision: expectedRevision, gameSchemaVersion: outgoingGameSchemaVersion, error }
      }
      let remote = null
      try {
        remote = normalizedRemoteSave((await api.getRpgSave())?.save)
      } catch {
        // The conflict response still carries a current revision; resolution
        // can be retried later when the authoritative payload is reachable.
      }
      const conflict = new AccountSaveConflict({
        localState: state,
        remoteState: remote?.state || null,
        expectedRevision,
        currentRevision: remote?.revision ?? error.body?.currentRevision ?? null,
      })
      // The pending local cache remains untouched and the remote is only
      // returned to the caller. Resolution must be an explicit UI decision.
      return { status: 'conflict', state, remoteState: remote?.state || null, conflict }
    }
  }

  async function pump() {
    if (pumping) return
    pumping = true
    scheduled = false
    while (queued) {
      const job = queued
      queued = null
      const result = await performWrite(job.state)
      for (const resolve of job.resolvers) resolve(result)
    }
    pumping = false
  }

  function save(state) {
    if (!booted) return Promise.resolve({ status: 'error', code: 'BOOT_REQUIRED' })
    const normalized = normalizeState(state)
    if (!normalized) return Promise.resolve({ status: 'error', code: 'INVALID_STATE' })
    const promise = new Promise((resolve) => {
      if (queued) {
        queued.state = normalized
        queued.resolvers.push(resolve)
      } else {
        queued = { state: normalized, resolvers: [resolve] }
      }
    })
    if (!scheduled && !pumping) {
      scheduled = true
      queueMicrotask(pump)
    }
    return promise
  }

  function retryPending() {
    const cached = readAccountSaveCache(storage, id)
    if (!cached?.pending) return Promise.resolve({ status: 'no-pending-save' })
    return save(cached.payload)
  }

  async function resolveConflict(conflict, resolution) {
    if (!(conflict instanceof AccountSaveConflict)) {
      return { status: 'error', code: 'INVALID_CONFLICT' }
    }
    if (!Number.isSafeInteger(conflict.currentRevision) || conflict.currentRevision < 1) {
      return { status: 'error', code: 'MISSING_REMOTE_REVISION' }
    }
    if (resolution === 'remote') {
      const remoteState = normalizeState(conflict.remoteState)
      if (!remoteState) return { status: 'error', code: 'MISSING_REMOTE_STATE' }
      revision = conflict.currentRevision
      gameSchemaVersion = remoteState.schemaVersion
      persistCache(remoteState, {
        revision,
        gameSchemaVersion,
        pending: false,
      })
      return { status: 'resolved-remote', state: remoteState, revision, gameSchemaVersion }
    }
    if (resolution === 'local') {
      const localState = normalizeState(conflict.localState)
      if (!localState) return { status: 'error', code: 'MISSING_LOCAL_STATE' }
      // This is the only intentional overwrite path. It is reachable only
      // after a visible conflict choice and still performs a conditional
      // write against the exact authoritative revision, so a newer race
      // produces another conflict instead of silently winning.
      revision = conflict.currentRevision
      gameSchemaVersion = localState.schemaVersion
      return performWrite(localState)
    }
    return { status: 'error', code: 'INVALID_CONFLICT_RESOLUTION' }
  }

  return {
    boot,
    save,
    retryPending,
    resolveConflict,
    cacheKey: accountSaveCacheKey(id),
    getRevision: () => revision,
    getGameSchemaVersion: () => gameSchemaVersion,
  }
}
