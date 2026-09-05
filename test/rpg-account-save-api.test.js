import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RPG_SAVE_MAX_BYTES,
  validateRpgSavePutBody,
  validateRpgSaveRestoreBody,
} from '../server/rpgSave.js'
import {
  canonicalRpgJson,
  createRpgAuthorityBootstrap,
  presentRpgAuthority,
  rpgAuthorityCommandDigest,
  validateRpgAuthorityBootstrapBody,
  validateRpgAuthorityCommandBody,
} from '../server/rpgAuthority.js'
import { rpgCommandAccountLimiter, rpgCommandIpLimiter, signupIpLimiter } from '../server/authRateLimit.js'
import { validateMovementEnvelope } from '../server/rpgMovement.js'
import { rpgMapById } from '../control-tower-shift/src/rpg/registry.js'

const fake = vi.hoisted(() => {
  const state = { users: [], saves: new Map(), histories: new Map(), authorities: new Map(), authorityHistory: new Map(), authorityReceipts: new Map(), movementCompletions: new Map(), nextUserId: 0 }
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
    movementRevision: row.movementRevision,
    activePlan: clone(row.activePlan),
    lastMovementResponse: clone(row.lastMovementResponse),
  })
  const commandResponse = (authority, envelope, createdAt = new Date().toISOString()) => ({
    receipt: {
      protocolVersion: 1, commandId: envelope.commandId, idempotencyKey: envelope.idempotencyKey,
      intentDigest: envelope.digest, storyRevision: authority.storyRevision,
      inventoryRevision: authority.inventoryRevision, createdAt,
    },
    story: clone(authority.story),
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
      const row = { ...clone(bootstrap), movementRevision: 1, activePlan: null, lastMovementResponse: null }
      state.authorities.set(uid, row)
      state.authorityHistory.set(uid, [{ storyRevision: row.storyRevision, story: clone(row.story) }])
      return { outcome: 'bootstrapped', authority: publicAuthority(row) }
    },
    getRpgAuthorityCommandReceipt: async (userId, envelope) => {
      const receipt = (state.authorityReceipts.get(Number(userId)) || [])
        .find((entry) => entry.idempotencyKey === envelope.idempotencyKey || entry.commandId === envelope.commandId)
      if (!receipt) return { outcome: 'missing', authority: null }
      if (receipt.idempotencyKey === envelope.idempotencyKey) {
        return receipt.digest === envelope.digest
          ? { outcome: 'replayed', response: clone(receipt.response) }
          : { outcome: 'idempotency_mismatch', authority: null }
      }
      return receipt.digest === envelope.digest
        ? { outcome: 'replayed', response: clone(receipt.response) }
        : { outcome: 'command_id_conflict', authority: null }
    },
    applyRpgAuthorityStoryCommand: async (userId, envelope, next) => {
      const uid = Number(userId)
      const existing = await store.getRpgAuthorityCommandReceipt(uid, envelope)
      if (existing.outcome !== 'missing') return existing
      const current = state.authorities.get(uid)
      if (!current) return { outcome: 'not_found', authority: null }
      if (current.storyRevision !== envelope.expectedStoryRevision || current.inventoryRevision !== envelope.expectedInventoryRevision) return { outcome: 'conflict', authority: null }
      const authority = {
        story: clone(next.story), storyRevision: next.storyRevision,
        authoritative: clone(current.authoritative), inventoryRevision: current.inventoryRevision,
        movementRevision: current.movementRevision, activePlan: clone(current.activePlan), lastMovementResponse: clone(current.lastMovementResponse),
      }
      state.authorities.set(uid, authority)
      state.authorityHistory.set(uid, [{ storyRevision: authority.storyRevision, story: clone(authority.story) }, ...(state.authorityHistory.get(uid) || [])].slice(0, 20))
      const receipts = state.authorityReceipts.get(uid) || []
      const response = commandResponse(authority, envelope)
      receipts.push({ commandId: envelope.commandId, idempotencyKey: envelope.idempotencyKey, digest: envelope.digest, response: clone(response) })
      state.authorityReceipts.set(uid, receipts)
      return { outcome: 'written', response }
    },
    createRpgMovementPlan: async (userId, envelope, plan) => {
      const row = state.authorities.get(Number(userId))
      if (!row) return { outcome: 'not_found' }
      const replay = row.lastMovementResponse
      if (replay?.sequence === envelope.sequence) return replay.digest === envelope.digest
        ? { outcome: 'replayed', response: clone(replay) }
        : { outcome: 'sequence_conflict' }
      if (row.activePlan) return { outcome: 'active_plan' }
      if (row.storyRevision !== envelope.expectedStoryRevision || row.inventoryRevision !== envelope.expectedInventoryRevision
        || row.movementRevision !== envelope.expectedMovementRevision || row.story.world.mapId !== plan.mapId
        || JSON.stringify(row.story.world.position) !== JSON.stringify(plan.origin)) return { outcome: 'conflict' }
      if (envelope.sequence !== (row.lastMovementResponse?.sequence || 0) + 1) return { outcome: 'sequence_conflict' }
      const rebasedPlan = { ...clone(plan), startedAtMs: 1_700_000_000_000 }
      row.movementRevision += 1
      row.activePlan = rebasedPlan
      row.lastMovementResponse = {
        protocolVersion: 1, sequence: envelope.sequence, digest: envelope.digest,
        storyRevision: row.storyRevision, inventoryRevision: row.inventoryRevision,
        movementRevision: row.movementRevision, plan: rebasedPlan,
      }
      return { outcome: 'written', response: clone(row.lastMovementResponse) }
    },
    getRpgMovementCompletionReceipt: async (userId, envelope) => {
      const receipt = state.movementCompletions.get(Number(userId))?.get(envelope.sequence)
      if (!receipt) return { outcome: 'missing' }
      return receipt.planDigest === envelope.planDigest ? { outcome: 'replayed', response: clone(receipt.response) } : { outcome: 'conflict' }
    },
    completeRpgMovementPlan: async (userId, envelope, completion) => {
      const uid = Number(userId); const row = state.authorities.get(uid)
      const existing = await store.getRpgMovementCompletionReceipt(uid, envelope)
      if (existing.outcome !== 'missing') return existing
      if (!row?.activePlan || row.lastMovementResponse.digest !== envelope.planDigest || row.lastMovementResponse.sequence !== envelope.sequence) return { outcome: 'conflict' }
      if (completion.position.x !== row.activePlan.target.x || completion.position.y !== row.activePlan.target.y) return { outcome: 'in_progress' }
      row.story = { ...row.story, world: { ...row.story.world, position: clone(completion.position), facing: completion.facing } }
      row.storyRevision += 1; row.movementRevision += 1; row.activePlan = null
      const response = { protocolVersion: 1, sequence: envelope.sequence, planDigest: envelope.planDigest, storyRevision: row.storyRevision, inventoryRevision: row.inventoryRevision, movementRevision: row.movementRevision, position: clone(completion.position), facing: completion.facing, complete: true }
      const receipts = state.movementCompletions.get(uid) || new Map(); receipts.set(envelope.sequence, { planDigest: envelope.planDigest, response: clone(response) }); state.movementCompletions.set(uid, receipts)
      return { outcome: 'written', response }
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
      state.authorityReceipts.delete(uid)
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
beforeEach(() => {
  signupIpLimiter.reset()
  rpgCommandAccountLimiter.reset()
  rpgCommandIpLimiter.reset()
})

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

  it('accepts only the exact story-command envelope and allowlisted reducer commands', () => {
    const body = { protocolVersion: 1, commandId: 'accept-1', idempotencyKey: 'key-1', expectedStoryRevision: 1, expectedInventoryRevision: 1, command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' } }
    expect(validateRpgAuthorityCommandBody(body)).toMatchObject({ command: { type: 'ACCEPT_QUEST' } })
    expect(() => validateRpgAuthorityCommandBody({ ...body, inventory: {} })).toThrow()
    expect(() => validateRpgAuthorityCommandBody({ ...body, command: { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-introduction' } })).toThrow()
    expect(() => validateRpgAuthorityCommandBody({ ...body, command: { type: 'ACCEPT_QUEST', questId: body.command.questId, entityId: body.command.entityId } })).toThrow()
    expect(() => validateRpgAuthorityCommandBody({ ...body, command: { ...body.command, currency: 9 } })).toThrow()
  })

  it('accepts only the exact versioned target-only movement envelope', () => {
    const body = {
      protocolVersion: 1, sequence: 1, expectedStoryRevision: 1,
      expectedInventoryRevision: 1, expectedMovementRevision: 1,
      intent: { type: 'MOVE_INTENT', target: { x: 300, y: 300 } },
    }
    expect(validateMovementEnvelope(body)).toMatchObject({ ok: true, envelope: { sequence: 1, intent: { type: 'MOVE_INTENT' } } })
    expect(validateMovementEnvelope({ ...body, commandId: 'forged' })).toEqual({ ok: false, code: 'MOVEMENT_ENVELOPE_INVALID' })
    expect(validateMovementEnvelope({ ...body, intent: { ...body.intent, origin: { x: 0, y: 0 } } })).toEqual({ ok: false, code: 'MOVEMENT_ENVELOPE_INVALID' })
  })

  it('hashes the complete typed envelope in canonical key order', () => {
    const body = { protocolVersion: 1, commandId: 'accept-1', idempotencyKey: 'key-1', expectedStoryRevision: 1, expectedInventoryRevision: 1, command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' } }
    const parsed = validateRpgAuthorityCommandBody(body)
    const reordered = validateRpgAuthorityCommandBody({ ...body, command: { trigger: 'talk', entityId: 'ianthe-chartwright', questId: 'cq-act2-ianthe-open-chart', type: 'ACCEPT_QUEST' } })
    expect(rpgAuthorityCommandDigest(parsed)).toBe(rpgAuthorityCommandDigest(reordered))
    expect(canonicalRpgJson({ b: 1, a: { d: true, c: null } })).toBe('{"a":{"c":null,"d":true},"b":1}')
    expect(rpgAuthorityCommandDigest({ ...parsed, expectedStoryRevision: 2 })).toBe(parsed.digest)
    expect(rpgAuthorityCommandDigest({ ...parsed, idempotencyKey: 'key-2' })).toBe(parsed.digest)
    expect(rpgAuthorityCommandDigest({ ...parsed, command: { ...parsed.command, trigger: 'station' } })).not.toBe(parsed.digest)
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
    expect(first.save.state.wayfinding).toEqual(createRpgAuthorityBootstrap().authoritative.wayfinding)
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

  it('replays one physical quest acceptance from an immutable receipt before stale revision checks', async () => {
    const account = await signup('rpg-v2-command@example.test')
    expect((await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body: {} })).status).toBe(400)
    expect((await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body: {
      protocolVersion: 1, commandId: 'accept-1', idempotencyKey: 'key-1', expectedStoryRevision: 1, expectedInventoryRevision: 1,
      command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
    } })).status).toBe(404)

    await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
    const row = fake.state.authorities.get(account.user.id)
    row.story.world = { regionId: 'pelagos-isles', mapId: 'chartwright-hall', spawnId: 'from-pelagos', position: { x: 290, y: 286 }, facing: 0 }
    const ledgerBefore = structuredClone(row.authoritative)
    const body = {
      protocolVersion: 1, commandId: 'accept-1', idempotencyKey: 'key-1', expectedStoryRevision: 1, expectedInventoryRevision: 1,
      command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
    }
    const written = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body })
    expect(written.status).toBe(201)
    const first = await written.json()
    expect(first).toMatchObject({
      receipt: { protocolVersion: 1, commandId: 'accept-1', idempotencyKey: 'key-1', storyRevision: 2, inventoryRevision: 1 },
      story: { quests: { 'cq-act2-ianthe-open-chart': { state: 'active', objectiveIndex: 0 } } },
    })
    expect(JSON.stringify(first)).not.toContain('authoritative')
    expect(JSON.stringify(first.story)).not.toContain('inventory')
    expect(fake.state.authorities.get(account.user.id).authoritative).toEqual(ledgerBefore)
    expect(fake.state.authorities.get(account.user.id).inventoryRevision).toBe(1)

    const staleRetry = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body })
    expect(staleRetry.status).toBe(200)
    expect(await staleRetry.json()).toEqual(first)

    const sameIntentNewKey = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body: { ...body, idempotencyKey: 'key-2', expectedStoryRevision: 2 } })
    expect(sameIntentNewKey.status).toBe(200)
    expect(await sameIntentNewKey.json()).toEqual(first)

    const keyMismatch = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body: { ...body, command: { ...body.command, trigger: 'station' } } })
    expect(keyMismatch.status).toBe(409)
    expect(await keyMismatch.json()).toMatchObject({ code: 'RPG_AUTHORITY_IDEMPOTENCY_CONFLICT' })
    const commandIdMismatch = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body: { ...body, idempotencyKey: 'other-key', command: { ...body.command, trigger: 'station' } } })
    expect(commandIdMismatch.status).toBe(409)
    expect(await commandIdMismatch.json()).toMatchObject({ code: 'RPG_AUTHORITY_COMMAND_ID_CONFLICT' })

    const staleNewCommand = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body: { ...body, commandId: 'accept-2', idempotencyKey: 'key-3' } })
    expect(staleNewCommand.status).toBe(409)
    expect(fake.state.authorityHistory.get(account.user.id)).toHaveLength(2)
    expect(fake.state.authorityReceipts.get(account.user.id)).toHaveLength(1)
  })

  it('stores one rebased movement plan, replays its sequence exactly, and never moves the story projection', async () => {
    const account = await signup('rpg-v2-movement@example.test')
    expect((await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })).status).toBe(201)
    const row = fake.state.authorities.get(account.user.id)
    const map = rpgMapById(row.story.world.mapId)
    const target = map.entities.find((entity) => entity.id === 'beacon-bank')
    const beforeStory = structuredClone(row.story)
    const body = {
      protocolVersion: 1, sequence: 1, expectedStoryRevision: 1,
      expectedInventoryRevision: 1, expectedMovementRevision: 1,
      intent: { type: 'MOVE_INTENT', target: { x: target.x, y: target.y } },
    }
    const written = await request('/api/rpg/save/v2/movement', { cookie: account.cookie, method: 'POST', body })
    expect(written.status).toBe(201)
    const first = await written.json()
    expect(first).toMatchObject({ movement: { sequence: 1, storyRevision: 1, inventoryRevision: 1, movementRevision: 2, plan: { target: { x: target.x, y: target.y } } } })
    expect(first.movement.plan.startedAtMs).toBe(1_700_000_000_000)
    expect(row.story).toEqual(beforeStory)
    expect(row.inventoryRevision).toBe(1)
    const spent = [...rpgCommandAccountLimiter.entries.values()][0]?.count

    const replay = await request('/api/rpg/save/v2/movement', { cookie: account.cookie, method: 'POST', body })
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(first)
    expect([...rpgCommandAccountLimiter.entries.values()][0]?.count).toBe(spent)
    const changed = await request('/api/rpg/save/v2/movement', {
      cookie: account.cookie, method: 'POST', body: { ...body, intent: { type: 'MOVE_INTENT', target: { x: target.x - 20, y: target.y } } },
    })
    expect(changed.status).toBe(409)
    const next = await request('/api/rpg/save/v2/movement', {
      cookie: account.cookie, method: 'POST', body: { ...body, sequence: 2, expectedMovementRevision: 2 },
    })
    expect(next.status).toBe(409)
    expect(await next.json()).toMatchObject({ code: 'MOVEMENT_ACTIVE_PLAN' })
    expect([...rpgCommandAccountLimiter.entries.values()][0]?.count).toBe(spent)
  })

  it('overlays and terminally settles a movement once, preserving M2 replay and canonical ledger', async () => {
    const account = await signup('rpg-v2-arrive@example.test')
    await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
    const row = fake.state.authorities.get(account.user.id); const map = rpgMapById(row.story.world.mapId)
    const target = map.entities.find((entity) => entity.id === 'beacon-bank')
    const move = { protocolVersion: 1, sequence: 1, expectedStoryRevision: 1, expectedInventoryRevision: 1, expectedMovementRevision: 1, intent: { type: 'MOVE_INTENT', target: { x: target.x, y: target.y } } }
    const planned = await request('/api/rpg/save/v2/movement', { cookie: account.cookie, method: 'POST', body: move })
    const planResponse = await planned.json(); const before = structuredClone(row.story)
    const get = await request('/api/rpg/save/v2', { cookie: account.cookie })
    expect(get.status).toBe(200); expect(get.headers.get('cache-control')).toContain('no-store')
    expect((await get.json()).movementOverlay).toMatchObject({ sequence: 1, planDigest: planResponse.movement.digest, complete: true })
    expect(row.story).toEqual(before)
    const arrive = { protocolVersion: 1, sequence: 1, planDigest: planResponse.movement.digest, expectedStoryRevision: 1, expectedInventoryRevision: 1, expectedMovementRevision: 2 }
    const responses = await Promise.all([request('/api/rpg/save/v2/movement/arrive', { cookie: account.cookie, method: 'POST', body: arrive }), request('/api/rpg/save/v2/movement/arrive', { cookie: account.cookie, method: 'POST', body: arrive })])
    expect(responses.map((item) => item.status).sort()).toEqual([200, 201])
    const bodies = await Promise.all(responses.map((item) => item.json())); expect(bodies[0]).toEqual(bodies[1])
    expect(row.story.world.position).toEqual({ x: target.x, y: target.y }); expect(row.inventoryRevision).toBe(1); expect(row.activePlan).toBeNull()
    const m2Replay = await request('/api/rpg/save/v2/movement', { cookie: account.cookie, method: 'POST', body: move })
    expect(m2Replay.status).toBe(200); expect(await m2Replay.json()).toEqual(planResponse)
  })

  it('keeps a no-plan v2 read canonical and rejects malformed or mismatched arrival identities', async () => {
    const account = await signup('rpg-v2-arrive-negative@example.test')
    await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
    const empty = await request('/api/rpg/save/v2', { cookie: account.cookie })
    expect((await empty.json()).movementOverlay).toBeUndefined()
    const malformed = await request('/api/rpg/save/v2/movement/arrive', { cookie: account.cookie, method: 'POST', body: { protocolVersion: 1, sequence: 1 } })
    expect(malformed.status).toBe(422)
    const noPlan = await request('/api/rpg/save/v2/movement/arrive', { cookie: account.cookie, method: 'POST', body: { protocolVersion: 1, sequence: 1, planDigest: 'a'.repeat(64), expectedStoryRevision: 1, expectedInventoryRevision: 1, expectedMovementRevision: 1 } })
    expect(noPlan.status).toBe(409)
  })

  it('fails corrupt bootstrap and movement state before presentation or limiter consumption', async () => {
    const account = await signup('rpg-v2-corrupt-movement@example.test')
    const originalBootstrap = fake.store.bootstrapRpgAuthority
    const originalGet = fake.store.getRpgAuthority
    try {
      fake.store.bootstrapRpgAuthority = async () => ({ outcome: 'exists', authority: { corruptMovement: true } })
      const bootstrap = await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
      expect(bootstrap.status).toBe(409); expect(await bootstrap.json()).toMatchObject({ code: 'MOVEMENT_INTEGRITY_INVALID' })
      fake.store.getRpgAuthority = async () => ({ corruptMovement: true })
      const move = await request('/api/rpg/save/v2/movement', { cookie: account.cookie, method: 'POST', body: { protocolVersion: 1, sequence: 1, expectedStoryRevision: 1, expectedInventoryRevision: 1, expectedMovementRevision: 1, intent: { type: 'MOVE_INTENT', target: { x: 300, y: 300 } } } })
      expect(move.status).toBe(422); expect(await move.json()).toMatchObject({ code: 'MOVEMENT_INTEGRITY_INVALID' })
      expect(rpgCommandAccountLimiter.entries.size).toBe(0)
    } finally { fake.store.bootstrapRpgAuthority = originalBootstrap; fake.store.getRpgAuthority = originalGet }
  })

  it('serializes concurrent same-key deliveries into one write and one receipt replay', async () => {
    const account = await signup('rpg-v2-command-race@example.test')
    await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
    const row = fake.state.authorities.get(account.user.id)
    row.story.world = { regionId: 'pelagos-isles', mapId: 'chartwright-hall', spawnId: 'from-pelagos', position: { x: 290, y: 286 }, facing: 0 }
    const body = {
      protocolVersion: 1, commandId: 'accept-race', idempotencyKey: 'race-key', expectedStoryRevision: 1, expectedInventoryRevision: 1,
      command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
    }
    const responses = await Promise.all([
      request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body }),
      request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body }),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201])
    const payloads = await Promise.all(responses.map((response) => response.json()))
    expect(payloads[0]).toEqual(payloads[1])
    expect(fake.state.authorityHistory.get(account.user.id)).toHaveLength(2)
    expect(fake.state.authorityReceipts.get(account.user.id)).toHaveLength(1)
  })

  it('scopes command receipts to the authenticated account', async () => {
    const one = await signup('rpg-v2-command-owner@example.test')
    const two = await signup('rpg-v2-command-other@example.test')
    const body = {
      protocolVersion: 1, commandId: 'shared-command', idempotencyKey: 'shared-key', expectedStoryRevision: 1, expectedInventoryRevision: 1,
      command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
    }
    for (const account of [one, two]) {
      await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
      const row = fake.state.authorities.get(account.user.id)
      row.story.world = { regionId: 'pelagos-isles', mapId: 'chartwright-hall', spawnId: 'from-pelagos', position: { x: 290, y: 286 }, facing: 0 }
    }
    expect((await request('/api/rpg/save/v2/commands', { cookie: one.cookie, method: 'POST', body })).status).toBe(201)
    const second = await request('/api/rpg/save/v2/commands', { cookie: two.cookie, method: 'POST', body })
    expect(second.status).toBe(201)
    expect((await second.json()).receipt.commandId).toBe('shared-command')
    expect(fake.state.authorityReceipts.get(one.user.id)).toHaveLength(1)
    expect(fake.state.authorityReceipts.get(two.user.id)).toHaveLength(1)
  })

  it('limits command persistence per authenticated account without writing a blocked command', async () => {
    const originalMax = rpgCommandAccountLimiter.max
    rpgCommandAccountLimiter.max = 1
    try {
      const account = await signup('rpg-v2-command-account-limit@example.test')
      const anonymous = await request('/api/rpg/save/v2/commands', {
        method: 'POST',
        body: {
          protocolVersion: 1, commandId: 'anonymous-command', idempotencyKey: 'anonymous-key', expectedStoryRevision: 1, expectedInventoryRevision: 1,
          command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
        },
      })
      expect(anonymous.status).toBe(401)
      expect(rpgCommandAccountLimiter.entries.size).toBe(0)
      expect(rpgCommandIpLimiter.entries.size).toBe(0)

      const oversized = await fetch(`${base}/api/rpg/save/v2/commands`, {
        method: 'POST', headers: { Cookie: account.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(5_000) }),
      })
      expect(oversized.status).toBe(413)
      expect(rpgCommandAccountLimiter.entries.size).toBe(0)
      expect(rpgCommandIpLimiter.entries.size).toBe(0)

      await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
      const row = fake.state.authorities.get(account.user.id)
      row.story.world = { regionId: 'pelagos-isles', mapId: 'chartwright-hall', spawnId: 'from-pelagos', position: { x: 290, y: 286 }, facing: 0 }
      const body = {
        protocolVersion: 1, commandId: 'account-limit-1', idempotencyKey: 'account-limit-key-1', expectedStoryRevision: 1, expectedInventoryRevision: 1,
        command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
      }
      const written = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body })
      expect(written.status).toBe(201)
      const first = await written.json()
      const retry = await request('/api/rpg/save/v2/commands', { cookie: account.cookie, method: 'POST', body })
      expect(retry.status).toBe(200)
      expect(await retry.json()).toEqual(first)
      const blocked = await request('/api/rpg/save/v2/commands', {
        cookie: account.cookie, method: 'POST', body: { ...body, commandId: 'account-limit-2', idempotencyKey: 'account-limit-key-2' },
      })
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(await blocked.json()).toEqual({ error: 'Too many attempts. Try again later.' })
      expect(fake.state.authorityHistory.get(account.user.id)).toHaveLength(2)
      expect(fake.state.authorityReceipts.get(account.user.id)).toHaveLength(1)
    } finally {
      rpgCommandAccountLimiter.max = originalMax
      rpgCommandAccountLimiter.reset()
    }
  })

  it('limits command persistence per IP across distinct authenticated accounts', async () => {
    const originalMax = rpgCommandIpLimiter.max
    rpgCommandIpLimiter.max = 1
    try {
      const one = await signup('rpg-v2-command-ip-limit-one@example.test')
      const two = await signup('rpg-v2-command-ip-limit-two@example.test')
      for (const account of [one, two]) {
        await request('/api/rpg/save/v2', { cookie: account.cookie, method: 'POST', body: {} })
        const row = fake.state.authorities.get(account.user.id)
        row.story.world = { regionId: 'pelagos-isles', mapId: 'chartwright-hall', spawnId: 'from-pelagos', position: { x: 290, y: 286 }, facing: 0 }
      }
      const body = {
        protocolVersion: 1, commandId: 'ip-limit-command', idempotencyKey: 'ip-limit-key', expectedStoryRevision: 1, expectedInventoryRevision: 1,
        command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
      }
      expect((await request('/api/rpg/save/v2/commands', { cookie: one.cookie, method: 'POST', body })).status).toBe(201)
      const blocked = await request('/api/rpg/save/v2/commands', { cookie: two.cookie, method: 'POST', body })
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(fake.state.authorityHistory.get(two.user.id)).toHaveLength(1)
      expect(fake.state.authorityReceipts.get(two.user.id)).toBeUndefined()
    } finally {
      rpgCommandIpLimiter.max = originalMax
      rpgCommandIpLimiter.reset()
    }
  })

  it('presents ledger-owned Wayfinding across trusted v2 reads and rejects malformed or split ownership rows', () => {
    const bootstrap = createRpgAuthorityBootstrap()
    const authoritative = structuredClone(bootstrap.authoritative)
    authoritative.wayfinding = {
      discoveries: { 'pelagos-harbor-soundings': { discoveredAtTick: 5 } },
      practices: { 'pelagos-harbor-soundings': { lastAwardedTick: 5, count: 0 } },
      shortcuts: { 'shortcut:pelagos-chartwright-hall': true },
    }
    const trusted = presentRpgAuthority({ ...bootstrap, authoritative })
    expect(trusted.state.wayfinding).toEqual(authoritative.wayfinding)
    expect(trusted.story.wayfinding).toBeUndefined()

    const malformed = structuredClone(authoritative)
    malformed.wayfinding.shortcuts['shortcut:archive-return-course'] = true
    expect(() => presentRpgAuthority({ ...bootstrap, authoritative: malformed })).toThrow(/invalid/i)

    const oldStory = { ...bootstrap.story, wayfinding: { discoveries: {}, practices: {}, shortcuts: {} } }
    const oldLedger = Object.fromEntries(Object.entries(bootstrap.authoritative).filter(([key]) => key !== 'wayfinding'))
    expect(presentRpgAuthority({ ...bootstrap, story: oldStory, authoritative: oldLedger }).state.wayfinding).toEqual({ discoveries: {}, practices: {}, shortcuts: {} })
    expect(() => presentRpgAuthority({ ...bootstrap, story: { ...oldStory, wayfinding: authoritative.wayfinding }, authoritative: oldLedger })).toThrow(/invalid/i)
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

  it('writes v2 command receipt, story, history, and audit in one locked statement without rereading authority', async () => {
    const { PgStore } = await vi.importActual('../server/db.js')
    const store = new PgStore('postgres://unused')
    const calls = []
    const bootstrap = createRpgAuthorityBootstrap()
    const envelope = validateRpgAuthorityCommandBody({
      protocolVersion: 1, commandId: 'accept-pg', idempotencyKey: 'receipt-pg', expectedStoryRevision: 1, expectedInventoryRevision: 1,
      command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
    })
    store.sql = (strings, ...values) => {
      const query = strings.join('?').replace(/\s+/g, ' ').trim()
      calls.push({ query, values })
      return [{
        written_command_id: envelope.commandId, written_idempotency_key: envelope.idempotencyKey, written_digest: envelope.digest,
        written_response_story: bootstrap.story, written_story_revision: 2, written_inventory_revision: 1,
        written_created_at: '2026-09-04T00:00:00.000Z',
      }]
    }
    const result = await store.applyRpgAuthorityStoryCommand(41, envelope, { story: bootstrap.story, storyRevision: 2, inventoryRevision: 1 })
    expect(result).toMatchObject({
      outcome: 'written',
      response: { receipt: { commandId: 'accept-pg', intentDigest: envelope.digest, storyRevision: 2, inventoryRevision: 1 }, story: bootstrap.story },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].query).toContain('for update of p, l')
    expect(calls[0].query).toContain('locked.story_revision = ?')
    expect(calls[0].query).toContain('locked.inventory_revision = ?')
    expect(calls[0].query).toContain('story_revision = p.story_revision + 1')
    expect(calls[0].query).toContain('insert into rpg_story_projection_history')
    expect(calls[0].query).toContain('insert into rpg_story_command_audit')
    expect(calls[0].query).toContain('insert into rpg_story_command_receipts')
    expect(calls[0].query).toContain('on conflict do nothing')
    expect(calls[0].query).not.toContain('interval')
    expect(calls[0].values).toContain(41)
    expect(calls[0].values).toContain(envelope.expectedStoryRevision)
    expect(calls[0].values).toContain(envelope.expectedInventoryRevision)
  })

  it('fresh-reads the immutable receipt after a concurrent statement snapshot has no written row', async () => {
    const { PgStore } = await vi.importActual('../server/db.js')
    const store = new PgStore('postgres://unused')
    const bootstrap = createRpgAuthorityBootstrap()
    const envelope = validateRpgAuthorityCommandBody({
      protocolVersion: 1, commandId: 'accept-raced-pg', idempotencyKey: 'receipt-raced-pg', expectedStoryRevision: 1, expectedInventoryRevision: 1,
      command: { type: 'ACCEPT_QUEST', questId: 'cq-act2-ianthe-open-chart', entityId: 'ianthe-chartwright', trigger: 'talk' },
    })
    const calls = []
    store.sql = (strings, ...values) => {
      const query = strings.join('?').replace(/\s+/g, ' ').trim()
      calls.push({ query, values })
      if (query.startsWith('with locked')) return [{}]
      if (query.startsWith('select command_id')) return [{
        command_id: envelope.commandId, idempotency_key: envelope.idempotencyKey, command_digest: envelope.digest,
        response_story: bootstrap.story, story_revision: 2, inventory_revision: 1, created_at: '2026-09-04T00:00:00.000Z',
      }]
      throw new Error(`unexpected SQL: ${query}`)
    }
    const result = await store.applyRpgAuthorityStoryCommand(73, envelope, { story: bootstrap.story, storyRevision: 2, inventoryRevision: 1 })
    expect(result).toMatchObject({ outcome: 'replayed', response: { receipt: { commandId: envelope.commandId, storyRevision: 2 }, story: bootstrap.story } })
    expect(calls).toHaveLength(2)
    expect(calls[1].query).toContain('from rpg_story_command_receipts')
    expect(calls[1].values).toContain(73)
    expect(calls[1].values).toContain(envelope.idempotencyKey)
    expect(calls[1].values).toContain(envelope.commandId)
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
    expect(schema).toMatch(/create table if not exists rpg_story_command_receipts/i)
    expect(schema).toMatch(/rpg_story_command_receipts[\s\S]*primary key \(user_id, command_id\)/i)
    expect(schema).toMatch(/rpg_story_command_receipts[\s\S]*unique \(user_id, idempotency_key\)/i)
    expect(schema).toMatch(/rpg_story_command_receipts[\s\S]*response_story\s+jsonb not null/i)
  })
})
