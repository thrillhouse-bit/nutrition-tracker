import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { Button, Card, Spinner, StatusTag, Toggle } from './ui.jsx'

// Human "time since" for a last-sync timestamp.
function since(ts) {
  if (!ts) return null
  const ms = Date.now() - new Date(ts).getTime()
  if (!Number.isFinite(ms)) return null
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}

const INFLUENCE = [
  { key: 'readiness', label: 'Readiness', hint: 'Lower readiness keeps protein up and fueling steady' },
  { key: 'sleep', label: 'Sleep', hint: 'Short sleep adds a hydration / steady-carb note' },
  { key: 'workouts', label: 'Workouts', hint: 'An endurance session raises the carbohydrate target' },
]

// One provider: status, categories, connect/disconnect, and per-provider toggles.
function ProviderCard({ provider, accounts, onRefetch, busy, setBusy }) {
  const { id, name, connect, categories = [], status, demo, enabled, last_synced_at } = provider
  const connected = status === 'connected' || status === 'stale'
  const syncedLabel = since(last_synced_at)

  const patch = async (body) => {
    setBusy(id)
    try {
      await api.setProvider(id, body)
      await onRefetch()
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (accountId) => {
    setBusy(id)
    try {
      if (id === 'oura') await api.disconnectOura(accountId)
      else if (id === 'garmin') await api.disconnectGarmin(accountId)
      await onRefetch()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="serif text-lg text-ink">{name}</h3>
            <StatusTag status={status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span key={c} className="rounded border border-line px-1.5 py-0.5 text-[11px] capitalize text-muted">{c}</span>
            ))}
          </div>
        </div>
        {syncedLabel && connected && (
          <div className="shrink-0 text-right text-[11px] text-faint">
            <div className="eyebrow">Last sync</div>
            <div className="tabular-nums">{syncedLabel}</div>
          </div>
        )}
      </div>

      {/* Demo honesty — never let seeded data read as a live connection. */}
      {status === 'demo' && (
        <p className="mt-3 rounded-md border border-lavender/30 bg-lavender/5 px-3 py-2 text-xs text-lavender">
          ◇ Showing demo data so you can try the experience. This is not a live connection — connect below to use your own.
        </p>
      )}

      {/* Connect / accounts */}
      <div className="mt-3 border-t border-line pt-3">
        {connect === 'oauth' ? (
          <div className="space-y-2">
            {accounts?.length > 0 && (
              <div className="space-y-1.5">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">{a.label || 'Account'}</span>
                    <button
                      onClick={() => disconnect(a.id)}
                      disabled={busy === id}
                      className="shrink-0 rounded border border-alert/40 px-2 py-1 text-xs font-semibold text-alert hover:bg-alert/5 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            )}
            <a
              href={`/api/${id}/connect`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-cobalt px-4 py-2.5 text-sm font-semibold text-oncobalt transition hover:brightness-110"
            >
              {accounts?.length > 0 ? 'Add another account' : `Connect ${name}`}
            </a>
            <p className="text-[11px] text-faint">Authorization happens on {name}. Tokens are stored server-side and never exposed to this app.</p>
          </div>
        ) : (
          // Apple Health: no cloud API — data arrives from a companion / export.
          <div className="space-y-1.5 text-sm">
            <p className="text-muted">
              Apple Health has no cloud connection. An Apple Watch / iPhone companion (or a Health export) sends your
              workouts and energy to this app privately.
            </p>
            <p className="text-[11px] text-faint">
              Samples POST to <code className="rounded bg-black/5 px-1">/api/apple/ingest</code> on your own server —
              nothing leaves your instance.
            </p>
          </div>
        )}
      </div>

      {/* Per-provider controls */}
      <div className="mt-3 space-y-3 border-t border-line pt-3">
        <label className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Use in my plan</span>
            <span className="block text-xs text-muted">Let this provider's signals influence recommendations</span>
          </span>
          <Toggle checked={enabled !== false} onChange={(v) => patch({ enabled: v })} label={`Use ${name} in plan`} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Demo data when offline</span>
            <span className="block text-xs text-muted">Use seeded sample data when there's no live sync</span>
          </span>
          <Toggle checked={demo !== false} onChange={(v) => patch({ demo: v })} label={`Demo data for ${name}`} />
        </label>
      </div>
    </Card>
  )
}

export default function Connections({ refreshKey, onChanged }) {
  const [conn, setConn] = useState(null)
  const [ouraAccts, setOuraAccts] = useState([])
  const [garminAccts, setGarminAccts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [savingInf, setSavingInf] = useState(null)

  const load = useCallback(async () => {
    const [c, o, g] = await Promise.all([
      api.connections(),
      api.ouraAccounts().catch(() => ({ accounts: [] })),
      api.garminAccounts().catch(() => ({ accounts: [] })),
    ])
    setConn(c)
    setOuraAccts(o.accounts || [])
    setGarminAccts(g.accounts || [])
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    load().catch(() => {}).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [load, refreshKey])

  const acctsFor = (id) => (id === 'oura' ? ouraAccts : id === 'garmin' ? garminAccts : [])

  const toggleInfluence = async (key, value) => {
    setSavingInf(key)
    try {
      const r = await api.setInfluence({ [key]: value })
      setConn((c) => (c ? { ...c, influence: r.influence } : c))
      onChanged?.()
    } finally {
      setSavingInf(null)
    }
  }

  if (loading && !conn) return <Spinner label="Loading connections…" />

  const providers = conn?.providers || []
  const influence = conn?.influence || { readiness: true, sleep: true, workouts: true }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="serif text-2xl text-ink">Connections</h2>
        <p className="text-sm text-muted">Recovery and training signals that shape your fueling plan.</p>
      </header>

      {/* Providers */}
      <section className="space-y-3">
        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            accounts={acctsFor(p.id)}
            onRefetch={load}
            busy={busy}
            setBusy={setBusy}
          />
        ))}
      </section>

      {/* What's allowed to influence the plan */}
      <section>
        <h3 className="eyebrow mb-2">What influences my plan</h3>
        <Card className="divide-y divide-line">
          {INFLUENCE.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{f.label}</span>
                <span className="block text-xs text-muted">{f.hint}</span>
              </span>
              <Toggle
                checked={influence[f.key] !== false}
                onChange={(v) => toggleInfluence(f.key, v)}
                label={`Allow ${f.label} to influence plan`}
                id={`inf-${f.key}`}
              />
            </label>
          ))}
        </Card>
        {savingInf && <p className="mt-1 text-xs text-faint">Saving…</p>}
      </section>

      {/* Privacy */}
      <section>
        <Card className="p-4 text-xs text-muted">
          <div className="mb-1 font-semibold text-ink">Your data stays yours</div>
          OAuth tokens and provider credentials live only on your server and are never sent to the browser. Wearable data
          is used solely to shape your fueling plan on this device. Disconnect a provider at any time to stop its sync and
          remove its influence.
        </Card>
      </section>
    </div>
  )
}
