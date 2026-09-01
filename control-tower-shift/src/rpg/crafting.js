// Crafting / economy domain layer for Oathbearer.
//
// Pure, deterministic. No RuneScape naming, no UI/reducer wiring, no timers, no
// chance-based results, no network access. This module is a self-contained
// domain layer: Codex integrates it later.
//
// Recipe inputs/ outputs reference item ids from ./progression.js ITEM_DEFS.
// Outputs not yet present in ITEM_DEFS are declared in ITEM_EXTENSIONS below
// so the module remains self-describing without editing progression.js.

import {
  INVENTORY_CAPACITY,
  ITEM_DEFS,
  awardSkillXp,
  createInitialInventory,
  createInitialSkills,
  levelForXp,
  xpForLevel,
} from './progression.js'

// Re-export ITEM_DEFS so tests and integrators can import everything from
// this module without reaching into progression.js directly.
export { ITEM_DEFS }

// ─── Item extension metadata ─────────────────────────────────────────────
// Items produced by crafting that have not yet been added to ITEM_DEFS.
// Each entry mirrors the ITEM_DEFS shape so callers can treat both sources
// uniformly. Exported so Codex can migrate these into progression.js later.
export const ITEM_EXTENSIONS = Object.freeze({
  'copper-bar': {
    id: 'copper-bar',
    name: 'Copper Bar',
    category: 'bar',
    stackable: false,
    tier: 1,
  },
  'bronze-bar': {
    id: 'bronze-bar',
    name: 'Bronze Bar',
    category: 'bar',
    stackable: false,
    tier: 2,
  },
  'bronze-ingot': {
    id: 'bronze-ingot',
    name: 'Bronze Ingot',
    category: 'bar',
    stackable: false,
    tier: 2,
  },
  'copper-wire': {
    id: 'copper-wire',
    name: 'Copper Wire',
    category: 'bar',
    stackable: false,
    tier: 2,
  },
  'bronze-fittings': {
    id: 'bronze-fittings',
    name: 'Bronze Fittings',
    category: 'bar',
    stackable: false,
    tier: 3,
  },
  'olive-plank': {
    id: 'olive-plank',
    name: 'Olive Plank',
    category: 'wood',
    stackable: false,
    tier: 1,
  },
  'cypress-plank': {
    id: 'cypress-plank',
    name: 'Cypress Plank',
    category: 'wood',
    stackable: false,
    tier: 2,
  },
  'cedar-keel': {
    id: 'cedar-keel',
    name: 'Cedar Keel',
    category: 'wood',
    stackable: false,
    tier: 3,
  },
  'cypress-helm': {
    id: 'cypress-helm',
    name: 'Cypress Helm',
    category: 'armor',
    equipmentSlot: 'head',
    stackable: false,
    tier: 2,
    combatModifiers: Object.freeze({ defenseBonus: 10, maxHealthBonus: 5 }),
  },
  'olive-figurehead': {
    id: 'olive-figurehead',
    name: 'Olive Figurehead',
    category: 'wood',
    stackable: false,
    tier: 1,
  },
  'charred-ember': {
    id: 'charred-ember',
    name: 'Charred Ember',
    category: 'herb',
    stackable: false,
    tier: 2,
  },
  'dried-herbs': {
    id: 'dried-herbs',
    name: 'Dried Herbs',
    category: 'herb',
    stackable: false,
    tier: 1,
  },
  'herbal-salve': {
    id: 'herbal-salve',
    name: 'Herbal Salve',
    category: 'herb',
    stackable: false,
    tier: 2,
  },
  'moly-tonic': {
    id: 'moly-tonic',
    name: 'Moly Tonic',
    category: 'herb',
    stackable: false,
    tier: 3,
  },
  'ambrosia-distillate': {
    id: 'ambrosia-distillate',
    name: 'Ambrosia Distillate',
    category: 'herb',
    stackable: false,
    tier: 4,
  },
  'flax-fiber': {
    id: 'flax-fiber',
    name: 'Flax Fiber',
    category: 'fiber',
    stackable: false,
    tier: 1,
  },
  'undyed-cloth': {
    id: 'undyed-cloth',
    name: 'Undyed Cloth',
    category: 'fiber',
    stackable: false,
    tier: 2,
  },
  'sage-thread': {
    id: 'sage-thread',
    name: 'Sage Thread',
    category: 'fiber',
    stackable: false,
    tier: 3,
  },
  'woven-tape': {
    id: 'woven-tape',
    name: 'Woven Tape',
    category: 'fiber',
    stackable: false,
    tier: 1,
  },
  'linen-weave': {
    id: 'linen-weave',
    name: 'Linen Weave',
    category: 'fiber',
    stackable: false,
    tier: 2,
  },
  'laurel-loom-fiber': {
    id: 'laurel-loom-fiber',
    name: 'Laurel Loom Fiber',
    category: 'fiber',
    stackable: false,
    tier: 4,
  },
  'clay-loaf': {
    id: 'clay-loaf',
    name: 'Clay Loaf',
    category: 'food',
    stackable: false,
    tier: 1,
  },
  'grain-pottage': {
    id: 'grain-pottage',
    name: 'Grain Pottage',
    category: 'food',
    stackable: false,
    tier: 2,
  },
  'herb-cake': {
    id: 'herb-cake',
    name: 'Herb Cake',
    category: 'food',
    stackable: false,
    tier: 3,
  },
  'honeyed-figs': {
    id: 'honeyed-figs',
    name: 'Honeyed Figs',
    category: 'food',
    stackable: false,
    tier: 4,
  },
  'tuna-stew': {
    id: 'tuna-stew',
    name: 'Tuna Stew',
    category: 'food',
    stackable: false,
    tier: 5,
  },
  'sacred-flame-brand': {
    id: 'sacred-flame-brand',
    name: 'Sacred Flame Brand',
    category: 'ore',
    stackable: false,
    tier: 3,
  },
  'ash-blessing': {
    id: 'ash-blessing',
    name: 'Ash Blessing',
    category: 'herb',
    stackable: false,
    tier: 4,
  },
  'clay-brick': {
    id: 'clay-brick',
    name: 'Clay Brick',
    category: 'ore',
    stackable: false,
    tier: 1,
  },
  'fired-tiles': {
    id: 'fired-tiles',
    name: 'Fired Tiles',
    category: 'ore',
    stackable: false,
    tier: 2,
  },
  'kiln-fired-vessel': {
    id: 'kiln-fired-vessel',
    name: 'Kiln-Fired Vessel',
    category: 'ore',
    stackable: false,
    tier: 3,
  },
})

