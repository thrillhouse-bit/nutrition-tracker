import { describe, expect, it } from 'vitest'
import {
  CRAFTING_SOURCE_MODES,
  executeCraftingLedger,
  planCraftingLedger,
  quoteCraftingLedger,
} from '../src/rpg/craftingLedger.js'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import {
  INVENTORY_CAPACITY,
  createInitialInventory,
  createInitialSkills,
  normalizeInventory,
  xpForLevel,
} from '../src/rpg/progression.js'

function skillsAt(skillId, level) {
  const skills = createInitialSkills()
  skills[skillId] = { xp: xpForLevel(level) }
  return skills
}

function inventoryWith({ carried = [], bank = [] } = {}) {
  const initial = createInitialInventory()
  return normalizeInventory({
    ...initial,
    slots: carried,
    bank: { ...initial.bank, slots: bank },
  }, ALL_ITEM_DEFS)
}

function forgeParams(inventory, sourceMode = CRAFTING_SOURCE_MODES.CARRIED_ONLY) {
  return {
    inventory,
    skills: skillsAt('bronzework', 10),
    stationId: 'bronze-forge',
    sourceMode,
  }
}

function itemQuantity(slots, itemId) {
  return slots
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

describe('crafting ledger validation', () => {
  it('defaults to carried-only and reports bank stock without spending it', () => {
    const inventory = inventoryWith({
      carried: [{ itemId: 'copper-ore', quantity: 1 }],
      bank: [{ itemId: 'copper-ore', quantity: 4 }],
    })
    const result = quoteCraftingLedger({
      inventory,
      skills: skillsAt('bronzework', 10),
      stationId: 'bronze-forge',
    }, 'copper-bar', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('insufficient_materials')
    expect(result.detail.sourceMode).toBe('carried-only')
    expect(result.detail.missing).toEqual([{
      itemId: 'copper-ore',
      needed: 2,
      available: 1,
      carriedAvailable: 1,
      bankAvailable: 4,
    }])
  })

  it.each([0, -1, 1.5, NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe or non-integer quantity %s',
    (quantity) => {
      const result = quoteCraftingLedger(
        forgeParams(inventoryWith({ carried: [{ itemId: 'copper-ore', quantity: 2 }] })),
        'copper-bar',
        quantity
      )
      expect(result).toMatchObject({ ok: false, reason: 'invalid_quantity' })
    }
  )

  it('rejects unknown recipes, invalid source modes, wrong stations, and low levels', () => {
    const inventory = inventoryWith({ carried: [{ itemId: 'copper-ore', quantity: 2 }] })
    expect(quoteCraftingLedger(forgeParams(inventory), 'not-a-recipe', 1).reason).toBe('unknown_recipe')
    expect(quoteCraftingLedger({
      ...forgeParams(inventory),
      sourceMode: 'wherever',
    }, 'copper-bar', 1).reason).toBe('invalid_source_mode')
    expect(quoteCraftingLedger({
      ...forgeParams(inventory),
      stationId: 'loom',
    }, 'copper-bar', 1)).toMatchObject({
      ok: false,
      reason: 'wrong_station',
      detail: { required: 'bronze-forge', actual: 'loom' },
    })
    expect(quoteCraftingLedger({
      ...forgeParams(inventory),
      skills: skillsAt('bronzework', 1),
    }, 'bronze-ingot', 1)).toMatchObject({
      ok: false,
      reason: 'level_too_low',
      detail: { skillId: 'bronzework', required: 5, current: 1 },
    })
  })
})

describe('crafting ledger planning', () => {
  it('plans carried-first deductions and exact bank remainder', () => {
    const inventory = inventoryWith({
      carried: [{ itemId: 'copper-ore', quantity: 3 }],
      bank: [{ itemId: 'copper-ore', quantity: 7 }],
    })
    const plan = planCraftingLedger(
      forgeParams(inventory, CRAFTING_SOURCE_MODES.CARRIED_AND_BANK),
      'copper-bar',
      3
    )

    expect(plan.ok).toBe(true)
    expect(plan.deductions).toEqual([{
      itemId: 'copper-ore',
      carried: 3,
      bank: 3,
      total: 6,
    }])
    expect(plan.outputs).toEqual([{ itemId: 'copper-bar', quantity: 3 }])
    expect(plan.xpAwarded).toBe(36)
    expect(itemQuantity(plan.projectedInventory.slots, 'copper-ore')).toBe(0)
    expect(itemQuantity(plan.projectedInventory.bank.slots, 'copper-ore')).toBe(4)
    expect(itemQuantity(plan.projectedInventory.slots, 'copper-bar')).toBe(3)
  })

  it('supports a bank-only ingredient plan when explicitly enabled', () => {
    const inventory = inventoryWith({
      carried: [],
      bank: [{ itemId: 'copper-ore', quantity: 2 }],
    })
    const plan = planCraftingLedger(
      forgeParams(inventory, CRAFTING_SOURCE_MODES.CARRIED_AND_BANK),
      'copper-bar',
      1
    )

    expect(plan.ok).toBe(true)
    expect(plan.deductions[0]).toEqual({
      itemId: 'copper-ore', carried: 0, bank: 2, total: 2,
    })
    expect(plan.capacity.usedAfter).toBe(plan.capacity.usedBefore + 1)
  })

  it('rejects bank-funded output when a full pack gains no carried slots', () => {
    const fullPack = Array.from({ length: INVENTORY_CAPACITY }, () => ({
      itemId: 'barley-flatbread', quantity: 1,
    }))
    const inventory = inventoryWith({
      carried: fullPack,
      bank: [{ itemId: 'copper-ore', quantity: 2 }],
    })
    const plan = planCraftingLedger(
      forgeParams(inventory, CRAFTING_SOURCE_MODES.CARRIED_AND_BANK),
      'copper-bar',
      1
    )

    expect(plan).toMatchObject({
      ok: false,
      reason: 'insufficient_inventory_capacity',
      detail: {
        usedBefore: 28,
        usedAfterDeductions: 28,
        requiredOutputSlots: 1,
        availableOutputSlots: 0,
      },
    })
  })

  it('allows outputs when carried ingredient deductions free enough slots', () => {
    const filler = Array.from({ length: 26 }, () => ({
      itemId: 'barley-flatbread', quantity: 1,
    }))
    const inventory = inventoryWith({
      carried: [...filler, { itemId: 'copper-ore', quantity: 2 }],
    })
    const plan = planCraftingLedger(forgeParams(inventory), 'copper-bar', 1)

    expect(plan.ok).toBe(true)
    expect(plan.capacity).toEqual({
      limit: 28,
      usedBefore: 28,
      usedAfterDeductions: 26,
      usedAfter: 27,
      requiredOutputSlots: 1,
    })
  })

  it('is deterministic and does not mutate its input', () => {
    const inventory = inventoryWith({
      carried: [{ itemId: 'copper-ore', quantity: 1 }],
      bank: [{ itemId: 'copper-ore', quantity: 3 }],
    })
    const params = forgeParams(inventory, CRAFTING_SOURCE_MODES.CARRIED_AND_BANK)
    const snapshot = structuredClone(params)

    const first = planCraftingLedger(params, 'copper-bar', 2)
    const second = planCraftingLedger(params, 'copper-bar', 2)
    expect(first).toEqual(second)
    expect(params).toEqual(snapshot)
  })
})

describe('crafting ledger execution', () => {
  it('executes exact carried and bank deductions atomically', () => {
    const inventory = inventoryWith({
      carried: [{ itemId: 'copper-ore', quantity: 1 }],
      bank: [{ itemId: 'copper-ore', quantity: 3 }],
    })
    const execution = executeCraftingLedger(
      forgeParams(inventory, CRAFTING_SOURCE_MODES.CARRIED_AND_BANK),
      'copper-bar',
      2
    )

    expect(execution.result).toMatchObject({
      ok: true,
      quantity: 2,
      deductions: [{ itemId: 'copper-ore', carried: 1, bank: 3, total: 4 }],
      outputs: [{ itemId: 'copper-bar', quantity: 2 }],
      xpAwarded: 24,
    })
    expect(execution.result).not.toHaveProperty('projectedInventory')
    expect(itemQuantity(execution.inventory.slots, 'copper-bar')).toBe(2)
    expect(itemQuantity(execution.inventory.bank.slots, 'copper-ore')).toBe(0)
    expect(itemQuantity(inventory.slots, 'copper-ore')).toBe(1)
    expect(itemQuantity(inventory.bank.slots, 'copper-ore')).toBe(3)
  })

  it('returns the exact original inventory reference on every failure', () => {
    const inventory = inventoryWith({
      bank: [{ itemId: 'copper-ore', quantity: 2 }],
    })
    const execution = executeCraftingLedger(
      forgeParams(inventory, CRAFTING_SOURCE_MODES.CARRIED_ONLY),
      'copper-bar',
      1
    )

    expect(execution.result.reason).toBe('insufficient_materials')
    expect(execution.inventory).toBe(inventory)
  })
})
