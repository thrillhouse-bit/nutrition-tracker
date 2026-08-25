import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { computeTrend } from '../server/weightTrend.js'

// Route-level tests: the real Express app, an in-memory store (so no test ever
// touches server/.data/store.json), and a stubbed Oura module (no network).
// The server's timezone is pinned to Pacific/Apia (UTC+13, no DST) so that
// "server-local day" and "UTC day" visibly disagree — which is exactly what the
// date-defaulting bugs here need to be observable.
process.env.TZ = 'Pacific/Apia'

// Multi-user: almost every route below is gated by requireAuth (session
// cookie, see server/auth.js) and every store method now takes userId as its
// first argument. The fake store here stays single-user in spirit — every
// test in this file drives ONE signed-up user throughout — but its method
// signatures must match the real store's shape or the routes calling them
// (with a real userId in the first slot) would silently misbehave.
const fake = vi.hoisted(() => {
  const state = {
    users: [], // { id, email, password_hash, created_at }
    entries: [], // { id, food_id, logged_at, servings_consumed, meal, food }
    integrations: {}, // keyed by provider only — one user drives this whole file
    appleSignals: {},
    ouraAccounts: [],
    ouraHistory: [], // { day, value }
    weightEntries: [], // { day, kg }
    manualWorkouts: {}, // day -> workout
    garminAccounts: [],
    garminDailies: {}, // `${accountId}:${day}` -> row
    targets: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 },
    targetsEverSet: false, // real stores start false; getLatestTargets's default look identical either way
    profile: { height_cm: null, weight_kg: null, sex: null, age_years: null, units_pref: 'imperial', activity_level: null, goal: null, updated_at: null },
    setTargetsCalls: [], // every store.setTargets(...) call, in order — lets a test prove a gate did NOT fire
  }
  let userSeq = 0
  const store = {
    // --- auth / users ----------------------------------------------------
    createUser: async ({ email, password_hash }) => {
      const row = { id: ++userSeq, email, password_hash, created_at: new Date().toISOString() }
      state.users.push(row)
      return { id: row.id, email: row.email, created_at: row.created_at }
    },
    getUserByEmail: async (email) => state.users.find((u) => u.email === email) || null,
    getUserById: async (id) => {
      const u = state.users.find((u) => u.id === Number(id))
      return u ? { id: u.id, email: u.email, created_at: u.created_at } : null
    },
    countUsers: async () => state.users.length,
    getSoleUserId: async () => (state.users.length === 1 ? state.users[0].id : null),
    findUserIdByAppleIngestToken: async (token) => {
      for (const row of Object.values(state.integrations)) {
        if (row.provider === 'apple' && row.settings?.ingest_token === token) return row.user_id ?? null
      }
      return null
    },
    migrateLegacyDataToUser: async () => {},

    // --- personal-data methods — userId is always the first argument -----
    getProfile: async (userId) => state.profile,
    setProfile: async (userId, patch) => {
      state.profile = { ...state.profile, ...patch, updated_at: '2026-08-25T00:00:00.000Z' }
      return state.profile
    },
    setTargets: async (userId, t) => {
      state.setTargetsCalls.push(t)
      state.targets = { ...t }
      state.targetsEverSet = true
      return state.targets
    },
    hasTargets: async (userId) => state.targetsEverSet,
    getIntegration: async (userId, p) => state.integrations[p] || { provider: p, enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} },
    setIntegration: async (userId, p, patch) => {
      const m = { ...(state.integrations[p] || { provider: p, enabled: true, demo: true, settings: {} }), ...patch, provider: p }
      state.integrations[p] = m
      return m
    },
    listEntries: async (userId, { from, to }) => state.entries.filter((e) => e.logged_at >= from && e.logged_at < to),
    getLatestTargets: async (userId) => state.targets,
    savePlan: async (userId, date, plan) => ({ date, ...plan }),
    replaceAppleSignals: async (userId, day, rows) => { state.appleSignals[day] = rows; return rows.length },
    listAppleSignals: async (userId, day) => state.appleSignals[day] || [],
    // Real training-load history: derived from the same appleSignals state
    // replaceAppleSignals/listAppleSignals already use, ranged like
    // listOuraHistory below. This whole module is vi.mock'd out for the
    // route tests (see the vi.mock('../server/db.js', ...) below), so —
    // same reasoning as saveOuraHistory's fake above, which reimplements the
    // scoredDays fix rather than importing it — the aggregation is
    // reimplemented here rather than imported from the real db.js; it's
    // proven equivalent to server/db.js's aggregateWorkoutRows by
    // store-json.test.js and store-pg.test.js instead.
    listAppleWorkoutHistory: async (userId, from, to) => {
      const byDay = new Map()
      for (const [day, samples] of Object.entries(state.appleSignals)) {
        if (day < from || day > to) continue
        for (const s of samples) {
          if (s.metric !== 'workout') continue
          if (!byDay.has(day)) byDay.set(day, { day, minutes: 0, sessions: 0 })
          const bucket = byDay.get(day)
          const mins = Number(s.value?.duration_min)
          if (Number.isFinite(mins) && mins > 0) bucket.minutes += mins
          bucket.sessions += 1
        }
      }
      return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
    },
    listOuraAccounts: async (userId) => state.ouraAccounts,
    listGarminAccounts: async (userId) => state.garminAccounts,
    updateOuraTokens: async (userId, id, tokens) => {},
    saveOuraHistory: async (userId, rows) => {
      // Mirrors PgStore/JsonStore's scoredDays fix: only a day with an actual
      // score this run gets deleted-then-reinserted. A day present in `rows`
      // with a transient null (Oura rate-limited, a partial outage) must
      // leave whatever was already stored for that day standing, not erase
      // it — the exact production bug this fix was for.
      const scoredDays = new Set(rows.filter((r) => r.day != null && r.score != null).map((r) => r.day))
      state.ouraHistory = state.ouraHistory.filter((r) => !scoredDays.has(r.day))
      let n = 0
      for (const r of rows) {
        if (r.score == null) continue
        // Mirrors PgStore/JsonStore: the score is never the whole story — the
        // day's total_calories/active_calories/steps ride alongside it in
        // `extra` (see server/db.js's two saveOuraHistory implementations),
        // and GET /api/profile/activity-suggestion reads extra.steps back out.
        // A fake that dropped this would let a backfill test "pass" while
        // proving nothing about whether that context actually survives
        // persistence — the house failure mode this codebase keeps producing.
        state.ouraHistory.push({
          day: r.day,
          value: r.score,
          extra: { total_calories: r.total_calories ?? null, active_calories: r.active_calories ?? null, steps: r.steps ?? null },
        })
        n++
      }
      return n
    },
    listOuraHistory: async (userId, from, to) => state.ouraHistory.filter((r) => r.day >= from && r.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1)),
    saveWeightEntry: async (userId, day, kg) => {
      state.weightEntries = state.weightEntries.filter((r) => r.day !== day)
      state.weightEntries.push({ day, kg })
      return { day, kg }
    },
    listWeightEntries: async (userId, from, to) => state.weightEntries.filter((r) => r.day >= from && r.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1)),
    deleteWeightEntry: async (userId, day) => {
      const before = state.weightEntries.length
      state.weightEntries = state.weightEntries.filter((r) => r.day !== day)
      return state.weightEntries.length < before
    },
    getManualWorkout: async (userId, day) => state.manualWorkouts[day] || null,
    setManualWorkout: async (userId, day, workout) => {
      state.manualWorkouts[day] = { ...workout, recorded_at: '2026-08-25T00:00:00.000Z' }
      return state.manualWorkouts[day]
    },
    clearManualWorkout: async (userId, day) => {
      const had = day in state.manualWorkouts
      delete state.manualWorkouts[day]
      return had
    },
    // manualWorkouts is deliberately excluded — that's authored input, not a
    // synced wearable record (see server/db.js's clearSyncedHistory).
    clearSyncedHistory: async (userId) => {
      const ouraCount = state.ouraHistory.length
      state.ouraHistory = []
      const appleCount = Object.values(state.appleSignals).reduce((n, rows) => n + rows.length, 0)
      state.appleSignals = {}
      const garminCount = Object.keys(state.garminDailies).length
      state.garminDailies = {}
      return ouraCount + appleCount + garminCount
    },

    // --- NOT userId-scoped (matches the real store — see server/db.js) ---
    getGarminDaily: async (id, day) => state.garminDailies[`${id}:${day}`] || null,
    upsertGarminDaily: async (row) => { state.garminDailies[`${row.account_id}:${row.day}`] = row; return row },
    // Keyed by Garmin's own opaque user id (garmin_user_id on the account) —
    // this is how the webhook (no session of its own) routes a pushed daily
    // to the right local account.
    findGarminAccountByGarminUserId: async (garminUserId) => state.garminAccounts.find((a) => a.garmin_user_id === garminUserId) || null,
  }
  return { state, store }
})