export const ALL_ITEM_DEFS = Object.freeze({ ...ITEM_DEFS, ...ITEM_EXTENSIONS })

// Unified item lookup: ITEM_DEFS takes priority, fall back to extensions.
export function itemDef(itemId) {
  return ALL_ITEM_DEFS[itemId] || null
}

// ─── Recipes ─────────────────────────────────────────────────────────────
// Immutable recipe registry. Order is intentional and stable (see tests for
// ordering guarantees): bronzework → carpentry → cooking → alchemy →
// weaving → hearthkeeping.
const RECIPE_DEFS = [
  // ── Bronzework ──
  Object.freeze({
    id: 'copper-bar',
    name: 'Cast Copper Bar',
    skillId: 'bronzework',
    stationId: 'bronze-forge',
    level: 1,
    xp: 12,
    ingredients: [{ itemId: 'copper-ore', quantity: 2 }],
    outputs: [{ itemId: 'copper-bar', quantity: 1 }],
  }),
  Object.freeze({
    id: 'bronze-bar',
    name: 'Alloy Bronze Bar',
    skillId: 'bronzework',
    stationId: 'bronze-forge',
    level: 2,
    xp: 17,
    ingredients: [
      { itemId: 'copper-ore', quantity: 3 },
      { itemId: 'tin-ore', quantity: 1 },
    ],
    outputs: [{ itemId: 'bronze-bar', quantity: 1 }],
  }),
  Object.freeze({
    id: 'bronze-ingot',
    name: 'Hammer Bronze Ingot',
    skillId: 'bronzework',
    stationId: 'bronze-forge',
    level: 5,
    xp: 25,
    ingredients: [{ itemId: 'bronze-bar', quantity: 2 }],
    outputs: [{ itemId: 'bronze-ingot', quantity: 3 }],
  }),
  Object.freeze({
    id: 'bronze-fittings',
    name: 'Cast Bronze Fittings',
    skillId: 'bronzework',
    stationId: 'bronze-forge',
    level: 8,
    xp: 40,
    ingredients: [{ itemId: 'bronze-bar', quantity: 1 }],
    outputs: [{ itemId: 'bronze-fittings', quantity: 2 }],
  }),

  // ── Carpentry ──
  Object.freeze({
    id: 'olive-plank',
    name: 'Split Olive Plank',
    skillId: 'carpentry',
    stationId: 'woodwork-bench',
    level: 1,
    xp: 15,
    ingredients: [{ itemId: 'olive-log', quantity: 2 }],
    outputs: [{ itemId: 'olive-plank', quantity: 1 }],
  }),
  Object.freeze({
    id: 'cypress-plank',
    name: 'Hewn Cypress Plank',
    skillId: 'carpentry',
    stationId: 'woodwork-bench',
    level: 10,
    xp: 30,
    ingredients: [{ itemId: 'cypress-log', quantity: 2 }],
    outputs: [{ itemId: 'cypress-plank', quantity: 1 }],
  }),
  Object.freeze({
    id: 'cedar-keel',
    name: 'Shape Cedar Keel',
    skillId: 'carpentry',
    stationId: 'shipwright',
    level: 20,
    xp: 60,
    ingredients: [{ itemId: 'cedar-log', quantity: 5 }],
    outputs: [{ itemId: 'cedar-keel', quantity: 1 }],
  }),
  Object.freeze({
    id: 'cypress-helm',
    name: 'Carve Cypress Helm',
    skillId: 'carpentry',
    stationId: 'woodwork-bench',
    level: 15,
    xp: 80,
    ingredients: [{ itemId: 'cypress-plank', quantity: 3 }],
    outputs: [{ itemId: 'cypress-helm', quantity: 1 }],
  }),

  // ── Cooking ──
  Object.freeze({
    id: 'grain-pottage',
    name: 'Stir Grain Pottage',
    skillId: 'cooking',
    stationId: 'field-kitchen',
    level: 1,
    xp: 10,
    ingredients: [{ itemId: 'barley-flatbread', quantity: 2 }],
    outputs: [{ itemId: 'grain-pottage', quantity: 1 }],
  }),
  Object.freeze({
    id: 'herb-cake',
    name: 'Bake Herb Cake',
    skillId: 'cooking',
    stationId: 'field-kitchen',
    level: 5,
    xp: 22,
    ingredients: [
      { itemId: 'barley-flatbread', quantity: 1 },
      { itemId: 'thyme', quantity: 1 },
    ],
    outputs: [{ itemId: 'herb-cake', quantity: 1 }],
  }),
  Object.freeze({
    id: 'tuna-stew',
    name: 'Simmer Tuna Stew',
    skillId: 'cooking',
    stationId: 'hearth',
    level: 25,
    xp: 85,
    ingredients: [
      { itemId: 'tuna', quantity: 1 },
      { itemId: 'asphodel', quantity: 1 },
    ],
    outputs: [{ itemId: 'tuna-stew', quantity: 1 }],
  }),

  // ── Alchemy ──
  Object.freeze({
    id: 'dried-herbs',
    name: 'Dry Herbs',
    skillId: 'alchemy',
    stationId: 'alchemy-lab',
    level: 1,
    xp: 8,
    ingredients: [{ itemId: 'thyme', quantity: 3 }],
    outputs: [{ itemId: 'dried-herbs', quantity: 1 }],
  }),
  Object.freeze({
    id: 'herbal-salve',
    name: 'Brew Herbal Salve',
    skillId: 'alchemy',
    stationId: 'alchemy-lab',
    level: 12,
    xp: 45,
    ingredients: [
      { itemId: 'dried-herbs', quantity: 2 },
      { itemId: 'sage', quantity: 1 },
    ],
    outputs: [{ itemId: 'herbal-salve', quantity: 1 }],
  }),
  Object.freeze({
    id: 'moly-tonic',
    name: 'Distill Moly Tonic',
    skillId: 'alchemy',
    stationId: 'alchemy-lab',
    level: 30,
    xp: 110,
    ingredients: [
      { itemId: 'moly', quantity: 2 },
      { itemId: 'ambrosia-bloom', quantity: 1 },
    ],
    outputs: [{ itemId: 'moly-tonic', quantity: 1 }],
  }),

  // ── Weaving ──
  Object.freeze({
    id: 'flax-fiber',
    name: 'Ret Flax to Fiber',
    skillId: 'weaving',
    stationId: 'loom',
    level: 1,
    xp: 12,
    ingredients: [{ itemId: 'thyme', quantity: 1 }],
    outputs: [{ itemId: 'flax-fiber', quantity: 3 }],
  }),
  Object.freeze({
    id: 'undyed-cloth',
    name: 'Spin Undyed Cloth',
    skillId: 'weaving',
    stationId: 'loom',
    level: 8,
    xp: 28,
    ingredients: [{ itemId: 'flax-fiber', quantity: 5 }],
    outputs: [{ itemId: 'undyed-cloth', quantity: 1 }],
  }),
  Object.freeze({
    id: 'sage-thread',
    name: 'Twine Sage Thread',
    skillId: 'weaving',
    stationId: 'loom',
    level: 18,
    xp: 65,
    ingredients: [{ itemId: 'sage', quantity: 4 }],
    outputs: [{ itemId: 'sage-thread', quantity: 2 }],
  }),
  Object.freeze({
    id: 'linen-weave',
    name: 'Weave Linen',
    skillId: 'weaving',
    stationId: 'loom',
    level: 25,
    xp: 95,
    ingredients: [
      { itemId: 'undyed-cloth', quantity: 2 },
      { itemId: 'sage-thread', quantity: 1 },
    ],
    outputs: [{ itemId: 'linen-weave', quantity: 1 }],
  }),
  Object.freeze({
    id: 'laurel-loom-fiber',
    name: 'Loom Laurel Fiber',
    skillId: 'weaving',
    stationId: 'loom',
    level: 40,
    xp: 180,
    ingredients: [{ itemId: 'laurel-branch', quantity: 3 }],
    outputs: [{ itemId: 'laurel-loom-fiber', quantity: 1 }],
  }),

  // ── Hearthkeeping ──
  Object.freeze({
    id: 'clay-brick',
    name: 'Mold Clay Brick',
    skillId: 'hearthkeeping',
    stationId: 'kiln',
    level: 1,
    xp: 10,
    ingredients: [{ itemId: 'copper-ore', quantity: 2 }],
    outputs: [{ itemId: 'clay-brick', quantity: 4 }],
  }),
  Object.freeze({
    id: 'fired-tiles',
    name: 'Fire Ceramic Tiles',
    skillId: 'hearthkeeping',
    stationId: 'kiln',
    level: 10,
    xp: 35,
    ingredients: [{ itemId: 'clay-brick', quantity: 3 }],
    outputs: [{ itemId: 'fired-tiles', quantity: 2 }],
  }),
  Object.freeze({
    id: 'sacred-flame-brand',
    name: 'Temper Sacred Brand',
    skillId: 'hearthkeeping',
    stationId: 'kiln',
    level: 20,
    xp: 70,
    ingredients: [{ itemId: 'copper-bar', quantity: 1 }],
    outputs: [{ itemId: 'sacred-flame-brand', quantity: 1 }],
  }),
  Object.freeze({
    id: 'kiln-fired-vessel',
    name: 'Fire Vessel in Kiln',
    skillId: 'hearthkeeping',
    stationId: 'kiln',
    level: 15,
    xp: 50,
    ingredients: [{ itemId: 'fired-tiles', quantity: 2 }],
    outputs: [{ itemId: 'kiln-fired-vessel', quantity: 1 }],
  }),
  Object.freeze({
    id: 'ash-blessing',
    name: 'Bless Ash Offering',
    skillId: 'hearthkeeping',
    stationId: 'shrine-fire',
    level: 30,
    xp: 125,
    ingredients: [
      { itemId: 'charred-ember', quantity: 1 },
      { itemId: 'ambrosia-bloom', quantity: 1 },
    ],
    outputs: [{ itemId: 'ash-blessing', quantity: 1 }],
  }),
]

