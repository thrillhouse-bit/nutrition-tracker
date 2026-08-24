// Offline write-queue. When a log can't reach the server (offline, or spotty
// in-store signal), we stash the exact POST payload here and replay it once the
// connection returns. Backed by localStorage; every access is guarded because
// it can throw (private mode) or be absent (SSR/tests).
const KEY = 'nt_outbox_v1'

function read() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(items) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(items))
  } catch {
    /* storage unavailable — the queue is best-effort */
  }
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
export function getQueue() {
  return read()
}

export function enqueue(item) {
  const q = addToQueue(read(), item)
  write(q)
  return q
}

export function dequeue(clientId) {
  const q = removeFromQueue(read(), clientId)
  write(q)
  return q
}
