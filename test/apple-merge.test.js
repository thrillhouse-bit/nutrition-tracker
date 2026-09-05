import { describe, it, expect } from 'vitest'
import { JsonStore, PgStore } from '../server/db.js'
import { mapHealthAutoExportPayload } from '../server/appleHealthAutoExport.js'

const row = (metric, value, at = '2026-09-05T07:00:00-07:00') => ({ metric, value, recorded_at: at, fetched_at: '2026-09-05T16:00:00Z' })

describe('partial Apple export merge', () => {
  it('metadata and toggle writes cannot overwrite a concurrent token rotation', async () => {
    const store = new JsonStore('unused')
    store.data = { integrations: {} }
    store.persist = async () => {}
    await store.setIntegration(1, 'apple', { settings: { ingest_token: 'revoked' } })
    await Promise.all([
      store.setIntegration(1, 'apple', { settings: { ingest_token: 'current' } }),
      store.setIntegration(1, 'apple', { last_synced_at: '2026-09-05T17:00:00Z', settings: { permissions: { available: ['workouts'] } } }),
      store.setIntegration(1, 'apple', { enabled: false }),
    ])
    const saved = await store.getIntegration(1, 'apple')
    expect(saved.settings.ingest_token).toBe('current')
    expect(saved.settings.permissions.available).toEqual(['workouts'])
    expect(saved.enabled).toBe(false)
    expect(saved.last_synced_at).toBe('2026-09-05T17:00:00Z')
  })
  it('preserves workouts, metrics, other days/accounts; concurrent retries do not duplicate', async () => {
    const store = new JsonStore('unused')
    store.data = { wearable_signals: [] }
    store.persist = async () => {}
    await store.mergeAppleSignals(2, '2026-09-05', [row('steps', 22)])
    await store.mergeAppleSignals(1, '2026-09-04', [row('steps', 44)])
    await Promise.all([
      store.mergeAppleSignals(1, '2026-09-05', [row('workout', { kind: 'run' })]),
      store.mergeAppleSignals(1, '2026-09-05', [row('steps', 55)]),
      store.mergeAppleSignals(1, '2026-09-05', [row('workout', { kind: 'run' })]),
      store.mergeAppleSignals(1, '2026-09-05', [row('workout', { kind: 'ride' }, '2026-09-05T09:00:00-07:00')]),
    ])
    await store.mergeAppleSignals(1, '2026-09-05', [])
    await store.mergeAppleSignals(1, '2026-09-05', [row('steps', 1, '2026-09-05T06:00:00-07:00')])
    expect(await store.listAppleSignals(1, '2026-09-05')).toHaveLength(3)
    expect((await store.listAppleSignals(1, '2026-09-05')).find(r => r.metric === 'steps').value).toBe(55)
    expect(await store.listAppleSignals(2, '2026-09-05')).toHaveLength(1)
    expect(await store.listAppleSignals(1, '2026-09-04')).toHaveLength(1)
  })

  it('serializes PostgreSQL merge transactions before touching rows', async () => {
    const store = new PgStore('unused')
    store.sql = { transaction: async build => {
      const queries = build((strings, ...values) => ({ text: strings.join('?'), values }))
      expect(queries[0].text).toContain('pg_advisory_xact_lock')
      expect(queries[1].text).toContain('and metric =')
      expect(queries[2].text).toContain('not exists')
    } }
    expect(await store.mergeAppleSignals(1, '2026-09-05', [row('steps', 55)])).toBe(1)
  })

  it('keeps actual offsets, local days and overnight duration; rejects undated samples', () => {
    const mapped = mapHealthAutoExportPayload({ data: {
      workouts: [{ start: '2026-09-04 23:30:00 -0700', end: '2026-09-05 00:30:00 -0700' }],
      metrics: [{ name: 'steps', data: [{ date: '2026-09-04 23:00:00 -0700', qty: 5 }, { date: '2026-09-05 01:00:00 -0700', qty: 2 }, { qty: 999 }] }],
    } }, '2026-09-06')
    expect(mapped.samples).toHaveLength(3)
    expect(mapped.samples[0].day).toBe('2026-09-04')
    expect(mapped.samples[0].recorded_at).toBe('2026-09-04T23:30:00-07:00')
    expect(mapped.samples[0].value.duration_min).toBe(60)
    expect(mapped.samples.map(s => s.day)).toEqual(['2026-09-04', '2026-09-04', '2026-09-05'])
  })
})
