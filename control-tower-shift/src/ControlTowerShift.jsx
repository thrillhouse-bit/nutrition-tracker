// Control Tower Shift — Hades-style arena combat.
// The player controls a deity that moves around the arena and fights waves
// of monsters. Each deity from the tiered roster grants a signature ability.
//
// Styled to the Fueling Intelligence system: dark control-room surface,
// restrained electric blue accents, crisp typography, data-like motion.
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createInitialState,
  setInput,
  deityAttack, castAbility,
  pause, resume, restart,
  saveHighScore, loadHighScores, isHighScore,
  drawGlyph, GODS, GODS_BY_TIER, ABILITY_GLYPHS,
  FIELD_RADIUS, createSpawner,
} from './game/index.js'
import { stepFrame, threatAt } from './loop.js'

const TICK_RATE = 30 // 30 Hz game logic

// Ability ordering for the HUD
const ABILITY_ORDER = ['shield', 'pulseClear', 'speedBurst', 'scoreMultiplier', 'repair']

// Geometric marks for ability buttons (accessible, test-asserted)
const ABILITY_MARK = {
  shield: '▢',
  pulseClear: '◎',
  speedBurst: '»',
  scoreMultiplier: '×2',
  repair: '+',
}

// Human-readable labels for each ability
const ABILITY_LABEL = {
  shield: 'Shield',
  pulseClear: 'Pulse',
  speedBurst: 'Burst',
  scoreMultiplier: 'Score',
  repair: 'Repair',
}

const ABILITY_HELP = {
  shield: 'Blocks incoming damage for a short duration.',
  pulseClear: 'Clears all nearby threats in a wide radius for half points.',
  speedBurst: 'Doubles your movement speed for a short duration.',
  scoreMultiplier: 'Doubles score from all threat clears for a short time.',
  repair: 'Restores a portion of your health immediately.',
}

const VIEW = FIELD_RADIUS + 30
const LOGOFF = { x: 0, y: 0 } // arena center for reference

