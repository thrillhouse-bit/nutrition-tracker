// Pure planning/execution layer for crafting material provenance.
//
// The existing crafting module owns recipes. This module adds an explicit
// source policy so a caller can choose carried materials only, or opt into
// drawing the remainder from the bank. Every public operation is deterministic
// and side-effect free; failed execution returns the original inventory.

import { ALL_ITEM_DEFS, recipeById } from './crafting.js'
import {
  INVENTORY_CAPACITY,
  addInventoryItem,
  levelForXp,
  normalizeInventory,
} from './progression.js'

export const CRAFTING_SOURCE_MODES = Object.freeze({
  CARRIED_ONLY: 'carried-only',
  CARRIED_AND_BANK: 'carried-and-bank',
})

const VALID_SOURCE_MODES = new Set(Object.values(CRAFTING_SOURCE_MODES))

function extractSkillMap(skills) {
  if (!skills || typeof skills !== 'object') return {}
  if (skills.progression && typeof skills.progression === 'object') {
    return skills.progression.skills || {}
  }
  if (skills.skills && typeof skills.skills === 'object') return skills.skills
  return skills
}

function safeProduct(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null
  if (left < 0 || right < 0) return null
  if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) return null
  return left * right
}

function validQuantity(quantity) {
  return typeof quantity === 'number'
    && Number.isSafeInteger(quantity)
    && quantity > 0
}

function quantityIn(slots, itemId) {
  return (slots || []).reduce((total, entry) => {
    if (entry?.itemId !== itemId) return total
    const quantity = entry.quantity
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return total
    return total + quantity
  }, 0)
}

function aggregateEntries(entries, multiplier) {
  const ordered = []
  const byItemId = new Map()
  for (const entry of entries) {
    const quantity = safeProduct(entry.quantity, multiplier)
    if (quantity == null) return null
    const existing = byItemId.get(entry.itemId)
    if (existing) {
      const combined = existing.quantity + quantity
      if (!Number.isSafeInteger(combined)) return null
      existing.quantity = combined
    } else {
      const next = { itemId: entry.itemId, quantity }
      byItemId.set(entry.itemId, next)
      ordered.push(next)
    }
  }
  return ordered
}

function failure(reason, detail) {
  return { ok: false, reason, detail }
}

function drain(slots, itemId, quantity) {
  let remaining = quantity
  const next = []
  for (const entry of slots) {
    if (entry.itemId !== itemId || remaining === 0) {
      next.push(entry)
      continue
    }
    const taken = Math.min(entry.quantity, remaining)
    const left = entry.quantity - taken
    remaining -= taken
    if (left > 0) next.push({ ...entry, quantity: left })
  }
  return { slots: next, removed: quantity - remaining }
}

function deductInventory(inventory, deductions) {
  let slots = inventory.slots.map((entry) => ({ ...entry }))
  let bankSlots = inventory.bank.slots.map((entry) => ({ ...entry }))

  for (const deduction of deductions) {
    const carried = drain(slots, deduction.itemId, deduction.carried)
    const bank = drain(bankSlots, deduction.itemId, deduction.bank)
    slots = carried.slots
    bankSlots = bank.slots
  }

  return {
    ...inventory,
    slots,
    bank: { ...inventory.bank, slots: bankSlots },
  }
}

function outputSlotRequirement(inventory, outputs) {
  let required = 0
  const stackIds = new Set(
    inventory.slots
      .filter((entry) => ALL_ITEM_DEFS[entry.itemId]?.stackable)
      .map((entry) => entry.itemId)
  )

  for (const output of outputs) {
    if (ALL_ITEM_DEFS[output.itemId]?.stackable) {
      if (!stackIds.has(output.itemId)) {
        required += 1
        stackIds.add(output.itemId)
      }
    } else {
      required += output.quantity
    }
    if (!Number.isSafeInteger(required)) return null
  }
  return required
}

function addOutputs(inventory, outputs) {
  let projected = inventory
  for (const output of outputs) {
    const result = addInventoryItem(
      projected,
      output.itemId,
      output.quantity,
      ALL_ITEM_DEFS
    )
    if (result.added !== output.quantity) return null
    projected = result.inventory
  }
  return projected
}

function publicPlan(plan) {
  if (!plan.ok) return plan
  const { projectedInventory: _projectedInventory, ...result } = plan
  return result
}

// Returns a validation and accounting quote without exposing a projected
// inventory. The default source policy is deliberately carried-only.
export function quoteCraftingLedger(params, recipeId, quantity) {
  return publicPlan(planCraftingLedger(params, recipeId, quantity))
}

