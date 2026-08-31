// Control Tower Shift — render layer. All game truth lives in the pure core
// (./game); this file owns the loop, the canvas, and the HUD. Styled to the
// Fueling Intelligence system per ASSET-AUDIT.md: paper ground, ink lines,
// cobalt as the one accent, status shown by SHAPE + WORD, Bodoni numerals.
//
// The five domain gods of the OmniFuel pantheon are playable characters:
// each grants their signature ability and faces monster waves drawn from the
// infrastructure deities. Glyphs are simplified canvas adaptations of the
// SVG art in sitrep/olympus2/src/Art.jsx.
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createInitialState,
  clearThreat,
  activateAbility,
  abilityActive,
  abilityReady,
  pause,
  resume,
  restart,
  saveHighScore,
  loadHighScores,
  isHighScore,
} from './game/index.js'
import { createSpawner, FIELD_RADIUS } from './spawner.js'
import { stepFrame, threatAt, nearestThreatToTower, LOGIC_HZ } from './loop.js'
import { GODS, GODS_TIER_1, GODS_TIER_2, GODS_TIER_3, drawGlyph, ABILITY_GLYPHS } from './game/characters.js'

// Ability ordering stays stable for the HUD and tests.
const ABILITY_ORDER = ['shield', 'pulseClear', 'speedBurst', 'scoreMultiplier', 'repair']

// Geometric marks per the asset audit — no sprite art exists in this repo.
// These Unicode marks serve as the accessible default; glyphs from characters.js
// are rendered as decorative SVGs alongside them.
const ABILITY_MARK = {
  shield: '▢',
  pulseClear: '◎',
  speedBurst: '»',
  scoreMultiplier: '×2',
  repair: '+',
}

// The ability label and help text are the same regardless of which god is
// selected — each god's signature ability is the same mechanic, just themed.
const ABILITY_LABEL = {
  shield: 'Shield',
  pulseClear: 'Pulse',
  speedBurst: 'Burst',
  scoreMultiplier: 'Score',
  repair: 'Repair',
}

const ABILITY_HELP = {
  shield: 'Blocks tower damage for a short time.',
  pulseClear: 'Instantly clears every threat in range, at half points.',
  speedBurst: 'Slows every threat for a short time.',
  scoreMultiplier: 'Doubles points from clears for a short time.',
  repair: 'Restores tower integrity immediately.',
}

const VIEW = FIELD_RADIUS + 20 // logical half-extent drawn on the canvas

// HUD key for change detection — includes god selection so re-selecting
// a different deity triggers a re-render.
function hudKey(g) {
  const cds = ABILITY_ORDER.map((n) => {
    const a = g.abilities[n]
    const cd = a ? Math.max(0, a.cooldownUntil - g.tick) : 0
    return `${abilityActive(g, n) ? 'A' : ''}${Math.ceil(cd / LOGIC_HZ)}`
  }).join('|')
  return `${g.god || 'none'}:${g.status}:${g.score}:${g.wave}:${g.integrity}:${cds}`
}

// Backing store in DEVICE pixels, drawing in logical ones. The canvas shipped
// with a fixed 560px buffer stretched over `w-full`, so on a 390px phone at
// DPR 3 it painted 560 pixels into 1170 — every edge soft. Capped at 3: past
// that the fill cost climbs with the square and nothing visibly improves.
export function backingSize(cssPx, dpr) {
  const r = Math.min(Math.max(Number(dpr) || 1, 1), 3)
  return Math.max(1, Math.round(cssPx * r))
}

