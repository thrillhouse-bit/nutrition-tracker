// Release-gate capability checks deliberately derive every physical claim from
// registered content.  This is not a catalog of asserted-complete skills: an
// absent target is evidence that the skill cannot yet be certified.
import { ALL_ITEM_DEFS, RECIPES } from './crafting.js'
import { REGISTERED_MAPS } from './registry.js'
import { SKILL_DEF_BY_ID } from './progression.js'
import { WAYFINDING_CONTRACT_BY_ID } from './wayfinding.js'

// These are the non-synthetic reducer action families that can award or
// advance player state through an authored physical interaction.  GAIN_XP is
// intentionally excluded: it is an administrative reducer event, never loop
// evidence.
export const PHYSICAL_SKILL_ACTIONS = Object.freeze([
  'CRAFT', 'SURVEY_WAYFINDING',
])

// A declaration remains only a production capability description: release
// evidence must independently reproduce it and cite its focused test.  The
// Wayfinding loop is the first one with a reducer-level, physical five-band
// proof; no artifact in this module can certify it by itself.
export const WAYFINDING_SKILL_LOOP_COMPONENT_CANDIDATE = Object.freeze({
  learn: {
    action: 'SURVEY_WAYFINDING', mapId: 'chartwright-hall',
    entityId: 'survey-pelagos-harbor-soundings', surveyContractId: 'pelagos-harbor-soundings',
  },
  practice: {
    action: 'SURVEY_WAYFINDING', mapId: 'submerged-signal-shoal',
    entityId: 'survey-nereid-boundary-soundings', surveyContractId: 'nereid-boundary-soundings',
  },
  mastery: {
    action: 'SURVEY_WAYFINDING', mapId: 'submerged-signal-shoal',
    entityId: 'survey-archive-return-bearing', surveyContractId: 'archive-return-bearing',
  },
  durableRewardId: 'covenant-return-chart',
  bands: Object.freeze([
    { action: 'SURVEY_WAYFINDING', mapId: 'chartwright-hall', entityId: 'survey-pelagos-harbor-soundings', surveyContractId: 'pelagos-harbor-soundings', level: 1 },
    { action: 'SURVEY_WAYFINDING', mapId: 'chartwright-hall', entityId: 'survey-breakwater-tide-bearing', surveyContractId: 'breakwater-tide-bearing', level: 10 },
    { action: 'SURVEY_WAYFINDING', mapId: 'submerged-signal-shoal', entityId: 'survey-nereid-boundary-soundings', surveyContractId: 'nereid-boundary-soundings', level: 25 },
    { action: 'SURVEY_WAYFINDING', mapId: 'submerged-signal-shoal', entityId: 'survey-anchorage-storm-line', surveyContractId: 'anchorage-storm-line', level: 45 },
    { action: 'SURVEY_WAYFINDING', mapId: 'submerged-signal-shoal', entityId: 'survey-archive-return-bearing', surveyContractId: 'archive-return-bearing', level: 70 },
  ]),
  tests: Object.freeze(['test/rpg-wayfinding-complete-skill-loop.test.js']),
})

// Alchemy's five bands all resolve through the same physical Beacon bench,
// but each signature includes its distinct authored recipe.  As with
// Wayfinding, release evidence must independently reproduce this description.
export const ALCHEMY_SKILL_LOOP_COMPONENT_CANDIDATE = Object.freeze({
  learn: {
    action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'dried-herbs',
  },
  practice: {
    action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'sage-tonic',
  },
  mastery: {
    action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'ambrosia-distillate',
  },
  durableRewardId: 'ambrosia-distillate',
  bands: Object.freeze([
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'dried-herbs', level: 1 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'herbal-salve', level: 12 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'sage-tonic', level: 20 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'moly-tonic', level: 30 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-alchemy-bench', recipeId: 'ambrosia-distillate', level: 45 },
  ]),
  tests: Object.freeze(['test/rpg-alchemy-complete-skill-loop.test.js']),
})

export const BRONZEWORK_SKILL_LOOP_COMPONENT_CANDIDATE = Object.freeze({
  learn: { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'copper-bar' },
  practice: { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'bronze-dory' },
  mastery: { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'laurel-aegis' },
  durableRewardId: 'laurel-aegis',
  bands: Object.freeze([
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'copper-bar', level: 1 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'bronze-ingot', level: 5 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'bronze-dory', level: 12 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'bronze-aspis', level: 26 },
    { action: 'CRAFT', mapId: 'beacon-overlook', entityId: 'beacon-bronze-forge', recipeId: 'laurel-aegis', level: 42 },
  ]),
  tests: Object.freeze(['test/rpg-bronzework-complete-skill-loop.test.js']),
})

export const DECLARED_COMPLETE_SKILL_LOOPS = Object.freeze({
})

const physicalEntity = (mapId, entityId) => REGISTERED_MAPS[mapId]?.entities?.find((entity) => entity.id === entityId) || null
const validText = (value) => typeof value === 'string' && value.length > 0
const hasTestFile = (testPath, testPaths) => validText(testPath) && testPaths.has(testPath)

