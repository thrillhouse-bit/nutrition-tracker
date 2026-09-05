import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Route-level tests for the A2A agent surface (server/agent.js): the real
// Express app, an in-memory store, a stubbed Oura module (no network). Same
// harness as test/api-routes.test.js, including the TZ pin: Pacific/Apia
// (UTC+13, no DST) makes "server-local day" and "UTC day" visibly disagree,
// which is what any bug in the status route's day math needs to be
// observable.
process.env.TZ = 'Pacific/Apia'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

// A distinctive token value: several tests assert it never appears in a
// public body, which is only meaningful while it's actually set and correct.
const A2A_TOKEN = 'a2a-secret-cf41f7e2d8'

const fake = vi.hoisted(() => {
  const state = {
    users: [], // seeded per test — getSoleUserId is the whole "whose data" gate here
    entries: [], // { id, logged_at, servings_consumed, food: {calories, ...} }
    integrations: {}, // keyed by provider — one user drives this file
    appleSignals: {}, // day -> rows (providerStatus's apple branch reads it)
    plans: {}, // `${userId}:${date}` -> snapshot row (daily_plans)
    targets: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 },
    targetsEverSet: false, // getLatestTargets's fabricated default looks identical either way — hasTargets is the honest signal
    // Every store WRITE lands here. The agent surface is read-only by
    // contract, so this list must stay empty across every request in this
    // file — and the recorder itself is proven live (not a gate stuck shut)
    // by the control test at the bottom that calls a write directly.
    writes: [],
  }
  const recordWrite = (method) => async (...args) => {
    state.writes.push({ method, args })
    return null
  }
  const store = {
    // --- reads the agent surface (and the middleware chain) may hit --------
    getSoleUserId: async () => (state.users.length === 1 ? state.users[0].id : null),
    // A presented Bearer token triggers index.js's Apple-ingest fallback
    // middleware before our route ever runs — it must find nothing, not throw.
    findUserIdByAppleIngestToken: async () => null,
    getUserById: async (id) => state.users.find((u) => u.id === Number(id)) || null,
    countUsers: async () => state.users.length,
    listEntries: async (userId, { from, to }) => state.entries.filter((e) => e.logged_at >= from && e.logged_at < to),
    hasTargets: async () => state.targetsEverSet,
    getLatestTargets: async () => state.targets,
    getPlan: async (userId, date) => state.plans[`${userId}:${date}`] || null,
    getIntegration: async (userId, p) =>
      state.integrations[p] || { user_id: userId, provider: p, enabled: true, demo: true, connected_at: null, last_synced_at: null, error: null, settings: {} },
    listAppleSignals: async (userId, day) => state.appleSignals[day] || [],
    listOuraAccounts: async () => [],
    listGarminAccounts: async () => [],
    getGarminDaily: async () => null,
    // --- writes: none of these may ever fire from the agent surface --------
    savePlan: recordWrite('savePlan'),
    setTargets: recordWrite('setTargets'),
    setIntegration: recordWrite('setIntegration'),
    replaceAppleSignals: recordWrite('replaceAppleSignals'),
    saveWeightEntry: recordWrite('saveWeightEntry'),
    createUser: recordWrite('createUser'),
  }
  return { state, store }
})

// Oura stub: `calls` records every data-fetching invocation so the
// no-live-network test can assert the agent surface structurally never
// reaches Oura's API — and `legacy` gives that test its control: flipping it
// visibly changes the status body, proving the module the server consults IS
// this mock (a broken vi.mock would make "never called" pass vacuously while
// real network calls happened).
const oura = vi.hoisted(() => {
  const o = { legacy: false, calls: [] }
  const rec = (name, ret) => async (...args) => {
    o.calls.push(name)
    return ret
  }
  o.dailySummary = rec('dailySummary', null)
  o.dailyReadiness = rec('dailyReadiness', null)
  o.dailySleepHours = rec('dailySleepHours', null)
  o.dailySleepScore = rec('dailySleepScore', null)
  o.activityRange = rec('activityRange', [])
  o.readinessRange = rec('readinessRange', [])
  o.sleepScoreRange = rec('sleepScoreRange', [])
  o.workoutsRange = rec('workoutsRange', [])
  o.validAccessToken = rec('validAccessToken', 'tok')
  return o
})

