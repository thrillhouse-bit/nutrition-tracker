const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

// Shared defense-in-depth for the PWA, server-rendered legal pages, and API.
// Camera remains available to this origin for barcode/label scanning; every
// unrelated sensitive browser capability is denied. Inline styles remain
// allowed because the existing React components and legal templates use style
// attributes, while scripts stay self-only and cannot execute inline.
export function securityHeaders({ production = process.env.NODE_ENV === 'production' } = {}) {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}${production ? '; upgrade-insecure-requests' : ''}`,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    if (production) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  }
}

export { CONTENT_SECURITY_POLICY }