export function canonicalSkillTargetSignature(claim) {
  if (!claim || !validText(claim.action) || !validText(claim.mapId) || !validText(claim.entityId)) return null
  if (claim.action === 'CRAFT') return `CRAFT:${claim.mapId}:${claim.entityId}:${claim.recipeId || ''}`
  if (claim.action === 'SURVEY_WAYFINDING') return `SURVEY_WAYFINDING:${claim.mapId}:${claim.entityId}:${claim.surveyContractId || ''}`
  return null
}

function actionFitsTarget(skillId, action, target) {
  if (!PHYSICAL_SKILL_ACTIONS.includes(action) || !target) return false
  if (action === 'CRAFT') return target.kind === 'station'
  if (action === 'SURVEY_WAYFINDING') return skillId === 'wayfinding' && target.kind === 'survey-marker'
  return false
}

function targetFacts(skillId, claim) {
  if (!canonicalSkillTargetSignature(claim)) return null
  const target = physicalEntity(claim.mapId, claim.entityId)
  if (!actionFitsTarget(skillId, claim.action, target)) return null
  if (claim.action === 'CRAFT') {
    const recipe = validText(claim.recipeId)
      ? RECIPES.find((candidate) => candidate.id === claim.recipeId && candidate.skillId === skillId && candidate.stationId === target.stationId)
      : null
    if (!recipe || !Number.isSafeInteger(recipe.level) || recipe.level <= 0) return null
    const rewardItemIds = (recipe.outputs || []).map((output) => output?.itemId)
      .filter((itemId) => validText(itemId) && ALL_ITEM_DEFS[itemId])
    return rewardItemIds.length ? { level: recipe.level, rewardItemIds } : null
  }
  const contract = validText(claim.surveyContractId) ? WAYFINDING_CONTRACT_BY_ID[claim.surveyContractId] : null
  if (!contract || target.surveyContractId !== contract.id || !Number.isSafeInteger(contract.requiredLevel) || contract.requiredLevel <= 0) return null
  const rewardItemId = contract.discoveryReward?.itemId
  return validText(rewardItemId) && ALL_ITEM_DEFS[rewardItemId]
    ? { level: contract.requiredLevel, rewardItemIds: [rewardItemId] }
    : null
}

export function hasNoDuplicateSkillEvidenceRecords(records) {
  if (!Array.isArray(records)) return false
  const skillIds = records.map((record) => record?.skillId)
  return skillIds.every(validText) && new Set(skillIds).size === skillIds.length
}

// An artifact must name three independently resolvable interactions and five
// authored level bands, then cite focused automated tests.  The caller supplies
// the tests visible in the immutable snapshot; this keeps this production
// module pure and makes the verifier responsible for git/file provenance.
export function validateCompleteSkillLoopCapabilityShape(artifact, { testPaths = [] } = {}) {
  const tests = new Set(testPaths)
  if (!artifact || artifact.schemaVersion !== 1 || artifact.evidenceType !== 'completeSkillLoop') return false
  const { skillId, measurements, capability } = artifact
  if (!SKILL_DEF_BY_ID[skillId] || !measurements || measurements.learn !== true || measurements.practice !== true || measurements.mastery !== true) return false
  if (!capability) return false
  const steps = [capability.learn, capability.practice, capability.mastery]
  const stepFacts = steps.map((claim) => targetFacts(skillId, claim))
  const stepSignatures = steps.map(canonicalSkillTargetSignature)
  if (stepFacts.some((facts) => !facts) || new Set(stepSignatures).size !== stepSignatures.length) return false
  if (!validText(capability.durableRewardId) || !stepFacts[2].rewardItemIds.includes(capability.durableRewardId)) return false
  if (!Array.isArray(capability.bands) || capability.bands.length < 5) return false
  const bandFacts = capability.bands.map((band) => targetFacts(skillId, band))
  const levels = capability.bands.map((band, index) => band?.level === bandFacts[index]?.level ? band.level : null)
  const bandSignatures = capability.bands.map(canonicalSkillTargetSignature)
  if (bandFacts.some((facts) => !facts) || bandSignatures.some((signature) => !signature)) return false
  if (!levels.every((level) => Number.isSafeInteger(level) && level > 0) || !levels.every((level, index) => index === 0 || level > levels[index - 1])) return false
  if (new Set(bandSignatures).size !== bandSignatures.length) return false
  if (!Array.isArray(capability.tests) || capability.tests.length === 0 || !capability.tests.every((path) => hasTestFile(path, tests))) return false
  return true
}

export function validateCompleteSkillLoopCapability(artifact, options = {}) {
  if (!validateCompleteSkillLoopCapabilityShape(artifact, options)) return false
  const declared = DECLARED_COMPLETE_SKILL_LOOPS[artifact.skillId]
  return Boolean(declared) && JSON.stringify(declared) === JSON.stringify(artifact.capability)
}
