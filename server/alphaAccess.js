import crypto from 'node:crypto'

const REQUIRED_INVITE_COUNT = 10
const INVITE_RE = /^[A-Za-z0-9_-]{24,128}$/

function inviteOnly(env) {
  return String(env.ALPHA_INVITE_ONLY || '').trim().toLowerCase() === 'true'
}

function configuredCodes(env) {
  return String(env.ALPHA_INVITE_CODES || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
}

// Domain-separate this digest from every other SHA-256 use in the service.
// Invite codes must themselves be high entropy; the digest is deliberately
// deterministic so every API replica and both storage backends agree on the
// same single-use identity without retaining plaintext.
export function digestInviteCode(code) {
  return crypto.createHash('sha256').update(`omnifuel-alpha-invite\0${String(code).trim()}`).digest('hex')
}

export function alphaAccessStatus(env = process.env) {
  const inviteRequired = inviteOnly(env)
  if (!inviteRequired) return { inviteRequired: false, signupEnabled: true }

  const codes = configuredCodes(env)
  const validShape = codes.length === REQUIRED_INVITE_COUNT && codes.every((code) => (
    INVITE_RE.test(code) && new Set(code).size >= 12
  ))
  const unique = validShape && new Set(codes.map(digestInviteCode)).size === REQUIRED_INVITE_COUNT
  return { inviteRequired: true, signupEnabled: Boolean(validShape && unique) }
}

// Returns only the digest that may be persisted. A malformed, unknown, or
// misconfigured code has the same null result; callers must use one generic
// response and must never log the supplied plaintext.
export function configuredInviteDigest(candidate, env = process.env) {
  const status = alphaAccessStatus(env)
  if (!status.inviteRequired || !status.signupEnabled) return null
  const supplied = String(candidate || '').trim()
  if (!INVITE_RE.test(supplied)) return null
  const suppliedDigest = Buffer.from(digestInviteCode(supplied), 'hex')
  let matched = false
  for (const configured of configuredCodes(env)) {
    const configuredDigest = Buffer.from(digestInviteCode(configured), 'hex')
    const equal = crypto.timingSafeEqual(suppliedDigest, configuredDigest)
    matched = matched || equal
  }
  return matched ? suppliedDigest.toString('hex') : null
}

export function inviteUnavailableError() {
  const error = new Error('This invitation is invalid or has already been used.')
  error.status = 403
  error.code = 'INVITE_UNAVAILABLE'
  return error
}
