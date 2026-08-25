// @vitest-environment jsdom
//
// The Sleep context cell has only ever shown duration (hours/minutes) — the
// demo scenario (server/providers.js's demoSignals) already anticipated a
// `score` field on the sleep signal (sig(7.4, { score: 78, ... })), but
// nothing populated it for real data until this pass wired daily_sleep's
// 0-100 quality score through. These tests cover the small UI addition:
// the score renders when present, and — the house rule this codebase keeps
// re-learning — is genuinely ABSENT rather than a fabricated number when a
// provider only ever supplies duration.
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

function renderToday(data) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <Today
        date={new Date()}
        data={data}
        entries={[]}
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

describe('Today: Sleep context cell score', () => {
  it('shows the daily_sleep quality score alongside duration when present', () => {
    const text = renderToday({
      baseline: { calories: 2200 },
      signals: { sleep: { value: 7.4, score: 82, provider: 'oura', freshness: 'fresh', demo: false } },
    })
    expect(text).toMatch(/7h/)
    expect(text).toMatch(/Score 82/)
  })

  it('never shows a score line when the provider only supplies duration (control)', () => {
    const text = renderToday({
      baseline: { calories: 2200 },
      signals: { sleep: { value: 7.4, provider: 'garmin', freshness: 'fresh', demo: false } }, // no score field at all
    })
    expect(text).toMatch(/7h/)
    expect(text).not.toMatch(/Score/)
  })

  it('shows no sleep reading at all (em-dash, no score) when sleep is missing entirely (control)', () => {
    const text = renderToday({ baseline: { calories: 2200 }, signals: {} })
    expect(text).not.toMatch(/Score/)
  })
})
