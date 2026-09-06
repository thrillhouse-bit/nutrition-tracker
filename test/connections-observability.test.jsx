// @vitest-environment jsdom
//
// Connections tab: the 5-state distinction (connected / actively syncing /
// stale / demo / not-configured) and the new sync-observability fields
// (last_attempted_sync, last_sync_counts, sync_error) added alongside
// server/providers.js's providerStatus. Uses the same raw react-dom/client +
// act() pattern as test/today-energy-balance.test.jsx and
// test/insights-gating.test.jsx — this repo has no testing-library
// dependency (see test/today-wearable-refresh.test.jsx / test/planEnergyTarget.test.jsx
// for the same convention on other branches of this codebase).
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    connections: vi.fn(),
    ouraAccounts: vi.fn(() => Promise.resolve({ accounts: [] })),
    garminAccounts: vi.fn(() => Promise.resolve({ accounts: [] })),
    setProvider: vi.fn(() => Promise.resolve({})),
    disconnectOura: vi.fn(() => Promise.resolve({})),
    disconnectGarmin: vi.fn(() => Promise.resolve({})),
    clearSyncedHistory: vi.fn(() => Promise.resolve({ removed: 0 })),
    setInfluence: vi.fn(() => Promise.resolve({ influence: {} })),
    appleToken: vi.fn(() => Promise.resolve({ token: 'tok' })),
    exportAccountData: vi.fn(() => Promise.resolve({ account: {} })),
    deleteAccount: vi.fn(() => Promise.resolve(null)),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Connections } = await import('../src/components/Connections.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) { document.body.removeChild(container); container = null }
  vi.clearAllMocks()
})

async function renderConnections() {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Connections refreshKey={0} onChanged={() => {}} user={{ email: 'a@b.com' }} onLogout={() => {}} />)
  })
  // Flush the mount effect's resolved api.connections()/ouraAccounts()/
  // garminAccounts() promises into a committed render.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  return container
}

// Garmin/Apple fixtures held constant — every test below is about the Oura
// row specifically, so these two are the plainest fixed backdrop (garmin
// genuinely not-configured in every test env here; Apple is disconnected).
const GARMIN_FIXTURE = { id: 'garmin', name: 'Garmin', connect: 'oauth', categories: ['expenditure', 'steps'], status: 'not-configured', demo: false, enabled: true, last_synced_at: null }
const APPLE_FIXTURE = { id: 'apple', name: 'Apple Health', connect: 'ingest', categories: ['workouts', 'active energy', 'exercise', 'sleep', 'heart rate', 'body weight'], status: 'disconnected', demo: false, enabled: true, last_synced_at: null, permissions: null, partial: false }

function ouraFixture(overrides = {}) {
  return {
    id: 'oura', name: 'Oura', connect: 'oauth', categories: ['readiness', 'sleep', 'expenditure', 'steps', 'workouts'],
    status: 'disconnected', demo: false, enabled: true, last_synced_at: null,
    last_attempted_sync: null, last_sync_counts: null, sync_error: null,
    ...overrides,
  }
}

function mockConnections(ouraOverrides = {}) {
  api.connections.mockResolvedValue({
    providers: [ouraFixture(ouraOverrides), GARMIN_FIXTURE, APPLE_FIXTURE],
    influence: { readiness: true, sleep: true, workouts: true },
  })
}

function ouraRow(el) {
  return el.querySelector('[data-provider="oura"]')
}

it('opens the iPhone Garmin bridge and Apple guide without rotating credentials or changing Oura', async () => {
  mockConnections({ status: 'connected', demo: false, last_synced_at: '2026-09-04T12:00:00Z' })
  const el = await renderConnections()
  const originalOura = ouraRow(el).textContent
  const garmin = el.querySelector('[data-provider="garmin"]')
  const button = [...garmin.querySelectorAll('button')].find(b => b.textContent === 'Sync options')
  await act(async () => button.click())
  expect(garmin.textContent).toContain('Android needs the direct Garmin integration')
  expect(garmin.querySelector('a[href="/api/garmin/connect"]')).toBeNull()
  await act(async () => [...garmin.querySelectorAll('button')].find(b => b.textContent === 'Set up Apple Health export').click())
  expect(el.querySelector('[aria-label="Apple Health guided setup"]')).not.toBeNull()
  expect(api.appleToken).not.toHaveBeenCalled()
  expect(api.setProvider).not.toHaveBeenCalled()
  expect(ouraRow(el).textContent).toBe(originalOura)
})

