import { describe, expect, it } from 'vitest'
import { ACT2_CHARTWRIGHT_ITEM_BY_ID, ACT2_CHARTWRIGHT_ITEM_DEFS, ACT2_CHARTWRIGHT_RECIPES, ACT2_CHARTWRIGHT_CRAFT_STATIONS, ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS, act2ChartwrightItemById, act2ChartwrightRecipeById, chartwrightCraftingIntegrationSeams, validateAct2ChartwrightCrafting } from '../src/rpg/act2ChartwrightCrafting.js'
import { ACT2_CHARTWRIGHT_RUNTIME_MAPS } from '../src/rpg/act2ChartwrightRuntime.js'
import { WAYFINDING_LEVEL_BANDS, WAYFINDING_SURVEY_CONTRACTS } from '../src/rpg/wayfinding.js'

describe('Act II Chartwright isolated crafting seam', () => {
  it('defines exactly eight frozen useful items and five frozen unique recipes', () => {
    expect(Object.isFrozen(ACT2_CHARTWRIGHT_ITEM_DEFS)).toBe(true)
    expect(Object.isFrozen(ACT2_CHARTWRIGHT_RECIPES)).toBe(true)
    expect(Object.keys(ACT2_CHARTWRIGHT_ITEM_DEFS)).toHaveLength(8)
    expect(ACT2_CHARTWRIGHT_RECIPES).toHaveLength(5)
    expect(new Set(ACT2_CHARTWRIGHT_RECIPES.map((recipe) => recipe.id)).size).toBe(5)
    expect(ACT2_CHARTWRIGHT_RECIPES.every((recipe) => recipe.skillId === 'carpentry' && recipe.xp === 1)).toBe(true)
    expect(act2ChartwrightItemById('reef-sight-lens')).toMatchObject({ equipmentSlot: 'offhand' })
    expect(act2ChartwrightRecipeById('chartwright-storm-line')).toMatchObject({ level: 45 })
  })

  it('exports complete definitions for all six authored resource items and names every recipe source', () => {
    const resources = Object.values(ACT2_CHARTWRIGHT_RUNTIME_MAPS).flatMap((map) => map.entities.filter((entity) => entity.kind === 'resource'))
    const resourceInputs = ACT2_CHARTWRIGHT_RECIPES.flatMap((recipe) => recipe.ingredients).filter((entry) => entry.source !== 'existing-material')
    expect(resourceInputs.map((entry) => entry.itemId).sort()).toEqual(resources.map((resource) => resource.itemId).sort())
    for (const entry of resourceInputs) expect(resources.find((resource) => resource.itemId === entry.itemId)?.id).toBe(entry.source)
    expect(Object.keys(ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS).sort()).toEqual(resources.map((resource) => resource.itemId).sort())
    for (const resource of resources) expect(ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS[resource.itemId]).toMatchObject({ id: resource.itemId, sourceEntityId: resource.id })
    expect(ACT2_CHARTWRIGHT_RECIPES[0].ingredients).toContainEqual(expect.objectContaining({ itemId: 'votive-oil', source: 'existing-material' }))
  })

  it('has no orphan outputs and leaves survey charts exclusively to exact-once discovery', () => {
    const surveyCharts = new Set(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.discoveryReward.itemId))
    for (const item of Object.values(ACT2_CHARTWRIGHT_ITEM_DEFS)) {
      expect(item.useEffect || item.equipmentEffect).toBeTruthy()
      expect(surveyCharts.has(item.id)).toBe(false)
    }
    expect(ACT2_CHARTWRIGHT_RECIPES.map((recipe) => recipe.chartRequirementId)).toEqual(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.requiredChartId))
    expect(validateAct2ChartwrightCrafting()).toEqual({ valid: true, issues: [] })
  })

  it('covers the five bands at their contract levels with strictly increasing utility', () => {
    expect(ACT2_CHARTWRIGHT_RECIPES.map((recipe) => recipe.bandId)).toEqual(WAYFINDING_LEVEL_BANDS.map((band) => band.id))
    expect(ACT2_CHARTWRIGHT_RECIPES.map((recipe) => recipe.level)).toEqual(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.requiredLevel))
    const utility = ACT2_CHARTWRIGHT_RECIPES.map((recipe) => Math.max(...recipe.outputs.map((entry) => ACT2_CHARTWRIGHT_ITEM_BY_ID[entry.itemId].utility)))
    expect(utility.every((value, index) => index === 0 || value > utility[index - 1])).toBe(true)
  })

  it('anchors every recipe station to a real physical semantic target and exposes only future integration seams', () => {
    for (const station of Object.values(ACT2_CHARTWRIGHT_CRAFT_STATIONS)) expect(ACT2_CHARTWRIGHT_RUNTIME_MAPS[station.mapId].entities.find((entity) => entity.id === station.anchorEntityId)).toMatchObject({ kind: 'station', stationId: station.id })
    const seams = chartwrightCraftingIntegrationSeams()
    expect(seams.craftedItemIds).toHaveLength(8)
    expect(seams.recipeIds).toHaveLength(5)
    expect(seams.stationIds).toHaveLength(2)
    expect(seams.resourceItemIds).toHaveLength(6)
    expect(seams.surveyRewardItemIds).toHaveLength(5)
  })

  it('cannot generate currency or loop crafted value back into its own or an earlier band', () => {
    for (const [index, recipe] of ACT2_CHARTWRIGHT_RECIPES.entries()) {
      expect(recipe.outputs.every((entry) => entry.itemId !== 'drachma')).toBe(true)
      for (const output of recipe.outputs) expect(ACT2_CHARTWRIGHT_RECIPES.slice(0, index + 1).some((earlier) => earlier.ingredients.some((entry) => entry.itemId === output.itemId))).toBe(false)
    }
  })
})
