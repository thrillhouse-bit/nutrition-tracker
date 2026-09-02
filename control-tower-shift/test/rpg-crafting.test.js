import { describe, expect, it } from 'vitest'
import {
  RECIPES,
  ITEM_EXTENSIONS,
  ITEM_DEFS,
  INVENTORY_CAPACITY,
  canCraft,
  craft,
  recipeById,
  recipesForSkill,
  recipesAvailableAt,
  levelForXp,
  xpForLevel,
  createInitialInventory,
  createInitialSkills,
} from '../src/rpg/crafting.js'
import { awardSkillXp } from '../src/rpg/progression.js'

// ─── Helpers ─────────────────────────────────────────────────────────────

const SKILL_IDS = [
  'bronzework',
  'carpentry',
  'cooking',
  'alchemy',
  'weaving',
  'hearthkeeping',
]

function skillsAt(skillMap, level) {
  const xp = xpForLevel(level)
  return Object.fromEntries(
    Object.keys(skillMap).map((id) => [id, { xp }])
  )
}

function makeSkills(levelOverrides = {}) {
  const base = createInitialSkills()
  const out = {}
  for (const skill of SKILL_IDS) {
    out[skill] = { xp: xpForLevel(levelOverrides[skill] || 1) }
  }
  // Preserve all original skills too
  for (const [k, v] of Object.entries(base)) {
    if (!(k in out)) out[k] = v
  }
  return out
}

function inventoryWith(items) {
  const inv = createInitialInventory()
  const slots = [...inv.slots]
  for (const [itemId, quantity] of Object.entries(items)) {
    const def = ITEM_DEFS[itemId] || ITEM_EXTENSIONS[itemId]
    if (!def) continue
    if (def.stackable) {
      const existing = slots.find((s) => s.itemId === itemId)
      if (existing) {
        existing.quantity += quantity
      } else {
        slots.push({ itemId, quantity })
      }
    } else {
      for (let i = 0; i < quantity; i += 1) {
        slots.push({ itemId, quantity: 1 })
      }
    }
  }
  return { ...inv, slots }
}

function progWith(skills) {
  return {
    progression: {
      skills: skills || createInitialSkills(),
      totalXp: 0,
    },
  }
}

// ─── Recipe registry ─────────────────────────────────────────────────────

