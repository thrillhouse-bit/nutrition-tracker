// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('PWA navigation ownership', () => {
  it('never lets the app-shell fallback intercept API or public legal routes', () => {
    const source = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
    expect(source).toContain("navigateFallbackDenylist: [/^\\/api\\//, /^\\/privacy\\/?$/, /^\\/terms\\/?$/]")
  })
})
