// @vitest-environment jsdom
//
// Coverage for the 26 Aug 2026 Today redesign: the compact day-context
// header (date nav + sync/freshness state + a one-sentence day summary or an
// honest alternate message) and the Daily Signals row (Readiness/Sleep/
// Workout read as one connected system). Uses this repo's established raw
// react-dom/client + act() pattern (see test/today-wearable-refresh.test.jsx,
// test/today-energy-balance.test.jsx) — no testing-library dependency.
//
// House rule this file follows throughout: every new diagnostic/gate is
// proven to fire AND proven not to fire when it shouldn't (a sibling
// negative-control test), never asserted only in the abstract.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Today from '../src/components/Today.jsx'
import { api } from '../src/api/client.js'

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

const BASE = { baseline: { calories: 2200 } }

describe('Today header: day-context sentence — live signals', () => {
  it('combines a real readiness band with a real workout clause (product ask\'s own example)', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        readiness: { value: 78, provider: 'oura', freshness: 'fresh', demo: false },
        workout: {
          value: { kind: 'run', intensity: 'easy', time: '5:30 PM', status: 'planned' },
          provider: 'manual', freshness: 'fresh', demo: false,
        },
      },
    })
    expect(el.textContent).toMatch(/Solid recovery\. Easy run planned at 5:30 PM\./)
  })

  it('renders only the workout clause when readiness is absent', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        workout: { value: { label: 'Evening Ride', shortLabel: 'ride', status: 'completed', time: '6:02 AM' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    })
    expect(el.textContent).toMatch(/Evening Ride completed at 6:02 AM\./)
    expect(el.textContent).not.toMatch(/recovery\./)
  })

  it('falls back to a sleep clause when neither readiness nor workout produced one', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { sleep: { value: 7.4, provider: 'oura', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/Slept 7h 24m last night\./)
  })

  it('CONTROL: a demo readiness reading never contributes to the live sentence, even though the card still shows it', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        readiness: { value: 90, provider: 'oura', freshness: 'fresh', demo: true },
        workout: { value: { label: 'Evening Run', shortLabel: 'run', status: 'planned', time: '5:30 PM' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    })
    // The workout is real, so this is still a "live" screen overall — but the
    // demo readiness must never be voiced as "Strong recovery." in the
    // header sentence, only disclosed (as demo) in the Readiness card itself.
    expect(el.textContent).not.toMatch(/Strong recovery\./)
    expect(el.textContent).toMatch(/Evening Run planned at 5:30 PM\./)
    expect(el.textContent).toMatch(/Demo data/)
  })
})

