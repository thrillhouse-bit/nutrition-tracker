import { useState } from 'react'
import { api } from '../api/client.js'
import { Button, ErrorNote, Field, inputCls } from './ui.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Signed-out gate: the whole app is one person's fueling data, so there is no
// tour or guest mode — just sign in or create the one account this device
// will use. Mirrors the server's own validation (auth.js / index.js) so a bad
// submission never round-trips to learn something the client already knows.
export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const cleanEmail = email.trim().toLowerCase()
    if (!EMAIL_RE.test(cleanEmail)) return setError('Enter a valid email address.')
    if (mode === 'signup' && password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try {
      const { user } = mode === 'signup' ? await api.signup(cleanEmail, password) : await api.login(cleanEmail, password)
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
        <div className="eyebrow mb-2 text-cobalt">OmniFuel Tech</div>
        <h1 className="serif text-4xl leading-none text-ink">
          {mode === 'signup' ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {mode === 'signup'
            ? 'One account, one plan — your log, targets, and connected wearables live here.'
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
        <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => { setMode((m) => (m === 'signup' ? 'login' : 'signup')); setError('') }}
        className="mt-6 min-h-11 text-sm font-semibold text-cobalt hover:text-cobalt-ink"
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
      </button>
    </div>
  )
}
