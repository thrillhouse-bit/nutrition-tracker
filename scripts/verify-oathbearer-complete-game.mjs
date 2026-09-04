#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evidenceArtifactFromGit, releaseEvidenceAttestationFromGit, releaseWorkingTreeFromGit } from './oathbearer-release-evidence.mjs'
import { readdirSync, statSync } from 'node:fs'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const root = resolve(scriptDir, '..')
const contractArgument = process.argv.indexOf('--contract')
if (contractArgument >= 0 && !process.argv.includes('--test-contract')) {
  throw new Error('--contract is test-only; pass --test-contract for isolated release-gate fixtures')
}
const contractPath = contractArgument >= 0
  ? resolve(root, process.argv[contractArgument + 1] || '')
  : resolve(root, 'control-tower-shift/full-game-release.json')
const reportOnly = process.argv.includes('--report')
const jsonOnly = process.argv.includes('--json')

const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const importFromRoot = (path) => import(pathToFileURL(resolve(root, path)).href)

const testFiles = (directory) => readdirSync(directory).flatMap((entry) => {
  const path = resolve(directory, entry)
  return statSync(path).isDirectory() ? testFiles(path) : [path]
}).map((path) => path.slice(root.length + 1))

const [
  progression,
  crafting,
  registry,
  economy,
  contentValidation,
  act2Content,
  act3Content,
  act4Content,
  act5Content,
  equipment,
  skillLoopCapabilities,
] = await Promise.all([
  importFromRoot('control-tower-shift/src/rpg/progression.js'),
  importFromRoot('control-tower-shift/src/rpg/crafting.js'),
  importFromRoot('control-tower-shift/src/rpg/registry.js'),
  importFromRoot('control-tower-shift/src/rpg/economy.js'),
  importFromRoot('control-tower-shift/src/rpg/contentValidation.js'),
  importFromRoot('control-tower-shift/src/rpg/act2Content.js'),
  importFromRoot('control-tower-shift/src/rpg/act3Content.js'),
  importFromRoot('control-tower-shift/src/rpg/act4Content.js'),
  importFromRoot('control-tower-shift/src/rpg/act5Content.js'),
  importFromRoot('control-tower-shift/src/rpg/equipment.js'),
  importFromRoot('control-tower-shift/src/rpg/skillLoopCapabilities.js'),
])

const structuredEvidence = contract.evidence?.schemaVersion === 2 ? contract.evidence : null
const evidenceRecords = (name) => Array.isArray(structuredEvidence?.release?.[name])
  ? structuredEvidence.release[name]
  : []
const validEvidenceFor = (records, evidenceType) => records
  .map((record) => artifactEvidence(record, evidenceType))
  .filter(Boolean)
const skillLoopEvidence = Array.isArray(structuredEvidence?.technical?.completeSkillLoops)
  ? structuredEvidence.technical.completeSkillLoops
  : []
const allEvidenceRecords = [
  ...skillLoopEvidence,
  ...Object.values(structuredEvidence?.release || {}).flatMap((records) => Array.isArray(records) ? records : []),
]
const evidenceAttestation = releaseEvidenceAttestationFromGit({ root, records: allEvidenceRecords })
const workingTree = releaseWorkingTreeFromGit({ root })
const artifactEvidence = (record, evidenceType) => evidenceAttestation.valid
  ? evidenceArtifactFromGit({ root, record, evidenceType, expectedArtifactCommit: evidenceAttestation.snapshotCommit })
  : null
const knownSkillIds = new Set(progression.SKILL_DEFS.map((skill) => skill.id))
const knownTestPaths = testFiles(resolve(root, 'control-tower-shift/test'))
const skillLoopIds = skillLoopEvidence.map((record) => record?.skillId).filter((skillId) => typeof skillId === 'string')
const duplicateSkillLoopIds = [...new Set(skillLoopIds.filter((skillId, index) => skillLoopIds.indexOf(skillId) !== index))]
const hasDuplicateSkillLoopEvidence = !skillLoopCapabilities.hasNoDuplicateSkillEvidenceRecords(skillLoopEvidence)
  && duplicateSkillLoopIds.length > 0
const validSkillLoopIds = new Set((hasDuplicateSkillLoopEvidence ? [] : skillLoopEvidence)
  .filter((record) => knownSkillIds.has(record?.skillId)
    && (() => {
      const artifact = artifactEvidence(record, 'completeSkillLoop')
      return artifact?.skillId === record.skillId
        && skillLoopCapabilities.validateCompleteSkillLoopCapability(artifact, { testPaths: knownTestPaths })
    })())
  .map((record) => record.skillId))

const usefulEquipmentSlots = Object.values(equipment.equipmentProgressionCatalog())
  .filter((ladder) => ladder.length >= 3
    && new Set(ladder.map((entry) => entry.itemId)).size >= 3
    && ladder.every((entry) => entry.item?.equipmentSlot === entry.slot && Number.isFinite(entry.utility))
    && ladder.every((entry, index) => index === 0 || entry.utility > ladder[index - 1].utility)).length

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

