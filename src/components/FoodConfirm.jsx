import { useMemo, useState } from 'react'
import { NUTRIENTS, MEALS, num, fmt } from '../lib/nutrition.js'
import { Button, Card, Field, inputCls } from './ui.jsx'

const CORE_FIELDS = [
  'name', 'brand', 'serving_size', 'serving_unit',
  ...NUTRIENTS.map((n) => n.key),
]

// Units where entering a raw amount (weigh-out) is more natural than a serving
// count — the bulk-bin / deli case.
const MASS_VOLUME = new Set(['g', 'gram', 'grams', 'ml', 'milliliter', 'millilitre', 'oz', 'fl oz', 'l', 'kg'])

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
  const [mode, setMode] = useState('servings') // 'servings' | 'amount'
  const [amount, setAmount] = useState(() => num(food.serving_size) || 100)
  const [meal, setMeal] = useState(defaultMeal())
  const [editing, setEditing] = useState(false)

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const canAmount = MASS_VOLUME.has(String(draft.serving_unit || '').toLowerCase()) && num(draft.serving_size) > 0

  // Nutrients are stored per serving; logging by amount just converts the
  // weighed amount back into a serving multiplier.
  const effServings = mode === 'amount' && canAmount ? num(amount) / num(draft.serving_size) : num(servings)

  const totals = useMemo(
    () => Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(draft[n.key]) * effServings])),
    [draft, effServings],
  )

  const submit = () => {
    const payload = { servings_consumed: num(effServings) || 1, meal }
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
            <h3 className="serif text-xl font-semibold leading-tight text-ink">{draft.name || 'Food'}</h3>
            {draft.brand && <p className="text-sm text-muted">{draft.brand}</p>}
          </div>
          <span className="eyebrow shrink-0 rounded-md border border-line px-2 py-1 text-muted">
            {draft.source || 'manual'}
          </span>
        </div>
      </div>

      {/* Quantity selector: servings, or a weighed amount for bulk items */}
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="eyebrow">Quantity</div>
          {canAmount && (
            <div className="flex rounded-md border border-line p-0.5 text-xs">
              <button
                onClick={() => setMode('servings')}
                className={`rounded-md px-2 py-1 ${mode === 'servings' ? 'bg-cobalt text-oncobalt' : 'text-muted'}`}
              >
                Servings
              </button>
              <button
                onClick={() => setMode('amount')}
                className={`rounded-md px-2 py-1 lowercase ${mode === 'amount' ? 'bg-cobalt text-oncobalt' : 'text-muted'}`}
              >
                {draft.serving_unit}
              </button>
            </div>
          )}
        </div>

        {mode === 'amount' && canAmount ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} numeral text-center text-lg`}
            />
            <span className="text-muted">{draft.serving_unit}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => step(-0.5)} aria-label="Fewer servings">−</Button>
            <input
              type="number"
              step="0.25"
              min="0"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              className={`${inputCls} numeral text-center text-lg`}
            />
            <Button variant="outline" onClick={() => step(0.5)} aria-label="More servings">+</Button>
          </div>
        )}

        <div className="mt-2 text-xs text-faint">
          {mode === 'amount' && canAmount
            ? `≈ ${fmt(effServings, 2)} serving${effServings === 1 ? '' : 's'} (1 = ${fmt(draft.serving_size, 0)} ${draft.serving_unit})`
            : `1 serving = ${draft.serving_size ? fmt(draft.serving_size, 2) : '1'} ${draft.serving_unit || 'serving'}`}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`rounded-full px-3 py-1 text-sm capitalize transition ${
                meal === m ? 'bg-cobalt text-oncobalt' : 'border border-line text-muted hover:bg-black/5'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </Card>

      {/* Totals for the chosen quantity */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NUTRIENTS.map((n) => (
          <div key={n.key} className="rounded-md border border-line bg-card px-3 py-2">
            <div className="numeral text-lg leading-none text-ink">
              {fmt(totals[n.key], n.decimals)}
              <span className="ml-0.5 font-sans text-xs font-normal text-muted">{n.unit}</span>
            </div>
            <div className="eyebrow mt-1">{n.label}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setEditing((e) => !e)}
        className="text-sm font-semibold text-cobalt hover:brightness-110"
      >
        {editing ? 'Hide details' : 'Edit details'}
      </button>

      {editing && (
        <div className="space-y-3 rounded-lg border border-line bg-card p-3">
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
          <p className="text-xs text-faint">Values are per single serving.</p>
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
