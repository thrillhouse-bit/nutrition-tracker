import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api } from '../../src/api/client.js'
import Auth, { LegalReconsent } from '../../src/components/Auth.jsx'

const ControlTowerRPG = lazy(() => import('./ControlTowerRPG.jsx'))

function LoadingAccount() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#090d16] px-6 text-[#f2e8d4]" aria-busy="true">
      <div className="max-w-sm text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d8aa4d]">Oathbearer</div>
        <h1 className="mt-3 text-3xl font-semibold">Opening your chronicle…</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#b8b0a3]">Confirming the account that owns this journey.</p>
      </div>
    </main>
  )
}

function AccountFailure({ onRetry }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#090d16] px-6 text-[#f2e8d4]">
      <div className="max-w-md rounded border border-[#765f37] bg-[#111827] p-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d8aa4d]">Chronicle unavailable</div>
        <h1 className="mt-3 text-2xl font-semibold">We could not verify this account.</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#c7c0b5]">Your local journey has not been changed. Reconnect before continuing so another account cannot inherit it.</p>
        <button type="button" onClick={onRetry} className="mt-6 min-h-11 border border-[#d8aa4d] px-5 font-semibold text-[#f6d88e] hover:bg-[#d8aa4d]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6d88e]">
          Try again
        </button>
      </div>
    </main>
  )
}

export default function RPGAccountGate() {
  const [auth, setAuth] = useState({ status: 'loading', user: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setAuth({ status: 'loading', user: null })
    api.me()
      .then(({ user }) => {
        if (!alive) return
        setAuth(user
          ? { status: user.legalAcceptanceRequired ? 'consent' : 'in', user }
          : { status: 'out', user: null })
      })
      .catch((error) => {
        if (!alive) return
        setAuth(error?.status === 401
          ? { status: 'out', user: null }
          : { status: 'error', user: null })
      })
    return () => { alive = false }
  }, [attempt])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setAuth({ status: 'out', user: null })
  }, [])

  if (auth.status === 'loading') return <LoadingAccount />
  if (auth.status === 'error') return <AccountFailure onRetry={() => setAttempt((value) => value + 1)} />
  if (auth.status === 'out') {
    return <Auth surface="oathbearer" onAuthed={(user) => setAuth({ status: user.legalAcceptanceRequired ? 'consent' : 'in', user })} />
  }
  if (auth.status === 'consent') {
    return (
      <LegalReconsent
        surface="oathbearer"
        user={auth.user}
        onAccepted={(user) => setAuth({ status: 'in', user })}
        onLogout={logout}
      />
    )
  }
  return (
    <Suspense fallback={<LoadingAccount />}>
      <ControlTowerRPG accountUser={auth.user} />
    </Suspense>
  )
}
