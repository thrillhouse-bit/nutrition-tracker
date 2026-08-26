// @vitest-environment jsdom
//
// Component tests for the Plan tab's legacy "Quick targets" table (src/
// components/Plan.jsx): the owner asked for a "target energy" number to
// appear between the Baseline and Today figures on the Energy row. That
// figure is the Adaptive Fuel Plan's own computed calorie target (server/
// afp/engine.js's `targets.calories`, read via api.afpPlan) — a genuinely
// different number from this legacy system's own baseline/adjusted, shown
// here only for context. Uses the same raw react-dom/client + act() pattern
// as test/afpPlanUI.test.jsx and test/today-energy-balance.test.jsx — this
// repo has no testing-library dependency.
//
// Plan.jsx always renders <AdaptiveFuelPlan> as a child, so every mock below
// covers both Plan's own reads and AdaptiveFuelPlan's independent ones.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    planToday: vi.fn(),
    afpPlan: vi.fn(),
    listAfpWorkouts: vi.fn(() => Promise.resolve({ workouts: [] })),
    getAfpProfile: vi.fn(() => Promise.resolve({ profile: { units_pref: 'imperial', weight_kg: null, height_cm: null, age_years: null } })),
    getProfile: vi.fn(() => Promise.resolve({ profile: null })),
    setWorkout: vi.fn(),
    clearWorkout: vi.fn(),
    setInfluence: vi.fn(),
    setTargets: vi.fn(),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Plan } = await import('../src/components/Plan.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) { document.body.removeChild(container); container = null }
  vi.clearAllMocks()
})

async function renderPlan(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Plan date={new Date('2026-08-25T12:00:00.000Z')} refreshKey={0} onChanged={() => {}} {...props} />)
  })
  // Two independent fetches (Plan's own api.planToday + AdaptiveFuelPlan's
  // api.afpPlan) resolve across a couple of microtask turns.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  return container
}

const LEGACY_PLAN = {
  date: '2026-08-25',
  baseline: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 },
  adjusted: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65, fiber_g: 30, sugar_g: null, sodium_mg: 2300 },
  rationale: [],
  signals: {},
  influence: { readiness: true, sleep: true, workouts: true },
  rulesVersion: 1,
}

// Mirrors test/afpPlanUI.test.jsx's fullPlan() shape — AdaptiveFuelPlan.jsx
// reads every one of these fields to render without crashing.
function fullAfpPlan(overrides = {}) {
  return {
    plan: {
      ok: true,
      engineVersion: 1,
      bmi: { value: 22.9, category: 'moderate' },
      rmr: { value: 1700, equation: 'mifflin_st_jeor_male', assumptions: ['Mifflin-St Jeor (1990): ...'] },
      energy: { baselineNonTraining: 1955, exercise: 0, goalAdjustment: 0, requestedGoalAdjustment: 0, total: 1955, guardrailApplied: false, guardrailFloor: 1500 },
      targets: { calories: 2200, protein_g: 165, carbs_g: 250, fat_g: 65 },
      computedTargets: { calories: 2200, protein_g: 165, carbs_g: 250, fat_g: 65 },
      overridesApplied: null,
      trainingLoad: { tier: 'rest_light', totalMinutes: 0, sessions: [] },
      carbPlan: { band: [3, 5], gPerKgChosen: 3, reason: 'a rest day.', preworkout: null, duringWorkout: null, recovery: null, allocationPct: { breakfast: 40, remaining: 60 } },
      carbLoading: null,
      safety: { suppressed: false, reason: null },
      warnings: [],
      ...overrides,
    },
    progress: {
      calories: { target: 2200, actual: 800, remaining: 1400, pct: 36 },
      protein_g: { target: 165, actual: 40, remaining: 125, pct: 24 },
      carbs_g: { target: 250, actual: 100, remaining: 150, pct: 40 },
      fat_g: { target: 65, actual: 20, remaining: 45, pct: 31 },
    },
    frozen: false,
    recomputed: true,
    overrides: null,
    date: '2026-08-25',
  }
}

