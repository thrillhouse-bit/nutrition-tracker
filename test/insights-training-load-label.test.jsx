// @vitest-environment jsdom
//
// Regression test for the Training Load label-mismatch bug: the section
// header derived its provider label from signals?.workout?.provider — the
// PREFERENCE-ordered live signal for TODAY (server/providers.js orders
// workout ['garmin', 'apple', 'oura']) — while the chart it labels
// (data.workoutLoad, server/index.js) is aggregated exclusively from
// store.listAppleWorkoutHistory, never Garmin or Oura. A user with a live
// Garmin connection but real retained Apple Health workout history saw
// "Training load · Garmin" over a chart built entirely from Apple data.
// Fixed by deriving the label from the chart's own data (workoutLoad.length)
// instead of the unrelated live-signal object. Proves both directions
// (house rule: prove the control, not only the mutation) — the label reads
// "Apple Health" when there's real chart data regardless of what the live
// signal claims, AND still reads bare "Training load" / "No source
// connected" when there's no chart data, even when a live signal exists.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    insights: vi.fn(),
    signals: vi.fn(),
    getAfpProfile: vi.fn(() => Promise.resolve({ profile: null })),
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

const BASE_RESPONSE = {
  insufficientData: false,
  nutrition: { trackedDays: 5, avgCalories: 2100, avgProtein: 140, onTargetDays: 3 },
  days: Array.from({ length: 5 }).map((_, i) => ({ date: `2026-08-1${i}`, totals: { calories: 2000 + i * 20 } })),
  correlations: { available: false, note: null },
  targets: { calories: 0, protein_g: 0, hasTargets: false },
  onTargetDetail: [],
  ouraReadiness: [],
  weight: [],
}

// A live Garmin workout signal — the exact shape that won server/providers.js's
// PREFERENCE order and used to leak into the Training Load label.
const SIGNALS_LIVE_GARMIN_WORKOUT = {
  signals: {
    workout: { value: 'Evening Run', unit: 'activity', provider: 'garmin', recorded_at: '2026-08-26T12:00:00Z', fetched_at: '2026-08-26T12:00:00Z' },
  },
}

async function renderInsights() {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Insights refreshKey={0} />)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return container
}

function trainingLoadSection(el) {
  return Array.from(el.querySelectorAll('section')).find((s) => /training load/i.test(s.textContent))
}

describe('Insights: Training Load label reflects the chart\'s real source, not the live signal', () => {
  it('reads "Apple Health" when real Apple workout history is charted, even though the live signal is Garmin', async () => {
    api.signals.mockResolvedValue(SIGNALS_LIVE_GARMIN_WORKOUT)
    api.insights.mockResolvedValue({
      ...BASE_RESPONSE,
      workoutLoad: Array.from({ length: 5 }).map((_, i) => ({ date: `2026-08-1${i}`, minutes: 30 + i, sessions: 1 })),
    })
    const el = await renderInsights()

    const section = trainingLoadSection(el)
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('Training load · Apple Health')
    expect(section.textContent).not.toContain('Garmin')
  })

  it('CONTROL: stays bare "Training load" / "No source connected" with no chart data, even though the live signal is Garmin', async () => {
    api.signals.mockResolvedValue(SIGNALS_LIVE_GARMIN_WORKOUT)
    api.insights.mockResolvedValue({ ...BASE_RESPONSE, workoutLoad: [] })
    const el = await renderInsights()

    const section = trainingLoadSection(el)
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('No source connected')
    expect(section.textContent).not.toContain('Apple Health')
    expect(section.textContent).not.toContain('Garmin')
  })
})
