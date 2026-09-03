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
  ACT2_CONNECTIONS,
  ACT2_ENCOUNTERS,
  ACT2_MAIN_QUEST,
  ACT2_POCKETS,
  ACT2_REGION,
  ACT2_RESTORATION_FORMULATIONS,
  ACT2_SAVE_POINTS,
  ACT2_SIDE_QUEST,
  ACT2_TIDE_RULES,
  ACT2_TIDE_STATES,
} from '../src/rpg/act2Content.js'
import { ACT2_RENDERABLE_MAPS } from '../src/rpg/act2Runtime.js'
import { CONVERSATIONS, ENCOUNTERS, MAPS, QUEST_DEFS } from '../src/rpg/content.js'
import { validateRPGContent } from '../src/rpg/contentValidation.js'
import { SHOP_DEFS } from '../src/rpg/economy.js'
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
  const keys = new Set(['conversation:act2-melite-oath-post'])
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

function stripAuthoring(value) {
  if (Array.isArray(value)) return value.map(stripAuthoring)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'authoring')
      .map(([key, nested]) => [key, stripAuthoring(nested)]))
  }
  return value
}

function behaviorDigest() {
  const behavior = stripAuthoring({
    pockets: ACT2_POCKETS,
    connections: ACT2_CONNECTIONS,
    mainQuest: ACT2_MAIN_QUEST,
    sideQuest: ACT2_SIDE_QUEST,
    encounters: ACT2_ENCOUNTERS,
    tideStates: ACT2_TIDE_STATES,
    tideRules: ACT2_TIDE_RULES,
    savePoints: ACT2_SAVE_POINTS,
    formulations: ACT2_RESTORATION_FORMULATIONS,
    region: ACT2_REGION,
    maps: ACT2_RENDERABLE_MAPS,
    entryConversation: rpgConversationById('act2-melite-oath-post'),
  })
  return createHash('sha256').update(JSON.stringify(behavior)).digest('hex')
}

describe('Act II production authoring readiness', () => {
  it('makes exactly the 56 collected Act II records ready while preserving the accepted Act I template', () => {
    const report = validateRPGContent()
    const act1 = act1RecordKeys()
    const act2 = act2RecordKeys()
    const readyKeys = new Set(report.authoredDepth.records
      .filter((record) => record.status === 'release-ready')
      .map(recordKey))

    expect(act1.size).toBe(36)
    expect(act2.size).toBe(56)
    expect(readyKeys).toEqual(new Set([...act1, ...act2]))
    expect(report.authoredDepth.counts).toEqual({ total: 311, legacy: 219, incomplete: 0, releaseReady: 92 })
    expect(report.summary).toEqual({
      errors: 0,
      warnings: 219,
      total: 219,
      byCode: { LEGACY_AUTHORING_RECORD: 219 },
    })
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

  it('keeps all Acts III–V records and every merchant at the truthful legacy boundary', () => {
    const report = validateRPGContent()
    const owned = new Set([...act1RecordKeys(), ...act2RecordKeys()])
    const unowned = report.authoredDepth.records.filter((record) => !owned.has(recordKey(record)))
    const merchants = report.authoredDepth.records.filter((record) => record.kind === 'merchant')

    expect(unowned.length).toBe(219)
    expect(new Set(unowned.map((record) => record.status))).toEqual(new Set(['legacy']))
    expect(merchants).toHaveLength(Object.keys(SHOP_DEFS).length)
    expect(new Set(merchants.map((record) => record.status))).toEqual(new Set(['legacy']))
  })

  it('changes no accepted Act II behavior data outside authoring fields', () => {
    expect(behaviorDigest()).toBe('ba2b11344c503c1e6636348b08b4a421e9a12d512420cdb068d58ef9941e0971')
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
