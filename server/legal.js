import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const legalDir = path.join(__dirname, '..', 'legal')

const REQUIRED = {
  LEGAL_ENTITY_NAME: 'operator name',
  LEGAL_EFFECTIVE_DATE: 'effective date',
  LEGAL_GOVERNING_JURISDICTION: 'governing jurisdiction',
  LEGAL_DATA_HOSTING_LOCATION: 'data-hosting location',
  LEGAL_CONTACT_EMAIL: 'monitored contact email',
  LEGAL_YEAR: 'copyright year',
  LEGAL_REVIEWED: 'legal review acknowledgement',
}

const clean = (value) => String(value || '').trim()
const looksLikePlaceholder = (value) => /^(?:\.{3}|tbd|todo)$/i.test(value) || /\[|\]|fill\s+in/i.test(value)

export function legalStatus(env = process.env) {
  const values = Object.fromEntries(Object.keys(REQUIRED).map((key) => [key, clean(env[key])]))
  const missing = Object.keys(REQUIRED).filter((key) => {
    if (!values[key] || looksLikePlaceholder(values[key])) return true
    if (key === 'LEGAL_REVIEWED') return values[key].toLowerCase() !== 'true'
    if (key === 'LEGAL_CONTACT_EMAIL') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[key])
    if (key === 'LEGAL_YEAR') return !/^\d{4}$/.test(values[key])
    if (key === 'LEGAL_EFFECTIVE_DATE') return Number.isNaN(Date.parse(values[key]))
    return false
  })
  const ready = missing.length === 0
  return {
    ready,
    signupEnabled: ready,
    version: ready ? values.LEGAL_EFFECTIVE_DATE : null,
    privacyUrl: '/privacy',
    termsUrl: '/terms',
    missing: missing.map((key) => ({ key, label: REQUIRED[key] })),
    values,
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function renderLegalDocument(kind, env = process.env) {
  const status = legalStatus(env)
  if (!status.ready) return null
  const file = kind === 'privacy' ? 'privacy-policy.html' : kind === 'terms' ? 'terms-of-service.html' : null
  if (!file) return null
  const v = Object.fromEntries(Object.entries(status.values).map(([key, value]) => [key, escapeHtml(value)]))
  const html = fs.readFileSync(path.join(legalDir, file), 'utf8')
    .replaceAll('[EFFECTIVE DATE — fill in]', v.LEGAL_EFFECTIVE_DATE)
    .replaceAll('[LEGAL ENTITY / OWNER NAME]', v.LEGAL_ENTITY_NAME)
    .replaceAll('[GOVERNING-LAW JURISDICTION]', v.LEGAL_GOVERNING_JURISDICTION)
    .replaceAll('[DATA HOSTING LOCATION / COUNTRY — fill in or generalize]', v.LEGAL_DATA_HOSTING_LOCATION)
    .replaceAll('[YEAR]', v.LEGAL_YEAR)
    .replaceAll('privacy@omnifuelapp.tech', v.LEGAL_CONTACT_EMAIL)
    // Placeholder highlighting is useful in the source template, but an
    // approved document must not visually present configured values as TODOs.
    .replaceAll(' class="ph"', '')
  // Defense in depth for future edits: a newly introduced placeholder cannot
  // leak into a supposedly approved public document just because the required
  // environment list was not updated at the same time.
  return /\[[A-Z][A-Z0-9 _/—-]+\]/.test(html) ? null : html
}

export function renderLegalUnavailablePage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legal documents unavailable | OmniFuel Tech</title>
<style>body{margin:0;background:#f7f4ec;color:#121210;font:16px/1.55 Archivo,Arial,sans-serif}main{max-width:42rem;margin:12vh auto;padding:2rem;border:1px solid #121210;background:#fff}h1{margin:0 0 1rem;font:2rem/1.05 Georgia,serif}a{color:#1f35c4}</style></head>
<body><main><h1>Legal documents are being finalized</h1><p>OmniFuel is not accepting new accounts until its Privacy Policy and Terms of Service have been completed and approved. Existing account holders can still sign in.</p><p><a href="/">Return to OmniFuel</a></p></main></body></html>`
}
