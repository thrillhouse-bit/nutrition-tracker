import { describe, expect, it } from 'vitest'
import { advanceTick, deityAttack, spawnThreat } from '../src/game/state.js'
import { ALL_ITEM_DEFS, recipeById } from '../src/rpg/crafting.js'
import { createEquippedArena } from '../src/rpg/combatAdapter.js'
import { createEmptyEquipment } from '../src/rpg/equipment.js'
import { normalizeState } from '../src/rpg/save.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

function withEquipment(state, equipment) {
  return { ...state, inventory: { ...state.inventory, equipment } }
}

function adjacentThreat(arena, id = 'target') {
  return spawnThreat(arena, {
    id,
    x: arena.deity.x,
    y: arena.deity.y,
    radius: 11,
    health: 100,
    speed: 0.001,
  })
}

describe('equipment integration', () => {
  it('makes the craftable cypress helm real head armor', () => {
    expect(ALL_ITEM_DEFS['cypress-helm']).toMatchObject({
      category: 'armor',
      equipmentSlot: 'head',
      combatModifiers: { defenseBonus: 10, maxHealthBonus: 5 },
    })
    expect(recipeById('cypress-helm').outputs).toContainEqual({ itemId: 'cypress-helm', quantity: 1 })
  })

  it('equips and unequips through the shared reducer without duplication', () => {
    let state = createInitialState()
    state = {
      ...state,
      inventory: {
        ...state.inventory,
        slots: [...state.inventory.slots, { itemId: 'cypress-helm', quantity: 1 }],
      },
    }
    state = applyEvent(state, { type: 'EQUIP_ITEM', itemId: 'cypress-helm' })
    expect(state.inventory.equipment.head).toBe('cypress-helm')
    expect(state.inventory.slots.some((entry) => entry.itemId === 'cypress-helm')).toBe(false)

    state = applyEvent(state, { type: 'UNEQUIP_ITEM', slot: 'head' })
    expect(state.inventory.equipment.head).toBeNull()
    expect(state.inventory.slots.filter((entry) => entry.itemId === 'cypress-helm')).toHaveLength(1)
  })

  it('preserves intentional empty equipment through save normalization', () => {
    const state = createInitialState()
    state.inventory.equipment.weapon = null
    state.inventory.equipment.body = null
    const normalized = normalizeState(state)
    expect(normalized.inventory.equipment.weapon).toBeNull()
    expect(normalized.inventory.equipment.body).toBeNull()
  })

  it('changes actual melee damage and incoming contact damage', () => {
    const baseState = withEquipment(createInitialState(), createEmptyEquipment())
    const starterState = createInitialState()
    const armoredState = withEquipment(createInitialState(), {
      ...createInitialState().inventory.equipment,
      head: 'cypress-helm',
    })

    const baseAttack = deityAttack(adjacentThreat(createEquippedArena(baseState, 'apollo')))
    const gearedAttack = deityAttack(adjacentThreat(createEquippedArena(starterState, 'apollo')))
    expect(baseAttack.threats[0].health).toBe(84)
    expect(gearedAttack.threats[0].health).toBeLessThan(baseAttack.threats[0].health)

    const starterArena = createEquippedArena(starterState, 'apollo')
    const armoredArena = createEquippedArena(armoredState, 'apollo')
    const starterAfterHit = advanceTick(adjacentThreat(starterArena, 'starter'))
    const armoredAfterHit = advanceTick(adjacentThreat(armoredArena, 'armored'))
    const starterDamage = starterArena.deity.health - starterAfterHit.deity.health
    const armoredDamage = armoredArena.deity.health - armoredAfterHit.deity.health
    expect(armoredArena.deity.maxHealth).toBe(starterArena.deity.maxHealth + 5)
    expect(armoredDamage).toBeLessThan(starterDamage)
  })

  it('applies flat health after Atlas passive and never compounds between sessions', () => {
    const state = withEquipment(createInitialState(), {
      ...createInitialState().inventory.equipment,
      head: 'cypress-helm',
    })
    const first = createEquippedArena(state, 'atlas')
    const second = createEquippedArena(state, 'atlas')
    expect(first.deity.maxHealth).toBe(155)
    expect(second.deity.maxHealth).toBe(155)
    expect(second.config).toEqual(first.config)
  })
})
