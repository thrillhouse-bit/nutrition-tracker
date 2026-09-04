import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonStore, PgStore } from '../server/db.js'
import { createRpgAuthorityBootstrap } from '../server/rpgAuthority.js'

const dirs = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function storeWithUsers() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oathbearer-history-'))
  dirs.push(dir)
  const store = new JsonStore(path.join(dir, 'store.json'))
  const one = await store.createUser({ email: 'history-one@example.test', password_hash: 'hash' })
  const two = await store.createUser({ email: 'history-two@example.test', password_hash: 'hash' })
  return { store, one, two }
}

describe('JsonStore bounded RPG restore history', () => {
  it('appends exactly once, prunes to twenty, restores as a new revision, exports, and cascades deletion', async () => {
    const { store, one, two } = await storeWithUsers()
    for (let expectedRevision = 0; expectedRevision < 25; expectedRevision += 1) {
      const input = {
        payload: { checkpoint: expectedRevision + 1 },
        gameSchemaVersion: 3,
        expectedRevision,
      }
      expect(await store.putRpgSave(one.id, input)).toMatchObject({ outcome: 'written', save: { revision: expectedRevision + 1 } })
      if (expectedRevision === 0) {
        expect(await store.putRpgSave(one.id, input)).toMatchObject({ outcome: 'idempotent' })
      }
    }
    await store.putRpgSave(two.id, { payload: { checkpoint: 'other' }, gameSchemaVersion: 3, expectedRevision: 0 })

    const history = await store.listRpgSaveHistory(one.id)
    expect(history).toHaveLength(20)
    expect(history.map((entry) => entry.revision)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index))
    expect(history.every((entry) => !Object.hasOwn(entry, 'payload'))).toBe(true)
    expect(await store.listRpgSaveHistory(two.id)).toHaveLength(1)

    const beforeStale = await store.getRpgSave(one.id)
    expect(await store.restoreRpgSave(one.id, { revision: 6, expectedRevision: 24 })).toMatchObject({ outcome: 'conflict' })
    expect(await store.getRpgSave(one.id)).toEqual(beforeStale)
    expect(await store.listRpgSaveHistory(one.id)).toHaveLength(20)

    const restored = await store.restoreRpgSave(one.id, { revision: 6, expectedRevision: 25 })
    expect(restored).toMatchObject({ outcome: 'written', save: { revision: 26, payload: { checkpoint: 6 } } })
    expect((await store.listRpgSaveHistory(one.id)).map((entry) => entry.revision)).toEqual(
      Array.from({ length: 20 }, (_, index) => 26 - index),
    )
    const exported = await store.exportUserData(one.id)
    expect(exported.rpg_save_history).toHaveLength(20)
    expect(exported.rpg_save_history.at(-1)).toMatchObject({ revision: 26, payload: { checkpoint: 6 } })

    await store.deleteUser(one.id)
    expect(await store.listRpgSaveHistory(one.id)).toEqual([])
    expect(await store.listRpgSaveHistory(two.id)).toHaveLength(1)
  })

  it('never restores another account history and does not mutate on a missing revision', async () => {
    const { store, one, two } = await storeWithUsers()
    await store.putRpgSave(one.id, { payload: { owner: 'one' }, gameSchemaVersion: 3, expectedRevision: 0 })
    await store.putRpgSave(two.id, { payload: { owner: 'two' }, gameSchemaVersion: 3, expectedRevision: 0 })
    const before = await store.getRpgSave(two.id)
    expect(await store.restoreRpgSave(two.id, { revision: 99, expectedRevision: 1 })).toMatchObject({ outcome: 'not_found' })
    expect(await store.getRpgSave(two.id)).toEqual(before)
    expect((await store.getRpgSave(one.id)).payload.owner).toBe('one')
  })
})