vi.mock('../server/db.js', () => ({ store: fake.store, backend: 'json-file' }))
vi.mock('../server/integrations/oura.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    ouraConfigured: () => oura.legacy,
    oauthConfigured: () => false,
    getToken: () => 'legacy-token',
    dailySummary: (...a) => oura.dailySummary(...a),
    dailyReadiness: (...a) => oura.dailyReadiness(...a),
    dailySleepHours: (...a) => oura.dailySleepHours(...a),
    dailySleepScore: (...a) => oura.dailySleepScore(...a),
    activityRange: (...a) => oura.activityRange(...a),
    readinessRange: (...a) => oura.readinessRange(...a),
    sleepScoreRange: (...a) => oura.sleepScoreRange(...a),
    workoutsRange: (...a) => oura.workoutsRange(...a),
    validAccessToken: (...a) => oura.validAccessToken(...a),
  }
})

let server
let base

beforeAll(async () => {
  process.env.PORT = '0'
  const { default: app } = await import('../server/index.js')
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  server?.close()
})

afterEach(() => {
  delete process.env.OMNIFUEL_A2A_TOKEN
  delete process.env.OMNIFUEL_PUBLIC_URL
  delete process.env.BODY_CURRENT_A2A_TOKEN
  delete process.env.BODY_CURRENT_PUBLIC_URL
  oura.legacy = false
  oura.calls = []
  fake.state.users = []
  fake.state.entries = []
  fake.state.integrations = {}
  fake.state.appleSignals = {}
  fake.state.plans = {}
  fake.state.targets = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 }
  fake.state.targetsEverSet = false
  fake.state.writes = []
})

// --- helpers ---------------------------------------------------------------
const get = (p, headers = {}) => fetch(`${base}${p}`, { headers })
const rpc = (body, headers = {}) =>
  fetch(`${base}/a2a`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const bearer = (token) => ({ Authorization: `Bearer ${token}` })

// Server-local calendar day — same process (and pinned TZ) as the server, so
// this matches the route's own localYmd exactly.
function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Seeds one sole user with two entries logged today, real targets, and a plan
// snapshot. Distinctive figures (617x2 + 333 = 1567 kcal; 2600 baseline; 2860
// adjusted) so a leak into a public body is unmistakable. Entries are logged
// "5 minutes ago", clamped to just after server-local midnight so a run in
// the first minutes of a day can't push them into yesterday.
function seedSoleUserWithData({ demoAdjustment = true } = {}) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 1)
  const loggedAt = new Date(Math.max(todayStart.getTime(), now.getTime() - 5 * 60000))
  fake.state.users = [{ id: 1, email: 'sole@example.com' }]
  fake.state.entries = [
    { id: 1, logged_at: loggedAt.toISOString(), servings_consumed: 2, food: { calories: 617, protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 1, sugar_g: 2, sodium_mg: 100 } },
    { id: 2, logged_at: new Date(loggedAt.getTime() - 60000).toISOString(), servings_consumed: 1, food: { calories: 333, protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 0, sugar_g: 1, sodium_mg: 50 } },
  ]
  fake.state.targets = { calories: 2600, protein_g: 150, carbs_g: 260, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 }
  fake.state.targetsEverSet = true
  fake.state.plans[`1:${localYmd()}`] = {
    user_id: 1,
    date: localYmd(),
    baseline: { calories: 2600, carbs_g: 260 },
    adjusted: { calories: 2860, carbs_g: 325 },
    rationale: [
      { factor: 'workout', effect: '+65 g carbs', detail: 'Evening Run is on your schedule around 5:30 PM.', source: 'garmin', demo: demoAdjustment },
    ],
    signal_snapshot: {},
    rules_version: 1,
  }
  return { loggedAt }
}

const expectedAgeMinutes = (loggedAt) => Math.round((Date.now() - loggedAt.getTime()) / 60000)