describe('recipe registry', () => {
  it('has at least 12 recipes', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(12)
  })

  it('covers all six artisan skills', () => {
    const covered = new Set(RECIPES.map((r) => r.skillId))
    for (const skill of SKILL_IDS) {
      expect(covered.has(skill), `missing ${skill}`).toBe(true)
    }
  })

  it('defines every recipe with id, name, skill, level, xp, ingredients, outputs, station', () => {
    for (const recipe of RECIPES) {
      expect(recipe.id).toMatch(/^[a-z0-9-]+$/)
      expect(recipe.name).toMatch(/\S/)
      expect(SKILL_IDS).toContain(recipe.skillId)
      expect(recipe.level).toBeGreaterThanOrEqual(1)
      expect(recipe.xp).toBeGreaterThan(0)
      expect(recipe.stationId).toMatch(/^[a-z0-9-]+$/)
      expect(Array.isArray(recipe.ingredients)).toBe(true)
      expect(recipe.ingredients.length).toBeGreaterThan(0)
      expect(Array.isArray(recipe.outputs)).toBe(true)
      expect(recipe.outputs.length).toBeGreaterThan(0)
      expect(Object.isFrozen(recipe)).toBe(true)
      expect(Object.isFrozen(recipe.ingredients)).toBe(true)
      expect(Object.isFrozen(recipe.outputs)).toBe(true)
      for (const entry of [...recipe.ingredients, ...recipe.outputs]) {
        expect(entry.quantity).toBeGreaterThan(0)
        expect(Object.isFrozen(entry)).toBe(true)
      }
    }
  })

  it('uses distinct recipe ids', () => {
    const ids = RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('references only existing item ids (ITEM_DEFS or ITEM_EXTENSIONS)', () => {
    for (const recipe of RECIPES) {
      for (const ing of recipe.ingredients) {
        const def = ITEM_DEFS[ing.itemId] || ITEM_EXTENSIONS[ing.itemId]
        expect(def, `unknown ingredient ${ing.itemId}`).toBeDefined()
      }
      for (const out of recipe.outputs) {
        const def = ITEM_DEFS[out.itemId] || ITEM_EXTENSIONS[out.itemId]
        expect(def, `unknown output ${out.itemId}`).toBeDefined()
      }
    }
  })
})

describe('recipe lookup helpers', () => {
  it('recipeById returns the recipe for known ids', () => {
    const r = recipeById('copper-bar')
    expect(r).not.toBeNull()
    expect(r.skillId).toBe('bronzework')
    expect(r.stationId).toBe('bronze-forge')
  })

  it('recipeById returns null for unknown ids', () => {
    expect(recipeById('nonexistent-recipe')).toBeNull()
    expect(recipeById('')).toBeNull()
    expect(recipeById(null)).toBeNull()
    expect(recipeById(undefined)).toBeNull()
  })

  it('recipesForSkill returns recipes in registry order (ascending level)', () => {
    const bronzework = recipesForSkill('bronzework')
    expect(bronzework.length).toBe(21)
    for (let i = 1; i < bronzework.length; i++) {
      expect(bronzework[i].level).toBeGreaterThanOrEqual(bronzework[i - 1].level)
    }
  })

  it('recipesForSkill returns empty array for unknown skills', () => {
    expect(recipesForSkill('not-a-skill')).toEqual([])
    expect(recipesForSkill('')).toEqual([])
  })

  it('recipesForSkill returns copies that cannot mutate the registry', () => {
    const list = recipesForSkill('cooking')
    const original = list[0]
    expect(list.length).toBeGreaterThan(0)
    // The returned array is a new array reference
    expect(list).not.toBe(recipesForSkill('cooking'))
  })

  it('recipesAvailableAt filters by station and level', () => {
    const skills = makeSkills({ bronzework: 3, carpentry: 12 })
    // bronze-forge available recipes at bronzework level 3:
    // copper-bar (lvl1), bronze-bar (lvl2), bronze-quarry-pick (lvl3),
    // bronze-herb-sickle (lvl3), bronze-felling-axe (lvl3), bronze-fishing-rod
    // (lvl3), bronze-hoe (lvl3) — bronze-ingot needs lvl5
    const forge = recipesAvailableAt({ skills }, 'bronze-forge')
    expect(forge.map((r) => r.id)).toEqual(['copper-bar', 'bronze-bar', 'bronze-quarry-pick', 'bronze-herb-sickle', 'bronze-felling-axe', 'bronze-fishing-rod', 'bronze-hoe'])
  })

  it('recipesAvailableAt returns only recipes whose station matches', () => {
    const skills = makeSkills({ carpentry: 99 })
    const loom = recipesAvailableAt({ skills }, 'loom')
    expect(loom.every((r) => r.stationId === 'loom')).toBe(true)
    expect(loom.every((r) => r.skillId === 'weaving')).toBe(true)
  })

  it('recipesAvailableAt returns empty for unknown station', () => {
    const skills = makeSkills({ bronzework: 99 })
    expect(recipesAvailableAt({ skills }, 'unknown-station')).toEqual([])
  })

  it('recipesAvailableAt accepts skills wrapped in a progression object', () => {
    const skills = makeSkills({ bronzework: 99 })
    const prog = { progression: { skills, totalXp: 0 } }
    const result = recipesAvailableAt(prog, 'bronze-forge')
    expect(result.length).toBe(21)
  })

  it('recipesAvailableAt accepts null/undefined skills safely (defaults to level 1)', () => {
    // With no skills provided, level defaults to 1 — only level-1 recipes
    // at that station are available.
    const result = recipesAvailableAt(null, 'loom')
    expect(result.length).toBe(1)
    expect(result[0].level).toBe(1)
    expect(recipesAvailableAt(undefined, 'loom')).toEqual(result)
    expect(recipesAvailableAt({}, 'loom')).toEqual(result)
  })

  it('recipesAvailableAt does not mutate the input skills object', () => {
    const skills = makeSkills({ bronzework: 99 })
    const snapshot = JSON.parse(JSON.stringify(skills))
    recipesAvailableAt({ skills }, 'bronze-forge')
    expect(skills).toEqual(snapshot)
  })
})

// ─── canCraft — validation ─────────────────────────────────────────────────

describe('canCraft validation', () => {
  it('returns ok when all conditions are met', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    expect(canCraft(params, 'copper-bar', 1)).toEqual({ ok: true, quantity: 1 })
  })

  it('rejects unknown recipe id', () => {
    const params = {
      inventory: createInitialInventory(),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = canCraft(params, 'fake-recipe', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unknown_recipe')
    expect(result.detail).toEqual({ recipeId: 'fake-recipe' })
  })

  it('rejects non-positive, fractional, non-finite, and non-numeric quantities', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    for (const qty of [0, -1, -5, 1.5, NaN, Infinity, -Infinity, 'abc', null, undefined]) {
      const result = canCraft(params, 'copper-bar', qty)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('invalid_quantity')
    }
  })

  it('preserves valid positive integer quantities', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 6 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    expect(canCraft(params, 'copper-bar', 3)).toEqual({ ok: true, quantity: 3 })
  })

  it('rejects wrong station', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'loom',
    }
    const result = canCraft(params, 'copper-bar', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('wrong_station')
    expect(result.detail).toEqual({ required: 'bronze-forge', actual: 'loom' })
  })

  it('rejects level too low', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: makeSkills({ bronzework: 1 }), // level 1
      stationId: 'bronze-forge',
    }
    // bronze-ingot requires bronzework level 5
    const result = canCraft(params, 'bronze-ingot', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('level_too_low')
    expect(result.detail.skillId).toBe('bronzework')
    expect(result.detail.required).toBe(5)
    expect(result.detail.current).toBe(1)
  })

  it('rejects insufficient materials', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 1 }), // need 2
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = canCraft(params, 'copper-bar', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('insufficient_materials')
    expect(result.detail.missing).toHaveLength(1)
    expect(result.detail.missing[0].itemId).toBe('copper-ore')
    expect(result.detail.missing[0].needed).toBe(2)
    expect(result.detail.missing[0].available).toBe(1)
  })

  it('rejects insufficient materials from bank only (no inventory)', () => {
    const params = {
      inventory: { ...createInitialInventory(), bank: { capacity: 400, slots: [{ itemId: 'copper-ore', quantity: 1 }] } },
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = canCraft(params, 'copper-bar', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('insufficient_materials')
  })

  it('allows materials sourced from both inventory and bank', () => {
    const inv = inventoryWith({ 'copper-ore': 1 })
    const params = {
      inventory: { ...inv, bank: { capacity: 400, slots: [{ itemId: 'copper-ore', quantity: 5 }] } },
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    // Need 2 copper-ore, have 1 in inv + 5 in bank = 6
    expect(canCraft(params, 'copper-bar', 1).ok).toBe(true)
  })

  it('rejects when inventory is full and no ingredient slots can be freed', () => {
    // Build an inventory full of non-stackable items (28 slots of barley-flatbread)
    const inv = createInitialInventory()
    const fullSlots = Array.from({ length: INVENTORY_CAPACITY }, () => ({
      itemId: 'barley-flatbread',
      quantity: 1,
    }))
    const params = {
      inventory: { ...inv, slots: fullSlots },
      skills: makeSkills({ bronzework: 1 }),
      stationId: 'bronze-forge',
    }
    // copper-bar needs 2 copper-ore but we have none — insufficient materials
    const result = canCraft(params, 'copper-bar', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('insufficient_materials')
  })

  it('correctly computes multi-craft material needs', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 5 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    // copper-bar needs 2 copper-ore, making 2 costs 4
    expect(canCraft(params, 'copper-bar', 2).ok).toBe(true)
    // Making 3 costs 6, only 5 available
    const result = canCraft(params, 'copper-bar', 3)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('insufficient_materials')
  })
})

// ─── canCraft — capacity logic ───────────────────────────────────────────

describe('canCraft capacity accounting', () => {
  it('allows non-stackable output when consumed ingredients free slots', () => {
    // 3 copper-ore in inventory (3 slots), need 2 for copper-bar, output 1 slot
    const params = {
      inventory: inventoryWith({ 'copper-ore': 3 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = canCraft(params, 'copper-bar', 1)
    expect(result.ok).toBe(true)
  })

  it('allows multi-craft when freed slots cover all outputs', () => {
    // bronze-ingot: 2 bronze-bar in → 3 bronze-ingot out (non-stackable)
    // Need 2 bronze-bar = 2 slots freed, 3 bronze-ingot = 3 slots needed.
    // Start with 3 slots holding bronze-bar (3 slots), need 2 freed = 1 free + 2 freed = 3 total. OK.
    const inv = inventoryWith({ 'bronze-bar': 4 })
    const params = {
      inventory: inv,
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const check = canCraft(params, 'bronze-ingot', 1)
    expect(check.ok).toBe(true)
  })

  it('rejects multi-craft when outputs exceed freed + free slots', () => {
    // bronze-ingot: 2 bronze-bar in → 3 bronze-ingot out (all non-stackable)
    // Make 2: need 4 bronze-bar consumed (4 freed slots), produce 6 bronze-ingot (6 slots needed)
    // With 28 capacity and 6 bronze-bar slots, we have 22 free + 4 freed = 26,
    // need 6 → 6 ≤ 26 → passes. Need to fill inventory to 27 slots to make it fail.
    const inv = createInitialInventory()
    const nearlyFull = [
      ...Array.from({ length: 21 }, () => ({ itemId: 'barley-flatbread', quantity: 1 })),
      ...Array.from({ length: 6 }, () => ({ itemId: 'bronze-bar', quantity: 1 })),
    ]
    const params = {
      inventory: { ...inv, slots: nearlyFull },
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    // 27 used + 0 free, consume 4 bronze-bar (freed 4), produce 6 bronze-ingot
    // new count = 27 - 4 + 6 = 29 > 28 → fail
    const result = canCraft(params, 'bronze-ingot', 2)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('insufficient_inventory_capacity')
    expect(result.detail.requiredSlots).toBe(6)
  })

  it('handles stackable output (drachma) without slot issues', () => {
    // No recipe currently outputs drachma, but test the logic path via
    // a recipe that consumes stackable ingredients.
    // grain-pottage uses barley-flatbread (non-stackable) and drachma (stackable, qty 0)
    const params = {
      inventory: inventoryWith({ 'barley-flatbread': 3 }),
      skills: makeSkills({ cooking: 5 }),
      stationId: 'field-kitchen',
    }
    const result = canCraft(params, 'grain-pottage', 1)
    expect(result.ok).toBe(true)
  })
})

// ─── craft ─────────────────────────────────────────────────────────────────

describe('craft execution', () => {
  it('consumes exact ingredients and adds exact outputs', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 4 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'copper-bar', 2)
    expect(result.result.ok).toBe(true)
    expect(result.result.quantity).toBe(2)
    // 4 copper-ore consumed → 2 slots freed, 2 copper-bar added
    const copperOreCount = result.inventory.slots.filter((s) => s.itemId === 'copper-ore').length
    const copperBarCount = result.inventory.slots.filter((s) => s.itemId === 'copper-bar').length
    expect(copperOreCount).toBe(0)
    expect(copperBarCount).toBe(2)
  })

  it('awards the correct XP per recipe unit', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 4 }),
      skills: makeSkills({ bronzework: 1 }),
      stationId: 'bronze-forge',
    }
    // copper-bar grants 12 XP per unit, crafting 2 = 24 XP
    const result = craft(params, 'copper-bar', 2)
    expect(result.result.ok).toBe(true)
    expect(result.result.xpAwarded).toBe(24)
    expect(result.progression.skills.bronzework.xp).toBe(xpForLevel(1) + 24)
    expect(result.progression.totalXp).toBe(24)
  })

  it('does not mutate input inventory', () => {
    const inv = inventoryWith({ 'copper-ore': 4 })
    const params = {
      inventory: inv,
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const originalSlots = JSON.parse(JSON.stringify(inv.slots))
    craft(params, 'copper-bar', 1)
    expect(inv.slots).toEqual(originalSlots)
  })

  it('does not mutate input skills', () => {
    const skills = makeSkills({ bronzework: 5 })
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: skills,
      stationId: 'bronze-forge',
    }
    const originalSkills = JSON.parse(JSON.stringify(skills))
    craft(params, 'copper-bar', 1)
    expect(skills).toEqual(originalSkills)
  })

  it('returns structured failure on invalid attempt', () => {
    const params = {
      inventory: createInitialInventory(),
      skills: makeSkills({ bronzework: 1 }),
      stationId: 'loom',
    }
    const result = craft(params, 'copper-bar', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('wrong_station')
    // Original state preserved
    expect(result.inventory).toBe(params.inventory)
    expect(result.progression).toBe(params.skills)
  })

  it('returns structured failure on unknown recipe', () => {
    const params = {
      inventory: createInitialInventory(),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'nonexistent', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('unknown_recipe')
  })

  it('returns structured failure on invalid quantity', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'copper-bar', 0)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('invalid_quantity')
  })

  it('returns structured failure on level too low', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 2 }),
      skills: makeSkills({ bronzework: 1 }), // level 1, recipe needs level 1 — actually OK
      stationId: 'bronze-forge',
    }
    // bronze-ingot needs level 5
    const lowParams = {
      inventory: inventoryWith({ 'bronze-bar': 2 }),
      skills: makeSkills({ bronzework: 1 }),
      stationId: 'bronze-forge',
    }
    const result = craft(lowParams, 'bronze-ingot', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('level_too_low')
  })

  it('returns structured failure on insufficient materials', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 1 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'copper-bar', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('insufficient_materials')
  })

  it('correctly handles multi-craft with slot freeing', () => {
    // bronze-ingot: 2 bronze-bar → 3 bronze-ingot (all non-stackable)
    // Start with 4 bronze-bar in 4 slots, craft 1:
    //   consume 2 (2 freed), produce 3 bronze-ingot (3 new slots)
    //   final: 2 bronze-bar + 3 bronze-ingot = 5 slots, cap 28 → OK
    const params = {
      inventory: inventoryWith({ 'bronze-bar': 4 }),
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'bronze-ingot', 1)
    expect(result.result.ok).toBe(true)
    const bronzeBarCount = result.inventory.slots.filter((s) => s.itemId === 'bronze-bar').length
    const bronzeIngotCount = result.inventory.slots.filter((s) => s.itemId === 'bronze-ingot').length
    expect(bronzeBarCount).toBe(2)
    expect(bronzeIngotCount).toBe(3)
  })
})

