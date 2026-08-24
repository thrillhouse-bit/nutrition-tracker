import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { ErrorNote, Spinner } from './ui.jsx'

// Format a token-expiry timestamp as a short, friendly hint. Relative for the
// near term ("in 3 days" / "expired"), a short date beyond that.
function expiryLabel(expiresAt) {
  if (!expiresAt) return null
  const then = new Date(expiresAt)
  if (Number.isNaN(then.getTime())) return null
  const diffMs = then.getTime() - Date.now()
  const day = 86400000
  const days = Math.round(diffMs / day)
  if (diffMs <= 0) return 'expired'
  if (days === 0) return 'today'
  if (days <= 30) return `in ${days} day${days === 1 ? '' : 's'}`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Settings-section card for connecting Oura accounts over OAuth. Connecting is a
// full-page navigation to /api/oura/connect (the server 302s to Oura's consent
// page), so the connect control is a real anchor, not a fetch.
export default function OuraCard({ refreshSignal }) {
  const [state, setState] = useState(null) // { oauth, legacy, accounts }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.ouraAccounts()
      setState({ oauth: !!r.oauth, legacy: !!r.legacy, accounts: r.accounts || [] })
    } catch (err) {
      setError(err.message || 'Could not load Oura accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshSignal])

  const disconnect = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await api.disconnectOura(id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not disconnect that account.')
      setBusyId(null)
    }
  }

  // Emerald primary look copied from ui.jsx's Button so the connect anchor reads
  // as a button (Button renders a <button>; a navigation needs an <a>).
  const connectCls =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98] bg-emerald-500 text-slate-950 hover:bg-emerald-400'

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Oura</h3>

      {loading && <Spinner label="Loading Oura accounts…" />}
      <ErrorNote>{error}</ErrorNote>

      {!loading && state && (
        state.legacy ? (
          <p className="text-sm text-slate-400">Using OURA_TOKEN (single account, set on the server).</p>
        ) : state.oauth ? (
          <div className="space-y-3">
            {state.accounts.length === 0 ? (
              <p className="text-sm text-slate-400">No Oura account connected yet.</p>
            ) : (
              <div className="space-y-1.5">
                {state.accounts.map((a) => {
                  const exp = expiryLabel(a.expires_at)
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                      <span className="min-w-0 truncate font-medium text-slate-100">{a.label || 'Oura account'}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {exp && <span className="text-xs text-slate-500">expires {exp}</span>}
                        <button
                          onClick={() => disconnect(a.id)}
                          disabled={busyId === a.id}
                          className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
                          aria-label={`Disconnect ${a.label || 'Oura account'}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div>
              <a href="/api/oura/connect" className={connectCls}>Connect Oura</a>
              <p className="mt-2 text-xs text-slate-500">
                You'll authorize on Oura and be returned here. Connect more than one account to track multiple people.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Oura isn't configured on the server. Set <code className="text-slate-300">OURA_CLIENT_ID</code>,{' '}
            <code className="text-slate-300">OURA_CLIENT_SECRET</code>, and{' '}
            <code className="text-slate-300">OURA_REDIRECT_URI</code> (OAuth), or a legacy{' '}
            <code className="text-slate-300">OURA_TOKEN</code>.
          </p>
        )
      )}
    </div>
  )
}
