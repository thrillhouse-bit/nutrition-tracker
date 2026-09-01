// Pure equipment domain for Oathbearer.
//
// Equipment is intentionally separate from inventory normalization: a missing,
// null, or invalid slot is an empty slot. This prevents save repair from
// silently re-equipping starter gear that the player deliberately removed.

import {
  EQUIPMENT_SLOTS,
  INVENTORY_CAPACITY,
  normalizeInventory,
} from './progression.js'
import { ALL_ITEM_DEFS } from './crafting.js'

export const CANONICAL_EQUIPMENT_SLOTS = Object.freeze([...EQUIPMENT_SLOTS])

export const EMPTY_COMBAT_MODIFIERS = Object.freeze({
  accuracyBonus: 0,
  damageBonus: 0,
  defenseBonus: 0,
  maxHealthBonus: 0,
  attackDamageMultiplier: 1,
  incomingDamageMultiplier: 1,
})

const DEFENSIVE_SLOTS = new Set(['head', 'cape', 'amulet', 'body', 'offhand', 'legs', 'hands', 'feet', 'ring'])

export function createEmptyEquipment() {
  return Object.fromEntries(CANONICAL_EQUIPMENT_SLOTS.map((slot) => [slot, null]))
}

function itemDefinition(itemDefs, itemId) {
  if (!itemDefs || typeof itemId !== 'string') return null
  return Object.prototype.hasOwnProperty.call(itemDefs, itemId) ? itemDefs[itemId] : null
}

export function isCanonicalEquipmentSlot(slot) {
  return CANONICAL_EQUIPMENT_SLOTS.includes(slot)
}

export function normalizeEquipment(raw, itemDefs = ALL_ITEM_DEFS) {
  const equipment = createEmptyEquipment()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return equipment

  for (const slot of CANONICAL_EQUIPMENT_SLOTS) {
    const itemId = raw[slot]
    const item = itemDefinition(itemDefs, itemId)
    if (item?.equipmentSlot === slot) equipment[slot] = itemId
  }
  return equipment
}

function normalizeEquipmentInventory(inventory, itemDefs) {
  const normalized = normalizeInventory(inventory, itemDefs)
  return {
    ...normalized,
    equipment: normalizeEquipment(inventory?.equipment, itemDefs),
  }
}

function carriedQuantity(slots, itemId) {
  return slots.reduce((total, entry) => (
    entry.itemId === itemId ? total + entry.quantity : total
  ), 0)
}

function removeOneCarried(slots, itemId) {
  let removed = false
  const next = []
  for (const entry of slots) {
    if (!removed && entry.itemId === itemId) {
      removed = true
      if (entry.quantity > 1) next.push({ ...entry, quantity: entry.quantity - 1 })
    } else {
      next.push(entry)
    }
  }
  return next
}

function addOneCarried(slots, itemId, itemDefs) {
  const item = itemDefinition(itemDefs, itemId)
  if (!item) return null
  if (item.stackable) {
    const index = slots.findIndex((entry) => entry.itemId === itemId)
    if (index >= 0) {
      const next = [...slots]
      next[index] = { ...next[index], quantity: next[index].quantity + 1 }
      return next
    }
  }
  if (slots.length >= INVENTORY_CAPACITY) return null
  return [...slots, { itemId, quantity: 1 }]
}

export function equipmentDecision(inventory, itemId, itemDefs = ALL_ITEM_DEFS) {
  const item = itemDefinition(itemDefs, itemId)
  if (!item) return { allowed: false, reason: 'unknown-item', slot: null }
  if (!isCanonicalEquipmentSlot(item.equipmentSlot)) {
    return { allowed: false, reason: 'not-equippable', slot: null }
  }

  const normalized = normalizeEquipmentInventory(inventory, itemDefs)
  const slot = item.equipmentSlot
  if (normalized.equipment[slot] === itemId) {
    return { allowed: false, reason: 'already-equipped', slot }
  }
  if (carriedQuantity(normalized.slots, itemId) < 1) {
    return { allowed: false, reason: 'not-carried', slot }
  }
  return { allowed: true, reason: 'ok', slot }
}

