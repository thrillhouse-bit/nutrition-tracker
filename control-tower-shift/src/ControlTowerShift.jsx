// Control Tower Shift — arena campaign slice.
// The player controls an Apollo-inspired archer through authored Greek-mythic
// levels, using deity powers + a deliberate melee strike. Phase B pass: the arena is
// a dominant 16:9 cinematic scene (renderer.js), the HUD is framed dark
// overlays that echo the mockups, and the deity select shows illustrated
// emblems (see GAME-DIRECTION.md).
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createInitialState,
  applyDeityPassive,
  setInput,
  setAim,
  deityAttack,
  castPowerOn,
  pause, resume, restart,
  saveHighScore, loadHighScores, isHighScore,
  GODS, GODS_BY_TIER,
  POWER_DEFS, powersForGod, powerActive, powerReady,
  CAMPAIGN_LENGTH, levelForIndex, objectiveProgress,
  createSpawner,
} from './game/index.js'
import { stepFrame, createFrameClock, LOGIC_HZ } from './loop.js'
import { draw, levelPalette, observeFx, castFx, spawnBurst, VIEW_W, VIEW_H, ISO_Y } from './renderer.js'

const TICK_RATE = 30 // 30 Hz game logic

// Power shortcut keys (also available as number keys 1-3).
const POWER_KEYS = { j: 0, k: 1, l: 2, '1': 0, '2': 1, '3': 2 }

function hudKey(g) {
  const powers = (g.loadout || []).map((id) => {
    const p = g.powerState && g.powerState[id]
    const cd = p ? Math.max(0, p.cooldownUntil - g.tick) : 0
    return `${p && g.tick < p.activeUntil ? 'A' : ''}${Math.ceil(cd / TICK_RATE)}`
  }).join('|')
  return `${g.god || 'none'}:${g.status}:${g.score}:${g.levelIndex}:${g.deity?.health || 0}:${g.tokenUsage || 0}:${powers}`
}

export function backingSize(cssPx, dpr) {
  const r = Math.min(Math.max(Number(dpr) || 1, 1), 3)
  return Math.max(1, Math.round(cssPx * r))
}

