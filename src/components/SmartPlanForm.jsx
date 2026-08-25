import { useEffect, useState } from 'react'
import { num, lbToKg, kgToLb } from '../lib/nutrition.js'
import { api } from '../api/client.js'
import { Button, EmptyState, ErrorNote, Field, Stat, inputCls } from './ui.jsx'

// The server only ever stores/receives metric — conversions happen here so
// the API contract stays single-unit while the form speaks whichever unit
// the user picked. (lbToKg/kgToLb live in lib/nutrition.js, shared with
// Insights' weight trend — height has no other consumer yet, so it stays local.)
const CM_PER_IN = 2.54
const round1 = (n) => Math.round(n * 10) / 10
const ftInToCm = (ft, inch) => (num(ft) * 12 + num(inch)) * CM_PER_IN
const cmToFtIn = (cm) => {
  const totalIn = num(cm) / CM_PER_IN
  let ft = Math.floor(totalIn / 12)
  let inch = Math.round(totalIn - ft * 12)
  if (inch === 12) { ft += 1; inch = 0 } // rounding can push inches to a full foot
  return { ft, inch }
}

const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Desk job, little to no exercise' },
  { key: 'light', label: 'Light', desc: 'Light exercise or sports 1–3 days a week' },
  { key: 'moderate', label: 'Moderate', desc: 'Moderate exercise or sports 3–5 days a week' },
  { key: 'active', label: 'Active', desc: 'Hard exercise 6–7 days a week' },
  { key: 'very_active', label: 'Very active', desc: 'Hard exercise + physical job, or training twice a day' },
]
const ACTIVITY_LABEL = Object.fromEntries(ACTIVITY_LEVELS.map((a) => [a.key, a.label]))

const GOALS = [
  { key: 'maintain', label: 'Maintain', desc: 'Hold steady at your current weight' },
  { key: 'lose_fat', label: 'Lose fat', desc: 'Moderate calorie deficit, higher protein to preserve muscle' },
  { key: 'build_muscle', label: 'Build muscle', desc: 'Modest calorie surplus, high protein to support growth' },
  { key: 'endurance', label: 'Endurance', desc: 'Higher carbohydrate to fuel training and performance' },
]

// One selectable card — sex, activity level, and goal all use this so the
// three groups read as one visual language. `aria-pressed` matches the
// window-selector pattern already used in Insights.jsx.
function OptionCard({ selected, onClick, title, desc, suggested, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-11 flex-col items-start gap-1 border-[1.5px] p-4 text-left transition ${
        selected ? 'border-cobalt bg-cobalt-soft' : 'border-line-strong hover:bg-fill'
      } ${className}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className={`font-semibold ${selected ? 'text-cobalt' : 'text-ink'}`}>{title}</span>
        {suggested && !selected && (
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-cobalt">Suggested</span>
        )}
      </span>
      {desc && <span className="text-xs text-muted">{desc}</span>}
    </button>
  )
}

