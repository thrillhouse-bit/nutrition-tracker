import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { CRAFTING_ACCESS_BY_STATION, validateSystemAccess } from '../src/rpg/systemAccess.js'
import { ACT2_CHARTWRIGHT_ITEM_DEFS, ACT2_CHARTWRIGHT_RECIPES, ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS } from '../src/rpg/act2ChartwrightCrafting.js'
import { WAYFINDING_SURVEY_CONTRACTS } from '../src/rpg/wayfinding.js'

describe('Chartwright catalog integration seam', () => {
  it('registers each isolated material, crafted output, and survey chart exactly once', () => {
    const ids = [...Object.keys(ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS), ...Object.keys(ACT2_CHARTWRIGHT_ITEM_DEFS), ...WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.discoveryReward.itemId)]
    expect(ids).toHaveLength(19)
    expect(new Set(ids).size).toBe(19)
    for (const id of ids) expect(ALL_ITEM_DEFS[id]).toMatchObject({ id })
  })

  it('registers five one-XP carpentry recipes without output/input loops or missing items', () => {
    const recipes = ACT2_CHARTWRIGHT_RECIPES.map((recipe) => RECIPES.find((candidate) => candidate.id === recipe.id))
    expect(recipes).toHaveLength(5)
    const inputs = new Set(recipes.flatMap((recipe) => recipe.ingredients.map((entry) => entry.itemId)))
    for (const recipe of recipes) {
      expect(recipe.xp).toBe(1)
      for (const entry of [...recipe.ingredients, ...recipe.outputs]) expect(ALL_ITEM_DEFS[entry.itemId]).toBeTruthy()
      expect(recipe.outputs.every((entry) => entry.itemId !== 'drachma' && !inputs.has(entry.itemId))).toBe(true)
    }
  })

  it('keeps utility monotonic with stations placed on canonical Chartwright maps', () => {
    const utility = ACT2_CHARTWRIGHT_RECIPES.map((recipe) => Math.max(...recipe.outputs.map((entry) => ALL_ITEM_DEFS[entry.itemId].utility)))
    expect(utility.every((value, index) => index === 0 || value > utility[index - 1])).toBe(true)
    expect(CRAFTING_ACCESS_BY_STATION['chartwright-open-table']?.mapIds).toEqual(['chartwright-hall'])
    expect(CRAFTING_ACCESS_BY_STATION['signal-buoy-workbench']?.mapIds).toEqual(['submerged-signal-shoal'])
    expect(validateSystemAccess()).toEqual([])
  })
})
