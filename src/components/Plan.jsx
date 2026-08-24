import { useEffect, useMemo, useState } from 'react'
import { NUTRIENTS, fmt, num, ymd } from '../lib/nutrition.js'
import { api } from '../api/client.js'
import { Button, Card, EmptyState, ErrorNote, Field, inputCls, Spinner, StatusTag } from './ui.jsx'

const provLabel = (p) => (p ? p[0].toUpperCase() + p.slice(1) : 'Signal')

// One nutrient's baseline → adjusted comparison. When they differ, the adjusted
// figure is emphasised and a signed delta chip explains the change.
function CompareRow({ n, base, adj }) {
  const b = num(base)
  const a = num(adj)
  const changed = Math.abs(a - b) >= (n.decimals ? 0.05 : 0.5)
  const delta = a - b
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <span className="font-medium text-ink">{n.label}</span>
      <div className="flex items-center gap-3">
        <span className={`tabular-nums text-sm ${changed ? 'text-faint line-through' : 'text-ink'}`}>
          {fmt(b, n.decimals)}
          <span className="text-faint"> {n.unit}</span>
        </span>
        {changed && (
          <>
            <span aria-hidden className="text-faint">→</span>
            <span className="numeral text-base text-cobalt">
              {fmt(a, n.decimals)}
              <span className="ml-0.5 text-xs font-medium text-muted">{n.unit}</span>
            </span>
            <span className="rounded bg-cobalt-soft px-1.5 py-0.5 text-[11px] font-semibold text-cobalt">
              {delta > 0 ? '+' : '−'}{fmt(Math.abs(delta), n.decimals)}
            </span>
          </>
        )}
      </div>
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

  return (
    <Card className="space-y-3 p-4">
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
      <div className="flex gap-2">
        <Button variant="quiet" onClick={reset} disabled={saving}>Reset fields</Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save baseline'}</Button>
      </div>
    </Card>
  )
}

export default function Plan({ date, refreshKey, onChanged }) {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

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
  const hasBaseline = baseline && NUTRIENTS.some((n) => baseline[n.key] != null)

  const changedKeys = useMemo(() => {
    if (!baseline) return []
    return NUTRIENTS.filter((n) => Math.abs(num(adjusted[n.key]) - num(baseline[n.key])) >= (n.decimals ? 0.05 : 0.5))
  }, [baseline, adjusted])

  if (loading && !plan) return <Spinner label="Building your plan…" />

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="serif text-2xl text-ink">Today's plan</h2>
          <p className="text-sm text-muted">
            {changedKeys.length > 0
              ? 'Adjusted from your baseline for today — every change is explained below.'
              : 'Matching your baseline targets. No adjustments today.'}
          </p>
        </div>
        {hasBaseline && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>Edit baseline</Button>
        )}
      </header>

      {editing ? (
        <EditTargets
          baseline={baseline}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged?.() }}
        />
      ) : !hasBaseline ? (
        <EmptyState title="Set your baseline targets">
          <div className="mt-3"><Button onClick={() => setEditing(true)}>Set targets</Button></div>
        </EmptyState>
      ) : (
        <>
          {/* Baseline vs adjusted */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="eyebrow">Targets</h3>
              {changedKeys.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cobalt">
                  <span aria-hidden>◆</span> Adjusted
                </span>
              )}
            </div>
            <Card className="px-4 py-1">
              {NUTRIENTS.map((n) => (
                <CompareRow key={n.key} n={n} base={baseline[n.key]} adj={adjusted[n.key]} />
              ))}
            </Card>
          </section>

          {/* Why — rationale with provenance */}
          <section>
            <h3 className="eyebrow mb-2">Why it's adjusted</h3>
            {rationale.length === 0 ? (
              <p className="text-sm text-muted">
                No adjustments today. When a connected signal (a workout, lower readiness, short sleep) suggests a change,
                it appears here with its reason and source — your baseline is never changed silently.
              </p>
            ) : (
              <div className="space-y-2">
                {rationale.map((r, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold capitalize text-ink">{r.factor}</span>
                      <span className="numeral text-sm text-cobalt">{r.effect}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{r.detail}</p>
                    <div className="mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                        <span className="font-medium text-muted">{provLabel(r.source)}</span>
                        <span aria-hidden>·</span>
                        <StatusTag status={r.demo ? 'demo' : 'fresh'} />
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-faint">
            Adjustments come from the signals you allow to influence your plan. Manage those in Connections.
            This is nutritional planning guidance, not medical advice.
          </p>
        </>
      )}
    </div>
  )
}