describe('Today header: honest alternate messages — demo-only and no-connection', () => {
  it('shows a sample-data message (not a fabricated sentence) when every present signal is demo', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { readiness: { value: 82, provider: 'oura', freshness: 'fresh', demo: true } },
    })
    expect(el.textContent).toMatch(/Showing sample recovery data/)
    expect(el.textContent).not.toMatch(/Strong recovery\.|Solid recovery\.|Moderate recovery\.|Low recovery\./)
  })

  it('shows a no-connection message with a Connect CTA when nothing is present at all', async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday({ ...BASE, signals: {} }, { onGoToConnections })
    expect(el.textContent).toMatch(/No wearable connected yet/)
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Connect a wearable'))
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    expect(onGoToConnections).toHaveBeenCalledTimes(1)
  })

  it("shows a linked Oura account as connected while today's readings are still pending", async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday({
      ...BASE,
      providers: [{ id: 'oura', name: 'Oura', status: 'connected', demo: false }],
      // A never-connected provider's demo signal may still be present; it
      // must not hide the account-level truth that Oura is linked.
      signals: { workout: { value: { label: 'Evening Run' }, provider: 'garmin', demo: true } },
    }, { onGoToConnections })

    expect(el.textContent).toMatch(/OURA · CONNECTED/)
    expect(el.textContent).toMatch(/Oura is connected — awaiting today's readings\./)
    expect(el.textContent).not.toMatch(/No wearable connected yet|Showing sample recovery data/)
    expect(el.querySelector('[aria-label="Refresh Oura data"]')).toBeTruthy()
    const manage = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Manage connection'))
    expect(manage).toBeTruthy()
    await act(async () => { manage.click() })
    expect(onGoToConnections).toHaveBeenCalledTimes(1)
  })

  it('flags a linked provider that is stale and has no current-day reading', async () => {
    const el = await renderToday({
      ...BASE,
      providers: [{ id: 'oura', name: 'Oura', status: 'stale', demo: false, sync_error: 'refresh_token_expired' }],
      signals: {},
    })
    expect(el.textContent).toMatch(/OURA · NEEDS ATTENTION/)
    expect(el.textContent).toMatch(/recent readings have not arrived/)
    expect(el.textContent).not.toMatch(/No wearable connected yet/)
  })

  it('CONTROL: the Connect CTA does not render when a live signal is present', async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday({
      ...BASE,
      signals: { readiness: { value: 78, provider: 'oura', freshness: 'fresh', demo: false } },
    }, { onGoToConnections })
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Connect a wearable'))
    expect(btn).toBeUndefined()
  })

  it('CONTROL: no alternate message renders once real live data is present', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { readiness: { value: 78, provider: 'oura', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).not.toMatch(/No wearable connected yet|Showing sample recovery data/)
  })
})

describe('Today header: stale real sync', () => {
  const STALE = {
    ...BASE,
    signals: { sleep: { value: 7.0, provider: 'apple', freshness: 'stale', demo: false, recorded_at: new Date(Date.now() - 24 * 3600000).toISOString() } },
  }
  const FRESH = {
    ...BASE,
    signals: { sleep: { value: 7.0, provider: 'apple', freshness: 'fresh', demo: false, recorded_at: new Date().toISOString() } },
  }

  it('flags a stale real signal with STALE + a "Manage connection" action', async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday(STALE, { onGoToConnections })
    expect(el.textContent).toMatch(/STALE/)
    expect(el.textContent).toMatch(/LAST SYNCED/)
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Manage connection'))
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    expect(onGoToConnections).toHaveBeenCalledTimes(1)
  })

  it('CONTROL: a fresh real signal never shows STALE or the Manage-connection action', async () => {
    const el = await renderToday(FRESH, { onGoToConnections: vi.fn() })
    expect(el.textContent).not.toMatch(/STALE/)
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Manage connection'))
    expect(btn).toBeUndefined()
  })

  it('a stale real signal still contributes to the day sentence (staleness is a trust flag, not a demo flag)', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { readiness: { value: 78, provider: 'oura', freshness: 'stale', demo: false } },
    })
    expect(el.textContent).toMatch(/Solid recovery\./)
  })
})

describe('Today header: loading — stable geometry, no premature state', () => {
  it('renders a loading indicator and does NOT claim "no wearable connected" while data is still null', async () => {
    const el = await renderToday(null)
    expect(el.textContent).toMatch(/LOADING/)
    expect(el.textContent).not.toMatch(/No wearable connected yet|Showing sample recovery data/)
  })

  it('CONTROL: once data resolves (even to an empty composite), the loading text is gone', async () => {
    const el = await renderToday({ ...BASE, signals: {} })
    expect(el.textContent).not.toMatch(/LOADING/)
  })
})

