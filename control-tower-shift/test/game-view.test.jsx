// @vitest-environment jsdom
//
// Render-layer tests for Control Tower Shift, mirroring the repo's jsdom +
// raw react-dom idiom. The canvas draws nothing under jsdom (getContext is
// null) — by design the HUD carries every state assertion. House rule: each
// gate gets a firing AND a non-firing test.
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const { default: GameGate, GAME_HASH } = await import('../src/GameGate.jsx')
const { default: ControlTowerShift } = await import('../src/ControlTowerShift.jsx')

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

  it('control: repair at full integrity leaves 100/100', async () => {
    await mount(<ControlTowerShift />)
    const repairBtn = [...container.querySelectorAll('[role="group"] button')].find((b) =>
      b.textContent.includes('Repair'),
    )
    await act(async () => repairBtn.click())
    expect(container.querySelector('[data-testid="integrity"]').textContent).toContain('100 / 100')
  })

  it('the play field is keyboard-focusable while running, not while over', async () => {
    await mount(<ControlTowerShift />)
    expect(container.querySelector('canvas').tabIndex).toBe(0)
    const pauseBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pause')
    await act(async () => pauseBtn.click())
    expect(container.querySelector('canvas').tabIndex).toBe(-1)
  })

  it('control: Enter on the play field before any threat has spawned is a no-op', async () => {
    await mount(<ControlTowerShift />)
    const scoreBefore = container.querySelector('[data-testid="score"]').textContent
    const canvas = container.querySelector('canvas')
    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(container.querySelector('[data-testid="score"]').textContent).toBe(scoreBefore)
  })

  it('keyboard: Enter on the play field clears the nearest threat and scores', async () => {
    // jsdom's native requestAnimationFrame doesn't track fake-timer-advanced
    // time (its callback `now` barely moves under vi.advanceTimersByTime),
    // so force the component's setTimeout fallback — which reads
    // performance.now(), and DOES track fake time once faked explicitly.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const origRaf = window.requestAnimationFrame
    window.requestAnimationFrame = undefined
    try {
      await mount(<ControlTowerShift />)
      // First spawn always lands at tick 20 (spawner.js: untilNext starts at
      // 20, unaffected by the RNG seed) — 1s of frames is well past that.
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      const scoreBefore = Number(container.querySelector('[data-testid="score"]').textContent)
      const canvas = container.querySelector('canvas')
      await act(async () => {
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      })
      expect(Number(container.querySelector('[data-testid="score"]').textContent)).toBeGreaterThan(scoreBefore)
    } finally {
      window.requestAnimationFrame = origRaf
      vi.useRealTimers()
    }
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
    for (const label of ['Shield', 'Pulse', 'Burst', '×2 Score', 'Repair']) {
      expect(panel.textContent).toContain(label)
    }

    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#ctshift-help')).toBeNull()
  })
})
