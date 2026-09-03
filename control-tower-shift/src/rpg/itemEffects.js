// Deterministic consumable contracts for the RPG domain.
//
// Foods are encounter-only recovery. Salves, tonics, and blessings are
// prepared while exploring, persist in save-safe string flags, and are spent
// when the next encounter is constructed. Prepared benefits never survive the
// encounter boundary (victory, defeat, or interrupted-save recovery).

import { carriedItemQuantity, removeInventoryItem } from './progression.js'

export const PENDING_CONSUMABLE_FLAG_PREFIX = 'consumable:prepared:'

const food = (heal) => Object.freeze({ activation: 'combat', kind: 'heal', heal })
const preparation = (slot, modifiers) => Object.freeze({
  activation: 'next-encounter',
  kind: slot,
  slot,
  modifiers: Object.freeze({ ...modifiers }),
})

export const ITEM_EFFECTS = Object.freeze({
  'barley-flatbread': food(12),
  'clay-loaf': food(10),
  'grain-pottage': food(20),
  'herb-cake': food(28),
  'sage-barley-broth': food(38),
  'honeyed-figs': food(36),
  'tuna-stew': food(48),
  'herbal-salve': preparation('salve', { maxHealthBonus: 12 }),
  'sage-tonic': preparation('tonic', { incomingDamageMultiplier: 0.92 }),
  'moly-tonic': preparation('tonic', { incomingDamageMultiplier: 0.85, statusWard: 'Moly ward' }),
  'ambrosia-distillate': preparation('tonic', { maxHealthBonus: 25, statusWard: 'Ambrosial vigor' }),
  'ash-blessing': preparation('blessing', { attackDamageMultiplier: 1.18 }),
  'votive-favor': preparation('blessing', { incomingDamageMultiplier: 0.9 }),
})

export const CONSUMABLE_LOADOUT_SLOTS = Object.freeze(['salve', 'tonic', 'blessing'])

export function consumableEffect(itemId) {
  return typeof itemId === 'string' ? ITEM_EFFECTS[itemId] || null : null
}

export function isConsumableItem(itemId) {
  return Boolean(consumableEffect(itemId))
}

export function preparedConsumableFlag(slot) {
  return `${PENDING_CONSUMABLE_FLAG_PREFIX}${slot}`
}

export function pendingConsumableLoadout(state) {
  const flags = state?.flags || {}
  return Object.freeze(Object.fromEntries(CONSUMABLE_LOADOUT_SLOTS.map((slot) => {
    const itemId = flags[preparedConsumableFlag(slot)]
    const effect = consumableEffect(itemId)
    return [slot, effect?.activation === 'next-encounter' && effect.slot === slot ? itemId : null]
  })))
}

export function prepareConsumableDecision(state, itemId, itemDefs) {
  const effect = consumableEffect(itemId)
  if (state?.status !== 'playing') return Object.freeze({ allowed: false, reason: 'Consumables may be prepared only while exploring.' })
  if (!effect) return Object.freeze({ allowed: false, reason: 'That item is not consumable.' })
  if (effect.activation !== 'next-encounter') return Object.freeze({ allowed: false, reason: 'Food is used during an encounter.' })
  if (!itemDefs?.[itemId] || carriedItemQuantity(state.inventory, itemId, itemDefs) < 1) {
    return Object.freeze({ allowed: false, reason: 'That item is not in the backpack.' })
  }
  const existing = pendingConsumableLoadout(state)[effect.slot]
  if (existing) return Object.freeze({ allowed: false, reason: `A ${effect.slot} is already prepared.` })
  return Object.freeze({ allowed: true, reason: '', slot: effect.slot })
}

export function prepareConsumable(state, itemId, itemDefs) {
  const decision = prepareConsumableDecision(state, itemId, itemDefs)
  if (!decision.allowed) return state
  const removed = removeInventoryItem(state.inventory, itemId, 1, itemDefs)
  if (removed.removed !== 1) return state
  return {
    ...state,
    inventory: removed.inventory,
    flags: { ...state.flags, [preparedConsumableFlag(decision.slot)]: itemId },
  }
}

