import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'

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
    garminAccounts: [],
    garminDailies: {}, // `${accountId}:${day}` -> row
    targets: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 },
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
      return state.targets
    },
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
    listOuraAccounts: async (userId) => state.ouraAccounts,
    listGarminAccounts: async (userId) => state.garminAccounts,
    updateOuraTokens: async (userId, id, tokens) => {},
    saveOuraHistory: async (userId, rows) => {
      const days = new Set(rows.map((r) => r.day))
      state.ouraHistory = state.ouraHistory.filter((r) => !days.has(r.day))
      let n = 0
      for (const r of rows) {
        if (r.score == null) continue
        state.ouraHistory.push({ day: r.day, value: r.score })
        n++
      }
      return n
    },
    listOuraHistory: async (userId, from, to) => state.ouraHistory.filter((r) => r.day >= from && r.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1)),

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
  fake.state.profile = { height_cm: null, weight_kg: null, sex: null, age_years: null, units_pref: 'imperial', activity_level: null, goal: null, updated_at: null }
  fake.state.setTargetsCalls = []
  fake.state.ouraHistory = []
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
  it('refuses with 400 when no Oura account is resolvable (control)', async () => {
    oura.legacy = false
    fake.state.ouraAccounts = []
    const res = await post('/api/oura/backfill', {})
    expect(res.status).toBe(400)
  })

  it('pulls the range in one call and stores every scored day', async () => {
    oura.legacy = true
    fake.state.ouraHistory = []
    let asked
    oura.activityRange = async (token, from, to) => {
      asked = { token, from, to }
      return [
        { day: '2026-08-01', score: 70, total_calories: 2100, active_calories: 400, steps: 8000 },
        { day: '2026-08-02', score: null, total_calories: 2000, active_calories: 300, steps: 6000 }, // no score that day
      ]
    }
    const res = await post('/api/oura/backfill?days=10', {})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.daysSaved).toBe(1) // the null-score day is dropped, not stored as 0
    expect(asked.token).toBe('legacy-token')
    const stored = await fake.store.listOuraHistory(authUserId, '2026-08-01', '2026-08-02')
    expect(stored.map((r) => r.day)).toEqual(['2026-08-01'])
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
