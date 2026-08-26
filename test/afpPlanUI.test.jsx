// @vitest-environment jsdom
//
// Component tests for the Adaptive Fuel Plan panel (src/components/
// AdaptiveFuelPlan.jsx): profile editing, immediate recalculation on date/
// refreshKey change, a high-carb training day, a rest day, and progress
// against actual intake. Uses the same raw react-dom/client + act() pattern
// as test/today-energy-balance.test.jsx and test/insights-gating.test.jsx —
// this repo has no testing-library dependency.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    afpPlan: vi.fn(),
    listAfpWorkouts: vi.fn(() => Promise.resolve({ workouts: [] })),
    getAfpProfile: vi.fn(() => Promise.resolve({ profile: { units_pref: 'imperial', weight_kg: null, height_cm: null, age_years: null } })),
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

async function renderAfp(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<AdaptiveFuelPlan date={new Date('2026-08-25T12:00:00.000Z')} refreshKey={0} onChanged={() => {}} {...props} />)
  })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return container
}

const NO_PLAN_YET = { plan: { ok: false, missing: ['weightKg', 'heightCm', 'ageYears', 'activityLevel', 'goal'] }, progress: null, frozen: false, recomputed: true, overrides: null }

function fullPlan(overrides = {}) {
  return {
    plan: {
      ok: true,
      engineVersion: 1,
      bmi: { value: 22.9, category: 'moderate' },
      rmr: { value: 1700, equation: 'mifflin_st_jeor_male', assumptions: ['Mifflin-St Jeor (1990): ...'] },
      energy: { baselineNonTraining: 1955, exercise: 0, goalAdjustment: 0, requestedGoalAdjustment: 0, total: 1955, guardrailApplied: false, guardrailFloor: 1500 },
      targets: { calories: 2000, protein_g: 130, carbs_g: 250, fat_g: 60 },
      computedTargets: { calories: 2000, protein_g: 130, carbs_g: 250, fat_g: 60 },
      overridesApplied: null,
      trainingLoad: { tier: 'rest_light', totalMinutes: 0, sessions: [] },
      carbPlan: { band: [3, 5], gPerKgChosen: 3, reason: 'a rest or light day (0 min planned/synced training) → 3–5 g/kg recommended; chosen 3 g/kg for today\'s load within that band.', preworkout: null, duringWorkout: null, recovery: null, allocationPct: { breakfast: 40, remaining: 60 } },
      carbLoading: null,
      safety: { suppressed: false, reason: null },
      warnings: [],
      ...overrides,
    },
    progress: {
      calories: { target: 2000, actual: 800, remaining: 1200, pct: 40 },
      protein_g: { target: 130, actual: 40, remaining: 90, pct: 31 },
      carbs_g: { target: 250, actual: 100, remaining: 150, pct: 40 },
      fat_g: { target: 60, actual: 20, remaining: 40, pct: 33 },
    },
    frozen: false,
    recomputed: true,
    overrides: null,
    date: '2026-08-25',
  }
}

describe('AdaptiveFuelPlan: empty/loading states', () => {
  it('shows a setup CTA, not an error, when the profile is incomplete', async () => {
    api.afpPlan.mockResolvedValue(NO_PLAN_YET)
    const el = await renderAfp()
    expect(el.textContent).toMatch(/Set up your Adaptive Fuel Plan/)
    expect(el.textContent).not.toMatch(/error/i)
  })

  it('opens the profile form from the setup CTA', async () => {
    api.afpPlan.mockResolvedValue(NO_PLAN_YET)
    const el = await renderAfp()
    const btn = Array.from(el.querySelectorAll('button')).find((b) => /Set up my profile/.test(b.textContent))
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })
    expect(el.textContent).toMatch(/Adaptive Fuel Plan profile/)
    expect(el.textContent).toMatch(/Baseline activity/)
  })
})