const AFP_NOT_SET_UP = {
  plan: { ok: false, missing: ['weightKg', 'heightCm', 'ageYears', 'activityLevel', 'goal'] },
  progress: null,
  frozen: false,
  recomputed: true,
  overrides: null,
}

// Finds the Quick Targets row for a given nutrient label (e.g. "Energy") by
// its own row-name span, then returns the row `<div>` so callers can inspect
// column order/content directly rather than pattern-matching flat text.
function findRow(el, label) {
  const span = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === label && s.className.includes('flex-1'))
  return span?.parentElement || null
}

describe('Plan tab: Quick Targets shows the Adaptive Fuel Plan\'s target energy between Baseline and Today', () => {
  it('renders Baseline / Target / Today headers in that order, and the Energy row\'s target between its baseline and today figures', async () => {
    api.planToday.mockResolvedValue(LEGACY_PLAN)
    api.afpPlan.mockResolvedValue(fullAfpPlan())
    const el = await renderPlan()

    // Header order.
    const header = Array.from(el.querySelectorAll('div')).find((d) => {
      const spans = Array.from(d.children).filter((c) => c.tagName === 'SPAN')
      return spans.length === 4 && spans[1].textContent === 'Baseline' && spans[2].textContent === 'Target' && spans[3].textContent === 'Today'
    })
    expect(header).toBeTruthy()

    // The Energy row itself: baseline 2,000, target 2,200 (AFP's own
    // computed goal), today 2,000 — target sits spatially between the two.
    const row = findRow(el, 'Energy')
    expect(row).toBeTruthy()
    const cells = Array.from(row.children)
    expect(cells).toHaveLength(4)
    expect(cells[1].textContent).toBe('2,000')
    expect(cells[2].textContent).toBe('2,200')
    expect(cells[3].textContent).toMatch(/^2,000/)
  })

  it('degrades honestly to an em-dash for target energy when no Adaptive Fuel Plan profile is set up yet — never a fabricated or copied number', async () => {
    api.planToday.mockResolvedValue(LEGACY_PLAN)
    api.afpPlan.mockResolvedValue(AFP_NOT_SET_UP)
    const el = await renderPlan()

    const row = findRow(el, 'Energy')
    expect(row).toBeTruthy()
    const cells = Array.from(row.children)
    // Baseline and Today are untouched by the Adaptive Fuel Plan being unset.
    expect(cells[1].textContent).toBe('2,000')
    expect(cells[3].textContent).toMatch(/^2,000/)
    // Target reads as missing data, not a silent zero and not a duplicate of
    // baseline/today.
    expect(cells[2].textContent).toBe('—')
    expect(cells[2].textContent).not.toBe('0')
    expect(cells[2].textContent).not.toBe('2,000')
  })

  it('degrades the same honest way when the Adaptive Fuel Plan read itself fails (control: the legacy table must never depend on it)', async () => {
    api.planToday.mockResolvedValue(LEGACY_PLAN)
    api.afpPlan.mockRejectedValue(new Error('network error'))
    const el = await renderPlan()

    const row = findRow(el, 'Energy')
    expect(row).toBeTruthy()
    const cells = Array.from(row.children)
    expect(cells[1].textContent).toBe('2,000')
    expect(cells[2].textContent).toBe('—')
    expect(cells[3].textContent).toMatch(/^2,000/)
  })

  it('never shows a target figure on non-Energy rows (control: the gate does not fire everywhere) — a genuinely blank cell, not an em-dash', async () => {
    api.planToday.mockResolvedValue(LEGACY_PLAN)
    api.afpPlan.mockResolvedValue(fullAfpPlan())
    const el = await renderPlan()

    for (const label of ['Carbohydrate', 'Protein', 'Fat', 'Fiber']) {
      const row = findRow(el, label)
      expect(row, `expected a ${label} row`).toBeTruthy()
      const cells = Array.from(row.children)
      expect(cells).toHaveLength(4)
      // Structurally no "target" concept applies here at all — genuinely
      // empty, distinct from Energy's honest em-dash when data is merely
      // unavailable.
      expect(cells[2].textContent).toBe('')
    }
  })
})
