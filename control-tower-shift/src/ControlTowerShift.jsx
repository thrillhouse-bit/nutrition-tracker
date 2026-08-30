// Control Tower Shift — render layer. All game truth lives in the pure core
// (./game); this file owns the loop, the canvas, and the HUD. Styled to the
// Fueling Intelligence system per ASSET-AUDIT.md: paper ground, ink lines,
// cobalt as the one accent, status shown by SHAPE + WORD, Bodoni numerals.
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
import { stepFrame, threatAt, LOGIC_HZ } from './loop.js'

const ABILITY_ORDER = ['shield', 'pulseClear', 'speedBurst', 'scoreMultiplier', 'repair']
const ABILITY_LABEL = {
  shield: 'Shield',
  pulseClear: 'Pulse',
  speedBurst: 'Burst',
  scoreMultiplier: '×2 Score',
  repair: 'Repair',
}
// Geometric marks per the asset audit — no sprite art exists in this repo.
const ABILITY_MARK = {
  shield: '▢',
  pulseClear: '◎',
  speedBurst: '»',
  scoreMultiplier: '×2',
  repair: '+',
}

const VIEW = FIELD_RADIUS + 20 // logical half-extent drawn on the canvas

function hudKey(g) {
  const cds = ABILITY_ORDER.map((n) => {
    const a = g.abilities[n]
    const cd = a ? Math.max(0, a.cooldownUntil - g.tick) : 0
    return `${abilityActive(g, n) ? 'A' : ''}${Math.ceil(cd / LOGIC_HZ)}`
  }).join('|')
  return `${g.status}:${g.score}:${g.wave}:${g.integrity}:${cds}`
}

function draw(canvas, g, fx) {
  const ctx = canvas.getContext && canvas.getContext('2d')
  if (!ctx) return // jsdom / lost context: the HUD still carries the state
  const w = canvas.width
  const scale = w / (VIEW * 2)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#f7f4ec'
  ctx.fillRect(0, 0, w, w)
  ctx.setTransform(scale, 0, 0, scale, w / 2, w / 2)

  // Range rings — hairline ink, the design's line language.
  ctx.strokeStyle = 'rgba(18,18,16,0.16)'
  ctx.lineWidth = 1 / scale
  for (const r of [FIELD_RADIUS, FIELD_RADIUS * 0.66, FIELD_RADIUS * 0.33]) {
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Pulse flash: an expanding hairline circle for a few ticks after firing.
  if (fx.pulseAt != null && g.tick - fx.pulseAt < 15) {
    const p = (g.tick - fx.pulseAt) / 15
    ctx.strokeStyle = `rgba(31,53,196,${1 - p})`
    ctx.lineWidth = 2 / scale
    ctx.beginPath()
    ctx.arc(0, 0, g.config.abilities.pulseClear.radius * p, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Tower: cobalt circle footprint + ink square (audit's chosen geometry).
  ctx.strokeStyle = '#1f35c4'
  ctx.lineWidth = 2 / scale
  ctx.beginPath()
  ctx.arc(0, 0, g.config.towerRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#121210'
  const s = g.config.towerRadius * 0.8
  ctx.fillRect(-s / 2, -s / 2, s, s)

  // Shield: mist ring, drawn only while genuinely active (word lives in HUD).
  if (abilityActive(g, 'shield')) {
    ctx.strokeStyle = '#dce6d7'
    ctx.lineWidth = 5 / scale
    ctx.beginPath()
    ctx.arc(0, 0, g.config.towerRadius + 8, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Threats: ink triangles pointing along velocity; berry once close in.
  for (const t of g.threats) {
    const close = Math.hypot(t.x, t.y) < FIELD_RADIUS * 0.33
    ctx.fillStyle = close ? '#8e3044' : '#121210'
    const a = Math.atan2(t.vy, t.vx)
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(t.radius, 0)
    ctx.lineTo(-t.radius * 0.8, t.radius * 0.7)
    ctx.lineTo(-t.radius * 0.8, -t.radius * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

export default function ControlTowerShift() {
  const gameRef = useRef(null)
  if (gameRef.current === null) gameRef.current = createInitialState()
  const spawnerRef = useRef(null)
  if (spawnerRef.current === null) spawnerRef.current = createSpawner(Date.now() >>> 0)
  const fxRef = useRef({ pulseAt: null })
  const savedRef = useRef(false)
  const canvasRef = useRef(null)
  const keyRef = useRef('')
  const [hud, setHud] = useState(() => ({ g: gameRef.current }))

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
          // isHighScore is the gate the persistence module already carries (and
          // tests): a 0-score run never qualifies, even on an empty board.
          // Writing unconditionally let ten unplayed shifts fill the top ten
          // with zeros and render them as the standing record.
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
  }, [sync])

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
      <header className="flex items-end justify-between border-b border-line pb-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Control Tower</div>
          <h1 className="serif text-2xl leading-none">Shift</h1>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Score</div>
          <div className="serif text-3xl leading-none tabular-nums" data-testid="score">{g.score}</div>
        </div>
      </header>

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
          className="block w-full touch-none"
          onPointerDown={running ? onPointerDown : undefined}
          aria-label="Play field — tap a threat to clear it"
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
              <button
                className="bg-cobalt px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-oncobalt hover:bg-cobalt-ink"
                onClick={() => {
                  gameRef.current = resume(gameRef.current)
                  sync()
                }}
              >
                Resume
              </button>
            ) : (
              <button
                className="bg-cobalt px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-oncobalt hover:bg-cobalt-ink"
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
          const active = abilityActive(g, name)
          const ready = abilityReady(g, name)
          const a = g.abilities[name]
          const cd = a && !ready ? Math.ceil((a.cooldownUntil - g.tick) / LOGIC_HZ) : 0
          return (
            <button
              key={name}
              onClick={() => fire(name)}
              disabled={!running || !ready}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 border-[1.5px] px-1 py-2 text-[10px] font-bold uppercase tracking-[0.08em] transition disabled:opacity-40 ${
                active ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-ink text-ink hover:bg-fill'
              }`}
            >
              <span aria-hidden className="serif text-lg leading-none">{ABILITY_MARK[name]}</span>
              <span>{ABILITY_LABEL[name]}</span>
              <span className="text-muted normal-case tracking-normal">
                {active ? 'active' : ready ? 'ready' : `${cd}s`}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between border-t border-line pt-3">
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