// ===========================================================================
describe('GET /.well-known/agent-card.json', () => {
  it('serves a public, valid A2A card — and the bearer token never appears in it', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN // set, so its absence below is a real finding
    const res = await get('/.well-known/agent-card.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const card = await res.json()
    expect(card.name).toBe('Body Current')
    expect(card.version).toBe(PKG.version) // package.json is the single source of the version
    expect(card.protocolVersion).toBe('0.3.0')
    expect(card.capabilities).toEqual({ streaming: false, pushNotifications: false, stateTransitionHistory: false })
    expect(card.skills.map((s) => s.id)).toEqual(['operational-status', 'fueling-status'])
    expect(card.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' })
    // The gated skill declares the scheme; the public one declares none.
    expect(card.skills[1].security).toEqual([{ bearer: [] }])
    expect(card.skills[0].security).toBeUndefined()
    // Non-medical, read-only framing is part of the card's contract.
    expect(card.description).toMatch(/no medical/i)
    expect(card.description).toMatch(/read-only/i)
    expect(JSON.stringify(card)).not.toContain(A2A_TOKEN)
  })

  it('every endpoint the card declares answers — a card cannot advertise routes that do not exist', async () => {
    const card = await (await get('/.well-known/agent-card.json')).json()
    // Each skill names its concrete endpoint in the x-endpoint extension.
    for (const skill of card.skills) {
      const ep = skill['x-endpoint']
      expect(ep, `skill ${skill.id} must declare x-endpoint`).toBeTruthy()
      expect(ep.method).toBe('GET')
      const res = await get(ep.path)
      expect(res.status, `declared endpoint ${ep.path} (skill ${skill.id}) must be a live route`).toBe(200)
    }
    // The card's own url points at the JSON-RPC endpoint; it must answer too.
    const a2aPath = new URL(card.url).pathname
    expect(a2aPath).toBe('/a2a')
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'message/send', params: {} })
    expect(res.status).toBe(200)
    expect((await res.json()).result).toBeTruthy()
  })

  it('control: the parity probe can fail — an undeclared path is refused where its declared sibling answers', async () => {
    // Without this, the 200-assertions above would prove nothing if every
    // path answered (e.g. a SPA fallback swallowing GETs).
    //
    // The probe sits under /api/ deliberately. Every endpoint the card
    // declares is an /api/ path, and the SPA fallback at the bottom of
    // server/index.js is `app.get(/^\/(?!api\/).*/, …)` — its negative
    // lookahead excludes that prefix by construction, so this control holds
    // whether or not a dist/ build happens to exist on the machine running
    // the suite. It used to probe /.well-known/agent.json and assert 404,
    // which is only true while dist/ is ABSENT: CI runs `npm test` before
    // `npm run build` and stayed green, but anyone who built before testing
    // got the SPA shell — 200 — and a failure that reads like a red main
    // branch rather than a stale build directory. The assumption was
    // ambient; measured 30 Aug 2026 in both states, this one is not.
    const undeclared = await get('/api/agent/agent-card.json') // never a route
    // 401, not 404: requireAuth blankets /api (server/index.js), and the
    // declared endpoint escapes it only by being registered above that mount.
    expect(undeclared.status, 'an undeclared /api path must be refused, not answered').toBe(401)
    // …and the probe discriminates rather than refusing everything: the same
    // prefix, declared, still answers anonymously.
    expect((await get('/api/agent/status')).status).toBe(200)

    // The OLD a2a card path stays deliberately unserved. WHAT answers it does
    // depend on a build (404 bare, the SPA shell once dist/ exists), so the
    // assertion is the part that is true either way: never the agent surface.
    const oldCard = await get('/.well-known/agent.json')
    expect(oldCard.headers.get('content-type') || '', 'the old card path must never be served by the agent surface')
      .not.toMatch(/application\/json/)
  })

  it('card url follows OMNIFUEL_PUBLIC_URL when set, and defaults when not (both directions)', async () => {
    process.env.OMNIFUEL_PUBLIC_URL = 'https://agent.example.test'
    let card = await (await get('/.well-known/agent-card.json')).json()
    expect(card.url).toBe('https://agent.example.test/a2a')
    delete process.env.OMNIFUEL_PUBLIC_URL
    card = await (await get('/.well-known/agent-card.json')).json()
    expect(card.url).toBe('https://omnifuelapp.tech/a2a')
  })

  it('prefers the Body Current public URL over its legacy alias', async () => {
    process.env.OMNIFUEL_PUBLIC_URL = 'https://legacy.example.test'
    process.env.BODY_CURRENT_PUBLIC_URL = 'https://current.example.test/'
    const card = await (await get('/.well-known/agent-card.json')).json()
    expect(card.url).toBe('https://current.example.test/a2a')
  })
})

