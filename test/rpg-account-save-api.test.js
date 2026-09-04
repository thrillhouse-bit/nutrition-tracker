import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RPG_SAVE_MAX_BYTES,
  validateRpgSavePutBody,
  validateRpgSaveRestoreBody,
} from '../server/rpgSave.js'
import { createRpgAuthorityBootstrap, validateRpgAuthorityBootstrapBody } from '../server/rpgAuthority.js'
import { signupIpLimiter } from '../server/authRateLimit.js'

const fake = vi.hoisted(() => {
  const state = { users: [], saves: new Map(), histories: new Map(), authorities: new Map(), authorityHistory: new Map(), nextUserId: 0 }
  const clone = (value) => value == null ? value : structuredClone(value)
  const publicSave = (row) => row && ({
    payload: clone(row.payload),
    gameSchemaVersion: row.gameSchemaVersion,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
  const appendHistory = (uid, row) => {
    const history = state.histories.get(uid) || []
    history.unshift({
      revision: row.revision, payload: clone(row.payload), gameSchemaVersion: row.gameSchemaVersion,
      createdAt: row.createdAt, savedAt: row.updatedAt,
    })
    state.histories.set(uid, history.slice(0, 20))
  }
  const publicAuthority = (row) => row && ({
    story: clone(row.story), storyRevision: row.storyRevision,
    authoritative: clone(row.authoritative), inventoryRevision: row.inventoryRevision,
  })
  const store = {
    createUser: async ({ email, password_hash, legal_version }) => {
      const now = new Date().toISOString()
      const user = {
        id: ++state.nextUserId, email, password_hash, legal_version,
        legal_accepted_at: now, created_at: now,
      }
      state.users.push(user)
      return user
    },
    getUserByEmail: async (email) => state.users.find((user) => user.email === email) || null,
    getUserById: async (id) => {
      const user = state.users.find((candidate) => candidate.id === Number(id))
      return user && {
        id: user.id, email: user.email, legal_version: user.legal_version,
        legal_accepted_at: user.legal_accepted_at, created_at: user.created_at,
      }
    },
    countUsers: async () => state.users.length,
    migrateLegacyDataToUser: async () => {},
    getRpgSave: async (userId) => publicSave(state.saves.get(Number(userId)) || null),
    putRpgSave: async (userId, input) => {
      const uid = Number(userId)
      const current = state.saves.get(uid) || null
      if (current ? current.revision !== input.expectedRevision : input.expectedRevision !== 0) {
        const idempotent = Boolean(
          current
          && current.revision === input.expectedRevision + 1
          && current.gameSchemaVersion === input.gameSchemaVersion
          && JSON.stringify(current.payload) === JSON.stringify(input.payload),
        )
        return { outcome: idempotent ? 'idempotent' : 'conflict', save: publicSave(current) }
      }
      const now = new Date().toISOString()
      const row = {
        payload: clone(input.payload), gameSchemaVersion: input.gameSchemaVersion,
        revision: current ? current.revision + 1 : 1,
        createdAt: current?.createdAt || now, updatedAt: now,
      }
      state.saves.set(uid, row)
      appendHistory(uid, row)
      return { outcome: 'written', save: publicSave(row) }
    },
    listRpgSaveHistory: async (userId) => (state.histories.get(Number(userId)) || []).map(({ payload, ...metadata }) => metadata),
    restoreRpgSave: async (userId, { revision, expectedRevision }) => {
      const uid = Number(userId)
      const current = state.saves.get(uid) || null
      if (!current || current.revision !== expectedRevision) return { outcome: 'conflict', save: publicSave(current) }
      const historical = (state.histories.get(uid) || []).find((row) => row.revision === revision)
      if (!historical) return { outcome: 'not_found', save: publicSave(current) }
      const row = {
        payload: clone(historical.payload), gameSchemaVersion: historical.gameSchemaVersion,
        revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString(),
      }
      state.saves.set(uid, row)
      appendHistory(uid, row)
      return { outcome: 'written', save: publicSave(row) }
    },
    getRpgAuthority: async (userId) => publicAuthority(state.authorities.get(Number(userId)) || null),
    bootstrapRpgAuthority: async (userId, bootstrap) => {
      const uid = Number(userId)
      if (state.saves.has(uid)) return { outcome: 'legacy', authority: null }
      const existing = state.authorities.get(uid)
      if (existing) return { outcome: 'exists', authority: publicAuthority(existing) }
      const row = { ...clone(bootstrap) }
      state.authorities.set(uid, row)
      state.authorityHistory.set(uid, [{ storyRevision: row.storyRevision, story: clone(row.story) }])
      return { outcome: 'bootstrapped', authority: publicAuthority(row) }
    },
    exportUserData: async (userId) => {
      const user = state.users.find((candidate) => candidate.id === Number(userId))
      return {
        schema_version: 1,
        account: user ? { id: user.id, email: user.email } : null,
        rpg_save: publicSave(state.saves.get(Number(userId)) || null),
        rpg_save_history: clone(state.histories.get(Number(userId)) || []),
      }
    },
    deleteUser: async (userId) => {
      const uid = Number(userId)
      const before = state.users.length
      state.users = state.users.filter((user) => user.id !== uid)
      state.saves.delete(uid)
      state.histories.delete(uid)
      state.authorities.delete(uid)
      state.authorityHistory.delete(uid)
      return state.users.length < before
    },
  }
  return { state, store }
})

vi.mock('../server/db.js', () => ({ store: fake.store, backend: 'postgres' }))

let server
let base

async function signup(email) {
  const response = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery', acceptLegal: true }),
  })
  expect(response.status).toBe(201)
  return {
    cookie: (response.headers.get('set-cookie') || '').split(';')[0],
    user: (await response.json()).user,
  }
}