// Freeze the complete recipe graph, not only the top-level recipe objects.
// Consumers can safely retain these references without ingredients or outputs
// changing under them.
export const RECIPES = Object.freeze(RECIPE_DEFS.map((recipe) => Object.freeze({
  ...recipe,
  ingredients: Object.freeze(recipe.ingredients.map((entry) => Object.freeze({ ...entry }))),
  outputs: Object.freeze(recipe.outputs.map((entry) => Object.freeze({ ...entry }))),
})))

// ─── Stable indices ──────────────────────────────────────────────────────
// Pre-computed for safe unknown-id behavior and stable ordering.
const RECIPE_BY_ID = Object.freeze(
  RECIPES.reduce((acc, recipe) => {
    acc[recipe.id] = recipe
    return acc
  }, {})
)

const RECIPES_BY_SKILL = RECIPES.reduce((acc, recipe) => {
  const group = acc.get(recipe.skillId)
  if (!group) {
    acc.set(recipe.skillId, [recipe])
  } else {
    group.push(recipe)
  }
  return acc
}, new Map())

const STATIONS_SORTED = Array.from(
  new Set(RECIPES.map((r) => r.stationId))
).sort()

// ─── Lookup helpers ──────────────────────────────────────────────────────

// Returns the recipe object for a given id, or null for unknown ids.
// The returned object is a frozen reference — callers must not mutate it.
export function recipeById(id) {
  return RECIPE_BY_ID[id] || null
}

