import crypto from 'node:crypto'

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Small, dependency-free fixed-window limiter for the public credential
// endpoints. Keys are SHA-256 digests so raw email/IP combinations are never
// retained in memory or logs. This is deliberately process-local: it closes
// the single-instance brute-force/credential-stuffing gap immediately; a
// shared Redis/edge limiter remains the right upgrade before horizontal scale.
export class FixedWindowLimiter {
  constructor({ max, windowMs, maxEntries = 10_000, now = () => Date.now() }) {
    this.max = positiveInt(max, 1)
    this.windowMs = positiveInt(windowMs, 60_000)
    this.maxEntries = positiveInt(maxEntries, 10_000)
    this.now = now
    this.entries = new Map()
  }

  digest(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex')
  }

  prune(now = this.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key)
    }
  }

  status(key) {
    const now = this.now()
    const id = this.digest(key)
    const entry = this.entries.get(id)
    if (!entry || entry.resetAt <= now) {
      if (entry) this.entries.delete(id)
      return { allowed: true, remaining: this.max, retryAfterSeconds: 0 }
    }
    return {
      allowed: entry.count < this.max,
      remaining: Math.max(0, this.max - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }

  consume(key) {
    const now = this.now()
    this.prune(now)
    const id = this.digest(key)
    const current = this.entries.get(id)
    if (!current && this.entries.size >= this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value)
    }
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current
    if (entry.count >= this.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      }
    }
    entry.count += 1
    // Refresh insertion order so capacity eviction removes the least recently
    // touched bucket rather than an arbitrary active one.
    this.entries.delete(id)
    this.entries.set(id, entry)
    return {
      allowed: true,
      remaining: Math.max(0, this.max - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }

  clear(key) {
    this.entries.delete(this.digest(key))
  }

  reset() {
    this.entries.clear()
  }
}

const LOGIN_WINDOW_MS = positiveInt(process.env.AUTH_LOGIN_WINDOW_MS, 15 * 60 * 1000)

export const loginIpLimiter = new FixedWindowLimiter({
  max: positiveInt(process.env.AUTH_LOGIN_IP_MAX, 30),
  windowMs: LOGIN_WINDOW_MS,
})

export const loginCredentialLimiter = new FixedWindowLimiter({
  max: positiveInt(process.env.AUTH_LOGIN_CREDENTIAL_MAX, 8),
  windowMs: LOGIN_WINDOW_MS,
})

export const signupIpLimiter = new FixedWindowLimiter({
  max: positiveInt(process.env.AUTH_SIGNUP_IP_MAX, 5),
  windowMs: positiveInt(process.env.AUTH_SIGNUP_WINDOW_MS, 60 * 60 * 1000),
})

export const recoveryIpLimiter = new FixedWindowLimiter({
  max: positiveInt(process.env.AUTH_RECOVERY_IP_MAX, 5),
  windowMs: positiveInt(process.env.AUTH_RECOVERY_WINDOW_MS, 60 * 60 * 1000),
})

export function clientRateLimitKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown-client'
}

export function sendRateLimit(res, states) {
  const retryAfter = Math.max(1, ...states.map((state) => state.retryAfterSeconds || 1))
  res.set('Retry-After', String(retryAfter))
  return res.status(429).json({ error: 'Too many attempts. Try again later.' })
}
