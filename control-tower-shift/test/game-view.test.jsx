// @vitest-environment jsdom
//
// Render-layer tests for Control Tower Shift, mirroring the repo's jsdom +
// raw react-dom idiom. The canvas draws nothing under jsdom (getContext is
// null) — by design the HUD carries every state assertion. House rule: each
// gate gets a firing AND a non-firing test.
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const { default: GameGate, GAME_HASH } = await import('../src/GameGate.jsx')
const { default: ControlTowerShift, backingSize, prefersReducedMotion } =
  await import('../src/ControlTowerShift.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const mount = async (el) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(el))
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = root = null
  window.location.hash = ''
  window.localStorage.clear()
})

describe('GameGate', () => {
  it('renders the app, not the game, without the hash', async () => {
    window.location.hash = ''
    await mount(<GameGate app={<div data-testid="the-app">app</div>} />)
    expect(container.querySelector('[data-testid="the-app"]')).toBeTruthy()
    expect(container.textContent).not.toContain('Control Tower')
  })

  it('renders the game at the hash, and returns on hashchange', async () => {
    window.location.hash = GAME_HASH
    await mount(<GameGate app={<div data-testid="the-app">app</div>} />)
    // Lazy chunk resolves inside act.
    await act(async () => {})
    expect(container.textContent).toContain('Control Tower')
    expect(container.querySelector('[data-testid="the-app"]')).toBeNull()

    await act(async () => {
      window.location.hash = ''
      window.dispatchEvent(new Event('hashchange'))
    })
    expect(container.querySelector('[data-testid="the-app"]')).toBeTruthy()
  })
})

describe('ControlTowerShift HUD', () => {
  it('mounts on duty with full integrity, wave 1, score 0', async () => {
    await mount(<ControlTowerShift />)
    expect(container.querySelector('[data-testid="score"]').textContent).toBe('0')
    expect(container.querySelector('[data-testid="wave"]').textContent).toContain('Wave 1')
    expect(container.querySelector('[data-testid="integrity"]').textContent).toContain('100')
    expect(container.querySelector('[data-testid="status"]').textContent).toBe('On duty')
  })

  it('renders all five ability buttons, ready', async () => {
    await mount(<ControlTowerShift />)
    const group = container.querySelector('[role="group"]')
    const buttons = group.querySelectorAll('button')
    expect(buttons).toHaveLength(5)
    for (const b of buttons) {
      expect(b.disabled).toBe(false)
      expect(b.textContent).toContain('ready')
    }
  })

  it('firing shield marks it active and disables it (cooldown)', async () => {
    await mount(<ControlTowerShift />)
    const shieldBtn = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Shield'),
    )
    await act(async () => shieldBtn.click())
    expect(shieldBtn.textContent).toContain('active')
    expect(shieldBtn.disabled).toBe(true)
    expect(container.querySelector('[data-testid="status"]').textContent).toBe('Shield up')
  })

  it('pause overlays and disables abilities; resume restores duty', async () => {
    await mount(<ControlTowerShift />)
    const pauseBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pause')
    await act(async () => pauseBtn.click())
    expect(container.querySelector('[data-testid="status"]').textContent).toBe('Paused')
    for (const b of container.querySelectorAll('[role="group"] button')) {
      expect(b.disabled).toBe(true)
    }
    const resumeBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Resume')
    await act(async () => resumeBtn.click())
    expect(container.querySelector('[data-testid="status"]').textContent).toBe('On duty')
  })

  // The loop wrote every finished run to the board, so ten unplayed shifts
  // filled the top ten with zeros and rendered them as the standing record.
  // isHighScore was already exported and tested — it just wasn't wired to the
  // one write path. Driven here through the real module, not a mock.
  it('a 0-score finished run is NOT written to the board', async () => {
    const { isHighScore, saveHighScore, loadHighScores } = await import('../src/game/index.js')
    const store = window.localStorage
    expect(isHighScore(store, 0)).toBe(false)
    if (isHighScore(store, 0)) saveHighScore(store, { score: 0, wave: 1 })
    expect(loadHighScores(store)).toEqual([])
  })

  it('control: a scoring run IS written to the board', async () => {
    const { isHighScore, saveHighScore, loadHighScores } = await import('../src/game/index.js')
    const store = window.localStorage
    expect(isHighScore(store, 900)).toBe(true)
    if (isHighScore(store, 900)) saveHighScore(store, { score: 900, wave: 3 })
    expect(loadHighScores(store).map((e) => e.score)).toEqual([900])
  })

  it('control: repair at full integrity leaves 100/100', async () => {
    await mount(<ControlTowerShift />)
    const repairBtn = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Repair'),
    )
    await act(async () => repairBtn.click())
    expect(container.querySelector('[data-testid="integrity"]').textContent).toContain('100 / 100')
  })

})