// Spend all valid preparations exactly once at encounter construction. The
// returned checkpoint has the preparation flags removed, so defeat/reload can
// never refund a loadout that already entered combat.
export function consumePendingConsumableLoadout(state) {
  const loadout = pendingConsumableLoadout(state)
  const flags = { ...(state?.flags || {}) }
  for (const slot of CONSUMABLE_LOADOUT_SLOTS) delete flags[preparedConsumableFlag(slot)]
  return { state: { ...state, flags }, loadout }
}

export function deriveConsumableModifiers(loadout) {
  let maxHealthBonus = 0
  let attackDamageMultiplier = 1
  let incomingDamageMultiplier = 1
  const statusWards = []
  const itemIds = []
  for (const slot of CONSUMABLE_LOADOUT_SLOTS) {
    const itemId = loadout?.[slot]
    const effect = consumableEffect(itemId)
    if (effect?.activation !== 'next-encounter' || effect.slot !== slot) continue
    itemIds.push(itemId)
    maxHealthBonus += Number(effect.modifiers.maxHealthBonus) || 0
    attackDamageMultiplier *= Number(effect.modifiers.attackDamageMultiplier) || 1
    incomingDamageMultiplier *= Number(effect.modifiers.incomingDamageMultiplier) || 1
    if (effect.modifiers.statusWard) statusWards.push(effect.modifiers.statusWard)
  }
  return Object.freeze({
    maxHealthBonus,
    attackDamageMultiplier,
    incomingDamageMultiplier,
    statusWards: Object.freeze(statusWards),
    itemIds: Object.freeze(itemIds),
  })
}

export function combatConsumableDecision(session, itemId, useId) {
  const effect = consumableEffect(itemId)
  if (!session || session.settled) return Object.freeze({ allowed: false, reason: 'There is no active encounter.' })
  if (effect?.activation !== 'combat' || effect.kind !== 'heal') {
    return Object.freeze({ allowed: false, reason: 'That item cannot be used in combat.' })
  }
  if (typeof useId !== 'string' || !useId) return Object.freeze({ allowed: false, reason: 'The use request is invalid.' })
  if ((session.consumableUseIds || []).includes(useId)) return Object.freeze({ allowed: false, reason: 'That use was already resolved.' })
  const health = Number(session.arena?.deity?.health)
  const maxHealth = Number(session.arena?.deity?.maxHealth)
  if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || health >= maxHealth) {
    return Object.freeze({ allowed: false, reason: 'Health is already full.' })
  }
  const healed = Math.min(effect.heal, maxHealth - health)
  return Object.freeze({ allowed: healed > 0, reason: healed > 0 ? '' : 'Health is already full.', healed })
}

export function applyCombatConsumableEffect(session, itemId, useId) {
  const decision = combatConsumableDecision(session, itemId, useId)
  if (!decision.allowed) return session
  return {
    ...session,
    arena: {
      ...session.arena,
      deity: { ...session.arena.deity, health: session.arena.deity.health + decision.healed },
    },
    consumableUseIds: [...(session.consumableUseIds || []), useId],
    lastConsumable: Object.freeze({ itemId, healed: decision.healed, useId }),
  }
}

// Inventory half of a combat-use transaction. The adapter must first accept
// the same useId; this function then consumes exactly one and writes the id to
// the reducer snapshot. Story checkpoints are updated so defeat cannot refund
// food already eaten during that encounter.
export function consumeCombatInventoryItem(state, itemId, useId, itemDefs, encounterId) {
  const effect = consumableEffect(itemId)
  const snapshot = state?.combatSnapshot
  if (state?.status !== 'in-combat' || effect?.activation !== 'combat' || !snapshot) return state
  if (typeof encounterId !== 'string' || encounterId !== snapshot.encounterId) return state
  if (typeof useId !== 'string' || !useId || (snapshot.consumableUseIds || []).includes(useId)) return state
  const removed = removeInventoryItem(state.inventory, itemId, 1, itemDefs)
  if (removed.removed !== 1) return state
  const checkpoint = snapshot.checkpoint
  const checkpointRemoval = checkpoint
    ? removeInventoryItem(checkpoint.inventory, itemId, 1, itemDefs)
    : null
  return {
    ...state,
    inventory: removed.inventory,
    combatSnapshot: {
      ...snapshot,
      consumableUseIds: [...(snapshot.consumableUseIds || []), useId],
      ...(checkpoint && checkpointRemoval?.removed === 1
        ? { checkpoint: { ...checkpoint, inventory: checkpointRemoval.inventory } }
        : {}),
    },
  }
}
