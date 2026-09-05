// @vitest-environment jsdom
//
// Render-layer tests for Control Tower Shift (arena campaign slice), mirroring
// the repo's jsdom + raw react-dom idiom. The canvas draws nothing under jsdom
// (getContext is null) — by design the HUD carries every state assertion.
// House rule: each gate gets a firing AND a non-firing test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const { default: ControlTowerShift, backingSize, prefersReducedMotion } =
  await import('../src/ControlTowerShift.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The tests own the clock.
//
// The game loop runs on requestAnimationFrame. Left on the real one, it
// advances at whatever rate the machine happens to deliver frames, which made
// this file's timing a function of CPU load rather than of the game: the
// keyboard test below waited on wall-clock spawns and spent 3.0-4.8s of its
// 5s budget under a full `npm test` (measured 30 Aug 2026 over six runs), and
// it timed out outright on a loaded machine. That failure was never contained
// either — a timeout abandons an in-flight act(), after which every later
// render in the FILE produces nothing, so one slow spawn failed five sibling
// tests with it.
//
// So rAF is replaced by a pump that delivers frames only when asked, with the
// timestamps we choose. The component, its loop, its spawner and its handlers
// are all the real ones; the only thing the test takes over is WHEN a frame
// happens. Twenty logic ticks now cost 0ms of wall clock instead of 667ms,
// and nothing in here can be starved by a busy machine.
const FRAME_MS = 16 // ~60Hz, what a browser hands the loop
let pump
let restoreRaf

const installFramePump = () => {
  const realRaf = window.requestAnimationFrame
  const realCaf = window.cancelAnimationFrame
  let pending = new Map()
  let handle = 0
  let now = 0
  window.requestAnimationFrame = (cb) => {
    pending.set(++handle, cb)
    return handle
  }
  window.cancelAnimationFrame = (h) => pending.delete(h)
  restoreRaf = () => {
    window.requestAnimationFrame = realRaf
    window.cancelAnimationFrame = realCaf
  }
  // Deliver `frames` frames. Callbacks registered DURING a frame run on the
  // next one, exactly as a browser schedules a self-rescheduling loop.
  return (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      const due = [...pending.values()]
      pending.clear()
      now += FRAME_MS
      for (const cb of due) cb(now)
    }
  }
}

let container
let root

// Node 22 exposes an experimental global `localStorage` getter that resolves
// to undefined unless the process is launched with --localstorage-file. Vitest
// copies that value into jsdom, shadowing jsdom's own Storage implementation.
// Give this browser test an explicit, per-test store so game persistence is
// deterministic in local runs and the same Node 22 environment used by CI.
const installMemoryStorage = () => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => values.delete(String(key)),
      setItem: (key, value) => values.set(String(key), String(value)),
    },
  })
}

const makeCanvasContext = () => {
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return new Proxy({
    canvas: { width: 1280, height: 720 },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 0 }),
  }, {
    get(target, key) {
      return key in target ? target[key] : noop
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  })
}

const mount = async (el) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(el))
}

