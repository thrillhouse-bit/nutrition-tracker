// Body-weight trend: turns noisy daily weigh-ins (water, sodium, food still in
// transit — several pounds of real day-to-day swing with no fat/muscle change
// behind it) into a smoothed direction. Pure functions only — no I/O.
//
// Exponential moving average, the same shape the Hacker's Diet / most
// trend-weight apps use, but with alpha adjusted for the GAP between
// weigh-ins: entries are whatever days a user actually logged, not one row
// per calendar day, so a naive per-entry EMA would treat a 9-day gap the same
// as a 1-day gap and understate how far the trend should have moved by the
// time logging resumed.
const ALPHA = 0.1 // ~10% weight on new data per elapsed day

function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86400000)
}

// entries: [{day: 'YYYY-MM-DD', kg, source?}], sorted ascending by day, one
// per day. Returns the same days with a `trend` alongside each `kg` — the
// trend is only ever defined at an actual weigh-in, never interpolated for a
// day nobody logged. `source` ('manual' | 'apple'), when the caller's
// entries carry one (store.listWeightEntries does, since it merges manual
// and Apple-synced readings), rides through unchanged — the smoothing math
// never depends on it, but callers (the API response, the UI) still want to
// say where each point came from.
export function computeTrend(entries) {
  if (!entries.length) return []
  const point = (e, trend) => (e.source !== undefined ? { day: e.day, kg: e.kg, trend, source: e.source } : { day: e.day, kg: e.kg, trend })
  const out = [point(entries[0], entries[0].kg)]
  for (let i = 1; i < entries.length; i++) {
    const gapDays = Math.max(1, daysBetween(entries[i - 1].day, entries[i].day))
    const effectiveAlpha = 1 - (1 - ALPHA) ** gapDays
    const prevTrend = out[i - 1].trend
    out.push(point(entries[i], prevTrend + effectiveAlpha * (entries[i].kg - prevTrend)))
  }
  return out
}
