import { useState } from 'react'
import { NUTRIENTS } from '../lib/nutrition.js'
import { Button, Field, SectionTitle, inputCls } from './ui.jsx'

const EMPTY = {
  name: '', brand: '', serving_size: '', serving_unit: 'g',
  calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '', sugar_g: '', sodium_mg: '',
  source: 'manual',
}

// Free-form entry for anything without a barcode or label handy.
export default function ManualEntry({ onSubmit }) {
  const [f, setF] = useState(EMPTY)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const go = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    const food = { ...f }
    for (const n of NUTRIENTS) food[n.key] = f[n.key] === '' ? null : Number(f[n.key])
    food.serving_size = f.serving_size === '' ? null : Number(f.serving_size)
    onSubmit(food)
  }

  return (
    <form noValidate onSubmit={go} className="space-y-4">
      <Field label="Name">
        <input autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="e.g. Deli turkey" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand (optional)">
          <input value={f.brand} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Serving">
            <input type="number" value={f.serving_size} onChange={(e) => set('serving_size', e.target.value)} className={inputCls} placeholder="30" />
          </Field>
          <Field label="Unit">
            <input value={f.serving_unit} onChange={(e) => set('serving_unit', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>
      <div className="space-y-3 border-t border-line pt-4">
        <SectionTitle right={<span className="text-xs text-faint">per serving</span>}>
          Nutrition facts
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {NUTRIENTS.map((n) => (
            <Field key={n.key} label={`${n.label} (${n.unit})`}>
              <input type="number" value={f[n.key]} onChange={(e) => set(n.key, e.target.value)} className={inputCls} />
            </Field>
          ))}
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={!f.name.trim()}>
        Continue
      </Button>
    </form>
  )
}
