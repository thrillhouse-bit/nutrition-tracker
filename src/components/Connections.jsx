import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { Button, Meter, Spinner, StatusMark, TextButton, Toggle } from './ui.jsx'

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

// The three real influence signals, in the design's order, with the design's
// one-line descriptions. Keys map straight onto `influence[...]`.
const SIGNALS = [
  { key: 'sleep', label: 'Sleep', hint: 'Informs timing and recovery context' },
  { key: 'readiness', label: 'Readiness', hint: 'Available for plan context' },
  { key: 'workouts', label: 'Workouts', hint: 'Primary driver of target changes' },
]

// STATE REFERENCE legend — shape + word, never color alone. Static, straight
// from the artboard. `label` overrides StatusMark's default word where the
// design's word differs (DISCONNECTED vs the component's "Not connected").
const STATES = [
  { status: 'connected', desc: 'Solid mark · syncing on schedule' },
  { status: 'syncing', desc: 'Hatched · progress bar shown' },
  { status: 'stale', desc: 'Hollow · last sync over 24 h ago' },
  { status: 'disconnected', label: 'Disconnected', desc: 'Dashed · recommendations use intake only' },
  { status: 'error', desc: 'Mark plus reason and a retry action' },
]

// Shared block-button language (matches the ui Button primary, usable on an <a>).
const CTA =
  'inline-flex items-center justify-center gap-2 px-5 py-4 text-xs font-bold uppercase tracking-[0.13em] transition'

// One provider row: name, shape+word status, a device/context sub-line, and a
// state-appropriate action. MANAGE / How-to-sync expand an inline panel that
// carries the accounts + the per-provider enable/demo toggles.
// Plain-language "what is read" per HealthKit category, for the Apple panel.
const APPLE_CATEGORY_LABEL = {
  workouts: 'Workouts & timing',
  activeEnergy: 'Active energy',
  exercise: 'Exercise minutes',
  sleep: 'Sleep duration & timing',
  hrv: 'Heart-rate variability (context)',
  restingHR: 'Resting heart rate (context)',
  steps: 'Steps',
}
const APPLE_READS = ['workouts', 'activeEnergy', 'exercise', 'sleep', 'hrv', 'restingHR', 'steps']