export function equipItem(inventory, itemId, itemDefs = ALL_ITEM_DEFS) {
  const normalized = normalizeEquipmentInventory(inventory, itemDefs)
  const decision = equipmentDecision(normalized, itemId, itemDefs)
  if (!decision.allowed) {
    return {
      inventory: normalized,
      changed: false,
      reason: decision.reason,
      slot: decision.slot,
      replacedItemId: null,
    }
  }

  const replacedItemId = normalized.equipment[decision.slot]
  let slots = removeOneCarried(normalized.slots, itemId)
  if (replacedItemId) {
    const withReplacement = addOneCarried(slots, replacedItemId, itemDefs)
    // This is possible only for a future stackable equippable replacing a
    // non-stackable item in a full pack. Keep the transaction atomic.
    if (!withReplacement) {
      return {
        inventory: normalized,
        changed: false,
        reason: 'inventory-full',
        slot: decision.slot,
        replacedItemId: null,
      }
    }
    slots = withReplacement
  }

  return {
    inventory: {
      ...normalized,
      slots,
      equipment: { ...normalized.equipment, [decision.slot]: itemId },
    },
    changed: true,
    reason: 'equipped',
    slot: decision.slot,
    replacedItemId,
  }
}

export function unequipItem(inventory, slot, itemDefs = ALL_ITEM_DEFS) {
  const normalized = normalizeEquipmentInventory(inventory, itemDefs)
  if (!isCanonicalEquipmentSlot(slot)) {
    return { inventory: normalized, changed: false, reason: 'invalid-slot', slot: null, itemId: null }
  }
  const itemId = normalized.equipment[slot]
  if (!itemId) {
    return { inventory: normalized, changed: false, reason: 'empty-slot', slot, itemId: null }
  }
  const slots = addOneCarried(normalized.slots, itemId, itemDefs)
  if (!slots) {
    return { inventory: normalized, changed: false, reason: 'inventory-full', slot, itemId }
  }
  return {
    inventory: {
      ...normalized,
      slots,
      equipment: { ...normalized.equipment, [slot]: null },
    },
    changed: true,
    reason: 'unequipped',
    slot,
    itemId,
  }
}

function finiteModifier(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function implicitItemModifiers(item, slot) {
  const tier = Math.max(1, Math.floor(Number(item?.tier) || 1))
  if (slot === 'weapon') {
    return { accuracyBonus: 2 + tier, damageBonus: 1 + tier }
  }
  if (slot === 'ammunition') {
    return { accuracyBonus: 1 + tier, damageBonus: tier }
  }
  if (DEFENSIVE_SLOTS.has(slot)) {
    return {
      defenseBonus: 1 + tier,
      maxHealthBonus: slot === 'body' ? 2 + (tier * 2) : tier,
    }
  }
  return {}
}

// Item definitions may provide explicit combatModifiers. Missing fields use a
// deterministic tier-and-slot baseline so every valid weapon/armor item has a
// real effect before specialized authored stats are added.
export function deriveCombatModifiers(equipment, itemDefs = ALL_ITEM_DEFS) {
  const normalized = normalizeEquipment(equipment, itemDefs)
  const totals = { ...EMPTY_COMBAT_MODIFIERS }

  for (const slot of CANONICAL_EQUIPMENT_SLOTS) {
    const item = itemDefinition(itemDefs, normalized[slot])
    if (!item) continue
    const implicit = implicitItemModifiers(item, slot)
    const explicit = item.combatModifiers && typeof item.combatModifiers === 'object'
      ? item.combatModifiers
      : {}
    totals.accuracyBonus += finiteModifier(explicit.accuracyBonus ?? implicit.accuracyBonus)
    totals.damageBonus += finiteModifier(explicit.damageBonus ?? implicit.damageBonus)
    totals.defenseBonus += finiteModifier(explicit.defenseBonus ?? implicit.defenseBonus)
    totals.maxHealthBonus += finiteModifier(explicit.maxHealthBonus ?? implicit.maxHealthBonus)
  }

  totals.attackDamageMultiplier = Number((1 + Math.max(0, totals.damageBonus) / 100).toFixed(6))
  totals.incomingDamageMultiplier = Number(Math.max(0.5, 1 - Math.max(0, totals.defenseBonus) / 200).toFixed(6))
  return totals
}
