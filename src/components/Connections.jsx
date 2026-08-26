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

// Human copy for a persisted sync_error code (server/providers.js's
// classifyOuraRefreshError) — the whole point of persisting a classified
// reason instead of a raw error message is that this file can translate it
// into something a non-technical reader acts on, rather than repeating
// whatever Oura's API happened to say.
function describeSyncError(code) {
  if (!code) return null
  if (code === 'refresh_token_expired') return 'Authorization expired or was revoked — reconnect to resume'
  if (code === 'oura_api_unreachable') return 'Oura API was unreachable on the last attempt'
  const apiErr = /^oura_api_error_(\d+)$/.exec(code)
  if (apiErr) return `Oura API error (${apiErr[1]}) on the last attempt`
  return 'The last sync attempt failed'
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
// Stale's 48h figure matches PROVIDER_STALE_HOURS in server/providers.js (the
// same threshold Apple's own status branch already used) — not a separate
// number invented for this legend. `demo`/`not-configured` were always
// reachable states but weren't listed here until this legend needed to tell
// them apart from `disconnected` — a provider can be not-configured on the
// server and STILL show demo data (two independent facts), which is why
// they're distinct rows rather than one.
const STATES = [
  { status: 'connected', desc: 'Solid mark · syncing on schedule' },
  { status: 'syncing', desc: 'Hatched · progress bar shown' },
  { status: 'stale', desc: 'Hollow · last successful sync over 48 h ago' },
  { status: 'demo', desc: 'Hollow dot · seeded sample data, never a live connection' },
  { status: 'not-configured', desc: 'Dashed · this server has no client id/secret for this provider at all' },
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

// Display-only label override for the row heading — client-side, render time
// only. `provider.name` itself is untouched, so every other use (API calls,
// oauth branches, the aria-labels on the per-provider toggles below) still
// reads the real name; only the heading below looks this id up first.
const DISPLAY_NAME = {
  apple: 'Apple Health · Apple Watch',
}

function ProviderRow({ provider, accounts, onRefetch, busy, setBusy }) {
  const {
    id, name, connect, categories = [], status, demo, enabled, last_synced_at, permissions, partial,
    last_attempted_sync, last_sync_counts, sync_error,
  } = provider
  const oauth = connect === 'oauth'
  const connectedish = status === 'connected' || status === 'stale' || status === 'syncing'
  const notConfigured = status === 'not-configured'
  // `demo` is its own field, independent of `status` — a not-configured
  // provider can still show demo data (two separate facts: can anyone on
  // this server ever connect vs. is this user currently seeing sample data),
  // so this reads the flag directly rather than assuming status === 'demo'.
  const isDemo = demo === true
  const syncedLabel = since(last_synced_at)
  const attemptedLabel = since(last_attempted_sync)
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

  // Apple Health has no OAuth account to connect — this is the only in-app
  // action for it, and until this existed there was no way to use the
  // integration end to end: POST /api/apple/token worked, but nothing in the
  // UI ever called it. The token is shown once (it has to be, so it can be
  // copied into the companion) and regenerating invalidates the previous one.
  const [appleToken, setAppleToken] = useState(null)
  const [copied, setCopied] = useState(false)
  const generateAppleToken = async () => {
    setBusy(id)
    setCopied(false)
    try {
      const { token } = await api.appleToken()
      setAppleToken(token)
    } finally {
      setBusy(null)
    }
  }
  const copyAppleToken = async () => {
    try {
      await navigator.clipboard.writeText(appleToken)
      setCopied(true)
    } catch {
      // Clipboard access can be denied/unavailable — the token is still
      // selectable text in the field below, so this never blocks pairing.
    }
  }

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
  } else if (oauth && notConfigured) {
    // A "Connect" link here would navigate to /api/{id}/connect, which
    // 501s — this server has no OAuth client id/secret for this provider at
    // all, so there is no functional action to offer any user, not just this
    // one. Showing Connect anyway (as the general oauth branch below does for
    // demo/disconnected) would look identical to a live, working option right
    // up until the click fails.
    action = (
      <span
        className="inline-flex items-center justify-center px-5 py-4 text-right text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.1em] text-faint"
        title={`${name} is not configured on this server — ask the operator to set it up`}
      >
        Not available here
      </span>
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
    <div className="border-b border-line px-1 py-2.5" data-provider={id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="serif text-[21px] leading-none text-ink">{DISPLAY_NAME[id] || name}</div>

          <StatusMark status={status} label={isDemo ? 'Demo data' : undefined} className="mt-2.5" />

          {/* Demo honesty — a seeded provider is never dressed as a live link. */}
          {isDemo && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              Demo data — not a live connection
            </div>
          )}
          {/* Demo can be showing for two independent reasons — this user
              never connected (nothing further to say) vs. nobody on this
              server ever could (worth saying, so a user doesn't go looking
              for a Connect button that would only 501). */}
          {isDemo && notConfigured && (
            <div className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              Not available on this server
            </div>
          )}

          {/* Device / context · last sync (or start, mid-sync). */}
          {!isDemo && connectedish && syncedLabel && (
            <div className="tnum mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              {context && `${context} · `}
              {status === 'syncing' ? 'Started' : 'Last sync'} {syncedLabel}
            </div>
          )}
          {!isDemo && notConfigured && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-faint">
              Not set up on this server — ask the operator to configure {name}
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
          {/* The persisted token-refresh/backfill failure reason (server/
              providers.js's classifyOuraRefreshError) — this is what makes a
              `stale` Oura row diagnosable from the Connections tab alone,
              instead of "it just says stale, who knows why." Independent of
              the `error` StatusMark above (dead — no status branch has ever
              emitted it): this renders off the real, persisted field for
              whichever status is actually showing (most often `stale`). */}
          {!isDemo && sync_error && (
            <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-alert">
              {describeSyncError(sync_error)}
              {attemptedLabel && ` — last attempt ${attemptedLabel}`}
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
              {notConfigured ? (
                // Same reasoning as the summary row's action above: a link to
                // /api/{id}/connect here would 501, so the panel says why
                // instead of offering a control that can't work.
                <p className="text-sm text-muted">
                  {name} has no client id/secret configured on this server, so no account here can connect it yet.
                </p>
              ) : (
                <a
                  href={`/api/${id}/connect`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-cobalt hover:text-cobalt-ink"
                >
                  {accounts?.length > 0 ? 'Add another account' : `Connect ${name}`}
                  <span aria-hidden>›</span>
                </a>
              )}
              <p className="text-[11px] text-faint">
                Authorization happens on {name}. Tokens are stored on your own server and are never sent to the browser.
              </p>
              {/* Most recent backfill/resync counts (Oura only, for now — see
                  server/index.js's trackedOuraBackfill) — "deduplicated" means
                  Oura returned it this run but it wasn't newly stored (no
                  score yet, or missing the id a workout needs), not a literal
                  already-seen check. */}
              {last_sync_counts && (
                <p className="tnum text-[11px] text-faint">
                  Last backfill: {last_sync_counts.fetched} fetched · {last_sync_counts.accepted} accepted ·{' '}
                  {last_sync_counts.deduplicated} not new
                  {attemptedLabel && ` (${attemptedLabel})`}
                </p>
              )}
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

              <div>
                <div className="eyebrow pb-1.5">Pair the companion</div>
                <p className="text-muted">
                  The iOS/watch companion has no login of its own — it authenticates with a pairing token generated
                  here. Generate one, then enter it in the companion's Settings.
                </p>
                {appleToken ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={appleToken}
                        onFocus={(e) => e.target.select()}
                        className="min-w-0 flex-1 truncate border border-line bg-fill px-2.5 py-2 font-mono text-[12px]"
                      />
                      <Button variant="outline" onClick={copyAppleToken}>{copied ? 'Copied' : 'Copy'}</Button>
                    </div>
                    <p className="text-[11px] text-faint">
                      Shown once — copy it now. Generating a new token immediately invalidates this one.
                    </p>
                  </div>
                ) : (
                  <Button variant="outline" className="mt-2" disabled={working} onClick={generateAppleToken}>
                    {working ? <Spinner /> : 'Generate pairing token'}
                  </Button>
                )}
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
  // Second-tap confirm, mirroring ProviderRow's own account-disconnect
  // pattern — the only other destructive one-tap action in this app.
  const [confirmingHistory, setConfirmingHistory] = useState(false)
  const [deletingHistory, setDeletingHistory] = useState(false)

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

  // Removes cached Oura/Garmin/Apple records (not the OAuth accounts — those
  // have their own per-account Disconnect above). Refetches afterward since
  // Garmin's today figure is served from the very rows this just cleared,
  // and notifies the rest of the app (Today/Plan) that signals may have
  // changed under them.
  const deleteHistory = async () => {
    setConfirmingHistory(false)
    setDeletingHistory(true)
    try {
      const { removed } = await api.clearSyncedHistory()
      setDeleteNote(removed > 0 ? `Removed ${removed} synced record${removed === 1 ? '' : 's'}.` : 'Nothing to remove — no synced data yet.')
      await load()
      onChanged?.()
    } catch (err) {
      setDeleteNote(err.message || 'Could not delete synced history.')
    } finally {
      setDeletingHistory(false)
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
          Removes the Oura, Garmin, and Apple Health records synced to this app. Your data inside those apps is
          untouched, and OAuth tokens never leave your server.
        </p>
        <div className="text-right">
          {/* Destructive → Berry, per the design's failure/destructive color.
              Second tap to confirm, same friction as ProviderRow's Disconnect
              above — never a live control that fires on the first tap AND
              never one that only pretends to. */}
          <button
            onClick={() => (confirmingHistory ? deleteHistory() : setConfirmingHistory(true))}
            disabled={deletingHistory}
            className="inline-flex min-h-11 items-center text-right text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.1em] text-alert hover:opacity-80 disabled:opacity-40"
          >
            {deletingHistory ? 'Deleting…' : confirmingHistory ? <>Tap again to<br />delete</> : <>Delete synced<br />history</>}
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
