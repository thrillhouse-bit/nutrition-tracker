import { describe, expect, it } from 'vitest'
import {
  ALL_ITEM_DEFS,
  RECIPES,
  craft,
  createInitialInventory,
  createInitialSkills,
  recipeById,
  xpForLevel,
} from '../src/rpg/crafting.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import {
  CORE_EQUIPMENT_LADDER_SLOTS,
  EQUIPMENT_PROGRESSION_LADDER,
  EQUIPMENT_SLOT_ROLES,
  equipmentProgressionCatalog,
  equipmentProgressionForSlot,
  equipItem,
} from '../src/rpg/equipment.js'

const STARTER_ITEMS = new Set(['oath-spear', 'traveler-tunic'])

function inventoryWithRecipeIngredients(recipe) {
  const initial = createInitialInventory()
  const slots = [...initial.slots]
  for (const ingredient of recipe.ingredients) {
    const definition = ALL_ITEM_DEFS[ingredient.itemId]
    if (definition.stackable) {
      slots.push({ itemId: ingredient.itemId, quantity: ingredient.quantity })
      continue
    }
    for (let index = 0; index < ingredient.quantity; index += 1) {
      slots.push({ itemId: ingredient.itemId, quantity: 1 })
    }
  }
  return { ...initial, slots }
}

function skillsAt(recipe) {
  const skills = createInitialSkills()
  skills[recipe.skillId] = { xp: xpForLevel(recipe.level) }
  return skills
}

describe('six-slot equipment progression catalog', () => {
  it('defines three known, explicit and strictly stronger tiers in each core slot', () => {
    expect(CORE_EQUIPMENT_LADDER_SLOTS).toEqual([
      'weapon', 'head', 'body', 'offhand', 'legs', 'feet',
    ])
    expect(new Set(Object.values(EQUIPMENT_SLOT_ROLES)).size).toBe(6)

    const catalog = equipmentProgressionCatalog()
    expect(Object.keys(catalog)).toEqual(CORE_EQUIPMENT_LADDER_SLOTS)

    for (const slot of CORE_EQUIPMENT_LADDER_SLOTS) {
      const progression = catalog[slot]
      expect(progression).toHaveLength(3)
      expect(progression.map((entry) => entry.itemId)).toEqual(EQUIPMENT_PROGRESSION_LADDER[slot])
      expect(progression.map((entry) => entry.ladderTier)).toEqual([1, 2, 3])
      expect(progression.every((entry) => entry.role === EQUIPMENT_SLOT_ROLES[slot])).toBe(true)

      for (const entry of progression) {
        expect(entry.item, `unknown ladder item ${entry.itemId}`).toBeDefined()
        expect(entry.item.equipmentSlot).toBe(slot)
        expect(entry.item.stackable).toBe(false)
        expect(entry.item.combatModifiers).toBeDefined()
        expect(Object.keys(entry.item.combatModifiers).length).toBeGreaterThan(0)
        for (const modifier of Object.values(entry.item.combatModifiers)) {
          expect(Number.isFinite(modifier)).toBe(true)
          expect(modifier).toBeGreaterThanOrEqual(0)
        }
      }
      expect(progression[1].utility).toBeGreaterThan(progression[0].utility)
      expect(progression[2].utility).toBeGreaterThan(progression[1].utility)
    }
  })

  it('keeps offensive, defensive, vitality and mobility roles mechanically distinct', () => {
    const weapon = equipmentProgressionForSlot('weapon').at(-1).item.combatModifiers
    const head = equipmentProgressionForSlot('head').at(-1).item.combatModifiers
    const body = equipmentProgressionForSlot('body').at(-1).item.combatModifiers
    const offhand = equipmentProgressionForSlot('offhand').at(-1).item.combatModifiers
    const feet = equipmentProgressionForSlot('feet').at(-1).item.combatModifiers

    expect(weapon.damageBonus).toBeGreaterThan(0)
    expect(head.defenseBonus).toBeGreaterThan(head.accuracyBonus)
    expect(body.maxHealthBonus).toBeGreaterThan(0)
    expect(offhand.defenseBonus).toBeGreaterThan(offhand.maxHealthBonus)
    expect(feet.accuracyBonus).toBeGreaterThan(0)
  })
})

describe('equipment recipe reachability and use', () => {
  it('gives every non-starter ladder item one coherent crafting recipe', () => {
    const ids = CORE_EQUIPMENT_LADDER_SLOTS.flatMap((slot) => EQUIPMENT_PROGRESSION_LADDER[slot])
    const outputs = new Map()
    for (const recipe of RECIPES) {
      for (const output of recipe.outputs) {
        if (!outputs.has(output.itemId)) outputs.set(output.itemId, [])
        outputs.get(output.itemId).push(recipe.id)
      }
    }

    for (const itemId of ids) {
      if (STARTER_ITEMS.has(itemId)) continue
      expect(outputs.get(itemId), `missing recipe for ${itemId}`).toEqual([itemId])
      const recipe = recipeById(itemId)
      expect(recipe.level).toBeGreaterThanOrEqual(1)
      expect(recipe.xp).toBeGreaterThan(0)
      expect(recipe.stationId).toMatch(/^[a-z0-9-]+$/)
      expect(recipe.ingredients.length).toBeGreaterThan(0)
    }
  })

  it('orders recipe requirements by tier within every slot', () => {
    for (const slot of CORE_EQUIPMENT_LADDER_SLOTS) {
      const craftable = EQUIPMENT_PROGRESSION_LADDER[slot]
        .filter((itemId) => !STARTER_ITEMS.has(itemId))
        .map((itemId) => recipeById(itemId))
      for (let index = 1; index < craftable.length; index += 1) {
        expect(craftable[index].level).toBeGreaterThan(craftable[index - 1].level)
        expect(craftable[index].xp).toBeGreaterThan(craftable[index - 1].xp)
      }
    }
  })

  it('closes every ingredient through the real obtainable-content graph with no inert equipment output', () => {
    const report = validateRPGContent()
    const ladderIds = CORE_EQUIPMENT_LADDER_SLOTS.flatMap((slot) => EQUIPMENT_PROGRESSION_LADDER[slot])
    for (const itemId of ladderIds) expect(report.obtainableItemIds).toContain(itemId)
    expect(report.issues.filter((entry) => [
      'UNOBTAINABLE_RECIPE_INGREDIENT',
      'INERT_CRAFTED_OUTPUT',
    ].includes(entry.code))).toEqual([])
  })

  it('crafts and equips every non-starter ladder item using the public domain contracts', () => {
    for (const slot of CORE_EQUIPMENT_LADDER_SLOTS) {
      for (const itemId of EQUIPMENT_PROGRESSION_LADDER[slot]) {
        if (STARTER_ITEMS.has(itemId)) continue
        const recipe = recipeById(itemId)
        const crafted = craft({
          inventory: inventoryWithRecipeIngredients(recipe),
          skills: skillsAt(recipe),
          stationId: recipe.stationId,
        }, recipe.id, 1)
        expect(crafted.result.ok, `craft failed for ${itemId}`).toBe(true)
        expect(crafted.inventory.slots.some((entry) => entry.itemId === itemId)).toBe(true)

        const equipped = equipItem(crafted.inventory, itemId)
        expect(equipped.changed, `equip failed for ${itemId}`).toBe(true)
        expect(equipped.inventory.equipment[slot]).toBe(itemId)
      }
    }
  })
})
