// "What we notice" card (Insights tab): a single honest correlation between
// logged protein intake and the FOLLOWING day's Oura readiness score. Pure
// functions only — no I/O, mirrors server/weightTrend.js's shape.
//
// PAIRING — protein_g (day D) vs readiness score (day D+1), not same-day.
// Oura computes a day's readiness score overnight from the PRIOR day's
// activity/HRV/sleep, so a same-day pairing would partly compare today's
// protein against a score that was already mostly determined before today's
// meals happened. Recovery physiology also runs on a lag: whatever protein
// contributes to overnight repair from a day's eating shows up, if anywhere,
// in how recovered the body reads the FOLLOWING morning, not the same one.
// `workoutLoad.minutes` -> next-day readiness was the other well-reasoned
// candidate named in the brief (training stress and its next-day recovery
// cost), but `days` (nutrition) has an entry for every day the user logged
// ANY food, while `workoutLoad` only has a row on days with an actual
// workout — a sparser series that would clear MIN_OVERLAP_DAYS far less
// often inside a 7/14-day window. Protein (rather than calories) was chosen
// as the nutrition side because it is the nutrient most directly tied to
// recovery/repair physiology, not because it happened to correlate better in
// any sample seen while building this.
//
// GATING — two independent floors, both must pass. This mirrors the house
// rule against a permanently-unbuilt feature wearing an honest-empty-state
// costume, but pointed the other way: it is just as easy to wear a
// FABRICATED-signal costume by reporting whatever a handful of noisy points
// happen to show. Meeting only one floor is exactly that shape.
//   MIN_OVERLAP_DAYS = 6 — below this, a single outlier day-pair can swing r
//     by more than the entire observed effect (at n=5, one point is 20% of
//     the sample). 6 is the low end of a defensible floor, chosen so the
//     card can still open within a single 7-day window when a user has
//     logged food and had a synced score on nearly every day of it.
//   R_THRESHOLD = 0.5 — deliberately above the textbook "weak" floor of 0.3.
//     This app has no stats library and computes no p-value, so effect size
//     is the ONLY defense against a chance correlation; at the sample sizes
//     available here (a 7-30 day window, i.e. n in roughly the 6-29 range),
//     a 0.3 floor sits comfortably inside what random noise alone produces.
//     Raising the bar to "moderate-to-strong" (Cohen's convention) is a
//     deliberate substitute for the significance test this file cannot run.
export const MIN_OVERLAP_DAYS = 6
export const R_THRESHOLD = 0.5

// Pearson product-moment correlation coefficient over two equal-length
// numeric series. Pure, no I/O, no stats-library dependency — the standard,
// defensible choice for a linear relationship between two continuous
// series. Returns null when undefined (fewer than 2 points, or either
// series has zero variance — a flat line has no slope to measure).
export function pearsonR(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return null
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return null
  return num / Math.sqrt(denX * denY)
}

function nextDayYmd(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const round2 = (x) => Math.round(x * 100) / 100

// days: [{date: 'YYYY-MM-DD', totals: {protein_g, ...}}] — real per-day
//   nutrition totals, one entry per day the user logged any food.
// ouraReadiness: [{date: 'YYYY-MM-DD', score}] — real per-day readiness,
//   already the response shape (see server/index.js's GET /insights).
// Returns the `correlations` object the /insights response embeds directly:
// { available, r, n, note }. `r`/`n` ride alongside `note` so the claim is
// falsifiable/auditable rather than just a sentence to take on faith — the
// same reasoning the Readiness/Training-load sections show real averages
// instead of vague copy.
export function computeNutritionRecoveryCorrelation(days, ouraReadiness) {
  if (!ouraReadiness || ouraReadiness.length === 0) {
    return {
      available: false,
      r: null,
      n: null,
      note: 'No wearable readiness data connected yet — connect a provider to unlock this observation.',
    }
  }

  const readinessByDate = new Map(ouraReadiness.map((r) => [r.date, r.score]))
  const xs = []
  const ys = []
  for (const day of days || []) {
    const protein = Number(day?.totals?.protein_g)
    if (!Number.isFinite(protein)) continue
    const nextScore = readinessByDate.get(nextDayYmd(day.date))
    if (!Number.isFinite(nextScore)) continue
    xs.push(protein)
    ys.push(nextScore)
  }
  const n = xs.length

  if (n < MIN_OVERLAP_DAYS) {
    return {
      available: false,
      r: null,
      n,
      note: `Only ${n} day${n === 1 ? '' : 's'} so far with both a logged protein total and next-day readiness — need at least ${MIN_OVERLAP_DAYS} overlapping days before an observation is reliable.`,
    }
  }

  const r = pearsonR(xs, ys)
  if (r == null) {
    return {
      available: false,
      r: null,
      n,
      note: `${n} overlapping days with next-day readiness, but protein or readiness hasn't varied at all in that stretch, so there's nothing to compare yet.`,
    }
  }

  const roundedR = round2(r)
  if (Math.abs(roundedR) < R_THRESHOLD) {
    return {
      available: false,
      r: roundedR,
      n,
      note: `${n} overlapping days with next-day readiness show no clear relationship yet (r=${roundedR.toFixed(2)}) — that may change as more history accumulates.`,
    }
  }

  const direction = roundedR > 0 ? 'higher' : 'lower'
  return {
    available: true,
    r: roundedR,
    n,
    note: `Days you logged more protein tended to show ${direction} next-day readiness (r=${roundedR.toFixed(2)} over ${n} days).`,
  }
}
