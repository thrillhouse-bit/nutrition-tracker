import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { ymd } from '../lib/nutrition.js'
import { Button, TextButton, ErrorNote } from './ui.jsx'
import HydrationSettings from './HydrationSettings.jsx'
import { DEFAULT_HYDRATION, waterAmount, quantityDraft, editQuantity } from '../lib/hydration.js'
const isToday = d => ymd(d) === ymd(new Date())
const timeHm = iso => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

function localDateTimeValue(date) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dateTimeForViewedDay(date) {
  const now = new Date()
  const viewed = new Date(date)
  viewed.setHours(isToday(date) ? now.getHours() : 12, isToday(date) ? now.getMinutes() : 0, 0, 0)
  return localDateTimeValue(viewed)
}

// Water is logged as a real manual intake, not treated as an inferred need or
// a plan target. Native select/date-time controls are intentional here: their
// platform keyboards and localized pickers are useful for a compact personal
// log, and labels/error copy remain app-owned (UX-CONTRACT hydration section).
export default function HydrationPanel({ date, hydration, onChanged }) {
  const [preferences, setPreferences] = useState(hydration?.preferences || DEFAULT_HYDRATION)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [amount, setAmount] = useState(() => quantityDraft(250, hydration?.preferences?.unit || 'ml'))
  const [unit, setUnit] = useState(hydration?.preferences?.unit || 'ml')
  const [loggedAt, setLoggedAt] = useState(() => dateTimeForViewedDay(date))
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const dayKey = ymd(date)
  const currentDay = useRef(dayKey)
  currentDay.current = dayKey
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (hydration?.preferences) setPreferences(hydration.preferences) }, [hydration?.preferences])
  useEffect(() => { if (hydration?.preferences?.unit) { setUnit(hydration.preferences.unit); setAmount(q => Number.isFinite(q.ml) ? quantityDraft(q.ml, hydration.preferences.unit) : q) } }, [hydration?.preferences?.unit])
  const entries = hydration?.entries || []
  const total = hydration?.total_ml ?? entries.reduce((sum, entry) => sum + (Number(entry.amount_ml) || 0), 0)

  useEffect(() => { setLoggedAt(dateTimeForViewedDay(date)); setEditing(null); setError(''); setBusy(false) }, [dayKey])
  const changeUnit = next => { setUnit(next); setAmount(q => quantityDraft(q.ml, next)) }
  const save = async (event) => {
    event?.preventDefault()
    const amountMl = amount.ml
    if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 10000) { setError('Enter an amount between 1 mL and 10 L.'); return }
    const timestamp = new Date(loggedAt)
    if (Number.isNaN(timestamp.getTime())) { setError('Choose when you drank it.'); return }
    setBusy(true); setError('')
    const requestDay = dayKey
    try {
      if (editing) await api.updateWaterEntry(editing.id, { amount_ml: amountMl, logged_at: timestamp.toISOString() })
      else await api.addWaterEntry({ amount_ml: amountMl, logged_at: timestamp.toISOString() })
      if (alive.current && currentDay.current === requestDay) { setEditing(null); onChanged?.() }
    } catch (err) { if (alive.current && currentDay.current === requestDay) setError(err.message || 'Could not save water. Try again.') } finally { if (alive.current && currentDay.current === requestDay) setBusy(false) }
  }
  const quickAdd = async (amountMl) => {
    const requestDay = dayKey
    setBusy(true); setError('')
    try { await api.addWaterEntry({ amount_ml: amountMl, logged_at: new Date(dateTimeForViewedDay(date)).toISOString() }); if (alive.current && currentDay.current === requestDay) onChanged?.() }
    catch (err) { if (alive.current && currentDay.current === requestDay) setError(err.message || 'Could not add water. Try again.') } finally { if (alive.current && currentDay.current === requestDay) setBusy(false) }
  }
  const beginEdit = (entry) => {
    setEditing(entry); setAmount(quantityDraft(Number(entry.amount_ml), unit)); setLoggedAt(localDateTimeValue(entry.logged_at)); setError('')
  }
  const remove = async (entry) => {
    const requestDay = dayKey
    setBusy(true); setError('')
    try { await api.deleteWaterEntry(entry.id); if (alive.current && currentDay.current === requestDay) { if (editing?.id === entry.id) setEditing(null); onChanged?.() } }
    catch (err) { if (alive.current && currentDay.current === requestDay) setError(err.message || 'Could not delete water. Try again.') } finally { if (alive.current && currentDay.current === requestDay) setBusy(false) }
  }
  return (
    <section aria-labelledby="hydration-heading" className="border-y border-line py-4">
      <div className="flex items-end justify-between gap-3">
        <div><h3 id="hydration-heading" className="eyebrow">Hydration</h3><p className="mt-1 text-sm text-muted">{preferences.goal_ml ? 'Manual water intake · your own goal' : 'Manual water intake · no personalized target'}</p></div>
        <div className="text-right"><div className="numeral text-2xl text-ink">{waterAmount(total, preferences.unit)}</div><div className="eyebrow">Logged</div></div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-muted">{preferences.goal_ml ? (isToday(date) ? `Your daily goal: ${waterAmount(preferences.goal_ml, preferences.unit)}` : 'History shows intake only; your current goal is not applied to past days.') : 'Set an optional goal and your usual cup sizes.'}</p><TextButton onClick={() => setSettingsOpen(true)}>Customize</TextButton></div>
      {preferences.goal_ml && isToday(date) && <div className="mt-2"><div role="progressbar" aria-label="Water logged toward your own goal" aria-valuemin={0} aria-valuemax={preferences.goal_ml} aria-valuenow={Math.min(total, preferences.goal_ml)} aria-valuetext={`${waterAmount(total, preferences.unit)} logged of your ${waterAmount(preferences.goal_ml, preferences.unit)} goal`} className="h-2 overflow-hidden bg-fill"><div className="h-full bg-cobalt" style={{ width: `${Math.min(100, Math.max(0, total / preferences.goal_ml * 100))}%` }} /></div><p className="mt-1 text-xs text-muted">{total >= preferences.goal_ml ? 'Your chosen goal is met.' : `${waterAmount(preferences.goal_ml - total, preferences.unit)} to your chosen goal`}</p></div>}
      <div className="mt-3 flex gap-2" aria-label="Quick add water">
        {preferences.quick_add_ml.map((ml, index) => <Button key={index} variant="outline" className="min-h-11 flex-1 px-2 text-xs" disabled={busy} onClick={() => quickAdd(ml)}>+{waterAmount(ml, preferences.unit)}</Button>)}
      </div>
      <form noValidate onSubmit={save} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_90px_1.35fr_auto]">
        <label className="min-w-0"><span className="eyebrow mb-1 block">Amount</span><input aria-label="Water amount" inputMode="decimal" value={amount.text} onChange={(e) => setAmount(editQuantity(e.target.value, unit))} className="w-full border border-line-strong bg-paper px-2 py-2 text-sm text-ink" /></label>
        <label><span className="eyebrow mb-1 block">Unit</span><select aria-label="Water unit" value={unit} onChange={(e) => changeUnit(e.target.value)} className="min-h-11 w-full border border-line-strong bg-paper px-2 text-sm text-ink"><option value="ml">mL</option><option value="oz">US fl oz</option></select></label>
        <label><span className="eyebrow mb-1 block">When</span><input aria-label="Water time" type="datetime-local" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} className="min-h-11 w-full border border-line-strong bg-paper px-2 text-sm text-ink" /></label>
        <Button type="submit" disabled={busy} className="self-end">{busy ? 'Saving…' : editing ? 'Save' : 'Add water'}</Button>
      </form>
      {editing && <TextButton className="mt-2" onClick={() => { setEditing(null); setError('') }}>Cancel edit</TextButton>}
      {error && <ErrorNote className="mt-2">{error}</ErrorNote>}
      {settingsOpen && <HydrationSettings preferences={preferences} onClose={() => setSettingsOpen(false)} onSaved={saved => { if (!alive.current) return; setPreferences(saved); setUnit(saved.unit); setAmount(q => quantityDraft(q.ml, saved.unit)); setSettingsOpen(false); onChanged?.() }} />}
      {entries.length > 0 && <div className="mt-3 border-t border-line">{entries.map((entry) => <div key={entry.id} className="flex min-h-11 items-center gap-2 border-b border-line"><span className="w-12 tnum text-[10.5px] text-muted">{timeHm(entry.logged_at)}</span><span className="flex-1 text-sm text-ink">{waterAmount(entry.amount_ml, preferences.unit)}</span><TextButton onClick={() => beginEdit(entry)}>Edit</TextButton><button type="button" onClick={() => remove(entry)} disabled={busy} className="h-11 w-11 text-faint hover:text-alert disabled:cursor-not-allowed" aria-label={`Delete ${waterAmount(entry.amount_ml, preferences.unit)} water entry`}>✕</button></div>)}</div>}
    </section>
  )
}
