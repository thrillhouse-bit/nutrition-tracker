import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  validateAuthoredConversation,
  validateAuthoredEncounter,
  validateAuthoredEntity,
  validateAuthoredMap,
  validateAuthoredObjective,
  validateAuthoredQuest,
  validateAuthoredResource,
} from '../src/rpg/authoringSchema.js'
import {
  CONVERSATIONS,
  ENCOUNTERS,
  MAPS,
  QUEST_DEFS,
} from '../src/rpg/content.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'

function act1RecordKeys() {
  const keys = new Set()
  for (const [questId, quest] of Object.entries(QUEST_DEFS)) {
    keys.add(`quest:${questId}`)
    for (const objective of quest.objectives) keys.add(`objective:${questId}:${objective.id}`)
  }
  for (const conversationId of Object.keys(CONVERSATIONS)) keys.add(`conversation:${conversationId}`)
  for (const [mapId, map] of Object.entries(MAPS)) {
    keys.add(`map:${mapId}`)
    for (const entity of map.entities.filter((candidate) => candidate.kind !== 'shop')) {
      keys.add(`${entity.kind === 'resource' ? 'resource' : 'entity'}:${mapId}:${entity.id}`)
    }
  }
  for (const encounterId of Object.keys(ENCOUNTERS)) keys.add(`encounter:${encounterId}`)
  return keys
}

function recordKey(record) {
  return `${record.kind}:${record.id}`
}

function expectSpecificMetadata(record) {
  const authoring = record.authoring
  expect(authoring.dramaticQuestion.length, `${record.id} dramaticQuestion`).toBeGreaterThan(30)
  expect(authoring.systemsUsed.length, `${record.id} systemsUsed`).toBeGreaterThan(0)
  expect(new Set(authoring.systemsUsed).size, `${record.id} duplicate systems`).toBe(authoring.systemsUsed.length)
  expect(authoring.durableReward.length, `${record.id} durableReward`).toBeGreaterThan(30)
  expect(authoring.downstreamConsequence.length, `${record.id} consequence`).toBeGreaterThan(30)
  expect(authoring.recoveryBehavior.length, `${record.id} recovery`).toBeGreaterThan(30)
  expect(authoring.expectedMinutes, `${record.id} expectedMinutes`).toBeGreaterThan(0)
  expect(authoring.expectedMinutes, `${record.id} expectedMinutes`).toBeLessThanOrEqual(25)
  expect(authoring.originalityNotes, `${record.id} originality`).toMatch(/public-domain/i)
  expect(authoring.levelBand.min).toBeGreaterThanOrEqual(1)
  expect(authoring.levelBand.max).toBeGreaterThanOrEqual(authoring.levelBand.min)
  expect(authoring.regionBand).toEqual({ regionIds: ['asterion-reach'], acts: { min: 1, max: 1 } })
}