const oura = vi.hoisted(() => ({
  legacy: false, // whether OURA_TOKEN-style config appears present
  dailySummary: async () => null,
  activityRange: async () => [],
  dailyReadiness: async () => null,
  readinessRange: async () => [],
  dailySleepHours: async () => null,
}))

vi.mock('../server/db.js', () => ({ store: fake.store, backend: 'json-file' }))
vi.mock('../server/integrations/oura.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    ouraConfigured: () => oura.legacy,
    getToken: () => 'legacy-token',
    dailySummary: (...args) => oura.dailySummary(...args),
    activityRange: (...args) => oura.activityRange(...args),
    dailyReadiness: (...args) => oura.dailyReadiness(...args),
    readinessRange: (...args) => oura.readinessRange(...args),
    dailySleepHours: (...args) => oura.dailySleepHours(...args),
  }
})

let server
let base
let authCookie = '' // Cookie header for the one signed-up test user, set in beforeAll
let authUserId = null

beforeAll(async () => {
  process.env.PORT = '0' // never collide with a dev server
  const { default: app } = await import('../server/index.js')
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  // Every route under test (other than the Apple ingest / Garmin webhook
  // routes, which have their own non-session auth) is gated by requireAuth,
  // so every describe block below needs a real signed-in session. One signup
  // for the whole file is enough — no test here is about multiple users.
  const signupRes = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'route-tests@example.com', password: 'testpassword123' }),
  })
  if (signupRes.status !== 201) {
    throw new Error(`test setup: signup failed (${signupRes.status}): ${await signupRes.text()}`)
  }
  const setCookie = signupRes.headers.get('set-cookie') || ''
  authCookie = setCookie.split(';')[0] // "nt_session=<token>"
  authUserId = (await signupRes.json()).user.id
})

afterAll(() => {
  server?.close()
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.APPLE_INGEST_TOKEN
  oura.legacy = false
  oura.dailySummary = async () => null
  fake.state.entries = []
  fake.state.garminAccounts = []
  fake.state.garminDailies = {}
  fake.state.appleSignals = {}
  fake.state.integrations = {}
  fake.state.targets = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 }
  fake.state.targetsEverSet = false
  fake.state.profile = { height_cm: null, weight_kg: null, sex: null, age_years: null, units_pref: 'imperial', activity_level: null, goal: null, updated_at: null }
  fake.state.setTargetsCalls = []
  fake.state.ouraHistory = []
  fake.state.weightEntries = []
  // Note: fake.state.users is intentionally NOT reset — the one signed-up
  // test user (and authCookie/authUserId) must survive across every test in
  // this file.
})

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie, ...headers },
    body: JSON.stringify(body),
  })

const put = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie, ...headers },
    body: JSON.stringify(body),
  })

// GET helper carrying the same session cookie as post/put — every protected
// route in this file is read through this rather than a bare fetch().
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers: { Cookie: authCookie, ...headers } })

const patch = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie, ...headers },
    body: JSON.stringify(body),
  })

describe('GET /api/version', () => {
  const ORIGINAL = process.env.GIT_SHA

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.GIT_SHA
    else process.env.GIT_SHA = ORIGINAL
  })

  it('reports GIT_SHA when the build set it', async () => {
    process.env.GIT_SHA = 'abc1234'
    const res = await get('/api/version')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sha: 'abc1234' })
  })

  it('reports "unknown" rather than a stale/fabricated value when GIT_SHA was never set (control)', async () => {
    delete process.env.GIT_SHA
    const res = await get('/api/version')
    expect(await res.json()).toEqual({ sha: 'unknown' })
  })

  it('requires no auth, same as /api/health (control)', async () => {
    const res = await fetch(`${base}/api/version`)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/apple/ingest token gate', () => {
  const sample = { date: '2026-08-20', samples: [{ metric: 'sleep', value: 7.2, unit: 'h' }] }

  it('refuses a missing or wrong token when APPLE_INGEST_TOKEN is set', async () => {
    process.env.APPLE_INGEST_TOKEN = 'sekret'
    const missing = await post('/api/apple/ingest', sample)
    expect(missing.status).toBe(401)
    expect((await missing.json()).error).toMatch(/token/i)
    const wrong = await post('/api/apple/ingest', sample, { 'x-ingest-token': 'nope' })
    expect(wrong.status).toBe(401)
    // The gate really blocked the write, not just the response.
    expect(fake.state.appleSignals['2026-08-20']).toBeUndefined()
  })

  it('accepts the right token (the gate is a gate, not a wall)', async () => {
    process.env.APPLE_INGEST_TOKEN = 'sekret'
    const res = await post('/api/apple/ingest', sample, { 'x-ingest-token': 'sekret' })
    expect(res.status).toBe(200)
    expect((await res.json()).ingested).toBe(1)
    expect(fake.state.appleSignals['2026-08-20']).toHaveLength(1)
  })

  // Multi-user rewrite: unlike the old single-tenant "dev mode" (no token
  // configured -> wide open), there is no implicit "the sole user" to
  // attribute an unauthenticated ingest POST to unless a credential is
  // actually presented (see server/index.js's resolveAppleIngestUser) — a
  // missing token is refused even when APPLE_INGEST_TOKEN itself is unset.
  it('refuses when no token is presented at all, even with APPLE_INGEST_TOKEN unset (no implicit sole-user attribution under multi-user)', async () => {
    const res = await post('/api/apple/ingest', sample)
    expect(res.status).toBe(401)
    expect(fake.state.appleSignals['2026-08-20']).toBeUndefined()
  })

  it('drops malformed samples without failing the request', async () => {
    process.env.APPLE_INGEST_TOKEN = 'sekret'
    const res = await post('/api/apple/ingest', {
      date: '2026-08-20',
      samples: [{ metric: 'steps', value: 900 }, { value: 1 }, 'junk', null, { metric: 42 }],
    }, { 'x-ingest-token': 'sekret' })
    expect(res.status).toBe(200)
    expect((await res.json()).ingested).toBe(1)
  })

  // A valid token proves who the companion is, not that this account still
  // wants it syncing — the Connections tab's "enabled" toggle must actually
  // stop writes, not just change how they're displayed.
  it('refuses the write once the account has disabled Apple Health, even with a valid token', async () => {
    process.env.APPLE_INGEST_TOKEN = 'sekret'
    fake.state.integrations.apple = { provider: 'apple', enabled: false, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} }
    const res = await post('/api/apple/ingest', sample, { 'x-ingest-token': 'sekret' })
    expect(res.status).toBe(403)
    expect(fake.state.appleSignals['2026-08-20']).toBeUndefined()
  })
})

