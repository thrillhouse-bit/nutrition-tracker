import { useState } from 'react'
import { NUTRIENTS } from '../lib/nutrition.js'
import { Button, Field, ErrorNote, inputCls } from './ui.jsx'

// Edit daily targets. Saving writes a new versioned row server-side (history of
// prior targets is kept), and the latest one drives the Today rings.
export default function TargetsEditor({ targets, onSave, health }) {
  const [t, setT] = useState(() => {
    const base = {}
    for (const n of NUTRIENTS) base[n.key] = targets?.[n.key] ?? ''
    return base
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  const set = (k, v) => setT((p) => ({ ...p, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {}
      for (const n of NUTRIENTS) payload[n.key] = t[n.key] === '' ? null : Number(t[n.key])
      await onSave(payload)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err.message || 'Could not save targets.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-4">
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Daily targets</h3>
          <div className="grid grid-cols-2 gap-3">
            {NUTRIENTS.map((n) => (
              <Field key={n.key} label={`${n.label} (${n.unit})`}>
                <input
                  type="number"
                  value={t[n.key]}
                  onChange={(e) => set(n.key, e.target.value)}
                  className={inputCls}
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Leave a field blank to hide its ring on the Today screen.</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save targets'}</Button>
          {savedAt > 0 && !saving && <span className="text-sm text-emerald-400">Saved ✓</span>}
        </div>
      </form>

      {health && (
        <div className="rounded-2xl border border-white/10 p-3 text-sm">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Server status</h3>
          <dl className="grid grid-cols-2 gap-y-1 text-slate-300">
            <dt className="text-slate-500">Storage</dt>
            <dd className="text-right tabular-nums">{health.backend}</dd>
            <dt className="text-slate-500">Label OCR (Claude)</dt>
            <dd className={`text-right ${health.ocr === 'configured' ? 'text-emerald-400' : 'text-amber-400'}`}>{health.ocr}</dd>
            <dt className="text-slate-500">USDA fallback</dt>
            <dd className={`text-right ${health.usda === 'configured' ? 'text-emerald-400' : 'text-slate-400'}`}>{health.usda}</dd>
            <dt className="text-slate-500">Oura wearable</dt>
            <dd className={`text-right ${health.oura === 'configured' ? 'text-emerald-400' : 'text-slate-400'}`}>{health.oura || 'not-configured'}</dd>
          </dl>
          {health.backend === 'json-file' && (
            <p className="mt-2 text-xs text-slate-500">
              Using the local JSON store. Set <code className="text-slate-300">DATABASE_URL</code> (Neon) to sync across devices.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
