import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { freshnessOf, composeSignals, demoSignals, PROVIDERS, ymd } from '../server/providers.js'

describe('freshnessOf', () => {
  const now = Date.now()
  it('is fresh within ~18h, stale beyond, unavailable when missing', () => {
    expect(freshnessOf(new Date(now - 2 * 3600000).toISOString(), now)).toBe('fresh')
    expect(freshnessOf(new Date(now - 30 * 3600000).toISOString(), now)).toBe('stale')
    expect(freshnessOf(null, now)).toBe('unavailable')
    expect(freshnessOf(undefined, now)).toBe('unavailable')
  })

  // Regression: the >48h branch returned 'stale' (a copy of the <=48h branch),
  // so a week-old reading stayed "stale" forever and — because the plan engine
  // only excludes 'unavailable' — could still change targets.
  it('is unavailable once a reading is older than 48h, not stale forever', () => {
    expect(freshnessOf(new Date(now - 72 * 3600000).toISOString(), now)).toBe('unavailable')
    expect(freshnessOf(new Date(now - 7 * 24 * 3600000).toISOString(), now)).toBe('unavailable')
  })
  it('still reads stale just inside the 48h window (control)', () => {
    expect(freshnessOf(new Date(now - 47 * 3600000).toISOString(), now)).toBe('stale')
  })
})

describe('provider abstraction', () => {
  it('exposes Oura, Garmin, Apple with the right connect methods', () => {
    expect(Object.keys(PROVIDERS)).toEqual(['oura', 'garmin', 'apple'])
    expect(PROVIDERS.oura.connect).toBe('oauth')
    expect(PROVIDERS.garmin.connect).toBe('oauth')
    expect(PROVIDERS.apple.connect).toBe('ingest') // no cloud API — push-in only
  })
})

describe('demoSignals (evening-run scenario)', () => {
  it('produces coherent demo values across providers', () => {
    const s = demoSignals(new Date())
    expect(s.oura.readiness.value).toBe(82)
    expect(s.oura.sleep.value).toBeCloseTo(7.4, 1)
    expect(s.garmin.workout.value.kind).toBe('run')
    expect(s.garmin.workout.value.startHour).toBe(17.5)
    expect(s.apple.steps.value).toBeGreaterThan(0)
    // demo flag is set everywhere
    expect(s.oura.readiness.demo).toBe(true)
    expect(s.garmin.workout.demo).toBe(true)
  })
})

describe('composeSignals with no credentials → demo, per-metric provenance', () => {
  const store = {
    getIntegration: async (userId, id) => ({ enabled: true, demo: true, settings: {} }),
    listOuraAccounts: async (userId) => [],
    listGarminAccounts: async (userId) => [],
    getGarminDaily: async () => null,
    listAppleSignals: async (userId, day) => [],
    updateOuraTokens: async () => {},
  }
  it('picks one source per metric by preference, marked demo', async () => {
    // composeSignals(store, nowDate, userId) — nowDate is 2nd, userId 3rd.
    const sig = await composeSignals(store, new Date(), 1)
    expect(sig.readiness.provider).toBe('oura')
    expect(sig.readiness.demo).toBe(true)
    expect(sig.workout.provider).toBe('garmin')
    expect(sig.expenditure.provider).toBe('garmin') // garmin preferred over apple
    expect(sig.sleep.provider).toBe('oura')
  })

  it('has no manual-workout override effect when the store does not implement getManualWorkout (control — old fakes without it keep working)', async () => {
    expect(store.getManualWorkout).toBeUndefined()
    const sig = await composeSignals(store, new Date(), 1)
    expect(sig.workout.provider).toBe('garmin') // unchanged from the demo fallback above
  })
})

