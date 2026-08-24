import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api } from './api/client.js'
import { dayBounds, MEALS, num, fmt, ymd } from './lib/nutrition.js'
import { enqueue, dequeue, getQueue, pendingEntry } from './lib/outbox.js'
import { Button, Modal, ErrorNote, Spinner, inputCls } from './components/ui.jsx'
// The barcode scanner pulls in the large zxing library — load it only when the
// user actually opens the scanner, keeping it out of the initial bundle.
const Scanner = lazy(() => import('./components/Scanner.jsx'))
import LabelScan from './components/LabelScan.jsx'
import ManualEntry from './components/ManualEntry.jsx'
import SearchFood from './components/SearchFood.jsx'
import FoodConfirm from './components/FoodConfirm.jsx'
import TodayView from './components/TodayView.jsx'
import HistoryView from './components/HistoryView.jsx'
import TargetsEditor from './components/TargetsEditor.jsx'
import OuraCard from './components/OuraCard.jsx'
import GarminCard from './components/GarminCard.jsx'

const RECENTS_KEY = 'nt_recents_v1'

const ADD_OPTIONS = [
  { key: 'scan', label: 'Scan barcode', icon: '📷', hint: 'Packaged groceries' },
  { key: 'label', label: 'Scan label', icon: '🏷️', hint: 'Bulk / deli — photo the panel' },
  { key: 'search', label: 'Search foods', icon: '🔎', hint: 'Produce, no barcode' },
  { key: 'manual', label: 'Manual entry', icon: '✏️', hint: 'Type it in' },
]

