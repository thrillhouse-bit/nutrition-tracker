import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  const users = []
  let nextUserId = 0
  return {
    store: {
      createUser: async ({ email, password_hash, legal_version }) => {
        const now = new Date().toISOString()
        const user = { id: ++nextUserId, email, password_hash, legal_version, legal_accepted_at: now, created_at: now }
        users.push(user)
        return user
      },
      getUserByEmail: async (email) => users.find((user) => user.email === email) || null,
      getUserById: async (id) => users.find((user) => user.id === Number(id)) || null,
      countUsers: async () => users.length,
      migrateLegacyDataToUser: async () => {},
    },
  }
})

vi.mock('../server/db.js', () => ({ store: fake.store, backend: 'json-file' }))

let server
let base

beforeAll(async () => {
  process.env.PORT = '0'
  Object.assign(process.env, {
    ALPHA_INVITE_ONLY: 'false',
    LEGAL_ENTITY_NAME: 'Authority JSON Test Operator',
    LEGAL_EFFECTIVE_DATE: 'September 1, 2026',
    LEGAL_GOVERNING_JURISDICTION: 'Test jurisdiction',
    LEGAL_DATA_HOSTING_LOCATION: 'Test region',
    LEGAL_CONTACT_EMAIL: 'privacy@example.test',
    LEGAL_YEAR: '2026',
    LEGAL_REVIEWED: 'true',
    AUTH_SIGNUP_IP_MAX: '100',
  })
  const { default: app } = await import('../server/index.js')
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => server?.close())

describe('RPG authority v2 JSON backend boundary', () => {
  it('returns a typed 501 instead of silently falling back to local-file authority', async () => {
    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'authority-json@example.test', password: 'correct-horse-battery', acceptLegal: true }),
    })
    expect(signup.status).toBe(201)
    const cookie = (signup.headers.get('set-cookie') || '').split(';')[0]
    for (const method of ['GET', 'POST', 'PUT']) {
      const response = await fetch(`${base}/api/rpg/save/v2`, {
        method,
        headers: { Cookie: cookie, ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
        ...(method === 'GET' ? {} : { body: JSON.stringify({}) }),
      })
      expect(response.status).toBe(501)
      expect(await response.json()).toMatchObject({ code: 'RPG_AUTHORITY_POSTGRES_REQUIRED' })
    }
    const command = await fetch(`${base}/api/rpg/save/v2/commands`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: 1,
        commandId: 'json-boundary-command',
        idempotencyKey: 'json-boundary-key',
        expectedStoryRevision: 1,
        expectedInventoryRevision: 1,
        command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
      }),
    })
    expect(command.status).toBe(501)
    expect(await command.json()).toMatchObject({ code: 'RPG_AUTHORITY_POSTGRES_REQUIRED' })
  })
})
