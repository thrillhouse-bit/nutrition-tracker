import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { Button, ErrorNote, Field, inputCls } from './ui.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{24,128}$/

function sanitizeInviteCode(value) {
  const code = String(value || '').trim()
  return INVITE_CODE_RE.test(code) ? code : ''
}

function inviteFromLocation(url) {
  const hash = new URLSearchParams(url.hash.slice(1))
  const fragmentInvite = sanitizeInviteCode(hash.get('invite'))
  if (!fragmentInvite) return null
  hash.delete('invite')
  return { code: fragmentInvite, removeHash: true, hash: hash.toString() }
}

// Signed-out gate: the whole app is one person's fueling data, so there is no
// tour or guest mode — just sign in or create the one account this device
// will use. Mirrors the server's own validation (auth.js / index.js) so a bad
// submission never round-trips to learn something the client already knows.
export default function Auth({ onAuthed, surface = 'omnifuel' }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [legal, setLegal] = useState(null)
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [showInviteCode, setShowInviteCode] = useState(false)
  const oathbearer = surface === 'oathbearer'

  useEffect(() => {
    let alive = true
    api.legalStatus()
      .then((status) => { if (alive) setLegal(status) })
      .catch(() => { if (alive) setLegal({ ready: false, signupEnabled: false }) })
    return () => { alive = false }
  }, [])

  // Invite links are a delivery mechanism, not storage. Consume the code once
  // into the controlled field, immediately remove it from the address/history,
  // and still require an explicit accepted-terms signup submission.
  useEffect(() => {
    const url = new URL(window.location.href)
    const invite = inviteFromLocation(url)
    if (!invite) return
    setInviteCode(invite.code)
    setMode('signup')
    if (invite.removeHash) url.hash = invite.hash ? `#${invite.hash}` : ''
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && !legal?.signupEnabled) return setError(legal?.ready ? 'New accounts are temporarily unavailable.' : 'New accounts are temporarily unavailable while the legal documents are finalized.')
    if (mode === 'signup' && !acceptedLegal) return setError('Agree to the Terms of Service and acknowledge the Privacy Policy to create an account.')
    if (mode === 'signup' && legal?.inviteRequired && !sanitizeInviteCode(inviteCode)) return setError('Enter a valid invitation code to create an account.')
    const cleanEmail = email.trim().toLowerCase()
    if (!EMAIL_RE.test(cleanEmail)) return setError('Enter a valid email address.')
    if (mode === 'signup' && password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try {
      const { user } = mode === 'signup'
        ? await api.signup(cleanEmail, password, acceptedLegal, legal?.inviteRequired ? inviteCode.trim() : undefined)
        : await api.login(cleanEmail, password)
      onAuthed(user)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <header className="mb-8">
        <div className="eyebrow mb-2 text-cobalt">{oathbearer ? 'Oathbearer' : 'Body Current'}</div>
        <h1 className="serif text-4xl leading-none text-ink">
          {mode === 'signup' ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {mode === 'signup'
            ? oathbearer
              ? 'One account owns your chronicle, characters, inventory, choices, and cross-device progress.'
              : 'One account, one plan — your log, targets, and connected wearables live here.'
            : oathbearer
              ? 'Return to your chronicle without exposing it to another account on this device.'
              : 'Your log, targets, and connected wearables — nowhere else.'}
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@example.com"
          />
        </Field>
        {mode === 'signup' && legal?.inviteRequired && (
          <Field label="Invitation code" hint="Use the private code you received with your alpha invitation.">
            <div className="relative">
              <input
                type={showInviteCode ? 'text' : 'password'}
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128))}
                className={`${inputCls} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowInviteCode((shown) => !shown)}
                aria-label={showInviteCode ? 'Hide invitation code' : 'Show invitation code'}
                aria-pressed={showInviteCode}
                className="absolute inset-y-0 right-0 min-w-14 px-2 text-xs font-semibold text-cobalt hover:text-cobalt-ink"
              >
                {showInviteCode ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        )}
        <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} pr-16`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 min-w-14 px-2 text-xs font-semibold text-cobalt hover:text-cobalt-ink"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>
        {mode === 'signup' && legal?.signupEnabled && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => setAcceptedLegal(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-cobalt"
            />
            <span>
              I agree to the <a className="font-semibold text-cobalt hover:text-cobalt-ink" href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>
              {' '}and acknowledge the <a className="font-semibold text-cobalt hover:text-cobalt-ink" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </span>
          </label>
        )}
        <Button type="submit" disabled={busy || (mode === 'signup' && (!legal?.signupEnabled || !acceptedLegal || (legal?.inviteRequired && !inviteCode.trim())))} className="w-full">
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {mode === 'signup' || legal?.signupEnabled ? (
        <button
          type="button"
          onClick={() => { setMode((m) => (m === 'signup' ? 'login' : 'signup')); setShowPassword(false); setShowInviteCode(false); setAcceptedLegal(false); setInviteCode(''); setError('') }}
          className="mt-6 min-h-11 text-sm font-semibold text-cobalt hover:text-cobalt-ink"
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      ) : (
        <p className="mt-6 text-center text-sm text-muted">
          {legal === null ? 'Checking new-account availability…' : legal.ready ? 'New accounts are temporarily paused.' : 'New accounts are temporarily paused while the legal documents are finalized.'}
        </p>
      )}

      <p className="mt-5 text-center text-xs leading-relaxed text-faint">
        Review {oathbearer ? "Oathbearer's" : "Body Current's"} <a className="font-semibold text-cobalt hover:text-cobalt-ink" href="/privacy">Privacy Policy</a>
        {' '}and <a className="font-semibold text-cobalt hover:text-cobalt-ink" href="/terms">Terms of Service</a>.
      </p>
    </div>
  )
}

export function LegalReconsent({ user, onAccepted, onLogout, surface = 'omnifuel' }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const product = surface === 'oathbearer' ? 'Oathbearer' : 'Body Current'

  const submit = async (event) => {
    event.preventDefault()
    if (!acknowledged || busy) return
    setError('')
    setBusy(true)
    try {
      const { user: acceptedUser } = await api.acceptCurrentLegal()
      onAccepted(acceptedUser)
    } catch (err) {
      setError(err.message || 'The acknowledgement could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <header className="mb-8">
        <div className="eyebrow mb-2 text-cobalt">Account update</div>
        <h1 className="serif text-4xl leading-none text-ink">Review the current terms</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Before continuing as {user.email}, review {product}&apos;s current legal documents and confirm your acceptance.
        </p>
      </header>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <ErrorNote>{error}</ErrorNote>
        <p className="text-sm leading-relaxed text-muted">
          Open the <a className="font-semibold text-cobalt hover:text-cobalt-ink" href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>
          {' '}and <a className="font-semibold text-cobalt hover:text-cobalt-ink" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> before acknowledging them.
        </p>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-cobalt"
          />
          <span>I agree to the current Terms of Service and acknowledge the current Privacy Policy.</span>
        </label>
        <Button type="submit" disabled={!acknowledged || busy} aria-busy={busy} className="w-full">
          {busy ? 'Saving…' : 'Agree and continue'}
        </Button>
      </form>
      <button type="button" onClick={onLogout} disabled={busy} className="mt-6 min-h-11 text-sm font-semibold text-cobalt hover:text-cobalt-ink disabled:opacity-50">
        Sign out
      </button>
    </main>
  )
}
