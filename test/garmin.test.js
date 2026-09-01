import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'node:crypto'
import {
  garminConfigured,
  garminReleaseReady,
  pkcePair,
  authorizeUrl,
  normalizeDaily,
  expiryFrom,
} from '../server/integrations/garmin.js'

// These helpers read Garmin config from process.env at call time, so we set the
// three OAuth vars before any test runs. Vitest isolates env per file, but we
// still only set what these functions need.
const CLIENT_ID = 'gid'
const CLIENT_SECRET = 'gsecret'
const REDIRECT_URI = 'http://localhost:5173/api/garmin/callback'

beforeAll(() => {
  process.env.GARMIN_CLIENT_ID = CLIENT_ID
  process.env.GARMIN_CLIENT_SECRET = CLIENT_SECRET
  process.env.GARMIN_REDIRECT_URI = REDIRECT_URI
  process.env.GARMIN_INTEGRATION_VERIFIED = 'true'
})

describe('garmin garminConfigured', () => {
  it('returns true when all three OAuth env vars are set', () => {
    expect(garminConfigured()).toBe(true)
  })

  it('returns false when any one var is missing (restored afterward)', () => {
    for (const key of ['GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET', 'GARMIN_REDIRECT_URI']) {
      const saved = process.env[key]
      delete process.env[key]
      expect(garminConfigured()).toBe(false)
      process.env[key] = saved
      // Sanity: restoring brings it back to true.
      expect(garminConfigured()).toBe(true)
    }
  })

  it('does not become release-ready on credentials alone', () => {
    delete process.env.GARMIN_INTEGRATION_VERIFIED
    expect(garminConfigured()).toBe(true)
    expect(garminReleaseReady()).toBe(false)
    process.env.GARMIN_INTEGRATION_VERIFIED = 'true'
    expect(garminReleaseReady()).toBe(true)
  })
})

describe('garmin pkcePair', () => {
  const BASE64URL = /^[A-Za-z0-9_-]+$/

  it('returns a base64url verifier of valid PKCE length', () => {
    const { verifier } = pkcePair()
    expect(typeof verifier).toBe('string')
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    // base64url only — no +, /, or = padding.
    expect(BASE64URL.test(verifier)).toBe(true)
  })

  it('returns a base64url challenge that is the S256 of the verifier', () => {
    const { verifier, challenge } = pkcePair()
    expect(typeof challenge).toBe('string')
    expect(BASE64URL.test(challenge)).toBe(true)
    // Recompute the S256 challenge independently. Node's 'base64url' digest
    // encoding matches the base64url the helper builds by hand.
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('generates a distinct verifier each call', () => {
    const a = pkcePair()
    const b = pkcePair()
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe('garmin authorizeUrl', () => {
  it('builds the Garmin authorize URL with the expected query params', () => {
    const url = authorizeUrl({ state: 'st', challenge: 'ch' })

    expect(url.startsWith('https://connect.garmin.com/oauth2Confirm')).toBe(true)

    const parsed = new URL(url)
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(parsed.searchParams.get('state')).toBe('st')
    expect(parsed.searchParams.get('code_challenge')).toBe('ch')
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    // A scope must be present (exact value is behind the partner portal).
    expect(parsed.searchParams.has('scope')).toBe(true)
    expect(parsed.searchParams.get('scope')).toBeTruthy()
  })
})

describe('garmin normalizeDaily', () => {
  it('sums active + BMR into total_calories and maps the fields', () => {
    const out = normalizeDaily({
      calendarDate: '2026-08-24',
      activeKilocalories: 500,
      bmrKilocalories: 1600,
      steps: 8000,
    })
    expect(out).toEqual({
      day: '2026-08-24',
      total_calories: 2100,
      active_calories: 500,
      steps: 8000,
    })
  })

  it('returns null total when both calorie fields are absent, but still maps day and null steps', () => {
    const out = normalizeDaily({ calendarDate: '2026-08-24' })
    expect(out.day).toBe('2026-08-24')
    expect(out.total_calories).toBe(null)
    expect(out.steps).toBe(null)
    expect(out.active_calories).toBe(null)
  })

  it('treats a missing counterpart as 0 when only one calorie field is present', () => {
    const out = normalizeDaily({ calendarDate: '2026-08-24', activeKilocalories: 500 })
    // Only active present: missing bmr counts as 0, but total is still a number.
    expect(out.total_calories).toBe(500)
    expect(typeof out.total_calories).toBe('number')
    expect(out.active_calories).toBe(500)
  })
})

describe('garmin expiryFrom', () => {
  it('returns an ISO expiry roughly expiresIn seconds in the future', () => {
    const before = Date.now()
    const iso = expiryFrom(3600)
    const t = Date.parse(iso)
    expect(Number.isNaN(t)).toBe(false)
    expect(t).toBeGreaterThan(before)
    expect(t).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000)
    expect(t).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 1000)
  })

  it('defaults a nullish input to ~86400s ahead and stays in the future', () => {
    const before = Date.now()
    for (const input of [null, undefined]) {
      const iso = expiryFrom(input)
      const t = Date.parse(iso)
      expect(Number.isNaN(t)).toBe(false)
      expect(t).toBeGreaterThan(before)
      expect(t).toBeGreaterThanOrEqual(before + 86400 * 1000 - 1000)
      expect(t).toBeLessThanOrEqual(Date.now() + 86400 * 1000 + 1000)
    }
  })
})
