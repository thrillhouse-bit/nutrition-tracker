// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import RPGShopPanel from '../src/rpg/RPGShopPanel.jsx'
import { addInventoryItem } from '../src/rpg/progression.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function mount(state, dispatch = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RPGShopPanel state={state} dispatch={dispatch} />))
  return dispatch
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  container = root = null
  vi.restoreAllMocks()
})

function openShopState(currency = 100) {
  let state = createInitialState()
  state = { ...state, inventory: { ...state.inventory, currency } }
  // Physical merchant access requires standing beside the concrete shop entity.
  const map = rpgMapById('beacon-overlook')
  const shop = map.entities.find((candidate) => candidate.shopId === 'beacon-provisioner')
  const near = { ...state, world: { ...state.world, position: { x: shop.x - 8, y: shop.y } } }
  return applyEvent(near, { type: 'OPEN_SHOP', shopId: 'beacon-provisioner', entityId: shop.id })
}

describe('RPGShopPanel', () => {
  it('renders canonical stock, prices, quantities, and accessible atomic buy actions', async () => {
    const dispatch = await mount(openShopState())
    expect(container.textContent).toContain('100 drachmae')
    expect(container.textContent).toContain('Barley Flatbread')
    expect(container.textContent).toContain('6 drachmae each · 12 in stock')
    const buy = container.querySelector('button[aria-label="Buy 5 Barley Flatbread for 30 drachmae"]')
    expect(buy).not.toBeNull()
    expect(buy.disabled).toBe(false)
    await act(async () => buy.click())
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'SHOP_BUY', itemId: 'barley-flatbread', quantity: 5 })
    expect(dispatch.mock.calls[0][0].transactionId).toMatch(/^beacon-provisioner:buy:/)
  })

  it('keeps sold-out, insufficient-funds, and backpack-capacity reasons readable', async () => {
    const state = openShopState(1)
    state.economy.shops['beacon-provisioner'].stock.thyme = 0
    state.inventory = addInventoryItem(state.inventory, 'copper-ore', 25, ALL_ITEM_DEFS).inventory
    await mount(state)

    const soldOut = container.querySelector('button[aria-label="Buy 1 Wild Thyme for 9 drachmae"]')
    expect(soldOut.disabled).toBe(true)
    expect(document.getElementById(soldOut.getAttribute('aria-describedby')).textContent).toContain('Sold out')

    const copper = container.querySelector('button[aria-label="Buy 1 Copper Ore for 18 drachmae"]')
    expect(copper.disabled).toBe(true)
    expect(document.getElementById(copper.getAttribute('aria-describedby')).textContent).toContain('Purchases need currency')
  })

  it('shows only carried sellable items and dispatches a sell-all quantity without touching bank state', async () => {
    const state = openShopState()
    state.inventory = addInventoryItem(state.inventory, 'olive-log', 3, ALL_ITEM_DEFS).inventory
    state.inventory = { ...state.inventory, bank: { ...state.inventory.bank, slots: [{ itemId: 'thyme', quantity: 10 }] } }
    const dispatch = await mount(state)
    const sellMode = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Sell')
    await act(async () => sellMode.click())
    expect(container.textContent).toContain('3 carried')
    expect(container.textContent).not.toContain('Wild Thyme')
    const sellAll = container.querySelector('button[aria-label="Sell 3 Olive Log for 15 drachmae"]')
    expect(sellAll.textContent).toBe('Sell all')
    await act(async () => sellAll.click())
    expect(dispatch.mock.calls.at(-1)[0]).toMatchObject({ type: 'SHOP_SELL', itemId: 'olive-log', quantity: 3 })
  })

  it('announces the exact latest transaction outcome in its reserved status region', async () => {
    const state = openShopState()
    state.economy.lastResult = { ok: true, reason: 'bought', shopId: 'beacon-provisioner', itemId: 'thyme', quantity: 2, total: 18 }
    await mount(state)
    const status = container.querySelector('[role="status"]')
    expect(status.textContent).toBe('Bought 2 Wild Thyme for 18 drachmae.')
  })
})
