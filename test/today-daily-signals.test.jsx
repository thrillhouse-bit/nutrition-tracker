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

  it('a legacy demo readiness reading is ignored when a real workout exists', async () => {
    const el = await renderToday({
      ...BASE,
      signals: {
        readiness: { value: 90, provider: 'oura', freshness: 'fresh', demo: true },
        workout: { value: { label: 'Evening Run', shortLabel: 'run', status: 'planned', time: '5:30 PM' }, provider: 'garmin', freshness: 'fresh', demo: false },
      },
    })
    expect(el.textContent).not.toMatch(/Strong recovery\./)
    expect(el.textContent).toMatch(/Evening Run planned at 5:30 PM\./)
    expect(el.textContent).not.toMatch(/Demo data|90/)
  })
})

describe('Today information hierarchy', () => {
  it('leads with a strong date and places the daily priority before supporting signals and intake', async () => {
    const el = await renderToday({
      ...BASE,
      recommendation: { title: 'Build a balanced lunch', detail: 'Start with protein and produce.', kind: 'on_track', why: [] },
      signals: { readiness: { value: 78, provider: 'oura', freshness: 'fresh', demo: false } },
    })
    const title = [...el.querySelectorAll('h1')].find((node) => node.textContent === 'Today')
    const priority = el.querySelector('#today-recommendation')
    const signals = [...el.querySelectorAll('h2')].find((node) => node.textContent === 'Daily signals')
    const intake = [...el.querySelectorAll('h2')].find((node) => node.textContent === 'Intake so far')
    expect(title?.className).toContain('font-semibold')
    expect(priority).toBeTruthy()
    expect(priority.compareDocumentPosition(signals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(signals.compareDocumentPosition(intake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps hydration details closed by default and limits Today to the three most recent foods', async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      logged_at: new Date(Date.now() + index * 1000).toISOString(),
      servings_consumed: 1,
      food: { name: `Meal ${index + 1}`, calories: 100 },
    }))
    const el = await renderToday({ ...BASE, signals: {} }, { entries })
    const waterDisclosure = [...el.querySelectorAll('button')].find((node) => node.textContent.includes('More water options'))
    expect(waterDisclosure?.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { waterDisclosure.click() })
    expect(waterDisclosure?.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toMatch(/Latest 3 of 5/)
    expect(el.textContent).not.toMatch(/Meal 1|Meal 2/)
    expect(el.textContent).toMatch(/Meal 3/)
    expect(el.textContent).toMatch(/Meal 4/)
    expect(el.textContent).toMatch(/Meal 5/)
  })
})

describe('Today header: honest food-only and connected-without-data states', () => {
  it('treats a legacy demo-only payload as food-and-hydration mode', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { readiness: { value: 82, provider: 'oura', freshness: 'fresh', demo: true } },
    })
    expect(el.textContent).toMatch(/Fuel \+ hydration mode/i)
    expect(el.textContent).not.toMatch(/Daily signals|Demo data/)
    expect(el.textContent).not.toMatch(/Strong recovery\.|Solid recovery\.|Moderate recovery\.|Low recovery\./)
  })

  it('shows a no-connection message with a Connect CTA when nothing is present at all', async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday({ ...BASE, signals: {} }, { onGoToConnections })
    expect(el.textContent).toMatch(/Food, hydration, and your daily plan work without a wearable/)
    expect(el.textContent).not.toMatch(/Daily signals|No workout set/)
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Connect')
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

    expect(el.textContent).toMatch(/Oura connected/)
    expect(el.textContent).toMatch(/Oura is connected — awaiting today's readings\./)
    expect(el.textContent).not.toMatch(/Daily signals|No wearable connected yet|Showing sample recovery data/)
    expect(el.querySelector('[aria-label="Refresh Oura data"]')).toBeTruthy()
    const manage = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Manage')
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
    expect(el.textContent).toMatch(/Oura needs attention/)
    expect(el.textContent).toMatch(/recent readings have not arrived/)
    expect(el.textContent).not.toMatch(/No wearable connected yet/)
  })

  it('CONTROL: the Connect CTA does not render when a live signal is present', async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday({
      ...BASE,
      signals: { readiness: { value: 78, provider: 'oura', freshness: 'fresh', demo: false } },
    }, { onGoToConnections })
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Connect')
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

  it('flags a stale real signal with a clear attention state and Manage action', async () => {
    const onGoToConnections = vi.fn()
    const el = await renderToday(STALE, { onGoToConnections })
    expect(el.textContent).toMatch(/needs attention/)
    expect(el.textContent).toMatch(/Last synced/)
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Manage')
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    expect(onGoToConnections).toHaveBeenCalledTimes(1)
  })

  it('CONTROL: a fresh real signal never shows the attention or Manage state', async () => {
    const el = await renderToday(FRESH, { onGoToConnections: vi.fn() })
    expect(el.textContent).not.toMatch(/needs attention/)
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Manage')
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
    expect(el.textContent).toMatch(/Updating today/)
    expect(el.textContent).not.toMatch(/No wearable connected yet|Showing sample recovery data/)
  })

  it('CONTROL: once data resolves (even to an empty composite), the loading text is gone', async () => {
    const el = await renderToday({ ...BASE, signals: {} })
    expect(el.textContent).not.toMatch(/Updating today/)
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

  it('CONTROL: omits the strip when every reading is missing, never fabricating a band word', async () => {
    const el = await renderToday({ ...BASE, signals: {} })
    expect(el.textContent).not.toMatch(/Daily signals|No data/)
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

  it('does not show an empty workout cell when no wearable is connected', async () => {
    const onGoToPlan = vi.fn()
    const el = await renderToday({ ...BASE, signals: {} }, { onGoToPlan })
    expect(el.textContent).not.toMatch(/Daily signals|Set workout|No workout set/)
    const btn = [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes('Set a workout'))
    expect(btn).toBeUndefined()
    expect(onGoToPlan).not.toHaveBeenCalled()
  })

  it('also omits the empty workout cell when there is no Plan destination', async () => {
    const el = await renderToday({ ...BASE, signals: {} })
    expect(el.textContent).not.toMatch(/Daily signals|No workout set|Set workout/)
  })

  it('a long workout name never breaks layout — full text still reaches the DOM (CSS truncation, not data loss)', async () => {
    const longName = 'Sunrise Interval Fartlek Trail Running Session With Hill Repeats'
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: longName, status: 'planned', time: '5:45 PM' }, provider: 'apple', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toContain(longName)
  })

  it('manual-only workout context does not impersonate a wearable signal', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { kind: 'run', intensity: 'easy', time: '5:30 PM', status: 'planned' }, provider: 'manual', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/Fuel \+ hydration mode/i)
    expect(el.textContent).not.toMatch(/Daily signals|Easy run/)
  })

  it('keeps manual-only duration and energy out of the wearable strip', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Morning Ride', durationMin: 40, estKcal: 380, status: 'completed', time: '6:30 AM' }, provider: 'manual', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).not.toMatch(/Daily signals|40 min|~380 kcal est\./)
  })

  it('CONTROL: a synced (non-manual) workout\'s energy is never marked "est." — it is the device\'s own reading', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Morning Ride', durationMin: 40, estKcal: 380, status: 'completed', time: '6:30 AM' }, provider: 'garmin', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).toMatch(/~380 kcal/)
    expect(el.textContent).not.toMatch(/est\./)
  })

  it('manual-only missing estimates stay off the wearable strip', async () => {
    const el = await renderToday({
      ...BASE,
      signals: { workout: { value: { label: 'Afternoon Run', durationMin: 30, estKcal: null, status: 'planned', time: '3:00 PM' }, provider: 'manual', freshness: 'fresh', demo: false } },
    })
    expect(el.textContent).not.toMatch(/Add your weight for a calorie estimate/)
    expect(el.textContent).not.toMatch(/~null/)
  })
})

describe('Today: no implicit/hardcoded demo data anywhere in the redesign', () => {
  it('a fully empty composite (no signals, zero entries) never shows a number that was not real', async () => {
    const el = await renderToday({ baseline: { calories: 2200 }, signals: {} }, {})
    expect(el.textContent).toMatch(/Fuel \+ hydration mode/i)
    expect(el.textContent).not.toMatch(/Daily signals|No workout set|Evening Run|82|7\.4/)
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
    expect(el.textContent).toMatch(/Today’s information couldn’t load/)
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
    expect(el.textContent).toMatch(/Updating today/)
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
    expect(el.textContent).toMatch(/No goal set/i)
    const quick = [...el.querySelectorAll('button')].find((button) => button.textContent === '+250 mL')
    await act(async () => { quick.click() })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ amount_ml: 250, logged_at: expect.any(String) }))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
