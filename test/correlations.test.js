import { describe, it, expect } from 'vitest'
import { pearsonR, computeNutritionRecoveryCorrelation, MIN_OVERLAP_DAYS, R_THRESHOLD } from '../server/correlations.js'

describe('pearsonR', () => {
  it('returns null for fewer than 2 points (control)', () => {
    expect(pearsonR([], [])).toBeNull()
    expect(pearsonR([1], [1])).toBeNull()
  })

  it('returns null for mismatched lengths (control)', () => {
    expect(pearsonR([1, 2], [1])).toBeNull()
  })

  it('returns null when one series has zero variance — a flat line has no slope to measure (control)', () => {
    expect(pearsonR([1, 2, 3], [5, 5, 5])).toBeNull()
    expect(pearsonR([5, 5, 5], [1, 2, 3])).toBeNull()
  })

  it('reads 1 for a perfectly correlated pair, hand-computable (y = 2x)', () => {
    expect(pearsonR([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10)
  })

  it('reads -1 for a perfectly anti-correlated pair, hand-computable (y = -x)', () => {
    expect(pearsonR([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10)
  })

  it('reads ~0 for a symmetric, uncorrelated pair, hand-computable', () => {
    // x rises then falls back symmetrically while y just rises — the
    // covariance terms cancel by construction, an easy hand-checkable zero.
    expect(pearsonR([1, 2, 3, 2, 1], [1, 2, 3, 4, 5])).toBeCloseTo(0, 10)
  })

  it('is scale/offset-invariant — r depends on the linear relationship, not the units (control)', () => {
    const a = pearsonR([1, 2, 3, 4], [2, 4, 6, 8])
    const b = pearsonR([100, 200, 300, 400], [1002, 1004, 1006, 1008])
    expect(b).toBeCloseTo(a, 10)
  })
})

describe('computeNutritionRecoveryCorrelation gating', () => {
  const days = (proteinByDay) => Object.entries(proteinByDay).map(([date, protein_g]) => ({ date, totals: { protein_g } }))
  const readiness = (scoreByDay) => Object.entries(scoreByDay).map(([date, score]) => ({ date, score }))

  it('is available:true with the real r and n when both floors clear (n=10, r=1)', () => {
    const proteinByDay = {}
    const scoreByDay = {}
    for (let i = 0; i < 10; i++) {
      const d = String(20 + i).padStart(2, '0')
      const nd = String(21 + i).padStart(2, '0')
      proteinByDay[`2026-08-${d}`] = 60 + i * 10
      scoreByDay[`2026-08-${nd}`] = 50 + i * 5
    }
    const out = computeNutritionRecoveryCorrelation(days(proteinByDay), readiness(scoreByDay))
    expect(out.available).toBe(true)
    expect(out.n).toBe(10)
    expect(out.r).toBe(1)
    expect(out.note).toContain('r=1.00 over 10 days')
    expect(out.note).not.toMatch(/because|causes|improves/i) // observation, never a causal claim
  })

  it('stays available:false below MIN_OVERLAP_DAYS even with a perfect-looking r (control on the sample-size floor)', () => {
    const proteinByDay = { '2026-08-20': 60, '2026-08-21': 70 }
    const scoreByDay = { '2026-08-21': 50, '2026-08-22': 60 } // n=2, r would be 1
    const out = computeNutritionRecoveryCorrelation(days(proteinByDay), readiness(scoreByDay))
    expect(MIN_OVERLAP_DAYS).toBeGreaterThan(2) // the assumption this test depends on
    expect(out.available).toBe(false)
    expect(out.n).toBe(2)
    expect(out.note).toMatch(/need at least/)
  })

  it('stays available:false above MIN_OVERLAP_DAYS when |r| is below R_THRESHOLD (control on the effect-size floor)', () => {
    const proteinByDay = { '2026-08-20': 148, '2026-08-21': 86, '2026-08-22': 86, '2026-08-23': 108, '2026-08-24': 95, '2026-08-25': 91, '2026-08-26': 95, '2026-08-27': 129 }
    const scoreByDay = { '2026-08-21': 65, '2026-08-22': 91, '2026-08-23': 68, '2026-08-24': 58, '2026-08-25': 53, '2026-08-26': 74, '2026-08-27': 48, '2026-08-28': 80 }
    const out = computeNutritionRecoveryCorrelation(days(proteinByDay), readiness(scoreByDay))
    expect(out.n).toBeGreaterThanOrEqual(MIN_OVERLAP_DAYS)
    expect(Math.abs(out.r)).toBeLessThan(R_THRESHOLD)
    expect(out.available).toBe(false)
    expect(out.note).toMatch(/no clear relationship/)
  })

  it('reports available:false with a distinct note when there is no readiness data connected at all (control)', () => {
    const out = computeNutritionRecoveryCorrelation(days({ '2026-08-20': 100 }), [])
    expect(out.available).toBe(false)
    expect(out.n).toBeNull()
    expect(out.r).toBeNull()
    expect(out.note).toMatch(/connect a provider/)
  })

  it('reports available:false with a "hasn\'t varied" note when the overlap is flat (r undefined, not zero)', () => {
    const proteinByDay = {}
    const scoreByDay = {}
    for (let i = 0; i < 8; i++) {
      const d = String(20 + i).padStart(2, '0')
      const nd = String(21 + i).padStart(2, '0')
      proteinByDay[`2026-08-${d}`] = 100 // flat — no variance
      scoreByDay[`2026-08-${nd}`] = 70 + i // varies, but the other series doesn't
    }
    const out = computeNutritionRecoveryCorrelation(days(proteinByDay), readiness(scoreByDay))
    expect(out.available).toBe(false)
    expect(out.r).toBeNull()
    expect(out.n).toBe(8)
    expect(out.note).toMatch(/hasn't varied/)
  })

  it('ignores a day with no protein logged and a day with no matching next-day readiness (control on the join itself)', () => {
    const daysIn = [
      { date: '2026-08-20', totals: { protein_g: 80 } },
      { date: '2026-08-21', totals: {} }, // no protein_g at all — must not join as 0
      { date: '2026-08-22', totals: { protein_g: 90 } }, // next day (23) has no readiness row
    ]
    const readinessIn = [{ date: '2026-08-21', score: 60 }] // pairs only with day 20
    const out = computeNutritionRecoveryCorrelation(daysIn, readinessIn)
    expect(out.n).toBe(1)
  })

  it('never uses causal language regardless of gate outcome (control across all branches)', () => {
    const cases = [
      computeNutritionRecoveryCorrelation([], []),
      computeNutritionRecoveryCorrelation(days({ '2026-08-20': 80 }), readiness({ '2026-08-21': 60 })),
    ]
    for (const c of cases) expect(c.note).not.toMatch(/because|causes|improves/i)
  })
})
