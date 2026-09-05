// Thin wrapper over the backend. Everything goes through `/api/*` so keys stay
// server-side. Authenticated responses are explicitly never browser-cached;
// offline writes use the account-scoped outbox instead.

async function req(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
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
  legalStatus: () => req('/legal/status'),

  // Auth — a signed session cookie, not a bearer token: nothing to store or
  // attach client-side beyond the fetch itself.
  me: () => req('/auth/me'),
  signup: (email, password, acceptLegal, inviteCode) => req('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, acceptLegal, inviteCode }) }),
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  acceptCurrentLegal: () => req('/auth/legal-acceptance', { method: 'POST', body: JSON.stringify({ acceptLegal: true }) }),
  exportAccountData: () => req('/account/export'),
  deleteAccount: (password, confirmation) =>
    req('/account/delete', { method: 'POST', body: JSON.stringify({ password, confirmation }) }),

  // Oathbearer cross-device save. Revision 0 creates the first save; every
  // later write must send the revision returned by the last successful GET or
  // PUT so a stale tab cannot silently overwrite newer progress.
  getRpgSave: () => req('/rpg/save'),
  putRpgSave: ({ payload, gameSchemaVersion, expectedRevision }) =>
    req('/rpg/save', {
      method: 'PUT',
      body: JSON.stringify({ payload, gameSchemaVersion, expectedRevision }),
    }),
  getRpgSaveHistory: () => req('/rpg/save/history'),
  restoreRpgSave: ({ revision, expectedRevision }) =>
    req('/rpg/save/restore', {
      method: 'POST',
      body: JSON.stringify({ revision, expectedRevision }),
    }),

  // Barcode lookup: cache → Open Food Facts → USDA. Returns a normalized food.
  lookupBarcode: (barcode) => req(`/lookup/${encodeURIComponent(barcode)}`),

  // Text search (produce / bulk bins / no barcode) against USDA + OFF.
  // Takes a `signal` so a superseded search is genuinely cancelled rather than
  // left to run and have its answer thrown away — see
  // src/lib/debouncedSearch.js for the race this closes.
  searchFoods: (q, { signal } = {}) => req(`/search?q=${encodeURIComponent(q)}`, { signal }),

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

  // Manual hydration. API amounts are canonical millilitres; presentation can
  // safely offer ounces without persisting a locale-specific unit.
  listWaterEntries: ({ from, to }) => req(`/water?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  addWaterEntry: (entry) => req('/water', { method: 'POST', body: JSON.stringify(entry) }),
  updateWaterEntry: (id, patch) => req(`/water/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteWaterEntry: (id) => req(`/water/${id}`, { method: 'DELETE' }),

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
  appearance: () => req('/appearance'),
  setAppearance: (accent) => req('/appearance', { method: 'PUT', body: JSON.stringify({ accent }) }),

  // Optional: a wearable-derived activity-level guess. May not exist on every
  // server build — callers must treat a failure the same as "no suggestion".
  activitySuggestion: () => req('/profile/activity-suggestion'),

  // Oura wearable: activity/expenditure for a local day (YYYY-MM-DD).
  ouraSummary: (ymd) => req(`/oura/summary?date=${encodeURIComponent(ymd)}`),

  // Oura OAuth accounts (tokens never leave the server; connect is a browser
  // navigation to /api/oura/connect, not a fetch).
  ouraAccounts: () => req('/oura/accounts'),
  disconnectOura: (id) => req(`/oura/accounts/${id}`, { method: 'DELETE' }),

  // Manually re-run the Oura history backfill (readiness/sleep score/
  // activity/workouts) for a small trailing window — the server route
  // already existed (server/index.js's POST /api/oura/backfill) with no
  // client caller before Today's "Refresh" action. `days` defaults small;
  // the endpoint itself clamps to 1-90 server-side regardless.
  ouraBackfill: (days = 5) => req(`/oura/backfill?days=${encodeURIComponent(days)}`, { method: 'POST' }),

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
  planToday: (ymd, bounds) =>
    req(
      `/plan/today?date=${encodeURIComponent(ymd)}${
        bounds ? `&from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}` : ''
      }`,
    ),
  signals: (ymd, bounds) => req(`/signals?date=${encodeURIComponent(ymd)}${bounds ? `&from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}` : ''}`),

  // Manual workout input — states today's planned session directly, for
  // anyone without a connected wearable (or whose device hasn't detected
  // today's session yet). Overrides any wearable-sourced workout signal;
  // see server/providers.js's composeSignals.
  getWorkout: () => req('/plan/workout'),
  setWorkout: (workout) => req('/plan/workout', { method: 'PUT', body: JSON.stringify(workout) }),
  clearWorkout: () => req('/plan/workout', { method: 'DELETE' }),

  // Body weight log — kg is the only unit the API speaks; the caller
  // converts (see lib/nutrition.js's lbToKg) before calling this. `day`
  // defaults server-side to today when omitted.
  logWeight: (kg, day) => req('/weight', { method: 'PUT', body: JSON.stringify(day ? { kg, day } : { kg }) }),
  deleteWeight: (day) => req(`/weight/${encodeURIComponent(day)}`, { method: 'DELETE' }),

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

  // --- Canonical daily fuel plan ---
  // AFP is the one profile, workout schedule, and target engine used by both
  // Today and Plan. The older profile/targets calls above remain only as a
  // compatibility surface while existing accounts migrate.
  getAfpProfile: () => req('/afp/profile'),
  setAfpProfile: (patch) => req('/afp/profile', { method: 'PUT', body: JSON.stringify(patch) }),

  listAfpWorkouts: (from, to) => req(`/afp/workouts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  saveAfpWorkout: (workout) => req('/afp/workouts', { method: 'PUT', body: JSON.stringify(workout) }),
  deleteAfpWorkout: (id) => req(`/afp/workouts/${id}`, { method: 'DELETE' }),

  // The computed (or frozen historical) plan for one day, plus fresh
  // progress against that day's actual logged intake.
  afpPlan: (ymd, bounds) =>
    req(
      `/afp/plan?date=${encodeURIComponent(ymd)}${
        bounds ? `&from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}` : ''
      }`,
    ),
  recomputeAfpPlan: (ymd) => req(`/afp/plan/${encodeURIComponent(ymd)}/recompute`, { method: 'POST' }),
  // Pass {} to clear a previously-set override.
  setAfpPlanOverrides: (ymd, overrides) =>
    req(`/afp/plan/${encodeURIComponent(ymd)}/overrides`, { method: 'PATCH', body: JSON.stringify(overrides) }),
}