// Exported so both answers are testable: a media query read inline in a ref
// initialiser is a decision no test can see, and “reduced motion is honoured”
// is exactly the kind of claim that passes by never being exercised.
export function prefersReducedMotion(win) {
  return Boolean(
    win && typeof win.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
}

// Draw a glyph into a temp canvas to use as a pattern or composite on the main canvas.
// For simplicity, we draw glyphs directly onto the main canvas at the threat position.
function draw(canvas, g, fx) {
  const ctx = canvas.getContext && canvas.getContext('2d')
  if (!ctx) return // jsdom / lost context: the HUD still carries the state
  const w = canvas.width
  const scale = w / (VIEW * 2)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#f7f4ec'
  ctx.fillRect(0, 0, w, w)
  ctx.setTransform(scale, 0, 0, scale, w / 2, w / 2)

  // Range rings — hairline ink, the design’s line language.
  ctx.strokeStyle = 'rgba(18,18,16,0.16)'
  ctx.lineWidth = 1 / scale
  for (const r of [FIELD_RADIUS, FIELD_RADIUS * 0.66, FIELD_RADIUS * 0.33]) {
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Pulse flash: an expanding hairline circle for a few ticks after firing.
  // The pulse flash is decoration; the threats' motion IS the game and cannot
  // be reduced without removing it. So reduced-motion drops this and nothing
  // else — an honest partial, not a claim the page holds still.
  if (!fx.reduceMotion && fx.pulseAt != null && g.tick - fx.pulseAt < 15) {
    const p = (g.tick - fx.pulseAt) / 15
    ctx.strokeStyle = `rgba(31,53,196,${1 - p})`
    ctx.lineWidth = 2 / scale
    ctx.beginPath()
    ctx.arc(0, 0, g.config.abilities.pulseClear.radius * p, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Tower: cobalt circle footprint + ink square (audit's chosen geometry).
  // If a god is selected, draw their glyph inside the tower circle.
  ctx.strokeStyle = '#1f35c2'
  ctx.lineWidth = 2 / scale
  ctx.beginPath()
  ctx.arc(0, 0, g.config.towerRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#121210'
  const s = g.config.towerRadius * 0.8
  ctx.fillRect(-s / 2, -s / 2, s, s)

  // If a god is selected, draw their glyph at the tower center
  if (g.god) {
    const god = GODS.find((d) => d.key === g.god)
    if (god) {
      ctx.save()
      ctx.translate(0, 0)
      // Draw the god's glyph at 70% of tower radius
      const glyphSize = g.config.towerRadius * 1.2
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      // Use a simplified glyph from the characters module
      // The glyphs are drawn as SVG paths adapted for canvas
      drawGlyph(ctx, god.glyph, 0, 0, glyphSize)
      ctx.restore()
    }
  }

  // Shield: mist ring, drawn only while genuinely active (word lives in HUD).
  if (abilityActive(g, 'shield')) {
    ctx.strokeStyle = '#dce6d7'
    ctx.lineWidth = 5 / scale
    ctx.beginPath()
    ctx.arc(0, 0, g.config.towerRadius + 8, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Threats: now each threat carries a `glyph` field identifying which monster
  // deity it represents. Draw the glyph instead of a plain triangle.
  for (const t of g.threats) {
    const close = Math.hypot(t.x, t.y) < FIELD_RADIUS * 0.33
    ctx.fillStyle = close ? '#8e3044' : '#121210'

    // Draw the monster glyph at the threat position
    ctx.save()
    ctx.translate(t.x, t.y)
    // Glyphs are drawn centered at origin, scaled to threat radius
    drawGlyph(ctx, t.glyph || 'hydra', 0, 0, t.radius * 2.2)
    ctx.restore()

    // If close to tower, add a berry glow
    if (close && !fx.reduceMotion) {
      ctx.strokeStyle = '#8e3044'
      ctx.lineWidth = 1 / scale
      ctx.beginPath()
      ctx.arc(t.x, t.y, t.radius + 2, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

// Deity selection screen — shows all deities in tiered roster with glyphs
// Tier 1 gods are available immediately; Tier 2-3 are locked until unlocked
export function DeitySelect({ onSelect, onKeyDown, unlockedTiers }) {
  const [hovered, setHovered] = useState(null)

  // unlockedTiers is a number (1, 2, or 3) indicating how many tiers the player has unlocked
  const tiers = [
    { num: 1, title: 'Domain Gods', gods: GODS_TIER_1, color: '#1f35c9' },
    { num: 2, title: 'Olympian Gods', gods: GODS_TIER_2, color: '#1f35c9' },
    { num: 3, title: 'Titans', gods: GODS_TIER_3, color: '#8e3044' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95">
      <div className="mx-4 max-w-md text-center">
        <h2 className="serif text-3xl mb-2">Choose Your Deity</h2>
        <p className="text-sm text-muted mb-6">
          Each deity grants their signature ability and faces monster waves
          from the opposing pantheon. Higher tiers unlock as you prove mastery.
        </p>
        {tiers.map((tier) => {
          const unlocked = (unlockedTiers || 1) >= tier.num
          return (
            <div key={tier.num} className="mb-6">
              <h3 className={`text-xs font-bold uppercase tracking-[0.08em] mb-2 ${
                unlocked ? 'text-cobalt' : 'text-muted'
              }`}>
                Tier {tier.num}: {tier.title}
                {tier.num > 1 && !unlocked && ' (Locked — survive all waves)'}
              </h3>
              <div className="grid grid-cols-7 gap-2">
                {tier.gods.map((god) => {
                  const locked = tier.num > 1 && !unlocked
                  return (
                    <button
                      key={god.key}
                      type="button"
                      aria-label={locked ? `Locked: ${god.name}` : `Select ${god.name} — ${god.abilityLabel}`}
                      disabled={locked}
                      className={`relative flex h-16 w-16 flex-col items-center justify-center rounded border-2 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        locked
                          ? 'border-line bg-card/50'
                          : hovered === god.key
                            ? 'border-cobalt bg-cobalt-soft scale-110'
                            : 'border-ink hover:border-cobalt'
                      }`}
                      onClick={() => {
                        if (!locked) onSelect(god.key)
                      }}
                      onMouseEnter={() => setHovered(god.key)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <span
                        className="block h-8 w-8"
                        aria-hidden="true"
                        style={{ color: god.color }}
                      >
                        {locked ? '🔒' : renderGlyph(god.glyph, god.color)}
                      </span>
                      <span className="text-xs">{god.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        <p className="text-xs text-muted">
          Click a deity, or press 1-7 for Tier 1. ESC to return to game.
        </p>
      </div>
    </div>
  )
}

// Render a glyph as an inline SVG element for React (used in DeitySelect)
function renderGlyph(glyph, color) {
  // These are simplified SVG versions of the Art.jsx glyphs
  // They use the same line-and-dot visual language
  const glyphs = {
    'winged-sandal': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <ellipse cx="32" cy="20" rx="12" ry="10" />
        <path d="M20 20 L16 4 L24 4" />
        <line x1="32" y1="10" x2="50" y2="4" />
        <line x1="20" y1="28" x2="44" y2="28" />
        <line x1="24" y1="34" x2="40" y2="34" />
      </svg>
    ),
    'owl-aegis': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2">
        <circle cx="32" cy="32" r="22" />
        <circle cx="32" cy="22" r="8" fill="none" />
        <circle cx="24" cy="18" r="2.5" fill={color} />
        <circle cx="40" cy="18" r="2.5" fill={color} />
        <path d="M26 36 Q32 44 38 36" />
        <line x1="26" y1="8" x2="22" y2="0" />
        <line x1="38" y1="8" x2="42" y2="0" />
      </svg>
    ),
    'helmet': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2.4">
        <path d="M20 28 L44 28 L40 52 L24 52 Z" />
        <path d="M24 12 L40 12 L34 20 L30 20 Z" />
      </svg>
    ),
    'key': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="3">
        <rect x="26" y="8" width="12" height="22" />
        <circle cx="32" cy="14" r="6" />
        <rect x="26" y="30" width="12" height="8" />
      </svg>
    ),
    'trident': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
        <line x1="32" y1="8" x2="32" y2="50" />
        <line x1="22" y1="12" x2="22" y2="30" />
        <line x1="42" y1="12" x2="42" y2="30" />
        <line x1="20" y1="20" x2="10" y2="8" />
        <line x1="44" y1="20" x2="54" y2="8" />
      </svg>
    ),
    // Monster glyphs
    'hydra': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="1.6">
        <ellipse cx="32" cy="34" rx="12" ry="7" />
        <circle cx="20" cy="28" r="4" />
        <circle cx="32" cy="22" r="4" />
        <circle cx="44" cy="28" r="4" />
      </svg>
    ),
    'cerberus': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2.4">
        <path d="M12 52 Q20 38 32 36 Q44 38 52 52" />
        <circle cx="20" cy="20" r="5" />
        <circle cx="32" cy="16" r="5" />
        <circle cx="44" cy="20" r="5" />
      </svg>
    ),
    'chronos': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2.4">
        <path d="M20 12 L44 12 L36 30 L44 48 L20 48 L28 30 Z" />
        <circle cx="32" cy="30" r="2" fill={color} />
      </svg>
    ),
    'apollo': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2">
        <line x1="20" y1="40" x2="44" y2="40" />
        <line x1="22" y1="40" x2="22" y2="20" />
        <line x1="28" y1="40" x2="28" y2="16" />
        <line x1="34" y1="40" x2="34" y2="16" />
        <line x1="40" y1="40" x2="40" y2="20" />
        <path d="M22 16 Q32 8 42 16" />
      </svg>
    ),
    'atlas': (
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={color} strokeWidth="2.2">
        <circle cx="32" cy="18" r="12" />
        <ellipse cx="32" cy="18" rx="12" ry="5" />
        <ellipse cx="32" cy="18" rx="5" ry="12" />
        <path d="M20 38 C22 34 42 34 44 38" />
        <line x1="20" y1="38" x2="14" y2="52" />
        <line x1="44" y1="38" x2="50" y2="52" />
      </svg>
    ),
  }
  return glyphs[glyph] || glyphs['hydra']
}

export default function ControlTowerShift() {
  const gameRef = useRef(null)
  if (gameRef.current === null) {
    const initialState = createInitialState()
    // Default deity: Apollo — player can change via deity select from pause menu
    gameRef.current = { ...initialState, god: 'apollo' }
    // Grant Apollo's signature ability (scoreMultiplier) as starting charge
    const god = GODS.find((d) => d.key === 'apollo')
    if (god) {
      gameRef.current = {
        ...gameRef.current,
        abilities: {
          ...gameRef.current.abilities,
          [god.ability]: { activeUntil: 0, cooldownUntil: 0 },
        },
      }
    }
  }
  const spawnerRef = useRef(null)
  if (spawnerRef.current === null) spawnerRef.current = createSpawner(Date.now() >>> 0)
  const fxRef = useRef({
    pulseAt: null,
    reduceMotion: prefersReducedMotion(typeof window === 'undefined' ? null : window),
  })
  const savedRef = useRef(false)
  const canvasRef = useRef(null)
  const keyRef = useRef('')
  const [hud, setHud] = useState(() => ({ g: gameRef.current }))
  const [showHelp, setShowHelp] = useState(false)
  const [showDeitySelect, setShowDeitySelect] = useState(false) // Start with Apollo selected
  const [selectedGod, setSelectedGod] = useState('apollo') // Default deity for new players

  const sync = useCallback(() => {
    const k = hudKey(gameRef.current)
    if (k !== keyRef.current) {
      keyRef.current = k
      setHud({ g: gameRef.current })
    }
  }, [])

  // Fixed-timestep loop: accumulate real time, step logic at LOGIC_HZ, draw
  // every frame. Simulation lives in refs so StrictMode's double-invoked
  // renders never step it twice.
  useEffect(() => {
    if (showDeitySelect) return // don't run the game loop during deity selection
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(performance.now()), 16))
    const caf = window.cancelAnimationFrame || clearTimeout
    let handle
    let last = performance.now()
    let acc = 0
    const stepMs = 1000 / LOGIC_HZ
    const frame = (now) => {
      acc = Math.min(acc + (now - last), 250) // clamp: background tabs don't fast-forward
      last = now
      const steps = Math.floor(acc / stepMs)
      if (steps > 0) {
        acc -= steps * stepMs
        gameRef.current = stepFrame(gameRef.current, spawnerRef.current, steps)
      }
      const g = gameRef.current
      if ((g.status === 'won' || g.status === 'failed') && !savedRef.current) {
        savedRef.current = true
        try {
          if (isHighScore(window.localStorage, g.score)) {
            saveHighScore(window.localStorage, { score: g.score, wave: g.wave, at: new Date().toISOString() })
          }
        } catch {
          /* storage unavailable: the run still ends normally */
        }
      }
      if (canvasRef.current) draw(canvasRef.current, g, fxRef.current)
      sync()
      handle = raf(frame)
    }
    handle = raf(frame)
    return () => caf(handle)
  }, [sync, showDeitySelect])

  // Match the backing store to the box the browser actually gives the canvas.
  // ResizeObserver rather than a resize listener: `w-full` changes with the
  // COLUMN, which a window resize is only one cause of.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const css = canvas.getBoundingClientRect().width
      if (!css) return // display:none or not laid out yet (jsdom): leave the buffer alone
      const px = backingSize(css, window.devicePixelRatio)
      if (canvas.width !== px) {
        canvas.width = px
        canvas.height = px
      }
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Keyboard play. The field was pointer-only, so the game was unplayable
  // without a mouse or a touchscreen while every surrounding control was
  // reachable by tab — the worst version of that gap, since it looks operable.
  // Enter/Space clears the threat NEAREST THE TOWER (the one that matters, and
  // the one a player would reach for), P pauses and resumes.
  useEffect(() => {
    if (showDeitySelect) return
    const onKey = (e) => {
      const g = gameRef.current
      if (e.key === 'p' || e.key === 'P') {
        gameRef.current = g.status === 'paused' ? resume(g) : pause(g)
        sync()
        e.preventDefault()
        return
      }
      if (e.key !== 'Enter' && e.key !== ' ') return
      if (g.status !== 'running') return
      const target = nearestThreatToTower(g)
      if (!target) return
      gameRef.current = clearThreat(g, target.id)
      sync()
      e.preventDefault()
    }
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('keydown', onKey)
    return () => canvas.removeEventListener('keydown', onKey)
  }, [sync, showDeitySelect])

  // Global keyboard handler for deity selection
  useEffect(() => {
    if (!showDeitySelect) return
    const onKey = (e) => {
      const key = e.key
      if (key === '1' || key === '2' || key === '3' || key === '4' || key === '5') {
        const god = GODS[Number(key) - 1]
        selectGod(god.key)
      }
      if (key === 'Escape') {
        setShowDeitySelect(false)
      }
    }
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('keydown', onKey)
    return () => canvas.removeEventListener('keydown', onKey)
  }, [showDeitySelect])

  // Select a deity — updates game state with the god choice and grants
  // their signature ability as a free starting charge.
  function selectGod(godKey) {
    const god = GODS.find((d) => d.key === godKey)
    if (!god) return
    setShowDeitySelect(false)
    gameRef.current = { ...gameRef.current, god: godKey }
    // Grant the god's signature ability as the first ability (with 0 cooldown)
    const abilityName = god.ability
    gameRef.current = {
      ...gameRef.current,
      abilities: {
        ...gameRef.current.abilities,
        [abilityName]: {
          activeUntil: 0,
          cooldownUntil: 0, // ready immediately
        },
      },
    }
    sync()
  }

  const onPointerDown = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * VIEW * 2 - VIEW
    const y = ((e.clientY - rect.top) / rect.height) * VIEW * 2 - VIEW
    const hit = threatAt(gameRef.current, x, y)
    if (hit) {
      gameRef.current = clearThreat(gameRef.current, hit.id)
      sync()
    }
  }

  const fire = (name) => {
    const before = gameRef.current
    gameRef.current = activateAbility(before, name)
    if (name === 'pulseClear' && gameRef.current !== before) fxRef.current.pulseAt = gameRef.current.tick
    sync()
  }

  const g = hud.g
  const running = g.status === 'running'
  const over = g.status === 'won' || g.status === 'failed'
  let scores = []
  if (over) {
    try {
      scores = loadHighScores(window.localStorage).slice(0, 5)
    } catch {
      scores = []
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 bg-paper px-4 py-6 text-ink">
      {/* Deity selection overlay */}
      {showDeitySelect && (
        <DeitySelect
          onSelect={selectGod}
          unlockedTiers={g.unlockedTier || 1}
        />
      )}

      <header className="flex items-end justify-between border-b border-line pb-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Control Tower</div>
          <h1 className="serif text-2xl leading-none">Shift</h1>
          {g.god && (
            <div className="text-xs text-muted">
              {GODS.find((d) => d.key === g.god)?.name} · {GODS.find((d) => d.key === g.god)?.domain}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Score</div>
            <div className="serif text-3xl leading-none tabular-nums" data-testid="score">{g.score}</div>
          </div>
          <button
            type="button"
            aria-expanded={showHelp}
            aria-controls="ctshift-help"
            onClick={() => setShowHelp((v) => !v)}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border-[1.5px] border-ink text-xs font-bold text-ink hover:bg-fill"
          >
            <span aria-hidden>?</span>
            <span className="sr-only">How to play</span>
          </button>
        </div>
      </header>

      {/* Token usage HUD — visible at all times */}
      <div className="border-y border-line px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted">
        <span data-testid="tokens">Tokens: {g.tokenUsage || 0} · </span>
        <span data-testid="tier">Tier 1 Deity: {GODS.find((d) => d.key === g.god)?.name || 'Apollo'} · </span>
        <span data-testid="waves-unlocked">Tiers 2–3 unlock on wave completion</span>
      </div>

      {showHelp && (
        <div
          id="ctshift-help"
          className="border-[1.5px] border-ink bg-card p-4 text-xs leading-relaxed text-ink"
        >
          <p className="mb-2">
            Tap a threat to clear it — or focus the play field and press{' '}
            <span className="font-bold">Enter</span> or <span className="font-bold">Space</span> to clear
            the threat nearest the tower. Press <span className="font-bold">P</span> to pause. Survive
            every wave to hold the shift; lose all integrity and the shift fails.
          </p>
          {g.god && (
            <p className="mb-2">
              As <strong>{GODS.find((d) => d.key === g.god)?.name}</strong>, your signature ability —{' '}
              <strong>{GODS.find((d) => d.key === g.god)?.abilityLabel}</strong> — is ready. The remaining
              abilities unlock as you demonstrate mastery.
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {ABILITY_ORDER.map((name) => (
              <div key={name} className="contents">
                <dt className="font-bold">{ABILITY_LABEL[name]}</dt>
                <dd className="text-muted">{ABILITY_HELP[name]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em]">
        <span data-testid="wave">Wave {g.wave}{g.config.finalWave ? ` / ${g.config.finalWave}` : ''}</span>
        <span data-testid="integrity" className={g.integrity <= 40 ? 'text-berry' : ''}>
          Integrity {g.integrity} / {g.config.maxIntegrity}
        </span>
        <span data-testid="status">
          {g.status === 'paused' ? 'Paused' : abilityActive(g, 'shield') ? 'Shield up' : running ? 'On duty' : g.status === 'won' ? 'Shift held' : 'Tower down'}
        </span>
      </div>

      <div className="relative border-[1.5px] border-ink">
        <canvas
          ref={canvasRef}
          width={560}
          height={560}
          tabIndex={0}
          role="application"
          className="block w-full touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2"
          onPointerDown={running ? onPointerDown : undefined}
          aria-label="Play field. Tap a threat to clear it, or press Enter to clear the threat nearest the tower. Press P to pause."
        />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/90 p-6 text-center">
            <div className="serif text-3xl">
              {g.status === 'paused' ? 'Paused' : g.status === 'won' ? 'Shift held.' : 'Tower down.'}
            </div>
            {over && (
              <div className="text-sm text-muted">
                Final score <span className="serif text-lg text-ink tabular-nums">{g.score}</span> · wave {g.wave}
              </div>
            )}
            {over && scores.length > 0 && (
              <ol className="w-40 text-left text-xs text-muted">
                {scores.map((s2, i) => (
                  <li key={i} className="flex justify-between border-b border-line py-0.5">
                    <span>{i + 1}.</span>
                    <span className="tabular-nums text-ink">{s2.score}</span>
                  </li>
                ))}
              </ol>
            )}
            {g.status === 'paused' ? (
              <div className="flex flex-col gap-2">
                <button
                  className="min-h-11 bg-cobalt px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-oncobalt hover:bg-cobalt-ink"
                  onClick={() => {
                    gameRef.current = resume(gameRef.current)
                    sync()
                  }}
                >
                  Resume
                </button>
                <button
                  className="min-h-11 border border-ink px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-ink hover:bg-fill"
                  onClick={() => setShowDeitySelect(true)}
                >
                  Choose Deity
                </button>
              </div>
            ) : (
              <button
                className="min-h-11 bg-cobalt px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-oncobalt hover:bg-cobalt-ink"
                onClick={() => {
                  gameRef.current = restart(gameRef.current)
                  spawnerRef.current = createSpawner(Date.now() >>> 0)
                  savedRef.current = false
                  fxRef.current.pulseAt = null
                  setShowDeitySelect(true)
                  sync()
                }}
              >
                New shift
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Abilities">
        {ABILITY_ORDER.map((name) => {
          const active = abilityActive(g, name)
          const ready = abilityReady(g, name)
          const a = g.abilities[name]
          const cd = a && !ready ? Math.ceil((a.cooldownUntil - g.tick) / LOGIC_HZ) : 0
          // Show the god's glyph for each ability button instead of the geometric mark
          const godGlyph = ABILITY_GLYPHS[name]
          return (
            <button
              key={name}
              onClick={() => fire(name)}
              disabled={!running || !ready}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 border-[1.5px] px-1 py-2 text-[10px] font-bold uppercase tracking-[0.08em] transition disabled:opacity-40 ${
                active ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-ink text-ink hover:bg-fill'
              }`}
            >
              {/* Text mark — the accessible, test-asserted glyph (first span) */}
              <span
                className="serif text-lg leading-none"
                aria-hidden="true"
                style={{ color: active ? '#1f35c9' : 'currentColor' }}
              >
                {ABILITY_MARK[name]}
              </span>
              <span className="sr-only">
                {ABILITY_LABEL[name]} {active ? 'active' : ready ? 'ready' : `cooldown ${cd}s`}
              </span>
              <span>{ABILITY_LABEL[name]}</span>
              <span className="text-muted normal-case tracking-normal">
                {active ? 'active' : ready ? 'ready' : `${cd}s`}
              </span>
              <span
                className="absolute inset-0 flex items-center justify-center opacity-0"
                aria-hidden="true"
              >
                {renderGlyph(godGlyph, active ? '#1f35c9' : '#121210')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between border-t border-line pt-3">
        {!showDeitySelect && (
          <>
            <button
              className="min-h-11 text-xs font-bold uppercase tracking-[0.13em] text-muted hover:text-ink disabled:opacity-40"
              disabled={!running}
              onClick={() => {
                gameRef.current = pause(gameRef.current)
                sync()
              }}
            >
              Pause
            </button>
          </>
        )}
        {/* Discoverable, or the keyboard path is a secret: a capability nobody
            can find is not far from one that isn't there. */}
        <span className="self-center text-[10px] uppercase tracking-[0.08em] text-muted">
          {showDeitySelect ? 'Press 1-5 to choose a deity' : 'Enter clears · P pauses'}
        </span>
        <a
          href="#"
          className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.13em] text-cobalt hover:text-cobalt-ink"
        >
          Back to OmniFuel
        </a>
      </div>
    </div>
  )
}
