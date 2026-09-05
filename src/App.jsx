import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api } from './api/client.js'
import { dayBounds, MEALS, num, fmt, ymd, restoreEntryPayload } from './lib/nutrition.js'
import { enqueue, dequeue, getQueue, pendingEntry } from './lib/outbox.js'
import { purgeAccountStorage, purgeLegacyPrivateCaches, purgeUnownedLegacyStorage, readAccountJson, writeAccountJson } from './lib/privateStorage.js'
import { Button, Sheet, ErrorNote, Spinner, StatusTag, ServingStepper } from './components/ui.jsx'
// Scanner pulls in the large zxing library — load only when opened.
const Scanner = lazy(() => import('./components/Scanner.jsx'))
import LabelScan from './components/LabelScan.jsx'
import ManualEntry from './components/ManualEntry.jsx'
import SearchFood from './components/SearchFood.jsx'
import FoodConfirm from './components/FoodConfirm.jsx'
import Today from './components/Today.jsx'
import LogView from './components/LogView.jsx'
import Plan from './components/CanonicalPlan.jsx'
import Insights from './components/Insights.jsx'
import Connections from './components/Connections.jsx'
import Auth, { LegalReconsent } from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import { applyAccentTheme } from './lib/accentTheme.js'

const ADD_OPTIONS = [
  { key: 'scan', label: 'Scan barcode', hint: 'Packaged groceries' },
  { key: 'label', label: 'Scan label', hint: 'Bulk / deli — photo the panel' },
  { key: 'search', label: 'Search foods', hint: 'Produce, no barcode' },
  { key: 'manual', label: 'Manual entry', hint: 'Type it in' },
]

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'log', label: 'Log' },
  { key: 'plan', label: 'Plan' },
  { key: 'insights', label: 'Insights' },
  { key: 'connections', label: 'Connections' },
]
// The tab bar abbreviates the last one, matching the design artboards.
const TAB_SHORT = { connections: 'Connect' }

