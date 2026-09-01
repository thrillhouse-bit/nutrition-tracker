import { describe, expect, it, vi } from 'vitest'
import { CONTENT_SECURITY_POLICY, securityHeaders } from '../server/securityHeaders.js'

const run = (production) => {
  const values = {}
  const res = {
    set: vi.fn((name, value) => {
      if (typeof name === 'object') Object.assign(values, name)
      else values[name] = value
    }),
  }
  const next = vi.fn()
  securityHeaders({ production })({}, res, next)
  return { values, next }
}

describe('securityHeaders', () => {
  it('sets the browser isolation and content-policy baseline without breaking first-party camera use', () => {
    const { values, next } = run(false)
    expect(values['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY)
    expect(values['Content-Security-Policy']).toContain("script-src 'self'")
    expect(values['Content-Security-Policy']).toContain('https://fonts.googleapis.com')
    expect(values['Permissions-Policy']).toContain('camera=(self)')
    expect(values['X-Frame-Options']).toBe('DENY')
    expect(values['X-Content-Type-Options']).toBe('nosniff')
    expect(values['Strict-Transport-Security']).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('adds HSTS and upgrades insecure subresources only in production', () => {
    const { values } = run(true)
    expect(values['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains')
    expect(values['Content-Security-Policy']).toMatch(/; upgrade-insecure-requests$/)
  })
})
