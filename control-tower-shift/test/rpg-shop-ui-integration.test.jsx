// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { saveRPG } from '../src/rpg/save.js'
import { createInitialState } from '../src/rpg/state.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function mountAtMerchant() {
  const initial = createInitialState()
  const state = {
    ...initial,
    world: { ...initial.world, position: { x: 650, y: 410 } },
    inventory: { ...initial.inventory, currency: 100 },
  }
  expect(saveRPG(window.localStorage, state)).toBe(true)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue').click())
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  container = root = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('physical merchant UI integration', () => {
  it('opens by normal world interaction, buys exactly once, and closes with Escape', async () => {
    await mountAtMerchant()
    expect([...container.querySelectorAll('.rpg-hud-btn')].some((button) => button.textContent === 'Shop')).toBe(false)

    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    const panel = container.querySelector('[aria-label="Merchant trade panel"]')
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain('Myrrine’s Provision Table')

    const buy = panel.querySelector('button[aria-label="Buy 1 Wild Thyme for 9 drachmae"]')
    await act(async () => buy.click())
    expect(panel.textContent).toContain('91 drachmae')
    expect(panel.textContent).toContain('Bought 1 Wild Thyme for 9 drachmae.')
    expect(panel.textContent).toContain('15 in stock')

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(container.querySelector('[aria-label="Merchant trade panel"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Trade with Myrrine"]')).not.toBeNull()
  })
})