// ===========================================================================
describe('GET /api/agent/status — anonymous tier', () => {
  it('uses the Body Current token in preference to the legacy token', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    process.env.BODY_CURRENT_A2A_TOKEN = 'body-current-token-precedence'
    const oldToken = await (await get('/api/agent/status', { authorization: `Bearer ${A2A_TOKEN}` })).json()
    expect(oldToken.fueling).toEqual({ available: false, reason: 'token required' })
    const currentToken = await (await get('/api/agent/status', { authorization: 'Bearer body-current-token-precedence' })).json()
    expect(currentToken.fueling.reason).not.toBe('token required')
  })
  it('reports operational facts, refuses fueling, and leaks no personal figure even when the store holds them', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    fake.state.integrations.apple = {
      user_id: 1, provider: 'apple', enabled: true, demo: false,
      connected_at: '2026-08-01T00:00:00.000Z', last_synced_at: '2026-08-29T07:31:00.000Z', error: null, settings: {},
    }

    const res = await get('/api/agent/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.service).toBe('omnifuel')
    expect(body.displayName).toBe('Body Current')
    expect(body.serviceId).toBe('body-current')
    expect(body.backend).toBe('json-file')
    expect(Number.isFinite(Date.parse(body.time))).toBe(true)
    // Config-level facts only — exactly /api/health's vocabulary.
    expect(body.providers).toEqual({ ocr: 'not-configured', usda: 'not-configured', oura: 'not-configured', garmin: 'not-configured' })
    expect(body.fueling).toEqual({ available: false, reason: 'token required' })
    // Nothing else may ride along on the anonymous body.
    expect(Object.keys(body).sort()).toEqual(['backend', 'displayName', 'fueling', 'ok', 'providers', 'service', 'serviceId', 'time'])
    // The leak control: the store HAS personal data right now (seeded above);
    // none of its distinctive figures may appear anywhere in this body.
    const text = JSON.stringify(body)
    for (const needle of ['1567', '1234', '617', '333', '2600', '2860', 'Evening Run', 'sole@example.com', '2026-08-29T07:31']) {
      expect(text, `anonymous body must not contain "${needle}"`).not.toContain(needle)
    }
    expect(text).not.toContain(A2A_TOKEN)
  })

  it('a wrong bearer earns the byte-identical anonymous body — no oracle', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    const wrongRes = await get('/api/agent/status', bearer('a2a-secret-cf41f7e2d9')) // one char off
    const anonRes = await get('/api/agent/status')
    expect(wrongRes.status).toBe(200) // same status — not 401, not 500
    const wrong = await wrongRes.json()
    const anon = await anonRes.json()
    delete wrong.time
    delete anon.time
    expect(wrong).toEqual(anon)
    expect(wrong.fueling.reason).toBe('token required') // not a distinct "wrong token" text
  })
})

