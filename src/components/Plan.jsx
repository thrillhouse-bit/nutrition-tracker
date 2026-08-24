import { useEffect, useMemo, useState } from 'react'
import { NUTRIENTS, fmt, num, ymd } from '../lib/nutrition.js'
import { api } from '../api/client.js'
import { Button, EmptyState, ErrorNote, Field, inputCls, Spinner, StatusMark, Toggle, Why } from './ui.jsx'

const meta = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]))
const provLabel = (p) => (p ? p[0].toUpperCase() + p.slice(1) : 'Signal')

// Local mirrors of the server's engine helpers (server/plan.js). The timeline's
// pre-workout target reuses the exact formula the recommendation engine uses, so
// the number the plan shows here is the number the day's guidance is built on —
// never a second, drifting estimate.
const round = (v, step = 1) => Math.round(num(v) / step) * step
const isEndurance = (kind = '') => /run|ride|bike|cycl|swim|row|cardio|endurance|long/.test(String(kind).toLowerCase())

// Warm, tabular date stamp — SAT 23 AUG — matching the artboard's masthead meta.
function dateStamp(date) {
  return new Date(date)
    .toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
    .replace(/,/g, '')
    .toUpperCase()
}

// The design's Target / Baseline / Today row: name in Bodoni, baseline muted,
// adjusted emphasised with a signed cobalt delta chip — or HELD when unchanged.
// Never a silent change: baseline and today sit side by side, always.
function TargetRow({ n, label, base, adj }) {
  const b = num(base)
  const a = num(adj)
  const changed = Math.abs(a - b) >= (n.decimals ? 0.05 : 0.5)
  const delta = a - b
  const unit = n.key === 'calories' ? '' : n.unit
  return (
    <div className="flex items-center border-t border-line py-2">
      <span className="flex-1 serif text-[17px] leading-none text-ink">{label}</span>
      <span className="w-[72px] text-right tnum text-sm text-muted">
        {fmt(b, n.decimals)}{unit && ` ${unit}`}
      </span>
      <span className="w-[132px] whitespace-nowrap text-right leading-none">
        <span className="numeral text-[22px] tnum text-ink">{fmt(a, n.decimals)}</span>
        {unit && <span className="ml-0.5 text-[10px] font-medium text-muted">{unit}</span>}
        {changed ? (
          <span className="ml-1.5 align-middle text-[10px] font-bold tracking-tight text-cobalt tnum">
            {delta > 0 ? '+' : '−'}{fmt(Math.abs(delta), n.decimals)}
          </span>
        ) : (
          <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
            Held
          </span>
        )}
      </span>
    </div>
  )
}

