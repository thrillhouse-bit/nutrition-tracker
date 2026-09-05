import { useState } from 'react'
import { api } from '../api/client.js'
import { Button, ErrorNote, Field, inputCls } from './ui.jsx'

export function appleExportEndpoint(origin) {
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' ? `${url.origin}/api/apple/health-auto-export` : null
  } catch { return null }
}

export default function ApplePairingGuide({ onRefetch, enabled, lastSyncedAt }) {
  const [token, setToken] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const endpoint = appleExportEndpoint(window.location.origin)

  async function generate() {
    if (busy) return
    setBusy(true); setError(''); setNote('')
    try {
      const result = await api.appleToken()
      setToken(result.token); setVisible(false); setConfirmReplace(false)
      setNote('Token created. Complete both exports below, then check for received data.')
    } catch { setError('Could not create a token. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  async function copy(value, label) {
    try { await navigator.clipboard.writeText(value); setNote(`${label} copied.`) }
    catch { setError('Clipboard unavailable. Select the field and copy it manually.') }
  }
  async function check() {
    setBusy(true); setError(''); setNote('')
    try { await onRefetch(); setNote('Status refreshed from Body Current. Check the last received time below.') }
    catch { setError('Could not check for received data. Try again when you are online.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 text-sm" aria-label="Apple Health guided setup">
    <p className="text-muted">Use Health Auto Export on your iPhone to share Apple Health and Apple Watch data with Body Current. It is a separate app; REST API automations may require a paid plan. No Apple ID or Garmin password is entered here.</p>
    <ol className="list-decimal space-y-4 pl-5">
      <li><strong>Install Health Auto Export.</strong> Allow it to read the workouts and health categories you want to share.</li>
      <li><strong>Create an account pairing token.</strong>
        <p className="mt-1 text-muted">Creating a token replaces any existing Apple pairing token. Existing exporters or the native companion will need the new value. Opening this guide does not replace it.</p>
        {!confirmReplace && !token && <Button variant="outline" className="mt-2" disabled={busy || !endpoint} onClick={() => setConfirmReplace(true)}>Generate pairing token</Button>}
        {confirmReplace && <div className="mt-2 border border-line p-3" role="group" aria-label="Confirm pairing token replacement">
          <p>Replace any existing token for this account?</p>
          <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={generate}>{busy ? 'Creating…' : 'Create token and replace existing'}</Button><Button variant="subtle" disabled={busy} onClick={() => setConfirmReplace(false)}>Cancel</Button></div>
        </div>}
        {token && <div className="mt-2 space-y-2">
          <Field label="Authorization header value"><input className={inputCls} type={visible ? 'text' : 'password'} autoComplete="off" readOnly value={`Bearer ${token}`} onFocus={e => e.target.select()} /></Field>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => copy(`Bearer ${token}`, 'Authorization header')}>Copy header value</Button><Button variant="subtle" aria-pressed={visible} aria-label={visible ? 'Hide pairing token' : 'Show pairing token'} onClick={() => setVisible(v => !v)}>{visible ? 'Hide' : 'Show'}</Button></div>
          <p className="text-xs text-muted">Copy this into both automations before closing the guide. It is not saved in your browser. Keep it private.</p>
        </div>}
      </li>
      <li><strong>Create two REST API automations.</strong> In Health Auto Export, open Automations → New Automation → REST API.
        <p className="mt-1 text-muted">Name one “Body Current Workouts” and choose Workouts. Name the other “Body Current Health” and choose Health Metrics: steps, active energy, sleep, heart-rate variability and resting heart rate.</p>
        <p className="mt-1 text-muted">For both, select JSON and a short date range (Today for the first test). Keep workout routes and detailed workout metrics off. For health metrics, use daily summaries. Use the same URL and header below.</p>
        <Field label="Export URL"><input className={inputCls} readOnly value={endpoint || ''} onFocus={e => e.target.select()} /></Field>
        <Button variant="outline" className="mt-2" disabled={!endpoint} onClick={() => copy(endpoint, 'Export URL')}>Copy export URL</Button>
        {!endpoint && <p className="mt-2 text-alert">Open your deployed Body Current app over HTTPS to get a reachable export URL.</p>}
        <p className="mt-2 text-muted">Add a header named <code>Authorization</code>. Its value is <code>Bearer</code>, a space, then your token. “Copy header value” includes the prefix. Never put the token in the URL.</p>
      </li>
      <li><strong>Run both automations, then check here.</strong> Keep your iPhone unlocked. In Health Auto Export, run each automation manually and inspect its activity log.
        <p className="mt-1 text-muted">A 401 means the token needs correcting; a 403 means Apple Health is disabled here. A successful export with no records can mean there is no selected data today.</p>
        <Button variant="outline" className="mt-2" disabled={busy} aria-busy={busy} onClick={check}>{busy ? 'Checking…' : 'Check for received data'}</Button>
      </li>
    </ol>
    {enabled === false && <p className="text-alert">Turn on “Use in my plan” below before exporting. Apple Health currently rejects uploads for this account.</p>}
    <p className="text-muted" data-apple-received>Last received: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'No data received yet'}. Creating a token alone does not connect your device.</p>
    <div role="alert"><ErrorNote>{error}</ErrorNote></div>
    <p role="status" className="min-h-5 text-xs text-muted">{note}</p>
    <p className="text-xs text-muted">iOS controls background timing. Enable Background App Refresh; locked phones and Low Power Mode can delay exports. Run manually when you need an update now.</p>
    <a className="inline-flex py-2 text-cobalt underline hover:text-cobalt-ink" href="https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/" target="_blank" rel="noreferrer">Health Auto Export setup instructions ↗</a>
  </section>
}
