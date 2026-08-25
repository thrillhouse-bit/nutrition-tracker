import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'

// Route-level tests: the real Express app, an in-memory store (so no test ever
// touches server/.data/store.json), and a stubbed Oura module (no network).
// The server's timezone is pinned to Pacific/Apia (UTC+13, no DST) so that
// "server-local day" and "UTC day" visibly disagree — which is exactly what the
// date-defaulting bugs here need to be observable.
process.env.TZ = 'Pacific/Apia'

const fake = vi.hoisted(() => {
  const state = {
    entries: [], // { id, food_id, logged_at, servings_consumed, meal, food }
    integrations: {},
    appleSignals: {},
    ouraAccounts: [],
    ouraHistory: [], // { day, value }
    garminAccounts: [],
    garminDailies: {}, // `${accountId}:${day}` -> row
    targets: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 },
  }
  const store = {
    getIntegration: async (p) => state.integrations[p] || { provider: p, enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} },
    setIntegration: async (p, patch) => {
      const m = { ...(state.integrations[p] || { provider: p, enabled: true, demo: true, settings: {} }), ...patch, provider: p }
      state.integrations[p] = m
      return m
    },
    listEntries: async ({ from, to }) => state.entries.filter((e) => e.logged_at >= from && e.logged_at < to),
    getLatestTargets: async () => state.targets,
    savePlan: async (date, plan) => ({ date, ...plan }),
    replaceAppleSignals: async (day, rows) => { state.appleSignals[day] = rows; return rows.length },
    listAppleSignals: async (day) => state.appleSignals[day] || [],
    listOuraAccounts: async () => state.ouraAccounts,
    listGarminAccounts: async () => state.garminAccounts,
    getGarminDaily: async (id, day) => state.garminDailies[`${id}:${day}`] || null,
    upsertGarminDaily: async (row) => { state.garminDailies[`${row.account_id}:${row.day}`] = row; return row },
    updateOuraTokens: async () => {},
    saveOuraHistory: async (rows) => {
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
    listOuraHistory: async (from, to) => state.ouraHistory.filter((r) => r.day >= from && r.day <= to).sort((a, b) => (a.day < b.day ? -1 : 1)),
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

beforeAll(async () => {
  process.env.PORT = '0' // never collide with a dev server
  const { default: app } = await import('../server/index.js')
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
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
})

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
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

  it('is open when no token is configured (documented dev mode)', async () => {
    const res = await post('/api/apple/ingest', sample)
    expect(res.status).toBe(200)
    expect((await res.json()).ingested).toBe(1)
  })

  it('drops malformed samples without failing the request', async () => {
    const res = await post('/api/apple/ingest', {
      date: '2026-08-20',
      samples: [{ metric: 'steps', value: 900 }, { value: 1 }, 'junk', null, { metric: 42 }],
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ingested).toBe(1)
  })
})

describe('POST /api/garmin/webhook malformed dailies', () => {
  const valid = { calendarDate: '2026-08-25', activeKilocalories: 500, bmrKilocalories: 1500, steps: 1000 }

  it('survives a malformed element and still stores the valid rows around it', async () => {
    fake.state.garminAccounts = [{ id: 7 }]
    // Garmin retries on any non-200: one junk element must not 500 the batch
    // and lose the valid summary that came with it.
    const res = await post('/api/garmin/webhook', { dailies: [null, 'junk', valid] })
    expect(res.status).toBe(200)
    expect(fake.state.garminDailies['7:2026-08-25']).toMatchObject({ total_calories: 2000, steps: 1000 })
  })

  it('stores a well-formed batch (control)', async () => {
    fake.state.garminAccounts = [{ id: 7 }]
    const res = await post('/api/garmin/webhook', { dailies: [valid] })
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(1)
    expect(fake.state.garminDailies['7:2026-08-25']).toBeTruthy()
  })

  it('answers 200 with no linked account (control)', async () => {
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
    const res = await fetch(`${base}/api/oura/summary`)
    expect(res.status).toBe(200)
    expect(asked).toBe('2026-08-25')
  })

  it('passes an explicit date through untouched (control)', async () => {
    oura.legacy = true
    let asked
    oura.dailySummary = async (token, day) => { asked = day; return { day, total_calories: 1900 } }
    const res = await fetch(`${base}/api/oura/summary?date=2026-08-10`)
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
    const res = await fetch(`${base}/api/energy/summary?date=${day}`)
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
    const res = await fetch(`${base}/api/energy/summary?date=${day}`)
    const body = await res.json()
    expect(body.source).toBe('oura')
    expect(body.out).toBe(2400)
  })

  it('falls through to Garmin when Oura simply has no record yet (control)', async () => {
    oura.legacy = true
    oura.dailySummary = async () => null
    fake.state.garminAccounts = [{ id: 7 }]
    fake.state.garminDailies[`7:${day}`] = garminRow
    const res = await fetch(`${base}/api/energy/summary?date=${day}`)
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
    const stored = await fake.store.listOuraHistory('2026-08-01', '2026-08-02')
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
    const res = await fetch(`${base}/api/insights?window=7`)
    const body = await res.json()
    expect(body.ouraReadiness).toEqual([
      { date: '2026-08-20', score: 72 },
      { date: '2026-08-24', score: 81 },
    ])
  })

  it('omits ouraReadiness entries outside the window (control)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 7, 25, 12, 0, 0) })
    fake.state.ouraHistory = [{ day: '2026-07-01', value: 60 }] // long before a 7-day window
    const res = await fetch(`${base}/api/insights?window=7`)
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
    const res = await fetch(`${base}/api/today?${qs}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.intake.calories).toBe(500)
    expect(body.entries).toHaveLength(1)
  })

  it('keeps the server-local day when no bounds are sent (control)', async () => {
    fake.state.entries = [entry]
    // Apia-local 2026-08-25 is [2026-08-24T11:00Z, 2026-08-25T11:00Z) — the
    // 12:00Z entry belongs to it.
    const res = await fetch(`${base}/api/today?date=2026-08-25`)
    const body = await res.json()
    expect(body.intake.calories).toBe(500)
    const miss = await fetch(`${base}/api/today?date=2026-08-23`)
    expect((await miss.json()).intake.calories).toBe(0)
  })

  it('ignores unparseable bounds and falls back to the server-local day (control)', async () => {
    fake.state.entries = [entry]
    const res = await fetch(`${base}/api/today?date=2026-08-25&from=garbage&to=alsogarbage`)
    expect(res.status).toBe(200)
    expect((await res.json()).intake.calories).toBe(500)
  })
})