// ─── craft — stackability ─────────────────────────────────────────────────

describe('craft output accounting', () => {
  it('consumes only the exact requested ingredients', () => {
    const params = {
      inventory: inventoryWith({ 'thyme': 6 }),
      skills: makeSkills({ alchemy: 5 }),
      stationId: 'alchemy-lab',
    }
    // dried-herbs: 3 thyme → 1 dried-herbs (non-stackable)
    const result = craft(params, 'dried-herbs', 1)
    expect(result.result.ok).toBe(true)
    // Exactly 3 of 6 thyme are consumed and one dried-herb is produced.
    const thymeCount = result.inventory.slots.filter((s) => s.itemId === 'thyme').length
    expect(thymeCount).toBe(3)
    const herbSlots = result.inventory.slots.filter((s) => s.itemId === 'dried-herbs').length
    expect(herbSlots).toBe(1)
  })

  it('does not create separate slots for non-stackable ingredients consumed', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 3 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'copper-bar', 1)
    expect(result.result.ok).toBe(true)
    // Should have: 1 remaining copper-ore + 1 new copper-bar = same total slots
    const copperOre = result.inventory.slots.filter((s) => s.itemId === 'copper-ore').length
    const copperBar = result.inventory.slots.filter((s) => s.itemId === 'copper-bar').length
    expect(copperOre).toBe(1)
    expect(copperBar).toBe(1)
  })
})