// Small editor for an existing log entry (servings + meal + delete).
function EntryEditor({ entry, onSave, onDelete, saving }) {
  const [servings, setServings] = useState(entry.servings_consumed)
  const [meal, setMeal] = useState(entry.meal || '')
  return (
    <div className="space-y-4">
      <div>
        <div className="font-bold text-slate-50">{entry.food?.name || 'Food'}</div>
        <div className="text-sm text-slate-400">
          {entry.food?.calories != null ? `${fmt(entry.food.calories, 0)} kcal / serving` : ''}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Servings</span>
        <input type="number" step="0.25" min="0" value={servings} onChange={(e) => setServings(e.target.value)} className={inputCls} />
      </label>
      <div className="flex flex-wrap gap-2">
        {['', ...MEALS].map((m) => (
          <button
            key={m || 'none'}
            onClick={() => setMeal(m)}
            className={`rounded-full px-3 py-1 text-sm capitalize transition ${meal === m ? 'bg-emerald-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
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
  const [targets, setTargets] = useState(null)
  const [health, setHealth] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [energy, setEnergy] = useState(null) // unified energy summary for the selected day (null = none/off)
  const [toast, setToast] = useState(null) // one-shot banner: { kind: 'success'|'error', text }

  // Add-food flow
  const [flow, setFlow] = useState(null) // 'menu' | 'scan' | 'label' | 'search' | 'manual' | 'lookup' | 'confirm'
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

  // Unified energy "out" for the selected day (Oura preferred, Garmin fallback;
  // null when unconfigured or no data yet).
  useEffect(() => {
    let alive = true
    api.energySummary(ymd(date))
      .then((r) => alive && setEnergy(r))
      .catch(() => alive && setEnergy(null))
    return () => { alive = false }
  }, [date, refreshKey])

  useEffect(() => {
    api.getTargets().then((r) => setTargets(r.targets)).catch(() => {})
    api.health().then(setHealth).catch(() => {})
  }, [])

  // OAuth return handoff: the Oura/Garmin consent flows bounce the browser back
  // to /?oura=connected (or =error) or /?garmin=connected (or =error). Surface a
  // one-shot toast for whichever param is present, scrub it so a refresh doesn't
  // re-show it, and bump refreshKey so the Today energy summary and the settings
  // cards refetch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = ['oura', 'garmin'].find((p) => {
      const s = params.get(p)
      return s === 'connected' || s === 'error'
    })
    if (!provider) return
    const status = params.get(provider)
    const name = provider === 'garmin' ? 'Garmin' : 'Oura'
    setToast(status === 'connected'
      ? { kind: 'success', text: `${name} connected ✓` }
      : { kind: 'error', text: `${name} connection failed` })
    window.history.replaceState({}, '', window.location.pathname)
    setRefreshKey((k) => k + 1)
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [])

  // Replay queued logs. A network error (no HTTP status) means we're still
  // offline — stop and keep the rest queued. An HTTP error means the payload is
  // bad, so drop it rather than retry forever.
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
        if (err.status) {
          dequeue(item.clientId)
          changed = true
        } else {
          break
        }
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
  const openMenu = () => {
    setFlowError(''); setDraftFood(null); setFlow('menu')
    api.recentFoods(12)
      .then((r) => {
        const foods = r.foods || []
        setRecents(foods)
        try { localStorage.setItem(RECENTS_KEY, JSON.stringify(foods)) } catch {}
      })
      .catch(() => {
        // Offline: fall back to the last cached recents so re-logging still works.
        try {
          const cached = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
          setRecents(Array.isArray(cached) ? cached : [])
        } catch {
          setRecents([])
        }
      })
  }
  const closeFlow = () => { setFlow(null); setDraftFood(null); setFlowError('') }

  const onBarcode = async (code) => {
    setFlow('lookup')
    setFlowError('')
    try {
      const { food } = await api.lookupBarcode(code)
      setDraftFood(food)
      setFlow('confirm')
    } catch (err) {
      if (err.status === 404) {
        // Not in any database — let the user add it, barcode prefilled.
        setDraftFood({ barcode: code, name: '', serving_unit: 'g', source: 'manual' })
        setFlowError(`Barcode ${code} wasn't found. Add its details below.`)
        setFlow('confirm')
      } else {
        setFlowError(err.message || 'Lookup failed.')
        setFlow('scan')
      }
    }
  }

  const toConfirm = (food) => { setDraftFood(food); setFlowError(''); setFlow('confirm') }

  const onLog = async (payload) => {
    setLogging(true)
    try {
      await api.addEntry(payload)
      closeFlow()
      // A new entry is timestamped now → show today.
      setDate(new Date())
      setRefreshKey((k) => k + 1)
    } catch (err) {
      // No HTTP status = the request never reached the server (offline / dropped
      // connection). Queue it, show it optimistically, and sync when back online.
      const networkFailure = !err.status || (typeof navigator !== 'undefined' && !navigator.onLine)
      if (networkFailure) {
        enqueue({
          clientId: crypto.randomUUID(),
          payload: { ...payload, logged_at: payload.logged_at || new Date().toISOString() },
          food: payload.food || draftFood, // denormalized so the pending row can render
        })
        setPending(getQueue())
        closeFlow()
        setDate(new Date())
      } else {
        setFlowError(err.message || 'Could not log the entry.')
      }
    } finally {
      setLogging(false)
    }
  }

  // ---- entry edit / delete ----------------------------------------------
  const deleteEntry = async (id) => {
    // A pending (offline, not-yet-synced) entry lives only in the outbox.
    if (pending.some((i) => i.clientId === id)) {
      dequeue(id)
      setPending(getQueue())
      setEditingEntry(null)
      return
    }
    setSavingEntry(true)
    try {
      await api.deleteEntry(id)
      setEditingEntry(null)
      setRefreshKey((k) => k + 1)
    } finally {
      setSavingEntry(false)
    }
  }
  const saveEntry = async (id, patch) => {
    setSavingEntry(true)
    try {
      await api.updateEntry(id, patch)
      setEditingEntry(null)
      setRefreshKey((k) => k + 1)
    } finally {
      setSavingEntry(false)
    }
  }

  const saveTargets = async (payload) => {
    const { targets } = await api.setTargets(payload)
    setTargets(targets)
  }

  const shiftDay = (delta) => setDate((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n })

  // Merge queued-but-unsynced logs into the day they belong to, so offline logs
  // show immediately alongside server data.
  const { from: dayFrom, to: dayTo } = dayBounds(date)
  const pendingForDay = pending
    .filter((i) => i.payload.logged_at >= dayFrom && i.payload.logged_at < dayTo)
    .map(pendingEntry)
  const dayEntries = [...entries, ...pendingForDay].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1))

  // ---- flow modal content ------------------------------------------------
  const flowTitle = {
    menu: 'Add food', scan: 'Scan barcode', label: 'Scan label',
    search: 'Search foods', manual: 'Manual entry', lookup: 'Looking up…', confirm: 'Confirm & log',
  }[flow]

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      {/* App bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-black tracking-tight text-slate-50">
          <span className="text-emerald-400">◈</span> Nutrition
        </h1>
        {!online ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">offline</span>
        ) : (
          health && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
              {health.backend === 'postgres' ? 'synced' : 'local'}
            </span>
          )
        )}
      </header>

      {/* One-shot OAuth-return banner */}
      {toast && (
        <div
          className={`mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
            toast.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="rounded-lg px-1.5 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-4 pb-28 pt-4">
        {tab === 'today' && (
          <TodayView
            date={date}
            entries={dayEntries}
            targets={targets}
            loading={loadingEntries}
            onEdit={setEditingEntry}
            onDelete={deleteEntry}
            onPrevDay={() => shiftDay(-1)}
            onNextDay={() => shiftDay(1)}
            onToday={() => setDate(new Date())}
            pendingCount={pendingForDay.length}
            online={online}
            syncing={syncing}
            onSync={flushOutbox}
            energy={energy}
          />
        )}
        {tab === 'history' && <HistoryView targets={targets} refreshKey={refreshKey} />}
        {tab === 'settings' && (
          <div className="space-y-6">
            <TargetsEditor targets={targets} onSave={saveTargets} health={health} />
            <OuraCard refreshSignal={refreshKey} />
            <GarminCard refreshSignal={refreshKey} />
          </div>
        )}
      </main>

      {/* Bottom nav + add button */}
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl items-center justify-around border-t border-white/10 bg-slate-950/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur">
        <NavBtn active={tab === 'today'} onClick={() => setTab('today')} icon="☰" label="Today" />
        <NavBtn active={tab === 'history'} onClick={() => setTab('history')} icon="📈" label="History" />
        <button
          onClick={openMenu}
          className="mx-1 -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-3xl font-light text-slate-950 shadow-lg shadow-emerald-500/30 active:scale-95"
          aria-label="Add food"
        >
          ＋
        </button>
        <NavBtn active={tab === 'settings'} onClick={() => setTab('settings')} icon="⚙" label="Targets" />
        <div className="w-12" aria-hidden />
      </nav>

      {/* Add-food modal */}
      <Modal open={!!flow} onClose={closeFlow} title={flowTitle} wide={flow === 'confirm' || flow === 'search'}>
        {flow === 'menu' && (
          <div className="space-y-4">
            {recents.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Recent — tap to re-log
                </div>
                <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
                  {recents.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => toConfirm(f)}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-100">{f.name}</div>
                        <div className="truncate text-xs text-slate-400">
                          {f.brand ? `${f.brand} · ` : ''}
                          {f.serving_size ? `${fmt(f.serving_size, 0)} ${f.serving_unit}` : f.serving_unit}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold tabular-nums text-slate-50">{fmt(f.calories, 0)}</div>
                        <div className="text-[11px] text-slate-400">kcal</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {ADD_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => { setFlowError(''); setFlow(o.key) }}
                  className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
                >
                  <span className="text-2xl">{o.icon}</span>
                  <span className="font-semibold text-slate-100">{o.label}</span>
                  <span className="text-xs text-slate-400">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {flow === 'scan' && (
          <div className="space-y-3">
            <ErrorNote>{flowError}</ErrorNote>
            <Suspense fallback={<Spinner label="Loading scanner…" />}>
              <Scanner onDetected={onBarcode} />
            </Suspense>
          </div>
        )}

        {flow === 'lookup' && <Spinner label="Looking up product…" />}

        {flow === 'label' && <LabelScan onParsed={toConfirm} />}

        {flow === 'search' && <SearchFood onPick={toConfirm} />}

        {flow === 'manual' && <ManualEntry onSubmit={toConfirm} />}

        {flow === 'confirm' && draftFood && (
          <div className="space-y-3">
            <ErrorNote>{flowError}</ErrorNote>
            <FoodConfirm food={draftFood} onLog={onLog} onBack={openMenu} logging={logging} />
          </div>
        )}
      </Modal>

      {/* Entry editor */}
      <Modal open={!!editingEntry} onClose={() => setEditingEntry(null)} title="Edit entry">
        {editingEntry && (
          <EntryEditor entry={editingEntry} onSave={saveEntry} onDelete={deleteEntry} saving={savingEntry} />
        )}
      </Modal>
    </div>
  )
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs ${active ? 'text-emerald-400' : 'text-slate-400'}`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  )
}