// Editor for an existing log entry (servings + meal + delete).
function EntryEditor({ entry, onSave, onDelete, saving }) {
  const [servings, setServings] = useState(entry.servings_consumed)
  const [meal, setMeal] = useState(entry.meal || '')
  return (
    <div className="space-y-4">
      <div>
        <div className="serif text-lg text-ink">{entry.food?.name || 'Food'}</div>
        <div className="text-sm text-muted">
          {entry.food?.calories != null ? `${fmt(entry.food.calories, 0)} kcal / serving` : ''}
        </div>
      </div>
      <div>
        <span className="eyebrow mb-1 block">Servings</span>
        {/* Same bordered −/value/+ stepper as FoodConfirm — editing servings on an
            already-logged entry is the same conceptual task, so it looks and
            behaves the same. */}
        <ServingStepper value={servings} onChange={setServings} />
      </div>
      <div className="flex flex-wrap gap-2">
        {['', ...MEALS].map((m) => (
          <button
            key={m || 'none'}
            onClick={() => setMeal(m)}
            className={`min-h-11 px-3 text-xs font-semibold uppercase tracking-[0.08em] transition ${meal === m ? 'bg-cobalt text-oncobalt' : 'border border-line-strong text-muted hover:bg-fill'}`}
          >
            {m || 'untagged'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="danger" onClick={() => onDelete(entry.id)} disabled={saving}>Delete</Button>
        <Button onClick={() => onSave(entry.id, { servings_consumed: num(servings) || 1, meal: meal || null })} disabled={saving} className="flex-1">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  // Auth gate: 'loading' avoids a flash of the login screen while /auth/me
  // resolves, 'out' shows Auth, 'consent' holds an existing account at the
  // current-version legal acknowledgement, and 'in' shows the app. Everything below this
  // point already assumes a session exists — the rest of the app's fetches
  // rely on the cookie, not on `user`, so they don't need to be re-wired.
  const [authState, setAuthState] = useState('loading')
  const [user, setUser] = useState(null)
  const [accent, setAccent] = useState('cobalt')
  // null = not yet checked, true = canonical profile ready, false = first-run
  // gate. AFP is the only profile that can unlock daily targets.
  const [planReady, setPlanReady] = useState(null)
  const [planCheckKey, setPlanCheckKey] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // This MUST happen before /auth/me. An older active service worker could
      // otherwise satisfy that first request from the browser-global api-cache
      // and briefly identify the previous account to the new client.
      purgeUnownedLegacyStorage()
      await purgeLegacyPrivateCaches()
      return api.me()
    })()
      .then(({ user }) => { if (alive) { setUser(user); setAuthState(user ? (user.legalAcceptanceRequired ? 'consent' : 'in') : 'out') } })
      .catch(() => { if (alive) setAuthState('out') })
    return () => { alive = false }
  }, [])

  // Fires on every transition into 'in' — both the initial /auth/me resolving
  // to a signed-in user, and onAuthed's signup/login below.
  useEffect(() => {
    if (authState !== 'in') return
    let alive = true
    api.getAfpProfile()
      .then((r) => { if (alive) setPlanReady(r?.ready === true) })
      .catch(() => { if (alive) setPlanReady('error') })
    return () => { alive = false }
  }, [authState, planCheckKey])

  useEffect(() => { if (authState !== 'in') return; let alive = true; api.appearance().then(({ accent: saved }) => { if (alive) setAccent(applyAccentTheme(saved)) }).catch(() => { if (alive) setAccent(applyAccentTheme('cobalt')) }); return () => { alive = false } }, [authState, user?.id])

  const clearSignedInState = async ({ deleteLocal = false } = {}) => {
    if (deleteLocal && user?.id) purgeAccountStorage(user.id)
    await purgeLegacyPrivateCaches()
    setUser(null)
    setAuthState('out')
    setPlanReady(null)
    setAccent(applyAccentTheme('cobalt'))
    setEntries([])
    setTodayData(null)
    setPending([])
    setRecents([])
  }

  const logout = async () => {
    await api.logout().catch(() => {})
    await clearSignedInState()
  }

  const accountDeleted = async () => {
    await clearSignedInState({ deleteLocal: true })
  }

  const [tab, setTab] = useState('today')
  const [date, setDate] = useState(() => new Date())
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [todayData, setTodayData] = useState(null) // /api/today composite (plan + signals + recommendation)
  // Distinct from `todayData == null`, which is ALSO true forever after a
  // failed fetch (the catch below sets it to null too) — Today.jsx used that
  // alone as its loading flag, so a genuine fetch failure rendered as a
  // permanent loading skeleton instead of an honest error state. This is the
  // one bit that actually says "the request finished and failed," independent
  // of whether data happens to be null for an unrelated (still-loading) reason.
  const [todayError, setTodayError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState(null)

  // Add-food flow
  const [flow, setFlow] = useState(null)
  const [draftFood, setDraftFood] = useState(null)
  const [flowError, setFlowError] = useState('')
  const [logging, setLogging] = useState(false)
  const [recents, setRecents] = useState([])

  // Offline write-queue
  const [pending, setPending] = useState([])
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [syncing, setSyncing] = useState(false)

  // Entry editing
  const [editingEntry, setEditingEntry] = useState(null)
  const [savingEntry, setSavingEntry] = useState(false)

  const loadEntries = useCallback(async (forDate) => {
    if (authState !== 'in' || !user?.id) {
      setEntries([])
      setLoadingEntries(false)
      return
    }
    setLoadingEntries(true)
    try {
      const { from, to } = dayBounds(forDate)
      const { entries } = await api.listEntries({ from, to })
      setEntries(entries)
    } catch {
      setEntries([])
    } finally {
      setLoadingEntries(false)
    }
  }, [authState, user?.id])

  useEffect(() => { loadEntries(date) }, [date, refreshKey, loadEntries])

  // Composite Today: plan (baseline/adjusted + rationale), signals, recommendation.
  // Send this browser's own day bounds so the composite's intake covers the
  // same entries the log list shows (the server's midnight may be in another
  // timezone).
  useEffect(() => {
    if (authState !== 'in' || !user?.id) {
      setTodayData(null)
      setTodayError(false)
      return
    }
    let alive = true
    setTodayError(false) // a fresh attempt for this date/refresh is starting — never show the PREVIOUS attempt's error while this one is still in flight
    api.today(ymd(date), dayBounds(date))
      .then((r) => { if (alive) { setTodayData(r); setTodayError(false) } })
      .catch(() => { if (alive) { setTodayData(null); setTodayError(true) } })
    return () => { alive = false }
  }, [authState, user?.id, date, refreshKey])

  // Load only this account's queued writes after authentication resolves.
  useEffect(() => {
    setPending(authState === 'in' && user?.id ? getQueue(user.id) : [])
  }, [authState, user?.id])

  // Keep recents populated for the Log tab and the add-food menu without needing
  // to open the sheet first; refresh after each log so re-log stays current.
  useEffect(() => {
    if (authState !== 'in' || !user?.id) {
      setRecents([])
      return
    }
    let alive = true
    api.recentFoods(12)
      .then((r) => {
        if (!alive) return
        const foods = r.foods || []
        setRecents(foods)
        writeAccountJson('recents', user.id, foods)
      })
      .catch(() => {
        if (!alive) return
        try {
          const cached = readAccountJson('recents', user.id, [])
          setRecents(Array.isArray(cached) ? cached : [])
        } catch { setRecents([]) }
      })
    return () => { alive = false }
  }, [authState, user?.id, refreshKey])

  // OAuth return handoff (Oura/Garmin bounce back to /?provider=connected|error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = ['oura', 'garmin'].find((p) => ['connected', 'error'].includes(params.get(p)))
    if (!provider) return
    const status = params.get(provider)
    const name = provider === 'garmin' ? 'Garmin' : 'Oura'
    setToast(status === 'connected' ? { kind: 'success', text: `${name} connected` } : { kind: 'error', text: `${name} connection failed` })
    window.history.replaceState({}, '', window.location.pathname)
    setTab('connections')
    setRefreshKey((k) => k + 1)
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [])

  const flushOutbox = useCallback(async () => {
    const userId = user?.id
    if (authState !== 'in' || !userId) return []
    const q = getQueue(userId)
    if (!q.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return q
    setSyncing(true)
    let changed = false
    for (const item of q) {
      // Defense in depth in case localStorage is manually edited: a queue item
      // must name the same owner as the account-scoped key that contained it.
      if (String(item.ownerUserId) !== String(userId)) break
      try {
        await api.addEntry(item.payload)
        dequeue(userId, item.clientId)
        changed = true
      } catch {
        // Network, validation, authentication and permission failures all keep
        // the item. In particular, 401/403 pauses for reauthentication instead
        // of permanently deleting a person's offline log.
        break
      }
    }
    const remaining = getQueue(userId)
    setPending(remaining)
    setSyncing(false)
    if (changed) setRefreshKey((k) => k + 1)
    return remaining
  }, [authState, user?.id])

  useEffect(() => {
    if (authState !== 'in' || !user?.id) return undefined
    flushOutbox()
    const goOnline = () => { setOnline(true); flushOutbox() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [authState, user?.id, flushOutbox])

  // ---- add-food flow -----------------------------------------------------
  const openAdd = (mode = 'menu') => {
    setFlowError(''); setDraftFood(null); setFlow(mode)
    if (!user?.id) return
    api.recentFoods(12)
      .then((r) => {
        const foods = r.foods || []
        setRecents(foods)
        writeAccountJson('recents', user.id, foods)
      })
      .catch(() => {
        try {
          const cached = readAccountJson('recents', user.id, [])
          setRecents(Array.isArray(cached) ? cached : [])
        } catch { setRecents([]) }
      })
  }
  const closeFlow = () => { setFlow(null); setDraftFood(null); setFlowError('') }

  const onBarcode = async (code) => {
    setFlow('lookup'); setFlowError('')
    try {
      const { food } = await api.lookupBarcode(code)
      setDraftFood({ ...food, search_method: 'barcode_scan' }); setFlow('confirm')
    } catch (err) {
      if (err.status === 404) {
        setDraftFood({ barcode: code, name: '', serving_unit: 'g', source: 'manual', search_method: 'barcode_scan' })
        setFlowError(`Barcode ${code} wasn't found. Add its details below.`)
        setFlow('confirm')
      } else {
        setFlowError(err.message || 'Lookup failed.'); setFlow('scan')
      }
    }
  }

  // How the user reached this food, carried alongside it so FoodConfirm can
  // SAY it instead of guessing from whether a barcode happens to be present —
  // a typed search result read "Scanned · USDA" in production because most
  // branded rows carry a GTIN/UPC (docs/food-search-baseline.md RC-6). Each
  // call site names its own method; `method` is optional so any future caller
  // that forgets simply claims nothing rather than claiming a scan.
  const toConfirm = (food, method) => {
    setDraftFood(method ? { ...food, search_method: method } : food)
    setFlowError(''); setFlow('confirm')
  }

  const onLog = async (payload) => {
    setLogging(true)
    try {
      await api.addEntry(payload)
      closeFlow(); setDate(new Date()); setRefreshKey((k) => k + 1)
    } catch (err) {
      const networkFailure = !err.status || (typeof navigator !== 'undefined' && !navigator.onLine)
      if (networkFailure) {
        enqueue(user.id, {
          clientId: crypto.randomUUID(),
          ownerUserId: user.id,
          payload: { ...payload, logged_at: payload.logged_at || new Date().toISOString() },
          food: payload.food || draftFood,
        })
        setPending(getQueue(user.id)); closeFlow(); setDate(new Date())
      } else {
        setFlowError(err.message || 'Could not log the entry.')
      }
    } finally {
      setLogging(false)
    }
  }

  const deleteEntry = async (id) => {
    if (pending.some((i) => i.clientId === id)) {
      dequeue(user.id, id); setPending(getQueue(user.id)); setEditingEntry(null); return
    }
    // Snapshot before deleting so a mistaken tap (there's no confirm dialog
    // on this action) can be undone — re-logs the same food/servings/meal/
    // time rather than restoring the exact deleted row (the old row's id
    // and any edit history don't come back, only its data does).
    const restore = entries.find((e) => e.id === id)
    setSavingEntry(true)
    try {
      await api.deleteEntry(id); setEditingEntry(null); setRefreshKey((k) => k + 1)
    } finally { setSavingEntry(false) }
    if (!restore) return
    setToast({
      kind: 'success',
      text: `Deleted ${restore.food?.name || 'entry'}`,
      onUndo: async () => {
        // restoreEntryPayload (lib/nutrition.js) handles the food_id/
        // servings_consumed string-vs-number coercion — same fix
        // FoodConfirm's own food_id shortcut needed, unit-tested there.
        await api.addEntry(restoreEntryPayload(restore))
        setRefreshKey((k) => k + 1)
        setToast(null)
      },
    })
    setTimeout(() => setToast((t) => (t?.onUndo ? null : t)), 6000)
  }
  const saveEntry = async (id, patch) => {
    setSavingEntry(true)
    try {
      await api.updateEntry(id, patch); setEditingEntry(null); setRefreshKey((k) => k + 1)
    } finally { setSavingEntry(false) }
  }

  const bump = () => setRefreshKey((k) => k + 1)
  const shiftDay = (delta) => setDate((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n })

  // Merge queued-but-unsynced logs into the day they belong to.
  const { from: dayFrom, to: dayTo } = dayBounds(date)
  const pendingForDay = pending.filter((i) => i.payload.logged_at >= dayFrom && i.payload.logged_at < dayTo).map(pendingEntry)
  const dayEntries = [...entries, ...pendingForDay].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1))

  const flowTitle = { menu: 'Add food', scan: 'Scan barcode', label: 'Scan label', search: 'Search foods', manual: 'Manual entry', lookup: 'Looking up…', confirm: 'Confirm & log' }[flow]

  const shared = { date, refreshKey, openAdd, onEditEntry: setEditingEntry, onDeleteEntry: deleteEntry }

  // Below this point every fetch relies on the session cookie. While signed
  // out, the effects above already fired once at mount and 401'd (entries,
  // today, recents all sit at their empty-state values) — that's fine while
  // Auth is on screen, but a fresh sign-in needs those effects to refire
  // rather than leave the just-unlocked app showing yesterday's empty fetch.
  if (authState === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    )
  }
  if (authState === 'out') {
    return <Auth onAuthed={async (u) => { purgeUnownedLegacyStorage(); await purgeLegacyPrivateCaches(); setUser(u); setAuthState(u.legalAcceptanceRequired ? 'consent' : 'in'); bump() }} />
  }
  if (authState === 'consent') {
    return <LegalReconsent user={user} onAccepted={(acceptedUser) => { setUser(acceptedUser); setAuthState('in'); bump() }} onLogout={logout} />
  }

  // Signed in, but plan readiness hasn't resolved yet — hold here rather than
  // flash the tab shell (which would render Today's fabricated-default
  // baseline for a split second) before the gate below can apply.
  if (planReady === null) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    )
  }

  if (planReady === 'error') {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-10">
        <ErrorNote>Body Current could not verify your daily plan setup. Your account is still signed in, but targets are hidden until this check succeeds.</ErrorNote>
        <Button variant="outline" className="mt-4" onClick={() => { setPlanReady(null); setPlanCheckKey((key) => key + 1) }}>Try again</Button>
      </div>
    )
  }

  if (planReady === false) {
    return <Onboarding onDone={() => { setPlanReady(true); bump() }} />
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col pt-[3.25rem]">
      {/* Top nav — rail bar, active tab drawn with a cobalt bottom rule (moved
          from the page bottom 25 Aug 2026, owner: it read as page furniture
          down there and was easy to miss; the top keeps it the first thing
          seen, same rail treatment). `body` (index.css) already applies
          `padding-top: env(safe-area-inset-top)` globally, which pushes this
          whole in-flow container down by the inset already — nav itself is
          `fixed`, so it escapes that padding and has to re-apply the SAME
          inset itself (below) to sit flush with the real top edge, exactly
          like the old bottom nav did with safe-area-inset-bottom. Naively
          adding `env(safe-area-inset-top)` to THIS container's pt as well
          double-counted the inset — measured directly (real Chromium, CDP
          Emulation.setSafeAreaInsetsOverride, inset=59px): body pushed the
          container to y=59, and a naive `calc(3.375rem+env(...))` pt pushed
          content to y=172, 61px past the nav's real bottom edge at y=111.
          3.25rem (52px, the nav's own measured height at ZERO inset) is the
          correct flat value — body's padding and the nav's own inset growth
          already cancel out at every inset value, confirmed across
          320/375/430px widths and 0/47/59px insets: content lands exactly
          at the nav's bottom edge every time. 5 equal flex-1 columns at
          320px = 64px each with zero gap between
          them (a deliberate seamless rail, not a bug); tracking-[0.05em] on
          the labels was chosen so the longest ones ("Insights", "Connect")
          clear the next column's text at that width — a wider
          tracking-[0.09em] measured only ~1.6-2px of margin each side. */}
      <nav className="fixed inset-x-0 top-0 z-20 mx-auto flex max-w-xl border-b border-line-strong bg-rail pt-[env(safe-area-inset-top)]">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex-1 py-[18px] text-center text-[10px] font-semibold uppercase tracking-[0.05em] ${active ? 'text-cobalt' : 'text-muted hover:text-ink'}`}
            >
              {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-cobalt" />}
              {TAB_SHORT[t.key] || t.label}
            </button>
          )
        })}
      </nav>

      {/* Offline strip — the only OTHER global chrome; each screen owns its own title. */}
      {!online && (
        <div className="flex items-center justify-center gap-2 border-b border-line bg-rail px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span aria-hidden className="h-2 w-2 bg-ink" /> Offline — logs queue and sync when you reconnect
        </div>
      )}

      {toast && (
        <div className={`mx-4 mt-3 flex items-center justify-between gap-3 border px-3 py-2 text-sm ${toast.kind === 'success' ? 'border-cobalt/40 bg-cobalt-soft text-cobalt' : 'border-alert/40 bg-alert/5 text-alert'}`}>
          <span>{toast.text}</span>
          <span className="flex shrink-0 items-center gap-3">
            {toast.onUndo && (
              <button onClick={toast.onUndo} className="font-semibold underline underline-offset-2 hover:no-underline">Undo</button>
            )}
            <button onClick={() => setToast(null)} className="px-1.5 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
          </span>
        </div>
      )}

      {/* No more bottom clearance math here — the nav moved to the top (see
          above), so nothing fixed sits below the content anymore. Just a
          flat, ordinary bottom pad plus the device's own home-indicator
          inset so the last row of content never sits flush against it. */}
      <main className="flex-1 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        {tab === 'today' && (
          <Today
            {...shared}
            data={todayData}
            dataError={todayError}
            entries={dayEntries}
            loading={loadingEntries}
            online={online}
            syncing={syncing}
            pendingCount={pendingForDay.length}
            onSync={flushOutbox}
            onPrevDay={() => shiftDay(-1)}
            onNextDay={() => shiftDay(1)}
            onToday={() => setDate(new Date())}
            onViewLog={() => setTab('log')}
            onGoToPlan={() => setTab('plan')}
            onGoToConnections={() => setTab('connections')}
            onChanged={bump}
          />
        )}
        {tab === 'log' && <LogView {...shared} onRelog={toConfirm} entries={dayEntries} recents={recents} loading={loadingEntries} online={online} pendingCount={pendingForDay.length} />}
        {tab === 'plan' && <Plan {...shared} onChanged={bump} />}
        {tab === 'insights' && <Insights refreshKey={refreshKey} />}
        {tab === 'connections' && <Connections key={`connections-${user?.id || 'none'}`} refreshKey={refreshKey} onChanged={bump} toast={toast} user={user} onLogout={logout} onAccountDeleted={accountDeleted} accent={accent} sessionKey={user?.id} onAccentChange={(next) => setAccent(applyAccentTheme(next))} />}
      </main>

      {/* Add-food sheet. The confirm step owns its own header (the design shows
          the product name as the title), so no sheet title there. */}
      <Sheet open={!!flow} onClose={closeFlow} title={flow === 'confirm' ? undefined : flowTitle} size={flow === 'confirm' || flow === 'search' ? 'lg' : 'md'}>
        {flow === 'menu' && (
          <div className="space-y-4">
            {recents.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Recent — tap to re-log</div>
                <div className="flex max-h-52 flex-col overflow-y-auto border-b border-line">
                  {recents.map((f) => (
                    <button key={f.id} onClick={() => toConfirm(f, 'recent')} className="flex items-center justify-between gap-3 border-t border-line px-1 py-2.5 text-left hover:bg-fill">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{f.name}</div>
                        <div className="truncate text-xs text-muted">{f.brand ? `${f.brand} · ` : ''}{f.serving_size ? `${fmt(f.serving_size, 0)} ${f.serving_unit}` : f.serving_unit}</div>
                      </div>
                      <div className="shrink-0 text-right"><div className="numeral text-base text-ink">{fmt(f.calories, 0)}</div><div className="eyebrow">kcal</div></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {ADD_OPTIONS.map((o) => (
                <button key={o.key} onClick={() => { setFlowError(''); setFlow(o.key) }} className="flex flex-col items-start gap-1 border-[1.5px] border-ink p-4 text-left transition hover:bg-fill">
                  <span className="font-semibold text-ink">{o.label}</span>
                  <span className="text-xs text-muted">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {flow === 'scan' && (
          <div className="space-y-3">
            <ErrorNote>{flowError}</ErrorNote>
            <Suspense fallback={<Spinner label="Loading scanner…" />}><Scanner onDetected={onBarcode} /></Suspense>
          </div>
        )}
        {flow === 'lookup' && <Spinner label="Looking up product…" />}
        {flow === 'label' && <LabelScan onParsed={(f) => toConfirm(f, 'label_ocr')} />}
        {flow === 'search' && <SearchFood onPick={toConfirm} />}
        {flow === 'manual' && <ManualEntry onSubmit={(f) => toConfirm(f, 'manual')} />}
        {flow === 'confirm' && draftFood && (
          <div className="space-y-3">
            <ErrorNote>{flowError}</ErrorNote>
            <FoodConfirm food={draftFood} onLog={onLog} onBack={() => openAdd('menu')} logging={logging} />
          </div>
        )}
      </Sheet>

      {/* Entry editor */}
      <Sheet open={!!editingEntry} onClose={() => setEditingEntry(null)} title="Edit entry">
        {editingEntry && <EntryEditor entry={editingEntry} onSave={saveEntry} onDelete={deleteEntry} saving={savingEntry} />}
      </Sheet>
    </div>
  )
}
