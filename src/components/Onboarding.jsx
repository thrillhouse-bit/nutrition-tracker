import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { AfpProfileForm } from './AdaptiveFuelPlan.jsx'
import { Button, ErrorNote, Spinner } from './ui.jsx'

// First-run gate for the canonical daily plan. Existing calculator profiles
// are migrated server-side before this loads, so returning users see their
// known values and only fill genuine gaps. New users complete this once; no
// second baseline calculator or hand-entered target system competes with it.
export default function Onboarding({ onDone }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    api.getAfpProfile()
      .then((result) => setProfile(result.profile))
      .catch((err) => setError(err.message || 'Could not load your plan setup.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <div className="mx-auto min-h-full max-w-xl px-4 py-8">
      <header className="mb-6">
        <h1 className="serif text-[32px] leading-none text-ink">Build your daily fuel plan</h1>
        <p className="mt-3.5 max-w-[440px] text-sm leading-relaxed text-muted">
          Set your body metrics, everyday activity, and goal once. OmniFuel uses this profile with your planned
          and synced training to produce the same daily targets everywhere in the app.
        </p>
      </header>
      {loading ? <Spinner label="Loading your plan setup…" /> : error ? (
        <div className="space-y-3">
          <ErrorNote>{error}</ErrorNote>
          <Button variant="outline" onClick={load}>Try again</Button>
        </div>
      ) : (
        <AfpProfileForm profile={profile} onSaved={onDone} />
      )}
    </div>
  )
}
