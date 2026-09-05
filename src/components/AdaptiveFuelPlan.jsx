import { useEffect, useMemo, useRef, useState } from 'react'
import { num, fmt, ymd, dayBounds, lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../lib/nutrition.js'
import { api } from '../api/client.js'
import { Button, EmptyState, ErrorNote, Field, TextButton, inputCls, Sheet, Spinner, StatusMark, Meter, Why } from './ui.jsx'

const round1 = (n) => Math.round(num(n) * 10) / 10
const KM_PER_MI = 1.60934

// Sports vocabulary — matches server/index.js's WORKOUT_KINDS /
// server/afp/engine.js's MET_TABLE keys exactly. Kept as a local literal
// (the same small-duplication pattern Plan.jsx already uses for
// WORKOUT_KINDS) rather than a cross-module import, since the server is the
// source of truth and this is just its picker.
const AFP_SPORTS = ['run', 'ride', 'swim', 'row', 'walk', 'hike', 'strength', 'hiit', 'cardio', 'mobility', 'workout']

// NASEM's activity category is an explicit user selection. It is deliberately
// never inferred from wearable calories, steps, or workouts.
const ACTIVITY_LEVELS = [
  { key: 'inactive', label: 'Inactive', desc: 'Daily living with minimal additional activity' },
  { key: 'low', label: 'Low active', desc: 'Additional walking plus some work or recreation activity' },
  { key: 'active', label: 'Active', desc: 'More walking and occupational or recreational activity' },
  { key: 'very_active', label: 'Very active', desc: 'Daily living plus vigorous work or recreation activity' },
]

const GOALS = [
  { key: 'maintenance', label: 'Maintenance', desc: 'No automatic calorie deficit or surplus' },
  { key: 'fat_loss', label: 'Fat loss', desc: 'Conservative adult starting estimate; never increased on hard or long days' },
  { key: 'muscle_gain', label: 'Muscle gain', desc: 'Maintenance through a modest, evidence-bounded surplus' },
  { key: 'endurance_performance', label: 'Endurance performance', desc: 'Fuel training without an automatic deficit' },
]

function OptionCard({ selected, onClick, title, desc, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-11 flex-col items-start gap-1 border-[1.5px] p-3.5 text-left transition ${
        selected ? 'border-cobalt bg-cobalt-soft' : 'border-line-strong hover:bg-fill'
      } ${className}`}
    >
      <span className={`font-semibold ${selected ? 'text-cobalt' : 'text-ink'}`}>{title}</span>
      {desc && <span className="text-xs text-muted">{desc}</span>}
    </button>
  )
}

function Checkbox({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 border-line-strong accent-cobalt"
      />
      <span>
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

// A prominent, non-alarming notice — used both for the safety-suppression
// banner and the frozen-day notice. Never red/error styling: neither state
// is a failure, so it borrows the existing "sand" context tone.
function Notice({ children, tone = 'sand' }) {
  const cls = tone === 'alert' ? 'border-alert/50 bg-alert/5' : 'border-line-strong bg-sand'
  return <div className={`border-[1.5px] p-3.5 text-sm leading-snug text-ink ${cls}`}>{children}</div>
}

/* ---------------------------------------------------------------------- */
/* Profile form                                                            */
/* ---------------------------------------------------------------------- */

export function AfpProfileForm({ profile, onCancel, onSaved }) {
  const [units, setUnits] = useState(profile?.units_pref || 'imperial')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [heightCm, setHeightCm] = useState(profile?.height_cm ?? '')
  const [weightLb, setWeightLb] = useState('')
  const [weightKg, setWeightKg] = useState(profile?.weight_kg ?? '')
  const [age, setAge] = useState(profile?.age_years ?? '')
  const [sex, setSex] = useState(profile?.equation_stratum === 'men' ? 'male' : profile?.equation_stratum === 'women' ? 'female' : '')
  const [activityLevel, setActivityLevel] = useState(profile?.activity_level ?? '')
  const [goal, setGoal] = useState(profile?.goal ?? 'maintenance')
  const [isPregnantOrPostpartum, setIsPregnantOrPostpartum] = useState(!!profile?.is_pregnant_or_postpartum)
  const [isLactating, setIsLactating] = useState(!!profile?.is_lactating)
  const [hasCkdOrRenalCondition, setHasCkdOrRenalCondition] = useState(!!profile?.has_ckd_or_renal_condition)
  const [hasEdRiskFlag, setHasEdRiskFlag] = useState(!!profile?.has_ed_risk_flag)
  const [hasClinicianPrescribedDiet, setHasClinicianPrescribedDiet] = useState(!!profile?.has_clinician_prescribed_diet)
  const [hasMajorIllnessOrGlucoseLoweringMeds, setHasMajorIllnessOrGlucoseLoweringMeds] = useState(!!profile?.has_major_illness_or_glucose_lowering_meds)
  const [eligibilityAttested, setEligibilityAttested] = useState(!!profile?.eligibility_attested)
  const [manualTargets, setManualTargets] = useState(() => ({
    calories: profile?.manual_targets?.calories ?? '', protein_g: profile?.manual_targets?.protein_g ?? '',
    carbs_g: profile?.manual_targets?.carbs_g ?? '', fat_g: profile?.manual_targets?.fat_g ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.height_cm != null) {
      const { ft, inch } = cmToFtIn(profile.height_cm)
      setHeightFt(ft); setHeightIn(inch)
    }
    if (profile?.weight_kg != null) setWeightLb(round1(kgToLb(profile.weight_kg)))
  }, [profile])

  const toggleUnits = (next) => {
    if (next === units) return
    if (next === 'metric') {
      setHeightCm(heightFt !== '' || heightIn !== '' ? round1(ftInToCm(heightFt, heightIn)) : '')
      setWeightKg(weightLb !== '' ? round1(lbToKg(weightLb)) : '')
    } else {
      if (heightCm !== '') { const { ft, inch } = cmToFtIn(heightCm); setHeightFt(ft); setHeightIn(inch) } else { setHeightFt(''); setHeightIn('') }
      setWeightLb(weightKg !== '' ? round1(kgToLb(weightKg)) : '')
    }
    setUnits(next)
  }

  const heightOk = units === 'imperial' ? heightFt !== '' && num(heightFt) > 0 : heightCm !== '' && num(heightCm) > 0
  const weightOk = units === 'imperial' ? weightLb !== '' && num(weightLb) > 0 : weightKg !== '' && num(weightKg) > 0
  const ageOk = age !== '' && num(age) > 0
  const eligibilityReasons = isPregnantOrPostpartum || isLactating || hasCkdOrRenalCondition || hasEdRiskFlag || hasClinicianPrescribedDiet || hasMajorIllnessOrGlucoseLoweringMeds || num(age) < 19
  const manualMode = eligibilityReasons || !eligibilityAttested
  const manualTargetsOk = ['calories', 'protein_g', 'carbs_g', 'fat_g'].every((key) => manualTargets[key] !== '' && num(manualTargets[key]) >= 0)
  const canSubmit = manualMode ? manualTargetsOk : heightOk && weightOk && ageOk && !!activityLevel && !!goal

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true); setError('')
    try {
      const payload = {
        units_pref: units,
        plan_mode: manualMode ? 'manual' : 'automatic',
        ...(manualMode ? { manual_targets: Object.fromEntries(Object.entries(manualTargets).map(([key, value]) => [key, num(value)])) } : { manual_targets: null }),
        eligibility_attested: eligibilityAttested,
        is_pregnant_or_postpartum: isPregnantOrPostpartum,
        is_lactating: isLactating,
        has_ckd_or_renal_condition: hasCkdOrRenalCondition,
        has_ed_risk_flag: hasEdRiskFlag,
        has_clinician_prescribed_diet: hasClinicianPrescribedDiet,
        has_major_illness_or_glucose_lowering_meds: hasMajorIllnessOrGlucoseLoweringMeds,
        // Manual/clinician-configured targets must be usable before someone
        // supplies the inputs that automatic NASEM estimates require.
        ...(!manualMode ? {
          height_cm: units === 'imperial' ? round1(ftInToCm(heightFt, heightIn)) : num(heightCm),
          weight_kg: units === 'imperial' ? round1(lbToKg(weightLb)) : num(weightKg),
          age_years: num(age),
          // This is an explicit NASEM equation selection, not gender identity.
          equation_stratum: sex === 'male' ? 'men' : sex === 'female' ? 'women' : 'unsure',
          activity_level: activityLevel,
          goal,
        } : {}),
      }
      await api.setAfpProfile(payload)
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 border border-line bg-card p-4 shadow-[0_1px_0_rgb(18_18_16/0.06)]">
      <div>
        <h3 className="eyebrow">Daily fuel plan profile</h3>
        <p className="mt-1.5 text-xs text-faint">
          Body metrics and a goal, used only to estimate your energy and macro needs — an educational estimate, not medical advice.
        </p>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div>
        <span className="eyebrow mb-1.5 block">Units</span>
        <div className="flex border border-line-strong">
          {[['imperial', 'Imperial · ft, lb'], ['metric', 'Metric · cm, kg']].map(([key, label], i) => (
            <button key={key} type="button" onClick={() => toggleUnits(key)} aria-pressed={units === key}
              className={`flex-1 py-4 text-center text-[10.5px] font-semibold uppercase tracking-[0.1em] transition ${i > 0 ? 'border-l border-line' : ''} ${units === key ? 'bg-cobalt text-oncobalt' : 'text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

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
          <Field label="Current weight (lb)">
            <input type="number" inputMode="decimal" min="0" value={weightLb} onChange={(e) => setWeightLb(e.target.value)} className={inputCls} />
          </Field>
        ) : (
          <Field label="Current weight (kg)">
            <input type="number" inputMode="decimal" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={inputCls} />
          </Field>
        )}
      </div>

      <Field label="Age (years)">
        <input type="number" inputMode="numeric" min="0" value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} />
      </Field>

      <div>
        <span className="eyebrow mb-1.5 block">NASEM equation stratum</span>
        <div className="grid grid-cols-2 gap-2">
          {[['male', 'Men'], ['female', 'Women']].map(([key, label]) => (
            <OptionCard key={key || 'neutral'} selected={sex === key} onClick={() => setSex(key)} title={label} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-faint">
          NASEM's adult maintenance evidence has two observed strata. This is a calculation selection, not a
          gender-identity field, and it is never inferred. If neither is appropriate, save in manual mode instead.
        </p>
      </div>

      <div>
        <span className="eyebrow mb-1.5 block">NASEM activity category</span>
        <p className="mb-2 text-xs text-faint">Choose your usual category. Connected devices inform training context but do not select this category or add their calories to your estimate.</p>
        <div className="space-y-2">
          {ACTIVITY_LEVELS.map((a) => (
            <OptionCard key={a.key} selected={activityLevel === a.key} onClick={() => setActivityLevel(a.key)} title={a.label} desc={a.desc} className="w-full" />
          ))}
        </div>
      </div>

      <div>
        <span className="eyebrow mb-1.5 block">Goal</span>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <OptionCard key={g.key} selected={goal === g.key} onClick={() => setGoal(g.key)} title={g.label} desc={g.desc} />
          ))}
        </div>
      </div>

      <div className="space-y-1 border-t border-line pt-3.5">
        <Checkbox checked={eligibilityAttested} onChange={setEligibilityAttested} label="I confirm this is an ordinary healthy-adult starting estimate for me" hint="Uncheck this to keep the plan in manual/clinician-configured mode." />
        <Checkbox
          checked={isPregnantOrPostpartum}
          onChange={setIsPregnantOrPostpartum}
          label="I'm currently pregnant or postpartum"
          hint="Automatic targets are disabled; use a clinician-configured or manual target."
        />
        <Checkbox checked={isLactating} onChange={setIsLactating} label="I'm lactating" hint="Automatic targets are disabled; this does not diagnose a condition." />
        <Checkbox checked={hasCkdOrRenalCondition} onChange={setHasCkdOrRenalCondition} label="I have kidney or renal disease" hint="Automatic targets are disabled; this does not diagnose a condition." />
        <Checkbox
          checked={hasEdRiskFlag}
          onChange={setHasEdRiskFlag}
          label="I have a current or past eating disorder, or restricting calories isn't safe for me right now"
          hint="Automatic targets are disabled. This is entirely optional and private to you."
        />
        <Checkbox checked={hasClinicianPrescribedDiet} onChange={setHasClinicianPrescribedDiet} label="I'm following a clinician-prescribed diet" hint="Automatic targets are disabled." />
        <Checkbox checked={hasMajorIllnessOrGlucoseLoweringMeds} onChange={setHasMajorIllnessOrGlucoseLoweringMeds} label="I have a major illness or use glucose-lowering medication" hint="Automatic targets are disabled; this does not diagnose a condition." />
      </div>

      {(eligibilityReasons || !eligibilityAttested) && <Notice>This profile will be saved in manual/clinician-configured mode. Body Current will not generate automatic targets.</Notice>}

      {manualMode && (
        <div className="border-t border-line pt-3.5">
          <h4 className="eyebrow">Manual or clinician-configured daily targets</h4>
          <p className="mt-1 text-xs text-muted">Enter the targets you already use. Body Current will record them without generating or adjusting them.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['calories', 'Energy (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)']].map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" inputMode="decimal" value={manualTargets[key]} onChange={(e) => setManualTargets((current) => ({ ...current, [key]: e.target.value }))} className={inputCls} /></Field>)}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        {onCancel ? <Button variant="subtle" onClick={onCancel}>Cancel</Button> : <span />}
        <Button onClick={submit} disabled={!canSubmit || saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
      </div>
      <p className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-faint">Estimate only · not medical advice</p>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Planned-workout editor                                                  */
/* ---------------------------------------------------------------------- */

function WorkoutEditor({ date, workout, unitsPref, onCancel, onSaved, onDeleted }) {
  const isEdit = !!workout?.id
  const [sport, setSport] = useState(workout?.sport || 'run')
  const [startTime, setStartTime] = useState(workout?.start_time || '')
  const [durationMin, setDurationMin] = useState(workout?.duration_min ?? '')
  const [intensity, setIntensity] = useState(workout?.intensity || 'moderate')
  const useMi = unitsPref === 'imperial'
  const [distance, setDistance] = useState(() => {
    if (workout?.distance_km == null) return ''
    return useMi ? round1(workout.distance_km / KM_PER_MI) : workout.distance_km
  })
  const [isKeySession, setIsKeySession] = useState(!!workout?.is_key_session)
  const [isDoubleSession, setIsDoubleSession] = useState(!!workout?.is_double_session)
  const [isRace, setIsRace] = useState(!!workout?.is_race)
  const [carbLoadingOptIn, setCarbLoadingOptIn] = useState(!!workout?.carb_loading_opt_in)
  const [notes, setNotes] = useState(workout?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = durationMin !== '' && num(durationMin) > 0

  const save = async () => {
    if (!canSubmit || saving) return
    setSaving(true); setError('')
    try {
      const distanceKm = distance === '' ? null : (useMi ? round1(num(distance) * KM_PER_MI) : num(distance))
      await api.saveAfpWorkout({
        ...(isEdit ? { id: workout.id } : {}),
        date, sport, start_time: startTime || null, duration_min: num(durationMin), intensity,
        distance_km: distanceKm, is_key_session: isKeySession, is_double_session: isDoubleSession,
        is_race: isRace, carb_loading_opt_in: isRace ? carbLoadingOptIn : false,
        notes: notes || null,
      })
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not save this session.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!isEdit || saving) return
    setSaving(true); setError('')
    try {
      await api.deleteAfpWorkout(workout.id)
      onDeleted?.()
    } catch (err) {
      setError(err.message || 'Could not remove this session.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNote>{error}</ErrorNote>
      <Field label="Sport">
        <select value={sport} onChange={(e) => setSport(e.target.value)} className={inputCls}>
          {AFP_SPORTS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time" hint="Optional">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Duration (min)">
          <input type="number" min="1" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={inputCls} placeholder="45" />
        </Field>
      </div>
      <div>
        <span className="eyebrow mb-1.5 block">Intensity</span>
        <div className="grid grid-cols-3 gap-2">
          {['easy', 'moderate', 'hard'].map((k) => (
            <OptionCard key={k} selected={intensity === k} onClick={() => setIntensity(k)} title={k[0].toUpperCase() + k.slice(1)} />
          ))}
        </div>
      </div>
      <Field label={`Distance (${useMi ? 'mi' : 'km'}, optional)`} hint="Mainly useful for runs.">
        <input type="number" inputMode="decimal" min="0" value={distance} onChange={(e) => setDistance(e.target.value)} className={inputCls} />
      </Field>
      <div className="space-y-1">
        <Checkbox checked={isKeySession} onChange={setIsKeySession} label="Key session" hint="A priority workout — the day's fueling guidance leads with it." />
        <Checkbox checked={isDoubleSession} onChange={setIsDoubleSession} label="Part of a double-session day" hint="Flags a shorter recovery window before/after another demanding session." />
        <Checkbox checked={isRace} onChange={setIsRace} label="This is a race / event" />
        {isRace && (
          <Checkbox
            checked={carbLoadingOptIn}
            onChange={setCarbLoadingOptIn}
            label="Opt in to carbohydrate-loading guidance"
            hint="Only offered for qualifying long/endurance events (~90+ min, e.g. half-marathon or further) — never applied automatically."
          />
        )}
      </div>
      <Field label="Notes (optional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} maxLength={500} />
      </Field>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        {isEdit ? <TextButton onClick={remove} disabled={saving}>Remove session</TextButton> : <span />}
        <div className="flex gap-2">
          <Button variant="subtle" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!canSubmit || saving}>{saving ? 'Saving…' : 'Save session'}</Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Override control                                                        */
/* ---------------------------------------------------------------------- */

// `targets` is today's CURRENT computed numbers, shown only as a placeholder
// hint; `currentOverrides` is whatever override object is actually saved (or
// null). The draft starts BLANK for any field with no override already set —
// pre-filling it with today's computed value would mean every save silently
// re-submits every field the user never touched as a "manual" override, not
// just the one they meant to change (caught via a real browser walkthrough:
// changing only calories was also freezing the day's protein/carbs/fat to
// whatever they happened to be at the moment the form was opened).
function OverrideControl({ date, targets, currentOverrides, onChanged }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const hasOverride = !!currentOverrides

  const openForm = () => {
    setDraft({
      calories: currentOverrides?.calories ?? '', protein_g: currentOverrides?.protein_g ?? '',
      carbs_g: currentOverrides?.carbs_g ?? '', fat_g: currentOverrides?.fat_g ?? '',
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = {}
      for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g']) if (draft[k] !== '') payload[k] = num(draft[k])
      await api.setAfpPlanOverrides(date, payload)
      setOpen(false)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not save the override.')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true); setError('')
    try {
      await api.setAfpPlanOverrides(date, {})
      setOpen(false)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not clear the override.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-4">
        <p className="min-w-0 flex-1 basis-56 text-sm leading-relaxed text-muted">
          {hasOverride ? 'This day has a manual override applied.' : 'Need a different number just for today? Override it without changing your profile.'}
        </p>
        <TextButton onClick={openForm} className="shrink-0" chevron>{hasOverride ? 'Edit override' : 'Override today'}</TextButton>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-line pt-3.5">
      <ErrorNote>{error}</ErrorNote>
      <p className="text-sm leading-relaxed text-muted">
        Leave a field blank to keep the plan's own number (shown as a placeholder) — only a field you fill in
        becomes a day-specific override. Your profile defaults are untouched either way.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['calories', 'Calories'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)']].map(([k, label]) => (
          <Field key={k} label={label}>
            <input
              type="number" inputMode="decimal" value={draft[k]}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              placeholder={targets?.[k] != null ? String(fmt(targets[k])) : ''}
              className={inputCls}
            />
          </Field>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {hasOverride ? <TextButton onClick={clear} disabled={saving}>Clear override</TextButton> : <span />}
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save override'}</Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Main panel                                                              */
/* ---------------------------------------------------------------------- */

const EER_LABEL = 'NASEM 2023 adult Estimated Energy Requirement'

export default function AdaptiveFuelPlan({ date, refreshKey, onChanged }) {
  const [profile, setProfile] = useState(null)
  const [plan, setPlan] = useState(null)
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState(undefined) // undefined = closed, null = new, object = editing
  const loadGeneration = useRef(0)

  const day = ymd(date)

  const load = () => {
    const generation = ++loadGeneration.current
    setLoading(true); setError('')
    Promise.all([api.afpPlan(day, dayBounds(date)), api.listAfpWorkouts(day, day), api.getAfpProfile()])
      .then(([p, w, prof]) => {
        if (generation !== loadGeneration.current) return
        setPlan(p); setWorkouts(w.workouts || []); setProfile(prof.profile)
      })
      .catch((err) => { if (generation === loadGeneration.current) setError(err.message || 'Could not load your daily fuel plan.') })
      .finally(() => { if (generation === loadGeneration.current) setLoading(false) })
    return () => { ++loadGeneration.current }
  }

  useEffect(load, [day, refreshKey])

  // A bounded, visibility-aware poll keeps a current-day server revision in
  // sync when another device refreshes inputs. Hidden tabs do no polling.
  useEffect(() => {
    const poll = () => { if (document.visibilityState === 'visible') load() }
    const timer = window.setInterval(poll, 60_000)
    document.addEventListener('visibilitychange', poll)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
  }, [day, refreshKey])

  const refresh = () => { load(); onChanged?.() }

  const recompute = async () => {
    setLoading(true)
    try { await api.recomputeAfpPlan(day) } finally { refresh() }
  }

  if (loading && !plan) return <Spinner label="Building your daily fuel plan…" />
  if (error) return <div className="mt-6 space-y-3"><ErrorNote>{error}</ErrorNote><Button variant="outline" onClick={refresh}>Try again</Button></div>

  const p = plan?.plan
  if (editingProfile) {
    return (
      <div className="mt-5">
        <AfpProfileForm profile={profile} onCancel={() => setEditingProfile(false)} onSaved={() => { setEditingProfile(false); refresh() }} />
      </div>
    )
  }

  if (!p?.ok) {
    return (
      <div className="mt-5">
        <EmptyState title="Set up your daily fuel plan">
          Enter your body metrics, baseline activity and a goal, and this plan will calculate a real-time daily
          evidence-based energy and macro starting estimate — including carbohydrate periodization on training
          days. Nothing here replaces medical advice.
          <div className="mt-4 flex justify-center">
            <Button onClick={() => setEditingProfile(true)}>Set up my profile</Button>
          </div>
        </EmptyState>
      </div>
    )
  }

  // A manual plan deliberately has no EER, training load, carb periodization,
  // or BMI fields. Keep this branch independent so a clinician-configured
  // target cannot accidentally dereference automatic-only reasoning.
  if (p.source === 'manual') {
    return (
      <div className="mt-6 space-y-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="serif text-[26px] leading-tight text-ink">Daily Fuel Plan</h3>
          <TextButton onClick={() => setEditingProfile(true)} chevron>Edit targets</TextButton>
        </header>
        <Notice>
          <strong>Manual or clinician-configured targets.</strong> Body Current will not calculate or adjust targets automatically for this profile.
        </Notice>
        <section aria-label="Your daily targets" className="border-y border-line bg-cobalt-soft p-4">
          <h4 className="mb-4 text-base font-semibold text-ink">Your daily targets</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            {[['calories', 'Energy', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g']].map(([k, label, unit]) => {
              const progress = plan.progress?.[k]
              return <div key={k}>
                <div className="numeral text-[32px] leading-tight text-ink">{fmt(p.targets[k])}<span className="ml-1 text-sm font-medium text-muted">{unit}</span></div>
                <div className="mt-1 text-sm font-semibold text-ink">{label}</div>
                {progress && <div className="mt-2 text-sm leading-relaxed text-muted">{fmt(progress.actual, unit === 'kcal' ? 0 : 1)} logged · {fmt(Math.max(0, progress.remaining), unit === 'kcal' ? 0 : 1)} left</div>}
              </div>
            })}
          </div>
        </section>
        <OverrideControl date={day} targets={p.targets} currentOverrides={plan.overrides} onChanged={refresh} />
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="serif text-[26px] leading-tight text-ink">Daily Fuel Plan</h3>
        <TextButton onClick={() => setEditingProfile(true)} chevron>Edit profile</TextButton>
      </header>

      {plan.frozen && (
        <Notice>
          <strong>This day's plan is frozen.</strong> Past days keep the numbers they had at the time so later
          wearable data never silently rewrites history.{' '}
          <TextButton onClick={recompute}>Recompute anyway</TextButton>
        </Notice>
      )}

      {(p.ineligible || p.safety?.suppressed) && (
        <Notice tone="alert">
          <strong>{p.safety?.suppressed ? "A calorie deficit isn't offered here." : "Automatic targets aren't available for this profile."}</strong> {p.safety?.message || 'Use a manual or clinician-configured target instead.'}
        </Notice>
      )}

      {p.warnings?.length > 0 && (
        <div className="space-y-2 border border-line-strong bg-fill p-4 text-sm leading-relaxed text-ink">
          {p.warnings.map((w, i) => <p key={i}>{w.message}</p>)}
        </div>
      )}

      {/* Targets + progress */}
      <section aria-label="Your daily targets" className="border-y border-line bg-cobalt-soft p-4">
        <h4 className="mb-4 text-base font-semibold text-ink">Your daily targets</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          {[['calories', 'Energy', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g']].map(([k, label, unit]) => {
            const prog = plan.progress?.[k]
            return (
              <div key={k}>
                <div className="numeral text-[32px] leading-tight text-ink">{fmt(p.targets[k])}<span className="ml-1 text-sm font-medium text-muted">{unit}</span></div>
                <div className="mt-1 text-sm font-semibold text-ink">{label}</div>
                {prog && (
                  <>
                    <Meter value={prog.actual} target={prog.target} className="mt-2" />
                    <div className="mt-2 text-sm leading-relaxed text-muted">{fmt(prog.actual, unit === 'kcal' ? 0 : 1)} logged · {fmt(Math.max(0, prog.remaining), unit === 'kcal' ? 0 : 1)} left</div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {p.overridesApplied && (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-cobalt">Manual override applied</p>
        )}
        <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-muted">Estimated starting target · not yet calibrated to your observed response.</p>
      </section>

      <OverrideControl date={day} targets={p.targets} currentOverrides={plan.overrides} onChanged={refresh} />

      <section aria-label="Why these targets" className="border-t border-line pt-5">
      <h4 className="text-lg font-semibold text-ink">Why these targets</h4>
      <Why
        label="Why this changed"
        items={[
          `NASEM 2023 maintenance estimate: ${fmt(p.energy.baseline)} kcal.`,
          'Training modality, duration, timing, and intensity inform carbohydrate planning; wearable calories are not added to this estimate.',
          p.energy.goalAdjustment !== 0 ? `Goal adjustment: ${p.energy.goalAdjustment > 0 ? '+' : ''}${fmt(p.energy.goalAdjustment)} kcal.` : 'No goal-driven adjustment (maintaining).',
          p.energy.goalAdjustmentCapped ? 'A conservative strategy guardrail limited the automatic adjustment.' : null,
          p.overridesApplied ? 'Your manual override is applied on top of all of the above.' : null,
        ].filter(Boolean)}
      />

      {/* Population maintenance basis and uncertainty */}
      {p.eer && <Why label={`${EER_LABEL}: ${fmt(p.eer.value)} kcal`} items={[
        `Selected equation stratum: ${p.eer.sexStratum}; activity category: ${p.eer.activityCategory}.`,
        p.eer.sexStratum === 'male' ? 'Population uncertainty: RMSE 339 kcal/day; MAE 266 kcal/day.' : 'Population uncertainty: RMSE 246 kcal/day; MAE 191 kcal/day.',
        'Source: NASEM Dietary Reference Intakes for Energy (2023), DOI 10.17226/26818.',
      ]} />}

      {/* BMI — optional context only */}
      {p.bmi && (
        <p className="text-sm leading-relaxed text-muted">
          BMI {p.bmi.value} — shown as optional context only. It is not used to set your fueling
          targets and is not a health diagnosis.
        </p>
      )}
      </section>

      {/* Carb periodization */}
      <section className="border-t border-line pt-5">
        <h4 className="mb-3 text-lg font-semibold text-ink">Training &amp; carbohydrate plan</h4>
        <p className="mb-2 text-sm font-semibold text-cobalt">Carbohydrate plan — {p.trainingLoad.tier.replace(/_/g, ' ')}</p>
        <p className="text-sm text-ink">This daily carbohydrate range reflects the logged and planned training context for today.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{p.carbPlan.perKg ?? p.carbPlan.gPerKgChosen} g/kg · band {p.carbPlan.band[0]}–{p.carbPlan.band[1]} g/kg · included in today's carbohydrate target, not added on top.</p>
        {(p.carbPlan.guidance?.preworkout || p.carbPlan.preworkout) && <p className="mt-2 text-sm text-ink">{p.carbPlan.guidance?.preworkout ? <>Pre-session: {p.carbPlan.guidance.preworkout.gPerKg[0]}–{p.carbPlan.guidance.preworkout.gPerKg[1]} g/kg, {p.carbPlan.guidance.preworkout.timingHours[0]}–{p.carbPlan.guidance.preworkout.timingHours[1]} hours before.</> : <>Pre-session: ~{p.carbPlan.preworkout.grams} g, {p.carbPlan.preworkout.timing}.</>}</p>}
        {(p.carbPlan.guidance?.duringWorkout || p.carbPlan.duringWorkout) && <p className="mt-2 text-sm text-ink">{p.carbPlan.guidance?.duringWorkout ? <>During the session: {p.carbPlan.guidance.duringWorkout.gramsPerHour[0]}–{p.carbPlan.guidance.duringWorkout.gramsPerHour[1]} g/hour. Amounts near 90 g/hour require a hard, tolerated long session, multi-transportable carbohydrate, and gut training.</> : <>During the session: ~{p.carbPlan.duringWorkout.gramsPerHour} g/hour.</>}</p>}
        {(p.carbPlan.guidance?.recovery || p.carbPlan.recovery) && <p className="mt-2 text-sm text-ink">{p.carbPlan.guidance?.recovery?.message || p.carbPlan.recovery?.note}</p>}
      </section>

      {p.carbLoading && (
        <Notice>
          {p.carbLoading.eligible
            ? <>Carbohydrate loading is available for your upcoming event: {(p.carbLoading.gPerKgPerDay || p.carbLoading.gramsPerKgRange)[0]}–{(p.carbLoading.gPerKgPerDay || p.carbLoading.gramsPerKgRange)[1]} g/kg/day for {(p.carbLoading.durationHours || [36, 48])[0]}–{(p.carbLoading.durationHours || [36, 48])[1]} hours. {p.carbLoading.note || 'Practice it in training first.'}</>
            : <>You opted in to carbohydrate loading for an upcoming session, but it doesn't qualify: {p.carbLoading.reason}</>}
        </Notice>
      )}

      {/* Planned sessions */}
      <section className="border-t border-line pt-3.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-lg font-semibold text-ink">Planned sessions today</h4>
          <TextButton onClick={() => setEditingWorkout(null)} chevron>Add session</TextButton>
        </div>
        {workouts.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">No sessions added here yet. Synced workouts may still contribute to the training context above.</p>
        ) : (
          <ul className="space-y-2">
            {workouts.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 border border-line-strong p-2.5">
                <span className="text-sm text-ink">
                  {w.sport[0].toUpperCase() + w.sport.slice(1)} · {w.duration_min} min · {w.intensity}
                  {w.is_race && ' · Race'}{w.is_key_session && ' · Key session'}
                </span>
                <TextButton onClick={() => setEditingWorkout(w)}>Edit</TextButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={editingWorkout !== undefined} onClose={() => setEditingWorkout(undefined)} title={editingWorkout?.id ? 'Edit session' : 'Add session'}>
        {editingWorkout !== undefined && (
          <WorkoutEditor
            date={day}
            workout={editingWorkout}
            unitsPref={profile?.units_pref}
            onCancel={() => setEditingWorkout(undefined)}
            onSaved={() => { setEditingWorkout(undefined); refresh() }}
            onDeleted={() => { setEditingWorkout(undefined); refresh() }}
          />
        )}
      </Sheet>

      <p className="border-t border-line pt-4 text-sm leading-relaxed text-muted">
        Educational nutritional-planning guidance based on population estimates — not medical advice, a diagnosis,
        real-time metabolic adaptation, or a guaranteed outcome. Talk with a doctor or registered dietitian before
        making significant changes, especially if automatic planning is unavailable for your profile.
      </p>
    </div>
  )
}
