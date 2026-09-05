import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { Button, ErrorNote, Field, inputCls, Sheet } from './ui.jsx'
import { editQuantity, quantityDraft, validWaterQuantity } from '../lib/hydration.js'

export default function HydrationSettings({ preferences, onSaved, onClose }) {
  const initial = useRef(preferences).current
  const [unit, setUnit] = useState(initial.unit)
  const [goal, setGoal] = useState(() => quantityDraft(initial.goal_ml, initial.unit))
  const [vessels, setVessels] = useState(() => initial.quick_add_ml.map(ml => quantityDraft(ml, initial.unit)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [invalid, setInvalid] = useState(null)
  const inputs = useRef([])
  const submitting = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const state = useRef({})
  const dirty = unit !== initial.unit || goal.ml !== initial.goal_ml || vessels.some((v, i) => v.ml !== initial.quick_add_ml[i])
  state.current = { busy, dirty, onClose }
  const close = useCallback(() => {
    if (state.current.busy) return
    if (state.current.dirty) setDiscard(true)
    else state.current.onClose()
  }, [])
  const changeUnit = (next) => {
    setUnit(next)
    setGoal(v => Number.isFinite(v.ml) ? quantityDraft(v.ml, next) : v)
    setVessels(v => v.map(q => Number.isFinite(q.ml) ? quantityDraft(q.ml, next) : q))
  }
  async function save(event) {
    event.preventDefault()
    if (submitting.current) return
    if (goal.ml !== null && !validWaterQuantity(goal.ml)) { setInvalid(0); setError('Enter a positive goal up to 10 L, or clear it.'); inputs.current[0]?.focus(); return }
    const invalidVessel = vessels.findIndex(v => !validWaterQuantity(v.ml))
    if (invalidVessel >= 0) { setInvalid(invalidVessel + 1); setError('Each quick-add amount must be positive and no more than 10 L.'); inputs.current[invalidVessel + 1]?.focus(); return }
    const patch = {}
    if (unit !== initial.unit) patch.unit = unit
    if (goal.ml !== initial.goal_ml) patch.goal_ml = goal.ml
    if (vessels.some((v, i) => v.ml !== initial.quick_add_ml[i])) patch.quick_add_ml = vessels.map(v => v.ml)
    if (!Object.keys(patch).length) { onClose(); return }
    submitting.current = true; setBusy(true); setError(''); setInvalid(null)
    try { const result = await api.setHydrationPreferences(patch); if (alive.current) onSaved(result.preferences) }
    catch (err) { if (alive.current) setError(err.message || 'Could not save hydration preferences. Your changes are still here.') }
    finally { submitting.current = false; if (alive.current) setBusy(false) }
  }
  const unitLabel = unit === 'oz' ? 'US fl oz' : 'mL'
  return <Sheet open onClose={close} title="Your hydration preferences">
    <p className="text-sm text-muted">Choose how you log water. A goal is your own preference, not a fluid recommendation from Body Current.</p>
    <form noValidate onSubmit={save} className="mt-4 space-y-4">
      <fieldset disabled={busy} className="space-y-4 border-0 p-0">
        <Field label="Preferred unit"><select className={inputCls} value={unit} onChange={e => changeUnit(e.target.value)}><option value="ml">mL</option><option value="oz">US fl oz</option></select></Field>
        <Field label={`Daily water goal (${unitLabel})`} hint="Optional. Leave blank to track intake without a goal."><input ref={el => { inputs.current[0] = el }} aria-invalid={invalid === 0} aria-describedby={invalid === 0 ? 'hydration-settings-error' : undefined} className={inputCls} inputMode="decimal" value={goal.text} onChange={e => setGoal(editQuantity(e.target.value, unit))} /></Field>
        {goal.ml !== null && <Button variant="subtle" onClick={() => setGoal(quantityDraft(null, unit))}>Remove goal</Button>}
        <div><div className="eyebrow">Your quick-add amounts</div><p className="mt-1 text-xs text-muted">Use the sizes of your usual cup or bottle.</p></div>
        {vessels.map((q, i) => <Field key={i} label={`Quick add ${i + 1} (${unitLabel})`}><input ref={el => { inputs.current[i + 1] = el }} aria-invalid={invalid === i + 1} aria-describedby={invalid === i + 1 ? 'hydration-settings-error' : undefined} className={inputCls} inputMode="decimal" value={q.text} onChange={e => setVessels(v => v.map((value, index) => index === i ? editQuantity(e.target.value, unit) : value))} /></Field>)}
      </fieldset>
      <div id="hydration-settings-error" role="alert"><ErrorNote>{error}</ErrorNote></div>
      {discard && <div className="border border-line p-3" role="group" aria-label="Unsaved hydration preferences"><p className="text-sm">Discard your unsaved changes?</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="subtle" onClick={onClose}>Discard changes</Button></div></div>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="subtle" onClick={close} disabled={busy}>Cancel</Button><Button className="min-w-44" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Save preferences'}</Button></div>
    </form>
  </Sheet>
}
