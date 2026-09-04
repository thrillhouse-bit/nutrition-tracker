// Isolated crafting graph for the Pelagos Chartwright slice.  This does not
// register items, recipes, stations, or effects with shared game systems yet.

import { ACT2_CHARTWRIGHT_RUNTIME_MAPS } from './act2ChartwrightRuntime.js'
import { WAYFINDING_LEVEL_BANDS, WAYFINDING_SURVEY_CONTRACTS } from './wayfinding.js'

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

const unique = (values) => new Set(values).size === values.length
const resourceEntities = Object.values(ACT2_CHARTWRIGHT_RUNTIME_MAPS).flatMap((map) => map.entities.filter((entity) => entity.kind === 'resource').map((entity) => ({ ...entity, mapId: map.id })))
const resourceByItemId = Object.fromEntries(resourceEntities.map((entity) => [entity.itemId, entity]))

export const ACT2_CHARTWRIGHT_EXISTING_MATERIAL_IDS = deepFreeze(['votive-oil'])

// The six physical resource nodes are future catalog entries too. They are
// source materials, not part of the eight crafted output count.
export const ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS = deepFreeze(Object.fromEntries(resourceEntities.map((entity) => [entity.itemId, {
  id: entity.itemId, name: entity.name.replace(/^(Chartwright |Brass |Blue |Shoal |Reef |Storm )/, ''), category: 'chartwright-material', stackable: false, tier: entity.level,
  sourceEntityId: entity.id, sourceMapId: entity.mapId,
}])))

// Exactly eight crafted outputs. Survey discovery—not crafting—is the sole
// source of carried Wayfinding charts; these tools/components use those charts
// as non-consumed recipe requirements and never duplicate a contract reward.
export const ACT2_CHARTWRIGHT_ITEM_DEFS = deepFreeze({
  'reed-soundings-slate': { id: 'reed-soundings-slate', name: 'Reed Soundings Slate', category: 'component', tier: 1, stackable: false, utility: 10, useEffect: { kind: 'wayfinding-survey-aid', bandId: 'harbor-apprentice' } },
  'chartwright-compass': { id: 'chartwright-compass', name: 'Chartwright Compass', category: 'tool', tier: 1, stackable: false, utility: 12, equipmentSlot: 'offhand', equipmentEffect: { kind: 'wayfinding-path-preview', rangeBonus: 1 } },
  'tide-pin-case': { id: 'tide-pin-case', name: 'Tide Pin Case', category: 'component', tier: 2, stackable: false, utility: 20, useEffect: { kind: 'wayfinding-survey-aid', bandId: 'tide-reader' } },
  'signal-wick-kit': { id: 'signal-wick-kit', name: 'Signal Wick Kit', category: 'tool', tier: 2, stackable: false, utility: 22, useEffect: { kind: 'signal-repair-capability', targetId: 'signal-buoy' } },
  'boundary-sounding-cord': { id: 'boundary-sounding-cord', name: 'Boundary Sounding Cord', category: 'component', tier: 3, stackable: false, utility: 30, useEffect: { kind: 'wayfinding-survey-aid', bandId: 'strait-surveyor' } },
  'reef-sight-lens': { id: 'reef-sight-lens', name: 'Reef-Sight Lens', category: 'tool', tier: 3, stackable: false, utility: 32, equipmentSlot: 'offhand', equipmentEffect: { kind: 'wayfinding-hazard-outline', tideStates: ['ebb', 'crossing', 'surge'] } },
  'storm-line-gauge': { id: 'storm-line-gauge', name: 'Storm-Line Gauge', category: 'tool', tier: 4, stackable: false, utility: 40, useEffect: { kind: 'wayfinding-survey-aid', bandId: 'open-water-navigator' } },
  'covenant-return-seal': { id: 'covenant-return-seal', name: 'Covenant Return Seal', category: 'tool', tier: 5, stackable: false, utility: 50, useEffect: { kind: 'wayfinding-survey-aid', bandId: 'covenant-chartwright' } },
})