function ProviderRow({ provider, accounts, onRefetch, busy, setBusy }) {
  const { id, name, connect, categories = [], status, demo, enabled, last_synced_at, permissions, partial } = provider
  const oauth = connect === 'oauth'
  const connectedish = status === 'connected' || status === 'stale' || status === 'syncing'
  const isDemo = status === 'demo'
  const syncedLabel = since(last_synced_at)
  const context = categories.slice(0, 3).join(' · ')
  const [open, setOpen] = useState(false)
  const working = busy === id
  // Disconnecting means re-doing an OAuth flow to undo, so it gets a second
  // tap rather than firing on the first — mirrors no other confirm pattern
  // in this app because it's the only one-tap action here with real friction
  // to reverse. Any other click (opening another account's confirm, closing
  // the panel) drops back to the unconfirmed state.
  const [confirmingId, setConfirmingId] = useState(null)
  useEffect(() => { if (!open) setConfirmingId(null) }, [open])

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
    setConfirmingId(null)
    try {
      if (id === 'oura') await api.disconnectOura(accountId)
      else if (id === 'garmin') await api.disconnectGarmin(accountId)
      await onRefetch()
    } finally {
      setBusy(null)
    }
  }

  // The right-hand primary action depends on state.
  let action
  if (oauth && connectedish) {
    action = (
      <Button variant={status === 'syncing' ? 'subtle' : 'outline'} onClick={() => setOpen((v) => !v)}>
        Manage
      </Button>
    )
  } else if (oauth) {
    // disconnected / error / demo: the primary action is to connect (a browser
    // navigation to the OAuth start on your own server — never a fetch).
    action = (
      <a href={`/api/${id}/connect`} className={`${CTA} bg-cobalt text-oncobalt hover:bg-cobalt-ink`}>
        {status === 'error' ? 'Reconnect' : `Connect ${name}`}
      </a>
    )
  } else {
    // Apple Health (ingest): no OAuth to start — explain the companion flow.
    action = (
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        How to sync
      </Button>
    )
  }

  return (
    <div className="border-b border-line px-1 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="serif text-[21px] leading-none text-ink">{name}</div>

          <StatusMark status={status} label={isDemo ? 'Demo data' : undefined} className="mt-2.5" />

          {/* Demo honesty — a seeded provider is never dressed as a live link. */}
          {isDemo && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              Demo data — not a live connection
            </div>
          )}

          {/* Device / context · last sync (or start, mid-sync). */}
          {!isDemo && connectedish && syncedLabel && (
            <div className="tnum mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              {context && `${context} · `}
              {status === 'syncing' ? 'Started' : 'Last sync'} {syncedLabel}
            </div>
          )}
          {!isDemo && status === 'disconnected' && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              Not syncing — recommendations use intake only
            </div>
          )}
          {!isDemo && status === 'error' && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              Sync error — reconnect to resume
            </div>
          )}
          {!isDemo && partial && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-muted">
              Partial — some categories share no data
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {action}
          {/* Non-connected oauth still needs a way to reach demo/enable options. */}
          {oauth && !connectedish && (
            <TextButton chevron className="py-2 text-[11px]" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide options' : 'Options'}
            </TextButton>
          )}
        </div>
      </div>

      {/* Mid-sync progress bar, cobalt — the design's syncing affordance. */}
      {status === 'syncing' && <Meter value={50} target={100} over height={3} className="mt-3" />}

      {/* Expanded panel: accounts / ingest instructions + per-provider toggles. */}
      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {oauth ? (
            <div className="space-y-2">
              {accounts?.length > 0 ? (
                <div className="space-y-1.5">
                  {accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink">{a.label || 'Account'}</span>
                      <button
                        onClick={() => (confirmingId === a.id ? disconnect(a.id) : setConfirmingId(a.id))}
                        disabled={working}
                        className={`shrink-0 border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition disabled:opacity-40 ${
                          confirmingId === a.id
                            ? 'border-alert bg-alert/10 text-alert'
                            : 'border-alert/50 text-alert hover:bg-alert/5'
                        }`}
                      >
                        {confirmingId === a.id ? 'Tap again to disconnect' : 'Disconnect'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No linked accounts yet.</p>
              )}
              <a
                href={`/api/${id}/connect`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-cobalt hover:text-cobalt-ink"
              >
                {accounts?.length > 0 ? 'Add another account' : `Connect ${name}`}
                <span aria-hidden>›</span>
              </a>
              <p className="text-[11px] text-faint">
                Authorization happens on {name}. Tokens are stored on your own server and are never sent to the browser.
              </p>
            </div>
          ) : (
            // Apple Health: no cloud API — a native iOS/watch companion reads
            // HealthKit on-device and syncs it to your own server.
            <div className="space-y-3 text-sm">
              <div>
                <div className="eyebrow pb-1.5">What it reads &amp; why</div>
                <p className="text-muted">
                  The Apple Watch / iPhone companion reads your workouts &amp; timing, active energy, exercise, and
                  sleep — plus heart-rate / HRV as optional context — to explain and time your fueling. It never reads
                  clinical data and never changes a target on its own.
                </p>
              </div>

              {/* Per-category status — available vs. shares no data (never "denied"). */}
              {permissions?.requested?.length > 0 && (
                <div>
                  <div className="eyebrow pb-1.5">Categories</div>
                  <div className="grid grid-cols-1 gap-y-1">
                    {APPLE_READS.filter((c) => permissions.requested.includes(c) || (permissions.available || []).includes(c)).map((c) => {
                      const on = (permissions.available || []).includes(c)
                      return (
                        <div key={c} className="flex items-center justify-between gap-3">
                          <span className="text-[12px] text-ink">{APPLE_CATEGORY_LABEL[c] || c}</span>
                          <StatusMark status={on ? 'fresh' : 'unavailable'} label={on ? 'Shared' : 'No data'} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="eyebrow pb-1.5">Storage &amp; control</div>
                <p className="text-muted">
                  The companion reads these on your iPhone / Apple Watch and syncs them to your own server. Nothing is
                  sent to any third party. You choose which signals influence your plan, and you can delete synced data
                  at any time.
                </p>
              </div>

              <p className="text-[11px] leading-relaxed text-faint">
                Choose exactly what to share in the iOS <span className="font-semibold text-muted">Health app → Sharing → this app</span>.
                Categories you don’t share simply show “No data”; we can’t see them. Samples reach your server at{' '}
                <code className="bg-fill px-1">/api/apple/ingest</code>.
              </p>
            </div>
          )}

          {isDemo && (
            <p className="text-[11px] text-faint">
              Showing demo data so you can try the experience — connect above to use your own.
            </p>
          )}

          {/* Per-provider controls (preserve api.setProvider wiring). */}
          <div className="space-y-3 border-t border-line pt-3">
            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Use in my plan</span>
                <span className="block text-xs text-muted">Let this provider's signals influence recommendations</span>
              </span>
              <Toggle
                checked={enabled !== false}
                onChange={(v) => patch({ enabled: v })}
                label={`Use ${name} in plan`}
                id={`enable-${id}`}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Demo data when offline</span>
                <span className="block text-xs text-muted">Use seeded sample data when there's no live sync</span>
              </span>
              <Toggle
                checked={demo !== false}
                onChange={(v) => patch({ demo: v })}
                label={`Demo data for ${name}`}
                id={`demo-${id}`}
              />
            </label>
            {working && <p className="text-xs text-faint">Saving…</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Connections({ refreshKey, onChanged, user, onLogout }) {
  const [conn, setConn] = useState(null)
  const [ouraAccts, setOuraAccts] = useState([])
  const [garminAccts, setGarminAccts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [savingInf, setSavingInf] = useState(null)
  const [deleteNote, setDeleteNote] = useState(null)

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
    return () => {
      alive = false
    }
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
    <div>
      {/* Header */}
      <header className="pb-3.5">
        <h2 className="serif text-3xl leading-none text-ink">Connections</h2>
        <p className="mt-2.5 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
          Three read-only sources. You control which signals inform recommendations. Manage or delete synced data at any
          time.
        </p>
      </header>

      {/* Provider rows — hairline-separated */}
      <section className="border-t border-line">
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            accounts={acctsFor(p.id)}
            onRefetch={load}
            busy={busy}
            setBusy={setBusy}
          />
        ))}
      </section>

      {/* State reference — shape + word, never color alone (static legend) */}
      <section className="mt-6">
        <div className="eyebrow pb-2">State reference · shape + word, never color alone</div>
        <div>
          {STATES.map((s) => (
            <div key={s.status} className="flex items-center gap-2.5 border-t border-line py-1.5 last:border-b">
              <StatusMark status={s.status} label={s.label} className="w-[130px] shrink-0" />
              <span className="flex-1 text-[11.5px] leading-snug text-muted">{s.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Signals that affect recommendations */}
      <section className="mt-6">
        <div className="eyebrow pb-1.5">Signals that affect recommendations</div>
        <div>
          {SIGNALS.map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between gap-3 border-t border-line py-2.5"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-ink">{f.label}</span>
                <span className="mt-1 block text-[11px] leading-snug text-muted">{f.hint}</span>
              </span>
              <Toggle
                checked={influence[f.key] !== false}
                onChange={(v) => toggleInfluence(f.key, v)}
                label={`Allow ${f.label} to influence plan`}
                id={`inf-${f.key}`}
              />
            </label>
          ))}

          {/* The design's OFF example. There is no backend HRV signal, so this is
              a non-functional reference row, visibly disabled — never a live
              toggle claiming to control something that does not exist. */}
          <div className="flex items-center justify-between gap-3 border-y border-line py-2.5">
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-ink">Heart-rate &amp; HRV trend</span>
              <span className="mt-1 block text-[11px] leading-snug text-muted">Context only — shown for explanation, never changes a target</span>
            </span>
            <span className="pointer-events-none opacity-55" aria-disabled="true" title="Not used in any recommendation">
              <Toggle checked={false} onChange={() => {}} label="Stress and HRV — not used" />
            </span>
          </div>
        </div>
        {savingInf && <p className="mt-1.5 text-xs text-faint">Saving…</p>}
      </section>

      {/* Footer — history controls + privacy line */}
      <footer className="mt-6 flex items-start justify-between gap-4 border-t border-line pt-3">
        <p className="max-w-[220px] text-[11px] leading-relaxed text-muted">
          Not wired up yet — the button below does nothing. Once built, it will remove the Oura, Garmin, and Apple
          Health records synced to this app. Your data inside those apps is untouched, and OAuth tokens never leave
          your server.
        </p>
        <div className="text-right">
          {/* Destructive → Berry, per the design's failure/destructive color. */}
          <button
            onClick={() =>
              setDeleteNote(
                deleteNote ? null : 'History deletion is not wired to an endpoint yet — nothing was removed.',
              )
            }
            className="inline-flex min-h-11 items-center text-right text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.1em] text-alert hover:opacity-80"
          >
            Delete synced<br />history
          </button>
          {deleteNote && <p className="mt-1 max-w-[150px] text-[10px] leading-snug text-faint">{deleteNote}</p>}
        </div>
      </footer>

      {/* Account — the session, not a wearable; kept last and visually separate. */}
      {user && (
        <section className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <div className="eyebrow">Signed in</div>
            <div className="truncate text-sm text-ink">{user.email}</div>
          </div>
          <Button variant="subtle" onClick={onLogout} className="shrink-0">Log out</Button>
        </section>
      )}
    </div>
  )
}
