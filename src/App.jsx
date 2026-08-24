import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api } from './api/client.js'
import { dayBounds, MEALS, num, fmt, ymd } from './lib/nutrition.js'
import { enqueue, dequeue, getQueue, pendingEntry } from './lib/outbox.js'
import { Button, Sheet, ErrorNote, Spinner, StatusTag, inputCls } from './components/ui.jsx'
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
      <label className="block">
        <span className="eyebrow mb-1 block">Servings</span>
        <input type="number" step="0.25" min="0" value={servings} onChange={(e) => setServings(e.target.value)} className={inputCls} />
      </label>
      <div className="flex flex-wrap gap-2">
        {['', ...MEALS].map((m) => (
          <button
            key={m || 'none'}
            onClick={() => setMeal(m)}
            className={`rounded-md px-3 py-1 text-sm capitalize transition ${meal === m ? 'bg-cobalt text-oncobalt' : 'border border-line text-muted hover:bg-black/5'}`}
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
  const [tab, setTab] = useState('today')
  const [date, setDate] = useState(() => new Date())
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [todayData, setTodayData] = useState(null) // /api/today composite (plan + signals + recommendation)
  const [health, setHealth] = useState(null)
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
  useEffect(() => {
    let alive = true
    api.today(ymd(date)).then((r) => alive && setTodayData(r)).catch(() => alive && setTodayData(null))
    return () => { alive = false }
  }, [date, refreshKey])

  useEffect(() => { api.health().then(setHealth).catch(() => {}) }, [])

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

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      {/* Masthead */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <h1 className="serif text-lg font-semibold tracking-tight text-ink">Fuel</h1>
        {!online ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warn"><span aria-hidden>◐</span> Offline</span>
        ) : (
          health && <span className="text-[11px] text-faint">{health.backend === 'postgres' ? 'synced' : 'local'}</span>
        )}
      </header>

      {toast && (
        <div className={`mx-4 mt-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${toast.kind === 'success' ? 'border-good/30 bg-sage-soft text-good' : 'border-alert/30 bg-alert/5 text-alert'}`}>
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
          />
        )}
        {tab === 'log' && <LogView {...shared} onRelog={toConfirm} entries={dayEntries} recents={recents} loading={loadingEntries} online={online} pendingCount={pendingForDay.length} />}
        {tab === 'plan' && <Plan {...shared} onChanged={bump} />}
        {tab === 'insights' && <Insights refreshKey={refreshKey} />}
        {tab === 'connections' && <Connections refreshKey={refreshKey} onChanged={bump} toast={toast} />}
      </main>

      {/* Bottom nav — five editorial tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium tracking-tight ${tab === t.key ? 'text-cobalt' : 'text-muted hover:text-ink'}`}
          >
            <span aria-hidden className={`h-0.5 w-6 rounded-full ${tab === t.key ? 'bg-cobalt' : 'bg-transparent'}`} />
            {t.label}
          </button>
        ))}
      </nav>

      {/* Add-food sheet */}
      <Sheet open={!!flow} onClose={closeFlow} title={flowTitle} size={flow === 'confirm' || flow === 'search' ? 'lg' : 'md'}>
        {flow === 'menu' && (
          <div className="space-y-4">
            {recents.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Recent — tap to re-log</div>
                <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
                  {recents.map((f) => (
                    <button key={f.id} onClick={() => toConfirm(f)} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-left hover:bg-black/5">
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
                <button key={o.key} onClick={() => { setFlowError(''); setFlow(o.key) }} className="flex flex-col items-start gap-1 rounded-md border border-line p-4 text-left hover:border-cobalt hover:bg-cobalt-soft/40">
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
