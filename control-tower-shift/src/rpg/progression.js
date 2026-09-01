export const MAX_SKILL_LEVEL = 99
export const INVENTORY_CAPACITY = 28
export const BANK_CAPACITY = 400

export const SKILL_DEFS = Object.freeze([
  { id: 'spearcraft', name: 'Spearcraft', group: 'Combat', description: 'Accuracy and advanced spear forms.' },
  { id: 'might', name: 'Might', group: 'Combat', description: 'Melee force and carrying power.' },
  { id: 'guard', name: 'Guard', group: 'Combat', description: 'Armor use, blocks, and physical resilience.' },
  { id: 'vitality', name: 'Vitality', group: 'Combat', description: 'Maximum life and recovery.' },
  { id: 'marksmanship', name: 'Marksmanship', group: 'Combat', description: 'Bows, slings, and thrown weapons.' },
  { id: 'stormcalling', name: 'Stormcalling', group: 'Divine', description: 'Lightning, weather, and divine power.' },
  { id: 'devotion', name: 'Devotion', group: 'Divine', description: 'Favor, blessings, and resistance to curses.' },
  { id: 'oathkeeping', name: 'Oathkeeping', group: 'Divine', description: 'Witness covenants and unlock mythic choices.' },
  { id: 'quarrying', name: 'Quarrying', group: 'Gathering', description: 'Mine stone, ore, gems, and divine metals.' },
  { id: 'woodcutting', name: 'Woodcutting', group: 'Gathering', description: 'Harvest olive, cypress, cedar, and sacred timber.' },
  { id: 'fishing', name: 'Fishing', group: 'Gathering', description: 'Catch food and rare creatures from mythic waters.' },
  { id: 'foraging', name: 'Foraging', group: 'Gathering', description: 'Gather herbs, fibers, fruit, and reagents.' },
  { id: 'stewardship', name: 'Stewardship', group: 'Gathering', description: 'Restore land, tend crops, and improve settlements.' },
  { id: 'bronzework', name: 'Bronzework', group: 'Artisan', description: 'Smelt ore and forge weapons and armor.' },
  { id: 'carpentry', name: 'Carpentry', group: 'Artisan', description: 'Shape timber into tools, bows, and structures.' },
  { id: 'cooking', name: 'Cooking', group: 'Artisan', description: 'Prepare restorative food and feast offerings.' },
  { id: 'alchemy', name: 'Alchemy', group: 'Artisan', description: 'Brew remedies, oils, poisons, and transmutations.' },
  { id: 'weaving', name: 'Weaving', group: 'Artisan', description: 'Craft cloth, leather, jewelry, and ritual gear.' },
  { id: 'hearthkeeping', name: 'Hearthkeeping', group: 'Artisan', description: 'Tend fires, kilns, camps, and sacred flames.' },
  { id: 'wayfinding', name: 'Wayfinding', group: 'World', description: 'Traverse hazards, shortcuts, and distant routes.' },
  { id: 'guile', name: 'Guile', group: 'World', description: 'Stealth, locks, traps, and misdirection.' },
  { id: 'beastbond', name: 'Beastbond', group: 'World', description: 'Track, calm, and call mythic creatures.' },
])

export const SKILL_DEF_BY_ID = Object.freeze(Object.fromEntries(SKILL_DEFS.map((skill) => [skill.id, skill])))

// The classic exponential 1–99 curve: early levels arrive quickly, while
// mastery remains a long-term pursuit. Values are deterministic integers.
export function xpForLevel(level) {
  const target = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(level)))
  let points = 0
  for (let current = 1; current < target; current += 1) {
    points += Math.floor(current + 300 * (2 ** (current / 7)))
  }
  return Math.floor(points / 4)
}

export function levelForXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0))
  for (let level = 2; level <= MAX_SKILL_LEVEL; level += 1) {
    if (safeXp < xpForLevel(level)) return level - 1
  }
  return MAX_SKILL_LEVEL
}

export function createInitialSkills() {
  return Object.fromEntries(SKILL_DEFS.map((skill) => [skill.id, { xp: 0 }]))
}

export function normalizeSkills(raw) {
  const baseline = createInitialSkills()
  for (const skill of SKILL_DEFS) {
    const xp = raw?.[skill.id]?.xp
    if (Number.isFinite(xp)) baseline[skill.id] = { xp: Math.max(0, Math.floor(xp)) }
  }
  return baseline
}