// These station declarations point only to already-authored physical anchors.
// Later integration can render their labels and register their station IDs.
export const ACT2_CHARTWRIGHT_CRAFT_STATIONS = deepFreeze({
  'chartwright-open-table': { id: 'chartwright-open-table', mapId: 'chartwright-hall', anchorEntityId: 'chart-table', label: 'Open Chart Table' },
  'signal-buoy-workbench': { id: 'signal-buoy-workbench', mapId: 'submerged-signal-shoal', anchorEntityId: 'signal-buoy', label: 'Signal Buoy Workbench' },
})

const ingredient = (itemId, quantity, source) => ({ itemId, quantity, source })
const output = (itemId) => ({ itemId, quantity: 1 })

// Each recipe consumes a newly gathered regional resource and records a
// non-consumed chart requirement. Chart discovery remains exact-once in the
// survey domain; no recipe produces, destroys, or duplicates a chart reward.
// `xp: 0` is intentional: this equipment loop must not become an alternate
// stationary Wayfinding grind that invalidates the survey-only mastery budget.
export const ACT2_CHARTWRIGHT_RECIPES = deepFreeze([
  { id: 'chartwright-harbor-soundings', name: 'Lay Harbor Soundings', bandId: 'harbor-apprentice', level: 1, stationId: 'chartwright-open-table', skillId: 'carpentry', xp: 1, chartRequirementId: null, ingredients: [ingredient('waterproof-reed', 2, 'chartwright-reed-bed'), ingredient('votive-oil', 1, 'existing-material')], outputs: [output('reed-soundings-slate'), output('chartwright-compass')] },
  { id: 'chartwright-breakwater-tides', name: 'Pin Breakwater Tides', bandId: 'tide-reader', level: 10, stationId: 'chartwright-open-table', skillId: 'carpentry', xp: 1, chartRequirementId: 'harbor-soundings-chart', ingredients: [ingredient('brass-chart-pin', 2, 'brass-pin-cache'), ingredient('tidal-ink', 1, 'hall-ink-vats')], outputs: [output('tide-pin-case'), output('signal-wick-kit')] },
  { id: 'chartwright-nereid-boundary', name: 'Knot Nereid Boundary', bandId: 'strait-surveyor', level: 25, stationId: 'signal-buoy-workbench', skillId: 'carpentry', xp: 1, chartRequirementId: 'breakwater-tide-chart', ingredients: [ingredient('buoy-kelp', 2, 'shoal-kelp-skein')], outputs: [output('boundary-sounding-cord'), output('reef-sight-lens')] },
  { id: 'chartwright-storm-line', name: 'Etch Storm Line', bandId: 'open-water-navigator', level: 45, stationId: 'signal-buoy-workbench', skillId: 'carpentry', xp: 1, chartRequirementId: 'nereid-boundary-chart', ingredients: [ingredient('reef-glass', 2, 'reef-glass-vein')], outputs: [output('storm-line-gauge')] },
  { id: 'chartwright-covenant-return', name: 'Seal Covenant Return', bandId: 'covenant-chartwright', level: 70, stationId: 'signal-buoy-workbench', skillId: 'carpentry', xp: 1, chartRequirementId: 'storm-line-chart', ingredients: [ingredient('phosphor-oil', 2, 'storm-lantern-fish')], outputs: [output('covenant-return-seal')] },
])

export const ACT2_CHARTWRIGHT_ITEM_BY_ID = deepFreeze({ ...ACT2_CHARTWRIGHT_ITEM_DEFS })
export const ACT2_CHARTWRIGHT_RECIPE_BY_ID = deepFreeze(Object.fromEntries(ACT2_CHARTWRIGHT_RECIPES.map((recipe) => [recipe.id, recipe])))

export function act2ChartwrightItemById(itemId) { return ACT2_CHARTWRIGHT_ITEM_BY_ID[itemId] || null }
export function act2ChartwrightRecipeById(recipeId) { return ACT2_CHARTWRIGHT_RECIPE_BY_ID[recipeId] || null }

