import { describe, it, expect } from 'vitest'
import { computeAdjustedTargets, computeRecommendation } from '../server/plan.js'

const baseline = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 }
const runWorkout = {
  value: { label: 'Evening Run', shortLabel: 'run', kind: 'run', time: '5:30 PM', startHour: 17.5, est_kcal: 520 },
  provider: 'garmin', freshness: 'fresh', demo: true,
}

describe('computeAdjustedTargets', () => {
  it('raises carbs on an endurance-workout day, with a sourced rationale', () => {
    const { adjusted, rationale } = computeAdjustedTargets(baseline, { workout: runWorkout })
    expect(adjusted.carbs_g).toBe(250) // 200 + 25%
    expect(adjusted.calories).toBe(2200) // + 50g carbs * 4 kcal
    expect(rationale[0]).toMatchObject({ factor: 'workout', source: 'garmin', demo: true })
    expect(rationale[0].detail).toMatch(/Evening Run/)
  })

  it('nudges protein up on lower readiness', () => {
    const { adjusted, rationale } = computeAdjustedTargets(baseline, {
      readiness: { value: 60, provider: 'oura', freshness: 'fresh' },
    })
    expect(adjusted.protein_g).toBe(165) // 150 + 10%
    expect(rationale.some((r) => r.factor === 'readiness')).toBe(true)
  })

  it('respects the influence toggle (workouts off = no carb change)', () => {
    const { adjusted, rationale } = computeAdjustedTargets(baseline, { workout: runWorkout }, {
      influence: { workouts: false, readiness: true, sleep: true },
    })
    expect(adjusted.carbs_g).toBe(200)
    expect(rationale).toHaveLength(0)
  })

  it('ignores an unavailable signal', () => {
    const { adjusted } = computeAdjustedTargets(baseline, {
      workout: { ...runWorkout, freshness: 'unavailable' },
    })
    expect(adjusted.carbs_g).toBe(200)
  })

  it('never mutates the baseline object', () => {
    const b = { ...baseline }
    computeAdjustedTargets(b, { workout: runWorkout })
    expect(b.carbs_g).toBe(200)
  })
})

describe('computeRecommendation', () => {
  const adjusted = { calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 65 }
  const signals = { workout: runWorkout, readiness: { value: 82, provider: 'oura', freshness: 'fresh', demo: true } }

  it('recommends pre-workout fueling inside the window, with a why', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 650, protein_g: 40, carbs_g: 70 }, signals, nowHour: 15.5,
    })
    expect(rec.kind).toBe('pre_workout')
    expect(rec.title).toMatch(/Fuel your/)
    expect(rec.detail).toMatch(/protein/)
    expect(rec.why.length).toBeGreaterThan(0)
  })

  it('nudges protein when trailing for the time of day', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 900, protein_g: 30, carbs_g: 120 }, signals: {}, nowHour: 20,
    })
    expect(rec.kind).toBe('protein_pacing')
    expect(rec.title).toMatch(/protein/i)
  })

  it('says on-track when intake lines up and nothing is pending', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 1400, protein_g: 130, carbs_g: 170 }, signals: {}, nowHour: 20,
    })
    expect(rec.kind).toBe('on_track')
  })

  it('never reports negative protein after the protein target is exceeded', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 1400, protein_g: 180, carbs_g: 170 }, signals: {}, nowHour: 20,
    })
    expect(rec.kind).toBe('on_track')
    expect(rec.title).toBe('Protein target covered')
    expect(rec.detail).toMatch(/protein is already covered/i)
    expect(rec.detail).not.toMatch(/-\d/)
  })

  it('acknowledges an energy overage before suggesting ordinary protein pacing', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 2400, protein_g: 30, carbs_g: 260 }, signals: {}, nowHour: 20,
    })
    expect(rec.kind).toBe('over')
    expect(rec.title).toMatch(/covered today's energy target/i)
    expect(rec.detail).toContain('120 g protein remains')
    expect(rec.detail).not.toMatch(/-\d/)
  })

  it('does not prescribe more food when the energy target is exactly met', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 2200, protein_g: 30, carbs_g: 260 }, signals: {}, nowHour: 20,
    })
    expect(rec.kind).toBe('on_track')
    expect(rec.title).toMatch(/covered today's energy target/i)
    expect(rec.detail).toMatch(/don't force food/i)
    expect(rec.detail).not.toMatch(/aim for/i)
  })

  it('caps pre-workout macros at the amount remaining in the daily plan', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 1900, protein_g: 145, carbs_g: 240 }, signals, nowHour: 15.5,
    })
    expect(rec.kind).toBe('pre_workout')
    expect(rec.detail).toContain('5 g protein')
    expect(rec.detail).toContain('10 g carbs')
    expect(rec.detail).not.toContain('30 g protein')
  })

  it('does not prescribe extra pre-workout macros once both are covered', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 2100, protein_g: 160, carbs_g: 270 }, signals, nowHour: 15.5,
    })
    expect(rec.kind).toBe('pre_workout')
    expect(rec.title).toBe('Your workout fuel is covered')
    expect(rec.detail).toMatch(/No extra macro target/i)
    expect(rec.detail).not.toMatch(/-\d/)
  })

  it('caps a protein pacing suggestion at protein remaining', () => {
    const rec = computeRecommendation({
      baseline, adjusted, intake: { calories: 2000, protein_g: 134, carbs_g: 220 }, signals: {}, nowHour: 21,
    })
    // At 9 PM this is only 16 g behind, so the old minimum-20 suggestion
    // would have exceeded the daily target.
    expect(rec.kind).toBe('protein_pacing')
    expect(rec.detail).toContain('16 g next')
  })
})
