// @vitest-environment jsdom
//
// Component tests for the manual-workout calorie estimate (src/components/
// Plan.jsx): WorkoutForm's new intensity picker, and Plan's own display of
// the computed estKcal / the honest "no weight on file" state. Same raw
// react-dom/client + act() pattern as test/afpPlanUI.test.jsx and
// test/today-energy-balance.test.jsx — this repo has no testing-library
// dependency.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    planToday: vi.fn(),
    setWorkout: vi.fn(() => Promise.resolve({ workout: {} })),
    clearWorkout: vi.fn(() => Promise.resolve({})),
    setInfluence: vi.fn(() => Promise.resolve({ influence: {} })),
    setTargets: vi.fn(() => Promise.resolve({})),
    // AdaptiveFuelPlan is rendered unconditionally at the top of Plan — give
    // it just enough to settle into its own "not set up yet" empty state so
    // it doesn't error, without pulling its own test fixtures into this file.
    afpPlan: vi.fn(() => Promise.resolve({ plan: { ok: false, missing: [] }, progress: null, frozen: false, recomputed: true, overrides: null })),
    listAfpWorkouts: vi.fn(() => Promise.resolve({ workouts: [] })),
    getAfpProfile: vi.fn(() => Promise.resolve({ profile: { units_pref: 'imperial', weight_kg: null, height_cm: null, age_years: null } })),
    getProfile: vi.fn(() => Promise.resolve({ profile: null })),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Plan, WorkoutForm } = await import('../src/components/Plan.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) { document.body.removeChild(container); container = null }
  vi.clearAllMocks()
})

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function renderInto(el) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(el) })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return container
}

/* ------------------------------------------------------------------ */
/* WorkoutForm in isolation                                            */
/* ------------------------------------------------------------------ */

describe('WorkoutForm: intensity picker', () => {
  it('defaults to moderate and submits it even when the user never touches the field', async () => {
    const onSaved = vi.fn()
    const el = await renderInto(<WorkoutForm onCancel={() => {}} onSaved={onSaved} />)

    const intensitySelect = Array.from(el.querySelectorAll('label')).find((l) => /Intensity/.test(l.textContent))?.querySelector('select')
    expect(intensitySelect).toBeTruthy()
    expect(intensitySelect.value).toBe('moderate')

    const timeInput = el.querySelector('input[type="time"]')
    await act(async () => { setInputValue(timeInput, '17:30') })
    const form = el.querySelector('form')
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })

    expect(api.setWorkout).toHaveBeenCalledTimes(1)
    expect(api.setWorkout.mock.calls[0][0].intensity).toBe('moderate')
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('sends the intensity the user picks (hard)', async () => {
    const el = await renderInto(<WorkoutForm onCancel={() => {}} onSaved={() => {}} />)
    const intensitySelect = Array.from(el.querySelectorAll('label')).find((l) => /Intensity/.test(l.textContent)).querySelector('select')
    await act(async () => { setSelectValue(intensitySelect, 'hard') })

    const timeInput = el.querySelector('input[type="time"]')
    await act(async () => { setInputValue(timeInput, '06:00') })
    const form = el.querySelector('form')
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })

    expect(api.setWorkout.mock.calls[0][0].intensity).toBe('hard')
  })

  it('pre-fills intensity from `initial` when editing an existing manual workout', async () => {
    const el = await renderInto(
      <WorkoutForm initial={{ kind: 'ride', startHour: 8, durationMin: 45, intensity: 'easy' }} onCancel={() => {}} onSaved={() => {}} />,
    )
    const intensitySelect = Array.from(el.querySelectorAll('label')).find((l) => /Intensity/.test(l.textContent)).querySelector('select')
    expect(intensitySelect.value).toBe('easy')
  })
})

/* ------------------------------------------------------------------ */
/* Plan's display of the computed / missing estimate                   */
/* ------------------------------------------------------------------ */

const BASELINE = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 }

// Mirrors what providers.js's manual-workout override actually produces:
// signals.workout = { value: <the stored workout object>, provider: 'manual', freshness, demo: false }.
function planWithManualWorkout(workoutValue) {
  return {
    date: '2026-08-25',
    baseline: BASELINE,
    adjusted: BASELINE,
    rationale: [],
    influence: { readiness: true, sleep: true, workouts: true },
    signals: {
      workout: { value: workoutValue, provider: 'manual', freshness: 'fresh', demo: false },
    },
  }
}

async function renderPlan() {
  return renderInto(<Plan date={new Date('2026-08-25T12:00:00.000Z')} refreshKey={0} onChanged={() => {}} />)
}

describe('Plan: manual workout calorie estimate display', () => {
  it('shows the computed estimate labeled as an ESTIMATE, not a measured value', async () => {
    api.planToday.mockResolvedValue(planWithManualWorkout({
      label: 'Evening Run', shortLabel: 'run', kind: 'run', intensity: 'hard', time: '5:30 PM', startHour: 17.5,
      endHour: 18.5, durationMin: 60, estKcal: 956, estKcalReason: null, status: 'planned',
    }))
    const el = await renderPlan()
    expect(el.textContent).toMatch(/956\s*KCAL\s*\(EST\.\)/)
    expect(el.textContent).not.toMatch(/No calorie estimate/)
  })

  it('shows the honest "no weight on file" note when a duration was given but nothing could be estimated', async () => {
    api.planToday.mockResolvedValue(planWithManualWorkout({
      label: 'Evening Run', shortLabel: 'run', kind: 'run', intensity: 'moderate', time: '5:30 PM', startHour: 17.5,
      endHour: 18.5, durationMin: 60, estKcal: null, estKcalReason: 'no_weight_on_file', status: 'planned',
    }))
    const el = await renderPlan()
    expect(el.textContent).toMatch(/No calorie estimate — log your weight to see this\./)
    expect(el.textContent).not.toMatch(/KCAL/)
  })

  it('does NOT show the "no weight on file" note when no duration was entered at all (control — nothing was ever estimated, so nothing to disclose)', async () => {
    api.planToday.mockResolvedValue(planWithManualWorkout({
      label: 'Evening Run', shortLabel: 'run', kind: 'run', intensity: 'moderate', time: '5:30 PM', startHour: 17.5,
      endHour: null, durationMin: null, estKcal: null, estKcalReason: null, status: 'planned',
    }))
    const el = await renderPlan()
    expect(el.textContent).not.toMatch(/No calorie estimate/)
    expect(el.textContent).not.toMatch(/KCAL/)
  })

  it('a wearable-synced workout\'s calories render WITHOUT the "(EST.)" qualifier — only the manual/typed-in path is an estimate', async () => {
    api.planToday.mockResolvedValue({
      ...planWithManualWorkout(null),
      signals: {
        workout: {
          value: { label: 'Morning Ride', shortLabel: 'ride', kind: 'ride', time: '7:00 AM', startHour: 7, durationMin: 40, estKcal: 410, status: 'completed' },
          provider: 'oura', freshness: 'fresh', demo: false,
        },
      },
    })
    const el = await renderPlan()
    expect(el.textContent).toMatch(/410\s*KCAL/)
    expect(el.textContent).not.toMatch(/\(EST\.\)/)
    expect(el.textContent).not.toMatch(/No calorie estimate/) // the "no weight" note is manual-only, never shown for a synced workout
  })
})
