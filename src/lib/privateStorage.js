// Browser-private state belongs to an authenticated account, never to the
// browser origin as a whole. These helpers keep the namespace rule in one
// place and guard every storage/cache access for private mode and tests.

const LEGACY_PRIVATE_KEYS = ['nt_outbox_v1', 'nt_recents_v1']
const LEGACY_PRIVATE_CACHES = ['api-cache']
const ACCOUNT_PRIVATE_NAMESPACES = ['outbox', 'recents']

export function accountStorageKey(namespace, userId) {
  if (userId === null || userId === undefined || String(userId) === '') {
    throw new Error('An authenticated user id is required for private browser storage.')
  }
  return `nt_${namespace}_v2:user:${encodeURIComponent(String(userId))}`
}

export function readAccountJson(namespace, userId, fallback = []) {
  try {
    const raw = globalThis.localStorage?.getItem(accountStorageKey(namespace, userId))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeAccountJson(namespace, userId, value) {
  try {
    globalThis.localStorage?.setItem(accountStorageKey(namespace, userId), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// v1 keys cannot be attributed safely after an account switch. They are never
// adopted or replayed into whichever account happens to be signed in during
// the upgrade. Remove them once the new account-aware client boots.
export function purgeUnownedLegacyStorage() {
  try {
    for (const key of LEGACY_PRIVATE_KEYS) globalThis.localStorage?.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

// Permanent account deletion must also erase the device-local copies that
// intentionally survive an ordinary logout (offline queue and recents). The
// namespaces live here so a new private cache cannot be forgotten by the
// deletion flow later.
export function purgeAccountStorage(userId) {
  try {
    for (const namespace of ACCOUNT_PRIVATE_NAMESPACES) {
      globalThis.localStorage?.removeItem(accountStorageKey(namespace, userId))
    }
  } catch {
    /* storage unavailable */
  }
}

// The previous service worker used one URL-keyed cache for every authenticated
// GET. The new worker never reads it, and this purge removes the residual copy
// during upgrade and logout.
export async function purgeLegacyPrivateCaches() {
  try {
    if (!globalThis.caches?.keys) return
    const names = await globalThis.caches.keys()
    await Promise.all(names.filter((name) => LEGACY_PRIVATE_CACHES.includes(name)).map((name) => globalThis.caches.delete(name)))
  } catch {
    /* CacheStorage unavailable */
  }
}