describe('How to play panel', () => {
  it('is closed by default and opens/closes on the "?" toggle', async () => {
    await mount(<ControlTowerShift />)
    const toggle = container.querySelector('button[aria-expanded]')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#ctshift-help')).toBeNull()

    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const panel = container.querySelector('#ctshift-help')
    expect(panel).toBeTruthy()
    // Every ability gets a plain-language line — not just its glyph/label.
    for (const label of ['Shield', 'Pulse', 'Burst', 'Score', 'Repair']) {
      expect(panel.textContent).toContain(label)
    }

    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#ctshift-help')).toBeNull()
  })
})

// Accessibility pass, 30 Aug 2026. These four gaps were raised by the
// adversarial review but never adjudicated — 76 of its 102 agents died on a
// session limit — so each was re-verified against the real code before being
// fixed here, and each gets its firing and non-firing sibling.
describe('accessibility', () => {
  it('the play field is focusable and says how to play without a pointer', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    expect(canvas.getAttribute('tabindex')).toBe('0')
    const label = canvas.getAttribute('aria-label')
    expect(label).toMatch(/Enter/)
    expect(label).toMatch(/P to pause/i)
  })

  it('Enter clears the threat nearest the tower — the game is playable by keyboard', { timeout: 30000 }, async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    const score = () => Number(container.querySelector('[data-testid="score"]').textContent)
    expect(score()).toBe(0)
    // The loop runs on real rAF, so the first spawn lands ~20 ticks (0.7s) in.
    // POLL for the event rather than sleeping a guessed duration: the assertion
    // is "a keypress eventually scores", and a fixed sleep would encode a
    // timing guess as the thing under test. 30s timeout: the 10s deadline plus
    // generous headroom for slow CI / jsdom rAF under parallel load (measured
    // 6.2s when run alongside the full suite).
    const deadline = Date.now() + 10000
    while (score() === 0 && Date.now() < deadline) {
      await act(async () => {
        canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise((r) => setTimeout(r, 16))
      })
    }
    expect(score()).toBeGreaterThan(0)
  })

  it('control: Enter on an empty field scores nothing (it is not a free point)', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.querySelector('[data-testid="score"]').textContent).toBe('0')
  })

  it('P pauses and resumes from the keyboard', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    const status = () => container.querySelector('[data-testid="status"]').textContent
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
    expect(container.querySelector('[data-testid="status"]').textContent).toBe('On duty')
  })

  // Found by SCREENSHOTTING the built page, not by a test: the score-multiplier
  // button stacked its mark over its label and rendered "×2 / ×2 SCORE". Every
  // assertion passed the whole time — nothing compared the two strings.
  it('no ability button repeats its mark inside its own label', async () => {
    await mount(<ControlTowerShift />)
    for (const b of container.querySelectorAll('[role="group"] button')) {
      const [mark, label] = [...b.querySelectorAll('span')].map((s) => s.textContent.trim())
      expect(label.includes(mark), `"${mark}" is repeated in its label "${label}"`).toBe(false)
    }
  })

  it('control: the marks are still rendered (deleting them would pass the test above)', async () => {
    await mount(<ControlTowerShift />)
    const marks = [...container.querySelectorAll('[role="group"] button')].map(
      (b) => b.querySelector('span').textContent.trim(),
    )
    expect(marks).toHaveLength(5)
    for (const m of marks) expect(m.length).toBeGreaterThan(0)
    expect(new Set(marks).size).toBe(5) // and each is distinct
  })

  it('every control clears the 44px touch floor', async () => {
    await mount(<ControlTowerShift />)
    // The overlay's buttons are the ones that were short: text-xs (16px line)
    // plus py-3 (24px) computes to 40px, under the repo's own measured floor.
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
    expect(backingSize(390, 2)).toBe(780) // the retina case the fixed 560 buffer blurred
    expect(backingSize(390, 3)).toBe(1170)
    expect(backingSize(390, 6)).toBe(1170) // capped: cost is quadratic, gain is nil
  })

  it('reduced motion is read from the media query, both answers', () => {
    const win = (matches) => ({ matchMedia: (q) => ({ matches: q.includes('reduced-motion') && matches }) })
    expect(prefersReducedMotion(win(true))).toBe(true)
    expect(prefersReducedMotion(win(false))).toBe(false)
  })

  it('control: no matchMedia (or no window) is not reduced motion', () => {
    // Must be false, not undefined: the draw path branches on it, and a
    // missing API is not a reader asking for less motion.
    expect(prefersReducedMotion({})).toBe(false)
    expect(prefersReducedMotion(null)).toBe(false)
  })

  it('control: a missing or nonsense DPR falls back to 1:1, never 0', () => {
    expect(backingSize(390, undefined)).toBe(390)
    expect(backingSize(390, 0)).toBe(390)
    expect(backingSize(390, NaN)).toBe(390)
    expect(backingSize(0, 2)).toBe(1) // never a zero-width canvas
  })
})