beforeEach(() => {
  installMemoryStorage()
  pump = installFramePump()
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = root = null
  restoreRaf() // after unmount, so the loop's cancelAnimationFrame is still ours
  window.location.hash = ''
  if (window.localStorage) window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('ControlTowerShift HUD', () => {
  it('mounts with Apollo, full health, level 1, score 0, on duty', async () => {
    await mount(<ControlTowerShift />)
    expect(container.querySelector('[data-testid="level"]')?.textContent).toContain('Level 1 / 3')
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
    expect(container.textContent).toContain('Apollo')
    expect(container.querySelector('[data-testid="health"]')?.textContent).toContain('100/100')
  })

  it('shows the level location and objective progress, never “Wave N/10”', async () => {
    await mount(<ControlTowerShift />)
    expect(container.querySelector('[data-testid="level"]')?.textContent).toContain('Level 1 / 3')
    expect(container.textContent).toContain('Acropolis')
    const objEl = container.querySelector('[data-testid="objective"]')?.textContent
    expect(objEl).toMatch(/Repel the serpent sentries/)
    expect(objEl).toContain('0 / 4')
    // No wave framing survives in player-facing copy.
    expect(container.textContent).not.toMatch(/Wave\s*\d+\s*\/\s*10/i)
  })

  it('renders exactly three primary powers, ready', async () => {
    await mount(<ControlTowerShift />)
    const group = container.querySelector('[role="group"]')
    const buttons = group.querySelectorAll('button')
    expect(buttons).toHaveLength(3)
    const names = [...buttons].map((b) => b.textContent.trim())
    expect(names.join(' ')).toContain('Solar Bow')
    expect(names.join(' ')).toContain('Radiant Burst')
    expect(names.join(' ')).toContain('Golden Lyre')
    for (const b of buttons) {
      expect(b.disabled).toBe(false)
      expect(b.textContent).toContain('ready')
    }
  })

  it('firing the solar bow marks it on cooldown and disables it', async () => {
    await mount(<ControlTowerShift />)
    const bow = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Solar Bow'),
    )
    await act(async () => bow.click())
    expect(bow.disabled).toBe(true)
    expect(bow.textContent).toMatch(/[0-9]+s/)
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })

  it('pause overlays and disables powers; resume restores duty', async () => {
    await mount(<ControlTowerShift />)
    const pauseBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pause')
    await act(async () => pauseBtn.click())
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('Paused')
    for (const b of container.querySelectorAll('[role="group"] button')) {
      expect(b.disabled).toBe(true)
    }
    const resumeBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Resume')
    await act(async () => resumeBtn.click())
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })

  it('a 0-score finished run is NOT written to the board', async () => {
    const { isHighScore, saveHighScore, loadHighScores } = await import('../src/game/index.js')
    const store = window.localStorage
    expect(isHighScore(store, 0)).toBe(false)
    if (isHighScore(store, 0)) saveHighScore(store, { score: 0, level: 1 })
    expect(loadHighScores(store)).toEqual([])
  })

  it('control: a scoring run IS written to the board', async () => {
    const { isHighScore, saveHighScore, loadHighScores } = await import('../src/game/index.js')
    const store = window.localStorage
    expect(isHighScore(store, 900)).toBe(true)
    if (isHighScore(store, 900)) saveHighScore(store, { score: 900, level: 3 })
    expect(loadHighScores(store).map((e) => e.score)).toEqual([900])
  })

  it('token usage HUD is visible and tracks a power use', async () => {
    await mount(<ControlTowerShift />)
    const tokensEl = container.querySelector('[data-testid="tokens"]')
    expect(tokensEl?.textContent).toContain('Tokens:')
    expect(tokensEl?.textContent).toContain('0')
    const bow = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Solar Bow'),
    )
    await act(async () => bow.click())
    expect(container.querySelector('[data-testid="tokens"]')?.textContent).toContain('1')
  })
})

describe('How to play panel', () => {
  it('is closed by default and opens/closes on the “?” toggle', async () => {
    await mount(<ControlTowerShift />)
    const toggle = container.querySelector('button[aria-expanded]')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#ctshift-help')).toBeNull()

    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const panel = container.querySelector('#ctshift-help')
    expect(panel).toBeTruthy()
    for (const label of ['Solar Bow', 'Radiant Burst', 'Golden Lyre']) {
      expect(panel.textContent).toContain(label)
    }

    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#ctshift-help')).toBeNull()
  })
})

