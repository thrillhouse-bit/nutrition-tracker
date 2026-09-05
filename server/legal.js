import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const legalDir = path.join(__dirname, '..', 'legal')

const REQUIRED = {
  LEGAL_VERSION: 'published legal document version',
  LEGAL_REVIEWED: 'legal review acknowledgement',
}

const clean = (value) => String(value || '').trim()
const looksLikePlaceholder = (value) => /^(?:\.{3}|tbd|todo)$/i.test(value) || /\[|\]|fill\s+in/i.test(value)
const meaningfulVersion = (value) => value.length >= 2 && value.length <= 80 && /^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(value) && /\d/.test(value)

export function legalStatus(env = process.env) {
  const values = Object.fromEntries(Object.keys(REQUIRED).map((key) => [key, clean(env[key])]))
  const missing = Object.keys(REQUIRED).filter((key) => {
    if (!values[key] || looksLikePlaceholder(values[key])) return true
    if (key === 'LEGAL_REVIEWED') return values[key].toLowerCase() !== 'true'
    if (key === 'LEGAL_VERSION') return !meaningfulVersion(values[key])
    return false
  })
  const ready = missing.length === 0
  return {
    ready,
    signupEnabled: ready,
    // The explicit published version is the re-consent boundary. It avoids
    // deriving legal identity from unrelated operator metadata.
    version: ready ? values.LEGAL_VERSION : null,
    privacyUrl: '/privacy',
    termsUrl: '/terms',
    missing: missing.map((key) => ({ key, label: REQUIRED[key] })),
    values,
  }
}

export function renderLegalDocument(kind, env = process.env) {
  const status = legalStatus(env)
  if (!status.ready) return null
  const file = kind === 'privacy' ? 'privacy-policy.html' : kind === 'terms' ? 'terms-of-service.html' : null
  if (!file) return null
  const html = fs.readFileSync(path.join(legalDir, file), 'utf8')
  // Templates are publication-ready without operator metadata. Keep a
  // defensive placeholder gate so a future unreviewed template edit cannot
  // become public merely because it no longer has an environment variable.
  return /\[[A-Z][A-Z0-9 _/—-]+\]/.test(html) ? null : html
}

export function renderLegalUnavailablePage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legal documents unavailable | Body Current</title>
<style>body{margin:0;background:#f7f4ec;color:#121210;font:16px/1.55 Archivo,Arial,sans-serif}main{max-width:42rem;margin:12vh auto;padding:2rem;border:1px solid #121210;background:#fff}h1{margin:0 0 1rem;font:2rem/1.05 Georgia,serif}a{color:#1f35c4}</style></head>
<body><main><h1>Legal documents are being finalized</h1><p>Body Current is not accepting new accounts until its Privacy Policy and Terms of Service have been completed and approved. Existing account holders can still sign in.</p><p><a href="/">Return to Body Current</a></p></main></body></html>`
}
