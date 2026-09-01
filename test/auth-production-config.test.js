import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('production session configuration', () => {
  it('fails startup instead of silently rotating sessions when SESSION_SECRET is absent', () => {
    const env = { ...process.env, NODE_ENV: 'production' }
    delete env.SESSION_SECRET
    const run = spawnSync(process.execPath, ['--input-type=module', '--eval', "import './server/auth.js'"], {
      cwd: process.cwd(), env, encoding: 'utf8',
    })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toMatch(/SESSION_SECRET is required in production/)
  })

  it('loads normally with an explicit persistent production secret', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '--eval', "import './server/auth.js'"], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'test-only-persistent-secret' }, encoding: 'utf8',
    })
    expect(run.status).toBe(0)
  })
})
