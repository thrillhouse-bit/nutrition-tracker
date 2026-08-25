import { useState } from 'react'
import { Button } from './ui.jsx'
import SmartPlanForm from './SmartPlanForm.jsx'
import { EditTargets } from './Plan.jsx'

// First-run gate: a signed-in user with no targets EVER saved (see
// server/db.js's hasTargets — distinct from getLatestTargets, which silently
// falls back to a hardcoded 2000 kcal / 150 g protein baseline nobody chose).
// Without this, Today/Plan rendered that fallback as if it were real, plus a
// demo-driven "recommendation" built on top of it — full, confident-looking
// numbers on a screen the user had done nothing to earn. Measured live
// against a fresh signup, 25 Aug 2026.
//
// Both paths here are the exact same components Plan's own "set your
// baseline" empty state already offers (SmartPlanForm, EditTargets) — this
// only changes WHEN a user is walked through them: immediately, full-screen,
// before anything fabricated can render, instead of only if they happen to
// open the Plan tab and notice. No "skip" option — the point of this gate is
// that nobody sees invented numbers presented as real, and either path here
// takes well under a minute.
export default function Onboarding({ onDone }) {
  const [mode, setMode] = useState('choose') // 'choose' | 'calculate' | 'manual'
  // SmartPlanForm's onSaved fires the instant the save succeeds, THEN it
  // renders its own confirmation view (the actual numbers + a "Done" button)
  // in place — wiring onSaved straight to onDone unmounted this whole tree
  // before that confirmation could ever render, so submitting jumped
  // straight to Today with no chance to see what was calculated (caught live,
  // 25 Aug 2026 — a fresh signup landed on Today mid-submit, no confirmation
  // screen ever appeared). onCancel is what the confirmation's own Done
  // button calls, so once a save has happened, that same callback is what
  // finishes onboarding; before a save, it's still a real cancel back to the
  // choice screen.
  const [calcSaved, setCalcSaved] = useState(false)

  if (mode === 'calculate') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <SmartPlanForm
          onCancel={() => (calcSaved ? onDone() : setMode('choose'))}
          onSaved={() => setCalcSaved(true)}
        />
      </div>
    )
  }

  if (mode === 'manual') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <EditTargets baseline={null} onCancel={() => setMode('choose')} onSaved={onDone} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-10">
      <h1 className="serif text-[32px] leading-none text-ink">Welcome</h1>
      <p className="mt-3.5 max-w-[380px] text-sm leading-relaxed text-muted">
        Fueling Intelligence adjusts your daily targets around your training and readiness. Start with your own
        baseline — calculate it from your body metrics and a goal, or type exact numbers yourself. Either way, you
        can change it any time from Plan.
      </p>
      <div className="mt-7 flex flex-col gap-2.5">
        <Button onClick={() => setMode('calculate')}>Calculate my targets</Button>
        <Button variant="outline" onClick={() => setMode('manual')}>Enter targets manually</Button>
      </div>
    </div>
  )
}