describe('composeSignals: manual workout input overrides any wearable source', () => {
  const baseStore = {
    getIntegration: async () => ({ enabled: true, demo: true, settings: {} }),
    listOuraAccounts: async () => [],
    listGarminAccounts: async () => [],
    getGarminDaily: async () => null,
    listAppleSignals: async () => [],
    updateOuraTokens: async () => {},
  }

  it('wins the workout slot even over the demo Garmin fallback', async () => {
    const manual = { label: 'Evening Run', shortLabel: 'run', kind: 'run', time: '5:30 PM', startHour: 17.5, endHour: null, durationMin: null, estKcal: null, status: 'planned', recorded_at: new Date().toISOString() }
    const store = { ...baseStore, getManualWorkout: async () => manual }
    const sig = await composeSignals(store, new Date(), 1)
    expect(sig.workout.provider).toBe('manual')
    expect(sig.workout.demo).toBe(false)
    expect(sig.workout.value.kind).toBe('run')
    expect(sig.workout.value.startHour).toBe(17.5)
    // recorded_at isn't duplicated inside the value object itself
    expect(sig.workout.value.recorded_at).toBeUndefined()
  })

  it('falls back to the normal preference order when no manual workout is set for today (control)', async () => {
    const store = { ...baseStore, getManualWorkout: async () => null }
    const sig = await composeSignals(store, new Date(), 1)
    expect(sig.workout.provider).toBe('garmin') // demo fallback, unaffected
  })
})

