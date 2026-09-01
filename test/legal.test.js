import { describe, expect, it } from 'vitest'
import { legalStatus, renderLegalDocument } from '../server/legal.js'

const complete = {
  LEGAL_ENTITY_NAME: 'Example Operator LLC',
  LEGAL_EFFECTIVE_DATE: 'August 31, 2026',
  LEGAL_GOVERNING_JURISDICTION: 'California, United States',
  LEGAL_DATA_HOSTING_LOCATION: 'the United States',
  LEGAL_CONTACT_EMAIL: 'privacy@example.test',
  LEGAL_YEAR: '2026',
  LEGAL_REVIEWED: 'true',
}

describe('legal launch gate', () => {
  it('fails closed and names missing ownership decisions', () => {
    const status = legalStatus({})
    expect(status.ready).toBe(false)
    expect(status.signupEnabled).toBe(false)
    expect(status.missing.map((m) => m.key)).toContain('LEGAL_ENTITY_NAME')
    expect(status.missing.map((m) => m.key)).toContain('LEGAL_REVIEWED')
  })

  it('requires an explicit review acknowledgement', () => {
    expect(legalStatus({ ...complete, LEGAL_REVIEWED: 'false' }).ready).toBe(false)
    expect(legalStatus({ ...complete, LEGAL_ENTITY_NAME: '...' }).ready).toBe(false)
    expect(legalStatus({ ...complete, LEGAL_EFFECTIVE_DATE: 'not a date' }).ready).toBe(false)
    expect(legalStatus(complete).ready).toBe(true)
  })

  it('renders approved values with no template placeholders', () => {
    for (const kind of ['privacy', 'terms']) {
      const html = renderLegalDocument(kind, complete)
      expect(html).toContain('Example Operator LLC')
      expect(html).toContain('August 31, 2026')
      expect(html).toContain('privacy@example.test')
      expect(html).not.toContain('class="ph"')
      expect(html).not.toMatch(/\[(?:LEGAL ENTITY|EFFECTIVE DATE|GOVERNING-LAW|DATA HOSTING|YEAR)/)
    }
  })

  it('escapes environment values before inserting them into HTML', () => {
    const html = renderLegalDocument('privacy', { ...complete, LEGAL_ENTITY_NAME: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