export function prefersReducedMotion(win) {
  return Boolean(
    win && typeof win.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
}

// A power's HUD mark (geometric, aria-hidden, distinct per power).
const POWER_MARK = {
  solarBow: '→', radiantBurst: '◎', goldenLyre: '♪',
  wingedStride: '»', aegisWard: '▢', warCry: '☇', arrowStorm: '↟',
  bewilder: '◔', herosWrath: '⚔', thunderbolt: '⌁', queensGrace: '✚',
  earthshaker: '≋', gateOfTheDead: '◈', seasonalShift: '❋', inebriation: '◌',
  harvestMoon: '☾', temporalRewind: '↺', sunChariot: '☀', lunarVeil: '☽',
  fireBrand: '♨', primordialDark: '✦', loveArrow: '➶', worldBearer: '⊕', worldRiver: '〜',
}

// Per-power accent (the cards are deliberately not "same shape, new hue").
const POWER_TINT = {
  solarBow: '#e8b64c', radiantBurst: '#ff8c3a', goldenLyre: '#f0d27a',
  wingedStride: '#7fd6e8', aegisWard: '#8fa4ff', warCry: '#e05a3e',
  arrowStorm: '#cfd8ff', bewilder: '#f0a0c8', herosWrath: '#d9a05a',
  thunderbolt: '#ffe66a', queensGrace: '#e8c8f0', earthshaker: '#b0906a',
  gateOfTheDead: '#69d2a0', seasonalShift: '#a8d878', inebriation: '#b06ad0',
  harvestMoon: '#ffd98a', temporalRewind: '#9fb8d0', sunChariot: '#ffcf4d',
  lunarVeil: '#cfe0ff', fireBrand: '#ff7a2f', primordialDark: '#6a5a9a',
  loveArrow: '#ff8aa8', worldBearer: '#8fb8c9', worldRiver: '#4fa8c9',
}

// ─── Illustrated deity emblems ─────────────────────────────────
// Each deity has a deliberately-drawn, distinct SVG motif inside a shield
// panel — no circle-glyph grid. Motifs are original code-native geometry.
const EMBLEM_INK = {
  apollo: '#f0c25a', athena: '#9ab4ff', hermes: '#8fd0e8', ares: '#e05a3e',
  artemis: '#cfe0ff', aphrodite: '#f0a0c8', hercules: '#d9a05a', zeus: '#ffe66a',
  hera: '#e8c8f0', poseidon: '#4fa8c9', hades: '#69d2a0', persephone: '#a8d878',
  dionysus: '#b06ad0', demeter: '#ffd98a', cronus: '#9fb8d0', helios: '#ffcf4d',
  selene: '#cfe0ff', prometheus: '#ff7a2f', nyx: '#8a7ab0', eros: '#ff8aa8',
  atlas: '#8fb8c9', oceanus: '#4fa8c9',
}

function Emblem({ god }) {
  const c = EMBLEM_INK[god.key] || '#e8b64c'
  const s = { stroke: c, fill: 'none', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }
  let art
  switch (god.key) {
    case 'apollo': // sun disc with rays over a lyre
      art = <g {...s}>
        <path d="M32 6 l4 8 h-8 z" fill={c} stroke="none" />
        <path d="M18 24 q14 -10 28 0" />
        <path d="M20 24 v14 M28 22 v18 M36 22 v18 M44 24 v14" />
        <path d="M18 40 h28" />
        <path d="M14 50 q18 8 36 0" />
        <path d="M32 4 l0 -0 M12 10 l4 4 M52 10 l-4 4" />
      </g>
      break
    case 'athena': // owl face on a shield
      art = <g {...s}>
        <path d="M32 6 L52 14 V34 q0 16 -20 24 Q12 50 12 34 V14 Z" />
        <path d="M24 24 a5 5 0 1 1 0.1 0 M40 24 a5 5 0 1 1 0.1 0" fill={c} />
        <path d="M32 28 l-3 5 h6 z" fill={c} stroke="none" />
      </g>
      break
    case 'hermes': // winged sandal
      art = <g {...s}>
        <path d="M12 42 q14 -6 34 -2 q6 2 4 8 h-36 q-4 -2 -2 -12" />
        <path d="M20 36 q-4 -12 6 -18 q-2 8 2 12 M32 32 q0 -12 10 -16 q-4 8 -1 14" />
      </g>
      break
    case 'ares': // Corinthian helmet profile with crest
      art = <g {...s}>
        <path d="M22 52 v-14 q0 -22 14 -22 q10 0 12 12 l-6 2 v22" />
        <path d="M30 16 q6 -10 14 -6 q-2 6 -8 8" fill={c} stroke="none" />
        <path d="M26 34 h12" />
      </g>
      break
    case 'artemis': // recurve bow with crescent moon and nocked arrow
      art = <g {...s}>
        <path d="M18 10 q24 22 0 44" />
        <path d="M18 10 L18 54" />
        <path d="M10 32 h40 M44 26 l8 6 -8 6" />
        <path d="M50 8 a8 8 0 1 0 6 12 a6.5 6.5 0 1 1 -6 -12" fill={c} stroke="none" />
      </g>
      break
    case 'aphrodite': // dove in flight over a rose band
      art = <g {...s}>
        <path d="M10 34 q10 -14 24 -10 q8 2 14 -4 q-2 10 -10 12 q6 4 14 2 q-8 10 -22 8 q-14 -2 -20 -8" fill={c} stroke="none" />
        <path d="M16 48 h32" />
        <path d="M28 54 q4 -6 8 0" />
      </g>
      break
    case 'hercules': // knotted club crossed with lion paw
      art = <g {...s}>
        <path d="M16 52 L38 18 q6 -8 10 -4 q4 4 -4 10 L26 56 z" />
        <path d="M40 22 l-8 10 M46 30 l-10 8" />
        <path d="M14 22 q4 -8 10 -4" />
      </g>
      break
    case 'zeus': // thunderbolt with wings
      art = <g {...s} strokeWidth={3.4}>
        <path d="M36 4 L20 30 h10 L26 58 L46 26 h-10 L44 4 z" fill={c} stroke="#241c08" />
        <path d="M14 16 q-8 4 -10 12 M54 40 q6 2 8 10" />
      </g>
      break
    case 'hera': // royal scepter with star crown
      art = <g {...s}>
        <path d="M32 14 V54" />
        <path d="M22 10 l4 8 h-8 z M32 4 l4 10 h-8 z M42 10 l4 8 h-8 z" fill={c} stroke="none" />
        <path d="M24 14 h16" />
        <path d="M32 20 l0 0 M26 22 q6 6 12 0" />
      </g>
      break
    case 'poseidon': // trident over waves
      art = <g {...s}>
        <path d="M32 8 V50 M20 10 v10 q0 6 12 6 q12 0 12 -6 V10" />
        <path d="M20 10 l0 -4 M44 10 l0 -4 M32 8 l0 -6" />
        <path d="M12 54 q6 -6 12 0 t12 0 t12 0" />
      </g>
      break
    case 'hades': // chained key
      art = <g {...s}>
        <path d="M24 12 a8 8 0 1 1 0.1 0 M24 20 V52 M24 44 h10 M24 52 h8" />
        <path d="M44 8 q6 4 4 10 q-6 2 -8 -4 M48 24 q6 4 4 10" />
      </g>
      break
    case 'persephone': // pomegranate split over seeds with a small crown
      art = <g {...s}>
        <path d="M32 18 q14 2 14 16 q0 14 -14 18 q-14 -4 -14 -18 q0 -14 14 -16" />
        <path d="M26 12 l6 -6 l6 6 M32 6 v6" />
        <path d="M28 32 h2 M34 30 h2 M30 38 h2 M36 38 h2" strokeWidth={4} />
      </g>
      break
    case 'dionysus': // thyrsus with grapes
      art = <g {...s}>
        <path d="M36 14 V54" />
        <path d="M30 6 q6 -4 12 0 q2 8 -6 12 q-8 -4 -6 -12" fill={c} stroke="none" />
        <path d="M20 24 a3 3 0 1 1 0.1 0 M26 30 a3 3 0 1 1 0.1 0 M20 36 a3 3 0 1 1 0.1 0" fill={c} stroke="none" />
      </g>
      break
    case 'demeter': // wheat sheaf
      art = <g {...s}>
        <path d="M32 54 V22" />
        <path d="M32 22 q-8 -2 -8 -10 q8 0 8 8 M32 22 q8 -2 8 -10 q-8 0 -8 8" />
        <path d="M32 34 q-8 -2 -8 -10 q8 0 8 8 M32 34 q8 -2 8 -10 q-8 0 -8 8" />
        <path d="M32 44 q-8 -2 -8 -10 q8 0 8 8 M32 44 q8 -2 8 -10 q-8 0 -8 8" />
      </g>
      break
    case 'cronus': // curved scythe
      art = <g {...s}>
        <path d="M20 54 L40 12" />
        <path d="M40 12 q16 -2 16 14 q-12 -6 -22 0" fill={c} stroke="none" />
      </g>
      break
    case 'helios': // sun chariot: quad horses + radiate disc
      art = <g {...s}>
        <path d="M36 32 a9 9 0 1 1 0.1 0" />
        <path d="M36 18 v-6 M36 52 v-6 M50 32 h6 M16 32 h6 M46 22 l4 -4 M26 42 l-4 4 M46 42 l4 4 M26 22 l-4 -4" />
        <path d="M8 40 q8 -10 18 -6" />
        <path d="M10 46 q6 -2 10 0" />
      </g>
      break
    case 'selene': // crescent moon with star and veil
      art = <g {...s}>
        <path d="M40 8 a20 20 0 1 0 14 34 a16 16 0 1 1 -14 -34" fill={c} stroke="none" />
        <path d="M18 16 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill={c} stroke="none" />
      </g>
      break
    case 'prometheus': // torch with flame
      art = <g {...s}>
        <path d="M28 30 h8 V56 h-8 z" />
        <path d="M32 26 q10 -6 6 -16 q-2 6 -6 6 q2 -10 -6 -14 q0 14 -6 16 q-4 6 2 10 q6 4 10 -2" fill={c} stroke="none" />
      </g>
      break
    case 'nyx': // veiled star
      art = <g {...s}>
        <path d="M12 20 q20 -14 40 0 q-6 24 -20 24 q-14 0 -20 -24" />
        <path d="M32 24 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 z" fill={c} stroke="none" />
      </g>
      break
    case 'eros': // heart pierced by an arrow
      art = <g {...s}>
        <path d="M32 50 Q12 36 16 22 q2 -8 10 -6 q4 1 6 6 q2 -5 6 -6 q8 -2 10 6 q4 14 -16 28" fill={c} stroke="none" />
        <path d="M10 14 L54 44 M50 38 l6 8 -10 0" />
      </g>
      break
    case 'atlas': // figure bearing a star-band globe
      art = <g {...s}>
        <path d="M32 26 a12 12 0 1 1 0.1 0" />
        <path d="M20 26 q12 -8 24 0 M22 32 q10 6 20 0" />
        <path d="M24 40 L32 38 L40 40 M32 38 V56" />
      </g>
      break
    case 'oceanus': // river serpent coiling through waves
      art = <g {...s}>
        <path d="M10 22 q10 -8 16 0 t16 0 t16 0" />
        <path d="M14 34 q8 -6 14 0 t14 0 t10 0" />
        <path d="M10 46 q10 -8 16 0 t16 0 t16 0" />
        <path d="M24 12 l8 6" />
      </g>
      break
    default:
      art = <g {...s}><path d="M16 48 L48 16 M40 16 h8 v8" /></g>
  }
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" className="drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]">
      {art}
    </svg>
  )
}

