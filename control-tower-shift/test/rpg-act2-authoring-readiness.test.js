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
  ACT2_ENCOUNTERS,
  ACT2_MAIN_QUEST,
  ACT2_SIDE_QUEST,
} from '../src/rpg/act2Content.js'
import { ACT2_RENDERABLE_MAPS } from '../src/rpg/act2Runtime.js'
import { CONVERSATIONS, ENCOUNTERS, MAPS, QUEST_DEFS } from '../src/rpg/content.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { rpgConversationById } from '../src/rpg/registry.js'

function recordKey(record) {
  return `${record.kind}:${record.id}`
}

function act1RecordKeys() {
  const keys = new Set()
  for (const [questId, quest] of Object.entries(QUEST_DEFS)) {
    keys.add(`quest:${questId}`)
    for (const objective of quest.objectives) keys.add(`objective:${questId}:${objective.id}`)
  }
  for (const id of Object.keys(CONVERSATIONS)) keys.add(`conversation:${id}`)
  for (const [mapId, map] of Object.entries(MAPS)) {
    keys.add(`map:${mapId}`)
    for (const entity of map.entities.filter((candidate) => candidate.kind !== 'shop')) {
      keys.add(`${entity.kind === 'resource' ? 'resource' : 'entity'}:${mapId}:${entity.id}`)
    }
  }
  for (const id of Object.keys(ENCOUNTERS)) keys.add(`encounter:${id}`)
  return keys
}

function act2RecordKeys() {
  const keys = new Set(['conversation:act2-melite-oath-post', 'conversation:act2-ianthe-first-meeting'])
  for (const quest of [ACT2_MAIN_QUEST, ACT2_SIDE_QUEST]) {
    keys.add(`quest:${quest.id}`)
    for (const objective of quest.objectives) keys.add(`objective:${quest.id}:${objective.id}`)
  }
  for (const [mapId, map] of Object.entries(ACT2_RENDERABLE_MAPS)) {
    keys.add(`map:${mapId}`)
    for (const entity of map.entities.filter((candidate) => candidate.kind !== 'shop')) {
      keys.add(`${entity.kind === 'resource' ? 'resource' : 'entity'}:${mapId}:${entity.id}`)
    }
  }
  for (const id of Object.keys(ACT2_ENCOUNTERS)) keys.add(`encounter:${id}`)
  return keys
}

function expectSpecificAct2Metadata(record) {
  const authoring = record.authoring
  expect(authoring.dramaticQuestion.length, `${record.id} dramaticQuestion`).toBeGreaterThan(30)
  expect(authoring.systemsUsed.length, `${record.id} systemsUsed`).toBeGreaterThan(0)
  expect(new Set(authoring.systemsUsed).size, `${record.id} duplicate systems`).toBe(authoring.systemsUsed.length)
  expect(authoring.durableReward.length, `${record.id} durableReward`).toBeGreaterThan(30)
  expect(authoring.downstreamConsequence.length, `${record.id} consequence`).toBeGreaterThan(30)
  expect(authoring.recoveryBehavior.length, `${record.id} recovery`).toBeGreaterThan(30)
  expect(authoring.expectedMinutes, `${record.id} expectedMinutes`).toBeGreaterThan(0)
  expect(authoring.expectedMinutes, `${record.id} expectedMinutes`).toBeLessThanOrEqual(45)
  expect(authoring.originalityNotes, `${record.id} originality`).toMatch(/public-domain/i)
  expect(authoring.levelBand.min).toBeGreaterThanOrEqual(1)
  expect(authoring.levelBand.max).toBeGreaterThanOrEqual(authoring.levelBand.min)
  expect(authoring.regionBand).toEqual({ regionIds: ['pelagos-isles'], acts: { min: 2, max: 2 } })
}

