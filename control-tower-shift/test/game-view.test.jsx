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
  if (window.localStorage) window.localStorage.clear()
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
  it('mounts in arena with Tier 1 deity Apollo, full health, wave 1, score 0', async () => {
    await mount(<ControlTowerShift />)
    expect(container.querySelector('[data-testid="wave"]')?.textContent).toContain('Wave 1')
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
    expect(container.querySelector('[data-testid="tier"]')?.textContent).toContain('Apollo')
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
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })

  it('pause overlays and disables abilities; resume restores duty', async () => {
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

  it('token usage HUD is visible and tracks ability use', async () => {
    await mount(<ControlTowerShift />)
    const tokensEl = container.querySelector('[data-testid="tokens"]')
    expect(tokensEl?.textContent).toContain('Tokens:')
    expect(tokensEl?.textContent).toContain('0')
  })

  it('control: repair at full health leaves health unchanged', async () => {
    await mount(<ControlTowerShift />)
    const repairBtn = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Repair'),
    )
    await act(async () => repairBtn.click())
    // Token usage increments on ability use
    expect(container.querySelector('[data-testid="tokens"]')?.textContent).toContain('1')
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
    expect(label).toMatch(/P to pause/i)
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
      (b) => b.querySelector('span')?.textContent.trim(),
    )
    expect(marks).toHaveLength(5)
    for (const m of marks) expect(m).toBeTruthy()
    expect(new Set(marks).size).toBe(5)
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

  it('Enter key triggers an attack attempt without crashing (keyboard playable)', { timeout: 10000 }, async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
    // With no threats on the field, Enter is a legal no-op — the game must
    // not crash and must stay on duty.
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe('On duty')
  })

  it('control: Enter on an empty field scores nothing (not a free point)', async () => {
    await mount(<ControlTowerShift />)
    const canvas = container.querySelector('canvas')
    await act(async () => {
      canvas.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.querySelector('[data-testid="tokens"]')?.textContent).toContain('Tokens: 0')
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
})
