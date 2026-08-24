import { useMemo } from 'react'
import { MEALS, entryNutrient, fmt } from '../lib/nutrition.js'
import { Card, EmptyState } from './ui.jsx'

// The four ways food enters the log. Each opens the shared add-food sheet in
// App at the right step, so the scanning/OCR/search plumbing lives in one place.
const ENTRIES = [
  { key: 'scan', label: 'Scan barcode', hint: 'Packaged groceries', glyph: '▮▮▮' },
  { key: 'label', label: 'Scan label', hint: 'Bulk / deli — photo the panel', glyph: '◱' },
  { key: 'search', label: 'Search foods', hint: 'Produce, no barcode', glyph: '⌕' },
  { key: 'manual', label: 'Manual entry', hint: 'Type the numbers', glyph: '⌨' },
]

// Meal order for grouping; anything untagged sorts last under "Other".
const MEAL_ORDER = [...MEALS, '']
const mealTitle = (m) => (m ? m[0].toUpperCase() + m.slice(1) : 'Other')

function EntryRow({ entry, onEdit, onDelete }) {
  const food = entry.food || {}
  const pending = entry._pending
  const time = entry.logged_at
    ? new Date(entry.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
      <button
        className="min-w-0 flex-1 text-left disabled:cursor-default"
        onClick={() => !pending && onEdit(entry)}
        disabled={pending}
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">{food.name || 'Food'}</span>
          {pending && (
            <span className="shrink-0 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
              pending
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted">
          {time && <span className="tabular-nums">{time}</span>}
          {time && ' · '}
          {fmt(entry.servings_consumed, 2)} ×{' '}
          {food.serving_size ? `${fmt(food.serving_size, 0)} ${food.serving_unit}` : food.serving_unit || 'serving'}
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="numeral text-base text-ink">{fmt(entryNutrient(entry, 'calories'), 0)}</div>
        <div className="eyebrow">kcal</div>
      </div>
      <button
        onClick={() => onDelete(entry.id)}
        className="shrink-0 rounded px-2 py-1 text-faint hover:bg-alert/5 hover:text-alert"
        aria-label="Delete entry"
      >
        ✕
      </button>
    </div>
  )
}

export default function LogView({
  openAdd,
  onEditEntry,
  onDeleteEntry,
  onRelog,
  entries = [],
  recents = [],
  loading,
  online,
  pendingCount = 0,
}) {
  // Group the day's entries by meal, preserving chronological order within each.
  const grouped = useMemo(() => {
    const buckets = new Map(MEAL_ORDER.map((m) => [m, []]))
    for (const e of entries) {
      const key = MEALS.includes(e.meal) ? e.meal : ''
      buckets.get(key).push(e)
    }
    return MEAL_ORDER.map((m) => ({
      meal: m,
      rows: buckets.get(m),
      kcal: buckets.get(m).reduce((a, e) => a + entryNutrient(e, 'calories'), 0),
    })).filter((g) => g.rows.length)
  }, [entries])

  return (
    <div className="space-y-6">
      {/* Entry points */}
      <section>
        <h2 className="eyebrow mb-2">Add to your log</h2>
        <div className="grid grid-cols-2 gap-3">
          {ENTRIES.map((o) => (
            <button
              key={o.key}
              onClick={() => openAdd(o.key)}
              className="flex flex-col items-start gap-1 rounded-lg border border-line bg-card p-4 text-left transition hover:border-cobalt hover:bg-cobalt-soft/40 focus-visible:outline-2"
            >
              <span aria-hidden className="numeral text-lg text-cobalt">{o.glyph}</span>
              <span className="font-semibold text-ink">{o.label}</span>
              <span className="text-xs text-muted">{o.hint}</span>
            </button>
          ))}
        </div>
        {!online && (
          <p className="mt-2 text-xs text-warn">
            ◐ Offline — you can still log; entries queue and sync when you reconnect.
          </p>
        )}
      </section>

      {/* Recents — one-tap re-log */}
      {recents.length > 0 && (
        <section>
          <h2 className="eyebrow mb-2">Recent — tap to re-log</h2>
          <div className="flex flex-col gap-1.5">
            {recents.slice(0, 8).map((f) => (
              <button
                key={f.id}
                onClick={() => (onRelog ? onRelog(f) : openAdd('menu'))}
                className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2 text-left hover:bg-black/5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{f.name}</div>
                  <div className="truncate text-xs text-muted">
                    {f.brand ? `${f.brand} · ` : ''}
                    {f.serving_size ? `${fmt(f.serving_size, 0)} ${f.serving_unit}` : f.serving_unit}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="numeral text-base text-ink">{fmt(f.calories, 0)}</div>
                  <div className="eyebrow">kcal</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Today's log, grouped by meal */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="eyebrow">Logged {pendingCount > 0 && <span className="text-warn">· {pendingCount} pending</span>}</h2>
          <span className="text-[11px] text-faint">by meal</span>
        </div>
        {loading && entries.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : entries.length === 0 ? (
          <EmptyState title="Nothing logged yet">Use an option above to scan, photograph, or type in your first item.</EmptyState>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.meal || 'other'}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="serif text-base text-ink">{mealTitle(g.meal)}</h3>
                  <span className="text-xs text-muted">
                    <span className="numeral text-ink">{fmt(g.kcal, 0)}</span> kcal
                  </span>
                </div>
                <Card className="px-3">
                  {g.rows.map((e) => (
                    <EntryRow key={e.id} entry={e} onEdit={onEditEntry} onDelete={onDeleteEntry} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
