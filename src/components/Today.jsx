import { useMemo } from 'react'
import { NUTRIENTS, sumEntries, entryNutrient, fmt, num, ymd } from '../lib/nutrition.js'
import { Card, Meter, SourceLabel, StatusTag, Why, Button, EmptyState } from './ui.jsx'

const meta = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]))
const isToday = (d) => ymd(d) === ymd(new Date())
function dayLabel(d) {
  if (isToday(d)) return 'Today'
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (ymd(d) === ymd(y)) return 'Yesterday'
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// One compact context reading (a signal), with source + freshness provenance.
function ContextItem({ label, signal, render }) {
  if (!signal || signal.value == null) {
    return (
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="numeral text-lg text-faint">—</div>
        <StatusTag status="unavailable" />
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="numeral text-lg text-ink">{render(signal.value)}</div>
      <SourceLabel signal={signal} />
    </div>
  )
}

function EntryRow({ entry, onEdit, onDelete }) {
  const food = entry.food || {}
  const pending = entry._pending
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
      <button className="min-w-0 flex-1 text-left disabled:cursor-default" onClick={() => !pending && onEdit(entry)} disabled={pending}>
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">{food.name || 'Food'}</span>
          {pending && <span className="shrink-0 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">pending</span>}
        </div>
        <div className="truncate text-xs text-muted">
          {fmt(entry.servings_consumed, 2)} × {food.serving_size ? `${fmt(food.serving_size, 0)} ${food.serving_unit}` : food.serving_unit || 'serving'}
          {entry.meal ? ` · ${entry.meal}` : ''}
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="numeral text-base text-ink">{fmt(entryNutrient(entry, 'calories'), 0)}</div>
        <div className="eyebrow">kcal</div>
      </div>
      <button onClick={() => onDelete(entry.id)} className="shrink-0 rounded px-2 py-1 text-faint hover:bg-alert/5 hover:text-alert" aria-label="Delete entry">✕</button>
    </div>
  )
}

export default function Today({ date, data, entries, loading, online, syncing, pendingCount, onSync, onEditEntry, onDeleteEntry, onPrevDay, onNextDay, onToday, openAdd }) {
  const totals = useMemo(() => sumEntries(entries), [entries])
  const targets = data?.adjusted || data?.baseline || {}
  const rec = data?.recommendation
  const signals = data?.signals || {}
  const adjustedNote = (data?.rationale || []).length > 0

  const calTarget = num(targets.calories)
  const calLeft = calTarget - num(totals.calories)
  const secondary = NUTRIENTS.filter((n) => n.key !== 'calories')

  return (
    <div className="space-y-5">
      {/* Day nav */}
      <div className="flex items-center justify-between">
        <button onClick={onPrevDay} className="rounded px-2 py-1 text-muted hover:bg-black/5" aria-label="Previous day">‹</button>
        <div className="text-center">
          <div className="serif text-xl text-ink">{dayLabel(date)}</div>
          {!isToday(date) && <button onClick={onToday} className="text-xs font-semibold text-cobalt">Back to today</button>}
        </div>
        <button onClick={onNextDay} disabled={isToday(date)} className="rounded px-2 py-1 text-muted hover:bg-black/5 disabled:opacity-30" aria-label="Next day">›</button>
      </div>

      {(pendingCount > 0 || !online) && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
          <span>{!online && '◐ Offline. '}{pendingCount > 0 ? `${pendingCount} log${pendingCount === 1 ? '' : 's'} waiting to sync` : 'Logs save locally and sync later.'}</span>
          {pendingCount > 0 && online && <button onClick={onSync} disabled={syncing} className="shrink-0 rounded border border-warn/40 px-2 py-1 text-xs font-semibold disabled:opacity-50">{syncing ? 'Syncing…' : 'Sync now'}</button>}
        </div>
      )}

      {/* Context strip — recovery / training, concise, with provenance */}
      <div className="grid grid-cols-3 gap-3">
        <ContextItem label="Readiness" signal={signals.readiness} render={(v) => Math.round(v)} />
        <ContextItem label="Sleep" signal={signals.sleep} render={(v) => `${Number(v).toFixed(1)}h`} />
        <div className="min-w-0">
          <div className="eyebrow">Training</div>
          {signals.workout?.value ? (
            <>
              <div className="numeral truncate text-lg text-ink">{signals.workout.value.shortLabel || signals.workout.value.label || 'Session'}</div>
              <SourceLabel signal={signals.workout} />
            </>
          ) : (
            <>
              <div className="numeral text-lg text-faint">rest</div>
              <StatusTag status="unavailable" />
            </>
          )}
        </div>
      </div>

      {/* The white "next action" sheet — the focal point */}
      {rec && (
        <Card className="border-cobalt/25 p-5 shadow-sm">
          <div className="eyebrow mb-1 text-cobalt">Next action</div>
          <h2 className="serif text-2xl leading-tight text-ink">{rec.title}</h2>
          {rec.detail && <p className="mt-1.5 text-[15px] text-ink/80">{rec.detail}</p>}
          <Why items={rec.why} />
          <div className="mt-4">
            <Button onClick={() => openAdd('menu')} className="w-full">Log food</Button>
          </div>
        </Card>
      )}
      {!rec && (
        <Card className="p-5">
          <div className="eyebrow mb-1 text-cobalt">Next action</div>
          <p className="text-sm text-muted">{loading ? 'Reading your plan…' : 'Log a few items and connect a wearable to get a fueling recommendation.'}</p>
          <div className="mt-4"><Button onClick={() => openAdd('menu')} className="w-full">Log food</Button></div>
        </Card>
      )}

      {/* Compact progress */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="eyebrow">Today's fuel {adjustedNote && <span className="ml-1 text-cobalt">· adjusted</span>}</h3>
          <span className="text-[11px] text-faint">{isToday(date) ? 'so far' : ''}</span>
        </div>
        <div className="mb-4 flex items-end justify-between">
          <div className="numeral text-4xl leading-none text-ink">{fmt(totals.calories, 0)}</div>
          <div className="text-right text-sm text-muted">
            of {fmt(calTarget, 0)} kcal
            {calTarget > 0 && <div className={calLeft < 0 ? 'text-warn' : 'text-good'}>{calLeft < 0 ? `${fmt(-calLeft, 0)} over` : `${fmt(calLeft, 0)} left`}</div>}
          </div>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {secondary.map((n) => {
            const v = num(totals[n.key]); const t = num(targets[n.key])
            return (
              <div key={n.key}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink">{n.label}</span>
                  <span className="text-muted tabular-nums">
                    <span className={t > 0 && v > t ? 'text-warn' : 'text-ink'}>{fmt(v, n.decimals)}</span>
                    {t > 0 ? <span className="text-faint"> / {fmt(t, n.decimals)} {n.unit}</span> : <span className="text-faint"> {n.unit}</span>}
                  </span>
                </div>
                <Meter value={v} target={t} />
              </div>
            )
          })}
        </div>
      </section>

      {/* Chronological log */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="eyebrow">Log</h3>
          <button onClick={() => openAdd('menu')} className="text-xs font-semibold text-cobalt">＋ Add</button>
        </div>
        {loading && entries.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : entries.length === 0 ? (
          <EmptyState title="Nothing logged yet">Tap Log food to scan a barcode, photograph a label, or add manually.</EmptyState>
        ) : (
          <Card className="px-3">
            {entries.map((e) => <EntryRow key={e.id} entry={e} onEdit={onEditEntry} onDelete={onDeleteEntry} />)}
          </Card>
        )}
      </section>
    </div>
  )
}
