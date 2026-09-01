// @vitest-environment jsdom
//
// Regression tests for the three Insights nutrition-trend views added
// 25 Aug 2026 (protein-consistency chart, on-target dot-row, real target line
// on the Energy chart) — all derived from GET /insights's new `targets`
// ({calories, protein_g, hasTargets}) and `onTargetDetail` fields. Mirrors
// test/insights-gating.test.jsx's structure (jsdom + raw react-dom, mocking
// api/client.js) rather than duplicating server-side coverage, which lives in
// test/api-routes.test.js's own new describe blocks.
//
// House rule: every gate needs both a firing AND a non-firing test — each
// feature below gets a real-data case and its honest empty/missing case.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../src/api/client.js', () => ({
  api: {
    insights: vi.fn(),
    signals: vi.fn(() => Promise.resolve({ signals: null })),
    getAfpProfile: vi.fn(() => Promise.resolve({ profile: null })),
    logWeight: vi.fn(),
  },
}))

const { api } = await import('../src/api/client.js')
const { default: Insights } = await import('../src/components/Insights.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    document.body.removeChild(container)
    container = null
  }
  vi.clearAllMocks()
})

async function renderInsights() {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<Insights refreshKey={0} />)
  })
  // Flush the effect's resolved promise into a committed render.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return container
}

// Real 5-tracked-day response, window=7 — shaped like the real GET /insights
// payload (server/index.js): days is sparse (one entry per logged day),
// onTargetDetail spans the full 7-day window, targets carries real numbers.
const DAYS = Array.from({ length: 5 }).map((_, i) => ({
  date: `2026-08-2${i}`,
  totals: { calories: 2000 + i * 50, protein_g: 140 + i * 5 },
}))

// 2 no-log days, then 5 tracked days alternating on/off target — a realistic
// mixed window rather than an all-one-state fixture that couldn't tell three
// states apart.
const ON_TARGET_DETAIL = [
  { date: '2026-08-18', tracked: false, onTarget: null },
  { date: '2026-08-19', tracked: false, onTarget: null },
  { date: '2026-08-20', tracked: true, onTarget: true },
  { date: '2026-08-21', tracked: true, onTarget: false },
  { date: '2026-08-22', tracked: true, onTarget: true },
  { date: '2026-08-23', tracked: true, onTarget: true },
  { date: '2026-08-24', tracked: true, onTarget: false },
]

const BASE_RESPONSE = {
  insufficientData: false,
  nutrition: { trackedDays: 5, avgCalories: 2100, avgProtein: 150, onTargetDays: 3 },
  days: DAYS,
  onTargetDetail: ON_TARGET_DETAIL,
  targets: { calories: 2200, protein_g: 160, hasTargets: true },
  correlations: { available: false, note: null },
  ouraReadiness: [],
  weight: [],
  workoutLoad: [],
}

function proteinSection(el) {
  return Array.from(el.querySelectorAll('section')).find((s) => /^protein/i.test(s.textContent))
}
function energySection(el) {
  return Array.from(el.querySelectorAll('section')).find((s) => /^energy/i.test(s.textContent))
}
function onTargetSection(el) {
  return Array.from(el.querySelectorAll('section')).find((s) => /^on target/i.test(s.textContent))
}

describe('Insights: protein-consistency chart', () => {
  it('renders a real chart against the real protein target when one is set', async () => {
    api.insights.mockResolvedValue(BASE_RESPONSE)
    const el = await renderInsights()

    const section = proteinSection(el)
    expect(section).toBeTruthy()
    expect(section.querySelector('svg')).toBeTruthy()
    expect(section.textContent).toContain('target 160 g')
    expect(section.textContent).toContain('TARGET 160 G — DOTTED')
    expect(section.textContent).not.toContain('No target set')
  })

  it('CONTROL: shows the honest "no target set" state, never a chart against a fabricated target, when hasTargets is false', async () => {
    api.insights.mockResolvedValue({
      ...BASE_RESPONSE,
      // A non-ready AFP response must not be treated as a real target merely
      // because a numeric value happens to be present in a malformed fixture.
      targets: { calories: 2000, protein_g: 150, hasTargets: false },
    })
    const el = await renderInsights()

    const section = proteinSection(el)
    expect(section).toBeTruthy()
    expect(section.querySelector('svg')).toBeFalsy()
    expect(section.textContent).toContain('No target set')
    expect(section.textContent).toContain('Set a protein target in Plan')
    expect(section.textContent).not.toContain('target 150 g')
  })
})

describe('Insights: on-target dot-row', () => {
  it('renders one real cell per window day, split into on-target/off-target/no-log by the server-computed detail', async () => {
    api.insights.mockResolvedValue(BASE_RESPONSE)
    const el = await renderInsights()

    const section = onTargetSection(el)
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('3/5 days') // nutrition.onTargetDays / trackedDays

    const cells = section.querySelectorAll('[aria-hidden]')
    expect(cells).toHaveLength(ON_TARGET_DETAIL.length)
    const classesOf = (i) => cells[i].className
    // no-log days (indices 0-1)
    expect(classesOf(0)).toContain('bg-track')
    expect(classesOf(1)).toContain('bg-track')
    // on-target days (indices 2, 4, 5)
    expect(classesOf(2)).toContain('bg-cobalt')
    expect(classesOf(4)).toContain('bg-cobalt')
    expect(classesOf(5)).toContain('bg-cobalt')
    // off-target days (indices 3, 6)
    expect(classesOf(3)).toContain('bg-ink/35')
    expect(classesOf(6)).toContain('bg-ink/35')
  })

  it('CONTROL: renders no on-target section at all when the server sends no per-day detail', async () => {
    api.insights.mockResolvedValue({ ...BASE_RESPONSE, onTargetDetail: [] })
    const el = await renderInsights()

    expect(onTargetSection(el)).toBeFalsy()
    expect(el.textContent).not.toContain('On target ·')
  })
})

describe('Insights: real target line on the Energy chart', () => {
  it('labels a real, distinct target line alongside the average when a real calorie target exists', async () => {
    api.insights.mockResolvedValue(BASE_RESPONSE)
    const el = await renderInsights()

    const section = energySection(el)
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('AVG 2,100 — DASHED')
    expect(section.textContent).toContain('TARGET 2,200 — DOTTED')
    // Two distinct reference <line> elements (target + average), not one.
    const lines = section.querySelectorAll('svg line')
    expect(lines.length).toBe(2)
  })

  it('CONTROL: draws only the average line — never a target line — when hasTargets is false', async () => {
    api.insights.mockResolvedValue({
      ...BASE_RESPONSE,
      targets: { calories: 2000, protein_g: 150, hasTargets: false },
    })
    const el = await renderInsights()

    const section = energySection(el)
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('AVG 2,100 — DASHED')
    expect(section.textContent).not.toContain('TARGET')
    expect(section.textContent).not.toContain('DOTTED')
    const lines = section.querySelectorAll('svg line')
    expect(lines.length).toBe(1)
  })
})
