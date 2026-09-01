// Offline write-queue. When a log can't reach the server (offline, or spotty
// in-store signal), we stash the exact POST payload here and replay it once the
// connection returns. Every queue is namespaced by the authenticated user id;
// a browser-global queue can otherwise replay account A's food into account B.
// Backed by localStorage; every access is guarded because it can throw (private
// mode) or be absent (SSR/tests).
import { readAccountJson, writeAccountJson } from './privateStorage.js'

function requireUserId(userId) {
  if (userId === null || userId === undefined || String(userId) === '') {
    throw new Error('An authenticated user id is required for the offline queue.')
  }
}

function read(userId) {
  requireUserId(userId)
  const parsed = readAccountJson('outbox', userId, [])
  return Array.isArray(parsed) ? parsed : []
}

function write(userId, items) {
  requireUserId(userId)
  writeAccountJson('outbox', userId, items)
}

// --- pure helpers (no storage), so the core logic is unit-testable ---------
export function addToQueue(queue, item) {
  return [...queue, item]
}

export function removeFromQueue(queue, clientId) {
  return queue.filter((i) => i.clientId !== clientId)
}

// Project an outbox item into something the Today list can render, flagged
// `_pending` so the UI can mark it "not yet synced".
export function pendingEntry(item) {
  return {
    id: item.clientId,
    food: item.food,
    servings_consumed: item.payload.servings_consumed,
    meal: item.payload.meal ?? null,
    logged_at: item.payload.logged_at,
    _pending: true,
  }
}

// --- storage-backed API ----------------------------------------------------
export function getQueue(userId) {
  return read(userId)
}

export function enqueue(userId, item) {
  const q = addToQueue(read(userId), item)
  write(userId, q)
  return q
}

export function dequeue(userId, clientId) {
  const q = removeFromQueue(read(userId), clientId)
  write(userId, q)
  return q
}