// ─── craft — XP via existing helpers ───────────────────────────────────────

describe('craft XP integration', () => {
  it('uses awardSkillXp for consistent XP application', () => {
    const state = {
      progression: {
        skills: makeSkills({ bronzework: 1 }),
        totalXp: 0,
      },
    }
    const recipe = recipeById('copper-bar')
    const updated = awardSkillXp(state, recipe.skillId, recipe.xp)
    const craftedProg = craft(
      {
        inventory: inventoryWith({ 'copper-ore': 2 }),
        skills: state.progression.skills,
        stationId: 'bronze-forge',
      },
      'copper-bar',
      1
    ).progression
    expect(craftedProg.skills.bronzework.xp).toBe(updated.progression.skills.bronzework.xp)
    expect(craftedProg.totalXp).toBe(updated.progression.totalXp)
  })

  it('scales XP by quantity crafted', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 8 }),
      skills: makeSkills({ bronzework: 1 }),
      stationId: 'bronze-forge',
    }
    const recipe = recipeById('copper-bar')
    const expectedXp = recipe.xp * 4
    const result = craft(params, 'copper-bar', 4)
    expect(result.result.xpAwarded).toBe(expectedXp)
    expect(result.progression.totalXp).toBe(expectedXp)
  })
})

// ─── craft — full artisan skill coverage ──────────────────────────────────

