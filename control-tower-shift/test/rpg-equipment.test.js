import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import {
  CANONICAL_EQUIPMENT_SLOTS,
  createEmptyEquipment,
  deriveCombatModifiers,
  equipItem,
  equipmentDecision,
  isCanonicalEquipmentSlot,
  normalizeEquipment,
  unequipItem,
} from '../src/rpg/equipment.js'
import { EQUIPMENT_SLOTS, INVENTORY_CAPACITY, createInitialInventory } from '../src/rpg/progression.js'

const TEST_ITEM_DEFS = Object.freeze({
  ...ALL_ITEM_DEFS,
  'bronze-spear': {
    id: 'bronze-spear',
    name: 'Bronze Spear',
    category: 'weapon',
    equipmentSlot: 'weapon',
    stackable: false,
    tier: 5,
    combatModifiers: { accuracyBonus: 9, damageBonus: 12 },
  },
  'bronze-helm': {
    id: 'bronze-helm',
    name: 'Bronze Helm',
    category: 'armor',
    equipmentSlot: 'head',
    stackable: false,
    tier: 4,
    combatModifiers: { defenseBonus: 8, maxHealthBonus: 3 },
  },
  'packed-charm': {
    id: 'packed-charm',
    name: 'Packed Charm',
    category: 'armor',
    equipmentSlot: 'amulet',
    stackable: true,
    tier: 2,
  },
})

function withCarried(inventory, itemId, quantity = 1) {
  return { ...inventory, slots: [...inventory.slots, { itemId, quantity }] }
}

describe('equipment normalization', () => {
  it('uses the canonical progression slots in stable order', () => {
    expect(CANONICAL_EQUIPMENT_SLOTS).toEqual(EQUIPMENT_SLOTS)
    expect(isCanonicalEquipmentSlot('weapon')).toBe(true)
    expect(isCanonicalEquipmentSlot('backpack')).toBe(false)
  })

  it('permits intentional empty slots instead of restoring starter gear', () => {
    const normalized = normalizeEquipment({ weapon: null, body: null }, TEST_ITEM_DEFS)
    expect(normalized).toEqual(createEmptyEquipment())
    expect(normalized.weapon).toBeNull()
    expect(normalized.body).toBeNull()
  })

  it('keeps only known items assigned to their declared canonical slot', () => {
    const normalized = normalizeEquipment({
      weapon: 'bronze-helm',
      head: 'bronze-helm',
      body: 'missing-item',
      backpack: 'bronze-spear',
    }, TEST_ITEM_DEFS)
    expect(normalized.head).toBe('bronze-helm')
    expect(normalized.weapon).toBeNull()
    expect(normalized.body).toBeNull()
    expect(normalized).not.toHaveProperty('backpack')
  })
})