describe('Connections: not-configured is distinct from disconnected', () => {
  it('ignores a legacy demo flag and reports the real not-configured state', async () => {
    mockConnections({ status: 'not-configured', demo: true })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Not configured/)
    expect(row.textContent).not.toMatch(/Demo data/)
    expect(row.textContent).toMatch(/Not set up on this server/)
  })

  it('ignores a legacy demo flag for a disconnected account', async () => {
    mockConnections({ status: 'disconnected', demo: true })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Not connected/)
    expect(row.textContent).not.toMatch(/Demo data/)
    expect(row.textContent).not.toMatch(/Not available on this server/)
  })

  it('not-configured with demo OFF shows "Not configured" as the primary status word (no demo label to override it)', async () => {
    mockConnections({ status: 'not-configured', demo: false })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Not configured/)
  })

  it('never offers a "Connect" action for a not-configured provider — it would 501', async () => {
    mockConnections({ status: 'not-configured', demo: true })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.querySelector('a[href="/api/oura/connect"]')).toBeNull()
    expect(row.textContent).toMatch(/Not available here/)
  })

  it('not-configured with demo turned off explains the server-level gap, distinct from the plain "disconnected" copy', async () => {
    mockConnections({ status: 'not-configured', demo: false })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Not set up on this server/)
    expect(row.textContent).not.toMatch(/Not syncing — recommendations use intake only/) // that's disconnected's line, not this one
  })

  it('CONTROL: an ordinary disconnected Oura (configured, demo off, never connected) still gets the original copy and a working Connect link', async () => {
    mockConnections({ status: 'disconnected', demo: false })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Not syncing — recommendations use intake only/)
    expect(row.querySelector('a[href="/api/oura/connect"]')).toBeTruthy()
  })
})

describe('Connections: actively syncing', () => {
  it('renders the Manage action in its subtle variant and shows the progress meter', async () => {
    mockConnections({ status: 'syncing', demo: false, last_synced_at: new Date(Date.now() - 3600000).toISOString() })
    const el = await renderConnections()
    const row = ouraRow(el)
    const manageBtn = Array.from(row.querySelectorAll('button')).find((b) => /Manage/.test(b.textContent))
    expect(manageBtn).toBeTruthy()
    // ui.jsx's Meter renders a `.bg-track` background element — its presence
    // (rendered only from ProviderRow's `status === 'syncing'` branch) is
    // this test's real assertion, not just the button existing.
    expect(row.querySelector('.bg-track')).toBeTruthy()
    expect(row.textContent).toMatch(/Started/) // syncing's own "Started X ago" line, not "Last sync"
    expect(row.textContent).not.toMatch(/Connect Oura/)
  })

  it('CONTROL: connected (not syncing) shows "Last sync" and no progress meter', async () => {
    mockConnections({ status: 'connected', demo: false, last_synced_at: new Date().toISOString() })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Last sync/)
    expect(row.querySelector('.bg-track')).toBeNull()
  })
})

describe('Connections: stale + the persisted token-refresh failure reason', () => {
  it('translates refresh_token_expired into an actionable, non-technical line with a last-attempt time', async () => {
    mockConnections({
      status: 'stale', demo: false,
      last_synced_at: new Date(Date.now() - 100 * 3600000).toISOString(),
      last_attempted_sync: new Date(Date.now() - 5 * 60000).toISOString(),
      sync_error: 'refresh_token_expired',
    })
    const el = await renderConnections()
    const row = ouraRow(el)
    expect(row.textContent).toMatch(/Authorization expired or was revoked — reconnect to resume/)
    expect(row.textContent).toMatch(/last attempt/)
  })

  it('translates an unclassified Oura API status code into a readable message naming the status', async () => {
    mockConnections({ status: 'stale', demo: false, sync_error: 'oura_api_error_503' })
    const el = await renderConnections()
    expect(ouraRow(el).textContent).toMatch(/Oura API error \(503\) on the last attempt/)
  })

  it('shows no sync_error line at all when there is none (control)', async () => {
    mockConnections({ status: 'stale', demo: false, sync_error: null })
    const el = await renderConnections()
    expect(ouraRow(el).textContent).not.toMatch(/on the last attempt/)
  })
})

describe('Connections: last_sync_counts surfaced in the expanded panel', () => {
  it('shows fetched/accepted/not-new counts once the panel is opened', async () => {
    mockConnections({
      status: 'connected', demo: false,
      last_synced_at: new Date().toISOString(),
      last_sync_counts: { fetched: 30, accepted: 27, deduplicated: 3, at: new Date().toISOString() },
    })
    const el = await renderConnections()
    const row = ouraRow(el)
    const manageBtn = Array.from(row.querySelectorAll('button')).find((b) => /Manage/.test(b.textContent))
    await act(async () => { manageBtn.click() })
    expect(row.textContent).toMatch(/30 fetched/)
    expect(row.textContent).toMatch(/27 accepted/)
    expect(row.textContent).toMatch(/3 not new/)
  })

  it('shows no counts line when none have ever been recorded (control — a fresh connect before any backfill)', async () => {
    mockConnections({ status: 'stale', demo: false, last_sync_counts: null })
    const el = await renderConnections()
    const row = ouraRow(el)
    const manageBtn = Array.from(row.querySelectorAll('button')).find((b) => /Manage/.test(b.textContent))
    await act(async () => { manageBtn.click() })
    expect(row.textContent).not.toMatch(/fetched/)
  })
})

describe('Connections: STATE REFERENCE legend documents live states', () => {
  it('lists Not configured without advertising a demo mode', async () => {
    mockConnections()
    const el = await renderConnections()
    expect(el.textContent).toMatch(/STATE REFERENCE/i)
    expect(el.textContent).not.toMatch(/Demo data/)
    expect(el.textContent).toMatch(/Not configured/)
  })
})