// One meal-timing node — a square marker on a vertical hairline. Cobalt = the
// pre-workout fuel window, lavender = the planned session, ink outline = a meal
// target. Color carries context; the words carry the meaning.
function TimelineNode({ node, last }) {
  const cobalt = node.tone === 'cobalt'
  const markerCls =
    cobalt ? 'bg-cobalt'
      : node.tone === 'lavender' ? 'border-[1.5px] border-line-heavy bg-lavender'
        : 'border-[1.5px] border-line-heavy bg-paper'
  const size = cobalt ? 11 : 9
  return (
    <div className={`relative ${last ? '' : 'pb-3'}`}>
      <span aria-hidden className={`absolute ${markerCls}`} style={{ left: cobalt ? -23 : -22, top: cobalt ? 3 : 4, width: size, height: size }} />
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[15px] leading-none ${cobalt ? 'font-medium text-cobalt' : 'text-ink'}`}>{node.name}</span>
        <span className={`tnum text-[11px] ${cobalt ? 'font-semibold text-cobalt' : 'font-medium text-muted'}`}>{node.meta}</span>
      </div>
      {node.sub && (
        <div className={`mt-1.5 tnum text-[10.5px] tracking-[0.06em] ${cobalt ? 'text-ink/80' : 'text-muted'}`}>{node.sub}</div>
      )}
    </div>
  )
}

// Editable baseline targets. Baseline is the user's own plan; the engine never
// writes to it — adjustments are layered on top and always shown with reasons.
function EditTargets({ baseline, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(NUTRIENTS.map((n) => [n.key, baseline?.[n.key] ?? ''])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const reset = () => setDraft(Object.fromEntries(NUTRIENTS.map((n) => [n.key, baseline?.[n.key] ?? ''])))

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = Object.fromEntries(
        NUTRIENTS.map((n) => [n.key, draft[n.key] === '' ? null : num(draft[n.key])]),
      )
      await api.setTargets(payload)
      onSaved()
    } catch (err) {
      setError(err.message || 'Could not save targets.')
    } finally {
      setSaving(false)
    }
  }

  // White sheet — a moment that matters. Sharp edges, hairline frame.
  return (
    <div className="space-y-4 border border-line bg-card p-4 shadow-[0_1px_0_rgb(18_18_16/0.06)]">
      <h3 className="eyebrow">Edit baseline targets</h3>
      <ErrorNote>{error}</ErrorNote>
      <div className="grid grid-cols-2 gap-3">
        {NUTRIENTS.map((n) => (
          <Field key={n.key} label={`${n.label} (${n.unit})`}>
            <input
              type="number"
              inputMode="decimal"
              value={draft[n.key]}
              onChange={(e) => set(n.key, e.target.value)}
              className={inputCls}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-faint">Your baseline plan. Today's adjustments are shown separately, with reasons.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="subtle" onClick={reset} disabled={saving}>Reset fields</Button>
        <div className="flex-1" />
        <Button variant="subtle" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save baseline'}</Button>
      </div>
    </div>
  )
}

export default function Plan({ date, refreshKey, onChanged }) {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [savingInf, setSavingInf] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.planToday(ymd(date))
      .then((r) => alive && setPlan(r))
      .catch(() => alive && setPlan(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [date, refreshKey])

  const baseline = plan?.baseline
  const adjusted = plan?.adjusted || baseline || {}
  const rationale = plan?.rationale || []
  const signals = plan?.signals || {}
  const influence = plan?.influence || {}
  const hasBaseline = baseline && NUTRIENTS.some((n) => baseline[n.key] != null)

  // The planned session and its provenance (server/plan.js signal shape).
  const wSig = signals.workout
  const wv = wSig?.value || null
  const workoutOK = !!(wSig && wv && wSig.freshness !== 'unavailable')
  const endurance = workoutOK && isEndurance(wv.kind)

  // Demo must never look like a live connection. Today marks every context
  // cell; Plan is the other adjusted-targets surface and inherited nothing —
  // its first audit found zero "demo" on the rendered tab while a Sand tag
  // read "ADJUSTED FOR RUN" off seeded data.
  const anyDemo =
    Object.values(signals).some((s) => s?.demo) || rationale.some((r) => r.demo)

  // Context tags derived from the rationale — the same reasons the table shows.
  const tags = useMemo(() => {
    const out = []
    const has = (f) => rationale.some((r) => r.factor === f)
    if (has('workout')) {
      const label = (wv?.shortLabel || wv?.label || 'your workout').toUpperCase()
      out.push({ tone: 'outline', text: 'HIGHER-CARBOHYDRATE DAY' })
      out.push({ tone: 'sand', text: `ADJUSTED FOR ${label}` })
    }
    if (has('readiness')) out.push({ tone: 'mist', text: 'HIGHER-PROTEIN DAY' })
    if (has('sleep')) out.push({ tone: 'mist', text: 'STEADY-FUELING NOTE' })
    if (out.length === 0) out.push({ tone: 'neutral', text: 'MATCHES BASELINE' })
    return out
  }, [rationale, wv])

  // "Why this changed" — every rationale detail, prefixed by its effect and
  // tagged with its source so nothing is opaque.
  const whyItems = rationale.map((r) => {
    const prefix = r.effect && r.effect !== 'no change' ? `${r.effect} — ` : ''
    return `${prefix}${r.detail} (${provLabel(r.source)}${r.demo ? ', demo' : ''})`
  })

  // Rows: the four macros the design names, plus any extra target the user has
  // actually set. Only render a row whose baseline value exists.
  const rowDefs = useMemo(() => {
    const named = [
      { key: 'calories', label: 'Energy' },
      { key: 'carbs_g', label: 'Carbohydrate' },
      { key: 'protein_g', label: 'Protein' },
      { key: 'fat_g', label: 'Fat' },
      { key: 'fiber_g', label: 'Fiber' },
      { key: 'sugar_g', label: 'Sugar' },
      { key: 'sodium_mg', label: 'Sodium' },
    ]
    return named.filter((d) => baseline?.[d.key] != null || adjusted?.[d.key] != null)
  }, [baseline, adjusted])

  // Meal-timing nodes, built only from data we hold. Pre-workout fuel and the
  // session come from the workout signal; the recovery node states the day's
  // adjusted macro target (never a fabricated per-meal split).
  const timeline = useMemo(() => {
    const nodes = []
    const dayTarget = `DAY TARGET ${fmt(adjusted.protein_g)} g P · ${fmt(adjusted.carbs_g)} g C`
    if (workoutOK) {
      const wTime = wv.time || ''
      // A bare provider name on seeded data reads as a live sync; say DEMO.
      const prov = [(wSig.provider || '').toUpperCase(), wSig.demo ? 'DEMO' : null]
        .filter(Boolean).join(' · ')
      if (endurance) {
        const preCarb = Math.max(30, round(num(adjusted.carbs_g) * 0.25, 5))
        const preProtein = Math.max(15, round(num(adjusted.protein_g) * 0.2, 5))
        nodes.push({
          tone: 'cobalt',
          name: `Pre-${wv.shortLabel || 'session'} fuel`,
          meta: `BY ${wTime || 'START'}`,
          sub: `TARGET ${preProtein} g P · ${preCarb} g C`,
        })
      }
      nodes.push({
        tone: 'lavender',
        name: wv.label || wv.shortLabel || 'Planned session',
        meta: [wTime, prov].filter(Boolean).join(' · '),
        sub: ['PLANNED', wv.est_kcal ? `${fmt(wv.est_kcal)} KCAL` : null, wv.kind ? String(wv.kind).toUpperCase() : null]
          .filter(Boolean).join(' · '),
      })
      nodes.push({ tone: 'neutral', name: 'Recovery fuel', meta: 'AFTER SESSION', sub: dayTarget })
    } else {
      nodes.push({ tone: 'neutral', name: 'Baseline meals', meta: 'ALL DAY', sub: dayTarget })
    }
    return nodes
  }, [workoutOK, endurance, wv, wSig, adjusted])

  const setWorkoutsInfluence = async (v) => {
    setSavingInf(true)
    try {
      const r = await api.setInfluence({ workouts: v })
      setPlan((p) => (p ? { ...p, influence: r?.influence || { ...p.influence, workouts: v } } : p))
      onChanged?.()
    } catch {
      /* leave the toggle where it was; a failed save must not read as applied */
    } finally {
      setSavingInf(false)
    }
  }

  if (loading && !plan) return <Spinner label="Building your plan…" />

  return (
    <div>
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="serif text-[32px] leading-none text-ink">Plan</h2>
        <span className="flex items-baseline gap-2.5">
          {anyDemo && <StatusMark status="demo" className="text-[10px] uppercase tracking-[0.1em]" />}
          <span className="tnum text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{dateStamp(date)}</span>
        </span>
      </header>

      {editing ? (
        <div className="mt-5">
          <EditTargets
            baseline={baseline}
            onCancel={() => setEditing(false)}
            onSaved={() => { setEditing(false); onChanged?.() }}
          />
        </div>
      ) : !hasBaseline ? (
        <div className="mt-5">
          <EmptyState title="Set your baseline targets">
            Your plan starts from targets you set. Adjustments layer on top — always with a reason and a source.
            <div className="mt-4"><Button onClick={() => setEditing(true)}>Set targets</Button></div>
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Context tags — sharp rectangles. Mist = recovery, Sand = training,
              outline (transparent) = a higher-macro day that isn't a fill swatch. */}
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span
                key={i}
                className={`inline-flex items-center border border-line-strong px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink ${
                  t.tone === 'sand' ? 'bg-sand' : t.tone === 'mist' ? 'bg-mist' : 'bg-transparent'
                }`}
              >
                {t.text}
              </span>
            ))}
          </div>

          {/* Why this changed — transparent, source-tagged disclosure */}
          <div className="mt-2.5 border-t border-line">
            {whyItems.length > 0 ? (
              <Why label="Why this changed" items={whyItems} />
            ) : (
              <p className="py-3.5 text-sm text-muted">Matches your baseline — no adjustments from your signals today.</p>
            )}
          </div>

          {/* Target / Baseline / Today */}
          <section className="mt-1 border-t border-line pt-3.5">
            <div className="flex pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              <span className="flex-1">Target</span>
              <span className="w-[72px] text-right">Baseline</span>
              <span className="w-[132px] text-right">Today</span>
            </div>
            <div className="border-b border-line">
              {rowDefs.map((d) => (
                <TargetRow key={d.key} n={meta[d.key]} label={d.label} base={baseline[d.key]} adj={adjusted[d.key]} />
              ))}
            </div>

            {/* Nothing is locked — edit any value and the plan keeps it */}
            <div className="mt-3.5 flex items-center justify-between gap-3">
              <p className="max-w-[210px] text-[11.5px] leading-snug text-muted">
                Nothing here is locked. Edit any adjusted value and the plan keeps it.
              </p>
              {/* No text-cobalt override: outline's own text-ink won the cascade
                  anyway (class order doesn't beat stylesheet order), and the
                  rendered ink matches the other outline buttons. */}
              <Button variant="outline" onClick={() => setEditing(true)}>Edit targets</Button>
            </div>
          </section>

          {/* Meal timing */}
          <section className="mt-7">
            <h3 className="eyebrow mb-3.5">Meal timing</h3>
            {!workoutOK && (
              <p className="mb-3 text-sm text-muted">No planned session today — showing your baseline meal targets.</p>
            )}
            <div className="relative pl-[22px]">
              <div className="absolute left-[3.5px] top-1.5 bottom-2 w-px bg-line-strong" />
              {timeline.map((node, i) => (
                <TimelineNode key={i} node={node} last={i === timeline.length - 1} />
              ))}
            </div>
          </section>

          {/* Let Plan adapt — the workouts influence toggle */}
          <div className="mt-7 flex items-center justify-between gap-4 border-t border-line pt-3.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink">Let Plan adapt to Garmin &amp; workouts</div>
              <div className="mt-1 text-[11px] leading-snug text-muted">Off keeps baseline targets every day.</div>
            </div>
            <Toggle
              checked={influence?.workouts !== false}
              onChange={setWorkoutsInfluence}
              label="Let Plan adapt to Garmin and workouts"
              id="inf-workouts"
            />
          </div>
          {savingInf && <p className="mt-1 text-right text-[11px] text-faint">Saving…</p>}

          <p className="mt-4 text-xs text-faint">
            Adjustments come only from the signals you allow to influence your plan — nothing changes silently.
            This is nutritional planning guidance, not medical advice.
          </p>
        </>
      )}
    </div>
  )
}
