import { describe, expect, it } from 'vitest'
import { FixedWindowLimiter } from '../server/authRateLimit.js'

describe('FixedWindowLimiter', () => {
  it('blocks after the configured attempt count and reports an integer retry window', () => {
    let now = 1_000
    const limiter = new FixedWindowLimiter({ max: 2, windowMs: 10_000, now: () => now })
    expect(limiter.consume('client@example.com')).toMatchObject({ allowed: true, remaining: 1 })
    expect(limiter.consume('client@example.com')).toMatchObject({ allowed: true, remaining: 0 })
    expect(limiter.consume('client@example.com')).toMatchObject({ allowed: false, retryAfterSeconds: 10 })
    now += 10_000
    expect(limiter.consume('client@example.com')).toMatchObject({ allowed: true, remaining: 1 })
  })

  it('keeps distinct credential buckets isolated and never stores the raw key', () => {
    const limiter = new FixedWindowLimiter({ max: 1, windowMs: 10_000 })
    limiter.consume('192.0.2.1\u0000person@example.com')
    expect(limiter.status('192.0.2.1\u0000person@example.com').allowed).toBe(false)
    expect(limiter.status('192.0.2.1\u0000other@example.com').allowed).toBe(true)
    expect([...limiter.entries.keys()].join(' ')).not.toContain('person@example.com')
  })

  it('clear releases only the selected bucket after a successful login', () => {
    const limiter = new FixedWindowLimiter({ max: 1, windowMs: 10_000 })
    limiter.consume('a')
    limiter.consume('b')
    limiter.clear('a')
    expect(limiter.status('a').allowed).toBe(true)
    expect(limiter.status('b').allowed).toBe(false)
  })

  it('does not evict an active key merely because the bounded map is full', () => {
    const limiter = new FixedWindowLimiter({ max: 2, windowMs: 10_000, maxEntries: 1 })
    limiter.consume('same-client')
    expect(limiter.consume('same-client')).toMatchObject({ allowed: true, remaining: 0 })
    expect(limiter.consume('same-client').allowed).toBe(false)
  })
})
