// @vitest-environment jsdom
//
// Render-layer tests for Control Tower Shift (arena campaign slice), mirroring
// the repo's jsdom + raw react-dom idiom. The canvas draws nothing under jsdom
// (getContext is null) — by design the HUD carries every state assertion.
// House rule: each gate gets a firing AND a non-firing test.
import { describe, it, expect, afterEach, vi } from 'vitest'
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
  vi.restoreAllMocks()
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