export function awardSkillXp(state, skillId, amount) {
  if (!SKILL_DEF_BY_ID[skillId] || !Number.isFinite(amount) || amount <= 0) return state
  const skills = normalizeSkills(state.progression?.skills)
  const gain = Math.floor(amount)
  skills[skillId] = { xp: skills[skillId].xp + gain }
  return {
    ...state,
    progression: {
      ...state.progression,
      skills,
      totalXp: Math.max(0, Math.floor(state.progression?.totalXp || 0)) + gain,
    },
  }
}

export function awardSkillXpBundle(state, rewards) {
  return (rewards || []).reduce((next, reward) => awardSkillXp(next, reward.skillId, reward.amount), state)
}

export const ITEM_DEFS = Object.freeze({
  'oath-spear': { id: 'oath-spear', name: 'Oath-Spear', category: 'weapon', equipmentSlot: 'weapon', stackable: false, tier: 1, combatModifiers: Object.freeze({ accuracyBonus: 3, damageBonus: 5 }) },
  'traveler-tunic': { id: 'traveler-tunic', name: 'Traveler Tunic', category: 'armor', equipmentSlot: 'body', stackable: false, tier: 1, combatModifiers: Object.freeze({ defenseBonus: 2, maxHealthBonus: 0 }) },
  'barley-flatbread': { id: 'barley-flatbread', name: 'Barley Flatbread', category: 'food', stackable: false, tier: 1 },
  'copper-ore': { id: 'copper-ore', name: 'Copper Ore', category: 'ore', stackable: false, tier: 1 },
  'tin-ore': { id: 'tin-ore', name: 'Tin Ore', category: 'ore', stackable: false, tier: 1 },
  'iron-ore': { id: 'iron-ore', name: 'Iron Ore', category: 'ore', stackable: false, tier: 10 },
  'silver-ore': { id: 'silver-ore', name: 'Silver Ore', category: 'ore', stackable: false, tier: 20 },
  'celestial-bronze': { id: 'celestial-bronze', name: 'Celestial Bronze', category: 'bar', stackable: false, tier: 40 },
  orichalcum: { id: 'orichalcum', name: 'Orichalcum', category: 'ore', stackable: false, tier: 60 },
  'olive-log': { id: 'olive-log', name: 'Olive Log', category: 'wood', stackable: false, tier: 1 },
  'cypress-log': { id: 'cypress-log', name: 'Cypress Log', category: 'wood', stackable: false, tier: 15 },
  'cedar-log': { id: 'cedar-log', name: 'Cedar Log', category: 'wood', stackable: false, tier: 30 },
  'laurel-branch': { id: 'laurel-branch', name: 'Laurel Branch', category: 'wood', stackable: false, tier: 45 },
  'ambrosial-ash': { id: 'ambrosial-ash', name: 'Ambrosial Ash', category: 'wood', stackable: false, tier: 70 },
  sardine: { id: 'sardine', name: 'Sardine', category: 'fish', stackable: false, tier: 1 },
  'red-mullet': { id: 'red-mullet', name: 'Red Mullet', category: 'fish', stackable: false, tier: 15 },
  tuna: { id: 'tuna', name: 'Tuna', category: 'fish', stackable: false, tier: 30 },
  sturgeon: { id: 'sturgeon', name: 'Sturgeon', category: 'fish', stackable: false, tier: 50 },
  'hippocamp-roe': { id: 'hippocamp-roe', name: 'Hippocamp Roe', category: 'fish', stackable: false, tier: 75 },
  thyme: { id: 'thyme', name: 'Wild Thyme', category: 'herb', stackable: false, tier: 1 },
  sage: { id: 'sage', name: 'Mountain Sage', category: 'herb', stackable: false, tier: 10 },
  asphodel: { id: 'asphodel', name: 'Asphodel', category: 'herb', stackable: false, tier: 30 },
  moly: { id: 'moly', name: 'Moly', category: 'herb', stackable: false, tier: 55 },
  'ambrosia-bloom': { id: 'ambrosia-bloom', name: 'Ambrosia Bloom', category: 'herb', stackable: false, tier: 80 },
  drachma: { id: 'drachma', name: 'Drachma', category: 'currency', stackable: true, tier: 1 },
})

export const EQUIPMENT_SLOTS = Object.freeze(['head', 'cape', 'amulet', 'weapon', 'body', 'offhand', 'legs', 'hands', 'feet', 'ring', 'ammunition'])

export function createInitialInventory() {
  const equipment = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]))
  equipment.weapon = 'oath-spear'
  equipment.body = 'traveler-tunic'
  return {
    epithetFragments: [],
    questItems: [],
    currency: 0,
    capacity: INVENTORY_CAPACITY,
    slots: [
      { itemId: 'barley-flatbread', quantity: 1 },
      { itemId: 'barley-flatbread', quantity: 1 },
      { itemId: 'barley-flatbread', quantity: 1 },
    ],
    bank: { capacity: BANK_CAPACITY, slots: [] },
    equipment,
  }
}