// Returns recipes for a skill in registry order (creation order = ascending
// level within a skill). Unknown skill ids return [].
export function recipesForSkill(skillId) {
  return Object.freeze([...(RECIPES_BY_SKILL.get(skillId) || [])])
}

// Returns recipes the player can attempt given current skills and a station.
// A recipe is available when (a) its skill exists in `skills`, (b) the player's
// level for that skill >= recipe.level, and (c) the recipe's station matches.
// Ordering is stable: registry order (ascending level within skill).
// `skills` may be raw skill objects ({ xp }) or the full progression wrapper.
export function recipesAvailableAt(skills, stationId) {
  const resolvedSkills = extractSkillMap(skills)
  return RECIPES.filter((recipe) => recipe.stationId === stationId)
    .filter((recipe) => {
      const xp = resolvedSkills[recipe.skillId]?.xp || 0
      return levelForXp(xp) >= recipe.level
    })
    .slice()
}

// ─── Capacity / inventory helpers ────────────────────────────────────────

// Returns true if an item id is stackable (currency). Everything else
// consumes a dedicated physical slot.
function isStackable(itemId) {
  const def = itemDef(itemId)
  return Boolean(def?.stackable)
}

// Returns a safe skill-map regardless of input shape:
// { skillId: { xp } } | { skills: { skillId: { xp } } } | { progression: { skills } } | undefined
function extractSkillMap(skills) {
  if (!skills) return {}
  // Handle { progression: { skills } } wrapper
  if (skills.progression && typeof skills.progression === 'object') {
    return skills.progression.skills || {}
  }
  if (skills.skills) return skills.skills || {}
  return skills
}