// Produces an exact immutable plan. On success, deductions always consume
// carried material first and use bank material only for the remainder.
export function planCraftingLedger(params, recipeId, quantity) {
  const recipe = recipeById(recipeId)
  if (!recipe) return failure('unknown_recipe', { recipeId })
  if (!validQuantity(quantity)) {
    return failure('invalid_quantity', { recipeId, requested: quantity })
  }

  const sourceMode = params?.sourceMode ?? CRAFTING_SOURCE_MODES.CARRIED_ONLY
  if (!VALID_SOURCE_MODES.has(sourceMode)) {
    return failure('invalid_source_mode', { recipeId, sourceMode })
  }
  if (params?.stationId !== recipe.stationId) {
    return failure('wrong_station', {
      recipeId,
      required: recipe.stationId,
      actual: params?.stationId,
    })
  }

  const skillMap = extractSkillMap(params?.skills)
  const skillXp = skillMap[recipe.skillId]?.xp
  const currentLevel = levelForXp(Number.isFinite(skillXp) ? skillXp : 0)
  if (currentLevel < recipe.level) {
    return failure('level_too_low', {
      recipeId,
      skillId: recipe.skillId,
      required: recipe.level,
      current: currentLevel,
    })
  }

  const ingredients = aggregateEntries(recipe.ingredients, quantity)
  const outputs = aggregateEntries(recipe.outputs, quantity)
  const xpAwarded = safeProduct(recipe.xp, quantity)
  if (!ingredients || !outputs || xpAwarded == null) {
    return failure('quantity_overflow', { recipeId, requested: quantity })
  }

  const inventory = normalizeInventory(params?.inventory, ALL_ITEM_DEFS)
  const availability = ingredients.map((ingredient) => {
    const carriedAvailable = quantityIn(inventory.slots, ingredient.itemId)
    const bankAvailable = quantityIn(inventory.bank.slots, ingredient.itemId)
    const usableAvailable = sourceMode === CRAFTING_SOURCE_MODES.CARRIED_AND_BANK
      ? carriedAvailable + bankAvailable
      : carriedAvailable
    return {
      itemId: ingredient.itemId,
      needed: ingredient.quantity,
      carriedAvailable,
      bankAvailable,
      usableAvailable,
    }
  })
  const missing = availability
    .filter((entry) => entry.usableAvailable < entry.needed)
    .map((entry) => ({
      itemId: entry.itemId,
      needed: entry.needed,
      available: entry.usableAvailable,
      carriedAvailable: entry.carriedAvailable,
      bankAvailable: entry.bankAvailable,
    }))

  if (missing.length > 0) {
    return failure('insufficient_materials', {
      recipeId,
      sourceMode,
      missing,
      availability,
    })
  }

  const deductions = availability.map((entry) => {
    const carried = Math.min(entry.needed, entry.carriedAvailable)
    const bank = sourceMode === CRAFTING_SOURCE_MODES.CARRIED_AND_BANK
      ? entry.needed - carried
      : 0
    return {
      itemId: entry.itemId,
      carried,
      bank,
      total: carried + bank,
    }
  })
  const afterDeductions = deductInventory(inventory, deductions)
  const requiredOutputSlots = outputSlotRequirement(afterDeductions, outputs)
  const capacity = inventory.capacity || INVENTORY_CAPACITY
  const availableOutputSlots = Math.max(0, capacity - afterDeductions.slots.length)

  if (requiredOutputSlots == null || requiredOutputSlots > availableOutputSlots) {
    return failure('insufficient_inventory_capacity', {
      recipeId,
      sourceMode,
      capacity,
      usedBefore: inventory.slots.length,
      usedAfterDeductions: afterDeductions.slots.length,
      requiredOutputSlots,
      availableOutputSlots,
      deductions,
      outputs,
    })
  }

  const projectedInventory = addOutputs(afterDeductions, outputs)
  if (!projectedInventory) {
    return failure('insufficient_inventory_capacity', {
      recipeId,
      sourceMode,
      capacity,
      usedBefore: inventory.slots.length,
      usedAfterDeductions: afterDeductions.slots.length,
      requiredOutputSlots,
      availableOutputSlots,
      deductions,
      outputs,
    })
  }

  return {
    ok: true,
    recipeId,
    quantity,
    sourceMode,
    stationId: recipe.stationId,
    skillId: recipe.skillId,
    xpAwarded,
    availability,
    deductions,
    outputs,
    capacity: {
      limit: capacity,
      usedBefore: inventory.slots.length,
      usedAfterDeductions: afterDeductions.slots.length,
      usedAfter: projectedInventory.slots.length,
      requiredOutputSlots,
    },
    projectedInventory,
  }
}

// Applies a validated plan atomically. XP is reported but intentionally not
// awarded here; the shared reducer remains the sole owner of progression.
export function executeCraftingLedger(params, recipeId, quantity) {
  const plan = planCraftingLedger(params, recipeId, quantity)
  if (!plan.ok) {
    return {
      inventory: params?.inventory,
      result: plan,
    }
  }
  return {
    inventory: plan.projectedInventory,
    result: publicPlan(plan),
  }
}