function normalizedItemQuantity(entry) {
  if (typeof entry?.quantity !== 'number') return 0
  const quantity = Math.floor(entry.quantity)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

function itemDefinition(itemDefs, itemId) {
  if (!itemDefs || typeof itemId !== 'string') return null
  return Object.prototype.hasOwnProperty.call(itemDefs, itemId) ? itemDefs[itemId] : null
}

function normalizeCarriedSlots(entries, itemDefs) {
  const slots = []
  const stackIndexes = new Map()

  for (const entry of entries) {
    const quantity = normalizedItemQuantity(entry)
    const item = itemDefinition(itemDefs, entry?.itemId)
    if (!item || !quantity) continue

    if (item.stackable) {
      const existingIndex = stackIndexes.get(entry.itemId)
      if (existingIndex != null) {
        slots[existingIndex] = {
          itemId: entry.itemId,
          quantity: slots[existingIndex].quantity + quantity,
        }
      } else if (slots.length < INVENTORY_CAPACITY) {
        stackIndexes.set(entry.itemId, slots.length)
        slots.push({ itemId: entry.itemId, quantity })
      }
      continue
    }

    const available = INVENTORY_CAPACITY - slots.length
    const added = Math.min(available, quantity)
    for (let index = 0; index < added; index += 1) {
      slots.push({ itemId: entry.itemId, quantity: 1 })
    }
  }

  return slots
}

function normalizeBankSlots(entries, itemDefs) {
  const slots = []
  const indexesByItemId = new Map()

  for (const entry of entries) {
    const quantity = normalizedItemQuantity(entry)
    const item = itemDefinition(itemDefs, entry?.itemId)
    if (!item || !quantity) continue

    const existingIndex = indexesByItemId.get(entry.itemId)
    if (existingIndex != null) {
      slots[existingIndex] = {
        itemId: entry.itemId,
        quantity: slots[existingIndex].quantity + quantity,
      }
    } else if (slots.length < BANK_CAPACITY) {
      indexesByItemId.set(entry.itemId, slots.length)
      slots.push({ itemId: entry.itemId, quantity })
    }
  }

  return slots
}

export function normalizeInventory(raw, itemDefs = ITEM_DEFS) {
  const baseline = createInitialInventory()
  const slots = Array.isArray(raw?.slots)
    ? normalizeCarriedSlots(raw.slots, itemDefs)
    : baseline.slots
  const bankSlots = Array.isArray(raw?.bank?.slots)
    ? normalizeBankSlots(raw.bank.slots, itemDefs)
    : []
  // An absent equipment object is a legacy/new-save boundary and receives the
  // starter kit. Once equipment has been persisted, explicit nulls are player
  // intent and must remain empty rather than silently re-equipping that kit.
  const hasPersistedEquipment = Boolean(
    raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'equipment'),
  )
  const equipment = hasPersistedEquipment
    ? Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]))
    : { ...baseline.equipment }
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = raw?.equipment?.[slot]
    if (itemDefinition(itemDefs, itemId)?.equipmentSlot === slot) equipment[slot] = itemId
  }
  return {
    ...baseline,
    epithetFragments: Array.isArray(raw?.epithetFragments) ? raw.epithetFragments.filter((id) => typeof id === 'string') : [],
    questItems: Array.isArray(raw?.questItems) ? raw.questItems.filter((id) => typeof id === 'string') : [],
    currency: Number.isFinite(raw?.currency) ? Math.max(0, Math.floor(raw.currency)) : 0,
    slots,
    bank: { capacity: BANK_CAPACITY, slots: bankSlots },
    equipment,
  }
}

export function addInventoryItem(inventory, itemId, quantity = 1, itemDefs = ITEM_DEFS) {
  const item = itemDefs[itemId]
  const count = normalizedItemQuantity({ quantity })
  if (!item || !count) return { inventory, added: 0 }
  const normalized = normalizeInventory(inventory, itemDefs)
  const slots = [...normalized.slots]
  if (item.stackable) {
    const index = slots.findIndex((entry) => entry.itemId === itemId)
    if (index >= 0) slots[index] = { ...slots[index], quantity: slots[index].quantity + count }
    else if (slots.length < INVENTORY_CAPACITY) slots.push({ itemId, quantity: count })
    else return { inventory: normalized, added: 0 }
    return { inventory: { ...normalized, slots }, added: count }
  }
  const available = Math.max(0, INVENTORY_CAPACITY - slots.length)
  const added = Math.min(available, count)
  for (let i = 0; i < added; i += 1) slots.push({ itemId, quantity: 1 })
  return { inventory: { ...normalized, slots }, added }
}

