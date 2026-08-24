import { useMemo, useState } from 'react'
import { NUTRIENTS, MEALS, num, fmt } from '../lib/nutrition.js'
import { Button, Field, inputCls } from './ui.jsx'

const CORE_FIELDS = [
  'name', 'brand', 'serving_size', 'serving_unit',
  ...NUTRIENTS.map((n) => n.key),
]

function coreChanged(a, b) {
  return CORE_FIELDS.some((k) => (a[k] ?? '') !== (b[k] ?? ''))
}

// Guess a sensible default meal from the local hour.
function defaultMeal() {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export default function FoodConfirm({ food, onLog, onBack, logging }) {
  const [draft, setDraft] = useState(() => ({ ...food }))
  const [servings, setServings] = useState(1)
  const [meal, setMeal] = useState(defaultMeal())
  const [editing, setEditing] = useState(false)

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const totals = useMemo(() => {
    const s = num(servings)
    return Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(draft[n.key]) * s]))
  }, [draft, servings])

  const submit = () => {
    const payload = { servings_consumed: num(servings) || 1, meal }
    // Don't mutate a canonical cached/looked-up product: if the user edited the
    // numbers, log a fresh food instead of overwriting the shared one.
    if (food.id && !coreChanged(food, draft)) {
      payload.food_id = food.id
    } else {
      const { id, created_at, ...rest } = draft
      payload.food = rest
    }
    onLog(payload)
  }

  const step = (delta) => setServings((s) => Math.max(0.25, Math.round((num(s) + delta) * 100) / 100))

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold leading-tight text-slate-50">{draft.name || 'Food'}</h3>
            {draft.brand && <p className="text-sm text-slate-400">{draft.brand}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-400">
            {draft.source || 'manual'}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Per serving: {draft.serving_size ? fmt(draft.serving_size, 2) : '1'} {draft.serving_unit || 'serving'}
        </p>
      </div>

      {/* Servings selector */}
      <div className="rounded-2xl bg-white/5 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Servings</div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => step(-0.5)} aria-label="Fewer servings">−</Button>
          <input
            type="number"
            step="0.25"
            min="0"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className={`${inputCls} text-center text-lg font-bold`}
          />
          <Button variant="outline" onClick={() => step(0.5)} aria-label="More servings">+</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`rounded-full px-3 py-1 text-sm capitalize transition ${
                meal === m ? 'bg-emerald-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Totals for the chosen serving count */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NUTRIENTS.map((n) => (
          <div key={n.key} className="rounded-xl bg-white/5 px-3 py-2">
            <div className="text-sm font-bold tabular-nums text-slate-50">
              {fmt(totals[n.key], n.decimals)}
              <span className="ml-0.5 text-xs font-normal text-slate-400">{n.unit}</span>
            </div>
            <div className="text-[11px] text-slate-400">{n.label}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setEditing((e) => !e)}
        className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
      >
        {editing ? 'Hide details' : 'Edit details'}
      </button>

      {editing && (
        <div className="space-y-3 rounded-2xl border border-white/10 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input value={draft.name || ''} onChange={(e) => set('name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Brand">
              <input value={draft.brand || ''} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Serving size">
              <input type="number" value={draft.serving_size ?? ''} onChange={(e) => set('serving_size', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Serving unit">
              <input value={draft.serving_unit || ''} onChange={(e) => set('serving_unit', e.target.value)} className={inputCls} />
            </Field>
            {NUTRIENTS.map((n) => (
              <Field key={n.key} label={`${n.label} (${n.unit})`}>
                <input
                  type="number"
                  value={draft[n.key] ?? ''}
                  onChange={(e) => set(n.key, e.target.value === '' ? null : Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
            ))}
          </div>
          <p className="text-xs text-slate-500">Values are per single serving.</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="flex-1">
            Back
          </Button>
        )}
        <Button onClick={submit} disabled={logging} className="flex-[2]">
          {logging ? 'Logging…' : 'Log it'}
        </Button>
      </div>
    </div>
  )
}
