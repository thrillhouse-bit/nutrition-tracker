import { describe, expect, it } from 'vitest'
import { parseArgs, runCleanup } from '../scripts/ownerless-legacy-cleanup.mjs'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

describe('ownerless legacy cleanup operator guard', () => {
  it('only permits a non-destructive preview with a receipt', () => {
    expect(parseArgs(['--preview', '--receipt', 'preview.json'])).toMatchObject({ mode: 'preview', backup: null })
  })

  it('requires an explicit confirmation and a recoverable backup for execution', () => {
    expect(() => parseArgs(['--execute', '--receipt', 'receipt.json'])).toThrow('--confirm-ownerless-cleanup')
    expect(parseArgs(['--execute', '--confirm-ownerless-cleanup', '--backup', 'backup.json', '--receipt', 'receipt.json']))
      .toMatchObject({ mode: 'execute' })
  })

  it('refuses ambiguous mode selection or a preview backup', () => {
    expect(() => parseArgs(['--receipt', 'receipt.json'])).toThrow('exactly one')
    expect(() => parseArgs(['--preview', '--backup', 'backup.json', '--receipt', 'receipt.json'])).toThrow('only valid')
  })

  it('backs up cascaded children and commits all deletes together before a private receipt', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ownerless-test-'))
    const queries = []
    let deleted = false
    const sql = async (query) => {
      queries.push(query)
      if (query.includes('daily_plans')) expect(query).not.toContain('order by id')
      return deleted ? [] : [{ example: 'private-row' }]
    }
    sql.transaction = async (callback) => {
      const backup = JSON.parse(await readFile(path.join(dir, 'backup.json'), 'utf8'))
      expect(backup.rows.oura_workouts).toHaveLength(1)
      expect(backup.rows.garmin_dailies).toHaveLength(1)
      const deletes = callback((query) => query)
      expect(deletes).toHaveLength(6)
      expect(deletes.every((query) => query.endsWith('where user_id is null'))).toBe(true)
      deleted = true
    }
    const args = ['--execute', '--confirm-ownerless-cleanup', '--backup', path.join(dir, 'backup.json'), '--receipt', path.join(dir, 'receipt.json')]
    const result = await runCleanup({ args, databaseUrl: 'test', sqlClient: sql })
    expect(result.total_after).toBe(0)
    expect((await stat(path.join(dir, 'backup.json'))).mode & 0o777).toBe(0o600)
    expect((await stat(path.join(dir, 'receipt.json'))).mode & 0o777).toBe(0o600)
    const queryCount = queries.length
    await expect(runCleanup({ args, databaseUrl: 'test', sqlClient: sql })).rejects.toThrow('must not already exist')
    expect(queries).toHaveLength(queryCount)
  })
})