describe('Act II production authoring readiness', () => {
  it('makes exactly the 64 collected Act II records ready while preserving the accepted Act I template', () => {
    const report = validateRPGContent()
    const act1 = act1RecordKeys()
    const act2 = act2RecordKeys()
    const readyKeys = new Set(report.authoredDepth.records
      .filter((record) => record.status === 'release-ready')
      .map(recordKey))

    expect(act1.size).toBe(39)
    expect(act2.size).toBe(64)
    // Whole-registry ready/legacy counts and summary are owned by whichever
    // authoring pass most recently landed (currently
    // rpg-act4-authoring-readiness); this only re-asserts that Act I+II's
    // own 103 records have not regressed, the same deferral rpg-act1-
    // authoring-readiness.test.js already uses for this file.
    for (const key of [...act1, ...act2]) expect(readyKeys.has(key), key).toBe(true)
  })

  it('deep-validates every Act II quest, objective, conversation, map, entity, resource, and encounter', () => {
    for (const quest of [ACT2_MAIN_QUEST, ACT2_SIDE_QUEST]) {
      expect(validateAuthoredQuest(quest), quest.id).toEqual({ valid: true, issues: [] })
      expectSpecificAct2Metadata(quest)
      for (const objective of quest.objectives) {
        expect(validateAuthoredObjective(objective), `${quest.id}:${objective.id}`).toEqual({ valid: true, issues: [] })
        expectSpecificAct2Metadata(objective)
      }
    }

    const conversation = rpgConversationById('act2-melite-oath-post')
    expect(validateAuthoredConversation(conversation)).toEqual({ valid: true, issues: [] })
    expectSpecificAct2Metadata(conversation)

    for (const map of Object.values(ACT2_RENDERABLE_MAPS)) {
      expect(validateAuthoredMap(map), map.id).toEqual({ valid: true, issues: [] })
      expectSpecificAct2Metadata(map)
      for (const entity of map.entities.filter((candidate) => candidate.kind !== 'shop')) {
        const validate = entity.kind === 'resource' ? validateAuthoredResource : validateAuthoredEntity
        expect(validate(entity), `${map.id}:${entity.id}`).toEqual({ valid: true, issues: [] })
        expectSpecificAct2Metadata(entity)
      }
    }

    for (const encounter of Object.values(ACT2_ENCOUNTERS)) {
      expect(validateAuthoredEncounter(encounter), encounter.id).toEqual({ valid: true, issues: [] })
      expectSpecificAct2Metadata(encounter)
    }
  })

  it('locks exact catalog readiness while asserting the registered Chartwright vertical slice', () => {
    const report = validateRPGContent()
    const legacyIds = report.authoredDepth.records
      .filter((record) => record.status === 'legacy')
      .map(recordKey)
      .sort()
    const releaseReady = new Set(report.authoredDepth.records
      .filter((record) => record.status === 'release-ready')
      .map(recordKey))

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

  it('locks the accepted Act II progression IDs while route geometry remains actively authored', () => {
    expect(ACT2_MAIN_QUEST.objectives.map((objective) => objective.id)).toEqual([
      'reach-pelagos-keeper', 'witness-first-surge', 'free-nereid-witnesses',
      'separate-boundary-names', 'secure-storm-anchorage', 'board-archive-barge',
      'defeat-archive-leviathan', 'ratify-salt-covenant',
    ])
    expect(ACT2_SIDE_QUEST.objectives.map((objective) => objective.id)).toEqual([
      'follow-echo-markers', 'confront-charmed-medusa', 'witness-desire-debate',
    ])
    expect(Object.keys(ACT2_RENDERABLE_MAPS)).toEqual([
      'pelagos-harbor', 'breakwater-road', 'nereid-caves', 'storm-anchorage', 'archive-barge-deck',
    ])
    expect(Object.keys(ACT2_ENCOUNTERS)).toEqual([
      'enc-act2-breakwater', 'enc-act2-nereid-caves', 'enc-act2-anchorage',
      'boss-act2-archive-leviathan', 'enc-act2-unmoored-charmed',
    ])
  })
})
