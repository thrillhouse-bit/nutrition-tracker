import { useMemo } from 'react'
import { MEALS, entryNutrient, fmt } from '../lib/nutrition.js'
import { EmptyState, TextButton } from './ui.jsx'

// The alternative capture methods, below the primary (barcode) card. Each opens
// the shared add-food sheet in App at the right step, so the scanning / OCR /
// search / manual plumbing lives in one place — these are just entry points.
const ALTS = [
  { key: 'label', title: 'Photograph the label', caption: 'On-device OCR. Works offline.' },
  { key: 'manual', title: 'Enter it manually', caption: 'Search, or type the panel yourself.' },
  { key: 'search', title: 'Search foods', caption: 'Find produce and items without a barcode.' },
]

// Meal order for grouping; anything untagged sorts last under "Other".
const MEAL_ORDER = [...MEALS, '']
const mealTitle = (m) => (m ? m[0].toUpperCase() + m.slice(1) : 'Other')

// The muted stat line under a recent food: "170 G · 146 KCAL · 17 P". Rendered
// uppercase + tnum, so it reads as the label micro-type from the design.
function recentMeta(f) {
  const parts = []
  if (f.serving_size) parts.push(`${fmt(f.serving_size, 0)} ${f.serving_unit || ''}`.trim())
  else if (f.serving_unit) parts.push(f.serving_unit)
  parts.push(`${fmt(f.calories, 0)} kcal`)
  parts.push(`${fmt(f.protein_g, 0)} P`)
  return parts.join(' · ')
}

function EntryRow({ entry, onEdit, onDelete }) {
  const food = entry.food || {}
  const pending = entry._pending
  const time = entry.logged_at
    ? new Date(entry.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5">
      <button
        className="flex min-w-0 flex-1 items-baseline gap-3 text-left disabled:cursor-default"
        onClick={() => !pending && onEdit(entry)}
        disabled={pending}
      >
        {time && <span className="w-[42px] shrink-0 text-[10.5px] font-medium text-faint tnum">{time}</span>}
        <span className="min-w-0 flex-1">
          <span className="text-[14.5px] leading-[1.2] text-ink">{food.name || 'Food'}</span>
          {pending && (
            <span className="ml-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">· Pending</span>
          )}
          <span className="mt-0.5 block truncate text-[10px] text-muted tnum">
            {fmt(entry.servings_consumed, 2)} ×{' '}
            {food.serving_size ? `${fmt(food.serving_size, 0)} ${food.serving_unit}` : food.serving_unit || 'serving'}
          </span>
        </span>
      </button>
      <span className="numeral shrink-0 text-[17px] text-ink">{fmt(entryNutrient(entry, 'calories'), 0)}</span>
      <button
        onClick={() => onDelete(entry.id)}
        className="shrink-0 px-1.5 py-1 text-faint hover:text-alert"
        aria-label="Delete entry"
      >
        ✕
      </button>
    </div>
  )
}

export default function LogView({
  date,
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
      {/* Header — Bodoni title + entry count, hairline rule beneath */}
      <div className="flex items-baseline justify-between border-b border-line-strong pb-3.5">
        <h1 className="serif text-[32px] leading-none text-ink">Log</h1>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted tnum">
          {entries.length} {entries.length === 1 ? 'Entry' : 'Entries'} today
        </span>
      </div>

      {/* Capture methods — the primary cobalt card and its alternatives */}
      <section className="space-y-2.5">
        {/* PRIMARY — the white-on-cobalt "moment that matters" */}
        <div className="bg-cobalt px-[18px] pb-[18px] pt-5 text-oncobalt">
          <div className="flex items-baseline justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]">Primary</span>
            <span className="text-[9.5px] font-medium uppercase tracking-[0.12em] opacity-75">Camera ready</span>
          </div>
          <div className="serif mt-3 text-[30px] leading-[1.05]">Scan a barcode</div>
          <div className="mt-[18px] flex items-center gap-4">
            {/* Barcode viewfinder — corner brackets + scan line, in white */}
            <div aria-hidden className="relative h-14 w-24 shrink-0">
              <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-white" />
              <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-white" />
              <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-white" />
              <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-white" />
              <span className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-white" />
            </div>
            <p className="text-[12.5px] leading-[1.45] opacity-90">
              Fastest path — matched against your saved foods first, then the open database.
            </p>
          </div>
          <button
            onClick={() => openAdd('scan')}
            className="mt-[18px] block w-full bg-card py-4 text-center text-xs font-bold uppercase tracking-[0.14em] text-cobalt transition hover:bg-cobalt-soft"
          >
            Open scanner
          </button>
        </div>

        {/* ALTERNATIVES — equal-weight ink-outline cards */}
        <div className="grid grid-cols-2 gap-2.5">
          {ALTS.map((a) => (
            <button
              key={a.key}
              onClick={() => openAdd(a.key)}
              className="border-[1.5px] border-ink px-3.5 py-[15px] text-left transition hover:bg-fill"
            >
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">Alternative</div>
              <div className="serif mt-2.5 text-[19px] leading-[1.15] text-ink">{a.title}</div>
              <div className="mt-2 text-[11px] leading-[1.4] text-muted">{a.caption}</div>
            </button>
          ))}
        </div>

        {/* Offline note — logging still works and queues */}
        {!online && (
          <div className="flex items-center gap-2 border border-line bg-fill px-3 py-2 text-[11px] text-muted">
            <span aria-hidden className="h-2 w-2 shrink-0 bg-ink" />
            <span>Offline — logging still works. Entries queue and sync when you reconnect.</span>
          </div>
        )}
      </section>

      {/* QUICK ADD · RECENT — one-tap re-log of recent foods */}
      {recents.length > 0 && (
        <section>
          <div className="flex items-center justify-between pb-1.5">
            <h2 className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">Quick add · Recent</h2>
            <TextButton className="text-[9.5px] uppercase" onClick={() => openAdd('menu')}>
              All foods
            </TextButton>
          </div>
          <div>
            {recents.slice(0, 6).map((f) => (
              <div key={f.id} className="flex items-center gap-3 border-t border-line py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] leading-[1.2] text-ink">{f.name}</div>
                  <div className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted tnum">
                    {recentMeta(f)}
                  </div>
                </div>
                <button
                  onClick={() => (onRelog ? onRelog(f) : openAdd('menu'))}
                  aria-label={`Re-log ${f.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center border-[1.5px] border-cobalt text-[21px] leading-none text-cobalt transition hover:bg-cobalt hover:text-oncobalt"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TODAY'S LOG — the meal-grouped record, kept as a secondary section */}
      <section>
        <div className="mb-3 flex items-baseline justify-between border-b border-line-strong pb-2">
          <h2 className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">Today's log</h2>
          {pendingCount > 0 && (
            <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted tnum">
              {pendingCount} pending
            </span>
          )}
        </div>
        {loading && entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">Loading…</div>
        ) : entries.length === 0 ? (
          <EmptyState title="Nothing logged yet">
            Scan, photograph, search, or type in your first item above.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {grouped.map((g) => (
              <div key={g.meal || 'other'}>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="serif text-[19px] leading-none text-ink">{mealTitle(g.meal)}</h3>
                  <span className="text-xs text-muted">
                    <span className="numeral text-ink">{fmt(g.kcal, 0)}</span> kcal
                  </span>
                </div>
                <div>
                  {g.rows.map((e) => (
                    <EntryRow key={e.id} entry={e} onEdit={onEditEntry} onDelete={onDeleteEntry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