// React tracks the native input-value setter to detect real changes — setting
// `.value` directly without going through the PROTOTYPE setter is silently
// ignored by React 18's change detection in jsdom, so every text field below
// goes through this helper rather than a bare assignment.
function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AdaptiveFuelPlan: profile editing end-to-end', () => {
  it('fills in the form and submits a fully-converted metric payload', async () => {
    api.afpPlan.mockResolvedValue(NO_PLAN_YET)
    const el = await renderAfp()
    const setupBtn = Array.from(el.querySelectorAll('button')).find((b) => /Set up my profile/.test(b.textContent))
    await act(async () => { setupBtn.click() })

    const byLabel = (text) => Array.from(el.querySelectorAll('input[aria-label], input')).find((i) => i.placeholder === text)
    const heightFt = Array.from(el.querySelectorAll('input')).find((i) => i.getAttribute('aria-label') === 'Height, feet')
    const heightIn = Array.from(el.querySelectorAll('input')).find((i) => i.getAttribute('aria-label') === 'Height, inches')
    await act(async () => { setInputValue(heightFt, '5'); setInputValue(heightIn, '10') })

    // Field (ui.jsx) renders the whole labeled control as ONE <label> element
    // wrapping its <input> — the input lives inside it, not in its parent.
    // "Current weight (lb)" is the only lb-labeled numeric field on the form.
    const weightLbField = Array.from(el.querySelectorAll('label')).find((l) => /Current weight \(lb\)/.test(l.textContent))
    const weightLbInput = weightLbField.querySelector('input')
    await act(async () => { setInputValue(weightLbInput, '154') })

    const ageField = Array.from(el.querySelectorAll('label')).find((l) => /Age \(years\)/.test(l.textContent))
    const ageInput = ageField.querySelector('input')
    await act(async () => { setInputValue(ageInput, '30') })

    // OptionCard renders a description span alongside the title, so match on
    // the title span specifically rather than the button's full textContent.
    const sedentaryBtn = Array.from(el.querySelectorAll('button')).find((b) => b.querySelector('span')?.textContent === 'Sedentary')
    await act(async () => { sedentaryBtn.click() })
    const maintainBtn = Array.from(el.querySelectorAll('button')).find((b) => /Maintain performance/.test(b.textContent))
    await act(async () => { maintainBtn.click() })

    const saveBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Save profile')
    expect(saveBtn.disabled).toBe(false)
    await act(async () => { saveBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(api.setAfpProfile).toHaveBeenCalledTimes(1)
    const payload = api.setAfpProfile.mock.calls[0][0]
    expect(payload.height_cm).toBeCloseTo(177.8, 1) // 5'10"
    expect(payload.weight_kg).toBeCloseTo(69.9, 1) // 154 lb, rounded to 1 decimal by the form
    expect(payload.age_years).toBe(30)
    expect(payload.activity_level).toBe('sedentary')
    expect(payload.goal).toBe('maintain')
    expect(payload.sex).toBeNull() // never selected — the neutral-estimate path
  })

  it('shows the weekly-change field only for gradual_loss/gradual_gain, and the custom-adjustment field only for custom', async () => {
    api.afpPlan.mockResolvedValue(NO_PLAN_YET)
    const el = await renderAfp()
    const setupBtn = Array.from(el.querySelectorAll('button')).find((b) => /Set up my profile/.test(b.textContent))
    await act(async () => { setupBtn.click() })

    expect(el.textContent).not.toMatch(/Target weekly/)
    expect(el.textContent).not.toMatch(/Daily calorie adjustment/)

    const gradualLossBtn = Array.from(el.querySelectorAll('button')).find((b) => /Gradual loss/.test(b.textContent))
    await act(async () => { gradualLossBtn.click() })
    expect(el.textContent).toMatch(/Target weekly loss/)

    const customBtn = Array.from(el.querySelectorAll('button')).find((b) => /Custom adjustment/.test(b.textContent))
    await act(async () => { customBtn.click() })
    expect(el.textContent).toMatch(/Daily calorie adjustment/)
    expect(el.textContent).not.toMatch(/Target weekly/)
  })
})