// Regression: neverConnected() used to ask "does the SERVER have Oura/Garmin
// OAuth app credentials configured" (an env-var check) instead of "does THIS
// USER have an account linked" (store.listOuraAccounts/listGarminAccounts).
// The moment any one user connected a real Oura account, the server counted
// as "configured" for every OTHER user too, so their oura branch stopped
// being demo-eligible — but they still had no token, so realSignals also
// returned {}. Net effect: readiness/sleep silently went from "demo" to
// "nothing at all" for every not-yet-connected user, while the Connections
// tab (driven by providerStatus, which was already correctly per-user) kept
// truthfully saying Oura was available to connect — the exact live/Connections
// mismatch an outside audit flagged (25 Aug 2026).
describe('composeSignals: demo fallback follows THIS USER\'s own connection, not server-wide OAuth config', () => {
  const OURA_ENV = ['OURA_CLIENT_ID', 'OURA_CLIENT_SECRET', 'OURA_REDIRECT_URI']
  const saved = {}

  beforeEach(() => {
    for (const k of OURA_ENV) saved[k] = process.env[k]
    process.env.OURA_CLIENT_ID = 'test-client-id'
    process.env.OURA_CLIENT_SECRET = 'test-client-secret'
    process.env.OURA_REDIRECT_URI = 'https://example.com/oura/callback'
  })

  afterEach(() => {
    for (const k of OURA_ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
  })

  const baseStore = {
    getIntegration: async () => ({ enabled: true, demo: true, settings: {} }),
    listGarminAccounts: async () => [],
    getGarminDaily: async () => null,
    listAppleSignals: async () => [],
    updateOuraTokens: async () => {},
  }

  it('a user with NO Oura account still gets demo readiness/sleep once the server has real Oura OAuth configured', async () => {
    const store = { ...baseStore, listOuraAccounts: async () => [] }
    const sig = await composeSignals(store, new Date(), 1)
    expect(sig.readiness.provider).toBe('oura')
    expect(sig.readiness.demo).toBe(true)
    expect(sig.readiness.value).toBe(82) // the seeded demo score
    expect(sig.sleep.provider).toBe('oura')
    expect(sig.sleep.demo).toBe(true)
  })

  it('control: a user WITH a real (but currently data-less) Oura account gets no demo fallback — a real connection never fakes its own gap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network in test') }))
    const store = {
      ...baseStore,
      // Apple counted as "really connected, just no data today" too, so
      // sleep's own apple fallback (a separate, correct behavior) can't
      // mask what this test is actually checking — oura's own gap.
      // connected_at is top-level on the integration row (see server/db.js),
      // not nested under settings — that's the provider-specific bag.
      getIntegration: async (userId, id) => ({ enabled: true, demo: true, connected_at: id === 'apple' ? '2026-08-01T00:00:00.000Z' : null, settings: {} }),
      listOuraAccounts: async () => [
        { id: 1, access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() },
      ],
    }
    const sig = await composeSignals(store, new Date(), 1)
    expect(sig.readiness).toBeNull()
    expect(sig.sleep).toBeNull()
  })

  // realSignals fetches daily_activity/daily_readiness/sleep in parallel with
  // an independent .catch(() => null) per endpoint specifically so one
  // endpoint being down (or simply not scored yet today) can't blank the
  // other two — Oura's own readiness score, for instance, often isn't
  // computed until after first movement. These two tests are the fixture
  // proof for that: each fails a different subset of endpoints and checks
  // the surviving ones resolve as real (non-demo) readings while the failed
  // ones report honestly null, never demo-filled or borrowed from a sibling
  // endpoint's data.
  it('readiness and sleep still resolve live when only Activity\'s endpoint is down (proof: partial Oura failure stays honest, not all-or-nothing)', async () => {
    const now = new Date()
    const day = ymd(now)
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const path = new URL(url).pathname
      if (path.endsWith('/daily_readiness')) return { ok: true, status: 200, json: async () => ({ data: [{ day, score: 91 }] }) }
      if (path.endsWith('/sleep')) return { ok: true, status: 200, json: async () => ({ data: [{ day, total_sleep_duration: 6.5 * 3600 }] }) }
      return { ok: false, status: 500, json: async () => ({}) } // daily_activity down
    }))
    const store = {
      ...baseStore,
      // garmin's demo must be switched off here: it was never configured/
      // connected in this fixture either, and garmin is preferred ahead of
      // oura for expenditure/steps (see PREFERENCE) — left at its default
      // demo:true, garmin's seeded demo numbers would silently win the
      // expenditure/steps slots regardless of what oura's own endpoints did,
      // which is a real thing this test would otherwise get right by accident.
      getIntegration: async (userId, id) => ({ enabled: true, demo: id !== 'garmin', connected_at: id === 'apple' ? '2026-08-01T00:00:00.000Z' : null, settings: {} }),
      listOuraAccounts: async () => [
        { id: 1, access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() },
      ],
    }
    const sig = await composeSignals(store, now, 1)
    expect(sig.readiness).toEqual(expect.objectContaining({ provider: 'oura', demo: false, value: 91 }))
    expect(sig.sleep).toEqual(expect.objectContaining({ provider: 'oura', demo: false, value: 6.5 }))
    // Activity's own fields are honestly absent — not fabricated from demo,
    // and not borrowed from the two endpoints that did succeed.
    expect(sig.expenditure).toBeNull()
    expect(sig.steps).toBeNull()
  })

  it('expenditure and steps still resolve live when only Readiness/sleep endpoints are down (control, inverse of the above)', async () => {
    const now = new Date()
    const day = ymd(now)
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const path = new URL(url).pathname
      // Activity's score (55) is deliberately present and deliberately
      // different from any readiness value, so this also re-proves — this
      // time via the live signal path rather than backfill — that a failed
      // Readiness fetch never falls back to Activity's score.
      if (path.endsWith('/daily_activity')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ day, total_calories: 2380, active_calories: 460, steps: 8700, score: 55 }] }) }
      }
      return { ok: false, status: 500, json: async () => ({}) } // daily_readiness and sleep down
    }))
    const store = {
      ...baseStore,
      // See the previous test: garmin's demo must be off, or its seeded
      // expenditure/steps would win the PREFERENCE fallback ahead of oura's
      // real ones regardless of what this test is actually exercising.
      getIntegration: async (userId, id) => ({ enabled: true, demo: id !== 'garmin', connected_at: id === 'apple' ? '2026-08-01T00:00:00.000Z' : null, settings: {} }),
      listOuraAccounts: async () => [
        { id: 1, access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() },
      ],
    }
    const sig = await composeSignals(store, now, 1)
    expect(sig.expenditure).toEqual(expect.objectContaining({ provider: 'oura', demo: false, value: 2380 }))
    expect(sig.steps).toEqual(expect.objectContaining({ provider: 'oura', demo: false, value: 8700 }))
    expect(sig.readiness).toBeNull() // never Activity's score (55), and no demo fabricated in its place
    expect(sig.sleep).toBeNull()
  })
})
