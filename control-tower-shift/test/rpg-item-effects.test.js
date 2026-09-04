import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS } from '../src/rpg/crafting.js'
import {
  combatConsumableUseDecision,
  createEquippedArena,
  resolveCombatConsumableUse,
  useCombatConsumable,
} from '../src/rpg/combatAdapter.js'
import {
  ITEM_EFFECTS,
  pendingConsumableLoadout,
  preparedConsumableFlag,
} from '../src/rpg/itemEffects.js'
import { normalizeState } from '../src/rpg/save.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'

function entryCourtState() {
  let state = createInitialState()
  const map = rpgMapById('beacon-overlook')
  const thessa = map.entities.find((entity) => entity.id === 'thessa')
  const thessaPath = findWorldPath(map, state.world.position, thessa)
  expect(thessaPath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: thessaPath.at(-1) } }
  state = applyEvent(state, { type: 'TALK', npcId: 'thessa', conversationId: 'act1-thessa-overlook' })
  state = applyEvent(state, { type: 'DIALOGUE_END', conversationId: 'act1-thessa-overlook' })
  const shrine = rpgMapById('beacon-overlook').entities.find((entity) => entity.id === 'shrine')
  const shrinePath = findWorldPath(map, state.world.position, shrine)
  expect(shrinePath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: shrinePath.at(-1) } }
  state = applyEvent(state, { type: 'INTERACT', entityId: 'shrine' })
  state = applyEvent(state, { type: 'CHOOSE_PATRON', godId: 'apollo' })
  const exit = rpgMapById('beacon-overlook').exits.find((candidate) => candidate.id === 'to-olive-road')
  const exitPath = findWorldPath(map, state.world.position, exit)
  expect(exitPath.length).toBeGreaterThan(0)
  state = { ...state, world: { ...state.world, position: exitPath.at(-1) } }
  return applyEvent(state, { type: 'TRAVERSE', viaGate: 'to-olive-road', toMapId: 'olive-road', spawnId: 'from-beacon' })
}

function addSlot(state, itemId) {
  return { ...state, inventory: { ...state.inventory, slots: [...state.inventory.slots, { itemId, quantity: 1 }] } }
}

