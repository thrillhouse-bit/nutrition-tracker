// Hash gate: `#control-tower` mounts the game full-screen; anything else
// renders the app untouched. Lives outside App so the main nav, auth flow,
// and bundle stay exactly as they were — the game chunk loads only when the
// hash is hit (React.lazy → its own Vite chunk).
import { lazy, Suspense, useEffect, useState } from 'react'

const ControlTowerShift = lazy(() => import('./ControlTowerShift.jsx'))

export const GAME_HASH = '#control-tower'

export default function GameGate({ app }) {
  const [atGame, setAtGame] = useState(() => window.location.hash === GAME_HASH)
  useEffect(() => {
    const onHash = () => setAtGame(window.location.hash === GAME_HASH)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  if (!atGame) return app
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading the tower…</div>}>
      <ControlTowerShift />
    </Suspense>
  )
}
