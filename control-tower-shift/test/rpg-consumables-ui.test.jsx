// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { createInitialState } from '../src/rpg/state.js'
import { saveRPG } from '../src/rpg/save.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function mountSaved(state) {
  expect(saveRPG(window.localStorage, state)).toBe(true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  const continueButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Continue')
  await act(async () => continueButton.click())
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  root = container = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('consumable controls', () => {
  it('offers an accessible native Use action and announces prepared feedback', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const initial = createInitialState()
    await mountSaved({
      ...initial,
      inventory: {
        ...initial.inventory,
        slots: [...initial.inventory.slots, { itemId: 'herbal-salve', quantity: 1 }],
      },
    })

    const pack = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pack')
    await act(async () => pack.click())
    const use = container.querySelector('button[aria-label^="Use Herbal Salve"]')
    expect(use).not.toBeNull()
    expect(use.disabled).toBe(false)
    expect(use.getBoundingClientRect).toBeTypeOf('function')

    // Native click covers pointer, keyboard activation, and touch synthesis.
    await act(async () => use.click())
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Herbal Salve prepared')
    expect(container.textContent).toContain('Prepared Herbal Salve')
    expect(container.querySelector('.rpg-inventory-slot[data-item-id="herbal-salve"]')).toBeNull()
  })

  it('keeps food visible but inert outside combat with an honest reason', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await mountSaved(createInitialState())
    const pack = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pack')
    await act(async () => pack.click())
    const use = container.querySelector('button[aria-label^="Use Barley Flatbread"]')
    expect(use).not.toBeNull()
    expect(use.disabled).toBe(true)
    expect(use.getAttribute('aria-label')).toContain('Food is used during an encounter')
  })
})
