import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

const importDb = (env) => spawnSync(
  process.execPath,
  ['--input-type=module', '--eval', "import('./server/db.js').then(({ backend }) => console.log(backend))"],
  { cwd: process.cwd(), env, encoding: 'utf8' },
)

describe('production storage configuration', () => {
  it('fails startup instead of silently accepting real data into disposable JSON storage', () => {
    const env = { ...process.env, NODE_ENV: 'production' }
    delete env.DATABASE_URL
    delete env.ALLOW_EPHEMERAL_STORAGE
    const run = importDb(env)

    expect(run.status).not.toBe(0)
    expect(run.stderr).toMatch(/DATABASE_URL is required in production/)
  })

  it('allows an explicitly disposable production preview', () => {
    const env = { ...process.env, NODE_ENV: 'production', ALLOW_EPHEMERAL_STORAGE: 'true' }
    delete env.DATABASE_URL
    const run = importDb(env)

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('json-file')
  })

  it('keeps zero-config local development available', () => {
    const env = { ...process.env, NODE_ENV: 'development' }
    delete env.DATABASE_URL
    delete env.ALLOW_EPHEMERAL_STORAGE
    const run = importDb(env)

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('json-file')
  })
})
