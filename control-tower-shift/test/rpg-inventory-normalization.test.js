import { describe, expect, it } from 'vitest'
import {
  BANK_CAPACITY,
  INVENTORY_CAPACITY,
  ITEM_DEFS,
  normalizeInventory,
} from '../src/rpg/progression.js'
import { planDeathDrop } from '../src/rpg/wilderness.js'

describe('canonical inventory normalization', () => {
  it('floors quantities before validation and rejects non-finite or non-positive results', () => {
    const inventory = normalizeInventory({
      slots: [
        { itemId: 'thyme', quantity: 0.9 },
        { itemId: 'thyme', quantity: 1.9 },
        { itemId: 'copper-ore', quantity: Number.POSITIVE_INFINITY },
        { itemId: 'drachma', quantity: Number.NaN },
        { itemId: 'drachma', quantity: -2.5 },
        { itemId: 'drachma', quantity: '2' },
        { itemId: 'drachma', quantity: Symbol('not-a-number') },
      ],
    })

    expect(inventory.slots).toEqual([{ itemId: 'thyme', quantity: 1 }])
  })

  it('expands compact non-stackables to physical slots and caps overflow at 28', () => {
    const inventory = normalizeInventory({
      slots: [{ itemId: 'copper-ore', quantity: 100 }],
    })

    expect(inventory.capacity).toBe(INVENTORY_CAPACITY)
    expect(inventory.slots).toHaveLength(INVENTORY_CAPACITY)
    expect(inventory.slots.every((slot) => slot.itemId === 'copper-ore' && slot.quantity === 1)).toBe(true)
  })

  it('merges duplicate stackables by item ID without consuming extra slots', () => {
    const inventory = normalizeInventory({
      slots: [
        { itemId: 'drachma', quantity: 2.9 },
        { itemId: 'copper-ore', quantity: 100 },
        { itemId: 'drachma', quantity: 3.8 },
        { itemId: 'thyme', quantity: 5 },
      ],
    })

    expect(inventory.slots).toHaveLength(INVENTORY_CAPACITY)
    expect(inventory.slots[0]).toEqual({ itemId: 'drachma', quantity: 5 })
    expect(inventory.slots.filter((slot) => slot.itemId === 'drachma')).toHaveLength(1)
    expect(inventory.slots.filter((slot) => slot.itemId === 'copper-ore')).toHaveLength(27)
    expect(inventory.slots.filter((slot) => slot.itemId === 'thyme')).toHaveLength(0)
  })

  it('removes unknown IDs against the supplied registry and accepts supplied extensions', () => {
    const raw = {
      slots: [
        { itemId: 'unknown-relic', quantity: 4 },
        { itemId: 'crafted-token', quantity: 3 },
      ],
    }
    const definitions = {
      ...ITEM_DEFS,
      'crafted-token': { id: 'crafted-token', stackable: true },
    }

    expect(normalizeInventory(raw).slots).toEqual([])
    expect(normalizeInventory(raw, definitions).slots).toEqual([
      { itemId: 'crafted-token', quantity: 3 },
    ])
  })

  it('merges bank duplicates without expanding compact non-stackable quantities', () => {
    const inventory = normalizeInventory({
      slots: [],
      bank: {
        slots: [
          { itemId: 'copper-ore', quantity: 100 },
          { itemId: 'thyme', quantity: 1.9 },
          { itemId: 'copper-ore', quantity: 7.8 },
          { itemId: 'thyme', quantity: 0.5 },
          { itemId: 'drachma', quantity: 2 },
          { itemId: 'drachma', quantity: 3 },
        ],
      },
    })

    expect(inventory.bank.capacity).toBe(BANK_CAPACITY)
    expect(inventory.bank.slots).toEqual([
      { itemId: 'copper-ore', quantity: 107 },
      { itemId: 'thyme', quantity: 1 },
      { itemId: 'drachma', quantity: 5 },
    ])
  })

  it('keeps merging retained bank IDs after reaching 400 unique slots', () => {
    const definitions = Object.fromEntries(Array.from({ length: BANK_CAPACITY + 2 }, (_, index) => [
      `bank-item-${index}`,
      { id: `bank-item-${index}`, stackable: false },
    ]))
    const entries = Array.from({ length: BANK_CAPACITY + 2 }, (_, index) => ({
      itemId: `bank-item-${index}`,
      quantity: 1,
    }))
    entries.push({ itemId: 'bank-item-0', quantity: 4 })

    const inventory = normalizeInventory({ slots: [], bank: { slots: entries } }, definitions)

    expect(inventory.bank.slots).toHaveLength(BANK_CAPACITY)
    expect(inventory.bank.slots[0]).toEqual({ itemId: 'bank-item-0', quantity: 5 })
    expect(inventory.bank.slots.at(-1)).toEqual({ itemId: 'bank-item-399', quantity: 1 })
    expect(inventory.bank.slots.some((slot) => slot.itemId === 'bank-item-400')).toBe(false)
  })

  it('keeps capacity, item counts, and protected-item selection aligned to physical slots', () => {
    const inventory = normalizeInventory({
      currency: 0,
      slots: [{ itemId: 'copper-ore', quantity: 6 }],
    })
    const deathDrop = planDeathDrop({ inventory, riskBand: 'moderate' })

    expect(inventory.slots).toHaveLength(6)
    expect(deathDrop.kept).toHaveLength(3)
    expect(deathDrop.dropped).toHaveLength(3)
    expect([...deathDrop.kept, ...deathDrop.dropped].every((slot) => slot.quantity === 1)).toBe(true)
  })
})
