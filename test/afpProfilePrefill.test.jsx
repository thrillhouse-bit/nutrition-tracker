// @vitest-environment jsdom
//
// The compatibility migration now happens on the server. The panel consumes
// only the canonical AFP profile, so there is no second client-side profile
// merge that can drift from onboarding or overwrite explicit AFP values.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    afpPlan: vi.fn(() => Promise.resolve({ plan: { ok: false, missing: ['weightKg', 'heightCm', 'ageYears', 'activityLevel', 'goal'] }, progress: null, frozen: false, recomputed: true, overrides: null })),
    listAfpWorkouts: vi.fn(() => Promise.resolve({ workouts: [] })),
    getAfpProfile: vi.fn(),
    getProfile: vi.fn(),
    setAfpProfile: vi.fn(() => Promise.resolve({ profile: {} })),
    saveAfpWorkout: vi.fn(),
    deleteAfpWorkout: vi.fn(),
    recomputeAfpPlan: vi.fn(() => Promise.resolve({})),
    setAfpPlanOverrides: vi.fn(() => Promise.resolve({})),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: AdaptiveFuelPlan } = await import('../src/components/AdaptiveFuelPlan.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) { document.body.removeChild(container); container = null }
  vi.clearAllMocks()
})

async function renderAfp() {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<AdaptiveFuelPlan date={new Date('2026-08-25T12:00:00.000Z')} refreshKey={0} onChanged={() => {}} />)
  })
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  return container
}

async function openSetupForm(el) {
  const setupBtn = Array.from(el.querySelectorAll('button')).find((b) => /Set up my profile/.test(b.textContent))
  await act(async () => { setupBtn.click() })
}

function heightInputs(el) {
  const ft = Array.from(el.querySelectorAll('input')).find((i) => i.getAttribute('aria-label') === 'Height, feet')
  const inch = Array.from(el.querySelectorAll('input')).find((i) => i.getAttribute('aria-label') === 'Height, inches')
  return { ft, inch }
}

function weightLbInput(el) {
  const field = Array.from(el.querySelectorAll('label')).find((l) => /Current weight \(lb\)/.test(l.textContent))
  return field.querySelector('input')
}

function ageInput(el) {
  const field = Array.from(el.querySelectorAll('label')).find((l) => /Age \(years\)/.test(l.textContent))
  return field.querySelector('input')
}

describe('AdaptiveFuelPlan: canonical profile ownership', () => {
  it('prefills from the server-returned canonical profile and never fetches the legacy profile', async () => {
    api.getAfpProfile.mockResolvedValue({ profile: { units_pref: 'imperial', height_cm: 177.8, weight_kg: 79.4, age_years: 32, sex: 'male', activity_level: 'moderate' } })
    const el = await renderAfp()
    await openSetupForm(el)

    const { ft, inch } = heightInputs(el)
    expect(ft.value).toBe('5')
    expect(inch.value).toBe('10')
    expect(weightLbInput(el).value).toBe('175')
    expect(ageInput(el).value).toBe('32')
    expect(api.getProfile).not.toHaveBeenCalled()
  })

  it('CONTROL: leaves missing canonical values blank instead of secretly merging a second profile in the browser', async () => {
    api.getAfpProfile.mockResolvedValue({ profile: { units_pref: 'imperial', weight_kg: null, height_cm: null, age_years: null, sex: null, activity_level: null } })
    api.getProfile.mockResolvedValue({ profile: { units_pref: 'imperial', height_cm: 177.8, weight_kg: 79.4, age_years: 32, sex: 'male', activity_level: 'moderate' } })
    const el = await renderAfp()
    await openSetupForm(el)

    const { ft, inch } = heightInputs(el)
    expect(ft.value).toBe('')
    expect(inch.value).toBe('')
    expect(weightLbInput(el).value).toBe('')
    expect(ageInput(el).value).toBe('')
    expect(api.getProfile).not.toHaveBeenCalled()
  })

  it('keeps explicit canonical values intact', async () => {
    api.getAfpProfile.mockResolvedValue({ profile: { units_pref: 'imperial', height_cm: 165.1, weight_kg: 60, age_years: 40, sex: 'female', activity_level: 'active' } })
    const el = await renderAfp()
    await openSetupForm(el)

    const { ft, inch } = heightInputs(el)
    expect(ft.value).toBe('5')
    expect(inch.value).toBe('5')
    expect(weightLbInput(el).value).toBe('132.3')
    expect(ageInput(el).value).toBe('40')
  })
})