describe('Input validation (zod) on mutating routes', () => {
  it('PUT /api/targets rejects a non-numeric value before it reaches the store', async () => {
    const res = await put('/api/targets', { calories: 'banana' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/calories/i)
    expect(fake.state.setTargetsCalls).toHaveLength(0) // never reached the store
  })

  it('PUT /api/targets rejects a negative value', async () => {
    const res = await put('/api/targets', { protein_g: -5 })
    expect(res.status).toBe(400)
    expect(fake.state.setTargetsCalls).toHaveLength(0)
  })

  it('PUT /api/targets accepts a valid partial update (control)', async () => {
    const res = await put('/api/targets', { calories: 2400 })
    expect(res.status).toBe(200)
    expect(fake.state.setTargetsCalls).toHaveLength(1)
  })

  it('POST /api/foods rejects a missing name', async () => {
    const res = await post('/api/foods', { calories: 100 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('POST /api/foods rejects a negative calorie count', async () => {
    const res = await post('/api/foods', { name: 'Weird food', calories: -100 })
    expect(res.status).toBe(400)
  })

  it('POST /api/entries rejects a non-positive servings_consumed', async () => {
    const res = await post('/api/entries', { food_id: 1, servings_consumed: 0 })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/entries/:id rejects a negative servings_consumed', async () => {
    fake.state.entries = [{ id: 5, food_id: 1, logged_at: '2026-08-20T12:00:00.000Z', servings_consumed: 1, meal: null }]
    const res = await patch('/api/entries/5', { servings_consumed: -1 })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/garmin/webhook malformed dailies', () => {
  // Garmin's own opaque user id — the webhook has no session of its own, so
  // it routes a pushed daily to a local account by matching this against
  // garmin_accounts.garmin_user_id (see server/index.js's webhook handler).
  const valid = { userId: 'garmin-user-abc', calendarDate: '2026-08-25', activeKilocalories: 500, bmrKilocalories: 1500, steps: 1000 }

  it('survives a malformed element and still stores the valid rows around it', async () => {
    fake.state.garminAccounts = [{ id: 7, garmin_user_id: 'garmin-user-abc' }]
    // Garmin retries on any non-200: one junk element must not 500 the batch
    // and lose the valid summary that came with it.
    const res = await post('/api/garmin/webhook', { dailies: [null, 'junk', valid] })
    expect(res.status).toBe(200)
    expect(fake.state.garminDailies['7:2026-08-25']).toMatchObject({ total_calories: 2000, steps: 1000 })
  })

  it('stores a well-formed batch (control)', async () => {
    fake.state.garminAccounts = [{ id: 7, garmin_user_id: 'garmin-user-abc' }]
    const res = await post('/api/garmin/webhook', { dailies: [valid] })
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(1)
    expect(fake.state.garminDailies['7:2026-08-25']).toBeTruthy()
  })

  it('answers 200 with no linked account (control)', async () => {
    // No garminAccounts set — findGarminAccountByGarminUserId finds nothing
    // to route this daily to, so it's skipped rather than guessed at.
    const res = await post('/api/garmin/webhook', { dailies: [valid] })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/oura/summary default day', () => {
  it("defaults to the server's local day like every sibling endpoint, not the UTC day", async () => {
    // 2026-08-24T20:00:00Z is already 2026-08-25 in Apia (UTC+13).
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 24, 20, 0, 0) })
    oura.legacy = true
    let asked
    oura.dailySummary = async (token, day) => { asked = day; return null }
    const res = await get('/api/oura/summary')
    expect(res.status).toBe(200)
    expect(asked).toBe('2026-08-25')
  })

  it('passes an explicit date through untouched (control)', async () => {
    oura.legacy = true
    let asked
    oura.dailySummary = async (token, day) => { asked = day; return { day, total_calories: 1900 } }
    const res = await get('/api/oura/summary?date=2026-08-10')
    expect(res.status).toBe(200)
    expect(asked).toBe('2026-08-10')
  })
})

describe('GET /api/energy/summary Oura failure fallback', () => {
  const day = '2026-08-25'
  const garminRow = { day, total_calories: 2600, active_calories: 500, steps: 8000 }

  it('falls back to stored Garmin data when the Oura fetch throws', async () => {
    oura.legacy = true
    oura.dailySummary = async () => { throw new Error('Oura API error (503).') }
    fake.state.garminAccounts = [{ id: 7 }]
    fake.state.garminDailies[`7:${day}`] = garminRow
    const res = await get(`/api/energy/summary?date=${day}`)
    expect(res.status).toBe(200) // not a 500 — the endpoint's whole point is the fallback
    const body = await res.json()
    expect(body.source).toBe('garmin')
    expect(body.out).toBe(2600)
  })

  it('still prefers Oura when it answers (control)', async () => {
    oura.legacy = true
    oura.dailySummary = async () => ({ day, total_calories: 2400, active_calories: 450, steps: 7000 })
    fake.state.garminAccounts = [{ id: 7 }]
    fake.state.garminDailies[`7:${day}`] = garminRow
    const res = await get(`/api/energy/summary?date=${day}`)
    const body = await res.json()
    expect(body.source).toBe('oura')
    expect(body.out).toBe(2400)
  })

  it('falls through to Garmin when Oura simply has no record yet (control)', async () => {
    oura.legacy = true
    oura.dailySummary = async () => null
    fake.state.garminAccounts = [{ id: 7 }]
    fake.state.garminDailies[`7:${day}`] = garminRow
    const res = await get(`/api/energy/summary?date=${day}`)
    const body = await res.json()
    expect(body.source).toBe('garmin')
  })
})

describe('POST /api/oura/backfill', () => {
  // activityRange/readinessRange are NOT reset by the file-level afterEach
  // (only dailySummary is) — several tests below set one or both to
  // rejecting/scored fakes, and without this, whichever was set last would
  // leak into a later describe block that assumes the harmless [] default.
  afterEach(() => {
    oura.activityRange = async () => []
    oura.readinessRange = async () => []
  })

  it('refuses with 400 when no Oura account is resolvable (control)', async () => {
    oura.legacy = false
    fake.state.ouraAccounts = []
    const res = await post('/api/oura/backfill', {})
    expect(res.status).toBe(400)
  })

  it('stores the READINESS score, not the Activity score, using activity only for steps/calories context', async () => {
    oura.legacy = true
    fake.state.ouraHistory = []
    let askedActivity, askedReadiness
    // Must read readinessRange (daily_readiness), not activityRange
    // (daily_activity) alone, for the score — this endpoint used to call
    // only the activity endpoint and store its score as "readiness" (see
    // integrations/oura.js). Activity's score (55/60) is deliberately
    // different from Readiness's (70/null) below so a regression would be
    // caught rather than coincidentally match, while activity's
    // total_calories/active_calories/steps still flow through as context
    // (GET /api/profile/activity-suggestion reads them back out), so
    // replacing activityRange outright would have silently starved that
    // endpoint instead of fixing the mislabeling.
    oura.activityRange = async (token, from, to) => {
      askedActivity = { token, from, to }
      return [
        { day: '2026-08-01', score: 55, total_calories: 2100, active_calories: 400, steps: 8000 },
        { day: '2026-08-02', score: 60, total_calories: 2000, active_calories: 300, steps: 6000 },
      ]
    }
    oura.readinessRange = async (token, from, to) => {
      askedReadiness = { token, from, to }
      return [
        { day: '2026-08-01', score: 70 },
        { day: '2026-08-02', score: null }, // no readiness recorded that day
      ]
    }
    const res = await post('/api/oura/backfill?days=10', {})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.daysSaved).toBe(1) // the null-READINESS day is dropped, even though Activity had a score that day
    expect(askedActivity.token).toBe('legacy-token')
    expect(askedReadiness.token).toBe('legacy-token')
    const stored = await fake.store.listOuraHistory(authUserId, '2026-08-01', '2026-08-02')
    expect(stored).toEqual([
      // Readiness's score (70), never Activity's (55) — but Activity's own
      // calories/steps context still rides alongside it (see backfillOuraHistory's
      // day-merge in server/index.js), so it isn't lost by preferring Readiness's score.
      { day: '2026-08-01', value: 70, extra: { total_calories: 2100, active_calories: 400, steps: 8000 } },
    ])
  })

  it('is idempotent: re-running backfill over the same days replaces rather than duplicates', async () => {
    oura.legacy = true
    fake.state.ouraHistory = []
    oura.activityRange = async () => [
      { day: '2026-08-01', score: 55, total_calories: 2100, active_calories: 400, steps: 8000 },
    ]
    oura.readinessRange = async () => [{ day: '2026-08-01', score: 70 }]
    await post('/api/oura/backfill?days=10', {})
    // A second run — same days, a changed reading (as a re-sync after a
    // correction, or simply the same call retried, would produce) — must
    // replace the day's row, never append a second one alongside it.
    oura.readinessRange = async () => [{ day: '2026-08-01', score: 82 }]
    const res = await post('/api/oura/backfill?days=10', {})
    expect(res.status).toBe(200)
    expect((await res.json()).daysSaved).toBe(1)
    const stored = await fake.store.listOuraHistory(authUserId, '2026-08-01', '2026-08-01')
    expect(stored).toHaveLength(1) // not 2 — the first run's row was replaced, not duplicated
    expect(stored[0].value).toBe(82)
  })

  it('a day dropped from Readiness on re-sync still leaves exactly one row from the first run (control)', async () => {
    // Companion to the idempotency test above: proves the replace-not-append
    // behavior isn't merely "the new row happens to overwrite the old one at
    // the same array index." Two distinct days, then a re-run that only
    // resupplies one of them — the other must survive untouched, not vanish
    // and not duplicate.
    oura.legacy = true
    fake.state.ouraHistory = []
    oura.activityRange = async () => []
    oura.readinessRange = async () => [
      { day: '2026-08-01', score: 70 },
      { day: '2026-08-02', score: 75 },
    ]
    await post('/api/oura/backfill?days=10', {})
    oura.readinessRange = async () => [{ day: '2026-08-01', score: 71 }]
    await post('/api/oura/backfill?days=10', {})
    const stored = await fake.store.listOuraHistory(authUserId, '2026-08-01', '2026-08-02')
    expect(stored).toHaveLength(2)
    expect(stored.find((r) => r.day === '2026-08-01').value).toBe(71) // updated
    expect(stored.find((r) => r.day === '2026-08-02').value).toBe(75) // untouched by the narrower re-run
  })

  it('a rejected Activity fetch fails the whole backfill rather than silently dropping steps/calories context', async () => {
    // backfillOuraHistory's Promise.all over [activityRange, readinessRange]
    // means a failed Activity fetch must surface as a failure, never as a
    // "successful" backfill quietly missing every day's calories/steps — the
    // silent-partial-write shape this codebase keeps having to re-learn.
    oura.legacy = true
    fake.state.ouraHistory = []
    oura.activityRange = async () => { throw new Error('oura activity fetch failed') }
    oura.readinessRange = async () => [{ day: '2026-08-01', score: 70 }]
    const res = await post('/api/oura/backfill?days=10', {})
    expect(res.status).toBe(500) // not 200 — a partial write must not report success
    const stored = await fake.store.listOuraHistory(authUserId, '2026-08-01', '2026-08-01')
    expect(stored).toHaveLength(0) // nothing persisted from the failed attempt
  })

  it('a transient null on re-sync for a day that scored before leaves the old score standing, not erased', async () => {
    // End-to-end regression for the production-verification audit fix (see
    // PgStore/JsonStore's saveOuraHistory): a re-run backfill can get a
    // transient null for a day that scored fine before (Oura rate-limited, a
    // partial-outage response — the readiness endpoint still returns an
    // entry for every day in range, just with score: null). That must never
    // erase the previously-correct value.
    oura.legacy = true
    fake.state.ouraHistory = []
    oura.activityRange = async () => []
    oura.readinessRange = async () => [{ day: '2026-08-01', score: 82 }, { day: '2026-08-02', score: 75 }]
    await post('/api/oura/backfill?days=10', {})
    oura.readinessRange = async () => [{ day: '2026-08-01', score: 82 }, { day: '2026-08-02', score: null }] // 08-02 hiccups
    const res = await post('/api/oura/backfill?days=10', {})
    expect(res.status).toBe(200)
    expect((await res.json()).daysSaved).toBe(1) // only 08-01 had a score to (re)save this run
    const stored = await fake.store.listOuraHistory(authUserId, '2026-08-01', '2026-08-02')
    expect(stored.find((r) => r.day === '2026-08-02').value).toBe(75) // untouched, not wiped
  })
})

describe('PUT/GET/DELETE /api/plan/workout (manual workout input)', () => {
  afterEach(() => { fake.state.manualWorkouts = {} })

  it('rejects an unknown kind (control)', async () => {
    const res = await put('/api/plan/workout', { kind: 'skateboarding', time: '17:30' })
    expect(res.status).toBe(400)
  })

  it('rejects a malformed time (control)', async () => {
    const res = await put('/api/plan/workout', { kind: 'run', time: '5:30pm' })
    expect(res.status).toBe(400)
  })

  it('saves a valid workout and computes label/time/startHour server-side', async () => {
    const res = await put('/api/plan/workout', { kind: 'run', time: '17:30', duration_min: 45 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workout.kind).toBe('run')
    expect(body.workout.label).toBe('Evening Run')
    expect(body.workout.time).toBe('5:30 PM')
    expect(body.workout.startHour).toBe(17.5)
    expect(body.workout.endHour).toBeCloseTo(18.25, 5) // +45 min
    expect(body.workout.status).toBe('planned')

    const got = await get('/api/plan/workout')
    expect((await got.json()).workout.kind).toBe('run')
  })

  it('a saved manual workout overrides the demo/wearable workout signal in GET /api/signals', async () => {
    await put('/api/plan/workout', { kind: 'ride', time: '08:00' })
    const res = await get('/api/signals')
    const body = await res.json()
    expect(body.signals.workout.provider).toBe('manual')
    expect(body.signals.workout.demo).toBe(false)
    expect(body.signals.workout.value.kind).toBe('ride')
  })

  it('DELETE clears it — 204 when something was cleared, 404 when nothing was there (control)', async () => {
    const emptyDelete = await fetch(`${base}/api/plan/workout`, { method: 'DELETE', headers: { Cookie: authCookie } })
    expect(emptyDelete.status).toBe(404)

    await put('/api/plan/workout', { kind: 'run', time: '17:30' })
    const realDelete = await fetch(`${base}/api/plan/workout`, { method: 'DELETE', headers: { Cookie: authCookie } })
    expect(realDelete.status).toBe(204)

    const got = await get('/api/plan/workout')
    expect((await got.json()).workout).toBeNull()
  })
})

describe('DELETE /api/connections/history (Connections "Delete synced history")', () => {
  afterEach(() => {
    fake.state.ouraHistory = []
    fake.state.appleSignals = {}
    fake.state.garminDailies = {}
    fake.state.manualWorkouts = {}
  })

  it('actually removes cached Oura/Apple/Garmin records and reports how many — a live control, not a dead end', async () => {
    fake.state.ouraHistory = [{ day: '2026-08-20', value: 70 }]
    fake.state.appleSignals = { '2026-08-20': [{ metric: 'steps', value: 5000 }] }
    fake.state.garminDailies = { '1:2026-08-20': { account_id: 1, day: '2026-08-20', steps: 4000 } }

    const res = await fetch(`${base}/api/connections/history`, { method: 'DELETE', headers: { Cookie: authCookie } })
    expect(res.status).toBe(200)
    expect((await res.json()).removed).toBe(3)

    expect(fake.state.ouraHistory).toHaveLength(0)
    expect(fake.state.appleSignals).toEqual({})
    expect(fake.state.garminDailies).toEqual({})
  })

  it('reports 0 removed rather than erroring when there is nothing synced (control)', async () => {
    const res = await fetch(`${base}/api/connections/history`, { method: 'DELETE', headers: { Cookie: authCookie } })
    expect(res.status).toBe(200)
    expect((await res.json()).removed).toBe(0)
  })

  it('never removes a manually-typed workout — that is authored input, not synced wearable data (control)', async () => {
    await put('/api/plan/workout', { kind: 'run', time: '17:30' })
    fake.state.ouraHistory = [{ day: '2026-08-20', value: 70 }]

    await fetch(`${base}/api/connections/history`, { method: 'DELETE', headers: { Cookie: authCookie } })

    const got = await get('/api/plan/workout')
    expect((await got.json()).workout.kind).toBe('run')
  })

  it('requires auth (control)', async () => {
    const res = await fetch(`${base}/api/connections/history`, { method: 'DELETE' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/insights ouraReadiness', () => {
  it('includes backfilled Oura readiness scores inside the requested window', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.ouraHistory = [
      { day: '2026-08-20', value: 72 },
      { day: '2026-08-24', value: 81 },
    ]
    const res = await get('/api/insights?window=7')
    const body = await res.json()
    expect(body.ouraReadiness).toEqual([
      { date: '2026-08-20', score: 72 },
      { date: '2026-08-24', score: 81 },
    ])
  })

  it('omits ouraReadiness entries outside the window (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.ouraHistory = [{ day: '2026-07-01', value: 60 }] // long before a 7-day window
    const res = await get('/api/insights?window=7')
    const body = await res.json()
    expect(body.ouraReadiness).toEqual([])
  })
})

describe('GET /api/insights workoutLoad', () => {
  // Real Apple Health workout samples, wire shape (`duration_min`/`est_kcal` —
  // see ios/Shared/HealthModel.swift's WorkoutValue.CodingKeys), seeded the
  // same way the ingest route persists them (server/index.js POST
  // /api/apple/ingest -> store.replaceAppleSignals).
  it('sums same-day Apple workout minutes and counts sessions, inside the requested window', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.appleSignals = {
      '2026-08-20': [
        { metric: 'workout', value: { kind: 'run', duration_min: 30, est_kcal: 300, status: 'completed' } },
        { metric: 'workout', value: { kind: 'strength', duration_min: 20, est_kcal: 150, status: 'completed' } },
      ],
      '2026-08-24': [
        { metric: 'workout', value: { kind: 'ride', duration_min: 45, est_kcal: 500, status: 'completed' } },
      ],
    }
    const res = await get('/api/insights?window=7')
    const body = await res.json()
    expect(body.workoutLoad).toEqual([
      { date: '2026-08-20', minutes: 50, sessions: 2 },
      { date: '2026-08-24', minutes: 45, sessions: 1 },
    ])
  })

  it('omits workoutLoad entries outside the window (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.appleSignals = {
      '2026-07-01': [{ metric: 'workout', value: { kind: 'run', duration_min: 30, status: 'completed' } }],
    }
    const res = await get('/api/insights?window=7')
    expect((await res.json()).workoutLoad).toEqual([])
  })

  it('ignores non-workout Apple signals on the same day (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.appleSignals = {
      '2026-08-20': [{ metric: 'steps', value: 5000 }, { metric: 'expenditure', value: 2000 }],
    }
    const res = await get('/api/insights?window=7')
    expect((await res.json()).workoutLoad).toEqual([])
  })

  it('returns an empty array, not an error, when nothing has synced (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.appleSignals = {}
    const res = await get('/api/insights?window=7')
    expect(res.status).toBe(200)
    expect((await res.json()).workoutLoad).toEqual([])
  })
})

describe('GET /api/insights weight trend', () => {
  it('returns an empty array when nothing has been logged (control)', async () => {
    fake.state.weightEntries = []
    const res = await get('/api/insights?window=7')
    expect((await res.json()).weight).toEqual([])
  })

  // Server-local "today" under this fixed clock, in the suite's pinned
  // Pacific/Apia (UTC+13) timezone, is 2026-08-26 — so a 7-day window starts
  // 2026-08-20 and a 14-day window starts 2026-08-13; 2026-07-01 sits outside
  // both, same as the ouraReadiness tests above rely on.
  it('computes the trend over ALL history, not just the requested window, so the same day reads identically across window sizes', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.weightEntries = [
      { day: '2026-07-01', kg: 90 }, // outside every window tested — seeds the trend only
      { day: '2026-08-20', kg: 80 },
      { day: '2026-08-24', kg: 80 },
    ]
    const res7 = await get('/api/insights?window=7')
    const body7 = await res7.json()
    // Only the two in-window entries come back...
    expect(body7.weight.map((w) => w.day)).toEqual(['2026-08-20', '2026-08-24'])
    // ...but their trend values reflect the FULL history including the
    // excluded 2026-07-01 seed — computeTrend run over everything and then
    // sliced to the window, never re-seeded fresh at the window's own first
    // entry (which would make 2026-08-20's trend exactly 80, not pulled down
    // from 90).
    const expected = computeTrend(fake.state.weightEntries).filter((e) => e.day >= '2026-08-20')
    expect(body7.weight).toEqual(expected)
    expect(body7.weight[0].trend).not.toBe(80)

    // The regression this test exists to catch: a day inside BOTH windows
    // must read identically regardless of which window is requested.
    const res14 = await get('/api/insights?window=14')
    const body14 = await res14.json()
    const day20in14 = body14.weight.find((w) => w.day === '2026-08-20')
    expect(day20in14.trend).toBe(body7.weight[0].trend)
  })
})

describe('PUT/DELETE /api/weight (body weight log)', () => {
  afterEach(() => { fake.state.weightEntries = [] })

  it('rejects a non-numeric or non-positive kg (control)', async () => {
    for (const bad of [0, -5, 'x', null, undefined]) {
      const res = await put('/api/weight', { kg: bad })
      expect(res.status).toBe(400)
    }
    expect(fake.state.weightEntries).toEqual([])
  })

  it('logs today (server-local) when no day is given', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) }) // -> 2026-08-26 Apia
    const res = await put('/api/weight', { kg: 81.5 })
    expect(res.status).toBe(200)
    expect((await res.json()).entry).toEqual({ day: '2026-08-26', kg: 81.5 })
    expect(fake.state.weightEntries).toEqual([{ day: '2026-08-26', kg: 81.5 }])
  })

  it('accepts an explicit day (control)', async () => {
    const res = await put('/api/weight', { kg: 80, day: '2026-08-01' })
    expect(res.status).toBe(200)
    expect(fake.state.weightEntries).toEqual([{ day: '2026-08-01', kg: 80 }])
  })

  it('logging twice for the same day replaces rather than duplicates', async () => {
    await put('/api/weight', { kg: 80, day: '2026-08-01' })
    const res = await put('/api/weight', { kg: 79.2, day: '2026-08-01' })
    expect(res.status).toBe(200)
    expect(fake.state.weightEntries).toEqual([{ day: '2026-08-01', kg: 79.2 }]) // not two rows
  })

  it('deletes a logged day (204) and reports 404 for a day with nothing to delete', async () => {
    await put('/api/weight', { kg: 80, day: '2026-08-01' })
    const res = await fetch(`${base}/api/weight/2026-08-01`, { method: 'DELETE', headers: { Cookie: authCookie } })
    expect(res.status).toBe(204)
    expect(fake.state.weightEntries).toEqual([])

    const again = await fetch(`${base}/api/weight/2026-08-01`, { method: 'DELETE', headers: { Cookie: authCookie } })
    expect(again.status).toBe(404)
  })

  it('requires auth, same as every other route in this file (control)', async () => {
    const res = await fetch(`${base}/api/weight`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kg: 80 }) })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/insights day-bucketing timezone', () => {
  const meal = (name, calories, loggedAt) => ({
    id: Math.random(), food_id: 1, logged_at: loggedAt, servings_consumed: 1, meal: null,
    food: { id: 1, name, calories, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 },
  })

  // 06:00 and 20:00 UTC, same UTC calendar day — but this suite pins the
  // SERVER's own local time to Pacific/Apia (UTC+13, see file header), which
  // splits these across two Apia calendar days (06:00 UTC -> 19:00 Apia
  // Aug 25; 20:00 UTC -> 09:00 Apia Aug 26). A fix that silently ignored
  // tzOffsetMinutes and fell through to the server-local path would still
  // report 2 tracked days here, same as the pre-fix bug — so this is a
  // real test of "the passed offset is what's driving the bucketing," not
  // just a case that happens to look right under Apia too.
  it('buckets same-UTC5-day entries together when the client sends its own tzOffsetMinutes, even though the server-local (Apia) day would split them', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.entries = [
      meal('Breakfast', 600, '2026-08-25T06:00:00.000Z'),
      meal('Dinner', 200, '2026-08-25T20:00:00.000Z'),
    ]
    const res = await get('/api/insights?window=7&tzOffsetMinutes=300') // UTC-5: both 01:00 and 15:00 local Aug 25
    const body = await res.json()
    expect(body.nutrition.trackedDays).toBe(1)
    expect(body.days).toHaveLength(1)
    expect(body.days[0].totals.calories).toBe(800)
  })

  it('the same two entries split into two days under the server-local (Apia) fallback when tzOffsetMinutes is omitted (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.entries = [
      meal('Breakfast', 600, '2026-08-25T06:00:00.000Z'),
      meal('Dinner', 200, '2026-08-25T20:00:00.000Z'),
    ]
    const res = await get('/api/insights?window=7') // no tzOffsetMinutes -> server-local (Apia) fallback
    const body = await res.json()
    expect(body.nutrition.trackedDays).toBe(2)
  })
})

