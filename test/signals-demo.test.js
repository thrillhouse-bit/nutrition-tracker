import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { composeSignals, providerStatus } from '../server/providers.js'

// Demo signals must agree with the provider-status matrix: providerStatus only
// ever reports `demo` for a provider that is unconfigured / never connected
// ("Only fall back to demo when the companion never connected"). composeSignals
// used to fabricate demo signals for any provider with no data *today*, so a
// really-connected Garmin whose watch hadn't synced yet fed the plan a seeded
// "Evening Run" while the Connections tab said stale, demo: false.

const GARMIN_ENV = ['GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET', 'GARMIN_REDIRECT_URI', 'GARMIN_INTEGRATION_VERIFIED']
const saved = {}

beforeAll(() => {
  for (const k of GARMIN_ENV) saved[k] = process.env[k]
})
afterAll(() => {
  for (const k of GARMIN_ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const setGarminEnv = (on) => {
  for (const k of GARMIN_ENV) {
    if (on) process.env[k] = k === 'GARMIN_INTEGRATION_VERIFIED' ? 'true' : 'x'
    else delete process.env[k]
  }
}

// USER is a fixed test user id — single-user tests, not about cross-user
// isolation.
const USER = 1

// Store fixture: demo left at its default (allowed) everywhere; Oura demo is
// switched off so Garmin/Apple behavior is isolated from Oura's seeded data.
function makeStore({ garminAccounts = [], garminDaily = null, appleIntegration = {}, appleRows = [] } = {}) {
  const integrations = {
    oura: { enabled: true, demo: false, settings: {} },
    apple: { enabled: true, demo: true, settings: {}, ...appleIntegration },
  }
  return {
    // Real signature is getIntegration(userId, provider) — a fixture that
    // only reads the first positional arg as `id` would key off the userId
    // instead and always miss, silently falling back to the default (demo)
    // settings for every provider.
    getIntegration: async (userId, id) => integrations[id] || { enabled: true, demo: true, settings: {} },
    listOuraAccounts: async (userId) => [],
    listGarminAccounts: async (userId) => garminAccounts,
    getGarminDaily: async () => garminDaily,
    listAppleSignals: async (userId) => appleRows,
    updateOuraTokens: async () => {},
  }
}

describe('composeSignals demo fallback vs providerStatus', () => {
  it('does not fabricate demo Garmin signals for a connected account with no data today', async () => {
    setGarminEnv(true)
    const store = makeStore({ garminAccounts: [{ id: 1 }], garminDaily: null, appleIntegration: { demo: false } })
    // The status matrix calls this account stale and NOT demo…
    const st = await providerStatus(store, USER, 'garmin', new Date())
    expect(st.status).toBe('stale')
    expect(st.demo).toBe(false)
    // …so the composed signals must not carry seeded Garmin data either.
    const sig = await composeSignals(store, new Date(), USER)
    expect(sig.workout).toBeNull()
    expect(sig.expenditure).toBeNull()
    expect(sig.steps).toBeNull()
  })

  it('does not fabricate demo Apple signals once the companion has really connected', async () => {
    setGarminEnv(false)
    const store = makeStore({
      appleIntegration: { connected_at: new Date().toISOString(), last_synced_at: new Date().toISOString() },
      appleRows: [],
    })
    const sig = await composeSignals(store, new Date(), USER)
    // hrv can only come from Apple here (Oura demo is off) — it must be absent,
    // not the seeded 62 ms.
    expect(sig.hrv).toBeNull()
  })

  it('still serves real Garmin data when the account has synced (control)', async () => {
    setGarminEnv(true)
    const store = makeStore({
      garminAccounts: [{ id: 1 }],
      garminDaily: { day: '2026-08-24', total_calories: 2500, active_calories: 480, steps: 9000 },
      appleIntegration: { demo: false },
    })
    const sig = await composeSignals(store, new Date(), USER)
    expect(sig.expenditure.value).toBe(2500)
    expect(sig.expenditure.provider).toBe('garmin')
    expect(sig.expenditure.demo).toBe(false)
  })

  it('still falls back to demo for a provider that was never configured or connected (control)', async () => {
    setGarminEnv(false)
    const store = makeStore() // no creds, no accounts, no connected_at
    const sig = await composeSignals(store, new Date(), USER)
    expect(sig.workout.provider).toBe('garmin')
    expect(sig.workout.demo).toBe(true)
    expect(sig.hrv.provider).toBe('apple')
    expect(sig.hrv.demo).toBe(true)
  })

  it('honors demo: false even for a never-connected provider (control)', async () => {
    setGarminEnv(false)
    const store = makeStore({ appleIntegration: { demo: false } })
    const sig = await composeSignals(store, new Date(), USER)
    expect(sig.hrv).toBeNull()
  })
})
