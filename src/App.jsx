import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api } from './api/client.js'
import { dayBounds, MEALS, num, fmt, ymd } from './lib/nutrition.js'
import { enqueue, dequeue, getQueue, pendingEntry } from './lib/outbox.js'
import { Button, Sheet, ErrorNote, Spinner, StatusTag, ServingStepper } from './components/ui.jsx'
// Scanner pulls in the large zxing library — load only when opened.
const Scanner = lazy(() => import('./components/Scanner.jsx'))
import LabelScan from './components/LabelScan.jsx'
import ManualEntry from './components/ManualEntry.jsx'
import SearchFood from './components/SearchFood.jsx'
import FoodConfirm from './components/FoodConfirm.jsx'
import Today from './components/Today.jsx'
import LogView from './components/LogView.jsx'
import Plan from './components/Plan.jsx'
import Insights from './components/Insights.jsx'
import Connections from './components/Connections.jsx'
import Auth from './components/Auth.jsx'

const RECENTS_KEY = 'nt_recents_v1'

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
  // resolves, 'out' shows Auth, 'in' shows the app. Everything below this
  // point already assumes a session exists — the rest of the app's fetches
  // rely on the cookie, not on `user`, so they don't need to be re-wired.
  const [authState, setAuthState] = useState('loading')
  const [user, setUser] = useState(null)

  useEffect(() => {
    let alive = true
    api.me()
      .then(({ user }) => { if (alive) { setUser(user); setAuthState(user ? 'in' : 'out') } })
      .catch(() => { if (alive) setAuthState('out') })
    return () => { alive = false }
  }, [])

  const logout = async () => {
    await api.logout().catch(() => {})
    setUser(null)
    setAuthState('out')
  }

  const [tab, setTab] = useState('today')
  const [date, setDate] = useState(() => new Date())
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [todayData, setTodayData] = useState(null) // /api/today composite (plan + signals + recommendation)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState(null)

  // Add-food flow
  const [flow, setFlow] = useState(null)
  const [draftFood, setDraftFood] = useState(null)
  const [flowError, setFlowError] = useState('')
  const [logging, setLogging] = useState(false)
  const [recents, setRecents] = useState([])

  // Offline write-queue
  const [pending, setPending] = useState(() => getQueue())
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [syncing, setSyncing] = useState(false)

  // Entry editing
  const [editingEntry, setEditingEntry] = useState(null)
  const [savingEntry, setSavingEntry] = useState(false)

  const loadEntries = useCallback(async (forDate) => {
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
  }, [])

  useEffect(() => { loadEntries(date) }, [date, refreshKey, loadEntries])

  // Composite Today: plan (baseline/adjusted + rationale), signals, recommendation.
  // Send this browser's own day bounds so the composite's intake covers the
  // same entries the log list shows (the server's midnight may be in another
  // timezone).
  useEffect(() => {
    let alive = true
    api.today(ymd(date), dayBounds(date)).then((r) => alive && setTodayData(r)).catch(() => alive && setTodayData(null))
    return () => { alive = false }
  }, [date, refreshKey])

  // Keep recents populated for the Log tab and the add-food menu without needing
  // to open the sheet first; refresh after each log so re-log stays current.
  useEffect(() => {
    let alive = true
    api.recentFoods(12)
      .then((r) => {
        if (!alive) return
        const foods = r.foods || []
        setRecents(foods)
        try { localStorage.setItem(RECENTS_KEY, JSON.stringify(foods)) } catch {}
      })
      .catch(() => {
        if (!alive) return
        try {
          const cached = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
          setRecents(Array.isArray(cached) ? cached : [])
        } catch { setRecents([]) }
      })
    return () => { alive = false }
  }, [refreshKey])

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
    const q = getQueue()
    if (!q.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    setSyncing(true)
    let changed = false
    for (const item of q) {
      try {
        await api.addEntry(item.payload)
        dequeue(item.clientId)
        changed = true
      } catch (err) {
        if (err.status) { dequeue(item.clientId); changed = true } else break
      }
    }
    setPending(getQueue())
    setSyncing(false)
    if (changed) setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    flushOutbox()
    const goOnline = () => { setOnline(true); flushOutbox() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [flushOutbox])

  // ---- add-food flow -----------------------------------------------------
  const openAdd = (mode = 'menu') => {
    setFlowError(''); setDraftFood(null); setFlow(mode)
    api.recentFoods(12)
      .then((r) => {
        const foods = r.foods || []
        setRecents(foods)
        try { localStorage.setItem(RECENTS_KEY, JSON.stringify(foods)) } catch {}
      })
      .catch(() => {
        try {
          const cached = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
          setRecents(Array.isArray(cached) ? cached : [])
        } catch { setRecents([]) }
      })
  }
  const closeFlow = () => { setFlow(null); setDraftFood(null); setFlowError('') }

  const onBarcode = async (code) => {
    setFlow('lookup'); setFlowError('')
    try {
      const { food } = await api.lookupBarcode(code)
      setDraftFood(food); setFlow('confirm')
    } catch (err) {
      if (err.status === 404) {
        setDraftFood({ barcode: code, name: '', serving_unit: 'g', source: 'manual' })
        setFlowError(`Barcode ${code} wasn't found. Add its details below.`)
        setFlow('confirm')
      } else {
        setFlowError(err.message || 'Lookup failed.'); setFlow('scan')
      }
    }
  }

  const toConfirm = (food) => { setDraftFood(food); setFlowError(''); setFlow('confirm') }

  const onLog = async (payload) => {
    setLogging(true)
    try {
      await api.addEntry(payload)
      closeFlow(); setDate(new Date()); setRefreshKey((k) => k + 1)
    } catch (err) {
      const networkFailure = !err.status || (typeof navigator !== 'undefined' && !navigator.onLine)
      if (networkFailure) {
        enqueue({
          clientId: crypto.randomUUID(),
          payload: { ...payload, logged_at: payload.logged_at || new Date().toISOString() },
          food: payload.food || draftFood,
        })
        setPending(getQueue()); closeFlow(); setDate(new Date())
      } else {
        setFlowError(err.message || 'Could not log the entry.')
      }
    } finally {
      setLogging(false)
    }
  }

  const deleteEntry = async (id) => {
    if (pending.some((i) => i.clientId === id)) {
      dequeue(id); setPending(getQueue()); setEditingEntry(null); return
    }
    setSavingEntry(true)
    try {
      await api.deleteEntry(id); setEditingEntry(null); setRefreshKey((k) => k + 1)
    } finally { setSavingEntry(false) }
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
    return <Auth onAuthed={(u) => { setUser(u); setAuthState('in'); bump() }} />
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      {/* Offline strip — the only global chrome; each screen owns its own title. */}
      {!online && (
        <div className="flex items-center justify-center gap-2 border-b border-line bg-rail px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span aria-hidden className="h-2 w-2 bg-ink" /> Offline — logs queue and sync when you reconnect
        </div>
      )}

      {toast && (
        <div className={`mx-4 mt-3 flex items-center justify-between gap-3 border px-3 py-2 text-sm ${toast.kind === 'success' ? 'border-cobalt/40 bg-cobalt-soft text-cobalt' : 'border-alert/40 bg-alert/5 text-alert'}`}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="px-1.5 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      )}

      <main className="flex-1 px-4 pb-24 pt-4">
        {tab === 'today' && (
          <Today
            {...shared}
            data={todayData}
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
          />
        )}
        {tab === 'log' && <LogView {...shared} onRelog={toConfirm} entries={dayEntries} recents={recents} loading={loadingEntries} online={online} pendingCount={pendingForDay.length} />}
        {tab === 'plan' && <Plan {...shared} onChanged={bump} />}
        {tab === 'insights' && <Insights refreshKey={refreshKey} />}
        {tab === 'connections' && <Connections refreshKey={refreshKey} onChanged={bump} toast={toast} user={user} onLogout={logout} />}
      </main>

      {/* Bottom nav — rail bar, active tab drawn with a cobalt top rule */}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl border-t border-line-strong bg-rail pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex-1 py-[18px] text-center text-[10px] font-semibold uppercase tracking-[0.09em] ${active ? 'text-cobalt' : 'text-muted hover:text-ink'}`}
            >
              {active && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-cobalt" />}
              {TAB_SHORT[t.key] || t.label}
            </button>
          )
        })}
      </nav>

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
                    <button key={f.id} onClick={() => toConfirm(f)} className="flex items-center justify-between gap-3 border-t border-line px-1 py-2.5 text-left hover:bg-fill">
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
        {flow === 'label' && <LabelScan onParsed={toConfirm} />}
        {flow === 'search' && <SearchFood onPick={toConfirm} />}
        {flow === 'manual' && <ManualEntry onSubmit={toConfirm} />}
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
