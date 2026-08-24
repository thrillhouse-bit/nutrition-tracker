import { useEffect, useMemo, useState } from 'react'
import { fmt, num } from '../lib/nutrition.js'
import { api } from '../api/client.js'
import { Card, EmptyState, Spinner, Stat } from './ui.jsx'

const WINDOWS = [7, 14, 30]

// A compact calorie history — one bar per tracked day, tallest = the window max.
// Purely descriptive: it shows what was logged, it makes no claim about cause.
function CalorieBars({ days }) {
  const max = useMemo(() => Math.max(1, ...days.map((d) => num(d.totals.calories))), [days])
  if (!days.length) return null
  return (
    <div className="flex items-end gap-1" style={{ height: 96 }}>
      {days.map((d) => {
        const v = num(d.totals.calories)
        const pct = Math.max(3, Math.round((v / max) * 100))
        const label = new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
        return (
          <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${label}: ${fmt(v, 0)} kcal`}>
            <div className="flex w-full flex-1 items-end">
              <div className="w-full rounded-t-sm bg-cobalt/80" style={{ height: `${pct}%` }} />
            </div>
            <span className="w-full truncate text-center text-[9px] tabular-nums text-faint">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Insights({ refreshKey }) {
  const [window, setWindow] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.insights(window)
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [window, refreshKey])

  const nutrition = data?.nutrition
  const days = data?.days || []
  const correlations = data?.correlations

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="serif text-2xl text-ink">Insights</h2>
        {/* Window selector */}
        <div className="inline-flex rounded-md border border-line p-0.5 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded px-2.5 py-1 font-semibold transition ${window === w ? 'bg-cobalt text-oncobalt' : 'text-muted hover:text-ink'}`}
            >
              {w}d
            </button>
          ))}
        </div>
      </header>

      {loading && !data ? (
        <Spinner label="Reading your history…" />
      ) : data?.insufficientData ? (
        <EmptyState title="Not enough data yet">
          {nutrition?.trackedDays
            ? `You've logged ${nutrition.trackedDays} of the last ${window} days. A few more days of logging unlocks trends.`
            : 'Log your intake for a few days and trends will appear here.'}
        </EmptyState>
      ) : (
        <>
          {/* Nutrition trends */}
          <section>
            <h3 className="eyebrow mb-2">Averages over {window} days</h3>
            <Card className="grid grid-cols-2 gap-y-5 p-4 sm:grid-cols-4">
              <Stat label="Avg calories" value={num(nutrition?.avgCalories)} unit="kcal" />
              <Stat label="Avg protein" value={num(nutrition?.avgProtein)} unit="g" />
              <Stat label="Days tracked" value={`${nutrition?.trackedDays ?? 0}/${window}`} />
              <Stat label="On-target days" value={num(nutrition?.onTargetDays)} />
            </Card>
          </section>

          {/* Calorie history */}
          {days.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">Calories by day</h3>
              <Card className="p-4">
                <CalorieBars days={days} />
              </Card>
            </section>
          )}

          {/* Recovery / training correlations — cautious, never causal or medical */}
          <section>
            <h3 className="eyebrow mb-2">Recovery &amp; training</h3>
            <Card className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <span aria-hidden className="text-faint">◇</span>
                <span className="font-medium text-ink">Not enough history yet</span>
              </div>
              <p className="text-sm text-muted">
                {correlations?.note ||
                  'Correlations between fueling and recovery need several days of retained wearable history — connect a provider and revisit after a few days.'}
              </p>
              <p className="mt-2 text-xs text-faint">
                Any patterns shown here are descriptive associations from your own logs, not medical or diagnostic conclusions.
              </p>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
