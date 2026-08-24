import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client.js'
import { NUTRIENTS, PRIMARY_KEYS, sumEntries, fmt, num, ymd } from '../lib/nutrition.js'
import { Spinner, ErrorNote, Stat } from './ui.jsx'

const meta = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]))

// Build the list of the last `days` calendar days (oldest → newest).
function lastDays(days) {
  const out = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(d)
    day.setDate(day.getDate() - i)
    out.push(day)
  }
  return out
}

export default function HistoryView({ targets, refreshKey }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const DAYS = 30

  useEffect(() => {
    let alive = true
    setLoading(true)
    const days = lastDays(DAYS)
    const from = days[0].toISOString()
    const to = new Date(days[days.length - 1].getTime() + 86400000).toISOString()
    api
      .listEntries({ from, to })
      .then(({ entries }) => alive && setEntries(entries))
      .catch((err) => alive && setError(err.message || 'Could not load history.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [refreshKey])

  const days = useMemo(() => {
    const buckets = new Map()
    for (const e of entries) {
      const key = ymd(e.logged_at)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(e)
    }
    return lastDays(DAYS).map((date) => {
      const key = ymd(date)
      const dayEntries = buckets.get(key) || []
      return { date, key, totals: sumEntries(dayEntries), count: dayEntries.length }
    })
  }, [entries])

  // 7-day average over days that actually have entries (don't dilute with days
  // you weren't tracking).
  const avg7 = useMemo(() => {
    const recent = days.slice(-7).filter((d) => d.count > 0)
    const acc = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]))
    for (const d of recent) for (const n of NUTRIENTS) acc[n.key] += num(d.totals[n.key])
    const n = recent.length || 1
    return { count: recent.length, values: Object.fromEntries(NUTRIENTS.map((x) => [x.key, acc[x.key] / n])) }
  }, [days])

  const maxCal = Math.max(1, ...days.map((d) => num(d.totals.calories)), num(targets?.calories))

  if (loading) return <Spinner label="Loading history…" />
  if (error) return <ErrorNote>{error}</ErrorNote>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          7-day average {avg7.count ? `(${avg7.count} tracked ${avg7.count === 1 ? 'day' : 'days'})` : ''}
        </h3>
        {avg7.count === 0 ? (
          <p className="text-sm text-slate-400">No tracked days in the last week yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {PRIMARY_KEYS.map((k) => (
              <Stat key={k} label={meta[k].label} value={fmt(avg7.values[k], meta[k].decimals)} unit={meta[k].unit} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Daily calories</h3>
        <div className="space-y-1.5">
          {[...days].reverse().map((d) => {
            const cal = num(d.totals.calories)
            const pct = (cal / maxCal) * 100
            const over = num(targets?.calories) > 0 && cal > num(targets.calories)
            return (
              <div key={d.key} className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-xs text-slate-400">
                  {d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-white/5">
                  {d.count > 0 && (
                    <div
                      className={`h-full rounded-md ${over ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  )}
                </div>
                <div className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-300">
                  {d.count ? fmt(cal, 0) : '—'}
                </div>
              </div>
            )
          })}
        </div>
        {num(targets?.calories) > 0 && (
          <p className="mt-2 text-xs text-slate-500">Target: {fmt(targets.calories, 0)} kcal/day</p>
        )}
      </div>
    </div>
  )
}
