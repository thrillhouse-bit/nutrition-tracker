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

  // Auth — a signed session cookie, not a bearer token: nothing to store or
  // attach client-side beyond the fetch itself.
  me: () => req('/auth/me'),
  signup: (email, password) => req('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),

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

  // Body profile + goal, for calculating targets instead of typing them.
  // PUT returns { profile, computedBaseline } — the server saves a non-null
  // computedBaseline as the real targets itself, same mechanism setTargets
  // above already uses, so there is no separate save step here.
  getProfile: () => req('/profile'),
  setProfile: (profile) =>
    req('/profile', { method: 'PUT', body: JSON.stringify(profile) }),

  // Optional: a wearable-derived activity-level guess. May not exist on every
  // server build — callers must treat a failure the same as "no suggestion".
  activitySuggestion: () => req('/profile/activity-suggestion'),

  // Oura wearable: activity/expenditure for a local day (YYYY-MM-DD).
  ouraSummary: (ymd) => req(`/oura/summary?date=${encodeURIComponent(ymd)}`),

  // Oura OAuth accounts (tokens never leave the server; connect is a browser
  // navigation to /api/oura/connect, not a fetch).
  ouraAccounts: () => req('/oura/accounts'),
  disconnectOura: (id) => req(`/oura/accounts/${id}`, { method: 'DELETE' }),

  // Unified energy "out" for a day (Oura preferred, Garmin fallback).
  energySummary: (ymd) => req(`/energy/summary?date=${encodeURIComponent(ymd)}`),

  // Garmin accounts (connect is a browser navigation to /api/garmin/connect).
  garminAccounts: () => req('/garmin/accounts'),
  disconnectGarmin: (id) => req(`/garmin/accounts/${id}`, { method: 'DELETE' }),

  // --- fueling intelligence ---
  // Pass the client's own day bounds alongside the date: the server's local
  // midnight is not necessarily the user's, and without bounds the composite's
  // intake would disagree with the entry list fetched via listEntries.
  today: (ymd, bounds) =>
    req(
      `/today?date=${encodeURIComponent(ymd)}${
        bounds ? `&from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}` : ''
      }`,
    ),
  planToday: (ymd) => req(`/plan/today?date=${encodeURIComponent(ymd)}`),
  signals: () => req('/signals'),

  // Manual workout input — states today's planned session directly, for
  // anyone without a connected wearable (or whose device hasn't detected
  // today's session yet). Overrides any wearable-sourced workout signal;
  // see server/providers.js's composeSignals.
  getWorkout: () => req('/plan/workout'),
  setWorkout: (workout) => req('/plan/workout', { method: 'PUT', body: JSON.stringify(workout) }),
  clearWorkout: () => req('/plan/workout', { method: 'DELETE' }),
  // tzOffsetMinutes (Date#getTimezoneOffset() convention) lets the server
  // bucket trend days by the browser's own calendar day instead of the
  // server's — the same reasoning dayBounds()/ymd() in lib/nutrition.js
  // already apply to /today and /entries, extended to /insights.
  insights: (window = 7) => req(`/insights?window=${window}&tzOffsetMinutes=${new Date().getTimezoneOffset()}`),
  connections: () => req('/connections'),
  setInfluence: (patch) => req('/connections/influence', { method: 'PUT', body: JSON.stringify(patch) }),
  setProvider: (id, patch) => req(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

  // Deletes cached Oura/Garmin/Apple records synced to this app (not the
  // OAuth accounts themselves — see Connections.jsx's per-account Disconnect).
  clearSyncedHistory: () => req('/connections/history', { method: 'DELETE' }),
  // Apple Health has no OAuth "Connect" — this generates (or regenerates,
  // invalidating the previous one) the per-account token the iOS/watch
  // companion authenticates with, since it can't carry a session cookie.
  appleToken: () => req('/apple/token', { method: 'POST' }),
}
