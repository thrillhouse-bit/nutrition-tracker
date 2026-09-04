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

// Physical system access is enforced per concrete world entity, so a fixture
// that crafts from the bank must stand where the bank and kitchen interaction
// circles overlap. On Beacon Overlook the storehouse (beacon-bank at 548,424)
// sits 91px from the field kitchen (beacon-field-kitchen at 460,400) — closer
// than twice SYSTEM_INTERACTION_RADIUS (112px). A player at the walkable
// midpoint (504,412) is 46px from both, inside the 56px radius of each.
const FIELD_KITCHEN_BANK_MIDPOINT = { x: 504, y: 412 }

function openFieldKitchen(state) {
  let next = {
    ...state,
    world: {
      ...state.world,
      mapId: 'beacon-overlook',
      position: { ...FIELD_KITCHEN_BANK_MIDPOINT },
    },
  }
  next = applyEvent(next, {
    type: 'OPEN_CRAFTING',
    entityId: 'beacon-field-kitchen',
    stationId: 'field-kitchen',
  })
  return next
}

// The Bronze Foundry forge (bronze-foundry-forge at 720,380) has no bank entity
// on its map at all, so a carried-and-bank craft there must fail closed.
function openBronzeFoundryForge(state) {
  let next = {
    ...state,
    world: { ...state.world, mapId: 'bronze-foundry', position: { x: 700, y: 370 } },
  }
  return applyEvent(next, {
    type: 'OPEN_CRAFTING',
    entityId: 'bronze-foundry-forge',
    stationId: 'bronze-forge',
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
      bankEntityId: 'beacon-bank',
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

  it('rejects missing, wrong, and distant bank IDs without recording a craft result', () => {
    let state = withInventory(createInitialState(), {
      bank: [{ itemId: 'barley-flatbread', quantity: 2 }],
    })
    state = openFieldKitchen(state)
    const before = state.inventory
    const base = { type: 'CRAFT', recipeId: 'grain-pottage', quantity: 1, sourceMode: 'carried-and-bank' }

    expect(applyEvent(state, base)).toBe(state)
    expect(applyEvent(state, { ...base, bankEntityId: 'myrrine-provisioner' })).toBe(state)

    const distantBank = {
      ...state,
      world: { ...state.world, position: { x: 452, y: 400 } },
    }
    expect(applyEvent(distantBank, { ...base, bankEntityId: 'beacon-bank' })).toBe(distantBank)
    expect(state.inventory).toBe(before)
    expect(state.crafting.lastResult).toBeNull()
  })

  it('fails closed when a bank-source event has no concrete nearby bank', () => {
    let state = withInventory(createInitialState(), {
      bank: [{ itemId: 'copper-ore', quantity: 2 }],
    })
    state = openBronzeFoundryForge(state)
    const inventoryBefore = state.inventory
    const rejected = applyEvent(state, {
      type: 'CRAFT',
      recipeId: 'copper-bar',
      quantity: 1,
      sourceMode: 'carried-and-bank',
    })
    expect(rejected).toBe(state)
    expect(rejected.inventory).toBe(inventoryBefore)
    expect(rejected.progression.skills.bronzework.xp).toBe(0)
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
      bankEntityId: 'beacon-bank',
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
      bankEntityId: 'beacon-bank',
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
