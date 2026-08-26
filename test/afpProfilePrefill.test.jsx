// @vitest-environment jsdom
//
// Regression test for the Adaptive Fuel Plan "Set up my profile" form
// duplicating data entry: AfpProfileForm's fields (height/weight/age/sex/
// activity level/units) largely mirror Plan's own onboarding profile
// (src/components/Onboarding.jsx / SmartPlanForm, api.getProfile()), but
// AdaptiveFuelPlan.jsx only ever fetched its own separate api.getAfpProfile()
// — a user who already calculated or typed a baseline saw a completely
// BLANK "Set up my profile" form and had to re-type the exact same body
// metrics a second time, which read as the feature not working rather than
// just not-yet-configured for THIS specific plan.
//
// Fixed by fetching the general onboarding profile alongside the AFP one and
// falling back field-by-field when the AFP-specific field hasn't been set.
// Proves both directions (house rule: prove the control, not only the
// mutation) — the form prefills from onboarding data when the AFP profile is
// still empty, AND an AFP-specific value the user already saved is never
// clobbered by different onboarding data.
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

describe('AdaptiveFuelPlan: "Set up my profile" prefills from the onboarding profile', () => {
  it('fills height/weight/age from api.getProfile() when the AFP-specific profile has none yet', async () => {
    api.getAfpProfile.mockResolvedValue({ profile: { units_pref: 'imperial', weight_kg: null, height_cm: null, age_years: null, sex: null, activity_level: null } })
    api.getProfile.mockResolvedValue({ profile: { units_pref: 'imperial', height_cm: 177.8, weight_kg: 79.4, age_years: 32, sex: 'male', activity_level: 'moderate' } })
    const el = await renderAfp()
    await openSetupForm(el)

    const { ft, inch } = heightInputs(el)
    expect(ft.value).toBe('5')
    expect(inch.value).toBe('10')
    expect(weightLbInput(el).value).toBe('175')
    expect(ageInput(el).value).toBe('32')
  })

  it('CONTROL: keeps the AFP-specific values when they already exist, even though onboarding has different numbers', async () => {
    api.getAfpProfile.mockResolvedValue({ profile: { units_pref: 'imperial', height_cm: 165.1, weight_kg: 60, age_years: 40, sex: 'female', activity_level: 'active' } })
    api.getProfile.mockResolvedValue({ profile: { units_pref: 'imperial', height_cm: 177.8, weight_kg: 79.4, age_years: 32, sex: 'male', activity_level: 'moderate' } })
    const el = await renderAfp()
    await openSetupForm(el)

    const { ft, inch } = heightInputs(el)
    expect(ft.value).toBe('5')
    expect(inch.value).toBe('5')
    expect(weightLbInput(el).value).toBe('132.3')
    expect(ageInput(el).value).toBe('40')
  })
})