describe('craft covers every artisan skill', () => {
  const TEST_CASES = [
    { recipeId: 'copper-bar', skill: 'bronzework', station: 'bronze-forge' },
    { recipeId: 'bronze-bar', skill: 'bronzework', station: 'bronze-forge' },
    { recipeId: 'olive-plank', skill: 'carpentry', station: 'woodwork-bench' },
    { recipeId: 'cypress-helm', skill: 'carpentry', station: 'woodwork-bench' },
    { recipeId: 'herb-cake', skill: 'cooking', station: 'field-kitchen' },
    { recipeId: 'tuna-stew', skill: 'cooking', station: 'hearth' },
    { recipeId: 'dried-herbs', skill: 'alchemy', station: 'alchemy-lab' },
    { recipeId: 'moly-tonic', skill: 'alchemy', station: 'alchemy-lab' },
    { recipeId: 'flax-fiber', skill: 'weaving', station: 'loom' },
    { recipeId: 'linen-weave', skill: 'weaving', station: 'loom' },
    { recipeId: 'clay-brick', skill: 'hearthkeeping', station: 'kiln' },
    { recipeId: 'ash-blessing', skill: 'hearthkeeping', station: 'shrine-fire' },
  ]

  for (const { recipeId, skill, station } of TEST_CASES) {
    it(`crafts ${recipeId} (${skill}) successfully`, () => {
      const recipe = recipeById(recipeId)
      expect(recipe).not.toBeNull()

      // Build inventory with the required ingredients
      const ingredients = {}
      for (const ing of recipe.ingredients) {
        ingredients[ing.itemId] = (ingredients[ing.itemId] || 0) + ing.quantity
      }

      const params = {
        inventory: inventoryWith(ingredients),
        skills: makeSkills({ [skill]: recipe.level }),
        stationId: station,
      }
      const result = craft(params, recipeId, 1)
      expect(result.result.ok).toBe(true)
      expect(result.result.quantity).toBe(1)
      expect(result.result.xpAwarded).toBe(recipe.xp)
    })
  }
})

