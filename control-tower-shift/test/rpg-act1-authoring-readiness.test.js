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
import {
  ACT2_ENCOUNTERS,
  ACT2_MAIN_QUEST,
  ACT2_SIDE_QUEST,
} from '../src/rpg/act2Content.js'
import { ACT2_RENDERABLE_MAPS } from '../src/rpg/act2Runtime.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { SHOP_DEFS } from '../src/rpg/economy.js'
import {
  REGISTERED_CONVERSATIONS,
  REGISTERED_ENCOUNTERS,
  REGISTERED_MAPS,
  REGISTERED_QUESTS,
} from '../src/rpg/registry.js'

// Act II is a second production-authoring pass, released after Act I (see
// rpg-act2-authoring-readiness.test.js for its own template/count contract).
// This file only owns the Act I template and the still-legacy Acts III-V +
// merchants boundary, so it must not re-litigate whole-registry counts that
// the Act II template file already owns.
function act2RecordIds() {
  const mapIds = new Set(Object.keys(ACT2_RENDERABLE_MAPS))
  const questIds = new Set([ACT2_MAIN_QUEST.id, ACT2_SIDE_QUEST.id])
  const conversationIds = new Set(['act2-melite-oath-post'])
  const encounterIds = new Set(Object.keys(ACT2_ENCOUNTERS))
  return { mapIds, questIds, conversationIds, encounterIds }
}

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

    expect(expected.size).toBe(31)
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

  it('leaves every collected Act III–V record at the truthful legacy boundary', () => {
    const report = validateRPGContent()
    const act2 = act2RecordIds()
    const laterMapIds = new Set(Object.keys(REGISTERED_MAPS).filter((id) => !MAPS[id] && !act2.mapIds.has(id)))
    const laterQuestIds = new Set(Object.keys(REGISTERED_QUESTS).filter((id) => !QUEST_DEFS[id] && !act2.questIds.has(id)))
    const laterConversationIds = new Set(Object.keys(REGISTERED_CONVERSATIONS)
      .filter((id) => !CONVERSATIONS[id] && !act2.conversationIds.has(id)))
    const laterEncounterIds = new Set(Object.keys(REGISTERED_ENCOUNTERS)
      .filter((id) => !ENCOUNTERS[id] && !act2.encounterIds.has(id)))
    const laterMerchantIds = new Set(Object.values(SHOP_DEFS)
      .filter((shop) => shop.mapIds.some((mapId) => laterMapIds.has(mapId)))
      .map((shop) => shop.id))

    const later = report.authoredDepth.records.filter((record) => {
      if (record.kind === 'quest') return laterQuestIds.has(record.id)
      if (record.kind === 'objective') return laterQuestIds.has(record.id.split(':')[0])
      if (record.kind === 'conversation') return laterConversationIds.has(record.id)
      if (record.kind === 'map') return laterMapIds.has(record.id)
      if (record.kind === 'entity' || record.kind === 'resource') return laterMapIds.has(record.id.split(':')[0])
      if (record.kind === 'encounter') return laterEncounterIds.has(record.id)
      if (record.kind === 'merchant') return laterMerchantIds.has(record.id)
      return false
    })

    expect(later.length).toBeGreaterThan(0)
    expect(new Set(later.map((record) => record.status))).toEqual(new Set(['legacy']))
  })

  it('preserves the accepted Act I gameplay IDs, prose, geometry, effects, rewards, and counts', () => {
    expect(Object.keys(MAPS)).toEqual(['beacon-overlook', 'olive-road'])
    expect(MAPS['beacon-overlook'].bounds).toEqual({ w: 900, h: 470 })
    expect(MAPS['olive-road'].bounds).toEqual({ w: 900, h: 470 })
    expect(MAPS['beacon-overlook'].entities).toHaveLength(11)
    expect(MAPS['olive-road'].entities).toHaveLength(4)
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
