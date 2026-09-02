#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const root = resolve(scriptDir, '..')
const contractPath = resolve(root, 'control-tower-shift/full-game-release.json')
const reportOnly = process.argv.includes('--report')
const jsonOnly = process.argv.includes('--json')

const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const importFromRoot = (path) => import(pathToFileURL(resolve(root, path)).href)

const [
  progression,
  crafting,
  registry,
  economy,
  contentValidation,
] = await Promise.all([
  importFromRoot('control-tower-shift/src/rpg/progression.js'),
  importFromRoot('control-tower-shift/src/rpg/crafting.js'),
  importFromRoot('control-tower-shift/src/rpg/registry.js'),
  importFromRoot('control-tower-shift/src/rpg/economy.js'),
  importFromRoot('control-tower-shift/src/rpg/contentValidation.js'),
])

const integrity = contentValidation.validateRPGContent()
const maps = Object.values(registry.REGISTERED_MAPS)
const quests = Object.values(registry.REGISTERED_QUESTS)
const conversations = Object.values(registry.REGISTERED_CONVERSATIONS)
const encounters = Object.values(registry.REGISTERED_ENCOUNTERS)
const entities = maps.flatMap((map) => map.entities || [])

const wordsIn = (text) => String(text || '').trim().match(/[\p{L}\p{N}'’-]+/gu)?.length || 0
const dialogueWords = conversations.reduce((sum, conversation) => sum + Object.values(conversation.nodes || {})
  .reduce((nodeSum, node) => nodeSum + wordsIn(node.text)
    + (node.choices || []).reduce((choiceSum, choice) => choiceSum + wordsIn(choice.text), 0), 0), 0)

const uniqueNamedNpcs = new Set(entities
  .filter((entity) => entity.kind === 'npc' && (entity.name || entity.label))
  .map((entity) => entity.name || entity.label))

const actual = {
  skills: progression.SKILL_DEFS.length,
  completeSkillLoops: contract.evidence.completeSkillLoops,
  items: Object.keys(crafting.ALL_ITEM_DEFS).length,
  recipes: crafting.RECIPES.length,
  regions: Object.keys(registry.REGISTERED_REGIONS).length,
  maps: maps.length,
  quests: quests.length,
  mainQuests: quests.filter((quest) => quest.id?.startsWith('mq-')).length,
  sideQuests: quests.filter((quest) => quest.id?.startsWith('sq-')).length,
  characterQuests: quests.filter((quest) => quest.category === 'character').length,
  masteryQuests: quests.filter((quest) => quest.category === 'mastery').length,
  dialogueWords,
  conversations: conversations.length,
  encounters: encounters.length,
  bosses: encounters.filter((encounter) => Boolean(encounter.boss) || encounter.id?.startsWith('boss-')).length,
  namedNpcs: uniqueNamedNpcs.size,
  resourceNodes: entities.filter((entity) => entity.kind === 'resource').length,
  merchants: Object.keys(economy.SHOP_DEFS).length,
  banks: entities.filter((entity) => entity.kind === 'bank').length,
  usefulEquipmentSlots: contract.evidence.usefulEquipmentSlots,
  reactiveChoices: contract.evidence.reactiveChoices,
  delayedConsequences: contract.evidence.delayedConsequences,
}

const blockers = []
for (const [metric, minimum] of Object.entries(contract.minimums)) {
  const value = actual[metric]
  if (!Number.isFinite(value) || value < minimum) {
    blockers.push({
      code: 'MINIMUM_NOT_MET',
      metric,
      actual: value ?? null,
      required: minimum,
      message: `${metric}: ${value ?? 'unmeasured'} / ${minimum}`,
    })
  }
}

if (integrity.summary.errors > 0) {
  blockers.push({
    code: 'CONTENT_INTEGRITY_ERRORS',
    metric: 'contentIntegrityErrors',
    actual: integrity.summary.errors,
    required: 0,
    message: `${integrity.summary.errors} content-integrity errors remain`,
  })
}
if (integrity.summary.warnings > 0) {
  blockers.push({
    code: 'CONTENT_INTEGRITY_WARNINGS',
    metric: 'contentIntegrityWarnings',
    actual: integrity.summary.warnings,
    required: 0,
    message: `${integrity.summary.warnings} content-integrity warnings remain`,
  })
}

const evidenceRequirements = {
  blindPlaytestCount: (value) => Number.isInteger(value) && value >= 20,
  mainStoryMedianHours: (value) => Number.isFinite(value) && value >= 35 && value <= 45,
  substantialSideContentMedianHours: (value) => Number.isFinite(value) && value >= 55 && value <= 75,
  fullNormalUiPlaythrough: Boolean,
  accountSaveConflictMatrix: Boolean,
  tradeEscrowMatrix: Boolean,
  saveRecoveryMatrix: Boolean,
  browserAccessibilityMatrix: Boolean,
  performanceMatrix: Boolean,
  economySimulation: Boolean,
  originalityEditorialReview: Boolean,
}

for (const [name, accepts] of Object.entries(evidenceRequirements)) {
  const value = contract.evidence[name]
  if (!accepts(value)) {
    blockers.push({
      code: 'EVIDENCE_MISSING',
      metric: name,
      actual: value,
      required: true,
      message: `${name}: required release evidence is absent or outside its accepted range`,
    })
  }
}

if (contract.releaseStatus !== 'ready') {
  blockers.push({
    code: 'RELEASE_STATUS_BLOCKED',
    metric: 'releaseStatus',
    actual: contract.releaseStatus,
    required: 'ready',
    message: `releaseStatus is ${contract.releaseStatus}; an authorized whole-game review must set it to ready`,
  })
}

const report = {
  product: contract.product,
  schemaVersion: contract.schemaVersion,
  ready: blockers.length === 0,
  actual,
  integrity: integrity.summary,
  blockers,
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`${report.product} complete-game gate: ${report.ready ? 'READY' : 'BLOCKED'}`)
  console.log(`Content integrity: ${report.integrity.errors} errors, ${report.integrity.warnings} warnings`)
  for (const blocker of blockers) console.log(`- ${blocker.message}`)
}

if (!reportOnly && blockers.length) process.exit(1)
