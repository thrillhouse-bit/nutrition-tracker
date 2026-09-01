// Multi-user auth: password hashing (scrypt) + stateless signed session
// tokens in an httpOnly cookie. No session table/store — verifying a token
// is pure crypto, so it works identically whether the backend is Postgres or
// the JSON-file dev fallback, with zero extra schema. Signing style matches
// the existing OAuth CSRF-state HMAC in integrations/oura.js (nonce.sig,
// timingSafeEqual) rather than introducing a new pattern.
import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)

// Local/dev can use a random per-boot secret. Production must fail at startup
// without an operator-owned secret: silently rotating it on every deploy logs
// every account out and makes session behavior operationally unreliable.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production. Generate a persistent secret before starting OmniFuel.')
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET not set — using a random per-boot secret (sessions will not survive a restart). Set SESSION_SECRET in production.')
}

const SESSION_COOKIE = 'nt_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// --- password hashing -------------------------------------------------------
// scrypt, not bcrypt: no native binding / extra dependency, and Node's
// built-in implementation is a solid modern KDF. Stored as "saltHex:hashHex".

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false
  const [saltHex, hashHex] = stored.split(':')
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, salt, expected.length)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// --- session tokens ----------------------------------------------------------
// payload = base64url(JSON({uid, exp})), token = `${payload}.${hmacSig}`.
// Stateless: verifying is pure crypto, no DB round-trip, no session store.

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
}

export function createSessionToken(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS }))
  return `${payload}.${sign(payload)}`
}

// Returns the user id, or null for any invalid/expired/tampered token —
// never throws, so callers can treat "no session" and "bad session" the same.
export function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expectedSig = sign(payload)
  const a = Buffer.from(sig || '', 'hex')
  const b = Buffer.from(expectedSig, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let data
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!data || typeof data.uid !== 'number' && typeof data.uid !== 'string') return null
  if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
  return data.uid
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax', // Oura/Garmin OAuth callbacks are top-level GET redirects back to our own origin — 'lax' allows the cookie there; 'strict' would silently drop it and look like a random logout mid-connect.
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS,
  path: '/',
}

// Cookie parsing without a dependency (express.json() doesn't parse cookies,
// and this app otherwise avoids adding packages for something this small).
function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

// Attaches req.userId (a real id) or req.userId = null. Never rejects by
// itself — requireAuth (below) is the actual gate, so routes that must stay
// reachable without a session (health, auth endpoints, OAuth callbacks,
// the Garmin webhook, Apple ingest's own token gate) can still read
// req.userId when present without being forced through requireAuth.
export function attachUser(req, res, next) {
  const cookies = parseCookies(req.headers.cookie)
  req.userId = verifySessionToken(cookies[SESSION_COOKIE]) ?? null
  next()
}

export function requireAuth(req, res, next) {
  if (req.userId == null) return res.status(401).json({ error: 'Not signed in.' })
  next()
}

export function setSessionCookie(res, userId) {
  res.cookie(SESSION_COOKIE, createSessionToken(userId), SESSION_COOKIE_OPTS)
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...SESSION_COOKIE_OPTS, maxAge: undefined })
}
