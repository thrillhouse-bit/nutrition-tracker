import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JsonStore } from '../server/db.js'

// JsonStore behavioral contract tests. The JSON store is the dev fallback for
// PgStore and the two must behave identically (routes only ever see `store`).
let dir

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-store-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('JsonStore persist() after a failed write', () => {
  it('writes normally on the healthy path (control)', async () => {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const food = await s.createFood({ name: 'Oats' })
    expect(food.id).toBe(1)
    // The write really landed on disk, not just in memory.
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'store.json'), 'utf8'))
    expect(onDisk.foods).toHaveLength(1)
  })

  it('recovers once the cause of a failed write is gone (queue not poisoned)', async () => {
    const good = path.join(dir, 'store.json')
    const s = new JsonStore(good)
    await s.createFood({ name: 'Oats' }) // healthy first write

    // Force exactly one write failure: writeFile onto a directory path fails.
    s.file = dir
    await expect(s.createFood({ name: 'Bad write' })).rejects.toThrow()

    // The cause is gone — the next persist must succeed, not replay the old
    // rejection forever.
    s.file = good
    const food = await s.createFood({ name: 'Rice' })
    expect(food.name).toBe('Rice')
    const onDisk = JSON.parse(await fs.readFile(good, 'utf8'))
    expect(onDisk.foods.map((f) => f.name)).toContain('Rice')
  })
})

describe('JsonStore logged_at timestamps match PgStore timestamptz semantics', () => {
  const day = { from: '2026-08-24T00:00:00.000Z', to: '2026-08-25T00:00:00.000Z' }

  async function seeded() {
    const s = new JsonStore(path.join(dir, 'store.json'))
    const food = await s.createFood({ name: 'Bread', calories: 100 })
    return { s, food }
  }

  it('includes an offset-timezone timestamp that falls inside the UTC range', async () => {
    const { s, food } = await seeded()
    // 2026-08-25T02:00:00+05:00 === 2026-08-24T21:00:00Z — inside the window.
    // Postgres compares it as a timestamptz and returns it; a raw string
    // comparison sorts it after "2026-08-25T00:00:00.000Z" and drops it.
    await s.addEntry({ food_id: food.id, logged_at: '2026-08-25T02:00:00+05:00' })
    const rows = await s.listEntries(day)
    expect(rows).toHaveLength(1)
    expect(rows[0].logged_at).toBe('2026-08-24T21:00:00.000Z')
  })

  it('still excludes a timestamp genuinely outside the range (control)', async () => {
    const { s, food } = await seeded()
    // 2026-08-25T06:00:00+05:00 === 2026-08-25T01:00:00Z — outside the window.
    await s.addEntry({ food_id: food.id, logged_at: '2026-08-25T06:00:00+05:00' })
    expect(await s.listEntries(day)).toHaveLength(0)
  })

  it('keeps an already-UTC timestamp byte-for-byte (control)', async () => {
    const { s, food } = await seeded()
    const e = await s.addEntry({ food_id: food.id, logged_at: '2026-08-24T12:00:00.000Z' })
    expect(e.logged_at).toBe('2026-08-24T12:00:00.000Z')
    expect(await s.listEntries(day)).toHaveLength(1)
  })

  it('normalizes an offset timestamp set through updateEntry too', async () => {
    const { s, food } = await seeded()
    const e = await s.addEntry({ food_id: food.id, logged_at: '2026-08-24T12:00:00.000Z' })
    // 23:59 in UTC-4 is 03:59Z the next day — the entry must move out of the window.
    await s.updateEntry(e.id, { logged_at: '2026-08-24T23:59:00-04:00' })
    expect(await s.listEntries(day)).toHaveLength(0)
    const next = await s.listEntries({ from: '2026-08-25T00:00:00.000Z', to: '2026-08-26T00:00:00.000Z' })
    expect(next).toHaveLength(1)
    expect(next[0].logged_at).toBe('2026-08-25T03:59:00.000Z')
  })
})