describe('Readiness card: plain-language bands', () => {
  it.each([
    [90, 'Strong recovery'],
    [75, 'Solid recovery'],
    [60, 'Moderate recovery'],
    [40, 'Low recovery'],
  ])('renders "%s" as %s', async (score, word) => {
    const el = await renderToday({ ...BASE, signals: { readiness: { value: score, provider: 'oura', freshness: 'fresh', demo: false } } })
    expect(el.textContent).toMatch(word)
  })

  it('shows a compact contributors line when Oura contributor sub-scores are present', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        readiness: {
          value: 78, provider: 'oura', freshness: 'fresh', demo: false,
          contributors: { hrv_balance: 91, resting_heart_rate: 84, body_temperature: 62 },
        },
      },
    })
    expect(el.textContent).toMatch(/HRV 91/)
    expect(el.textContent).toMatch(/RHR 84/)
    expect(el.textContent).toMatch(/Temp 62/)
  })

  it('CONTROL: no contributors line renders when the signal carries none (e.g. a non-Oura or demo reading)', async () => {
    const el = await renderToday({ ...BASE, signals: { readiness: { value: 78, provider: 'oura', freshness: 'fresh', demo: false } } })
    expect(el.textContent).not.toMatch(/HRV \d/)
  })

  it('CONTROL: em-dash and "No data" when readiness is missing, never a fabricated band word', async () => {
    const el = await renderToday({ ...BASE, signals: {} })
    expect(el.textContent).toMatch(/No data/)
    expect(el.textContent).not.toMatch(/recovery/i)
  })
})

describe('Sleep card: duration band', () => {
  it.each([
    [6.4, 'Short night'],
    [7.0, 'Well rested'],
    [9.5, 'Long night'],
  ])('renders "%s" for %sh', async (hours, word) => {
    const el = await renderToday({ ...BASE, signals: { sleep: { value: hours, provider: 'oura', freshness: 'fresh', demo: false } } })
    expect(el.textContent).toMatch(word)
  })
})

describe('Workout card: real link when a destination exists, plain panel otherwise', () => {
  const WORKOUT_DATA = {
    ...BASE,
    signals: { workout: { value: { label: 'Evening Run', shortLabel: 'run', time: '5:30 PM', status: 'planned' }, provider: 'garmin', freshness: 'fresh', demo: false } },
  }

  it('renders as a real button routing to Plan when onGoToPlan is given', async () => {
    const onGoToPlan = vi.fn()
    const el = await renderToday(WORKOUT_DATA, { onGoToPlan })
    const btn = [...el.querySelectorAll('button')].find((b) => /Evening Run/.test(b.getAttribute('aria-label') || ''))
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    expect(onGoToPlan).toHaveBeenCalledTimes(1)
  })

  it('keyboard-only: the workout link is a native <button> reachable by Tab, not a div/span with a fake click handler', async () => {
    const onGoToPlan = vi.fn()
    const el = await renderToday(WORKOUT_DATA, { onGoToPlan })
    const btn = [...el.querySelectorAll('button')].find((b) => /Evening Run/.test(b.getAttribute('aria-label') || ''))
    expect(btn).toBeTruthy()
    expect(btn.tagName).toBe('BUTTON') // native button: Enter/Space activation and Tab reachability are guaranteed by the element itself, not something to re-implement
    expect(btn.disabled).toBe(false)
    expect(btn.tabIndex).not.toBe(-1) // not deliberately removed from tab order
    btn.focus()
    expect(document.activeElement).toBe(btn) // genuinely focusable, not just visually styled to look like a control
  })

  it('CONTROL: without onGoToPlan, the same workout renders as a plain (non-button) panel — never a fake clickable affordance', async () => {
    const el = await renderToday(WORKOUT_DATA)
    const btn = [...el.querySelectorAll('button')].find((b) => /Evening Run/i.test(b.getAttribute('aria-label') || ''))
    expect(btn).toBeUndefined()
    expect(el.textContent).toMatch(/Evening Run/)
  })

  it('offers "Set workout" as the next action when no workout is set and a destination exists', async () => {
    const onGoToPlan = vi.fn()
    const el = await renderToday({ ...BASE, signals: {} }, { onGoToPlan })
    expect(el.textContent).toMatch(/Set workout/)
    const btn = [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes('Set a workout'))
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    expect(onGoToPlan).toHaveBeenCalledTimes(1)
  })

  it('CONTROL: "Set workout" does not render (and nothing is clickable) when there is no destination to go to', async () => {
    const el = await renderToday({ ...BASE, signals: {} })
    expect(el.textContent).toMatch(/No workout set/)
    expect(el.textContent).not.toMatch(/Set workout/)
  })

  it('a long workout name never breaks layout — full text still reaches the DOM (CSS truncation, not data loss)', async () => {
    const longName = 'Sunrise Interval Fartlek Trail Running Session With Hill Repeats'
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: longName, status: 'planned', time: '5:45 PM' }, provider: 'apple', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toContain(longName)
  })

  it('a manual workout\'s intensity + kind forms the subject ("Easy run"), matching the header sentence exactly', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { kind: 'run', intensity: 'easy', time: '5:30 PM', status: 'planned' }, provider: 'manual', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/Easy run/)
  })

  it('shows duration/energy only when real, with an "est." qualifier only for a manual estimate', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Morning Ride', durationMin: 40, estKcal: 380, status: 'completed', time: '6:30 AM' }, provider: 'manual', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/40 min/)
    expect(el.textContent).toMatch(/~380 kcal est\./)
  })

  it('CONTROL: a synced (non-manual) workout\'s energy is never marked "est." — it is the device\'s own reading', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Morning Ride', durationMin: 40, estKcal: 380, status: 'completed', time: '6:30 AM' }, provider: 'garmin', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/~380 kcal/)
    expect(el.textContent).not.toMatch(/est\./)
  })

  it('never fabricates a calorie estimate: a manual workout with a duration but no weight on file shows an honest note instead of a number', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Afternoon Run', durationMin: 30, estKcal: null, status: 'planned', time: '3:00 PM' }, provider: 'manual', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/Add your weight for a calorie estimate/)
    expect(el.textContent).not.toMatch(/~null/)
  })
})