describe('consumable item effects', () => {
  it('publishes explicit effects without changing economy-facing item identity', () => {
    expect(ALL_ITEM_DEFS['grain-pottage']).toMatchObject({
      name: 'Grain Pottage', category: 'food', tier: 2,
      consumableEffect: { activation: 'combat', kind: 'heal', heal: 20 },
    })
    expect(ALL_ITEM_DEFS['herbal-salve'].consumableEffect).toEqual(ITEM_EFFECTS['herbal-salve'])
    expect(ALL_ITEM_DEFS['moly-tonic'].consumableEffect.slot).toBe('tonic')
    expect(ALL_ITEM_DEFS['ash-blessing'].consumableEffect.slot).toBe('blessing')
  })

  it('prepares one item per loadout slot, persists it, and leaves duplicates inert', () => {
    let state = addSlot(addSlot(createInitialState(), 'herbal-salve'), 'herbal-salve')
    const prepared = applyEvent(state, { type: 'USE_ITEM', itemId: 'herbal-salve' })
    expect(prepared.inventory.slots.filter((entry) => entry.itemId === 'herbal-salve')).toHaveLength(1)
    expect(pendingConsumableLoadout(prepared).salve).toBe('herbal-salve')
    expect(normalizeState(prepared).flags[preparedConsumableFlag('salve')]).toBe('herbal-salve')
    expect(applyEvent(prepared, { type: 'USE_ITEM', itemId: 'herbal-salve' })).toBe(prepared)
    expect(applyEvent(prepared, { type: 'USE_ITEM', itemId: 'oath-spear' })).toBe(prepared)
  })

  it('spends prepared aid at encounter start and applies it for exactly that encounter', () => {
    let state = addSlot(addSlot(entryCourtState(), 'herbal-salve'), 'ash-blessing')
    state = applyEvent(state, { type: 'USE_ITEM', itemId: 'herbal-salve' })
    state = applyEvent(state, { type: 'USE_ITEM', itemId: 'ash-blessing' })
    const entered = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
    expect(pendingConsumableLoadout(entered)).toEqual({ salve: null, tonic: null, blessing: null })
    expect(entered.combatSnapshot.consumableLoadout).toMatchObject({ salve: 'herbal-salve', blessing: 'ash-blessing' })

    const arena = createEquippedArena(entered, 'apollo')
    const ordinary = createEquippedArena(entryCourtState(), 'apollo')
    expect(arena.deity.maxHealth).toBe(ordinary.deity.maxHealth + 12)
    expect(arena.config.autoAttackDamage).toBeCloseTo(ordinary.config.autoAttackDamage * 1.18)

    const restored = applyEvent(entered, { type: 'COMBAT_FAILED', encounterId: 'enc-act1-entry' })
    expect(pendingConsumableLoadout(restored)).toEqual({ salve: null, tonic: null, blessing: null })
  })

  it('heals deterministically, rejects full health, and resolves duplicate use ids once', () => {
    let state = entryCourtState()
    const entered = applyEvent(state, { type: 'ENTER_ENCOUNTER', encounterId: 'enc-act1-entry' })
    const baseSession = {
      encounterId: 'enc-act1-entry',
      settled: false,
      arena: createEquippedArena(entered, 'apollo'),
    }
    expect(combatConsumableUseDecision(baseSession, 'barley-flatbread', 'use-1')).toMatchObject({ allowed: false })
    expect(useCombatConsumable(baseSession, 'barley-flatbread', 'use-1')).toBe(baseSession)
    expect(resolveCombatConsumableUse(entered, baseSession, 'barley-flatbread', 'use-1', ALL_ITEM_DEFS)).toMatchObject({
      allowed: false,
      state: entered,
      session: baseSession,
    })

    const hurt = {
      ...baseSession,
      arena: { ...baseSession.arena, deity: { ...baseSession.arena.deity, health: baseSession.arena.deity.maxHealth - 20 } },
    }
    const healed = useCombatConsumable(hurt, 'barley-flatbread', 'use-1')
    expect(healed.arena.deity.health).toBe(hurt.arena.deity.health + 12)
    expect(useCombatConsumable(healed, 'barley-flatbread', 'use-1')).toBe(healed)

    const stale = { ...hurt, encounterId: 'stale-encounter' }
    expect(resolveCombatConsumableUse(entered, stale, 'barley-flatbread', 'stale-use', ALL_ITEM_DEFS)).toMatchObject({
      allowed: false,
      reason: 'That encounter is no longer active.',
      state: entered,
    })

    const transaction = resolveCombatConsumableUse(entered, hurt, 'barley-flatbread', 'use-1', ALL_ITEM_DEFS)
    expect(transaction.allowed).toBe(true)
    expect(transaction.healed).toBe(12)
    expect(transaction.state.inventory.slots.filter((entry) => entry.itemId === 'barley-flatbread')).toHaveLength(2)

    expect(applyEvent(entered, {
      type: 'USE_ITEM', itemId: 'barley-flatbread', useId: 'wrong', encounterId: 'stale-encounter',
    })).toBe(entered)
    const consumed = applyEvent(entered, {
      type: 'USE_ITEM', itemId: 'barley-flatbread', useId: 'use-1', encounterId: 'enc-act1-entry',
    })
    expect(consumed.inventory.slots.filter((entry) => entry.itemId === 'barley-flatbread')).toHaveLength(2)
    expect(applyEvent(consumed, {
      type: 'USE_ITEM', itemId: 'barley-flatbread', useId: 'use-1', encounterId: 'enc-act1-entry',
    })).toBe(consumed)
    const failed = applyEvent(consumed, { type: 'COMBAT_FAILED', encounterId: 'enc-act1-entry' })
    expect(failed.inventory.slots.filter((entry) => entry.itemId === 'barley-flatbread')).toHaveLength(2)
  })
})