// ===========================================================================
describe('GET /api/agent/status — bearer tier', () => {
  it('correct bearer + sole user: every fueling figure matches the seeded store exactly', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    const { loggedAt } = seedSoleUserWithData({ demoAdjustment: true })

    const res = await get('/api/agent/status', bearer(A2A_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    const f = body.fueling
    expect(f.available).toBe(true)
    expect(f.date).toBe(localYmd()) // server-local day (TZ pinned above)
    expect(f.kcal_in).toBe(617 * 2 + 333) // 1567, from the seeded entries, nothing else
    expect(f.entries_logged).toBe(2)
    expect(Math.abs(f.last_log_age_minutes - expectedAgeMinutes(loggedAt))).toBeLessThanOrEqual(1)
    expect(f.targets).toEqual({
      set: true,
      baseline_kcal: 2600,
      adjusted_kcal: 2860,
      adjustments: { count: 1, factors: ['workout'] },
    })
    expect(f.plan_viewed_today).toBe(true)
    expect(f.demo).toBe(true) // the one adjustment came from a demo signal
    // Per-provider status + freshness, narrowed to exactly these four fields
    // (no permission lists, no sync-error history) — nothing configured in
    // this environment, so all three are deterministic.
    expect(f.providers).toEqual([
      { id: 'oura', status: 'not-configured', demo: true, last_synced_at: null },
      { id: 'garmin', status: 'not-configured', demo: true, last_synced_at: null },
      { id: 'apple', status: 'demo', demo: true, last_synced_at: null },
    ])
    // The operational half of the body is unchanged by the tier.
    expect(body.providers).toEqual({ ocr: 'not-configured', usda: 'not-configured', oura: 'not-configured', garmin: 'not-configured' })
  })

  it('demo propagates to the top level when any contributing adjustment row is demo', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData({ demoAdjustment: true })
    const body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.fueling.demo).toBe(true)
  })

  it('control: demo stays false when no contributing row is demo (and when there is no snapshot at all)', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData({ demoAdjustment: false })
    let body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.fueling.demo).toBe(false)
    // Real figures must not be demo-flagged just because a never-connected
    // provider is demo-ALLOWED (all three provider rows above carry
    // demo:true) — the flag tracks contributing rows, not provider config.
    expect(body.fueling.providers.some((p) => p.demo)).toBe(true)

    fake.state.plans = {} // no snapshot: nothing demo contributed either
    body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.fueling.demo).toBe(false)
    expect(body.fueling.plan_viewed_today).toBe(false)
  })

  it('two accounts: an explicit "no sole account" refusal, even with the right token', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    fake.state.users.push({ id: 2, email: 'second@example.com' }) // now nobody is "the" user
    const body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.fueling).toEqual({ available: false, reason: 'no sole account' })
    expect(body.ok).toBe(true) // the operational tier still answers
    // Control sibling: drop back to one user and the same token opens the tier.
    fake.state.users.pop()
    const opened = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(opened.fueling.available).toBe(true)
  })

  it('token not configured: reason "not configured" even with a bearer presented — and "token required" once configured (both directions)', async () => {
    seedSoleUserWithData()
    // Env unset: permanently unavailable, and presenting a token changes nothing.
    let body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.fueling).toEqual({ available: false, reason: 'not configured' })
    body = await (await get('/api/agent/status')).json()
    expect(body.fueling).toEqual({ available: false, reason: 'not configured' })
    // Env set: the reason flips — proving the env gate is consulted per
    // request, not a string stuck in one state.
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    body = await (await get('/api/agent/status')).json()
    expect(body.fueling).toEqual({ available: false, reason: 'token required' })
  })

  it('targets never set: {set:false}, and the fabricated 2000 kcal default appears nowhere in fueling', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    fake.state.targetsEverSet = false // the user never chose targets…
    fake.state.targets = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 } // …so getLatestTargets fabricates this
    // A snapshot written before targets were set carries that same fabricated
    // default laundered through the plan pipeline — it must be withheld too.
    fake.state.plans[`1:${localYmd()}`] = {
      user_id: 1, date: localYmd(), baseline: { calories: 2000 }, adjusted: { calories: 2000 }, rationale: [], signal_snapshot: {}, rules_version: 1,
    }
    const body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.fueling.targets).toEqual({ set: false })
    expect(JSON.stringify(body.fueling)).not.toContain('2000')

    // Control sibling: the moment targets are genuinely set, figures return.
    fake.state.targetsEverSet = true
    fake.state.targets.calories = 2600
    fake.state.plans[`1:${localYmd()}`].baseline = { calories: 2600 }
    fake.state.plans[`1:${localYmd()}`].adjusted = { calories: 2600 }
    const withTargets = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(withTargets.fueling.targets.set).toBe(true)
    expect(withTargets.fueling.targets.baseline_kcal).toBe(2600)
  })
})