export function carriedItemQuantity(inventory, itemId, itemDefs = ITEM_DEFS) {
  const normalized = normalizeInventory(inventory, itemDefs)
  return normalized.slots
    .filter((entry) => entry.itemId === itemId)
    .reduce((total, entry) => total + entry.quantity, 0)
}

// Remove from carried slots only. The operation is atomic: insufficient
// carried quantity leaves the normalized inventory unchanged and removes 0.
export function removeInventoryItem(inventory, itemId, quantity = 1, itemDefs = ITEM_DEFS) {
  const normalized = normalizeInventory(inventory, itemDefs)
  const item = itemDefs[itemId]
  const count = normalizedItemQuantity({ quantity })
  if (!item || !count || carriedItemQuantity(normalized, itemId, itemDefs) < count) {
    return { inventory: normalized, removed: 0 }
  }
  let remaining = count
  const slots = []
  for (const entry of normalized.slots) {
    if (entry.itemId !== itemId || remaining <= 0) {
      slots.push(entry)
      continue
    }
    const taken = Math.min(entry.quantity, remaining)
    const left = entry.quantity - taken
    remaining -= taken
    if (left > 0) slots.push({ ...entry, quantity: left })
  }
  return { inventory: { ...normalized, slots }, removed: count }
}

const MATERIAL_CATEGORIES = new Set(['ore', 'bar', 'wood', 'fish', 'herb', 'fiber', 'hide', 'gem', 'essence'])

export function depositAllMaterials(inventory, itemDefs = ITEM_DEFS) {
  const normalized = normalizeInventory(inventory, itemDefs)
  const bankSlots = [...normalized.bank.slots]
  const carried = []
  for (const entry of normalized.slots) {
    const item = itemDefs[entry.itemId]
    if (!item || !MATERIAL_CATEGORIES.has(item.category)) {
      carried.push(entry)
      continue
    }
    const index = bankSlots.findIndex((slot) => slot.itemId === entry.itemId)
    if (index >= 0) bankSlots[index] = { ...bankSlots[index], quantity: bankSlots[index].quantity + entry.quantity }
    else if (bankSlots.length < BANK_CAPACITY) bankSlots.push({ ...entry })
    else carried.push(entry)
  }
  return { ...normalized, slots: carried, bank: { ...normalized.bank, slots: bankSlots } }
}

export function depositBankItem(inventory, itemId, quantity = 1, itemDefs = ITEM_DEFS) {
  const normalized = normalizeInventory(inventory, itemDefs)
  const item = itemDefs[itemId]
  const count = normalizedItemQuantity({ quantity })
  if (!item || !count || carriedItemQuantity(normalized, itemId, itemDefs) < count) return normalized
  const bankIndex = normalized.bank.slots.findIndex((entry) => entry.itemId === itemId)
  if (bankIndex < 0 && normalized.bank.slots.length >= BANK_CAPACITY) return normalized
  const removed = removeInventoryItem(normalized, itemId, count, itemDefs)
  if (removed.removed !== count) return normalized
  const bankSlots = [...normalized.bank.slots]
  if (bankIndex >= 0) {
    bankSlots[bankIndex] = { ...bankSlots[bankIndex], quantity: bankSlots[bankIndex].quantity + count }
  } else {
    bankSlots.push({ itemId, quantity: count })
  }
  return { ...removed.inventory, bank: { ...normalized.bank, slots: bankSlots } }
}

export function withdrawBankItem(inventory, itemId, quantity = 1, itemDefs = ITEM_DEFS) {
  const normalized = normalizeInventory(inventory, itemDefs)
  const index = normalized.bank.slots.findIndex((entry) => entry.itemId === itemId)
  if (index < 0) return normalized
  const available = normalized.bank.slots[index].quantity
  const requested = Math.max(1, Math.min(available, Math.floor(quantity) || 1))
  const result = addInventoryItem(normalized, itemId, requested, itemDefs)
  if (!result.added) return normalized
  const bankSlots = [...normalized.bank.slots]
  const remainder = available - result.added
  if (remainder > 0) bankSlots[index] = { ...bankSlots[index], quantity: remainder }
  else bankSlots.splice(index, 1)
  return { ...result.inventory, bank: { ...normalized.bank, slots: bankSlots } }
}