// Returns deterministic plain-data integration hooks without mutating inventory
// or skills. The reducer later owns material removal, output placement, XP, and
// equipment/use-effect application.
export function chartwrightCraftingIntegrationSeams() {
  return deepFreeze({
    craftedItemIds: Object.keys(ACT2_CHARTWRIGHT_ITEM_DEFS),
    resourceItemIds: Object.keys(ACT2_CHARTWRIGHT_RESOURCE_ITEM_DEFS),
    recipeIds: ACT2_CHARTWRIGHT_RECIPES.map((recipe) => recipe.id),
    stationIds: Object.keys(ACT2_CHARTWRIGHT_CRAFT_STATIONS),
    existingMaterialIds: [...ACT2_CHARTWRIGHT_EXISTING_MATERIAL_IDS],
    surveyRewardItemIds: WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.discoveryReward.itemId),
  })
}

export function validateAct2ChartwrightCrafting() {
  const issues = []
  const items = Object.values(ACT2_CHARTWRIGHT_ITEM_DEFS)
  const recipes = ACT2_CHARTWRIGHT_RECIPES
  const contractsByBand = Object.fromEntries(WAYFINDING_SURVEY_CONTRACTS.map((contract) => [contract.bandId, contract]))
  if (items.length !== 8 || !unique(items.map((item) => item.id))) issues.push('items must contain exactly eight unique IDs')
  if (recipes.length !== 5 || !unique(recipes.map((recipe) => recipe.id))) issues.push('recipes must contain exactly five unique IDs')
  if (!unique(recipes.map((recipe) => recipe.bandId)) || recipes.some((recipe) => !contractsByBand[recipe.bandId] || recipe.level !== contractsByBand[recipe.bandId].requiredLevel)) issues.push('recipes must cover each Wayfinding band at its contract level')
  const produced = recipes.flatMap((recipe) => recipe.outputs.map((entry) => entry.itemId))
  if (!unique(produced) || produced.length !== items.length || produced.some((itemId) => !ACT2_CHARTWRIGHT_ITEM_BY_ID[itemId])) issues.push('every item must be produced exactly once')
  const consumed = recipes.flatMap((recipe) => recipe.ingredients.map((entry) => entry.itemId))
  for (const item of items) if (!consumed.includes(item.id) && !item.useEffect && !item.equipmentEffect) issues.push(`orphan output:${item.id}`)
  for (const recipe of recipes) {
    const station = ACT2_CHARTWRIGHT_CRAFT_STATIONS[recipe.stationId]
    const anchor = station && ACT2_CHARTWRIGHT_RUNTIME_MAPS[station.mapId]?.entities.find((entity) => entity.id === station.anchorEntityId)
    if (!anchor || anchor.kind !== 'station' || anchor.stationId !== recipe.stationId) issues.push(`unplaced station:${recipe.stationId}`)
    for (const entry of recipe.ingredients) {
      const source = resourceByItemId[entry.itemId]
      if (!ACT2_CHARTWRIGHT_ITEM_BY_ID[entry.itemId] && !source && !ACT2_CHARTWRIGHT_EXISTING_MATERIAL_IDS.includes(entry.itemId)) issues.push(`unobtainable ingredient:${entry.itemId}`)
      if (source && entry.source !== source.id) issues.push(`resource source mismatch:${entry.itemId}`)
    }
    const recipeIndex = recipes.indexOf(recipe)
    if (recipe.outputs.some((entry) => recipe.ingredients.some((ingredientEntry) => ingredientEntry.itemId === entry.itemId))) issues.push(`self-feeding recipe:${recipe.id}`)
    if (recipe.chartRequirementId !== contractsByBand[recipe.bandId].requiredChartId) issues.push(`survey chart mismatch:${recipe.id}`)
  }
  const utility = recipes.map((recipe) => Math.max(...recipe.outputs.map((entry) => ACT2_CHARTWRIGHT_ITEM_BY_ID[entry.itemId].utility)))
  if (utility.some((value, index) => index > 0 && value <= utility[index - 1])) issues.push('recipe utility must increase by band')
  return { valid: issues.length === 0, issues }
}