// Returns the number of free physical slots for non-stackable items.
// Stackable items do not occupy a dedicated slot (they share/merge).
function freeSlots(slots, capacity) {
  return Math.max(0, capacity - slots.length)
}

// Counts how many stackable items of `itemId` are already present, or 0.
function stackQuantity(slots, itemId) {
  const entry = slots.find((s) => s.itemId === itemId)
  return entry ? entry.quantity : 0
}

// ─── canCraft ────────────────────────────────────────────────────────────

// Evaluates whether a player can craft `quantity` copies of `recipeId`.
// Parameters:
//   params.inventory — normalized inventory object (has .slots, .bank)
//   params.skills    — { skillId: { xp } } or { skills: { skillId: { xp } } }
//   params.stationId — string id of the station the player is at
// Returns a structured result:
//   { ok: true, quantity: N } on success
//   { ok: false, reason: '<machine>', detail: { ... } } on failure
export function canCraft(params, recipeId, quantity) {
  const recipe = recipeById(recipeId)
  if (!recipe) {
    return {
      ok: false,
      reason: 'unknown_recipe',
      detail: { recipeId },
    }
  }

  const count = Number(quantity)
  if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
    return {
      ok: false,
      reason: 'invalid_quantity',
      detail: { requested: quantity, recipeId },
    }
  }

  const { inventory, skills, stationId } = params || {}
  const resolvedSkills = extractSkillMap(skills)

  // Station check
  if (stationId !== recipe.stationId) {
    return {
      ok: false,
      reason: 'wrong_station',
      detail: { required: recipe.stationId, actual: stationId },
    }
  }

  // Level check
  const skillId = recipe.skillId
  const xp = resolvedSkills[skillId]?.xp || 0
  const level = levelForXp(xp)
  if (level < recipe.level) {
    return {
      ok: false,
      reason: 'level_too_low',
      detail: { skillId, required: recipe.level, current: level },
    }
  }

  // Ingredient availability — aggregate across inventory slots and bank.
  const inventoryItems = aggregateInventory(inventory)

  const insufficient = insufficientList()
  for (const ingredient of recipe.ingredients) {
    const needed = ingredient.quantity * count
    const available = inventoryItems[ingredient.itemId] || 0
    if (available < needed) {
      insufficient.addItem(ingredient.itemId, needed, available)
    }
  }

  if (insufficient.hasItems()) {
    return {
      ok: false,
      reason: 'insufficient_materials',
      detail: { missing: insufficient.list() },
    }
  }

  // Output capacity check.
  const capacityCheck = projectOutputSlots(inventory, recipe, count)
  if (!capacityCheck.feasible) {
    return {
      ok: false,
      reason: 'insufficient_inventory_capacity',
      detail: {
        freeSlots: capacityCheck.freeSlots,
        requiredSlots: capacityCheck.requiredSlots,
      },
    }
  }

  return { ok: true, quantity: count }
}

