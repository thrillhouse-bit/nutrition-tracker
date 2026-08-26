// @vitest-environment jsdom
//
// Component tests for the wearable "Refresh" capability on Today's recovery/
// training context strip (readiness/sleep/workouts). Scoped by a prior
// investigation into what's technically real per provider:
//
//   - Oura: readiness/sleep are already live-fetched on every /api/today load,
//     but workouts are served from stored oura_workouts rows, only refreshed
//     by connect-time backfill or a daily resync. POST /api/oura/backfill
//     already exists server-side and re-pulls a fresh window live from Oura —
//     it just had no client caller before this change. So Oura gets a real,
//     working "Refresh" button, gated on Oura genuinely being the live
//     (non-demo) source for at least one of the three signals.
//   - Garmin: push-only (webhook-in only, no route asks Garmin for anything)
//     — no button, only true copy about how its data actually arrives.
//   - Apple: no cloud API at all — same treatment as Garmin, different copy.
//
// Uses this repo's established raw react-dom/client + act() pattern (see
// test/today-energy-balance.test.jsx, test/searchFood.test.jsx for the
// pending-promise busy-state idiom) — no testing-library dependency.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: { ouraBackfill: vi.fn() },
}))

const { api } = await import('../src/api/client.js')
const { default: Today } = await import('../src/components/Today.jsx')

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
  vi.resetAllMocks()
})

const noop = () => {}

async function renderToday(data, props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
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
        onChanged={noop}
        {...props}
      />,
    )
  })
  return container
}

const refreshBtn = (el) => el.querySelector('button[aria-label="Refresh Oura data"]')

const OURA_LIVE_READINESS = { baseline: { calories: 2200 }, signals: { readiness: { value: 70, provider: 'oura', freshness: 'fresh', demo: false } } }

describe('Today: Oura refresh button — appears only for a live Oura source', () => {
  it('renders "Refresh" when Oura is the live (non-demo) source for readiness', async () => {
    const el = await renderToday(OURA_LIVE_READINESS)
    expect(refreshBtn(el)).toBeTruthy()
    expect(el.textContent).toMatch(/Refresh/)
  })

  it('renders when Oura is live for sleep or workouts even if readiness is missing', async () => {
    const el = await renderToday({
      baseline: { calories: 2200 },
      signals: { workout: { value: { label: 'Run', shortLabel: 'run' }, provider: 'oura', freshness: 'fresh', demo: false } },
    })
    expect(refreshBtn(el)).toBeTruthy()
  })

  it('does NOT render when every signal is demo (CONTROL — a demo Oura reading is not a live source)', async () => {
    const el = await renderToday({
      baseline: { calories: 2200 },
      signals: { readiness: { value: 82, provider: 'oura', freshness: 'fresh', demo: true }, sleep: { value: 7.4, provider: 'oura', freshness: 'fresh', demo: true } },
    })
    expect(refreshBtn(el)).toBeNull()
    expect(el.textContent).not.toMatch(/Refresh/)
  })

  it('does NOT render when there is no wearable data at all (CONTROL — disconnected/fresh account)', async () => {
    const el = await renderToday({ baseline: { calories: 2200 }, signals: {} })
    expect(refreshBtn(el)).toBeNull()
    expect(el.textContent).not.toMatch(/Refresh/)
  })

  it('does NOT render for a live non-Oura provider alone (e.g. Garmin) (CONTROL)', async () => {
    const el = await renderToday({
      baseline: { calories: 2200 },
      signals: { workout: { value: { label: 'Run', shortLabel: 'run' }, provider: 'garmin', freshness: 'fresh', demo: false } },
    })
    expect(refreshBtn(el)).toBeNull()
  })
})