describe('equip and unequip transactions', () => {
  it('rejects unknown, non-equippable, absent, and already-equipped items', () => {
    const inventory = createInitialInventory()
    expect(equipmentDecision(inventory, 'missing', TEST_ITEM_DEFS).reason).toBe('unknown-item')
    expect(equipmentDecision(inventory, 'thyme', TEST_ITEM_DEFS).reason).toBe('not-equippable')
    expect(equipmentDecision(inventory, 'bronze-spear', TEST_ITEM_DEFS).reason).toBe('not-carried')
    expect(equipmentDecision(inventory, 'oath-spear', TEST_ITEM_DEFS).reason).toBe('already-equipped')
  })

  it('atomically equips a carried item and returns replaced gear to the pack', () => {
    const initial = withCarried(createInitialInventory(), 'bronze-spear')
    const result = equipItem(initial, 'bronze-spear', TEST_ITEM_DEFS)
    expect(result).toMatchObject({
      changed: true,
      reason: 'equipped',
      slot: 'weapon',
      replacedItemId: 'oath-spear',
    })
    expect(result.inventory.equipment.weapon).toBe('bronze-spear')
    expect(result.inventory.slots.some((entry) => entry.itemId === 'bronze-spear')).toBe(false)
    expect(result.inventory.slots).toContainEqual({ itemId: 'oath-spear', quantity: 1 })
    expect(initial.equipment.weapon).toBe('oath-spear')
  })

  it('unequips into a free pack slot and preserves the intentional empty slot', () => {
    const result = unequipItem(createInitialInventory(), 'body', TEST_ITEM_DEFS)
    expect(result).toMatchObject({ changed: true, reason: 'unequipped', slot: 'body', itemId: 'traveler-tunic' })
    expect(result.inventory.equipment.body).toBeNull()
    expect(result.inventory.slots).toContainEqual({ itemId: 'traveler-tunic', quantity: 1 })
    expect(normalizeEquipment(result.inventory.equipment, TEST_ITEM_DEFS).body).toBeNull()
  })

  it('rejects invalid or empty slots without changing equipped gear', () => {
    const inventory = createInitialInventory()
    expect(unequipItem(inventory, 'backpack', TEST_ITEM_DEFS)).toMatchObject({
      changed: false,
      reason: 'invalid-slot',
    })
    expect(unequipItem(inventory, 'head', TEST_ITEM_DEFS)).toMatchObject({
      changed: false,
      reason: 'empty-slot',
    })
  })

  it('refuses to unequip into a full pack and remains atomic', () => {
    const inventory = {
      ...createInitialInventory(),
      slots: Array.from({ length: INVENTORY_CAPACITY }, () => ({ itemId: 'barley-flatbread', quantity: 1 })),
    }
    const result = unequipItem(inventory, 'weapon', TEST_ITEM_DEFS)
    expect(result).toMatchObject({ changed: false, reason: 'inventory-full', itemId: 'oath-spear' })
    expect(result.inventory.equipment.weapon).toBe('oath-spear')
    expect(result.inventory.slots).toHaveLength(INVENTORY_CAPACITY)
  })

  it('handles a future stackable equipment item without duplicating quantities', () => {
    const inventory = withCarried({ ...createInitialInventory(), equipment: createEmptyEquipment() }, 'packed-charm', 3)
    const equipped = equipItem(inventory, 'packed-charm', TEST_ITEM_DEFS)
    expect(equipped.inventory.equipment.amulet).toBe('packed-charm')
    expect(equipped.inventory.slots).toContainEqual({ itemId: 'packed-charm', quantity: 2 })
    const unequipped = unequipItem(equipped.inventory, 'amulet', TEST_ITEM_DEFS)
    expect(unequipped.inventory.slots).toContainEqual({ itemId: 'packed-charm', quantity: 3 })
  })
})

describe('derived combat modifiers', () => {
  it('combines authored bonuses and exposes bounded arena-ready multipliers', () => {
    const modifiers = deriveCombatModifiers({
      weapon: 'bronze-spear',
      head: 'bronze-helm',
    }, TEST_ITEM_DEFS)
    expect(modifiers).toEqual({
      accuracyBonus: 9,
      damageBonus: 12,
      defenseBonus: 8,
      maxHealthBonus: 3,
      attackDamageMultiplier: 1.12,
      incomingDamageMultiplier: 0.96,
    })
  })

  it('gives built-in starter equipment deterministic tier-based effects', () => {
    const modifiers = deriveCombatModifiers(createInitialInventory().equipment, TEST_ITEM_DEFS)
    expect(modifiers).toMatchObject({
      accuracyBonus: 3,
      damageBonus: 5,
      defenseBonus: 2,
      maxHealthBonus: 0,
      attackDamageMultiplier: 1.05,
      incomingDamageMultiplier: 0.99,
    })
  })

  it('returns neutral modifiers for empty or malformed equipment', () => {
    expect(deriveCombatModifiers(null, TEST_ITEM_DEFS)).toEqual({
      accuracyBonus: 0,
      damageBonus: 0,
      defenseBonus: 0,
      maxHealthBonus: 0,
      attackDamageMultiplier: 1,
      incomingDamageMultiplier: 1,
    })
  })
})