describe('GET /api/today day bounds', () => {
  const entry = {
    id: 1,
    food_id: 1,
    logged_at: '2026-08-24T12:00:00.000Z',
    servings_consumed: 1,
    meal: null,
    food: { id: 1, name: 'Bread', calories: 500, protein_g: 20, carbs_g: 80, fat_g: 5, fiber_g: 4, sugar_g: 3, sodium_mg: 400 },
  }

  it("honors the client's own day bounds so intake matches the log the client shows", async () => {
    fake.state.entries = [entry]
    // A client in UTC asking about its local 2026-08-24. The server's Apia-local
    // reading of that date is [2026-08-23T11:00Z, 2026-08-24T11:00Z) — which
    // excludes this 12:00Z entry the client's Today list plainly contains.
    const qs = 'date=2026-08-24&from=2026-08-24T00:00:00.000Z&to=2026-08-25T00:00:00.000Z'
    const res = await get(`/api/today?${qs}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.intake.calories).toBe(500)
    expect(body.entries).toHaveLength(1)
  })

  it('keeps the server-local day when no bounds are sent (control)', async () => {
    fake.state.entries = [entry]
    // Apia-local 2026-08-25 is [2026-08-24T11:00Z, 2026-08-25T11:00Z) — the
    // 12:00Z entry belongs to it.
    const res = await get('/api/today?date=2026-08-25')
    const body = await res.json()
    expect(body.intake.calories).toBe(500)
    const miss = await get('/api/today?date=2026-08-23')
    expect((await miss.json()).intake.calories).toBe(0)
  })

  it('ignores unparseable bounds and falls back to the server-local day (control)', async () => {
    fake.state.entries = [entry]
    const res = await get('/api/today?date=2026-08-25&from=garbage&to=alsogarbage')
    expect(res.status).toBe(200)
    expect((await res.json()).intake.calories).toBe(500)
  })
})

describe('GET /api/profile', () => {
  it('returns an all-null-fields object when nothing has been saved yet (never 404s)', async () => {
    const res = await get('/api/profile')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ height_cm: null, weight_kg: null, sex: null, age_years: null, activity_level: null, goal: null })
  })
})

describe('PUT /api/profile validation', () => {
  it.each([
    ['sex', 'nonbinary-typo'],
    ['activity_level', 'super_active'],
    ['goal', 'shred'],
    ['units_pref', 'furlongs'],
  ])('rejects an invalid %s enum value with 400', async (field, bad) => {
    const before = fake.state.profile[field]
    const res = await put('/api/profile', { [field]: bad })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(new RegExp(field))
    // The gate really blocked the write, not just the response.
    expect(fake.state.profile[field]).toBe(before)
  })

  it('rejects units_pref: null (it is not nullable — unlike the other enum fields)', async () => {
    const res = await put('/api/profile', { units_pref: null })
    expect(res.status).toBe(400)
  })

  it.each([
    ['height_cm', -5],
    ['weight_kg', 0],
    ['age_years', 'not-a-number'],
    ['height_cm', '20kg'], // Number('20kg') is NaN — not finite
  ])('rejects a non-positive or non-finite %s with 400', async (field, bad) => {
    const res = await put('/api/profile', { [field]: bad })
    expect(res.status).toBe(400)
    expect(fake.state.setTargetsCalls).toHaveLength(0) // an invalid PUT must never reach the calculator
  })

  it('accepts null for a nullable numeric/enum field (clearing a value, control)', async () => {
    await put('/api/profile', { height_cm: 180 })
    const res = await put('/api/profile', { height_cm: null })
    expect(res.status).toBe(200)
    expect((await res.json()).profile.height_cm).toBeNull()
  })
})

describe('PUT /api/profile merge + calculated baseline', () => {
  it('saves a partial profile but does NOT call setTargets while fields are missing', async () => {
    const res = await put('/api/profile', { height_cm: 180, weight_kg: 80 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ height_cm: 180, weight_kg: 80 })
    expect(body.computedBaseline).toBeNull()
    expect(fake.state.setTargetsCalls).toHaveLength(0) // no silent target changes from an incomplete profile
  })

  it('merges across separate calls — filling the form field by field keeps earlier fields (control)', async () => {
    await put('/api/profile', { height_cm: 180 })
    await put('/api/profile', { weight_kg: 80 })
    const res = await get('/api/profile')
    const body = await res.json()
    expect(body.profile).toMatchObject({ height_cm: 180, weight_kg: 80 })
  })

  it('computes and saves a baseline via store.setTargets once every required field is present', async () => {
    await put('/api/profile', { height_cm: 180, weight_kg: 80 })
    await put('/api/profile', { sex: 'male', age_years: 40 })
    const res = await put('/api/profile', { activity_level: 'sedentary', goal: 'maintain' })
    expect(res.status).toBe(200)
    const body = await res.json()
    // bmr = 10*80 + 6.25*180 - 5*40 + 5 = 1730; tdee = 1730*1.2 = 2076 -> 2080
    expect(body.computedBaseline).toMatchObject({ calories: 2080, protein_g: 128 })
    expect(fake.state.setTargetsCalls).toHaveLength(1) // fired exactly once, on the completing call
    expect(fake.state.targets).toMatchObject({ calories: 2080, protein_g: 128 })
  })

  it('reuses the existing targets mechanism: the saved row is exactly what setTargets returned (no parallel system)', async () => {
    const res = await put('/api/profile', {
      height_cm: 180, weight_kg: 80, sex: 'male', age_years: 40, activity_level: 'sedentary', goal: 'maintain',
    })
    const body = await res.json()
    const targetsRes = await get('/api/targets')
    expect((await targetsRes.json()).targets).toEqual(body.computedBaseline)
  })
})

describe('GET /api/targets hasTargets (onboarding gate)', () => {
  it('is false before any profile/target save, even though targets already carries the default numbers', async () => {
    const res = await get('/api/targets')
    const body = await res.json()
    expect(body.hasTargets).toBe(false)
    expect(body.targets.calories).toBe(2000) // the default is still served — just not flagged as real
  })

  it('flips to true once a complete profile computes and saves a baseline', async () => {
    await put('/api/profile', {
      height_cm: 180, weight_kg: 80, sex: 'male', age_years: 40, activity_level: 'sedentary', goal: 'maintain',
    })
    const res = await get('/api/targets')
    expect((await res.json()).hasTargets).toBe(true)
  })

  it('flips to true via the direct manual-entry path too, not only the calculator (control)', async () => {
    await put('/api/targets', { calories: 1800, protein_g: 140, carbs_g: 180, fat_g: 60, fiber_g: 25, sugar_g: null, sodium_mg: 2000 })
    const res = await get('/api/targets')
    expect((await res.json()).hasTargets).toBe(true)
  })
})

describe('GET /api/profile/activity-suggestion', () => {
  it('returns nulls when there is no Oura history to base a suggestion on', async () => {
    fake.state.ouraHistory = []
    const res = await get('/api/profile/activity-suggestion')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ suggested: null, basis: null })
  })

  it('maps a 10-day step average to the documented activity band', async () => {
    // The suite pins TZ=Pacific/Apia (UTC+13, no DST — see the file header) so
    // this UTC instant is already local 2026-08-26; the endpoint windows by
    // localYmd like every sibling date-defaulting endpoint in this file, so
    // the query range is ['2026-08-17', '2026-08-26'] — both days below sit
    // inside it.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    // Two days averaging 8400 steps/day -> "moderate" band (7500-10000).
    fake.state.ouraHistory = [
      { day: '2026-08-18', value: 70, extra: { steps: 8000 } },
      { day: '2026-08-19', value: 70, extra: { steps: 8800 } },
    ]
    const res = await get('/api/profile/activity-suggestion')
    const body = await res.json()
    expect(body.suggested).toBe('moderate')
    expect(body.basis).toBe('10-day avg steps: 8400')
  })

  it.each([
    [4999, 'sedentary'],
    [5000, 'light'], // shared boundary belongs to the lower band, not sedentary
    [7500, 'light'],
    [7501, 'moderate'],
    [10000, 'moderate'],
    [12500, 'active'],
    [12501, 'very_active'],
  ])('classifies an average of %i steps as %s', async (steps, level) => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.ouraHistory = [{ day: '2026-08-20', value: 70, extra: { steps } }]
    const res = await get('/api/profile/activity-suggestion')
    expect((await res.json()).suggested).toBe(level)
  })

  it('never writes to the profile — it is a suggestion only (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.ouraHistory = [{ day: '2026-08-20', value: 70, extra: { steps: 15000 } }] // would suggest very_active
    await get('/api/profile/activity-suggestion')
    expect(fake.state.profile.activity_level).toBeNull() // untouched
  })
})

describe('GET /api/insights correlations', () => {
  // A single entry that day carrying the given protein total. tzOffsetMinutes
  // is pinned to 0 in every test below so day-bucketing lands on the UTC
  // calendar day — matching server/correlations.js's own UTC-based
  // nextDayYmd, so a test's expected pairing isn't accidentally right only
  // because of the suite's Pacific/Apia server-local default (see the
  // day-bucketing describe block above, which exists to catch exactly that
  // kind of accidental agreement).
  const proteinEntry = (day, proteinG) => ({
    id: Math.random(),
    food_id: 1,
    logged_at: `${day}T12:00:00.000Z`,
    servings_consumed: 1,
    meal: null,
    food: { id: 1, name: 'food', calories: 100, protein_g: proteinG, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 },
  })

  it('reports available:true with the real r and n for a clearly-correlated dataset (protein day D vs readiness day D+1)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 31, 12, 0, 0) }) // 2026-08-31
    // 10 days of protein logged Aug 20-29, each paired with the FOLLOWING
    // day's readiness (Aug 21-30) — both series increase in lockstep, a
    // perfect linear relationship (r=1), well past both floors
    // (MIN_OVERLAP_DAYS=6, R_THRESHOLD=0.5). Both series sit inside the
    // 30-day window (Aug 2 - Aug 31).
    const proteinDays = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'].map((d) => `2026-08-${d}`)
    const readinessDays = ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30'].map((d) => `2026-08-${d}`)
    fake.state.entries = proteinDays.map((day, i) => proteinEntry(day, 60 + i * 10)) // 60..150
    fake.state.ouraHistory = readinessDays.map((day, i) => ({ day, value: 50 + i * 5 })) // 50..95

    const res = await get('/api/insights?window=30&tzOffsetMinutes=0')
    const body = await res.json()
    expect(body.correlations).toEqual({
      available: true,
      r: 1,
      n: 10,
      note: 'Days you logged more protein tended to show higher next-day readiness (r=1.00 over 10 days).',
    })
  })

  it('stays available:false below the sample-size floor even when the few points look correlated (control on MIN_OVERLAP_DAYS)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 31, 12, 0, 0) })
    // Only 3 overlapping day-pairs, perfectly correlated (r would be 1.0) —
    // MIN_OVERLAP_DAYS=6 must still refuse this, because 3 points prove
    // nothing on their own (see server/correlations.js's reasoning).
    const proteinDays = ['20', '21', '22'].map((d) => `2026-08-${d}`)
    const readinessDays = ['21', '22', '23'].map((d) => `2026-08-${d}`)
    fake.state.entries = proteinDays.map((day, i) => proteinEntry(day, 60 + i * 10))
    fake.state.ouraHistory = readinessDays.map((day, i) => ({ day, value: 50 + i * 5 }))

    const res = await get('/api/insights?window=30&tzOffsetMinutes=0')
    const body = await res.json()
    expect(body.correlations.available).toBe(false)
    expect(body.correlations.n).toBe(3)
    expect(body.correlations.note).toMatch(/Only 3 days.*need at least 6/)
  })

  it('stays available:false above the sample-size floor when there is no real relationship (control on R_THRESHOLD)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 31, 12, 0, 0) })
    // 8 overlapping days (clears MIN_OVERLAP_DAYS=6) but the two series are
    // unrelated — r ~= -0.019, well under R_THRESHOLD=0.5. Values computed
    // and pinned by a standalone script; asserted loosely (< 0.5 in
    // magnitude) rather than to the exact float so this test isn't
    // re-deriving server/correlations.js's own arithmetic.
    const proteinDays = ['20', '21', '22', '23', '24', '25', '26', '27'].map((d) => `2026-08-${d}`)
    const readinessDays = ['21', '22', '23', '24', '25', '26', '27', '28'].map((d) => `2026-08-${d}`)
    const proteinVals = [148, 86, 86, 108, 95, 91, 95, 129]
    const readinessVals = [65, 91, 68, 58, 53, 74, 48, 80]
    fake.state.entries = proteinDays.map((day, i) => proteinEntry(day, proteinVals[i]))
    fake.state.ouraHistory = readinessDays.map((day, i) => ({ day, value: readinessVals[i] }))

    const res = await get('/api/insights?window=30&tzOffsetMinutes=0')
    const body = await res.json()
    expect(body.correlations.available).toBe(false)
    expect(body.correlations.n).toBe(8)
    expect(Math.abs(body.correlations.r)).toBeLessThan(0.5)
    expect(body.correlations.note).toMatch(/8 overlapping days.*no clear relationship/)
  })

  it('reports available:false with a distinct "not connected" note when there is no wearable data at all (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 31, 12, 0, 0) })
    // Plenty of logged protein, zero Oura history — this must read
    // differently from the "not enough overlap yet" case above, because the
    // fix here (connect a provider) is not the fix there (keep logging).
    fake.state.entries = ['20', '21', '22', '23', '24', '25', '26', '27'].map((d, i) => proteinEntry(`2026-08-${d}`, 60 + i * 10))
    fake.state.ouraHistory = []

    const res = await get('/api/insights?window=30&tzOffsetMinutes=0')
    const body = await res.json()
    expect(body.correlations).toEqual({
      available: false,
      r: null,
      n: null,
      note: 'No wearable readiness data connected yet — connect a provider to unlock this observation.',
    })
  })
})
