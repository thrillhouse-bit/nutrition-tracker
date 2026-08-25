import { describe, it, expect } from 'vitest'
import { computeTrend } from '../server/weightTrend.js'

describe('computeTrend', () => {
  it('returns an empty array for no entries (control)', () => {
    expect(computeTrend([])).toEqual([])
  })

  it('seeds the trend at the first reading — no history to smooth against yet', () => {
    const out = computeTrend([{ day: '2026-08-01', kg: 80 }])
    expect(out).toEqual([{ day: '2026-08-01', kg: 80, trend: 80 }])
  })

  it('holds steady when every reading matches the seed (control)', () => {
    const out = computeTrend([
      { day: '2026-08-01', kg: 80 },
      { day: '2026-08-02', kg: 80 },
      { day: '2026-08-03', kg: 80 },
    ])
    expect(out.map((e) => e.trend)).toEqual([80, 80, 80])
  })

  it('moves the trend by exactly alpha (0.1) of the gap toward a one-day step', () => {
    const out = computeTrend([
      { day: '2026-08-01', kg: 80 },
      { day: '2026-08-02', kg: 82 }, // a 2kg jump — mostly water/food, not fat
    ])
    // trend[1] = 80 + 0.1 * (82 - 80) = 80.2 — the smoothed line moves a
    // small fraction toward the new reading, not all the way to it.
    expect(out[1].trend).toBeCloseTo(80.2, 5)
    expect(out[1].kg).toBe(82) // the raw reading itself is never smoothed
  })

  it('a skipped day counts for more than a logged one — gap-adjusted alpha, not a flat per-entry step', () => {
    // Same 2kg jump, but arriving after a 5-day gap instead of 1. The
    // trend should move FURTHER toward the new reading than the one-day
    // case above, because effectiveAlpha = 1 - (1-0.1)^gapDays grows with
    // the gap — a naive per-entry EMA would move by the same 0.2kg either
    // way, which is the exact bug this test guards against.
    const oneDay = computeTrend([{ day: '2026-08-01', kg: 80 }, { day: '2026-08-02', kg: 82 }])
    const fiveDay = computeTrend([{ day: '2026-08-01', kg: 80 }, { day: '2026-08-06', kg: 82 }])
    expect(fiveDay[1].trend).toBeGreaterThan(oneDay[1].trend)
    // effectiveAlpha for a 5-day gap = 1 - 0.9^5 ≈ 0.40951
    expect(fiveDay[1].trend).toBeCloseTo(80 + (1 - 0.9 ** 5) * 2, 5)
  })

  it('treats a same-day re-log or an out-of-order gap as at least a 1-day step (control)', () => {
    // Entries are assumed sorted ascending and one-per-day by the caller, but
    // the gap floor (Math.max(1, ...)) means a zero/negative gap can never
    // divide-by-zero or invert the direction of smoothing.
    const out = computeTrend([{ day: '2026-08-02', kg: 80 }, { day: '2026-08-01', kg: 82 }])
    expect(out[1].trend).toBeCloseTo(80.2, 5)
  })

  it('follows a sustained decrease in the same direction as the readings, gradually not instantly', () => {
    const out = computeTrend([
      { day: '2026-08-01', kg: 90 },
      { day: '2026-08-02', kg: 89 },
      { day: '2026-08-03', kg: 88 },
      { day: '2026-08-04', kg: 87 },
    ])
    const trends = out.map((e) => e.trend)
    // Strictly decreasing, but every step stays above the actual reading —
    // the trend lags a real sustained change rather than tracking it exactly.
    for (let i = 1; i < trends.length; i++) {
      expect(trends[i]).toBeLessThan(trends[i - 1])
      expect(trends[i]).toBeGreaterThan(out[i].kg)
    }
  })
})
