import { describe, expect, it } from 'vitest'
import { alphaAccessStatus, configuredInviteDigest, digestInviteCode } from '../server/alphaAccess.js'

const codes = Array.from({ length: 10 }, (_, index) => `AlphaInvite${String(index + 1).padStart(2, '0')}_abcdefghijklmnop`)

describe('invite-only alpha configuration', () => {
  it('keeps ordinary signup enabled when invite-only mode is off', () => {
    expect(alphaAccessStatus({})).toEqual({ inviteRequired: false, signupEnabled: true })
  })

  it('requires exactly ten distinct high-entropy-shaped codes and otherwise fails closed', () => {
    expect(alphaAccessStatus({ ALPHA_INVITE_ONLY: 'true', ALPHA_INVITE_CODES: codes.join(',') }))
      .toEqual({ inviteRequired: true, signupEnabled: true })
    expect(alphaAccessStatus({ ALPHA_INVITE_ONLY: 'true', ALPHA_INVITE_CODES: codes.slice(0, 9).join(',') }).signupEnabled).toBe(false)
    expect(alphaAccessStatus({ ALPHA_INVITE_ONLY: 'true', ALPHA_INVITE_CODES: [...codes.slice(0, 9), codes[0]].join(',') }).signupEnabled).toBe(false)
    expect(alphaAccessStatus({ ALPHA_INVITE_ONLY: 'true', ALPHA_INVITE_CODES: [...codes.slice(0, 9), 'too-short'].join(',') }).signupEnabled).toBe(false)
    expect(alphaAccessStatus({ ALPHA_INVITE_ONLY: 'true', ALPHA_INVITE_CODES: [...codes.slice(0, 9), 'a'.repeat(32)].join(',') }).signupEnabled).toBe(false)
  })

  it('returns a deterministic digest only for a configured code', () => {
    const env = { ALPHA_INVITE_ONLY: 'true', ALPHA_INVITE_CODES: codes.join(',') }
    const digest = configuredInviteDigest(codes[3], env)
    expect(digest).toBe(digestInviteCode(codes[3]))
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(digest).not.toContain(codes[3])
    expect(configuredInviteDigest('AlphaInvite99_abcdefghijklmnop', env)).toBeNull()
  })
})
