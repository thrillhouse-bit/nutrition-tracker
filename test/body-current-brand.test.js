import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const userFacing = [
  'README.md', 'index.html', 'vite.config.js', 'docs/UX-CONTRACT.md', 'docs/health-auto-export-setup.md',
  'src/App.jsx', 'src/components/Auth.jsx', 'src/components/Connections.jsx', 'src/components/Onboarding.jsx',
  'server/agent.js', 'server/legal.js', 'legal/README.md', 'legal/privacy-policy.html', 'legal/terms-of-service.html',
]

describe('Body Current brand surfaces', () => {
  it('does not retain the former consumer brand on approved user-facing surfaces', () => {
    for (const file of userFacing) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(/OmniFuel(?: Tech)?/)
    }
  })

  it('retains intentional technical and separate-product identifiers', () => {
    expect(fs.readFileSync(path.join(root, 'server/agent.js'), 'utf8')).toContain("service: 'omnifuel'")
    expect(fs.readFileSync(path.join(root, 'src/components/Auth.jsx'), 'utf8')).toContain("surface = 'body-current'")
    expect(fs.readFileSync(path.join(root, 'src/components/Auth.jsx'), 'utf8')).toContain('Oathbearer')
  })
})
