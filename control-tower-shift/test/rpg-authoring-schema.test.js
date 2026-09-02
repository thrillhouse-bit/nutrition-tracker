import { describe, expect, it } from 'vitest'
import {
  AUTHORING_SCHEMA_VERSION,
  REQUIRED_AUTHORING_METADATA_FIELDS,
  buildAuthoredConversation,
  buildAuthoredEncounter,
  buildAuthoredEntity,
  buildAuthoredMap,
  buildAuthoredMerchant,
  buildAuthoredObjective,
  buildAuthoredQuest,
  buildAuthoredResource,
  createAuthoredDepthReport,
  validateAuthoredRecord,
} from '../src/rpg/authoringSchema.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { SHOP_DEFS } from '../src/rpg/economy.js'
import {
  REGISTERED_CONVERSATIONS,
  REGISTERED_ENCOUNTERS,
  REGISTERED_MAPS,
  REGISTERED_QUESTS,
} from '../src/rpg/registry.js'

function metadata(category) {
  return {
    category,
    dramaticQuestion: 'What must the player risk to keep a promise without owning another person?',
    systemsUsed: ['questing', 'combat', 'questing'],
    durableReward: 'A permanent route, relationship state, or useful systemic unlock.',
    downstreamConsequence: 'A later scene and regional service visibly respond to the outcome.',
    recoveryBehavior: 'Failure returns the player to a safe checkpoint without duplicating rewards.',
    expectedMinutes: 35,
    originalityNotes: 'Original covenant conflict derived from public-domain Greek myth, not copied quest expression.',
    levelBand: { min: 10, max: 20 },
    regionBand: { regionIds: ['pelagos', 'asterion', 'pelagos'], acts: { min: 1, max: 2 } },
  }
}

const BUILD_CASES = [
  ['quest', buildAuthoredQuest, { id: 'mq-test', objectives: [{ id: 'o1', kind: 'reach' }], authoring: metadata('main-quest') }],
  ['objective', buildAuthoredObjective, { id: 'o1', kind: 'reach', authoring: metadata('quest-objective') }],
  ['conversation', buildAuthoredConversation, { id: 'convo-test', start: 'n1', nodes: { n1: { text: 'Witness me.', next: null } }, authoring: metadata('conversation') }],
  ['map', buildAuthoredMap, { id: 'map-test', bounds: { w: 960, h: 540 }, spawns: { start: { id: 'start', x: 10, y: 10 } }, entities: [], authoring: metadata('region-map') }],
  ['entity', buildAuthoredEntity, { id: 'entity-test', kind: 'npc', x: 10, y: 10, authoring: metadata('world-entity') }],
  ['encounter', buildAuthoredEncounter, { id: 'enc-test', mapId: 'map-test', authoring: metadata('story-encounter') }],
  ['merchant', buildAuthoredMerchant, { id: 'shop-test', mapIds: ['map-test'], listings: { thyme: { itemId: 'thyme' } }, authoring: metadata('regional-merchant') }],
  ['resource', buildAuthoredResource, { id: 'node-test', kind: 'resource', itemId: 'thyme', skillId: 'foraging', x: 10, y: 10, authoring: metadata('gathering-resource') }],
]

describe('complete-game authoring schema', () => {
  it('requires every production metadata dimension named by the full-game contract', () => {
    expect(REQUIRED_AUTHORING_METADATA_FIELDS).toEqual([
      'category',
      'dramaticQuestion',
      'systemsUsed',
      'durableReward',
      'downstreamConsequence',
      'recoveryBehavior',
      'expectedMinutes',
      'originalityNotes',
      'levelBand',
      'regionBand',
    ])
  })

  it.each(BUILD_CASES)('builds and deeply freezes a deterministic release-ready %s', (kind, build, input) => {
    const before = JSON.stringify(input)
    const built = build(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(validateAuthoredRecord(kind, built)).toEqual({ valid: true, issues: [] })
    expect(built.authoring.schemaVersion).toBe(AUTHORING_SCHEMA_VERSION)
    expect(built.authoring.systemsUsed).toEqual(['combat', 'questing'])
    expect(built.authoring.regionBand.regionIds).toEqual(['asterion', 'pelagos'])
    expect(Object.isFrozen(built)).toBe(true)
    expect(Object.isFrozen(built.authoring)).toBe(true)
    expect(Object.isFrozen(built.authoring.levelBand)).toBe(true)
    expect(Object.isFrozen(built.authoring.regionBand.regionIds)).toBe(true)
  })

  it('returns canonically sorted diagnostics and rejects incomplete builders without mutation', () => {
    const incomplete = { id: 'mq-incomplete', objectives: [{ id: 'o1' }], authoring: { category: 'main-quest' } }
    const before = JSON.stringify(incomplete)
    const first = validateAuthoredRecord('quest', incomplete)
    const second = validateAuthoredRecord('quest', incomplete)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.valid).toBe(false)
    expect(first.issues.map((entry) => entry.path)).toEqual([...first.issues].map((entry) => entry.path).sort())
    expect(first.issues.filter((entry) => entry.code === 'MISSING_AUTHORING_FIELD')).toHaveLength(9)
    expect(() => buildAuthoredQuest(incomplete)).toThrow(TypeError)
    expect(JSON.stringify(incomplete)).toBe(before)
  })

  it('distinguishes legacy, incomplete, and release-ready records deterministically', () => {
    const ready = buildAuthoredObjective({ id: 'ready', kind: 'reach', authoring: metadata('quest-objective') })
    const report = createAuthoredDepthReport([
      { kind: 'objective', id: 'ready', path: 'objectives.ready', value: ready },
      { kind: 'objective', id: 'legacy', path: 'objectives.legacy', value: { id: 'legacy', kind: 'reach' } },
      { kind: 'objective', id: 'incomplete', path: 'objectives.incomplete', value: { id: 'incomplete', kind: 'reach', authoring: { category: 'quest-objective' } } },
    ])
    expect(report.counts).toEqual({ total: 3, legacy: 1, incomplete: 1, releaseReady: 1 })
    expect(report.records.map(({ id, status }) => [id, status])).toEqual([
      ['incomplete', 'incomplete'],
      ['legacy', 'legacy'],
      ['ready', 'release-ready'],
    ])
    expect(Object.isFrozen(report.records[0].issues)).toBe(true)
  })
})