// Aggregate all non-stackable + stackable quantities from inventory slots
// and bank slots into a plain { itemId: quantity } map.
function aggregateInventory(inventory) {
  const result = {}
  if (!inventory) return result
  const allSlots = [...(inventory.slots || []), ...(inventory.bank?.slots || [])]
  for (const entry of allSlots) {
    if (!entry || !entry.itemId) continue
    result[entry.itemId] = (result[entry.itemId] || 0) + entry.quantity
  }
  return result
}

// A small helper to collect insufficient items without pulling in a class.
function insufficientList() {
  const items = {}
  return {
    addItem(id, needed, available) {
      if (!items[id]) items[id] = { needed: 0, available: 0 }
      items[id].needed += needed
      items[id].available += available
    },
    hasItems() {
      return Object.keys(items).length > 0
    },
    list() {
      return Object.entries(items).map(([itemId, v]) => ({
        itemId,
        needed: v.needed,
        available: v.available,
      }))
    },
  }
}

// Projects whether non-stackable outputs fit in the freed physical slots.
// Stackable outputs do not consume slots. Consumed non-stackable ingredients
// free their slots, which multi-craft uses to fit more outputs.
function projectOutputSlots(inventory, recipe, count) {
  const inv = inventory || { slots: [], capacity: INVENTORY_CAPACITY }
  const slots = (inv.slots || []).map((entry) => ({ ...entry }))
  const bankSlots = (inv.bank?.slots || []).map((entry) => ({ ...entry }))
  const capacity = inv.capacity || INVENTORY_CAPACITY

  // Simulate the exact consumption order. Ingredients pulled from the bank do
  // not free carried slots, while compact bank quantities must still be
  // decremented exactly.
  for (const ingredient of recipe.ingredients) {
    consumeItem(ingredient.itemId, ingredient.quantity * count, slots, bankSlots)
  }

  // Non-stackable outputs need one slot each. A stackable output needs one
  // slot only when no carried stack of that item already exists.
  let requiredSlots = 0
  const projectedStackIds = new Set(slots.filter((entry) => isStackable(entry.itemId)).map((entry) => entry.itemId))
  for (const output of recipe.outputs) {
    if (isStackable(output.itemId)) {
      if (!projectedStackIds.has(output.itemId)) {
        requiredSlots += 1
        projectedStackIds.add(output.itemId)
      }
    } else {
      requiredSlots += output.quantity * count
    }
  }

  const freeSlotsNow = freeSlots(slots, capacity)
  const newSlotCount = slots.length + requiredSlots

  return {
    feasible: newSlotCount <= capacity,
    freeSlots: freeSlotsNow,
    requiredSlots,
  }
}

