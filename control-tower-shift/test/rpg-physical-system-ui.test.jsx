// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ControlTowerRPG from '../src/ControlTowerRPG.jsx'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import { addInventoryItem } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { saveRPG } from '../src/rpg/save.js'
import { createInitialState } from '../src/rpg/state.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function nearbyState(entityId, extras = {}) {
  const initial = createInitialState()
  const map = rpgMapById('beacon-overlook')
  const entity = map.entities.find((candidate) => candidate.id === entityId)
  return {
    ...initial,
    ...extras,
    world: {
      ...initial.world,
      mapId: map.id,
      regionId: map.region,
      position: { x: entity.x - 8, y: entity.y },
    },
  }
}

async function mount(state) {
  expect(saveRPG(window.localStorage, state)).toBe(true)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<ControlTowerRPG />))
  await act(async () => [...container.querySelectorAll('button')]
    .find((button) => button.textContent === 'Continue').click())
}

async function press(key) {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  container = root = null
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('physical system panels in the normal world UI', () => {
  it.each([
    ['beacon-bank', 'Storehouse bank panel'],
    ['myrrine-provisioner', 'Merchant trade panel'],
    ['beacon-alchemy-bench', 'Systems panel'],
  ])('opens %s only through the nearby keyboard interaction path', async (entityId, panelLabel) => {
    await mount(nearbyState(entityId, entityId === 'myrrine-provisioner'
      ? { inventory: { ...createInitialState().inventory, currency: 100 } }
      : {}))

    await press('e')
    expect(container.querySelector(`[aria-label="${panelLabel}"]`)).not.toBeNull()
  })

  it('closes a bank panel through Escape, removing its only deposit control', async () => {
    const initial = createInitialState()
    const inventory = addInventoryItem(initial.inventory, 'thyme', 1, ALL_ITEM_DEFS).inventory
    await mount(nearbyState('beacon-bank', { inventory }))

    await press('e')
    expect(container.querySelector('[aria-label="Deposit 1 Wild Thyme"]')).not.toBeNull()
    await press('Escape')

    expect(container.querySelector('[aria-label="Storehouse bank panel"]')).toBeNull()
    expect(container.querySelector('[aria-label="Deposit 1 Wild Thyme"]')).toBeNull()
  })

  it('toggles a nearby crafting station closed through the Systems control', async () => {
    await mount(nearbyState('beacon-alchemy-bench'))
    await press('e')
    expect(container.querySelector('[aria-label="Systems panel"]')).not.toBeNull()

    const systems = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Systems')
    await act(async () => systems.click())
    expect(container.querySelector('[aria-label="Systems panel"]')).toBeNull()
  })

  it('crafts with banked materials from the overlapping bank and kitchen without retaining a bank panel session', async () => {
    const initial = createInitialState()
    const map = rpgMapById('beacon-overlook')
    const state = {
      ...initial,
      inventory: {
        ...initial.inventory,
        slots: [{ itemId: 'barley-flatbread', quantity: 1 }],
        bank: { ...initial.inventory.bank, slots: [{ itemId: 'barley-flatbread', quantity: 1 }] },
      },
      // This point is closer to the field kitchen (37px) than the bank
      // (54px), but remains legally reachable from both concrete targets.
      world: { ...initial.world, mapId: map.id, regionId: map.region, position: { x: 495, y: 412 } },
    }
    await mount(state)

    await press('e')
    expect(container.querySelector('[aria-label="Systems panel"]')).not.toBeNull()
    await act(async () => [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Crafting').click())

    const toggle = container.querySelector('input[type="checkbox"][aria-label="Use bank materials"]')
    expect(toggle.disabled).toBe(false)
    await act(async () => toggle.click())
    const recipe = [...container.querySelectorAll('.rsp-recipe')]
      .find((card) => card.textContent.includes('Stir Grain Pottage'))
    await act(async () => [...recipe.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Craft').click())

    const craftStatus = [...container.querySelectorAll('.rsp-panel [aria-live="polite"]')]
      .find((element) => element.textContent.includes('Crafted'))
    expect(craftStatus?.textContent).toContain('Crafted ×1')
    expect(craftStatus?.textContent).toContain('1 carried, 1 bank')
  })
})
