// @vitest-environment jsdom
//
// Regression test for the Insights-tab gating bug found in the 25 Aug 2026
// UI/UX review: a single `data.insufficientData` flag — computed purely from
// the FOOD-LOGGING streak (`tracked < 3`) — was gating the entire body of
// the tab, hiding the Readiness section even when the server had already
// sent real Oura/Garmin readiness history in the very same response.
// Reproduced live: seeding a user with zero food entries but 7 real days of
// readiness history returned `insufficientData: true` alongside
// `ouraReadiness.length: 7` from the real API — proving the data path works
// and the client was discarding it. The Readiness section already had its
// own honest `readiness.length >= 2` branch (a real chart vs. an "Awaiting
// connected history" placeholder); it just never got a chance to run.
//
// The fix scopes `insufficientData` to only the nutrition-dependent stats
// card + Energy chart. This test proves BOTH directions (house rule: prove
// the control, not only the mutation) — the readiness data now renders
// despite insufficientData=true, AND the nutrition-only parts still
// correctly show the "not enough data" message in that same state.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    insights: vi.fn(),
    signals: vi.fn(() => Promise.resolve({ signals: null })),
    getProfile: vi.fn(() => Promise.resolve({ profile: null })),
    logWeight: vi.fn(),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Insights } = await import('../src/components/Insights.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    document.body.removeChild(container)
    container = null
  }
  vi.clearAllMocks()
})

// Shaped exactly like the real /api/insights response reproduced live:
// insufficientData is true (0 food-log days), but ouraReadiness carries 7
// real seeded days and weight carries 5 — both fully independent of food
// logging.
const REAL_RESPONSE_ZERO_FOOD_DAYS = {
  insufficientData: true,
  nutrition: { trackedDays: 0, avgCalories: 0, avgProtein: 0, onTargetDays: 0 },
  days: [],
  correlations: { available: false, note: null },
  ouraReadiness: Array.from({ length: 7 }).map((_, i) => ({
    date: `2026-08-1${i}`,
    score: 60 + i,
  })),
  weight: Array.from({ length: 5 }).map((_, i) => ({
    day: `2026-08-1${i}`,
    kg: 80 - i * 0.1,
    trend: 79.8 - i * 0.05,
  })),
}

async function renderInsights() {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Insights refreshKey={0} />)
  })
  // Flush the effect's resolved promise into a committed render.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return container
}

describe('Insights: per-section gating (not one coarse insufficientData wall)', () => {
  it('renders the real Readiness chart even when insufficientData is true', async () => {
    api.insights.mockResolvedValue(REAL_RESPONSE_ZERO_FOOD_DAYS)
    const el = await renderInsights()

    // The real ReadinessChart draws an <svg> inside the Readiness section —
    // it must be present, not the "Awaiting connected history" placeholder,
    // proving the section rendered off its own >= 2 real days rather than
    // being swallowed by the food-logging gate. Scoped to the Readiness
    // <section> specifically (not a page-wide text search): Training load
    // legitimately shows that same placeholder copy when it has no workout
    // data of its own, which this fixture doesn't seed.
    const readinessSection = Array.from(el.querySelectorAll('section')).find((s) => /readiness/i.test(s.textContent))
    expect(readinessSection).toBeTruthy()
    expect(readinessSection.textContent).not.toContain('Awaiting connected history')
    expect(readinessSection.querySelector('svg')).toBeTruthy()
  })

  it('CONTROL: still shows the "not enough data" message for the nutrition-only stats/Energy parts in that same state', async () => {
    api.insights.mockResolvedValue(REAL_RESPONSE_ZERO_FOOD_DAYS)
    const el = await renderInsights()

    // The gate must still apply to the parts that are actually about the
    // food-logging streak — this proves the fix narrowed the gate rather
    // than removing it outright.
    expect(el.textContent).toContain('Not enough data yet')
    expect(el.textContent).not.toContain('Avg calories')
  })

  it('renders the nutrition stats/Energy section once the streak is real, with no leftover "not enough data" message', async () => {
    api.insights.mockResolvedValue({
      ...REAL_RESPONSE_ZERO_FOOD_DAYS,
      insufficientData: false,
      nutrition: { trackedDays: 5, avgCalories: 2100, avgProtein: 140, onTargetDays: 3 },
      days: Array.from({ length: 5 }).map((_, i) => ({ date: `2026-08-1${i}`, totals: { calories: 2000 + i * 20 } })),
    })
    const el = await renderInsights()

    expect(el.textContent).toContain('Avg calories')
    expect(el.textContent).not.toContain('Not enough data yet')
  })
})