// ─── craft ─────────────────────────────────────────────────────────────────

// Attempts to craft `quantity` copies of `recipeId`. Never mutates inputs.
// On failure returns { ...originalState, result: { ok: false, reason, detail } }.
// On success consumes exact ingredients, adds exact outputs, and awards XP
// via the existing progression helpers.
//
// The returned state object has the shape { inventory, progression, result }.
// `progression` is the full progression object (with updated skills.totalXp).
// `result` is either { ok: true, quantity: N } or { ok: false, reason, detail }.
export function craft(params, recipeId, quantity) {
  const safeParams = params || {}
  const check = canCraft(safeParams, recipeId, quantity)
  if (!check.ok) {
    return {
      inventory: safeParams.inventory,
      progression: safeParams.skills,
      result: check,
    }
  }

  const recipe = recipeById(recipeId)
  const count = check.quantity

  // Build new inventory (never mutate input).
  const newInventory = consumeAndProduce(safeParams.inventory, recipe, count)

  // Award XP through the existing progression helper.
  // `params.skills` is treated as progression skills map (or full wrapper).
  const progressionShell = {
    progression: {
      skills: extractSkillMap(safeParams.skills),
      totalXp: safeParams.progression?.totalXp || 0,
      rank: safeParams.progression?.rank || 0,
      powerUnlocks: safeParams.progression?.powerUnlocks || [],
      shrineIds: safeParams.progression?.shrineIds || [],
    },
  }
  const xpAwarded = recipe.xp * count
  const progressed = awardSkillXp(progressionShell, recipe.skillId, xpAwarded)

  return {
    inventory: newInventory,
    progression: progressed.progression,
    result: { ok: true, quantity: count, xpAwarded },
  }
}

// Produces a new inventory object with ingredients consumed from slots/bank
// and outputs added, respecting stackability and 28-slot capacity.
// Strategy:
//   1. Consume ingredients (drain stackable from stacks, drain non-stackable
//      from the tail of physical slots then bank).
//   2. After consumption, freed physical slots plus existing free slots are
//      available for new non-stackable outputs.
//   3. Add outputs (merge stackables, push non-stackables into free slots).
function consumeAndProduce(inventory, recipe, count) {
  const inv = normalizeInventoryForCraft(inventory)
  const bankCapacity = inv.bank?.capacity || 400

  // ── Consume ingredients ──
  const slots = [...inv.slots]
  const bankSlots = [...(inv.bank?.slots || [])]

  for (const ingredient of recipe.ingredients) {
    const needed = ingredient.quantity * count
    consumeItem(ingredient.itemId, needed, slots, bankSlots)
  }

  // ── Produce outputs ──
  for (const output of recipe.outputs) {
    const produced = output.quantity * count
    produceItem(output.itemId, produced, slots, capacityFor(inv))
  }

  return {
    ...inv,
    slots,
    bank: { capacity: bankCapacity, slots: bankSlots },
  }
}