// Calculate baseline targets from body metrics, activity, and a goal — the
// on-ramp for anyone who doesn't want to type raw macro numbers themselves.
// `onSaved` fires the moment the server returns a non-null baseline (the
// same "refresh the rest of the tab" signal EditTargets's onSaved gives);
// `onCancel` leaves the calculator, from either the form or the results view.
export default function SmartPlanForm({ onCancel, onSaved }) {
  const [units, setUnits] = useState('imperial')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightLb, setWeightLb] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [activityLevel, setActivityLevel] = useState('')
  const [goal, setGoal] = useState('')
  const [suggestion, setSuggestion] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // undefined = form not yet submitted · null = submitted but the profile was
  // too incomplete for the server to compute from · object = saved baseline.
  const [result, setResult] = useState(undefined)

  // Prefill from any profile already on file — someone with manually-typed
  // targets today may still have used the calculator before, or be trying it
  // for the first time with nothing to prefill (all-null profile, no-op here).
  useEffect(() => {
    let alive = true
    api.getProfile()
      .then((r) => {
        if (!alive) return
        const p = r?.profile
        if (!p) return
        if (p.units_pref === 'metric') setUnits('metric')
        if (p.height_cm != null) {
          setHeightCm(p.height_cm)
          const { ft, inch } = cmToFtIn(p.height_cm)
          setHeightFt(ft); setHeightIn(inch)
        }
        if (p.weight_kg != null) {
          setWeightKg(p.weight_kg)
          setWeightLb(round1(kgToLb(p.weight_kg)))
        }
        if (p.age_years != null) setAge(p.age_years)
        if (p.sex) setSex(p.sex)
        if (p.activity_level) setActivityLevel(p.activity_level)
        if (p.goal) setGoal(p.goal)
      })
      .catch(() => { /* nothing to prefill — the form just starts empty */ })
    return () => { alive = false }
  }, [])

  // Optional endpoint — a server that skipped it must not break this form.
  useEffect(() => {
    let alive = true
    api.activitySuggestion()
      .then((r) => { if (alive) setSuggestion(r?.suggested ? r : null) })
      .catch(() => { if (alive) setSuggestion(null) })
    return () => { alive = false }
  }, [])

  // Converts the CURRENT values so switching units doesn't lose what was
  // already typed. Blank fields stay blank instead of converting to "0".
  const toggleUnits = (next) => {
    if (next === units) return
    if (next === 'metric') {
      setHeightCm(heightFt !== '' || heightIn !== '' ? round1(ftInToCm(heightFt, heightIn)) : '')
      setWeightKg(weightLb !== '' ? round1(lbToKg(weightLb)) : '')
    } else {
      if (heightCm !== '') {
        const { ft, inch } = cmToFtIn(heightCm)
        setHeightFt(ft); setHeightIn(inch)
      } else { setHeightFt(''); setHeightIn('') }
      setWeightLb(weightKg !== '' ? round1(kgToLb(weightKg)) : '')
    }
    setUnits(next)
  }

  const heightOk = units === 'imperial' ? heightFt !== '' && num(heightFt) > 0 : heightCm !== '' && num(heightCm) > 0
  const weightOk = units === 'imperial' ? weightLb !== '' && num(weightLb) > 0 : weightKg !== '' && num(weightKg) > 0
  const ageOk = age !== '' && num(age) > 0
  const canSubmit = heightOk && weightOk && ageOk && !!sex && !!activityLevel && !!goal

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true); setError('')
    try {
      const payload = {
        height_cm: units === 'imperial' ? round1(ftInToCm(heightFt, heightIn)) : num(heightCm),
        weight_kg: units === 'imperial' ? round1(lbToKg(weightLb)) : num(weightKg),
        sex,
        age_years: num(age),
        units_pref: units,
        activity_level: activityLevel,
        goal,
      }
      const r = await api.setProfile(payload)
      setResult(r?.computedBaseline ?? null)
      // Showing the returned baseline IS the confirmation it took effect —
      // but Plan/Today still need telling to refetch and pick it up.
      if (r?.computedBaseline) onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not calculate your targets.')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4 border border-line bg-card p-4 shadow-[0_1px_0_rgb(18_18_16/0.06)]">
        <h3 className="eyebrow">Calculated targets</h3>
        <p className="text-sm text-muted">Saved as your active baseline — Plan and Today now use these numbers.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Calories" value={result.calories} unit="kcal" />
          <Stat label="Protein" value={result.protein_g} unit="g" decimals={1} />
          <Stat label="Carbs" value={result.carbs_g} unit="g" decimals={1} />
          <Stat label="Fat" value={result.fat_g} unit="g" decimals={1} />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => onCancel?.()}>Done</Button>
        </div>
      </div>
    )
  }

  if (result === null) {
    return (
      <EmptyState title="We need a bit more information">
        Your profile was missing something the calculator needs to compute targets. Check every field below and try again.
        <div className="mt-4"><Button variant="outline" onClick={() => setResult(undefined)}>Back to form</Button></div>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-5 border border-line bg-card p-4 shadow-[0_1px_0_rgb(18_18_16/0.06)]">
      <div>
        <h3 className="eyebrow">Calculate my targets</h3>
        <p className="mt-1.5 text-xs text-faint">
          A few body metrics and a goal give you a starting baseline — you can always fine-tune it by hand afterward.
        </p>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {/* Units — same bordered-segment language as Insights' window selector. */}
      <div>
        <span className="eyebrow mb-1.5 block">Units</span>
        <div className="flex border border-line-strong">
          {[['imperial', 'Imperial · ft, lb'], ['metric', 'Metric · cm, kg']].map(([key, label], i) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleUnits(key)}
              aria-pressed={units === key}
              className={`flex-1 py-4 text-center text-[10.5px] font-semibold uppercase tracking-[0.1em] transition ${i > 0 ? 'border-l border-line' : ''} ${units === key ? 'bg-cobalt text-oncobalt' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Height + weight, per the units toggle */}
      <div className="grid grid-cols-2 gap-3">
        {units === 'imperial' ? (
          <Field label="Height">
            <div className="flex gap-2">
              <input type="number" inputMode="numeric" min="0" placeholder="ft" aria-label="Height, feet" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} className={`${inputCls} flex-1`} />
              <input type="number" inputMode="numeric" min="0" max="11" placeholder="in" aria-label="Height, inches" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} className={`${inputCls} flex-1`} />
            </div>
          </Field>
        ) : (
          <Field label="Height (cm)">
            <input type="number" inputMode="decimal" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={inputCls} />
          </Field>
        )}
        {units === 'imperial' ? (
          <Field label="Weight (lb)">
            <input type="number" inputMode="decimal" min="0" value={weightLb} onChange={(e) => setWeightLb(e.target.value)} className={inputCls} />
          </Field>
        ) : (
          <Field label="Weight (kg)">
            <input type="number" inputMode="decimal" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputCls} />
          </Field>
        )}
      </div>

      <Field label="Age (years)">
        <input type="number" inputMode="numeric" min="0" value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} />
      </Field>

      {/* Sex — a plain two-option selector, framed as an estimation input only. */}
      <div>
        <span className="eyebrow mb-1.5 block">Sex</span>
        <div className="grid grid-cols-2 gap-2">
          {[['male', 'Male'], ['female', 'Female']].map(([key, label]) => (
            <OptionCard key={key} selected={sex === key} onClick={() => setSex(key)} title={label} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-faint">
          Used only to estimate your calorie needs — a standard nutrition formula (Mifflin-St Jeor), not a diagnosis.
        </p>
      </div>

      {/* Activity level — an optional wearable-derived suggestion is offered,
          never applied silently; the user still has to tap something. */}
      <div>
        <span className="eyebrow mb-1.5 block">Activity level</span>
        {suggestion?.suggested && (
          <div className="mb-2 border border-cobalt/40 bg-cobalt-soft px-3 py-3">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-cobalt">Suggested from your data</div>
            <p className="mt-1 text-sm text-ink">
              {suggestion.basis
                ? `Based on your recent activity: ${suggestion.basis} → ${ACTIVITY_LABEL[suggestion.suggested] || suggestion.suggested}`
                : `Estimated from your recent activity: ${ACTIVITY_LABEL[suggestion.suggested] || suggestion.suggested}`}
            </p>
            <div className="mt-2">
              <Button variant="outline" onClick={() => setActivityLevel(suggestion.suggested)}>
                Use {ACTIVITY_LABEL[suggestion.suggested] || suggestion.suggested}
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {ACTIVITY_LEVELS.map((a) => (
            <OptionCard
              key={a.key}
              selected={activityLevel === a.key}
              onClick={() => setActivityLevel(a.key)}
              title={a.label}
              desc={a.desc}
              suggested={suggestion?.suggested === a.key}
              className="w-full"
            />
          ))}
        </div>
      </div>

      {/* Goal */}
      <div>
        <span className="eyebrow mb-1.5 block">Goal</span>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <OptionCard key={g.key} selected={goal === g.key} onClick={() => setGoal(g.key)} title={g.label} desc={g.desc} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="subtle" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit} disabled={!canSubmit || saving}>
          {saving ? 'Calculating…' : 'Calculate & save my targets'}
        </Button>
      </div>
      <p className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">Estimate only · not medical advice</p>
    </div>
  )
}
