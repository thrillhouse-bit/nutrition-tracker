// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { ALL_ITEM_DEFS, ITEM_EXTENSIONS } from '../src/rpg/crafting.js'
import { createInitialState } from '../src/rpg/state.js'
import { saveRPG } from '../src/rpg/save.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function itemPresentationState() {
  const initial = createInitialState()
  const bankSlots = [
    ...Object.keys(ITEM_EXTENSIONS).map((itemId, index) => ({ itemId, quantity: index + 1 })),
    { itemId: 'olive-log', quantity: 7 },
  ]
  return {
    ...initial,
    world: {
      ...initial.world,
      position: { x: 548, y: 424 },
      facing: 0,
    },
    inventory: {
      ...initial.inventory,
      slots: [
        { itemId: 'grain-pottage', quantity: 1 },
        { itemId: 'bronze-bar', quantity: 1 },
        { itemId: 'herb-cake', quantity: 1 },
        { itemId: 'olive-log', quantity: 1 },
      ],
      bank: { ...initial.inventory.bank, slots: bankSlots },
    },
  }
}

async function mountAtBank() {
  expect(saveRPG(window.localStorage, itemPresentationState())).toBe(true)
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

describe('authored extension item presentation', () => {
  it('renders crafted extensions as real backpack slots with canonical metadata', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await mountAtBank()
    const pack = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pack')
    await act(async () => pack.click())

    expect(container.textContent).toContain('4 / 28 slots')
    expect(container.textContent).toContain('Primary Oath-Spear')
    expect(container.textContent).toContain('Body Traveler Tunic')
    for (const itemId of ['grain-pottage', 'bronze-bar', 'herb-cake', 'olive-log']) {
      const item = ALL_ITEM_DEFS[itemId]
      const slot = container.querySelector(`.rpg-inventory-slot[data-item-id="${itemId}"]`)
      expect(slot, itemId).not.toBeNull()
      expect(slot.textContent, itemId).toContain(item.name)
      expect(slot.dataset.itemCategory, itemId).toBe(item.category)
      expect(slot.dataset.itemQuantity, itemId).toBe('1')
      expect(slot.title, itemId).toBe(`${item.name}, ${item.category}, quantity 1`)
      expect(slot.getAttribute('aria-label'), itemId).toBe(slot.title)
      expect(slot.title, itemId).not.toBe('Empty slot')
    }
  })

  it('renders every extension in the bank with canonical name, category, and quantity', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await mountAtBank()
    const interact = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Interact')
    await act(async () => interact.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.querySelector('[aria-label="Storehouse bank panel"]')).not.toBeNull()

    for (const [index, itemId] of Object.keys(ITEM_EXTENSIONS).entries()) {
      const item = ITEM_EXTENSIONS[itemId]
      const quantity = index + 1
      const row = container.querySelector(`.rpg-bank-entry[data-item-id="${itemId}"]`)
      expect(row, itemId).not.toBeNull()
      expect(row.textContent, itemId).toContain(item.name)
      expect(row.textContent, itemId).toContain(`${quantity} banked`)
      expect(row.dataset.itemCategory, itemId).toBe(item.category)
      expect(row.dataset.itemQuantity, itemId).toBe(String(quantity))
      expect(row.title, itemId).toBe(`${item.name}, ${item.category}, quantity ${quantity} banked`)
      expect(row.getAttribute('aria-label'), itemId).toBe(row.title)
    }

    const baseRow = container.querySelector('.rpg-bank-entry[data-item-id="olive-log"]')
    expect(baseRow.textContent).toContain('Olive Log')
    expect(baseRow.textContent).toContain('7 banked')
  })
})
