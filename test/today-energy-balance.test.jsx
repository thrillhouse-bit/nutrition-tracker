// @vitest-environment jsdom
//
// The "Energy balance" card (calories in vs. wearable expenditure out = net
// deficit/surplus, plus steps) has been in README since the original Oura
// integration (123d951) but the "Fueling-intelligence" redesign (d2e0829)
// never carried it into the rebuilt Today.jsx — signals.expenditure/
// signals.steps kept flowing through /api/today (composeSignals, already
// carrying demo/freshness/provenance) with no surface rendering them. These
// tests cover the three states the rest of Today's context strip already
// distinguishes: a real (non-demo) reading, a demo reading, and missing data
// (provider disabled / never connected with demo off) — the last one must
// render an em-dash, never a silent zero.
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Today from '../src/components/Today.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    document.body.removeChild(container)
    container = null
  }
})

const noop = () => {}

function renderToday(data, entries = []) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <Today
        date={new Date()}
        data={data}
        entries={entries}
        loading={false}
        online
        syncing={false}
        pendingCount={0}
        onSync={noop}
        onEditEntry={noop}
        onDeleteEntry={noop}
        onPrevDay={noop}
        onNextDay={noop}
        onToday={noop}
        openAdd={noop}
        onViewLog={noop}
      />,
    )
  })
  return container.textContent
}

const FOOD_ENTRY = (calories) => ({
  id: 1,
  servings_consumed: 1,
  logged_at: new Date().toISOString(),
  food: { name: 'Test food', calories },
})

describe('Today: Energy balance card', () => {
  it('renders in/out/net from a real (non-demo) expenditure signal, plus steps', () => {
    const text = renderToday(
      {
        baseline: { calories: 2200 },
        signals: {
          expenditure: { value: 2500, provider: 'garmin', freshness: 'fresh', demo: false },
          steps: { value: 8341, provider: 'garmin', freshness: 'fresh', demo: false },
        },
      },
      [FOOD_ENTRY(1800)],
    )
    expect(text).toMatch(/Energy balance/)
    expect(text).toMatch(/1,800|1800/) // in
    expect(text).toMatch(/2,500|2500/) // out
    expect(text).toMatch(/700/) // |1800 - 2500| = 700
    expect(text).toMatch(/Deficit/) // 1800 - 2500 < 0
    expect(text).toMatch(/8,341|8341/) // steps
    expect(text).toMatch(/Garmin/)
  })

  it('renders a surplus when logged intake exceeds expenditure', () => {
    const text = renderToday(
      {
        baseline: { calories: 2200 },
        signals: { expenditure: { value: 1900, provider: 'oura', freshness: 'fresh', demo: false } },
      },
      [FOOD_ENTRY(2400)],
    )
    expect(text).toMatch(/500/) // 2400 - 1900
    expect(text).toMatch(/Surplus/)
  })

  it('labels a demo expenditure reading as demo, never presenting it as live', () => {
    const text = renderToday(
      {
        baseline: { calories: 2200 },
        signals: { expenditure: { value: 1820, provider: 'garmin', freshness: 'fresh', demo: true } },
      },
      [FOOD_ENTRY(1000)],
    )
    expect(text).toMatch(/Demo/i)
  })

  it('shows an em-dash, not a silent zero, when expenditure is unavailable', () => {
    const text = renderToday(
      { baseline: { calories: 2200 }, signals: {} },
      [FOOD_ENTRY(1000)],
    )
    expect(text).toMatch(/Energy balance/)
    expect(text).toMatch(/No data/i)
    expect(text).not.toMatch(/Surplus|Deficit/)
  })
})