describe('AdaptiveFuelPlan: a rest day', () => {
  it('renders the rest_light carbohydrate band, no pre/during-workout guidance', async () => {
    api.afpPlan.mockResolvedValue(fullPlan())
    const el = await renderAfp()
    expect(el.textContent).toMatch(/rest light/)
    expect(el.textContent).toMatch(/3–5 g\/kg/)
    expect(el.textContent).not.toMatch(/Pre-session:/)
    expect(el.textContent).not.toMatch(/During the session:/)
  })

  it('shows the BMI as optional context, explicitly not a diagnosis', async () => {
    api.afpPlan.mockResolvedValue(fullPlan())
    const el = await renderAfp()
    expect(el.textContent).toMatch(/BMI 22\.9/)
    expect(el.textContent).toMatch(/not a health diagnosis/)
  })

  it('renders progress against actual logged intake', async () => {
    api.afpPlan.mockResolvedValue(fullPlan())
    const el = await renderAfp()
    expect(el.textContent).toMatch(/800.*logged/)
    expect(el.textContent).toMatch(/1,200 left|1200 left/)
  })
})

describe('AdaptiveFuelPlan: a high-carbohydrate training day', () => {
  it('renders pre-workout and during-workout carbohydrate guidance for a long/key session', async () => {
    api.afpPlan.mockResolvedValue(fullPlan({
      trainingLoad: { tier: 'endurance_high', totalMinutes: 120, sessions: [{ sport: 'run', intensity: 'hard', durationMin: 120, source: 'planned', isKeySession: true }] },
      carbPlan: {
        band: [6, 10], gPerKgChosen: 8, reason: 'an endurance/high-volume day (1–3 h) → 6–10 g/kg recommended; chosen 8 g/kg for today\'s load within that band.',
        preworkout: { grams: 60, timing: '1–4 hours before the session', note: 'Top off glycogen before the run.' },
        duringWorkout: { gramsPerHour: 60, note: 'Sessions this long benefit from carbohydrate intake during the session itself.' },
        recovery: null,
        allocationPct: { preWorkout: 15, duringWorkout: 10, breakfast: 30, remaining: 45 },
      },
      targets: { calories: 3000, protein_g: 150, carbs_g: 500, fat_g: 80 },
    }))
    const el = await renderAfp()
    expect(el.textContent).toMatch(/endurance\/high/)
    expect(el.textContent).toMatch(/6–10 g\/kg/)
    expect(el.textContent).toMatch(/Pre-session: ~60 g/)
    expect(el.textContent).toMatch(/During the session: ~60 g\/hour/)
  })

  it('renders a carb-loading suggestion only when eligible, with its safety caveat', async () => {
    api.afpPlan.mockResolvedValue(fullPlan({
      carbLoading: { eligible: true, optIn: true, gramsPerKgRange: [8, 12], note: 'Practice it in training first.', forSport: 'run' },
    }))
    const el = await renderAfp()
    expect(el.textContent).toMatch(/8–12 g\/kg/)
    expect(el.textContent).toMatch(/Practice it in training first/)
  })

  it('shows why the ineligible carb-loading opt-in did not apply', async () => {
    api.afpPlan.mockResolvedValue(fullPlan({
      carbLoading: { eligible: false, reason: 'This event is shorter than the ~90-minute threshold.' },
    }))
    const el = await renderAfp()
    expect(el.textContent).toMatch(/doesn't qualify/)
    expect(el.textContent).toMatch(/shorter than the ~90-minute threshold/)
  })
})

describe('AdaptiveFuelPlan: safety and frozen-day states', () => {
  it('shows the safety-suppression notice, never a plain deficit target, when suppressed', async () => {
    api.afpPlan.mockResolvedValue(fullPlan({
      safety: { suppressed: true, reason: 'minor', message: 'A calorie-deficit plan is not offered for users under 18 — this plan uses a maintenance-level target instead.' },
    }))
    const el = await renderAfp()
    expect(el.textContent).toMatch(/A calorie deficit isn't offered here/)
    expect(el.textContent).toMatch(/not offered for users under 18/)
  })

  it('shows guardrail warnings inline', async () => {
    api.afpPlan.mockResolvedValue(fullPlan({
      warnings: [{ code: 'min_energy_guardrail', message: 'Your plan\'s calorie target was raised to 1500 kcal — a safety floor.' }],
    }))
    const el = await renderAfp()
    expect(el.textContent).toMatch(/raised to 1500 kcal/)
  })

  it('shows a frozen-day notice with a recompute action for a past day, absent on today\'s (live) plan', async () => {
    const frozen = fullPlan()
    frozen.frozen = true
    api.afpPlan.mockResolvedValue(frozen)
    const el = await renderAfp()
    expect(el.textContent).toMatch(/frozen/)
    expect(el.textContent).toMatch(/Recompute anyway/)
  })

  it('does NOT show the frozen notice for a live (today) plan (control)', async () => {
    api.afpPlan.mockResolvedValue(fullPlan())
    const el = await renderAfp()
    expect(el.textContent).not.toMatch(/frozen/)
  })

  it('flags a manual override distinctly from the engine\'s own computed numbers', async () => {
    api.afpPlan.mockResolvedValue(fullPlan({ overridesApplied: { calories: 2500 } }))
    const el = await renderAfp()
    expect(el.textContent).toMatch(/Manual override applied/)
  })
})

describe('AdaptiveFuelPlan: override form only submits fields the user actually touched', () => {
  it('opens with every field BLANK (never pre-filled with today\'s computed numbers) and only sends the one field edited', async () => {
    api.afpPlan.mockResolvedValue(fullPlan())
    const el = await renderAfp()

    const openBtn = Array.from(el.querySelectorAll('button')).find((b) => /Override today/.test(b.textContent))
    await act(async () => { openBtn.click() })

    const caloriesField = Array.from(el.querySelectorAll('label')).find((l) => /^Calories$/.test(l.querySelector('span')?.textContent || ''))
    const caloriesInput = caloriesField.querySelector('input')
    // Blank value, but the computed number is still visible as a placeholder hint.
    expect(caloriesInput.value).toBe('')
    expect(caloriesInput.placeholder).toBe('2,000')
    const proteinField = Array.from(el.querySelectorAll('label')).find((l) => /Protein \(g\)/.test(l.textContent))
    expect(proteinField.querySelector('input').value).toBe('')

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(caloriesInput, '2222')
      caloriesInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Save override')
    await act(async () => { saveBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(api.setAfpPlanOverrides).toHaveBeenCalledWith('2026-08-25', { calories: 2222 })
  })

  it('pre-fills only fields that are ALREADY overridden when re-opening to edit (control)', async () => {
    const plan = fullPlan({ overridesApplied: { calories: 2500 } })
    plan.overrides = { calories: 2500 }
    api.afpPlan.mockResolvedValue(plan)
    const el = await renderAfp()

    const editBtn = Array.from(el.querySelectorAll('button')).find((b) => /Edit override/.test(b.textContent))
    await act(async () => { editBtn.click() })

    const caloriesField = Array.from(el.querySelectorAll('label')).find((l) => /^Calories$/.test(l.querySelector('span')?.textContent || ''))
    expect(caloriesField.querySelector('input').value).toBe('2500')
    const proteinField = Array.from(el.querySelectorAll('label')).find((l) => /Protein \(g\)/.test(l.textContent))
    expect(proteinField.querySelector('input').value).toBe('') // never overridden — stays blank, not the computed 130
  })
})

describe('AdaptiveFuelPlan: recalculates when the date changes', () => {
  it('re-fetches the plan for the new date', async () => {
    api.afpPlan.mockResolvedValue(fullPlan())
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<AdaptiveFuelPlan date={new Date('2026-08-25T12:00:00.000Z')} refreshKey={0} onChanged={() => {}} />) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(api.afpPlan).toHaveBeenCalledWith('2026-08-25')

    await act(async () => { root.render(<AdaptiveFuelPlan date={new Date('2026-08-26T12:00:00.000Z')} refreshKey={0} onChanged={() => {}} />) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(api.afpPlan).toHaveBeenCalledWith('2026-08-26')
  })
})
