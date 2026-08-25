import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest'
import {
  oauthConfigured,
  signState,
  verifyState,
  authorizeUrl,
  expiryFrom,
  activityRange,
  dailyReadiness,
  readinessRange,
  dailySleepHours,
  dailySleepScore,
  sleepScoreRange,
  workoutsRange,
} from '../server/integrations/oura.js'

// These helpers read Oura config from process.env at call time, so we set the
// three OAuth vars before any test runs. Vitest isolates env per file by
// default, but we still only set what these functions need.
const CLIENT_ID = 'cid'
const CLIENT_SECRET = 'secret'
const REDIRECT_URI = 'http://localhost:5173/api/oura/callback'

beforeAll(() => {
  process.env.OURA_CLIENT_ID = CLIENT_ID
  process.env.OURA_CLIENT_SECRET = CLIENT_SECRET
  process.env.OURA_REDIRECT_URI = REDIRECT_URI
})

describe('oura oauthConfigured', () => {
  it('returns true when all three OAuth env vars are set', () => {
    expect(oauthConfigured()).toBe(true)
  })

  it('returns false when any one var is missing (restored afterward)', () => {
    for (const key of ['OURA_CLIENT_ID', 'OURA_CLIENT_SECRET', 'OURA_REDIRECT_URI']) {
      const saved = process.env[key]
      delete process.env[key]
      expect(oauthConfigured()).toBe(false)
      process.env[key] = saved
      // Sanity: restoring brings it back to true.
      expect(oauthConfigured()).toBe(true)
    }
  })
})

describe('oura authorizeUrl', () => {
  it('builds the Oura authorize URL with the expected query params', () => {
    const state = 'the-state-value'
    const url = authorizeUrl(state)

    expect(url.startsWith('https://cloud.ouraring.com/oauth/authorize')).toBe(true)

    const parsed = new URL(url)
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(parsed.searchParams.get('scope')).toBe('email personal daily')
    expect(parsed.searchParams.get('state')).toBe(state)
  })
})

describe('oura signState / verifyState', () => {
  it('verifies a state it just signed', () => {
    const s = signState()
    expect(verifyState(s)).toBe(true)
  })

  it('rejects garbage / malformed / missing states', () => {
    expect(verifyState('deadbeef.0000')).toBe(false)
    expect(verifyState('not-a-valid-state')).toBe(false)
    expect(verifyState(undefined)).toBe(false)
  })

  it('rejects a state whose nonce was tampered with but keeps the old signature', () => {
    const s = signState()
    const [nonce, sig] = s.split('.')
    // Flip the first hex char of the nonce to a different value.
    const tamperedNonce = (nonce[0] === '0' ? '1' : '0') + nonce.slice(1)
    expect(tamperedNonce).not.toBe(nonce)
    const tampered = `${tamperedNonce}.${sig}`
    expect(verifyState(tampered)).toBe(false)
  })
})

describe('oura expiryFrom', () => {
  it('returns an ISO expiry roughly expiresIn seconds in the future', () => {
    const before = Date.now()
    const iso = expiryFrom(3600)
    const t = Date.parse(iso)
    expect(Number.isNaN(t)).toBe(false)
    // Strictly in the future, and near before + 3600s (allow a generous window).
    expect(t).toBeGreaterThan(before)
    expect(t).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000)
    expect(t).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 1000)
  })

  it('defaults a nullish input to ~86400s ahead and stays in the future', () => {
    const before = Date.now()
    for (const input of [null, undefined, 0]) {
      const iso = expiryFrom(input)
      const t = Date.parse(iso)
      expect(Number.isNaN(t)).toBe(false)
      expect(t).toBeGreaterThan(before)
      expect(t).toBeGreaterThanOrEqual(before + 86400 * 1000 - 1000)
      expect(t).toBeLessThanOrEqual(Date.now() + 86400 * 1000 + 1000)
    }
  })
})

describe('oura activityRange', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns one normalized record per day the range API returns', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = new URL(url)
      expect(u.searchParams.get('start_date')).toBe('2026-08-01')
      expect(u.searchParams.get('end_date')).toBe('2026-08-03')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { day: '2026-08-01', score: 70, total_calories: 2100, active_calories: 400, steps: 8000 },
            { day: '2026-08-02', score: 75, total_calories: 2200, active_calories: 500, steps: 9000 },
          ],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchSpy)
    const rows = await activityRange('tok', '2026-08-01', '2026-08-03')
    expect(fetchSpy).toHaveBeenCalledTimes(1) // one call for the whole range, not one per day
    expect(rows).toEqual([
      { day: '2026-08-01', total_calories: 2100, active_calories: 400, steps: 8000, score: 70 },
      { day: '2026-08-02', total_calories: 2200, active_calories: 500, steps: 9000, score: 75 },
    ])
  })

  it('returns an empty array rather than throwing when the range has no data (control)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })))
    const rows = await activityRange('tok', '2026-08-01', '2026-08-03')
    expect(rows).toEqual([])
  })
})

