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
})
