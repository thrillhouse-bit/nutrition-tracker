import { describe, it, expect } from 'vitest'
import { composeSignals, providerStatus } from '../server/providers.js'
import { computeAdjustedTargets } from '../server/plan.js'

const nowIso = () => new Date().toISOString()

// A store where Oura/Garmin have no data or demo (so Apple is the only live
// source) and Apple carries whatever ingested rows + integration state we pass.
function appleStore({ rows = [], integration = {} } = {}) {
  const integrations = {
    oura: { enabled: true, demo: false, settings: {} },
    garmin: { enabled: true, demo: false, settings: {} },
    apple: { enabled: true, demo: true, settings: {}, ...integration },
    plan: { enabled: true, demo: true, settings: {} },
  }
  return {
    getIntegration: async (id) => integrations[id] || { enabled: true, demo: true, settings: {} },
    listOuraAccounts: async () => [],
    listGarminAccounts: async () => [],
    getGarminDaily: async () => null,
    listAppleSignals: async () => rows,
    updateOuraTokens: async () => {},
  }
}

describe('Apple Health ingested signals flow through the provider-neutral model', () => {
  it('composes Apple workout/sleep/expenditure/hrv with apple provenance, not demo', async () => {
    const rows = [
      { metric: 'workout', value: { label: 'Morning Ride', shortLabel: 'ride', kind: 'ride', time: '7:00 AM', startHour: 7, est_kcal: 480, status: 'completed' }, unit: null, recorded_at: nowIso(), fetched_at: nowIso() },
      { metric: 'sleep', value: 7.1, unit: 'h', recorded_at: nowIso(), fetched_at: nowIso() },
      { metric: 'expenditure', value: 2100, unit: 'kcal', recorded_at: nowIso(), fetched_at: nowIso(), extra: { active: 560 } },
      { metric: 'hrv', value: 68, unit: 'ms', recorded_at: nowIso(), fetched_at: nowIso() },
    ]
    const sig = await composeSignals(appleStore({ rows }), new Date())
    expect(sig.workout.provider).toBe('apple')
    expect(sig.workout.value.kind).toBe('ride')
    expect(sig.sleep.provider).toBe('apple')
    expect(sig.expenditure.provider).toBe('apple')
    expect(sig.hrv.provider).toBe('apple')
    expect(sig.hrv.value).toBe(68)
    expect(sig.workout.demo).toBe(false)
  })
})

describe('Apple provider status (connected / partial / stale / disconnected / demo)', () => {
  const withPerms = (requested, available) => ({
    connected_at: nowIso(), last_synced_at: nowIso(), settings: { permissions: { requested, available } },
  })

  it('is connected with today data and echoes permissions', async () => {
    const rows = [{ metric: 'sleep', value: 7, unit: 'h', recorded_at: nowIso(), fetched_at: nowIso() }]
    const st = await providerStatus(appleStore({ rows, integration: withPerms(['workouts', 'sleep', 'activeEnergy'], ['workouts', 'sleep', 'activeEnergy']) }), 'apple', new Date())
    expect(st.status).toBe('connected')
    expect(st.partial).toBe(false)
    expect(st.permissions.available).toContain('sleep')
  })

  it('flags partial when fewer categories are available than requested', async () => {
    const rows = [{ metric: 'sleep', value: 7, unit: 'h', recorded_at: nowIso(), fetched_at: nowIso() }]
    const st = await providerStatus(appleStore({ rows, integration: withPerms(['workouts', 'sleep', 'hrv'], ['sleep']) }), 'apple', new Date())
    expect(st.status).toBe('connected')
    expect(st.partial).toBe(true)
  })

  it('is stale when a recent sync exists but no data today', async () => {
    const last = new Date(Date.now() - 30 * 3600000).toISOString()
    const st = await providerStatus(appleStore({ rows: [], integration: { connected_at: last, last_synced_at: last } }), 'apple', new Date())
    expect(st.status).toBe('stale')
  })

  it('is disconnected when the last sync is old', async () => {
    const last = new Date(Date.now() - 100 * 3600000).toISOString()
    const st = await providerStatus(appleStore({ rows: [], integration: { connected_at: last, last_synced_at: last } }), 'apple', new Date())
    expect(st.status).toBe('disconnected')
  })

  it('falls back to demo only when the companion never connected', async () => {
    const st = await providerStatus(appleStore({ rows: [] }), 'apple', new Date())
    expect(st.status).toBe('demo')
  })

  it('never reports "denied" — an unavailable category is simply absent', async () => {
    const rows = [{ metric: 'sleep', value: 7, unit: 'h', recorded_at: nowIso(), fetched_at: nowIso() }]
    const st = await providerStatus(appleStore({ rows, integration: withPerms(['sleep', 'hrv'], ['sleep']) }), 'apple', new Date())
    expect(st.permissions.available).not.toContain('hrv')
    expect(JSON.stringify(st.permissions)).not.toMatch(/deni/i)
  })
})

describe('HRV is context-only and never changes targets', () => {
  it('an HRV signal alone produces no target adjustment', () => {
    const baseline = { calories: 2200, protein_g: 165, carbs_g: 220, fat_g: 70 }
    const { adjusted, rationale } = computeAdjustedTargets(baseline, { hrv: { value: 40, provider: 'apple', freshness: 'fresh' } }, {})
    expect(rationale).toHaveLength(0)
    expect(adjusted).toEqual(baseline)
  })
})