describe('Today: no implicit/hardcoded demo data anywhere in the redesign', () => {
  it('a fully empty composite (no signals, zero entries) never shows a number that was not real', async () => {
    const el = await renderToday({ baseline: { calories: 2200 }, signals: {} }, {})
    // Every Daily Signals reading is an honest em-dash + "No data", never 0
    // or a placeholder figure standing in for a real reading.
    expect(el.textContent).toMatch(/No workout set/)
    const emDashes = [...el.querySelectorAll('.text-faint')].filter((n) => n.textContent.trim() === '—')
    expect(emDashes.length).toBeGreaterThanOrEqual(2) // readiness + sleep
  })
})

// Gap found during a follow-up review (26 Aug 2026): PUT /api/plan/workout
// stores a manual entry with status:'planned' permanently — nothing in this
// app ever flips it to 'completed' after the fact. Viewing a PAST day with
// one would otherwise read "planned at 5:30 PM" forever, a live claim about
// a day already over. "Completed" is a true statement on any day, so only
// the not-yet-completed case needed a past-safe word once the VIEWED day
// (not the workout's own status) has moved into the past.
describe('Historical-day workout tense — never claims a past day is still "planned"', () => {
  const YESTERDAY = new Date(Date.now() - 24 * 3600 * 1000)

  it('a historical day with a not-yet-completed workout reads "logged", never "planned", in the header sentence', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        readiness: { value: 82, provider: 'oura', freshness: 'fresh', demo: false },
        workout: { value: { label: 'Evening Run', shortLabel: 'run', status: 'planned', time: '5:30 PM' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    }, { date: YESTERDAY })
    expect(el.textContent).toMatch(/Evening Run logged at 5:30 PM\./)
    expect(el.textContent).not.toMatch(/planned/i)
  })

  it('CONTROL: the same not-yet-completed workout on TODAY still reads "planned" — the fix is scoped to historical days only', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        readiness: { value: 82, provider: 'oura', freshness: 'fresh', demo: false },
        workout: { value: { label: 'Evening Run', shortLabel: 'run', status: 'planned', time: '5:30 PM' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    }, { date: new Date() })
    expect(el.textContent).toMatch(/Evening Run planned at 5:30 PM\./)
  })

  it('a historical day with a COMPLETED workout still reads "completed" — that stays true regardless of when it\'s read', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        workout: { value: { label: 'Morning Ride', shortLabel: 'ride', status: 'completed', time: '6:02 AM' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    }, { date: YESTERDAY })
    expect(el.textContent).toMatch(/Morning Ride completed at 6:02 AM\./)
    expect(el.textContent).toMatch(/Completed · 6:02 AM/) // the Workout card's own status label, unaffected by the historical-day fix
    expect(el.textContent).not.toMatch(/Logged · 6:02 AM/)
  })

  it('the Workout card\'s own status label also reads "Logged · 5:30 PM" (not "Planned") for a historical day', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Evening Run', shortLabel: 'run', status: 'planned', time: '5:30 PM' }, provider: 'garmin', freshness: 'fresh', demo: false } },
    }, { date: YESTERDAY })
    expect(el.textContent).toMatch(/Logged · 5:30 PM/)
    expect(el.textContent).not.toMatch(/Planned · 5:30 PM/)
  })

  it('CONTROL: the Workout card reads "Planned · 5:30 PM" for the same not-yet-completed workout on TODAY', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Evening Run', shortLabel: 'run', status: 'planned', time: '5:30 PM' }, provider: 'garmin', freshness: 'fresh', demo: false } },
    }, { date: new Date() })
    expect(el.textContent).toMatch(/Planned · 5:30 PM/)
  })
})

