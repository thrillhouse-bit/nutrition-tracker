import { useEffect, useMemo, useState } from 'react'
import { num, fmt, ymd, lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../lib/nutrition.js'
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

// Deliberately describes NON-TRAINING daily movement only — planned/synced
// workouts are counted separately by the engine (server/afp/engine.js's
// ACTIVITY_MULTIPLIERS comment), so wording this like "hard exercise 6-7
// days/week" (the quick calculator's activity levels) would double-count it.
const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Desk job, mostly sitting' },
  { key: 'light', label: 'Lightly active', desc: 'On your feet sometimes, casual walking' },
  { key: 'moderate', label: 'Moderately active', desc: 'An active job, or a lot of daily walking' },
  { key: 'active', label: 'Active', desc: 'A physically demanding job' },
  { key: 'very_active', label: 'Very active', desc: 'On your feet all day, physically demanding work' },
]

const GOALS = [
  { key: 'maintain', label: 'Maintain performance', desc: 'No calorie deficit or surplus' },
  { key: 'gradual_loss', label: 'Gradual loss', desc: 'A conservative deficit, paced by a weekly rate you choose' },
  { key: 'gradual_gain', label: 'Gradual gain', desc: 'A conservative surplus, paced by a weekly rate you choose' },
  { key: 'custom', label: 'Custom adjustment', desc: 'Set your own daily calorie adjustment directly' },
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
  const [sex, setSex] = useState(profile?.sex ?? '')
  const [bodyFatPct, setBodyFatPct] = useState(profile?.body_fat_pct ?? '')
  const [activityLevel, setActivityLevel] = useState(profile?.activity_level ?? '')
  const [goal, setGoal] = useState(profile?.goal ?? 'maintain')
  const [weeklyChangeKg, setWeeklyChangeKg] = useState(profile?.weekly_change_kg ?? '')
  const [calorieAdjustment, setCalorieAdjustment] = useState(profile?.calorie_adjustment ?? '')
  const [isPregnantOrPostpartum, setIsPregnantOrPostpartum] = useState(!!profile?.is_pregnant_or_postpartum)
  const [hasEdRiskFlag, setHasEdRiskFlag] = useState(!!profile?.has_ed_risk_flag)
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
  const canSubmit = heightOk && weightOk && ageOk && !!activityLevel && !!goal

  const weeklyLimits = goal === 'gradual_loss' ? { max: 1.0, label: 'up to 1.0 kg (2.2 lb) / week' } : { max: 0.5, label: 'up to 0.5 kg (1.1 lb) / week' }

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true); setError('')
    try {
      const payload = {
        units_pref: units,
        height_cm: units === 'imperial' ? round1(ftInToCm(heightFt, heightIn)) : num(heightCm),
        weight_kg: units === 'imperial' ? round1(lbToKg(weightLb)) : num(weightKg),
        age_years: num(age),
        sex: sex || null,
        body_fat_pct: bodyFatPct === '' ? null : num(bodyFatPct),
        activity_level: activityLevel,
        goal,
        weekly_change_kg: (goal === 'gradual_loss' || goal === 'gradual_gain') ? (weeklyChangeKg === '' ? null : num(weeklyChangeKg)) : null,
        calorie_adjustment: goal === 'custom' ? (calorieAdjustment === '' ? null : num(calorieAdjustment)) : null,
        is_pregnant_or_postpartum: isPregnantOrPostpartum,
        has_ed_risk_flag: hasEdRiskFlag,
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
        <h3 className="eyebrow">Adaptive Fuel Plan profile</h3>
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
        <span className="eyebrow mb-1.5 block">Sex</span>
        <div className="grid grid-cols-3 gap-2">
          {[['male', 'Male'], ['female', 'Female'], ['', 'Prefer not to say']].map(([key, label]) => (
            <OptionCard key={key || 'neutral'} selected={sex === key} onClick={() => setSex(key)} title={label} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-faint">
          Only used to choose between two well-established resting-energy formulas that differ by sex. Choosing
          "prefer not to say" uses a neutral estimate (the midpoint of both) instead of a guess.
        </p>
      </div>

      <Field label="Body fat % (optional)" hint="If you know it, this lets the plan use a lean-mass-based formula (Cunningham) instead of Mifflin-St Jeor.">
        <input type="number" inputMode="decimal" min="1" max="70" value={bodyFatPct} onChange={(e) => setBodyFatPct(e.target.value)} className={inputCls} placeholder="Leave blank if unknown" />
      </Field>

      <div>
        <span className="eyebrow mb-1.5 block">Baseline activity (non-training)</span>
        <p className="mb-2 text-xs text-faint">Everyday movement only — your planned and synced workouts are already counted separately, so this shouldn't include them.</p>
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

      {(goal === 'gradual_loss' || goal === 'gradual_gain') && (
        <Field label={`Target weekly ${goal === 'gradual_loss' ? 'loss' : 'gain'} (kg)`} hint={`Conservative guardrail: ${weeklyLimits.label}. A higher request is capped, with a note explaining why.`}>
          <input type="number" inputMode="decimal" min="0" max={weeklyLimits.max} step="0.1" value={weeklyChangeKg} onChange={(e) => setWeeklyChangeKg(e.target.value)} className={inputCls} placeholder="e.g. 0.4" />
        </Field>
      )}
      {goal === 'custom' && (
        <Field label="Daily calorie adjustment (kcal)" hint="Positive for a surplus, negative for a deficit. Still capped by the same conservative safety guardrails.">
          <input type="number" inputMode="decimal" value={calorieAdjustment} onChange={(e) => setCalorieAdjustment(e.target.value)} className={inputCls} placeholder="e.g. -300" />
        </Field>
      )}

      <div className="space-y-1 border-t border-line pt-3.5">
        <Checkbox
          checked={isPregnantOrPostpartum}
          onChange={setIsPregnantOrPostpartum}
          label="I'm currently pregnant or postpartum"
          hint="A calorie deficit is never suggested in this case — the plan uses a maintenance-level target and points to your OB/GYN or a registered dietitian instead."
        />
        <Checkbox
          checked={hasEdRiskFlag}
          onChange={setHasEdRiskFlag}
          label="I have a current or past eating disorder, or restricting calories isn't safe for me right now"
          hint="Same as above — no calorie deficit is suggested, and the plan points to an appropriate clinician instead. This is entirely optional and private to you."
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="subtle" onClick={onCancel}>Cancel</Button>
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
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} maxLength={500} />
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
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5">
        <p className="text-[11.5px] leading-snug text-muted">
          {hasOverride ? 'This day has a manual override applied.' : 'Need a different number just for today? Override it without changing your profile.'}
        </p>
        <TextButton onClick={openForm} chevron>{hasOverride ? 'Edit override' : 'Override today'}</TextButton>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-line pt-3.5">
      <ErrorNote>{error}</ErrorNote>
      <p className="text-xs text-faint">
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

const EQUATION_LABEL = {
  mifflin_st_jeor_male: 'Mifflin-St Jeor, male',
  mifflin_st_jeor_female: 'Mifflin-St Jeor, female',
  mifflin_st_jeor_neutral: 'Mifflin-St Jeor, neutral estimate',
  cunningham: 'Cunningham, from body fat %',
}

const SAFETY_LABEL = {
  minor: 'users under 18',
  pregnancy_postpartum: 'pregnancy/postpartum',
  ed_risk: 'the context you shared',
}

export default function AdaptiveFuelPlan({ date, refreshKey, onChanged }) {
  const [profile, setProfile] = useState(null)
  const [plan, setPlan] = useState(null)
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState(undefined) // undefined = closed, null = new, object = editing

  const day = ymd(date)

  const load = () => {
    let alive = true
    setLoading(true); setError('')
    Promise.all([api.afpPlan(day), api.listAfpWorkouts(day, day), api.getAfpProfile()])
      .then(([p, w, prof]) => {
        if (!alive) return
        setPlan(p); setWorkouts(w.workouts || []); setProfile(prof.profile)
      })
      .catch((err) => { if (alive) setError(err.message || 'Could not load your Adaptive Fuel Plan.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }

  useEffect(load, [day, refreshKey])

  const refresh = () => { load(); onChanged?.() }

  const recompute = async () => {
    setLoading(true)
    try { await api.recomputeAfpPlan(day) } finally { refresh() }
  }

  if (loading && !plan) return <Spinner label="Building your Adaptive Fuel Plan…" />
  if (error) return <ErrorNote>{error}</ErrorNote>

  const p = plan?.plan
  const hasProfileYet = profile && (profile.weight_kg != null || profile.height_cm != null || profile.age_years != null)

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
        <EmptyState title="Set up your Adaptive Fuel Plan">
          Enter your body metrics, baseline activity and a goal, and this plan will calculate a real-time daily
          energy and macro target — including carbohydrate periodization on training days. Nothing here replaces
          medical advice.
          <div className="mt-4 flex justify-center">
            <Button onClick={() => setEditingProfile(true)}>Set up my profile</Button>
          </div>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="serif text-[22px] leading-none text-ink">Adaptive Fuel Plan</h3>
        <TextButton onClick={() => setEditingProfile(true)} chevron>Edit profile</TextButton>
      </header>

      {plan.frozen && (
        <Notice>
          <strong>This day's plan is frozen.</strong> Past days keep the numbers they had at the time so later
          wearable data never silently rewrites history.{' '}
          <TextButton onClick={recompute}>Recompute anyway</TextButton>
        </Notice>
      )}

      {p.safety?.suppressed && (
        <Notice tone="alert">
          <strong>A calorie deficit isn't offered here.</strong> {p.safety.message}
        </Notice>
      )}

      {p.warnings?.length > 0 && (
        <div className="space-y-1.5 border border-line-strong bg-fill p-3 text-[12.5px] leading-snug text-ink">
          {p.warnings.map((w, i) => <p key={i}>{w.message}</p>)}
        </div>
      )}

      {/* Targets + progress */}
      <section className="border-t border-line pt-3.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          {[['calories', 'Energy', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g']].map(([k, label, unit]) => {
            const prog = plan.progress?.[k]
            return (
              <div key={k}>
                <div className="numeral text-2xl leading-none text-ink">{fmt(p.targets[k])}<span className="ml-1 text-xs font-medium text-muted">{unit}</span></div>
                <div className="eyebrow mt-1.5">{label}</div>
                {prog && (
                  <>
                    <Meter value={prog.actual} target={prog.target} className="mt-2" />
                    <div className="mt-1 text-[10.5px] text-muted">{fmt(prog.actual, unit === 'kcal' ? 0 : 1)} logged · {fmt(Math.max(0, prog.remaining), unit === 'kcal' ? 0 : 1)} left</div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {p.overridesApplied && (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-cobalt">Manual override applied</p>
        )}
      </section>

      <OverrideControl date={day} targets={p.targets} currentOverrides={plan.overrides} onChanged={refresh} />

      {/* Why this changed */}
      <Why
        label="Why this changed"
        items={[
          `Baseline (resting rate × your non-training activity level): ${fmt(p.energy.baselineNonTraining)} kcal.`,
          p.energy.exercise > 0 ? `Training today: +${fmt(p.energy.exercise)} kcal.` : 'No training energy added today.',
          p.energy.goalAdjustment !== 0 ? `Goal adjustment: ${p.energy.goalAdjustment > 0 ? '+' : ''}${fmt(p.energy.goalAdjustment)} kcal.` : 'No goal-driven adjustment (maintaining).',
          p.energy.guardrailApplied ? `Safety guardrail applied — raised to a floor of ${fmt(p.energy.guardrailFloor)} kcal.` : null,
          p.overridesApplied ? 'Your manual override is applied on top of all of the above.' : null,
        ].filter(Boolean)}
      />

      {/* RMR */}
      <Why label={`Resting energy estimate: ${fmt(p.rmr.value)} kcal (${EQUATION_LABEL[p.rmr.equation] || p.rmr.equation})`} items={p.rmr.assumptions} />

      {/* BMI — optional context only */}
      {p.bmi && (
        <p className="text-xs text-faint">
          BMI {p.bmi.value} ({p.bmi.category}) — shown as optional context only. It is not used to set your fueling
          targets and is not a health diagnosis.
        </p>
      )}

      {/* Carb periodization */}
      <section className="border-t border-line pt-3.5">
        <h4 className="eyebrow mb-2">Carbohydrate plan — {p.trainingLoad.tier.replace(/_/g, ' ')}</h4>
        <p className="text-sm text-ink">{p.carbPlan.reason}</p>
        <p className="mt-1 text-xs text-muted">{p.carbPlan.gPerKgChosen} g/kg · band {p.carbPlan.band[0]}–{p.carbPlan.band[1]} g/kg</p>
        {p.carbPlan.preworkout && <p className="mt-2 text-sm text-ink">Pre-session: ~{p.carbPlan.preworkout.grams} g, {p.carbPlan.preworkout.timing}. {p.carbPlan.preworkout.note}</p>}
        {p.carbPlan.duringWorkout && <p className="mt-2 text-sm text-ink">During the session: ~{p.carbPlan.duringWorkout.gramsPerHour} g/hour. {p.carbPlan.duringWorkout.note}</p>}
        {p.carbPlan.recovery && <p className="mt-2 text-sm text-ink">{p.carbPlan.recovery.note}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] uppercase tracking-[0.06em] text-muted">
          {Object.entries(p.carbPlan.allocationPct).map(([slot, pct]) => (
            <span key={slot}>{slot.replace(/([A-Z])/g, ' $1')}: {pct}%</span>
          ))}
        </div>
      </section>

      {p.carbLoading && (
        <Notice>
          {p.carbLoading.eligible
            ? <>Carbohydrate loading is available for your upcoming event: {p.carbLoading.gramsPerKgRange[0]}–{p.carbLoading.gramsPerKgRange[1]} g/kg in the 24–36h before. {p.carbLoading.note}</>
            : <>You opted in to carbohydrate loading for an upcoming session, but it doesn't qualify: {p.carbLoading.reason}</>}
        </Notice>
      )}

      {/* Planned sessions */}
      <section className="border-t border-line pt-3.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="eyebrow">Planned sessions today</h4>
          <TextButton onClick={() => setEditingWorkout(null)} chevron>Add session</TextButton>
        </div>
        {workouts.length === 0 ? (
          <p className="text-sm text-muted">No sessions planned — showing your rest-day carbohydrate band.</p>
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

      <p className="border-t border-line pt-3.5 text-xs text-faint">
        Educational nutritional-planning guidance based on the estimates you provided — not medical advice, a
        diagnosis, or a guaranteed outcome. Talk with a doctor or registered dietitian before making significant
        changes, especially if any of the above safety notices apply to you.
      </p>
    </div>
  )
}