describe('accessibility and input', () => {
  it('the play field is focusable and says how to play without a pointer', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    expect(canvas.getAttribute('tabindex')).toBe('0')
    const label = canvas.getAttribute('aria-label')
    expect(label).toMatch(/Enter/i)
    expect(label).toMatch(/P pauses/i)
  })

  it('P pauses and resumes from the keyboard', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    const status = () => container.querySelector('[data-testid="status"]')?.textContent
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }))
    })
    expect(status()).toBe('Paused')
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }))
    })
    expect(status()).toBe('On duty')
  })

  it('control: an unrelated key does nothing', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'q', bubbles: true }))
    })
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })

  it('no power button repeats its mark inside its own label', async () => {
    await mount(<ControlTowerShift />)
    for (const b of container.querySelectorAll('[role="group"] button')) {
      const mark = b.querySelector('span')?.textContent.trim()
      // The visible name is the third span (mark, sr-only, name, state, hint).
      const name = [...b.querySelectorAll('span')][2]?.textContent.trim()
      expect(name.includes(mark), `"${mark}" is repeated in "${name}"`).toBe(false)
    }
  })

  it('every control clears the 44px touch floor', async () => {
    await mount(<ControlTowerShift />)
    const pauseBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pause')
    await act(async () => pauseBtn.click())
    for (const b of container.querySelectorAll('button')) {
      expect(
        b.className.includes('min-h-11') || b.className.includes('min-h-16'),
        `"${b.textContent.trim()}" has no touch-target floor`,
      ).toBe(true)
    }
  })

  it('the backing store follows device pixel ratio, and is capped', () => {
    expect(backingSize(390, 1)).toBe(390)
    expect(backingSize(390, 2)).toBe(780)
    expect(backingSize(390, 3)).toBe(1170)
    expect(backingSize(390, 6)).toBe(1170)
  })

  it('reduced motion is read from the media query, both answers', () => {
    const win = (matches) => ({ matchMedia: (q) => ({ matches: q.includes('reduced-motion') && matches }) })
    expect(prefersReducedMotion(win(true))).toBe(true)
    expect(prefersReducedMotion(win(false))).toBe(false)
  })

  it('control: no matchMedia (or no window) is not reduced motion', () => {
    expect(prefersReducedMotion({})).toBe(false)
    expect(prefersReducedMotion(null)).toBe(false)
  })

  it('control: a missing or nonsense DPR falls back to 1:1, never 0', () => {
    expect(backingSize(390, undefined)).toBe(390)
    expect(backingSize(390, 0)).toBe(390)
    expect(backingSize(390, NaN)).toBe(390)
    expect(backingSize(0, 2)).toBe(1)
  })

  it('Enter key triggers a melee attempt without crashing (keyboard playable)', { timeout: 10000 }, async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })

  // jsdom must flush the real React/canvas updates for a full authored
  // encounter; allow that bounded harness work on a loaded full-suite worker.
  it('the mounted frame clock advances the authored encounter after its intro beat', { timeout: 15000 }, async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCanvasContext())
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    const score = () => Number(container.querySelector('[data-testid="score"]')?.textContent || 0)

    // Rendering ages the deliberate level card; simulation remains frozen
    // behind it, then the same rAF timestamps drive createFrameClock.
    await act(async () => pump(220))
    let frames = 0
    // Keep input cadence at one attack per simulated frame, but commit in
    // short batches. Flushing React 700 times makes this harness timing- and
    // machine-load-dependent; batching only changes observation cadence.
    while (score() === 0 && frames < 700) {
      await act(async () => {
        for (let i = 0; i < 20 && frames < 700; i++) {
          frames += 1
          pump(1)
          canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        }
      })
    }

    expect(score()).toBeGreaterThan(0)
    expect(frames).toBeLessThan(700)
  })

  it('control: Enter on an empty field scores nothing (not a free point)', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.querySelector('[data-testid="tokens"]')?.textContent).toContain('Tokens: 0')
  })

  it('keyboard power shortcuts cast powers and meter tokens', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    const tokens = () => container.querySelector('[data-testid="tokens"]')?.textContent
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(tokens()).toContain('Tokens: 1')
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true }))
    })
    expect(tokens()).toContain('Tokens: 2')
  })

  it('no browser-native alert/confirm/prompt is used', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true)
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => null)
    await mount(<ControlTowerShift />)
    const bow = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Solar Bow'),
    )
    await act(async () => bow.click())
    await act(async () => {
      const p = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pause')
      p.click()
    })
    expect(alertSpy).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('the first-time control hint is dismissible and does not obscure the arena', async () => {
    await mount(<ControlTowerShift />)
    const note = container.querySelector('[role="note"]')
    expect(note).toBeTruthy()
    const dismiss = container.querySelector('button[aria-label="Dismiss control hint"]')
    await act(async () => dismiss.click())
    expect(container.querySelector('[role="note"]')).toBeNull()
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })
})