// ─── Deity Selection Screen ────────────────────────────────────
export function DeitySelect({ onSelect, unlockedTiers }) {
  const tiers = [
    { num: 1, title: 'Domain Gods', gods: GODS_BY_TIER[1] },
    { num: 2, title: 'Olympian Gods', gods: GODS_BY_TIER[2] },
    { num: 3, title: 'Titans', gods: GODS_BY_TIER[3] },
  ]
  const signature = (god) => {
    const list = powersForGod(god.key)
    const def = POWER_DEFS[list[0]]
    return def ? { name: def.name, desc: def.description } : { name: '—', desc: '' }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0a0f14]/96 p-4" style={{ colorScheme: 'dark' }}>
      <div className="w-full max-w-2xl text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#a5761f]">Control Tower Shift</div>
        <h2 className="serif text-3xl mb-1 text-[#f3e6c8]">Choose Your Deity</h2>
        <p className="mb-5 text-xs text-[#b8a888]">
          Each deity brings their own myth-grounded power into the arena campaign.
          Apollo wields three; the others carry their signature ability.
        </p>
        {tiers.map((tier) => {
          const unlocked = (unlockedTiers || 1) >= tier.num
          return (
            <div key={tier.num} className="mb-4">
              <h3 className={`mb-2 text-[10px] font-bold uppercase tracking-[0.18em] ${unlocked ? 'text-[#e8b64c]' : 'text-[#6f6250]'}`}>
                Tier {tier.num}: {tier.title}
                {tier.num > 1 && !unlocked && ' (Locked)'}
              </h3>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {tier.gods.map((god) => {
                  const locked = tier.num > 1 && !unlocked
                  const sig = signature(god)
                  return (
                    <button
                      key={god.key}
                      type="button"
                      aria-label={locked ? `Locked: ${god.name}` : `Select ${god.name} — ${sig.name}. ${sig.desc}`}
                      disabled={locked}
                      className={`relative flex min-h-11 flex-col items-center gap-1 border p-2 transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        locked
                          ? 'border-[#2c2c33] bg-[#14181f]/70'
                          : 'border-[#5a4a2a] bg-[#161d26] hover:border-[#e8b64c] hover:bg-[#1d2633]'
                      }`}
                      style={{ clipPath: 'polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)' }}
                      onClick={() => {
                        if (!locked) onSelect(god.key)
                      }}
                    >
                      <span className="block h-12 w-12" aria-hidden="true">
                        {locked ? (
                          <svg viewBox="0 0 64 64" width="100%" height="100%">
                            <path d="M22 26 v-6 a10 10 0 0 1 20 0 v6 h4 v22 H18 V26 z M28 36 a4 4 0 0 0 8 0" fill="none" stroke="#6f6250" strokeWidth="4" strokeLinecap="round" />
                          </svg>
                        ) : <Emblem god={god} />}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#e8dcc0]">{god.name}</span>
                      <span className="text-[9px] uppercase tracking-wider text-[#8f8168]">{sig.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        <p className="text-xs text-[#6f6250]">
          Click a deity. ESC to dismiss (default: Apollo).
        </p>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────
export default function ControlTowerShift() {
  const gameRef = useRef(null)
  if (gameRef.current === null) {
    gameRef.current = createInitialState({ god: 'apollo' })
  }
  const spawnerRef = useRef(null)
  if (spawnerRef.current === null) {
    spawnerRef.current = createSpawner(Date.now() >>> 0)
  }
  const fxRef = useRef({
    t: 0, shake: 0, damageFlash: 0, pose: 0,
    reduceMotion: prefersReducedMotion(typeof window !== 'undefined' ? window : null),
    particles: [], floaters: [], bursts: [], hurt: {}, prevThreat: {}, prevProj: {},
    walk: 0, banner: null,
  })
  const savedRef = useRef(false)
  const canvasRef = useRef(null)
  const keyRef = useRef('')
  const pointerRef = useRef({ x: 0, y: 0, down: false })
  const [hud, setHud] = useState(() => ({ g: gameRef.current }))
  const [showHelp, setShowHelp] = useState(false)
  const [showDeitySelect, setShowDeitySelect] = useState(false)
  const [showHint, setShowHint] = useState(() => {
    try {
      return !window.localStorage.getItem('ctshift:hint-dismissed')
    } catch {
      return true
    }
  })

  const sync = useCallback(() => {
    const k = hudKey(gameRef.current)
    if (k !== keyRef.current) {
      keyRef.current = k
      setHud({ g: gameRef.current })
    }
  }, [])

  // Level intro banner (render-layer only; also shown on the very first frame).
  const announceLevel = useCallback((index) => {
    const level = levelForIndex(index)
    if (level) fxRef.current.banner = { title: level.name, subtitle: level.introSubtitle, age: 0 }
  }, [])

  // Cast a power toward the best aim (pointer, or movement/facing for keyboard).
  const aimPoint = useCallback((g) => {
    const ptr = pointerRef.current
    if (ptr.down) return { x: ptr.x, y: ptr.y }
    const d = g.deity
    const inp = g.input
    if (inp && (inp.aimX !== 0 || inp.aimY !== 0)) return { x: d.x + inp.aimX * 300, y: d.y + inp.aimY * 300 }
    return { x: d.x + Math.cos(d.facing) * 300, y: d.y + Math.sin(d.facing) * 300 }
  }, [])

  const castPowerAt = useCallback((powerId) => {
    const g = gameRef.current
    if (g.status !== 'running') return
    if (!powerReady(g, powerId)) return
    const aim = aimPoint(g)
    const next = castPowerOn(g, powerId, aim.x, aim.y)
    if (next === g) return // cast bailed (no target) — no fx, no charge
    gameRef.current = next
    const fx = fxRef.current
    if (powerId === 'solarBow') fx.pose = 1
    castFx(fx, powerId, aim.x, aim.y, g)
    if (powerId === 'radiantBurst' && !fx.reduceMotion) fx.shake = Math.min(10, fx.shake + 4)
    sync()
  }, [aimPoint, sync])

  // Fixed-timestep loop: accumulate real time, step logic at TICK_RATE Hz.
  useEffect(() => {
    if (showDeitySelect) return // pause during deity selection
    if (!fxRef.current.banner) announceLevel(gameRef.current.levelIndex)
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(performance.now()), 16))
    const caf = window.cancelAnimationFrame || clearTimeout
    let handle
    // Read only the timestamp supplied by this rAF source. Mixing it with
    // performance.now() gives jsdom (and some embedded browsers) different
    // time origins and can leave a freshly mounted encounter apparently frozen.
    const stepsFor = createFrameClock(1000 / LOGIC_HZ)

    const frame = (now) => {
      const fx = fxRef.current
      const steps = stepsFor(now)
      if (steps > 0) {
        const before = gameRef.current
        for (let i = 0; i < steps; i++) {
          // Level cards are a readable pre-encounter beat, not a blind damage
          // window. Rendering continues so the card can fade, but simulation
          // begins only after it clears.
          if (fx.banner) break
          const prev = gameRef.current
          gameRef.current = stepFrame(gameRef.current, spawnerRef.current, 1)
          // Level changed → intro banner.
          if (gameRef.current.levelIndex !== prev.levelIndex) announceLevel(gameRef.current.levelIndex)
        }
        // Damage flash + shake when the deity gets hit.
        if (before.deity.health > gameRef.current.deity.health) {
          fx.damageFlash = 8
          if (!fx.reduceMotion) {
            fx.shake = Math.min(10, fx.shake + 6)
            spawnBurst(fx, gameRef.current.deity.x, gameRef.current.deity.y, 'spark', '#e04a2e', 6, { r: 2.6, life: 14, speed: 3 })
          }
        }
        fx.pose = Math.max(0, fx.pose - 0.06 * steps)
        fx.damageFlash = Math.max(0, fx.damageFlash - 0.5 * steps)
        fx.shake = Math.max(0, fx.shake - 0.8 * steps)
      }
      fx.t += 1
      // Render-layer FX observation: hit reactions, damage numbers, kill and
      // impact bursts are derived from state diffs only (never drive the sim).
      observeFx(fxRef.current, gameRef.current)

      const g = gameRef.current
      if ((g.status === 'won' || g.status === 'failed') && !savedRef.current) {
        savedRef.current = true
        try {
          if (isHighScore(window.localStorage, g.score)) {
            saveHighScore(window.localStorage, { score: g.score, level: g.levelIndex, at: new Date().toISOString() })
          }
        } catch { /* storage unavailable */ }
      }
      if (canvasRef.current) {
        const ctx2d = canvasRef.current.getContext('2d')
        if (ctx2d) draw(ctx2d, { ...g, level: levelForIndex(g.levelIndex) }, fx)
      }
      sync()
      handle = raf(frame)
    }
    handle = raf(frame)
    return () => caf(handle)
  }, [sync, showDeitySelect, announceLevel])

  // Resize canvas: 16:9 backing store follows the CSS box and the DPR.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const rect = canvas.getBoundingClientRect()
      const cssW = rect.width
      const cssH = rect.height || (cssW * VIEW_H / VIEW_W)
      if (!cssW) return
      const dpr = window.devicePixelRatio || 1
      const px = backingSize(cssW, dpr)
      const py = backingSize(cssH, dpr)
      if (canvas.width !== px || canvas.height !== py) {
        canvas.width = px
        canvas.height = py
      }
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Pointer: aim where the pointer is; click/hold fires the bow.
  // The canvas is 16:9: x maps across VIEW_W; screen y maps back through the
  // iso squash so aim lands in true world coordinates.
  const canvasPoint = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * VIEW_W
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * VIEW_H / ISO_Y
    return { x, y }
  }, [])

  const onPointerMove = useCallback((e) => {
    const p = canvasPoint(e)
    if (!p) return
    pointerRef.current = { x: p.x, y: p.y, down: pointerRef.current.down }
    const g = gameRef.current
    const dx = p.x - g.deity.x
    const dy = p.y - g.deity.y
    const mag = Math.hypot(dx, dy) || 1
    gameRef.current = setAim(g, dx / mag, dy / mag)
    sync()
  }, [canvasPoint, sync])

  const onPointerDown = useCallback((e) => {
    e.currentTarget?.setPointerCapture?.(e.pointerId)
    const p = canvasPoint(e)
    if (!p) return
    pointerRef.current = { x: p.x, y: p.y, down: true }
    const beforeAim = gameRef.current
    const aimDx = p.x - beforeAim.deity.x
    const aimDy = p.y - beforeAim.deity.y
    const aimMag = Math.hypot(aimDx, aimDy) || 1
    gameRef.current = setAim(beforeAim, aimDx / aimMag, aimDy / aimMag)
    // Fire the bow at the tap point.
    castPowerAt('solarBow')
    // Also drift toward the tap so taps still move the archer.
    const g = gameRef.current
    if (g.status === 'running') {
      const dx = p.x - g.deity.x
      const dy = p.y - g.deity.y
      const dist = Math.hypot(dx, dy)
      gameRef.current = setInput(g, dist > 24 ? dx / dist : 0, dist > 24 ? dy / dist : 0)
      sync()
    }
  }, [canvasPoint, castPowerAt, sync])

  const onPointerUp = useCallback((e) => {
    pointerRef.current = { ...pointerRef.current, down: false }
    gameRef.current = setInput(gameRef.current, 0, 0)
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    sync()
  }, [sync])

  // Keyboard: WASD/arrows move, J/K/L or 1/2/3 powers, Enter melee, P pause.
  useEffect(() => {
    if (showDeitySelect) return
    const keys = new Set()
    const handleDown = (e) => {
      const g = gameRef.current
      keys.add(e.key.toLowerCase())
      if (g.status === 'running') updateMovement()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    const handleUp = (e) => {
      keys.delete(e.key.toLowerCase())
      updateMovement()
    }
    let mx = 0
    let my = 0
    function updateMovement() {
      mx = 0
      my = 0
      if (keys.has('w') || keys.has('arrowup')) my -= 1
      if (keys.has('s') || keys.has('arrowdown')) my += 1
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1
      if (keys.has('d') || keys.has('arrowright')) mx += 1
      const mag = Math.hypot(mx, my)
      if (mag > 0) {
        mx /= mag
        my /= mag
        // Face the way we're going when moving with the keyboard.
        gameRef.current = setAim(gameRef.current, mx, my)
      }
      gameRef.current = setInput(gameRef.current, mx, my)
      sync()
    }

    const onKey = (e) => {
      const g = gameRef.current
      const key = e.key.toLowerCase()
      if (key === 'p') {
        gameRef.current = g.status === 'paused' ? resume(g) : pause(g)
        sync()
        e.preventDefault()
        return
      }
      if (key === 'escape' && showDeitySelect) {
        setShowDeitySelect(false)
        e.preventDefault()
        return
      }
      if (g.status !== 'running') return
      if (key === 'enter') {
        const prev = gameRef.current
        gameRef.current = deityAttack(gameRef.current)
        if (gameRef.current !== prev) fxRef.current.pose = 0.8
        sync()
        e.preventDefault()
        return
      }
      const loadout = g.loadout || powersForGod(g.god)
      if (POWER_KEYS[key] !== undefined) {
        const powerId = loadout[POWER_KEYS[key]]
        if (powerId) castPowerAt(powerId)
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [sync, showDeitySelect, castPowerAt])

  function selectGod(godKey) {
    setShowDeitySelect(false)
    gameRef.current = applyDeityPassive(gameRef.current, godKey)
    gameRef.current = { ...gameRef.current, loadout: powersForGod(godKey) }
    sync()
  }

  function startCampaign() {
    gameRef.current = restart(gameRef.current)
    spawnerRef.current = createSpawner(Date.now() >>> 0)
    savedRef.current = false
    const fx = fxRef.current
    fx.particles = []
    fx.floaters = []
    fx.bursts = []
    fx.hurt = {}
    fx.prevThreat = {}
    fx.prevProj = {}
    fx.shake = 0
    announceLevel(0)
    sync()
  }

  const g = hud.g
  const loadout = g.loadout || powersForGod(g.god)
  const level = levelForIndex(g.levelIndex)
  const pal = levelPalette(level)
  const running = g.status === 'running'
  const over = g.status === 'won' || g.status === 'failed'
  const godDef = GODS.find((d) => d.key === g.god)
  let scores = []
  if (over) {
    try {
      scores = loadHighScores(window.localStorage).slice(0, 5)
    } catch {
      scores = []
    }
  }
  const healthPct = Math.max(0, Math.round(((g.deity?.health || 0) / (g.deity?.maxHealth || 1)) * 100))
  const lowHealth = (g.deity?.health || 0) <= 40

  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center bg-[#0a0f14] text-[#efe6d2]"
      style={{ colorScheme: 'dark' }}
    >
      <div className="flex w-full max-w-[1180px] flex-1 flex-col gap-2 px-3 py-2 sm:px-5">
        {showDeitySelect && (
          <DeitySelect onSelect={selectGod} unlockedTiers={g.unlockedTier || 1} />
        )}

        {/* Top HUD frame: deity identity (left), map/objective (center), score (right) */}
        <header
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-[#5a4a2a] bg-[#11161d] px-4 py-2"
          style={{ boxShadow: '0 0 0 1px rgba(232,182,76,0.12), inset 0 1px 0 rgba(232,182,76,0.10)' }}
        >
          <div className="min-w-[180px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#a5761f]">Control Tower Shift</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <h1 className="serif text-xl leading-none text-[#f6e9c9]">{godDef?.name || 'Apollo'}</h1>
              {godDef && <span className="text-[10px] uppercase tracking-[0.12em] text-[#8f8168]">{godDef.domain}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2" aria-label="Deity health">
              <div className="relative h-3 w-36 border border-[#5a4a2a] bg-[#241316]">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${healthPct}%`,
                    background: lowHealth
                      ? 'linear-gradient(90deg,#8f1f16,#d43a24)'
                      : 'linear-gradient(90deg,#c98a2e,#f0c25a)',
                  }}
                />
              </div>
              <span data-testid="health" className="text-[11px] tabular-nums text-[#d8c8a0]">
                {g.deity?.health || 0}/{g.deity?.maxHealth || 0}
              </span>
            </div>
          </div>
          <div className="min-w-[200px] flex-1 text-center">
            <div data-testid="level" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#e8b64c]">
              Level {Math.min(g.levelIndex + 1, CAMPAIGN_LENGTH)} / {CAMPAIGN_LENGTH} · {level?.location}
            </div>
            <div className="serif text-base leading-tight text-[#f6e9c9]">{level?.name}</div>
            <div data-testid="objective" className="text-[11px] text-[#b8a888]">
              {level?.objective?.text} <span className="tabular-nums text-[#e8b64c]">({objectiveProgress(g)})</span>
            </div>
          </div>
          <div className="flex min-w-[140px] flex-col items-end gap-0.5">
            <div data-testid="status" className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9fd08a]">
              {g.status === 'paused' ? 'Paused' : running ? 'On duty' : g.status === 'won' ? 'Campaign held' : 'Fallen'}
            </div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-[#8f8168]">
              <span data-testid="score" className="serif text-lg tabular-nums text-[#f6e9c9]">{g.score}</span> score
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8f8168]"><span data-testid="tokens">Tokens: {g.tokenUsage || 0}</span></div>
          </div>
        </header>

        {/* First-time control hint — dismissible, never blocks play. */}
        {showHint && running && (
          <div role="note" className="flex items-start justify-between gap-3 border border-[#5a4a2a] bg-[#141a22] px-3 py-1.5 text-[11px] leading-snug text-[#c8b890]">
            <p>
              <strong className="text-[#f0d27a]">WASD / arrows</strong> move · pointer or tap fires the bow ·
              <strong className="text-[#f0d27a]"> J K L</strong> (or <strong className="text-[#f0d27a]">1 2 3</strong>) cast powers ·
              <strong className="text-[#f0d27a]"> P</strong> pauses.
            </p>
            <button
              type="button"
              aria-label="Dismiss control hint"
              className="min-h-11 min-w-11 shrink-0 border border-[#5a4a2a] text-xs font-bold text-[#c8b890] hover:bg-[#1d2633]"
              onClick={() => {
                setShowHint(false)
                try {
                  window.localStorage.setItem('ctshift:hint-dismissed', '1')
                } catch { /* ignore */ }
              }}
            >
              ✕
            </button>
          </div>
        )}

        {showHelp && (
          <div id="ctshift-help" className="border border-[#5a4a2a] bg-[#141a22] p-4 text-xs leading-relaxed text-[#c8b890]">
            <p className="mb-2">
              Move with <span className="font-bold text-[#f0d27a]">WASD</span> / arrow keys, or tap the arena to
              fire and drift toward it. The archer aims at your pointer — on keyboard he aims the way he
              moves. Press <span className="font-bold text-[#f0d27a]">Enter</span> for a point-blank melee and{' '}
              <span className="font-bold text-[#f0d27a]">P</span> to pause. Clear every beast in
              a level to advance; lose all health and the campaign ends.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {loadout.map((id, i) => {
                const def = POWER_DEFS[id]
                if (!def) return null
                return (
                  <div key={id} className="contents">
                    <dt className="font-bold text-[#f0d27a]">{i + 1}. {def.name}</dt>
                    <dd>{def.description}</dd>
                  </div>
                )
              })}
            </dl>
          </div>
        )}

        {/* The arena: dominant 16:9 scene. */}
        <div className="relative w-full flex-1" style={{ minHeight: 0 }}>
          <div className="relative mx-auto w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, maxHeight: 'calc(100dvh - 150px)' }}>
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              tabIndex={0}
              role="application"
              className="block h-full w-full touch-none border border-[#5a4a2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8b64c]"
              style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.85), 0 10px 42px rgba(0,0,0,0.7)' }}
              onPointerMove={running ? onPointerMove : undefined}
              onPointerDown={running ? onPointerDown : undefined}
              onPointerUp={running ? onPointerUp : undefined}
              onPointerCancel={running ? onPointerUp : undefined}
              aria-label="Arena. Move with WASD or arrows. Pointer or tap to fire the bow. Enter performs a point-blank melee. J K L or 1 2 3 cast powers. P pauses."
            />

            {/* Power cards — overlaid on the arena's lower edge, mockup-style. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2">
              <div className="pointer-events-auto grid grid-cols-3 gap-1.5 sm:gap-2.5" role="group" aria-label="Deity powers">
                {loadout.map((id, idx) => {
                  const def = POWER_DEFS[id]
                  if (!def) return null
                  const active = powerActive(g, id)
                  const ready = powerReady(g, id)
                  const cd = !ready ? Math.ceil(((g.powerState && g.powerState[id].cooldownUntil) - g.tick) / TICK_RATE) : 0
                  const tint = POWER_TINT[id] || '#e8b64c'
                  return (
                    <button
                      key={id}
                      onClick={() => castPowerAt(id)}
                      disabled={!running || !ready}
                      className={`relative flex min-h-16 w-[92px] flex-col items-center justify-center gap-0.5 border-2 px-1 py-1.5 text-[9px] font-bold uppercase tracking-[0.06em] transition sm:w-[108px] sm:text-[10px] disabled:opacity-55 ${
                        active ? 'bg-[#2a2312]' : 'bg-[#131820]/92 hover:bg-[#1c232e]'
                      }`}
                      style={{ borderColor: active ? tint : ready ? '#5a4a2a' : '#33302a', boxShadow: active ? `0 0 14px ${tint}66` : 'none' }}
                    >
                      <span className="text-2xl leading-none" aria-hidden="true" style={{ color: ready || active ? tint : '#6f6250' }}>
                        {POWER_MARK[id] || '✦'}
                      </span>
                      <span className="sr-only">{def.name} {active ? 'active' : ready ? 'ready' : `cooldown ${cd}s`}</span>
                      <span style={{ color: '#e8dcc0' }}>{def.name}</span>
                      <span style={{ color: ready || active ? '#9a8c6e' : '#6f6250' }}>
                        {active ? 'active' : ready ? 'ready' : `${cd}s`}
                      </span>
                      {idx < 3 && <span className="absolute left-1 top-0.5 text-[9px]" style={{ color: '#a5761f' }} aria-hidden="true">{['J', 'K', 'L'][idx]}</span>}
                      {!ready && cd > 0 && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#e8b64c]/70" style={{ width: `${100 - Math.min(100, (cd * TICK_RATE) / (POWER_DEFS[id]?.cooldown || 1) * 100)}%` }} aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Fire button (pointer/touch). */}
            {running && (
              <button
                type="button"
                aria-label="Fire the bow"
                className="absolute bottom-2 right-2 flex min-h-16 min-w-16 items-center justify-center rounded-full border-2 text-2xl"
                style={{ borderColor: '#a5761f', background: 'rgba(19,24,32,0.88)', color: '#f0c25a', boxShadow: '0 0 16px rgba(232,182,76,0.35)' }}
                onClick={() => castPowerAt('solarBow')}
              >
                ➤
              </button>
            )}

            {/* Pause / campaign-end overlay inside the arena frame. */}
            {!running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0f14]/88 p-6 text-center">
                <div className="serif text-4xl text-[#f6e9c9]">
                  {g.status === 'paused' ? 'Paused' : g.status === 'won' ? 'Campaign held.' : 'You have fallen.'}
                </div>
                {g.status !== 'paused' && (g.deity?.health || 0) > 0 && level?.completion && (
                  <div className="text-sm text-[#b8a888]">{level.completion}</div>
                )}
                {over && (
                  <div className="text-sm text-[#b8a888]">
                    Final score <span className="serif text-lg text-[#e8b64c] tabular-nums">{g.score}</span> ·
                    reached level {Math.min(g.levelIndex + 1, CAMPAIGN_LENGTH)}
                  </div>
                )}
                {over && scores.length > 0 && (
                  <ol className="w-40 text-left text-xs text-[#8f8168]">
                    {scores.map((s2, i) => (
                      <li key={i} className="flex justify-between border-b border-[#2c2c33] py-0.5">
                        <span>{i + 1}.</span>
                        <span className="tabular-nums text-[#e8dcc0]">{s2.score}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {g.status === 'paused' ? (
                  <div className="flex flex-col gap-2">
                    <button
                      className="min-h-11 bg-[#c98a2e] px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#161006] hover:bg-[#e8b64c]"
                      onClick={() => {
                        gameRef.current = resume(gameRef.current)
                        sync()
                      }}
                    >
                      Resume
                    </button>
                    <button
                      className="min-h-11 border border-[#5a4a2a] px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#e8dcc0] hover:bg-[#1d2633]"
                      onClick={() => setShowDeitySelect(true)}
                    >
                      Choose Deity
                    </button>
                  </div>
                ) : (
                  <button
                    className="min-h-11 bg-[#c98a2e] px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#161006] hover:bg-[#e8b64c]"
                    onClick={startCampaign}
                  >
                    New campaign
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer control strip */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[#6f6250]">
          <button
            className="min-h-11 px-2 text-xs font-bold uppercase tracking-[0.13em] text-[#8f8168] hover:text-[#e8dcc0] disabled:opacity-40"
            disabled={!running}
            onClick={() => {
              gameRef.current = pause(gameRef.current)
              sync()
            }}
          >
            Pause
          </button>
          <span>WASD move · JKL powers · P pause · Enter melee</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="min-h-11 px-2 text-xs font-bold uppercase tracking-[0.13em] text-[#8f8168] hover:text-[#e8dcc0]"
              onClick={() => setShowDeitySelect(true)}
            >
              Deity
            </button>
            <button
              type="button"
              aria-expanded={showHelp}
              aria-controls="ctshift-help"
              onClick={() => setShowHelp((v) => !v)}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-[#5a4a2a] text-xs font-bold text-[#e8dcc0] hover:bg-[#1d2633]"
            >
              <span aria-hidden>?</span>
              <span className="sr-only">How to play</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
