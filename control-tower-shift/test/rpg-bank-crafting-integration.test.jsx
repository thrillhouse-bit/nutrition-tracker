// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import RPGSystemsPanel from '../src/rpg/RPGSystemsPanel.jsx'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function mount(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(element))
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  if (container) document.body.removeChild(container)
  container = null
  root = null
  vi.restoreAllMocks()
})

function atMap(state, mapId) {
  return { ...state, world: { ...state.world, mapId } }
}

function withInventory(state, { carried = [], bank = [] }) {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      slots: carried,
      bank: { ...state.inventory.bank, slots: bank },
    },
  }
}

function quantityIn(slots, itemId) {
  return slots
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

function openFieldKitchen(state) {
  return applyEvent(atMap(state, 'beacon-overlook'), {
    type: 'OPEN_CRAFTING',
    stationId: 'field-kitchen',
  })
}

async function click(element) {
  await act(async () => element.click())
}

function buttonNamed(name) {
  return [...container.querySelectorAll('button')]
    .find((button) => button.textContent.trim() === name)
}

function recipeCard(name) {
  return [...container.querySelectorAll('.rsp-recipe')]
    .find((card) => card.textContent.includes(name))
}

describe('bank-aware crafting reducer integration', () => {
  it('defaults every CRAFT event to carried-only, even beside a physical bank', () => {
    let state = withInventory(createInitialState(), {
      carried: [{ itemId: 'barley-flatbread', quantity: 1 }],
      bank: [{ itemId: 'barley-flatbread', quantity: 1 }],
    })
    state = openFieldKitchen(state)
    const inventoryBefore = state.inventory
    const xpBefore = state.progression.skills.cooking.xp

    state = applyEvent(state, {
      type: 'CRAFT',
      recipeId: 'grain-pottage',
      quantity: 1,
    })

    expect(state.crafting.lastResult).toMatchObject({
      ok: false,
      reason: 'insufficient_materials',
      detail: { sourceMode: 'carried-only' },
    })
    expect(state.inventory).toBe(inventoryBefore)
    expect(state.progression.skills.cooking.xp).toBe(xpBefore)
  })

  it('uses carried materials first and the exact bank remainder only at a local bank', () => {
    let state = withInventory(createInitialState(), {
      carried: [{ itemId: 'barley-flatbread', quantity: 1 }],
      bank: [{ itemId: 'barley-flatbread', quantity: 2 }],
    })
    state = openFieldKitchen(state)
    state = applyEvent(state, {
      type: 'CRAFT',
      recipeId: 'grain-pottage',
      quantity: 1,
      sourceMode: 'carried-and-bank',
    })

    expect(state.crafting.lastResult).toMatchObject({
      ok: true,
      recipeId: 'grain-pottage',
      quantity: 1,
      sourceMode: 'carried-and-bank',
      xpAwarded: 10,
      deductions: [{
        itemId: 'barley-flatbread',
        carried: 1,
        bank: 1,
        total: 2,
      }],
      outputs: [{ itemId: 'grain-pottage', quantity: 1 }],
    })
    expect(quantityIn(state.inventory.slots, 'barley-flatbread')).toBe(0)
    expect(quantityIn(state.inventory.bank.slots, 'barley-flatbread')).toBe(1)
    expect(quantityIn(state.inventory.slots, 'grain-pottage')).toBe(1)
    expect(state.progression.skills.cooking.xp).toBe(10)
    expect(state.progression.totalXp).toBe(10)
  })

  it('rejects a bank-source event when the station map has no physical bank', () => {
    let state = withInventory(atMap(createInitialState(), 'bronze-foundry'), {
      bank: [{ itemId: 'copper-ore', quantity: 2 }],
    })
    state = applyEvent(state, { type: 'OPEN_CRAFTING', stationId: 'bronze-forge' })
    const inventoryBefore = state.inventory
    state = applyEvent(state, {
      type: 'CRAFT',
      recipeId: 'copper-bar',
      quantity: 1,
      sourceMode: 'carried-and-bank',
    })

    expect(state.crafting.lastResult).toMatchObject({
      ok: false,
      reason: 'bank_access_required',
      detail: { sourceMode: 'carried-and-bank' },
    })
    expect(state.inventory).toBe(inventoryBefore)
    expect(state.progression.skills.bronzework.xp).toBe(0)
  })

  it('keeps capacity failure atomic when every ingredient would come from the bank', () => {
    const fullPack = Array.from({ length: 28 }, () => ({
      itemId: 'copper-ore', quantity: 1,
    }))
    let state = withInventory(createInitialState(), {
      carried: fullPack,
      bank: [{ itemId: 'barley-flatbread', quantity: 2 }],
    })
    state = openFieldKitchen(state)
    const inventoryBefore = state.inventory
    const progressionBefore = state.progression

    state = applyEvent(state, {
      type: 'CRAFT',
      recipeId: 'grain-pottage',
      quantity: 1,
      sourceMode: 'carried-and-bank',
    })

    expect(state.crafting.lastResult).toMatchObject({
      ok: false,
      reason: 'insufficient_inventory_capacity',
      detail: {
        usedBefore: 28,
        usedAfterDeductions: 28,
        requiredOutputSlots: 1,
        availableOutputSlots: 0,
      },
    })
    expect(state.inventory).toBe(inventoryBefore)
    expect(state.progression).toBe(progressionBefore)
    expect(quantityIn(state.inventory.bank.slots, 'barley-flatbread')).toBe(2)
  })
})

describe('bank-aware crafting UI integration', () => {
  it('offers an explicit local-bank toggle, explains provenance, and dispatches the selected source', async () => {
    let state = withInventory(createInitialState(), {
      carried: [{ itemId: 'barley-flatbread', quantity: 1 }],
      bank: [{ itemId: 'barley-flatbread', quantity: 1 }],
    })
    state = openFieldKitchen(state)
    const dispatch = vi.fn()
    await mount(<RPGSystemsPanel state={state} dispatch={dispatch} />)
    await click(buttonNamed('Crafting'))

    const toggle = container.querySelector('input[type="checkbox"][aria-label="Use bank materials"]')
    expect(toggle).toBeTruthy()
    expect(toggle.disabled).toBe(false)
    expect(toggle.checked).toBe(false)
    expect(container.textContent).toContain('Carried materials are used first')

    const card = recipeCard('Stir Grain Pottage')
    const craft = [...card.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Craft')
    expect(craft.disabled).toBe(true)

    await click(toggle)
    expect(toggle.checked).toBe(true)
    expect(craft.disabled).toBe(false)
    await click(craft)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CRAFT',
      recipeId: 'grain-pottage',
      quantity: 1,
      sourceMode: 'carried-and-bank',
    })
  })

  it('disables the bank toggle away from a bank and gives an accessible reason', async () => {
    const base = withInventory(atMap(createInitialState(), 'bronze-foundry'), {
      bank: [{ itemId: 'copper-ore', quantity: 2 }],
    })
    const state = {
      ...base,
      crafting: { stationId: 'bronze-forge', lastResult: null },
    }
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    await click(buttonNamed('Crafting'))

    const toggle = container.querySelector('input[type="checkbox"][aria-label="Use bank materials"]')
    expect(toggle).toBeTruthy()
    expect(toggle.disabled).toBe(true)
    const reasonId = toggle.getAttribute('aria-describedby')
    expect(reasonId).toBeTruthy()
    expect(document.getElementById(reasonId).textContent).toContain('physical bank')
  })

  it('announces exact carried and bank provenance after a successful craft', async () => {
    const state = {
      ...openFieldKitchen(createInitialState()),
      crafting: {
        stationId: 'field-kitchen',
        lastResult: {
          ok: true,
          recipeId: 'grain-pottage',
          quantity: 1,
          sourceMode: 'carried-and-bank',
          xpAwarded: 10,
          deductions: [{
            itemId: 'barley-flatbread', carried: 1, bank: 1, total: 2,
          }],
          outputs: [{ itemId: 'grain-pottage', quantity: 1 }],
        },
      },
    }
    await mount(<RPGSystemsPanel state={state} dispatch={vi.fn()} />)
    await click(buttonNamed('Crafting'))

    const status = container.querySelector('[aria-live="polite"]')
    expect(status.textContent).toContain('10 XP')
    expect(status.textContent).toContain('Barley Flatbread: 1 carried, 1 bank')
  })
})
