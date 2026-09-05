import { useMemo } from 'react'
import { MEALS, entryNutrient, fmt } from '../lib/nutrition.js'
import { EmptyState, TextButton } from './ui.jsx'
import FoodEntryChoices from './FoodEntryChoices.jsx'
import MealMacroSummary from './MealMacroSummary.jsx'


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
    // 24h to match Today's log column — the locale 12h form ("10:05 AM") wraps
    // inside the w-[42px] column this row shares with Today's and breaks the
    // row baselines.
    ? new Date(entry.logged_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''
  return (
    <div className="flex min-h-11 items-center gap-3 border-t border-line py-2.5">
      <button
        // self-stretch: same 44px-row pattern as Today's EntryRow — the button
        // otherwise shrinks to its text and under-fills the touch target.
        className="flex min-w-0 flex-1 items-baseline gap-3 self-stretch text-left disabled:cursor-default"
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
        className="flex h-11 w-11 shrink-0 items-center justify-center text-faint hover:text-alert"
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

      {/* Two entry paths share the global Add food hierarchy. */}
      <section className="space-y-2.5">
        <FoodEntryChoices onChoose={openAdd} />

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
            <TextButton className="-my-2 py-2.5 text-[9.5px] uppercase" onClick={() => openAdd('menu')}>
              Add another food
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
                  onClick={() => (onRelog ? onRelog(f, 'recent') : openAdd('menu'))}
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
            Search for a food or scan a package to add your first item.
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
                <MealMacroSummary entries={g.rows} />
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