// ===========================================================================
describe('POST /a2a (JSON-RPC 2.0)', () => {
  it('message/send, anonymous tier: a completed Task whose artifact is the anonymous status', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    const res = await rpc({ jsonrpc: '2.0', id: 7, method: 'message/send', params: { message: { role: 'user', parts: [{ kind: 'text', text: 'status?' }] } } })
    expect(res.status).toBe(200)
    const out = await res.json()
    expect(out.jsonrpc).toBe('2.0')
    expect(out.id).toBe(7)
    expect(out.error).toBeUndefined()
    expect(out.result.kind).toBe('task')
    expect(out.result.status.state).toBe('completed')
    const data = out.result.artifacts[0].parts[0].data
    expect(out.result.artifacts[0].parts[0].kind).toBe('data')
    expect(data.fueling).toEqual({ available: false, reason: 'token required' })
    // The artifact is the same body the GET route serves — the personal
    // figures seeded above must be absent here exactly the same way.
    expect(JSON.stringify(data)).not.toContain('2860')
  })

  it('message/send, bearer tier: the artifact carries the same fueling status the GET earns', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    const out = await (await rpc({ jsonrpc: '2.0', id: 8, method: 'message/send', params: {} }, bearer(A2A_TOKEN))).json()
    const data = out.result.artifacts[0].parts[0].data
    expect(data.fueling.available).toBe(true)
    const viaGet = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    // Identical modulo the clock: time always differs; last_log_age_minutes
    // can differ by one when the two calls straddle a minute-rounding edge.
    expect(Math.abs(data.fueling.last_log_age_minutes - viaGet.fueling.last_log_age_minutes)).toBeLessThanOrEqual(1)
    delete data.time
    delete viaGet.time
    delete data.fueling.last_log_age_minutes
    delete viaGet.fueling.last_log_age_minutes
    expect(data).toEqual(viaGet)
  })

  it('unknown method → -32601', async () => {
    const out = await (await rpc({ jsonrpc: '2.0', id: 9, method: 'message/stream' })).json()
    expect(out.result).toBeUndefined()
    expect(out.error.code).toBe(-32601)
  })

  it('malformed JSON-RPC → -32600 (missing method; wrong jsonrpc version)', async () => {
    let out = await (await rpc({ id: 10 })).json()
    expect(out.error.code).toBe(-32600)
    out = await (await rpc({ jsonrpc: '1.0', id: 11, method: 'message/send' })).json()
    expect(out.error.code).toBe(-32600)
  })

  it('tasks/get → -32001, saying tasks are not persisted', async () => {
    const out = await (await rpc({ jsonrpc: '2.0', id: 12, method: 'tasks/get', params: { id: 'task-1' } })).json()
    expect(out.error.code).toBe(-32001)
    expect(out.error.message).toMatch(/not persisted/i)
  })
})

// ===========================================================================
describe('read-only, store-only', () => {
  it('no route on this surface ever calls a live provider API', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    // Exercise every route in both tiers.
    await get('/.well-known/agent-card.json')
    await get('/api/agent/status')
    await get('/api/agent/status', bearer(A2A_TOKEN))
    await rpc({ jsonrpc: '2.0', id: 1, method: 'message/send', params: {} })
    await rpc({ jsonrpc: '2.0', id: 2, method: 'message/send', params: {} }, bearer(A2A_TOKEN))
    expect(oura.calls).toEqual([])

    // Control: prove the mock is what the server consults — flipping the
    // mocked ouraConfigured must visibly change the status body. Without
    // this, "no calls recorded" would also pass if the vi.mock had silently
    // stopped intercepting and real (network-touching) code were running.
    oura.legacy = true
    const body = await (await get('/api/agent/status', bearer(A2A_TOKEN))).json()
    expect(body.providers.oura).toBe('legacy-token')
    // …and even "configured" never makes this surface fetch: providerStatus
    // is store-only for Oura by construction.
    expect(oura.calls).toEqual([])
  })

  it('no store write method ever fires from the agent surface — and the recorder itself is proven live', async () => {
    process.env.OMNIFUEL_A2A_TOKEN = A2A_TOKEN
    seedSoleUserWithData()
    await get('/.well-known/agent-card.json')
    await get('/api/agent/status')
    await get('/api/agent/status', bearer(A2A_TOKEN))
    await rpc({ jsonrpc: '2.0', id: 1, method: 'message/send', params: {} }, bearer(A2A_TOKEN))
    await rpc({ jsonrpc: '2.0', id: 2, method: 'tasks/get' })
    expect(fake.state.writes).toEqual([])

    // Control: the write recorder records — a gate that cannot fire proves
    // nothing (a stuck-shut recorder would green the assertion above forever).
    await fake.store.savePlan(1, localYmd(), { baseline: {} })
    expect(fake.state.writes).toEqual([{ method: 'savePlan', args: [1, localYmd(), { baseline: {} }] }])
    fake.state.writes = []
  })
})