// A "reactive choice" is a real, reachable main-quest 'choose' objective
// whose selection provably changes downstream game state, not just tone:
// each Act II/III/IV restoration formulation carries an evidenceWeight that
// feeds endingEvidenceScores() in state.js, which gates which Act V ending
// the player may ratify. Verified reachable via each formulation's id
// appearing as a real choiceId on a main-quest objective
// (e.g. 'harbor-first' on Act II's ratify-salt-covenant,
// 'licensed-flame' on Act IV's ratify-mortal-draft) — never counts a
// tone-only or cosmetic dialogue choice.
const restorationFormulations = [
  ...act2Content.ACT2_RESTORATION_FORMULATIONS,
  ...act3Content.ACT3_RESTORATION_FORMULATIONS,
  ...act4Content.ACT4_RESTORATION_FORMULATIONS,
]
const reactiveChoices = restorationFormulations
  .filter((formulation) => formulation.evidenceWeight && Object.keys(formulation.evidenceWeight).length > 0).length

// A "delayed consequence" is a downstream effect that manifests only much
// later as a direct, gated result of earlier choices — not something
// always available regardless of what the player chose. Counts Act V
// ending variants whose eligibility is actually gated by an evidence
// threshold (excludes the always-available fallback ending, whose
// threshold field is never consulted by choiceIsAvailable() in state.js).
const delayedConsequences = act5Content.ACT5_ENDING_VARIANTS
  .filter((ending) => ending.threshold && Object.keys(ending.threshold).length > 0 && !ending.fallback).length

const actual = {
  skills: progression.SKILL_DEFS.length,
  completeSkillLoops: validSkillLoopIds.size,
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
  usefulEquipmentSlots,
  reactiveChoices,
  delayedConsequences,
}

const blockers = []
if (!workingTree.clean) {
  blockers.push({
    code: 'WORKING_TREE_DIRTY',
    metric: 'workingTree',
    actual: workingTree.dirtyPaths,
    required: 'HEAD-equivalent tree outside governed quarantine',
    message: `complete-game verification requires a clean working tree outside governed quarantine: ${workingTree.dirtyPaths.join(', ')}`,
  })
}
if (hasDuplicateSkillLoopEvidence) {
  blockers.push({
    code: 'DUPLICATE_SKILL_LOOP_EVIDENCE',
    metric: 'completeSkillLoops',
    actual: duplicateSkillLoopIds,
    required: 'unique skill IDs',
    message: `duplicate skill-loop evidence: ${duplicateSkillLoopIds.join(', ')}`,
  })
}
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
  blindPlaytests: (records) => validEvidenceFor(records, 'blindPlaytests').filter((artifact) => Number.isInteger(artifact.measurements.participants) && artifact.measurements.participants > 0).reduce((sum, artifact) => sum + artifact.measurements.participants, 0) >= 20,
  mainStoryTiming: (records) => validEvidenceFor(records, 'mainStoryTiming').some((artifact) => Number.isInteger(artifact.measurements.sampleCount) && artifact.measurements.sampleCount >= 20 && Number.isFinite(artifact.measurements.medianHours) && artifact.measurements.medianHours >= 35 && artifact.measurements.medianHours <= 45),
  substantialSideContentTiming: (records) => validEvidenceFor(records, 'substantialSideContentTiming').some((artifact) => Number.isInteger(artifact.measurements.sampleCount) && artifact.measurements.sampleCount >= 20 && Number.isFinite(artifact.measurements.medianHours) && artifact.measurements.medianHours >= 55 && artifact.measurements.medianHours <= 75),
  fullNormalUiPlaythrough: (records) => validEvidenceFor(records, 'fullNormalUiPlaythrough').some((artifact) => artifact.measurements.completed === true && Number.isInteger(artifact.measurements.completedActs) && artifact.measurements.completedActs >= 5),
  accountSaveConflictMatrix: (records) => validEvidenceFor(records, 'accountSaveConflictMatrix').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.caseCount) && artifact.measurements.caseCount > 0),
  tradeEscrowMatrix: (records) => validEvidenceFor(records, 'tradeEscrowMatrix').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.caseCount) && artifact.measurements.caseCount > 0),
  saveRecoveryMatrix: (records) => validEvidenceFor(records, 'saveRecoveryMatrix').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.caseCount) && artifact.measurements.caseCount > 0),
  browserAccessibilityMatrix: (records) => validEvidenceFor(records, 'browserAccessibilityMatrix').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.caseCount) && artifact.measurements.caseCount > 0),
  performanceMatrix: (records) => validEvidenceFor(records, 'performanceMatrix').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.sampleCount) && artifact.measurements.sampleCount > 0),
  economySimulation: (records) => validEvidenceFor(records, 'economySimulation').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.runCount) && artifact.measurements.runCount > 0),
  originalityEditorialReview: (records) => validEvidenceFor(records, 'originalityEditorialReview').some((artifact) => artifact.measurements.passed === true && Number.isInteger(artifact.measurements.reviewedRecords) && artifact.measurements.reviewedRecords > 0),
}

if (!structuredEvidence) {
  blockers.push({ code: 'EVIDENCE_SCHEMA_INVALID', metric: 'evidence', actual: contract.evidence?.schemaVersion ?? null, required: 2, message: 'evidence must use release-proof schema version 2' })
}
if (allEvidenceRecords.length > 0 && !evidenceAttestation.valid) {
  blockers.push({
    code: 'EVIDENCE_ATTESTATION_INVALID',
    metric: 'evidenceAttestation',
    actual: evidenceAttestation.snapshotCommit,
    required: 'HEAD^ snapshot with manifest-only final commit',
    message: 'evidence records must all attest the HEAD^ snapshot and HEAD may change only full-game-release.json',
  })
}
for (const [name, accepts] of Object.entries(evidenceRequirements)) {
  const records = evidenceRecords(name)
  if (!accepts(records)) {
    blockers.push({
      code: 'EVIDENCE_MISSING',
      metric: name,
      actual: records.length,
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
