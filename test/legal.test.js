import { describe, expect, it } from 'vitest'
import { legalStatus, renderLegalDocument } from '../server/legal.js'

const complete = { LEGAL_VERSION: '2026-09-04', LEGAL_REVIEWED: 'true' }

describe('legal launch gate', () => {
  it('fails closed until the publication review is explicitly acknowledged', () => {
    const status = legalStatus({})
    expect(status.ready).toBe(false)
    expect(status.signupEnabled).toBe(false)
    expect(status.missing.map((m) => m.key)).toContain('LEGAL_REVIEWED')
    expect(status.missing.map((m) => m.key)).toContain('LEGAL_VERSION')
  })

  it('requires an explicit review acknowledgement', () => {
    expect(legalStatus({ ...complete, LEGAL_REVIEWED: 'false' }).ready).toBe(false)
    expect(legalStatus({ ...complete, LEGAL_VERSION: 'TODO' }).ready).toBe(false)
    expect(legalStatus({ ...complete, LEGAL_VERSION: 'reviewed' }).ready).toBe(false)
    expect(legalStatus(complete).ready).toBe(true)
    expect(legalStatus(complete).version).toBe('2026-09-04')
  })

  it('renders publication-ready documents with no operator placeholders', () => {
    for (const kind of ['privacy', 'terms']) {
      const html = renderLegalDocument(kind, complete)
      expect(html).toContain('Body Current')
      expect(html).not.toMatch(/\[(?:LEGAL ENTITY|EFFECTIVE DATE|GOVERNING-LAW|DATA HOSTING|YEAR)/)
    }
  })
})