function hudKey(g) {
  const cds = ABILITY_ORDER.map((n) => {
    const a = g.abilities[n]
    const cd = a ? Math.max(0, a.cooldownUntil - g.tick) : 0
    return `${a && g.tick < a.activeUntil ? 'A' : ''}${Math.ceil(cd / TICK_RATE)}`
  }).join('|')
  return `${g.god || 'none'}:${g.status}:${g.score}:${g.wave}:${g.deity?.health || 0}:${cds}`
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

// Draw a glyph at the given canvas position
function drawGlyphSafe(ctx, glyph, x, y, size, color = '#121210') {
  try {
    drawGlyph(ctx, glyph, x, y, size)
  } catch {
    // Fallback to simple circle
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function draw(ctx, g, fx) {
  const ctx2d = ctx
  if (!ctx2d || !ctx2d.canvas || !ctx2d.canvas.width) return
  const w = ctx2d.canvas.width
  const cfg = g.config
  const scale = w / (VIEW * 2)

  ctx2d.setTransform(1, 0, 0, 1, 0, 0)
  ctx2d.fillStyle = '#121210'
  ctx2d.fillRect(0, 0, w, w)
  ctx2d.setTransform(scale, 0, 0, scale, w / 2, w / 2)

  // Range rings
  ctx2d.strokeStyle = 'rgba(31,53,196,0.12)'
  ctx2d.lineWidth = 1 / scale
  for (const r of [cfg.arenaRadius * 0.33, cfg.arenaRadius * 0.66, cfg.arenaRadius]) {
    ctx2d.beginPath()
    ctx2d.arc(0, 0, r, 0, Math.PI * 2)
    ctx2d.stroke()
  }

  // ── 1. Draw projectiles ──
  for (const p of g.projectiles) {
    ctx2d.save()
    ctx2d.translate(p.x, p.y)
    ctx2d.strokeStyle = '#1f35c9'
    ctx2d.fillStyle = '#1f35c9'
    ctx2d.lineWidth = 2 / scale
    ctx2d.beginPath()
    ctx2d.arc(0, 0, p.radius, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.stroke()
    ctx2d.restore()
  }

  // ── 2. Draw deity ──
  const d = g.deity
  ctx2d.save()
  ctx2d.translate(d.x, d.y)
  ctx2d.strokeStyle = '#1f35c2'
  ctx2d.fillStyle = '#121210'
  ctx2d.lineWidth = 3 / scale
  ctx2d.beginPath()
  ctx2d.arc(0, 0, cfg.deityRadius, 0, Math.PI * 2)
  ctx2d.fill()
  ctx2d.stroke()

  // Draw deity glyph
  const godDef = GODS.find((gd) => gd.key === g.god)
  if (godDef) {
    ctx2d.save()
    ctx2d.translate(0, 0)
    drawGlyphSafe(ctx2d, godDef.glyph, 0, 0, cfg.deityRadius * 2.2, '#1f35c9')
    ctx2d.restore()
  }
  ctx2d.restore()

  // Health bar above deity
  if (d.health < d.maxHealth) {
    ctx2d.save()
    ctx2d.translate(d.x, d.y - cfg.deityRadius - 12)
    ctx2d.fillStyle = 'rgba(18,18,16,0.5)'
    ctx2d.fillRect(-20, 0, 40, 4)
    const hpW = (d.health / d.maxHealth) * 40
    ctx2d.fillStyle = '#1f35c2'
    ctx2d.fillRect(-20, 0, hpW, 4)
    ctx2d.restore()
  }

  // Shield effect
  if (g.abilities.shield && g.tick < g.abilities.shield.activeUntil) {
    ctx2d.strokeStyle = '#dce6d7'
    ctx2d.lineWidth = 4 / scale
    ctx2d.beginPath()
    ctx2d.arc(d.x, d.y, cfg.deityRadius + 10, 0, Math.PI * 2)
    ctx2d.stroke()
  }

  // Speed burst effect
  if (g.abilities.speedBurst && g.tick < g.abilities.speedBurst.activeUntil) {
    ctx2d.strokeStyle = '#1f35c9'
    ctx2d.lineWidth = 2 / scale
    ctx2d.setLineDash([5 / scale, 5 / scale])
    ctx2d.beginPath()
    ctx2d.arc(d.x, d.y, cfg.deityRadius + 20, 0, Math.PI * 2)
    ctx2d.stroke()
    ctx2d.setLineDash([])
  }

  // ── 3. Draw threats (monsters) ──
  for (const t of g.threats) {
    ctx2d.save()
    ctx2d.translate(t.x, t.y)
    // Health bar for threats
    if (t.health < t.maxHealth) {
      ctx2d.fillStyle = 'rgba(18,18,16,0.5)'
      ctx2d.fillRect(-t.radius - 1, -t.radius - 8, (t.radius + 1) * 2, 3)
      const hpW = (t.health / t.maxHealth) * (t.radius + 1) * 2
      ctx2d.fillStyle = '#8e3044'
      ctx2d.fillRect(-(t.radius + 1), -t.radius - 8, hpW, 3)
    }
    // Monster glyph
    drawGlyphSafe(ctx2d, t.glyph || 'hydra', 0, 0, t.radius * 2, '#8e3044')
    ctx2d.restore()
  }
}

// ─── Deity Selection Screen ────────────────────────────────────
export function DeitySelect({ onSelect, unlockedTiers }) {
  const [hovered, setHovered] = useState(null)
  const tiers = [
    { num: 1, title: 'Domain Gods', gods: GODS_BY_TIER[1], color: '#1f35c9' },
    { num: 2, title: 'Olympian Gods', gods: GODS_BY_TIER[2], color: '#1f35c9' },
    { num: 3, title: 'Titans', gods: GODS_BY_TIER[3], color: '#8e3044' },
  ]

  const tierKeys = [1, 2, 3]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95">
      <div className="mx-4 max-w-md text-center">
        <h2 className="serif text-3xl mb-2">Choose Your Deity</h2>
        <p className="text-sm text-muted mb-6">
          Each deity grants their signature ability and fights monster waves
          from the opposing pantheon. Higher tiers unlock as you prove mastery.
        </p>
        {tierKeys.map((tierNum) => {
          const tier = tiers.find((t) => t.num === tierNum)
          if (!tier) return null
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
                      onMouseEnter={(e) => setHovered(god.key)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <span
                        className="block h-8 w-8"
                        aria-hidden="true"
                        style={{ color: god.color }}
                      >
                        {locked ? '🔒' : (
                          <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke={god.color} strokeWidth="2">
                            <circle cx="32" cy="32" r="12" />
                            <path d={godGlyphPath(god.glyph)} />
                          </svg>
                        )}
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
          Click a deity. ESC to dismiss (default: Apollo).
        </p>
      </div>
    </div>
  )
}

// Simplified glyph SVG path for selection screen
function godGlyphPath(glyph) {
  const paths = {
    'winged-sandal': 'M20 20 L16 4 L24 4 M32 10 L50 4 M20 34 L44 34',
    'owl-aegis': 'M32 22 A8 8 0 1 1 32 22 M24 18 A2.5 2.5 0 1 1 24 18',
    'helmet': 'M20 34 L44 34 L40 58 L24 58 Z M28 20 L36 20',
    'lyre': 'M20 46 L44 46 M22 46 L22 26 M28 46 L28 22 M34 46 L34 22',
    'bow': 'M32 20 C44 10 48 28 32 36 C16 28 20 10 32 20 Z',
    'dove-rose': 'M32 36 A10 7 0 1 1 32 36 M20 36 A8 7 0 1 1 20 36',
    'club': 'M32 16 C24 18 16 28 24 38 C16 38 8 44 16 52 C24 58 36 52 40 40',
    'lightning': 'M26 -24 L38 -6 L32 4 L44 24 L28 10 L24 24 Z',
    'scepter': 'M32 -20 L32 10 M28 -22 L36 -22 M26 10 L38 10',
    'trident': 'M32 8 L32 50 M22 12 L22 30 M42 12 L42 30 M20 20 L10 8 M44 20 L54 8',
    'pomegranate': 'M20 -6 A10 10 0 1 1 44 -6 A10 10 0 1 1 20 -6 Z',
    'thyrsus': 'M32 -20 L32 -6 M28 -8 L36 -8 M30 -20 L34 -20',
    'wheat': 'M32 -20 L32 10 M26 -16 L38 -16 M28 -18 L36 -18',
    'scythe': 'M26 -16 L42 -16 L38 0 L26 0 Z M34 -20 L38 8',
    'sun-chariot': 'M12 6 A18 18 0 1 1 52 6 A18 18 0 1 1 12 6 Z',
    'crescent': 'M20 0 A14 14 0 0 1 44 0 A10 10 0 0 0 32 0 A14 14 0 0 1 20 0',
    'flame': 'M32 -20 C42 -14 48 -4 38 10 C46 8 40 16 32 10 C26 16 18 8 26 10 C16 -4 22 -14 32 -20 Z',
    'star-veil': 'M14 0 A18 18 0 1 1 50 0 A18 18 0 1 1 14 0 Z M32 -18 L32 0 M32 0 L28 -4 M32 0 L36 -4',
    'arrow-heart': 'M32 -18 L32 10 M26 -22 L38 -22 M28 -26 L36 -26',
    'atlas-sphere': 'M20 -6 A12 12 0 1 1 44 -6 A12 12 0 1 1 20 -6 Z',
  }
  return paths[glyph] || paths['lyre']
}

// ─── Main Component ─────────────────────────────────────────────
export default function ControlTowerShift() {
  const gameRef = useRef(null)
  if (gameRef.current === null) {
    const initialState = createInitialState()
    gameRef.current = { ...initialState, god: 'apollo' }
  }
  const spawnerRef = useRef(null)
  if (spawnerRef.current === null) {
    spawnerRef.current = createSpawner(Date.now() >>> 0)
  }
  const fxRef = useRef({ pulseAt: null, reduceMotion: false })
  const savedRef = useRef(false)
  const canvasRef = useRef(null)
  const keyRef = useRef('')
  const [hud, setHud] = useState(() => ({ g: gameRef.current }))
  const [showHelp, setShowHelp] = useState(false)
  const [showDeitySelect, setShowDeitySelect] = useState(false)

  const sync = useCallback(() => {
    const k = hudKey(gameRef.current)
    if (k !== keyRef.current) {
      keyRef.current = k
      setHud({ g: gameRef.current })
    }
  }, [])

  // Fixed-timestep loop: accumulate real time, step logic at TICK_RATE Hz
  useEffect(() => {
    if (showDeitySelect) return // pause during deity selection
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(performance.now()), 16))
    const caf = window.cancelAnimationFrame || clearTimeout
    let handle
    let last = performance.now()
    let acc = 0

    const stepMs = 1000 / TICK_RATE
    const frame = (now) => {
      acc = Math.min(acc + (now - last), 250)
      last = now
      const steps = Math.floor(acc / stepMs)
      if (steps > 0) {
        acc -= steps * stepMs
        for (let i = 0; i < steps; i++) {
          // stepFrame handles spawning + advancing game logic in one pass
          gameRef.current = stepFrame(gameRef.current, spawnerRef.current, 1)
          // Auto-attack if a monster is in range and cooldown is ready
          gameRef.current = autoAttackCheck(gameRef.current)
        }
      }
      const g = gameRef.current
      if ((g.status === 'won' || g.status === 'failed') && !savedRef.current) {
        savedRef.current = true
        try {
          if (isHighScore(window.localStorage, g.score)) {
            saveHighScore(window.localStorage, { score: g.score, wave: g.wave, at: new Date().toISOString() })
          }
        } catch { /* storage unavailable */ }
      }
      if (canvasRef.current) {
        const ctx2d = canvasRef.current.getContext('2d')
        if (ctx2d) draw(ctx2d, g, fxRef.current)
      }
      sync()
      handle = raf(frame)
    }
    handle = raf(frame)
    return () => caf(handle)
  }, [sync, showDeitySelect])

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const css = canvas.getBoundingClientRect().width
      if (!css) return
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

  // Touch/mouse movement: track pointer position and set movement input
  const onPointerMove = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * VIEW * 2 - VIEW
    const y = ((e.clientY - rect.top) / rect.height) * VIEW * 2 - VIEW
    // Set movement input toward pointer direction with constant speed
    const dx = x - gameRef.current.deity.x
    const dy = y - gameRef.current.deity.y
    const dist = Math.hypot(dx, dy)
    if (dist > 20) {
      gameRef.current = setInput(gameRef.current, dx / dist, dy / dist)
    } else {
      gameRef.current = setInput(gameRef.current, 0, 0)
    }
    sync()
  }, [sync])

  // Touch/mouse click: cast ability toward click position
  const onPointerDown = useCallback((e) => {
    const g = gameRef.current
    if (g.status !== 'running') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * VIEW * 2 - VIEW
    const y = ((e.clientY - rect.top) / rect.height) * VIEW * 2 - VIEW
    // If clicked on a threat, try to attack it
    const threat = threatAt(g, x, y)
    if (threat) {
      gameRef.current = castAbility(g, 'pulseClear', x, y)
    } else {
      // Otherwise, start moving toward click
      const dx = x - g.deity.x
      const dy = y - g.deity.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0) {
        gameRef.current = setInput(g, dx / dist, dy / dist)
      }
    }
    sync()
  }, [sync])

  // Keyboard movement: WASD / arrows
  useEffect(() => {
    if (showDeitySelect) return
    const keys = new Set()
    const handleDown = (e) => {
      if (g.status !== 'running') return
      keys.add(e.key.toLowerCase())
      updateMovement()
      e.preventDefault()
    }
    const handleUp = (e) => {
      keys.delete(e.key.toLowerCase())
      updateMovement()
      e.preventDefault()
    }

    let mx = 0, my = 0
    function updateMovement() {
      mx = 0; my = 0
      if (keys.has('w') || keys.has('arrowup')) my -= 1
      if (keys.has('s') || keys.has('arrowdown')) my += 1
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1
      if (keys.has('d') || keys.has('arrowright')) mx += 1
      const mag = Math.hypot(mx, my)
      if (mag > 0) { mx /= mag; my /= mag }
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
      // Enter = auto-attack nearest threat
      if (key === 'Enter' && g.status === 'running') {
        gameRef.current = deityAttack(gameRef.current)
        sync()
        e.preventDefault()
        return
      }
      if (!g.abilities || Object.keys(g.abilities).length === 0) return
      // Number keys for abilities
      const abilityMap = { '1': 'shield', '2': 'pulseClear', '3': 'speedBurst', '4': 'scoreMultiplier', '5': 'repair' }
      if (abilityMap[key]) {
        const name = abilityMap[key]
        gameRef.current = castAbility(g, name, 0, 0)
        sync()
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
  }, [sync, showDeitySelect])

  // Handle pointer move on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onPointerMove, onPointerDown])

  function selectGod(godKey) {
    setShowDeitySelect(false)
    const god = GODS.find((d) => d.key === godKey)
    if (!god) return
    gameRef.current = { ...gameRef.current, god: godKey }
    gameRef.current = {
      ...gameRef.current,
      abilities: {
        ...gameRef.current.abilities,
        [god.ability]: { activeUntil: 0, cooldownUntil: g.tick || 0 },
      },
    }
    sync()
  }

  function autoAttackCheck(g) {
    // Auto-attack when a monster is in range
    const cfg = g.config
    const range = cfg.deityRadius + cfg.autoAttackRange
    const target = g.threats.find((t) => {
      const d = Math.hypot(t.x - g.deity.x, t.y - g.deity.y)
      return d < range + t.radius
    })
    if (!target) return g
    if (g.tick >= (g.nextAutoAttack || 0)) {
      return deityAttack(g)
    }
    return g
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
        <DeitySelect onSelect={selectGod} unlockedTiers={g.unlockedTier || 1} />
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

      {/* Token usage HUD — always visible */}
      <div className="border-y border-line px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted">
        <span data-testid="tokens">Tokens: {g.tokenUsage || 0} · </span>
        <span data-testid="tier">Tier 1 Deity: {GODS.find((d) => d.key === g.god)?.name || 'Apollo'} · </span>
        <span data-testid="health">Health: {g.deity?.health || 0}/{g.deity?.maxHealth || 0} · </span>
        <span data-testid="waves-unlocked">Tiers 2-3 unlock on wave completion</span>
      </div>

      {showHelp && (
        <div
          id="ctshift-help"
          className="border-[1.5px] border-ink bg-card p-4 text-xs leading-relaxed text-ink"
        >
          <p className="mb-2">
            Move your deity with WASD / arrow keys or by pointing at the play field.
            Click threats to attack them. Press{' '}
            <span className="font-bold">Enter</span> or <span className="font-bold">Space</span> to auto-attack
            the nearest threat. Press <span className="font-bold">P</span> to pause.
            Survive every wave to hold the shift; lose all health and the shift fails.
          </p>
          {g.god && (
            <p className="mb-2">
              As <strong>{GODS.find((d) => d.key === g.god)?.name}</strong>, your signature ability —{' '}
              <strong>{GODS.find((d) => d.key === g.god)?.abilityLabel}</strong> — is ready.
              The remaining abilities unlock as you demonstrate mastery.
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
        <span data-testid="integrity" className={g.deity?.health <= 40 ? 'text-berry' : ''}>
          Health {g.deity?.health || 0} / {g.deity?.maxHealth || 0}
        </span>
        <span data-testid="status">
          {g.status === 'paused' ? 'Paused' : running ? 'On duty' : g.status === 'won' ? 'Shift held' : 'Tower down'}
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
          onPointerMove={running ? onPointerMove : undefined}
          onPointerDown={running ? onPointerDown : undefined}
          aria-label="Arena. Point to move your deity. Click threats to attack. Press P to pause, 1-5 for abilities."
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
          const active = g.abilities[name] && g.tick < g.abilities[name].activeUntil
          const ready = !g.abilities[name] || g.tick >= g.abilities[name].cooldownUntil
          const a = g.abilities[name]
          const cd = a && !ready ? Math.ceil((a.cooldownUntil - g.tick) / TICK_RATE) : 0
          const godGlyph = ABILITY_GLYPHS[name]
          return (
            <button
              key={name}
              onClick={() => {
                if (running && ready) {
                  gameRef.current = castAbility(gameRef.current, name, 0, 0)
                  sync()
                }
              }}
              disabled={!running || !ready}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 border-[1.5px] px-1 py-2 text-[10px] font-bold uppercase tracking-[0.08em] transition disabled:opacity-40 ${
                active ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-ink text-ink hover:bg-fill'
              }`}
            >
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
        <span className="self-center text-[10px] uppercase tracking-[0.08em] text-muted">
          {showDeitySelect ? 'Select a deity (ESC to dismiss)' : 'WASD to move · Enter attacks · P pauses · 1-5 abilities'}
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
