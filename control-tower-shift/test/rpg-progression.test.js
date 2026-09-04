import { describe, expect, it } from 'vitest'
import {
  INVENTORY_CAPACITY, SKILL_DEFS, addInventoryItem, awardSkillXp, depositAllMaterials, depositBankItem,
  createInitialInventory, createInitialSkills, levelForXp, xpForLevel,
  withdrawBankItem,
} from '../src/rpg/progression.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'

// Physical bank access requires the concrete bank entity on the map and a
// protagonist standing beside it. Position west of Beacon Overlook's bank
// (validated reachable) and open it through the reducer.
function openBeaconBank(state) {
  const map = rpgMapById('beacon-overlook')
  const bank = map.entities.find((candidate) => candidate.kind === 'bank')
  const near = { ...state, world: { ...state.world, mapId: 'beacon-overlook', position: { x: bank.x - 8, y: bank.y } } }
  return applyEvent(near, { type: 'OPEN_BANK', entityId: bank.id })
}
function atBeaconResource(state, entityId) { const map = rpgMapById('beacon-overlook'); const entity = map.entities.find((candidate) => candidate.id === entityId); return { ...state, world: { ...state.world, mapId: map.id, regionId: map.region, spawnId: map.spawn.id, position: { x: entity.x, y: entity.y } } } }

describe('mythic skill progression', () => {
  it('uses a deterministic accelerating 1–99 XP curve', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(83)
    expect(xpForLevel(10)).toBe(1154)
    expect(xpForLevel(99)).toBe(13034431)
    expect(levelForXp(82)).toBe(1)
    expect(levelForXp(83)).toBe(2)
    expect(levelForXp(xpForLevel(99))).toBe(99)
  })

  it('creates every original Greek skill and awards only valid positive XP', () => {
    const initial = { progression: { skills: createInitialSkills(), totalXp: 0 } }
    const gained = awardSkillXp(initial, 'spearcraft', 125.9)
    expect(gained.progression.skills.spearcraft.xp).toBe(125)
    expect(gained.progression.totalXp).toBe(125)
    expect(Object.keys(gained.progression.skills)).toHaveLength(SKILL_DEFS.length)
    expect(awardSkillXp(gained, 'not-a-skill', 100)).toBe(gained)
  })
})

describe('28-slot material inventory', () => {
  it('stacks currency but gives gathered materials one slot each', () => {
    let inventory = createInitialInventory()
    let result = addInventoryItem(inventory, 'drachma', 20)
    inventory = result.inventory
    result = addInventoryItem(inventory, 'drachma', 5)
    inventory = result.inventory
    expect(inventory.slots.find((slot) => slot.itemId === 'drachma').quantity).toBe(25)

    result = addInventoryItem(inventory, 'copper-ore', 40)
    expect(result.inventory.slots).toHaveLength(INVENTORY_CAPACITY)
    expect(result.added).toBe(INVENTORY_CAPACITY - inventory.slots.length)
  })

  it('banks materials by item and withdraws them back into physical slots', () => {
    let inventory = addInventoryItem(createInitialInventory(), 'copper-ore', 3).inventory
    inventory = addInventoryItem(inventory, 'thyme', 2).inventory
    inventory = depositAllMaterials(inventory)
    expect(inventory.bank.slots.find((slot) => slot.itemId === 'copper-ore').quantity).toBe(3)
    expect(inventory.slots.every((slot) => slot.itemId === 'barley-flatbread')).toBe(true)
    inventory = withdrawBankItem(inventory, 'copper-ore', 2)
    expect(inventory.slots.filter((slot) => slot.itemId === 'copper-ore')).toHaveLength(2)
    expect(inventory.bank.slots.find((slot) => slot.itemId === 'copper-ore').quantity).toBe(1)
  })

  it('deposits one explicitly selected carried item for bank-aware crafting', () => {
    const deposited = depositBankItem(createInitialInventory(), 'barley-flatbread', 1)
    expect(deposited.slots.filter((entry) => entry.itemId === 'barley-flatbread')).toHaveLength(2)
    expect(deposited.bank.slots).toContainEqual({ itemId: 'barley-flatbread', quantity: 1 })
  })
})

describe('authored gathering actions', () => {
  it('adds the mapped material and grants only its mapped skill XP', () => {
    const initial = atBeaconResource(createInitialState(), 'wild-thyme')
    const gathered = applyEvent(initial, { type: 'GATHER', entityId: 'wild-thyme' })
    expect(gathered.inventory.slots.some((slot) => slot.itemId === 'thyme')).toBe(true)
    expect(gathered.progression.skills.foraging.xp).toBe(12)
    expect(gathered.progression.skills.quarrying.xp).toBe(0)
    expect(gathered.progression.totalXp).toBe(12)
  })

  it('moves gathered materials through the bank without touching food', () => {
    let state = atBeaconResource(createInitialState(), 'copper-seam')
    state = applyEvent(state, { type: 'GATHER', entityId: 'copper-seam' })
    state = openBeaconBank(state)
    state = applyEvent(state, { type: 'BANK_DEPOSIT_MATERIALS' })
    expect(state.inventory.bank.slots).toEqual([{ itemId: 'copper-ore', quantity: 1 }])
    expect(state.inventory.slots.every((slot) => slot.itemId === 'barley-flatbread')).toBe(true)
    state = applyEvent(state, { type: 'BANK_WITHDRAW', itemId: 'copper-ore', quantity: 1 })
    expect(state.inventory.bank.slots).toEqual([])
    expect(state.inventory.slots.some((slot) => slot.itemId === 'copper-ore')).toBe(true)
  })
})
