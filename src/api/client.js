// Thin wrapper over the backend. Everything goes through `/api/*` so keys stay
// server-side and the service worker can cache GETs for offline reads.

async function req(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { error: text }
  }
  if (!res.ok) {
    const message = body?.error || res.statusText || 'Request failed'
    const err = new Error(message)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export const api = {
  health: () => req('/health'),

  // Barcode lookup: cache → Open Food Facts → USDA. Returns a normalized food.
  lookupBarcode: (barcode) => req(`/lookup/${encodeURIComponent(barcode)}`),

  // Text search (produce / bulk bins / no barcode) against USDA + OFF.
  searchFoods: (q) => req(`/search?q=${encodeURIComponent(q)}`),

  // Parse a photographed nutrition-facts panel via Claude vision.
  parseLabel: (imageBase64, mediaType) =>
    req('/ocr', { method: 'POST', body: JSON.stringify({ imageBase64, mediaType }) }),

  createFood: (food) =>
    req('/foods', { method: 'POST', body: JSON.stringify(food) }),

  // Recently-logged foods for one-tap re-log.
  recentFoods: (limit = 20) => req(`/foods/recent?limit=${limit}`),

  // Log entries
  listEntries: ({ from, to }) =>
    req(`/entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  addEntry: (entry) =>
    req('/entries', { method: 'POST', body: JSON.stringify(entry) }),
  updateEntry: (id, patch) =>
    req(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteEntry: (id) => req(`/entries/${id}`, { method: 'DELETE' }),

  // Daily targets (versioned; latest wins)
  getTargets: () => req('/targets'),
  setTargets: (targets) =>
    req('/targets', { method: 'PUT', body: JSON.stringify(targets) }),

  // History: daily aggregates over a range.
  history: (days = 30) => req(`/history?days=${days}`),

  // Oura wearable: activity/expenditure for a local day (YYYY-MM-DD).
  ouraSummary: (ymd) => req(`/oura/summary?date=${encodeURIComponent(ymd)}`),
}