describe('Act I canonical production-authoring template', () => {
  it('marks every collected Act I record release-ready', () => {
    // Whole-registry ready/legacy counts are owned by whichever authoring
    // pass most recently landed (currently rpg-act2-authoring-readiness);
    // this only re-asserts that Act I's own 28 records have not regressed.
    const report = validateRPGContent()
    const expected = act1RecordKeys()
    const readyKeys = new Set(report.authoredDepth.records
      .filter((record) => record.status === 'release-ready')
      .map(recordKey))

    expect(expected.size).toBe(39)
    for (const key of expected) expect(readyKeys.has(key), key).toBe(true)
  })

  it('deep-validates specific metadata on quests, objectives, scenes, maps, entities, resources, and encounters', () => {
    for (const quest of Object.values(QUEST_DEFS)) {
      expect(validateAuthoredQuest(quest), quest.id).toEqual({ valid: true, issues: [] })
      expectSpecificMetadata(quest)
      for (const objective of quest.objectives) {
        expect(validateAuthoredObjective(objective), `${quest.id}:${objective.id}`).toEqual({ valid: true, issues: [] })
        expectSpecificMetadata(objective)
      }
    }
    for (const conversation of Object.values(CONVERSATIONS)) {
      expect(validateAuthoredConversation(conversation), conversation.id).toEqual({ valid: true, issues: [] })
      expectSpecificMetadata(conversation)
    }
    for (const map of Object.values(MAPS)) {
      expect(validateAuthoredMap(map), map.id).toEqual({ valid: true, issues: [] })
      expectSpecificMetadata(map)
      for (const entity of map.entities.filter((candidate) => candidate.kind !== 'shop')) {
        const validate = entity.kind === 'resource' ? validateAuthoredResource : validateAuthoredEntity
        expect(validate(entity), `${map.id}:${entity.id}`).toEqual({ valid: true, issues: [] })
        expectSpecificMetadata(entity)
      }
    }
    for (const encounter of Object.values(ENCOUNTERS)) {
      expect(validateAuthoredEncounter(encounter), encounter.id).toEqual({ valid: true, issues: [] })
      expectSpecificMetadata(encounter)
    }

    expect(QUEST_DEFS['mq-act1-ash-at-dawn'].authoring.expectedMinutes).toBe(25)
    expect(QUEST_DEFS['sq-lost-witness'].authoring.expectedMinutes).toBe(5)
  })

  it('reconciles the exact current legacy set while Chartwright records are registered release-ready', () => {
    const report = validateRPGContent()
    const key = (record) => `${record.kind}:${record.id}`
    const legacyIds = report.authoredDepth.records.filter((record) => record.status === 'legacy').map(key).sort()
    const releaseReady = new Set(report.authoredDepth.records.filter((record) => record.status === 'release-ready').map(key))
    expect(report.authoredDepth.counts).toEqual({ total: 372, legacy: 225, incomplete: 0, releaseReady: 147 })
    expect(createHash('sha256').update(JSON.stringify(legacyIds)).digest('hex'))
      .toBe('aa956b2adaf82ba8108640b6aadb916465aa27adb13c2efb9d742476b951aaaa')
    for (const chartwrightKey of [
      'map:chartwright-hall', 'map:submerged-signal-shoal',
      'conversation:act2-ianthe-chartwright-briefing', 'conversation:act2-naukleros-signal-shoal',
      'quest:cq-act2-ianthe-open-chart', 'quest:mqy-wayfinding-covenant-routes', 'quest:sq-act2-submerged-signal',
      'encounter:enc-act2-submerged-signal-reef',
      'entity:chartwright-hall:chart-table', 'entity:submerged-signal-shoal:signal-buoy',
    ]) expect(releaseReady.has(chartwrightKey), chartwrightKey).toBe(true)
  })

  it('preserves the accepted Act I gameplay IDs, prose, geometry, effects, rewards, and counts', () => {
    expect(Object.keys(MAPS)).toEqual(['beacon-overlook', 'olive-road'])
    expect(MAPS['beacon-overlook'].bounds).toEqual({ w: 900, h: 470 })
    expect(MAPS['olive-road'].bounds).toEqual({ w: 900, h: 470 })
    expect(MAPS['beacon-overlook'].entities).toHaveLength(16)
    expect(MAPS['olive-road'].entities).toHaveLength(7)
    expect(MAPS['beacon-overlook'].exits.map((exit) => exit.id)).toEqual(['to-olive-road', 'to-sun-court'])
    expect(MAPS['olive-road'].exits.map((exit) => exit.id)).toEqual(['to-beacon', 'to-entry-court'])

    expect(Object.keys(ENCOUNTERS)).toEqual(['enc-act1-entry', 'enc-act1-sun'])
    expect(ENCOUNTERS['enc-act1-entry'].campaignLevelId).toBe('acropolis-entry')
    expect(ENCOUNTERS['enc-act1-sun'].campaignLevelId).toBe('sun-court')
    expect(ENCOUNTERS['enc-act1-sun'].eliteOverlay).toMatchObject({
      id: 'name-cutter-captain', baseMonsterType: 'chronos', healthMult: 2.6,
    })

    expect(CONVERSATIONS['act1-thessa-overlook'].nodes.n1.text).toBe('Kallias. You came up the terraces in time to see it — the treaty-stone is broken. Far-Sighted is already bleeding out of Asterion Reach.')
    expect(CONVERSATIONS['act1-thessa-exit'].nodes.n1.effects).toEqual([{ kind: 'epithet', id: 'far-sighted' }])
    expect(CONVERSATIONS['sq-lost-witness-return'].nodes.n3.effects).toEqual([
      { kind: 'currency', amount: 25 },
      { kind: 'flag', id: 'sq-lost-witness-complete', value: true },
    ])

    expect(QUEST_DEFS['mq-act1-ash-at-dawn'].objectives.map((objective) => objective.id)).toEqual([
      'reach-beacon-start', 'talk-thessa', 'choose-patron', 'reach-olive-road',
      'clear-entry', 'clear-sun', 'talk-thessa-exit',
    ])
    expect(QUEST_DEFS['sq-lost-witness'].objectives.map((objective) => objective.id)).toEqual(['read-tablet', 'return-tablet'])
    expect(QUEST_DEFS['sq-lost-witness'].rewards).toEqual([
      { kind: 'currency', amount: 25 },
      { kind: 'flag', id: 'sq-lost-witness-complete', value: true },
    ])
  })
})