describe('whole-registry authored-depth report', () => {
  it('truthfully classifies the Act I+II authoring passes while later records remain legacy', () => {
    const report = validateRPGContent()
    const objectiveCount = Object.values(REGISTERED_QUESTS).reduce((total, quest) => total + (quest.objectives || []).length, 0)
    const resourceCount = Object.values(REGISTERED_MAPS).reduce(
      (total, map) => total + (map.entities || []).filter((entity) => entity.kind === 'resource').length,
      0,
    )
    const entityCount = Object.values(REGISTERED_MAPS).reduce(
      (total, map) => total + (map.entities || []).filter((entity) => !['resource', 'shop'].includes(entity.kind)).length,
      0,
    )
    const expectedTotal = Object.keys(REGISTERED_QUESTS).length
      + objectiveCount
      + Object.keys(REGISTERED_CONVERSATIONS).length
      + Object.keys(REGISTERED_MAPS).length
      + entityCount
      + Object.keys(REGISTERED_ENCOUNTERS).length
      + Object.keys(SHOP_DEFS).length
      + resourceCount

    expect(report.authoredDepth.counts).toEqual({
      total: expectedTotal,
      legacy: 217,
      incomplete: 0,
      releaseReady: 91,
    })
    expect(report.authoredDepth.byKind.quest.total).toBe(Object.keys(REGISTERED_QUESTS).length)
    expect(report.authoredDepth.byKind.objective.total).toBe(objectiveCount)
    expect(report.authoredDepth.byKind.conversation.total).toBe(Object.keys(REGISTERED_CONVERSATIONS).length)
    expect(report.authoredDepth.byKind.map.total).toBe(Object.keys(REGISTERED_MAPS).length)
    expect(report.authoredDepth.byKind.encounter.total).toBe(Object.keys(REGISTERED_ENCOUNTERS).length)
    expect(report.authoredDepth.byKind.merchant.total).toBe(Object.keys(SHOP_DEFS).length)
    expect(report.authoredDepth.byKind.resource.total).toBe(resourceCount)
    expect(report.authoredDepth.byKind.entity.total).toBe(entityCount)

    const warnings = report.issues.filter((entry) => entry.code === 'LEGACY_AUTHORING_RECORD')
    expect(warnings).toHaveLength(217)
    expect(warnings.every((entry) => entry.severity === 'warning')).toBe(true)
    expect(report.issues.filter((entry) => entry.code === 'INCOMPLETE_AUTHORING_RECORD')).toEqual([])
    expect(report.summary.errors).toBe(0)
  })

  it('is byte-for-byte deterministic without rewriting any registry record', () => {
    const before = JSON.stringify({
      quests: REGISTERED_QUESTS,
      conversations: REGISTERED_CONVERSATIONS,
      maps: REGISTERED_MAPS,
      encounters: REGISTERED_ENCOUNTERS,
      shops: SHOP_DEFS,
    })
    const first = validateRPGContent()
    const second = validateRPGContent()
    expect(JSON.stringify(first.authoredDepth)).toBe(JSON.stringify(second.authoredDepth))
    expect(JSON.stringify({
      quests: REGISTERED_QUESTS,
      conversations: REGISTERED_CONVERSATIONS,
      maps: REGISTERED_MAPS,
      encounters: REGISTERED_ENCOUNTERS,
      shops: SHOP_DEFS,
    })).toBe(before)
  })
})