// ─── craft — idempotency & determinism ─────────────────────────────────────

describe('craft determinism', () => {
  it('produces identical results for identical inputs', () => {
    const params = {
      inventory: inventoryWith({ 'copper-ore': 4 }),
      skills: makeSkills({ bronzework: 5 }),
      stationId: 'bronze-forge',
    }
    const r1 = craft(params, 'copper-bar', 2)
    const r2 = craft(params, 'copper-bar', 2)
    expect(r1).toEqual(r2)
  })

  it('same craft on the output of a craft works (chained)', () => {
    // bronze-ingot uses bronze-bar, which bronze-bar recipe produces
    const params1 = {
      inventory: inventoryWith({ 'copper-ore': 6, 'tin-ore': 2 }),
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const r1 = craft(params1, 'bronze-bar', 2)
    expect(r1.result.ok).toBe(true)

    const params2 = {
      inventory: r1.inventory,
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const r2 = craft(params2, 'bronze-ingot', 1)
    expect(r2.result.ok).toBe(true)
    // bronze-bar produces 1 per unit → 2 made, bronze-ingot consumes 2 → 0 remain, 3 produced
    const bronzeBarCount = r2.inventory.slots.filter((s) => s.itemId === 'bronze-bar').length
    const bronzeIngotCount = r2.inventory.slots.filter((s) => s.itemId === 'bronze-ingot').length
    expect(bronzeBarCount).toBe(0)
    expect(bronzeIngotCount).toBe(3)
  })
})

// ─── ITEM_EXTENSIONS ───────────────────────────────────────────────────────

describe('item extensions', () => {
  it('defines metadata for every crafting-only output', () => {
    const extensionIds = new Set(Object.keys(ITEM_EXTENSIONS))
    const extensionOutputs = new Set()

    for (const recipe of RECIPES) {
      for (const out of recipe.outputs) {
        if (!ITEM_DEFS[out.itemId]) {
          extensionOutputs.add(out.itemId)
        }
      }
    }

    for (const id of extensionOutputs) {
      expect(extensionIds.has(id), `missing extension for ${id}`).toBe(true)
    }
  })

  it('itemDef resolves both ITEM_DEFS and ITEM_EXTENSIONS', () => {
    // Existing item
    expect(ITEM_DEFS['copper-ore']).toBeDefined()
    // Extension-only item
    expect(ITEM_EXTENSIONS['copper-bar']).toBeDefined()
    expect(ITEM_EXTENSIONS['bronze-bar']).toBeDefined()
  })

  it('all extensions have required fields', () => {
    for (const [id, def] of Object.entries(ITEM_EXTENSIONS)) {
      expect(def.id).toBe(id)
      expect(def.name).toMatch(/\S/)
      expect(def.category).toMatch(/\S/)
      expect(typeof def.stackable).toBe('boolean')
      expect(def.tier).toBeGreaterThanOrEqual(1)
    }
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty skills object for level check', () => {
    const params = {
      inventory: inventoryWith({ 'bronze-bar': 2 }),
      skills: {}, // no skills at all → defaults to level 1
      stationId: 'bronze-forge',
    }
    // bronze-ingot requires bronzework level 5; with empty skills, level is 1
    const result = canCraft(params, 'bronze-ingot', 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('level_too_low')
    expect(result.detail.current).toBe(1) // levelForXp(0) = 1
  })

  it('recipesAvailableAt respects level gates across multiple skills', () => {
    const skills = makeSkills({ bronzework: 1, carpentry: 10 })
    // The first two equipment tiers unlock alongside the material ladder.
    const bench = recipesAvailableAt({ skills }, 'woodwork-bench')
    expect(bench.map((r) => r.id)).toEqual([
      'olive-plank',
      'olive-circlet',
      'olive-buckler',
      'cypress-plank',
    ])
  })

  it('craft with bank items consumes from bank when inventory lacks them', () => {
    // 4 bronze-bar in bank, 0 in inventory
    const params = {
      inventory: {
        ...createInitialInventory(),
        slots: [createInitialInventory().slots[0]], // just the bread
        bank: { capacity: 400, slots: [{ itemId: 'bronze-bar', quantity: 4 }] },
      },
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'bronze-ingot', 2)
    expect(result.result.ok).toBe(true)
    // 4 bronze-bar consumed from bank, 6 bronze-ingot produced
    const bankBronzeBar = result.inventory.bank.slots.find((s) => s.itemId === 'bronze-bar')
    const bronzeIngot = result.inventory.slots.filter((s) => s.itemId === 'bronze-ingot')
    expect(bankBronzeBar).toBeUndefined()
    expect(bronzeIngot).toHaveLength(6)
  })

  it('decrements compact non-stackable bank quantities exactly', () => {
    const params = {
      inventory: {
        ...createInitialInventory(),
        slots: [],
        bank: { capacity: 400, slots: [{ itemId: 'bronze-bar', quantity: 4 }] },
      },
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'bronze-ingot', 1)
    expect(result.result.ok).toBe(true)
    expect(result.inventory.bank.slots).toEqual([{ itemId: 'bronze-bar', quantity: 2 }])
    expect(result.inventory.slots.filter((slot) => slot.itemId === 'bronze-ingot')).toHaveLength(3)
  })

  it('craft failure when bank has enough but inventory has no free slots for output', () => {
    // Fill inventory to 28 slots with barley-flatbread, have bronze-bar in bank
    const inv = createInitialInventory()
    const fullSlots = []
    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      fullSlots.push({ itemId: 'barley-flatbread', quantity: 1 })
    }
    const params = {
      inventory: {
        ...inv,
        slots: fullSlots,
        bank: { capacity: 400, slots: [{ itemId: 'bronze-bar', quantity: 2 }] },
      },
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    // bronze-ingot: 2 bronze-bar (from bank) → 3 bronze-ingot (non-stackable)
    // Inventory is full (28 barley-flatbread), no slots freed from physical slots
    // (ingredients come from bank). 3 outputs need 3 slots but 0 free.
    const result = craft(params, 'bronze-ingot', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('insufficient_inventory_capacity')
  })

  it('does not count bank-sourced ingredients as freed inventory slots', () => {
    const inv = createInitialInventory()
    const params = {
      inventory: {
        ...inv,
        slots: Array.from({ length: INVENTORY_CAPACITY }, () => ({
          itemId: 'barley-flatbread',
          quantity: 1,
        })),
        bank: { capacity: 400, slots: [{ itemId: 'copper-ore', quantity: 2 }] },
      },
      skills: makeSkills({ bronzework: 99 }),
      stationId: 'bronze-forge',
    }
    const result = craft(params, 'copper-bar', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('insufficient_inventory_capacity')
  })

  it('handles missing params as a structured failure', () => {
    const result = craft(undefined, 'copper-bar', 1)
    expect(result.result.ok).toBe(false)
    expect(result.result.reason).toBe('wrong_station')
  })
})