function capacityFor(inv) {
  return inv.capacity || INVENTORY_CAPACITY
}

function normalizeInventoryForCraft(inventory) {
  const def = inventory || createInitialInventory()
  return {
    ...def,
    slots: [...(def.slots || [])],
    capacity: def.capacity || INVENTORY_CAPACITY,
    bank: def.bank
      ? { capacity: def.bank.capacity || 400, slots: [...(def.bank.slots || [])] }
      : { capacity: 400, slots: [] },
  }
}

// Drains `needed` units of itemId from physical slots first, then bank.
function consumeItem(itemId, needed, slots, bankSlots) {
  let remaining = needed

  if (isStackable(itemId)) {
    // Stackable: drain from any slot containing it, then bank.
    const drain = (arr, removeFromBank) => {
      for (let i = 0; i < arr.length && remaining > 0; i++) {
        if (arr[i].itemId !== itemId) continue
        const taken = Math.min(arr[i].quantity, remaining)
        arr[i] = { ...arr[i], quantity: arr[i].quantity - taken }
        remaining -= taken
        if (arr[i].quantity <= 0) {
          arr.splice(i, 1)
          i -= 1
        }
      }
    }
    drain(slots)
    drain(bankSlots)
  } else {
    // Non-stackable carried items normally occupy one slot per unit, while
    // bank entries compact identical items into a quantity. Decrement either
    // representation exactly rather than discarding an entire bank stack.
    while (remaining > 0) {
      const physIdx = slots.findIndex((s) => s.itemId === itemId)
      if (physIdx >= 0) {
        const available = Math.max(1, Math.floor(Number(slots[physIdx].quantity) || 1))
        const taken = Math.min(available, remaining)
        if (available > taken) slots[physIdx] = { ...slots[physIdx], quantity: available - taken }
        else slots.splice(physIdx, 1)
        remaining -= taken
        continue
      }
      const bankIdx = bankSlots.findIndex((s) => s.itemId === itemId)
      if (bankIdx >= 0) {
        const available = Math.max(1, Math.floor(Number(bankSlots[bankIdx].quantity) || 1))
        const taken = Math.min(available, remaining)
        if (available > taken) bankSlots[bankIdx] = { ...bankSlots[bankIdx], quantity: available - taken }
        else bankSlots.splice(bankIdx, 1)
        remaining -= taken
        continue
      }
      // Not enough available — should not happen if canCraft passed, but
      // break to avoid infinite loop.
      break
    }
  }
}

// Adds `produced` units of itemId to inventory. Stackable merges first;
// non-stackable fills free physical slots.
function produceItem(itemId, produced, slots, capacity) {
  if (isStackable(itemId)) {
    const idx = slots.findIndex((s) => s.itemId === itemId)
    if (idx >= 0) {
      slots[idx] = { ...slots[idx], quantity: slots[idx].quantity + produced }
    } else {
      slots.push({ itemId, quantity: produced })
    }
    return
  }

  // Non-stackable: each unit needs its own slot, up to capacity.
  const added = Math.min(produced, Math.max(0, capacity - slots.length))
  for (let i = 0; i < added; i += 1) {
    slots.push({ itemId, quantity: 1 })
  }
}

// ─── Re-exports for tests/integration ─────────────────────────────────────
export {
  INVENTORY_CAPACITY,
  levelForXp,
  xpForLevel,
  createInitialInventory,
  createInitialSkills,
} from './progression.js'