describe('oura dailyReadiness / readinessRange', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Regression coverage: this app used to fetch daily_activity and call ITS
  // score "readiness" — these hit a genuinely different endpoint.
  it('dailyReadiness fetches daily_readiness (not daily_activity) and widens the window by a day', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = new URL(url)
      expect(u.pathname).toContain('/daily_readiness')
      expect(u.searchParams.get('start_date')).toBe('2026-08-24')
      expect(u.searchParams.get('end_date')).toBe('2026-08-25') // widened by one day
      return {
        ok: true, status: 200,
        json: async () => ({ data: [{ day: '2026-08-24', score: 91 }] }),
      }
    })
    vi.stubGlobal('fetch', fetchSpy)
    const r = await dailyReadiness('tok', '2026-08-24')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(r.day).toBe('2026-08-24')
    expect(r.score).toBe(91)
  })

  it('dailyReadiness returns null when Oura has no record for that day yet (control)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })))
    expect(await dailyReadiness('tok', '2026-08-24')).toBeNull()
  })

  it('readinessRange returns one normalized record per day, one call for the whole range', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = new URL(url)
      expect(u.pathname).toContain('/daily_readiness')
      return {
        ok: true, status: 200,
        json: async () => ({ data: [
          { day: '2026-08-01', score: 70 },
          { day: '2026-08-02', score: null },
        ] }),
      }
    })
    vi.stubGlobal('fetch', fetchSpy)
    const rows = await readinessRange('tok', '2026-08-01', '2026-08-03')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(rows.map((r) => ({ day: r.day, score: r.score }))).toEqual([{ day: '2026-08-01', score: 70 }, { day: '2026-08-02', score: null }])
  })
})

describe('oura dailySleepHours', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hits the sleep endpoint and sums same-day sessions into hours', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = new URL(url)
      expect(u.pathname).toContain('/sleep')
      return {
        ok: true, status: 200,
        json: async () => ({ data: [
          { day: '2026-08-24', total_sleep_duration: 6 * 3600 },
          { day: '2026-08-24', total_sleep_duration: 0.5 * 3600 }, // a nap, same day
          { day: '2026-08-25', total_sleep_duration: 8 * 3600 }, // a different day — must not be counted
        ] }),
      }
    })
    vi.stubGlobal('fetch', fetchSpy)
    const hours = await dailySleepHours('tok', '2026-08-24')
    expect(hours).toBeCloseTo(6.5, 5)
  })

  it('returns null rather than 0 when there is no sleep data for that day (control)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })))
    expect(await dailySleepHours('tok', '2026-08-24')).toBeNull()
  })
})

// daily_sleep — a genuinely different endpoint from `sleep` above: a 0-100
// quality SCORE, not a duration. Fixture shaped from Oura's documented v2
// response (score/day/timestamp/contributors) — clearly labeled as such,
// not captured against a real account.
describe('oura dailySleepScore / sleepScoreRange', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hits daily_sleep (not the duration `sleep` endpoint) for a single day', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = new URL(url)
      expect(u.pathname).toContain('/daily_sleep')
      return { ok: true, status: 200, json: async () => ({ data: [{ day: '2026-08-24', score: 82 }] }) }
    })
    vi.stubGlobal('fetch', fetchSpy)
    const r = await dailySleepScore('tok', '2026-08-24')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ day: '2026-08-24', score: 82 })
  })

  it('returns null when Oura has no daily_sleep record for that day yet (control)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })))
    expect(await dailySleepScore('tok', '2026-08-24')).toBeNull()
  })

  it('sleepScoreRange returns one record per day for the whole window', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: [{ day: '2026-08-01', score: 70 }, { day: '2026-08-02', score: null }] }),
    })))
    const rows = await sleepScoreRange('tok', '2026-08-01', '2026-08-03')
    expect(rows).toEqual([{ day: '2026-08-01', score: 70 }, { day: '2026-08-02', score: null }])
  })
})

// Workout endpoint — fields per Oura's documented shape (id, day, activity,
// calories, distance, start_datetime, end_datetime, intensity, label,
// source). Cursor-paginated (next_token), unlike the per-day summary
// endpoints above, so these tests specifically prove the pagination loop.
describe('oura workoutsRange', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes every documented field from a single page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        data: [{
          id: 'abc-123', day: '2026-08-24', activity: 'running', calories: 412.5, distance: 5230.1,
          start_datetime: '2026-08-24T17:30:00+00:00', end_datetime: '2026-08-24T18:15:00+00:00',
          intensity: 'moderate', label: null, source: 'autodetected',
        }],
        next_token: null,
      }),
    })))
    const rows = await workoutsRange('tok', '2026-08-24', '2026-08-24')
    expect(rows).toEqual([{
      id: 'abc-123', day: '2026-08-24', activity: 'running', intensity: 'moderate', source: 'autodetected',
      label: null, calories: 412.5, distance: 5230.1,
      start_datetime: '2026-08-24T17:30:00+00:00', end_datetime: '2026-08-24T18:15:00+00:00',
    }])
  })

  it('follows next_token across pages and stops once it comes back null, in one logical call', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = new URL(url)
      const token = u.searchParams.get('next_token')
      if (!token) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'page1-workout', day: '2026-08-01', activity: 'running' }], next_token: 'cursor-2' }) }
      }
      expect(token).toBe('cursor-2')
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'page2-workout', day: '2026-08-02', activity: 'cycling' }], next_token: null }) }
    })
    vi.stubGlobal('fetch', fetchSpy)
    const rows = await workoutsRange('tok', '2026-08-01', '2026-08-03')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(rows.map((r) => r.id)).toEqual(['page1-workout', 'page2-workout'])
  })

  it('drops a malformed row with no id (nothing to dedupe/upsert on) rather than storing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: [{ day: '2026-08-24', activity: 'running' }, { id: 'has-id', day: '2026-08-24' }], next_token: null }),
    })))
    const rows = await workoutsRange('tok', '2026-08-24', '2026-08-24')
    expect(rows.map((r) => r.id)).toEqual(['has-id'])
  })

  it('returns an empty array, not a throw, when Oura has no workouts in the window (control)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [], next_token: null }) })))
    expect(await workoutsRange('tok', '2026-08-24', '2026-08-24')).toEqual([])
  })

  it('propagates a 403 (missing scope) rather than swallowing it silently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })))
    await expect(workoutsRange('tok', '2026-08-24', '2026-08-24')).rejects.toThrow(/Oura API error \(403\)/)
  })
})
