// Hash gate: exact-hash routing keeps the three surfaces independent.
//   `#control-tower`        → arena campaign (full-screen game)
//   `#control-tower-rpg`    → authored mythic RPG story slice
//   anything else           → the app untouched
// Exact `===` matches only — `#control-tower-rpg` can never accidentally mount
// the arena, and neither hash leaks into the main app. Lives outside App so the
// main nav, auth flow, and bundle stay as they were — each game chunk loads
// only when its hash is hit (React.lazy → its own Vite chunk).
import { lazy, Suspense, useEffect, useState } from 'react'

const ControlTowerShift = lazy(() => import('./ControlTowerShift.jsx'))
const ControlTowerRPG = lazy(() => import('./ControlTowerRPG.jsx'))

export const GAME_HASH = '#control-tower'
export const RPG_HASH = '#control-tower-rpg'

export function routeFor(hash) {
  if (hash === GAME_HASH) return 'arena'
  if (hash === RPG_HASH) return 'rpg'
  return null
}

export default function GameGate({ app }) {
  const [route, setRoute] = useState(() => routeFor(window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(routeFor(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  if (!route) return app
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading the tower…</div>}>
      {route === 'arena' ? <ControlTowerShift /> : <ControlTowerRPG />}
    </Suspense>
  )
}