async function request(pathname, { cookie, method = 'GET', body } = {}) {
  return fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

beforeAll(async () => {
  process.env.PORT = '0'
  Object.assign(process.env, {
    ALPHA_INVITE_ONLY: 'false',
    LEGAL_ENTITY_NAME: 'Oathbearer Save Test Operator',
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

// The API's in-memory credential limiter is shared by this integration file.
// Reset its test fixture between cases rather than raising production limits.
beforeEach(() => signupIpLimiter.reset())

describe('RPG save request validation', () => {
  it('accepts the exact versioned envelope and rejects extra ownership, invalid revisions, and non-object payloads', () => {
    expect(validateRpgSavePutBody({ payload: { status: 'playing' }, gameSchemaVersion: 7, expectedRevision: 0 })).toEqual({
      payload: { status: 'playing' }, gameSchemaVersion: 7, expectedRevision: 0,
    })
    expect(() => validateRpgSavePutBody({ payload: {}, gameSchemaVersion: 1, expectedRevision: 0, userId: 999 })).toThrow(/contain only/i)
    expect(() => validateRpgSavePutBody({ payload: [], gameSchemaVersion: 1, expectedRevision: 0 })).toThrow(/payload must be an object/i)
    expect(() => validateRpgSavePutBody({ payload: {}, gameSchemaVersion: 1, expectedRevision: 1.5 })).toThrow(/safe integer/i)
    expect(() => validateRpgSavePutBody({ payload: {}, gameSchemaVersion: 2_147_483_648, expectedRevision: 0 })).toThrow(/32-bit/i)
  })

  it('accepts only the exact restore revision envelope', () => {
    expect(validateRpgSaveRestoreBody({ revision: 1, expectedRevision: 3 })).toEqual({ revision: 1, expectedRevision: 3 })
    expect(() => validateRpgSaveRestoreBody({ revision: 1, expectedRevision: 3, userId: 9 })).toThrow(/contain only/i)
    expect(() => validateRpgSaveRestoreBody({ revision: 0, expectedRevision: 3 })).toThrow(/positive safe integer/i)
  })

  it('enforces a UTF-8 byte ceiling before storage', () => {
    const body = { payload: { note: 'x'.repeat(RPG_SAVE_MAX_BYTES) }, gameSchemaVersion: 1, expectedRevision: 0 }
    try {
      validateRpgSavePutBody(body)
      throw new Error('expected validation failure')
    } catch (error) {
      expect(error.status).toBe(413)
      expect(error.code).toBe('RPG_SAVE_TOO_LARGE')
    }
  })

  it('allows only an empty server-generated authority bootstrap body', () => {
    expect(validateRpgAuthorityBootstrapBody({})).toEqual({})
    expect(() => validateRpgAuthorityBootstrapBody({ inventory: { currency: 999 } })).toThrow(/empty object/i)
    expect(() => validateRpgAuthorityBootstrapBody([])).toThrow(/empty object/i)
  })
})

describe('authenticated RPG save API', () => {
  it('isolates two accounts, rejects stale writes, and treats an exact retry as idempotent', async () => {
    const one = await signup('rpg-one@example.test')
    const two = await signup('rpg-two@example.test')

    expect((await request('/api/rpg/save')).status).toBe(401)
    expect(await (await request('/api/rpg/save', { cookie: one.cookie })).json()).toEqual({ save: null })

    const firstBody = { payload: { act: 1, map: 'beacon-overlook' }, gameSchemaVersion: 3, expectedRevision: 0 }
    const first = await request('/api/rpg/save', { cookie: one.cookie, method: 'PUT', body: firstBody })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ idempotent: false, save: { revision: 1, gameSchemaVersion: 3, payload: firstBody.payload } })
    expect(await (await request('/api/rpg/save', { cookie: two.cookie })).json()).toEqual({ save: null })

    const secondUserWrite = await request('/api/rpg/save', {
      cookie: two.cookie, method: 'PUT',
      body: { payload: { act: 2 }, gameSchemaVersion: 3, expectedRevision: 0 },
    })
    expect((await secondUserWrite.json()).save.revision).toBe(1)
    expect((await (await request('/api/rpg/save', { cookie: one.cookie })).json()).save.payload.act).toBe(1)

    const stale = await request('/api/rpg/save', {
      cookie: one.cookie, method: 'PUT',
      body: { payload: { act: 9 }, gameSchemaVersion: 3, expectedRevision: 0 },
    })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({
      error: 'RPG save revision conflict.', code: 'RPG_SAVE_REVISION_CONFLICT', currentRevision: 1,
    })

    const retry = await request('/api/rpg/save', { cookie: one.cookie, method: 'PUT', body: firstBody })
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({ idempotent: true, save: { revision: 1 } })

    const forged = await request('/api/rpg/save', {
      cookie: two.cookie, method: 'PUT', body: { ...firstBody, userId: one.user.id },
    })
    expect(forged.status).toBe(400)
  })

  it('includes the signed-in save in account export', async () => {
    const account = await signup('rpg-export@example.test')
    await request('/api/rpg/save', {
      cookie: account.cookie, method: 'PUT',
      body: { payload: { quest: 'the-last-name' }, gameSchemaVersion: 4, expectedRevision: 0 },
    })
    const exported = await request('/api/account/export', { cookie: account.cookie })
    expect(exported.status).toBe(200)
    expect(await exported.json()).toMatchObject({
      account: { email: 'rpg-export@example.test' },
      rpg_save: { payload: { quest: 'the-last-name' }, gameSchemaVersion: 4, revision: 1 },
    })
  })

  it('lists metadata-only history and restores only the signed-in account with optimistic concurrency', async () => {
    const owner = await signup('rpg-history-owner@example.test')
    const other = await signup('rpg-history-other@example.test')
    const firstBody = { payload: { checkpoint: 'first' }, gameSchemaVersion: 4, expectedRevision: 0 }
    const secondBody = { payload: { checkpoint: 'second' }, gameSchemaVersion: 4, expectedRevision: 1 }
    await request('/api/rpg/save', { cookie: owner.cookie, method: 'PUT', body: firstBody })
    await request('/api/rpg/save', { cookie: owner.cookie, method: 'PUT', body: secondBody })
    // Exact retry is idempotent and must not create a third restore point.
    await request('/api/rpg/save', { cookie: owner.cookie, method: 'PUT', body: secondBody })

    const historyResponse = await request('/api/rpg/save/history', { cookie: owner.cookie })
    expect(historyResponse.status).toBe(200)
    const history = (await historyResponse.json()).history
    expect(history.map((entry) => entry.revision)).toEqual([2, 1])
    expect(JSON.stringify(history)).not.toContain('checkpoint')
    expect(await (await request('/api/rpg/save/history', { cookie: other.cookie })).json()).toEqual({ history: [] })

    const crossAccount = await request('/api/rpg/save/restore', {
      cookie: other.cookie, method: 'POST', body: { revision: 1, expectedRevision: 0 },
    })
    expect(crossAccount.status).toBe(409)

    const stale = await request('/api/rpg/save/restore', {
      cookie: owner.cookie, method: 'POST', body: { revision: 1, expectedRevision: 1 },
    })
    expect(stale.status).toBe(409)
    expect((await (await request('/api/rpg/save', { cookie: owner.cookie })).json()).save).toMatchObject({
      revision: 2, payload: { checkpoint: 'second' },
    })
    expect((await (await request('/api/rpg/save/history', { cookie: owner.cookie })).json()).history).toHaveLength(2)

    const restored = await request('/api/rpg/save/restore', {
      cookie: owner.cookie, method: 'POST', body: { revision: 1, expectedRevision: 2 },
    })
    expect(restored.status).toBe(200)
    expect(await restored.json()).toMatchObject({ save: { revision: 3, payload: { checkpoint: 'first' } } })
    expect((await (await request('/api/rpg/save/history', { cookie: owner.cookie })).json()).history.map((entry) => entry.revision)).toEqual([3, 2, 1])

    const forged = await request('/api/rpg/save/restore', {
      cookie: owner.cookie, method: 'POST', body: { revision: 1, expectedRevision: 3, userId: other.user.id },
    })
    expect(forged.status).toBe(400)
    const exported = await (await request('/api/account/export', { cookie: owner.cookie })).json()
    expect(exported.rpg_save_history).toHaveLength(3)
    expect(exported.rpg_save_history[0].payload).toEqual({ checkpoint: 'first' })
  })
})

describe('Postgres-only RPG authority v2 API', () => {
  it('bootstraps server-owned state once, isolates accounts, and never promotes a v1 save', async () => {
    const one = await signup('rpg-v2-one@example.test')
    const two = await signup('rpg-v2-two@example.test')

    expect((await request('/api/rpg/save/v2')).status).toBe(401)
    expect(await (await request('/api/rpg/save/v2', { cookie: one.cookie })).json()).toEqual({ save: null })

    const forgedBootstrap = await request('/api/rpg/save/v2', {
      cookie: one.cookie, method: 'POST', body: { inventory: { currency: 999 } },
    })
    expect(forgedBootstrap.status).toBe(400)

    const bootstrapped = await request('/api/rpg/save/v2', { cookie: one.cookie, method: 'POST', body: {} })
    expect(bootstrapped.status).toBe(201)
    const first = await bootstrapped.json()
    expect(first).toMatchObject({ idempotent: false, save: { storyRevision: 1, inventoryRevision: 1 } })
    expect(first.save.story).toEqual(createRpgAuthorityBootstrap().story)
    expect(first.save.state.inventory).toEqual(createRpgAuthorityBootstrap().authoritative.inventory)
    expect(await (await request('/api/rpg/save/v2', { cookie: two.cookie })).json()).toEqual({ save: null })

    const retry = await request('/api/rpg/save/v2', { cookie: one.cookie, method: 'POST', body: {} })
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({ idempotent: true, save: { storyRevision: 1, inventoryRevision: 1 } })
    expect(fake.state.authorityHistory.get(one.user.id)).toHaveLength(1)

    await request('/api/rpg/save', {
      cookie: two.cookie, method: 'PUT', body: { payload: { legacy: true }, gameSchemaVersion: 1, expectedRevision: 0 },
    })
    const legacy = await request('/api/rpg/save/v2', { cookie: two.cookie, method: 'POST', body: {} })
    expect(legacy.status).toBe(409)
    expect(await legacy.json()).toMatchObject({ code: 'RPG_AUTHORITY_LEGACY_PROMOTION_DENIED' })
  })

  it('rejects all client-composed story snapshots, including forged patron and Act V state, without mutating the immutable bootstrap ledger', async () => {
    const account = await signup('rpg-v2-story@example.test')
    const created = await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
    const baseline = await created.json()
    const before = structuredClone(fake.state.authorities.get(account.user.id))
    const forged = structuredClone(baseline.save.story)
    forged.mainQuestId = 'write-the-new-accord'
    forged.flags = { 'rpg:chosen-patron': 'zeus', 'act5:ending': 'renewed-compact' }
    forged.quests = [{ id: 'act5', objectiveIndex: 999, status: 'complete' }]

    const response = await request('/api/rpg/save/v2', {
      cookie: account.cookie,
      method: 'PUT',
      body: { expectedStoryRevision: 1, story: forged, inventory: { currency: 999999 } },
    })
    expect(response.status).toBe(501)
    expect(await response.json()).toMatchObject({ code: 'RPG_AUTHORITY_STORY_COMMANDS_NOT_IMPLEMENTED' })
    expect(fake.state.authorities.get(account.user.id)).toEqual(before)
    expect(fake.state.authorityHistory.get(account.user.id)).toHaveLength(1)

    const staleRetry = await request('/api/rpg/save/v2', {
      cookie: account.cookie, method: 'PUT', body: { expectedStoryRevision: 0, story: forged },
    })
    expect(staleRetry.status).toBe(501)
    expect(fake.state.authorities.get(account.user.id)).toEqual(before)
  })
})

describe('JsonStore RPG save lifecycle', () => {
  it('persists isolated saves, serializes races, exports the row, and deletes it with the account', async () => {
    const { JsonStore } = await vi.importActual('../server/db.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oathbearer-save-'))
    const store = new JsonStore(path.join(dir, 'store.json'))
    try {
      const one = await store.createUser({ email: 'json-one@example.test', password_hash: 'hash' })
      const two = await store.createUser({ email: 'json-two@example.test', password_hash: 'hash' })
      const input = { payload: { act: 1 }, gameSchemaVersion: 2, expectedRevision: 0 }
      expect((await store.putRpgSave(one.id, input)).save.revision).toBe(1)
      expect(await store.putRpgSave(one.id, input)).toMatchObject({ outcome: 'idempotent', save: { revision: 1 } })
      expect(await store.listRpgSaveHistory(one.id)).toHaveLength(1)
      expect(await store.getRpgSave(two.id)).toBeNull()
      expect((await store.putRpgSave(two.id, { ...input, payload: { act: 5 } })).save.payload.act).toBe(5)

      const attempts = await Promise.all([
        store.putRpgSave(one.id, { payload: { checkpoint: 'a' }, gameSchemaVersion: 2, expectedRevision: 1 }),
        store.putRpgSave(one.id, { payload: { checkpoint: 'b' }, gameSchemaVersion: 2, expectedRevision: 1 }),
      ])
      expect(attempts.map((result) => result.outcome).sort()).toEqual(['conflict', 'written'])
      expect((await store.getRpgSave(one.id)).revision).toBe(2)
      expect((await store.exportUserData(one.id)).rpg_save.revision).toBe(2)
      expect((await store.exportUserData(one.id)).rpg_save_history).toHaveLength(2)

      await store.deleteUser(one.id)
      expect(await store.getRpgSave(one.id)).toBeNull()
      expect(await store.listRpgSaveHistory(one.id)).toEqual([])
      expect((await store.getRpgSave(two.id)).payload.act).toBe(5)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('PgStore RPG save contract', () => {
  it('scopes reads and optimistic updates by user and reports the authoritative conflict revision', async () => {
    const { PgStore } = await vi.importActual('../server/db.js')
    const store = new PgStore('postgres://unused')
    const calls = []
    let current = {
      payload: { act: 2 }, game_schema_version: 3, revision: 4,
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:01:00.000Z',
    }
    store.sql = (strings, ...values) => {
      const query = strings.join('?').replace(/\s+/g, ' ').trim()
      calls.push({ query, values })
      if (query.startsWith('select payload')) return current ? [current] : []
      if (query.includes('saved as ( update rpg_saves')) {
        const [payloadJson, gameSchemaVersion, userId, expectedRevision] = values
        expect(userId).toBe(41)
        if (current?.revision !== expectedRevision) return []
        current = {
          ...current, payload: JSON.parse(payloadJson), game_schema_version: gameSchemaVersion,
          revision: current.revision + 1, updated_at: '2026-09-01T00:02:00.000Z',
        }
        return [current]
      }
      throw new Error(`unexpected SQL: ${query}`)
    }

    expect((await store.getRpgSave(41)).revision).toBe(4)
    expect(calls[0].values).toEqual([41])
    const written = await store.putRpgSave(41, {
      payload: { act: 3 }, gameSchemaVersion: 3, expectedRevision: 4,
    })
    expect(written).toMatchObject({ outcome: 'written', save: { revision: 5, payload: { act: 3 } } })
    const retry = await store.putRpgSave(41, {
      payload: { act: 3 }, gameSchemaVersion: 3, expectedRevision: 4,
    })
    expect(retry).toMatchObject({ outcome: 'idempotent', save: { revision: 5 } })
    const stale = await store.putRpgSave(41, {
      payload: { act: 99 }, gameSchemaVersion: 3, expectedRevision: 4,
    })
    expect(stale).toMatchObject({ outcome: 'conflict', save: { revision: 5 } })
    expect(calls.at(-1).values).toEqual([41])
  })
})

describe('Postgres schema lifecycle', () => {
  it('declares one cascaded save per user with JSON, schema version, revision, and timestamps', async () => {
    const schema = await fs.readFile(path.join(process.cwd(), 'schema.sql'), 'utf8')
    expect(schema).toMatch(/create table if not exists rpg_saves/i)
    expect(schema).toMatch(/user_id\s+bigint primary key references users \(id\) on delete cascade/i)
    expect(schema).toMatch(/payload\s+jsonb not null/i)
    expect(schema).toMatch(/game_schema_version\s+integer not null/i)
    expect(schema).toMatch(/revision\s+bigint not null/i)
    expect(schema).toMatch(/created_at\s+timestamptz not null default now\(\)/i)
    expect(schema).toMatch(/updated_at\s+timestamptz not null default now\(\)/i)
    expect(schema).toMatch(/create table if not exists rpg_save_history/i)
    expect(schema).toMatch(/rpg_save_history[\s\S]*user_id\s+bigint not null references users \(id\) on delete cascade/i)
    expect(schema).toMatch(/rpg_save_history[\s\S]*payload\s+jsonb not null/i)
    expect(schema).toMatch(/primary key \(user_id, revision\)/i)
  })
})
