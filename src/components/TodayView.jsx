import { useMemo } from 'react'
import { NUTRIENTS, PRIMARY_KEYS, MEALS, sumEntries, entryNutrient, fmt, num, ymd } from '../lib/nutrition.js'
import { TargetBar, Spinner } from './ui.jsx'

const nutrientMeta = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]))

function isToday(date) {
  return ymd(date) === ymd(new Date())
}

function dayLabel(date) {
  if (isToday(date)) return 'Today'
  const d = new Date(date)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (ymd(d) === ymd(yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function EntryRow({ entry, onEdit, onDelete }) {
  const food = entry.food || {}
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
      <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(entry)}>
        <div className="truncate font-medium text-slate-100">{food.name || 'Food'}</div>
        <div className="truncate text-xs text-slate-400">
          {fmt(entry.servings_consumed, 2)} × {food.serving_size ? `${fmt(food.serving_size, 0)} ${food.serving_unit}` : (food.serving_unit || 'serving')}
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums text-slate-50">{fmt(entryNutrient(entry, 'calories'), 0)}</div>
        <div className="text-[11px] text-slate-400">kcal</div>
      </div>
      <button
        onClick={() => onDelete(entry.id)}
        className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
        aria-label="Delete entry"
      >
        ✕
      </button>
    </div>
  )
}

export default function TodayView({ date, entries, targets, loading, onEdit, onDelete, onPrevDay, onNextDay, onToday }) {
  const totals = useMemo(() => sumEntries(entries), [entries])

  const byMeal = useMemo(() => {
    const groups = Object.fromEntries([...MEALS, 'other'].map((m) => [m, []]))
    for (const e of entries) groups[e.meal && groups[e.meal] ? e.meal : 'other'].push(e)
    return groups
  }, [entries])

  const calTarget = num(targets?.calories)
  const calRemaining = calTarget - num(totals.calories)

  return (
    <div className="space-y-5">
      {/* Day header */}
      <div className="flex items-center justify-between">
        <button onClick={onPrevDay} className="rounded-lg px-3 py-1.5 text-slate-400 hover:bg-white/5" aria-label="Previous day">‹</button>
        <div className="text-center">
          <div className="text-lg font-bold text-slate-50">{dayLabel(date)}</div>
          {!isToday(date) && (
            <button onClick={onToday} className="text-xs font-medium text-emerald-400">Jump to today</button>
          )}
        </div>
        <button
          onClick={onNextDay}
          disabled={isToday(date)}
          className="rounded-lg px-3 py-1.5 text-slate-400 hover:bg-white/5 disabled:opacity-30"
          aria-label="Next day"
        >›</button>
      </div>

      {/* Calorie headline */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-4 text-center">
        <div className="text-4xl font-black tabular-nums text-slate-50">{fmt(totals.calories, 0)}</div>
        <div className="text-sm text-slate-400">
          of {fmt(calTarget, 0)} kcal
          {calTarget > 0 && (
            <span className={calRemaining < 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {' '}· {calRemaining < 0 ? `${fmt(-calRemaining, 0)} over` : `${fmt(calRemaining, 0)} left`}
            </span>
          )}
        </div>
      </div>

      {/* Macro + micro bars */}
      <div className="grid gap-3 sm:grid-cols-2">
        {NUTRIENTS.filter((n) => n.key !== 'calories').map((n) => (
          <TargetBar
            key={n.key}
            label={n.label}
            value={totals[n.key]}
            target={num(targets?.[n.key])}
            unit={n.unit}
            decimals={n.decimals}
          />
        ))}
      </div>

      {/* Log */}
      {loading ? (
        <Spinner label="Loading…" />
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-slate-400">
          Nothing logged {isToday(date) ? 'yet today' : 'this day'}. Tap <span className="font-bold text-emerald-400">＋</span> to scan or add food.
        </div>
      ) : (
        <div className="space-y-4">
          {[...MEALS, 'other'].map((m) =>
            byMeal[m].length ? (
              <div key={m}>
                <div className="mb-1.5 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{m === 'other' ? 'Untagged' : m}</h4>
                  <span className="text-xs tabular-nums text-slate-500">
                    {fmt(sumEntries(byMeal[m]).calories, 0)} kcal
                  </span>
                </div>
                <div className="space-y-1.5">
                  {byMeal[m].map((e) => (
                    <EntryRow key={e.id} entry={e} onEdit={onEdit} onDelete={onDelete} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