describe('Today: Oura refresh button — firing behavior', () => {
  it('calls api.ouraBackfill with a small days window and reloads /api/today via onChanged on success', async () => {
    api.ouraBackfill.mockResolvedValue({ ok: true, days: 5, daysSaved: 5, workoutsSaved: 1 })
    const onChanged = vi.fn()
    const el = await renderToday(OURA_LIVE_READINESS, { onChanged })
    const btn = refreshBtn(el)
    await act(async () => { btn.click() })

    expect(api.ouraBackfill).toHaveBeenCalledTimes(1)
    expect(api.ouraBackfill).toHaveBeenCalledWith(expect.any(Number))
    const daysArg = api.ouraBackfill.mock.calls[0][0]
    expect(daysArg).toBeGreaterThan(0)
    expect(daysArg).toBeLessThanOrEqual(30) // a manual "refresh" nudge, not the 90-day connect-time backfill
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows a busy/spinner state while the request is in flight, and disables the button', async () => {
    let resolveBackfill
    api.ouraBackfill.mockReturnValue(new Promise((resolve) => { resolveBackfill = resolve }))
    const el = await renderToday(OURA_LIVE_READINESS)
    const btn = refreshBtn(el)

    await act(async () => { btn.click() })

    expect(btn.disabled).toBe(true)
    expect(btn.textContent).not.toMatch(/Refresh/)
    expect(el.querySelector('.animate-spin')).toBeTruthy()

    await act(async () => { resolveBackfill({ ok: true, daysSaved: 1, workoutsSaved: 0 }) })
    expect(refreshBtn(el).disabled).toBe(false)
    expect(el.textContent).toMatch(/Refresh/)
  })

  it('shows a real error state on failure, and a retry click recovers cleanly (no fabricated success)', async () => {
    const onChanged = vi.fn()
    api.ouraBackfill.mockRejectedValueOnce(new Error('Oura rate limit exceeded'))
    const el = await renderToday(OURA_LIVE_READINESS, { onChanged })
    const btn = refreshBtn(el)

    await act(async () => { btn.click() })
    expect(el.textContent).toMatch(/Oura rate limit exceeded/)
    expect(onChanged).not.toHaveBeenCalled()
    // The button itself must still be usable — an error is not a dead end.
    expect(refreshBtn(el).disabled).toBe(false)

    api.ouraBackfill.mockResolvedValueOnce({ ok: true, daysSaved: 2, workoutsSaved: 0 })
    await act(async () => { refreshBtn(el).click() })
    expect(el.textContent).not.toMatch(/Oura rate limit exceeded/)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})

describe('Today: Garmin — honest push-only copy, never a working refresh', () => {
  const GARMIN_LIVE_WORKOUT = {
    baseline: { calories: 2200 },
    signals: { workout: { value: { label: 'Run', shortLabel: 'run', time: '6:00 AM' }, provider: 'garmin', freshness: 'fresh', demo: false } },
  }

  it('shows the "syncs automatically" caption when Garmin is genuinely the live source for a card', async () => {
    const el = await renderToday(GARMIN_LIVE_WORKOUT)
    expect(el.textContent).toMatch(/Garmin syncs automatically/i)
  })

  it('never renders a button anywhere in the wearable strip for a Garmin-only live source (no fetch-live affordance)', async () => {
    const el = await renderToday(GARMIN_LIVE_WORKOUT)
    // No "Refresh" control at all — Garmin has nothing real to trigger.
    expect(refreshBtn(el)).toBeNull()
    expect(el.textContent).not.toMatch(/Refresh/)
  })

  it('does NOT show the Garmin caption for a demo Garmin workout (CONTROL — demo already discloses itself; this copy is only for a genuine live source)', async () => {
    const el = await renderToday({
      baseline: { calories: 2200 },
      signals: { workout: { value: { label: 'Evening Run', shortLabel: 'run' }, provider: 'garmin', freshness: 'fresh', demo: true } },
    })
    expect(el.textContent).not.toMatch(/Garmin syncs automatically/i)
  })
})

describe('Today: Apple — honest no-cloud-API copy, never a working refresh', () => {
  const APPLE_LIVE_SLEEP = {
    baseline: { calories: 2200 },
    signals: { sleep: { value: 7.1, provider: 'apple', freshness: 'fresh', demo: false } },
  }

  it('shows the "open the companion app" caption when Apple is genuinely the live source for a card', async () => {
    const el = await renderToday(APPLE_LIVE_SLEEP)
    expect(el.textContent).toMatch(/companion app/i)
  })

  it('never renders a button anywhere in the wearable strip for an Apple-only live source', async () => {
    const el = await renderToday(APPLE_LIVE_SLEEP)
    expect(refreshBtn(el)).toBeNull()
    expect(el.textContent).not.toMatch(/Refresh/)
  })

  it('does NOT show the Apple caption for demo Apple data (CONTROL)', async () => {
    const el = await renderToday({
      baseline: { calories: 2200 },
      signals: { sleep: { value: 7.2, provider: 'apple', freshness: 'fresh', demo: true } },
    })
    expect(el.textContent).not.toMatch(/companion app/i)
  })
})

describe('Today: mixed-provider sanity (control) — the strip never conflates providers', () => {
  it('shows the Oura button AND the Garmin caption together when both are genuinely live for different cards, with no cross-talk', async () => {
    const el = await renderToday({
      baseline: { calories: 2200 },
      signals: {
        readiness: { value: 70, provider: 'oura', freshness: 'fresh', demo: false },
        workout: { value: { label: 'Ride', shortLabel: 'ride' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    })
    expect(refreshBtn(el)).toBeTruthy()
    expect(el.textContent).toMatch(/Garmin syncs automatically/i)
    expect(el.textContent).not.toMatch(/companion app/i)
  })
})