describe('PgStore restore history SQL contract', () => {
  it('scopes metadata and atomic restore/history insertion to the same user', async () => {
    const store = new PgStore('postgres://unused')
    const calls = []
    store.sql = (strings, ...values) => {
      const query = strings.join('?').replace(/\s+/g, ' ').trim()
      calls.push({ query, values })
      if (query.startsWith('select revision, game_schema_version')) {
        return [{ revision: 8, game_schema_version: 3, created_at: 'created', saved_at: 'saved' }]
      }
      if (query.startsWith('with restored as')) {
        return [{
          payload: { checkpoint: 4 }, game_schema_version: 3, revision: 9,
          created_at: 'created', updated_at: 'restored',
        }]
      }
      throw new Error(`unexpected SQL: ${query}`)
    }

    expect(await store.listRpgSaveHistory(77)).toEqual([{
      revision: 8, gameSchemaVersion: 3, createdAt: 'created', savedAt: 'saved',
    }])
    expect(calls[0].values).toEqual([77])
    expect(await store.restoreRpgSave(77, { revision: 4, expectedRevision: 8 })).toMatchObject({
      outcome: 'written', save: { revision: 9, payload: { checkpoint: 4 } },
    })
    const restore = calls[1]
    expect(restore.query).toContain('insert into rpg_save_history')
    expect(restore.query).toContain('current_save.user_id = ?')
    expect(restore.query).toContain('historical.user_id = ?')
    // Every ownership parameter is derived from the one server-supplied id.
    expect(restore.values.filter((value) => value === 77).length).toBeGreaterThanOrEqual(5)
    expect(restore.values).toContain(8)
    expect(restore.values).toContain(4)
  })
})

describe('PgStore authority bootstrap SQL contract', () => {
  it('creates or repairs the ledger/story pair in one CTE while refusing legacy v1 rows', async () => {
    const store = new PgStore('postgres://unused')
    const calls = []
    store.sql = (strings, ...values) => {
      const query = strings.join('?').replace(/\s+/g, ' ').trim()
      calls.push({ query, values })
      if (query.startsWith('with eligible as')) {
        return [{
          story: { status: 'playing' }, story_revision: 1,
          authoritative: { inventory: {} }, inventory_revision: 1,
        }]
      }
      throw new Error(`unexpected SQL: ${query}`)
    }

    const result = await store.bootstrapRpgAuthority(77, createRpgAuthorityBootstrap())
    expect(result).toMatchObject({ outcome: 'bootstrapped', authority: { storyRevision: 1, inventoryRevision: 1 } })
    const bootstrap = calls[0]
    expect(bootstrap.query).toContain('not exists (select 1 from rpg_saves where user_id = ?)')
    expect(bootstrap.query).toContain('available_ledger as')
    expect(bootstrap.query).toContain('from rpg_authority_ledgers existing')
    expect(bootstrap.query).toContain('on conflict (user_id) do nothing')
    expect(bootstrap.query).toContain('insert into rpg_story_projection_history')
    expect(bootstrap.query).toContain('from story join available_ledger ledger')
    expect(bootstrap.values.filter((value) => value === 77).length).toBeGreaterThanOrEqual(3)
  })

  it('treats a concurrent story-pair completion as an idempotent existing authority', async () => {
    const store = new PgStore('postgres://unused')
    const calls = []
    store.sql = (strings, ...values) => {
      const query = strings.join('?').replace(/\s+/g, ' ').trim()
      calls.push({ query, values })
      if (query.startsWith('with eligible as')) return []
      if (query.startsWith('select projection.story')) {
        return [{
          story: { status: 'playing' }, story_revision: 1,
          authoritative: { inventory: {} }, inventory_revision: 1,
        }]
      }
      throw new Error(`unexpected SQL: ${query}`)
    }

    expect(await store.bootstrapRpgAuthority(88, createRpgAuthorityBootstrap())).toMatchObject({
      outcome: 'exists', authority: { storyRevision: 1, inventoryRevision: 1 },
    })
    expect(calls[0].query).toContain('on conflict (user_id) do nothing')
    expect(calls[1].query).toContain('join rpg_authority_ledgers ledger')
  })
})