// Gap found during the same review: `data == null` was the ONLY signal Today
// used to mean "loading" — but App.jsx also leaves `data` null forever after
// a failed /api/today fetch, so a genuine, permanent failure rendered as an
// eternal loading skeleton with no way to tell the user anything went wrong,
// and no retry action. `dataError` is a new, separate prop precisely so
// "still loading" and "finished and failed" are never the same rendered state.
describe('A genuine /api/today fetch failure gets an honest message and a retry action, never an eternal loading skeleton', () => {
  it('shows an error message and a working retry action when dataError is true', async () => {
    const onChanged = vi.fn()
    const el = await renderToday(null, { dataError: true, onChanged })
    expect(el.textContent).toMatch(/Couldn't load today's data/)
    expect(el.textContent).toMatch(/Try again/)
    const retryBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Try again'))
    expect(retryBtn).toBeTruthy()
    await act(async () => { retryBtn.click() })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('CONTROL: still loading (data null, no error yet) shows the plain loading skeleton, never the error message', async () => {
    const el = await renderToday(null, { dataError: false })
    expect(el.textContent).not.toMatch(/Couldn't load/)
    expect(el.textContent).not.toMatch(/Try again/)
    expect(el.textContent).toMatch(/LOADING/)
  })

  it('CONTROL: a successful load (data present) never shows the error message even if dataError was left stale as true', async () => {
    const el = await renderToday({ ...BASE, signals: {} }, { dataError: true })
    // Real data arriving takes precedence — App.jsx always clears dataError
    // alongside a successful setTodayData, so this is a defense-in-depth
    // control against the two ever disagreeing, not a reachable app state.
    expect(el.textContent).not.toMatch(/Couldn't load/i)
  })
})

describe('Hydration is manual context, never an invented target', () => {
  it('shows the total and explicit no-target language, and quick-add writes a timestamped manual entry', async () => {
    const add = vi.spyOn(api, 'addWaterEntry').mockResolvedValue({ entry: { id: 2 } })
    const onChanged = vi.fn()
    const el = await renderToday({ ...BASE, signals: {}, hydration: { total_ml: 750, entries: [{ id: 1, amount_ml: 750, logged_at: new Date().toISOString() }] } }, { onChanged })
    expect(el.textContent).toMatch(/750 mL/)
    expect(el.textContent).toMatch(/no personalized target/i)
    const quick = [...el.querySelectorAll('button')].find((button) => button.textContent === '+250 mL')
    await act(async () => { quick.click() })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ amount_ml: 250, logged_at: expect.any(String) }))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
