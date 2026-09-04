import { describe, expect, it } from 'vitest'
import { findWorldPath, isWorldPointWalkable } from '../src/rpg/pathfinding.js'
import { validateAuthoredEncounter, validateAuthoredMap, validateAuthoredObjective, validateAuthoredQuest } from '../src/rpg/authoringSchema.js'
import { ACT2_CHARTWRIGHT_CHARACTER_QUEST, ACT2_CHARTWRIGHT_CONNECTIONS, ACT2_CHARTWRIGHT_CONVERSATION_IDS, ACT2_CHARTWRIGHT_ENCOUNTERS, ACT2_CHARTWRIGHT_EXTERNAL_SEAMS, ACT2_CHARTWRIGHT_MASTERY_QUEST, ACT2_CHARTWRIGHT_POCKETS, ACT2_CHARTWRIGHT_SIDE_QUEST } from '../src/rpg/act2ChartwrightContent.js'
import { ACT2_CHARTWRIGHT_RUNTIME_MAPS, act2ChartwrightRuntimeEntityById, act2ChartwrightRuntimeExitById } from '../src/rpg/act2ChartwrightRuntime.js'
import { WAYFINDING_SURVEY_CONTRACTS } from '../src/rpg/wayfinding.js'

const target = (map, id) => map.entities.find((entity) => entity.id === id) || map.exits.find((exit) => exit.id === id)

describe('Act II Chartwright isolated authoring seam', () => {
  it('defines two maps, three named NPCs, five survey markers, six resources, and one elite route encounter', () => {
    expect(Object.keys(ACT2_CHARTWRIGHT_POCKETS)).toEqual(['chartwright-hall', 'submerged-signal-shoal'])
    const maps = Object.values(ACT2_CHARTWRIGHT_RUNTIME_MAPS)
    const entities = maps.flatMap((map) => map.entities)
    expect(entities.filter((entity) => entity.kind === 'npc')).toHaveLength(3)
    expect(entities.filter((entity) => entity.kind === 'survey-marker')).toHaveLength(5)
    expect(entities.filter((entity) => entity.kind === 'resource')).toHaveLength(6)
    expect(Object.values(ACT2_CHARTWRIGHT_ENCOUNTERS)).toMatchObject([{ elite: true, activationMapId: 'submerged-signal-shoal' }])
  })

  it('keeps every map, quest, objective, and encounter release-authoring valid with explicit original-IP metadata', () => {
    for (const map of Object.values(ACT2_CHARTWRIGHT_RUNTIME_MAPS)) expect(validateAuthoredMap(map)).toEqual({ valid: true, issues: [] })
    for (const quest of [ACT2_CHARTWRIGHT_CHARACTER_QUEST, ACT2_CHARTWRIGHT_MASTERY_QUEST, ACT2_CHARTWRIGHT_SIDE_QUEST]) {
      expect(validateAuthoredQuest(quest), quest.id).toEqual({ valid: true, issues: [] })
      for (const objective of quest.objectives) expect(validateAuthoredObjective(objective), objective.id).toEqual({ valid: true, issues: [] })
    }
    for (const encounter of Object.values(ACT2_CHARTWRIGHT_ENCOUNTERS)) expect(validateAuthoredEncounter(encounter)).toEqual({ valid: true, issues: [] })
    for (const record of [...Object.values(ACT2_CHARTWRIGHT_POCKETS), ACT2_CHARTWRIGHT_CHARACTER_QUEST, ACT2_CHARTWRIGHT_MASTERY_QUEST, ACT2_CHARTWRIGHT_SIDE_QUEST, ...Object.values(ACT2_CHARTWRIGHT_ENCOUNTERS)]) expect(record.authoring.originalityNotes).toMatch(/public-domain/i)
  })

  it('maps every Wayfinding contract to one unique physical survey marker and preserves internal quest sequencing', () => {
    const surveys = Object.values(ACT2_CHARTWRIGHT_RUNTIME_MAPS).flatMap((map) => map.entities).filter((entity) => entity.kind === 'survey-marker')
    expect(surveys.map((entity) => entity.surveyContractId).sort()).toEqual(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.id).sort())
    expect(ACT2_CHARTWRIGHT_MASTERY_QUEST.objectives.map((objective) => objective.surveyContractId)).toEqual(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.id))
    expect(ACT2_CHARTWRIGHT_CHARACTER_QUEST.objectives.map((objective) => objective.kind)).toEqual(['talk', 'interact', 'choose'])
    expect(ACT2_CHARTWRIGHT_SIDE_QUEST.objectives.map((objective) => objective.kind)).toEqual(['talk', 'clear-encounter', 'interact'])
  })

  it('keeps all internal routes reciprocal, spawn-resolved, and external Pelagos seams explicit', () => {
    for (const connection of ACT2_CHARTWRIGHT_CONNECTIONS.filter((connection) => Object.hasOwn(ACT2_CHARTWRIGHT_RUNTIME_MAPS, connection.from))) {
      const map = ACT2_CHARTWRIGHT_RUNTIME_MAPS[connection.from]
      expect(act2ChartwrightRuntimeExitById(connection.id)).toMatchObject({ toMapId: connection.to, spawnId: connection.arrivalSpawnId })
      expect(map.spawns[connection.returnSpawnId], connection.id).toBeTruthy()
      if (ACT2_CHARTWRIGHT_RUNTIME_MAPS[connection.to]) expect(ACT2_CHARTWRIGHT_RUNTIME_MAPS[connection.to].spawns[connection.arrivalSpawnId], connection.id).toBeTruthy()
    }
    expect(ACT2_CHARTWRIGHT_EXTERNAL_SEAMS).toHaveLength(2)
    expect(ACT2_CHARTWRIGHT_CONVERSATION_IDS).toHaveLength(3)
  })

  it('binds acceptance and buoy settlement to explicit IDs rather than generic station or side-quest inference', () => {
    expect(act2ChartwrightRuntimeEntityById('chartwright-hall', 'ianthe-chartwright').questAcceptance).toEqual({ questId: 'cq-act2-ianthe-open-chart', trigger: 'talk' })
    expect(act2ChartwrightRuntimeEntityById('chartwright-hall', 'naukleros-signal-keeper').questAcceptance).toEqual({ questId: 'sq-act2-submerged-signal', trigger: 'talk' })
    expect(act2ChartwrightRuntimeEntityById('chartwright-hall', 'chart-table').questAcceptance).toEqual({ questId: 'mqy-wayfinding-covenant-routes', trigger: 'station' })
    expect(act2ChartwrightRuntimeEntityById('submerged-signal-shoal', 'signal-buoy').postEliteInteraction).toEqual({ questId: 'sq-act2-submerged-signal', objectiveId: 'relight-public-buoy', requiresEncounterId: 'enc-act2-submerged-signal-reef' })
  })

  it('routes every semantic target from every legitimate arrival through collision-safe 20px paths in all tide states', () => {
    for (const map of Object.values(ACT2_CHARTWRIGHT_RUNTIME_MAPS)) {
      const targets = [...map.entities, ...map.exits]
      for (const tideStateId of ['ebb', 'crossing', 'surge']) for (const start of Object.values(map.spawns)) for (const item of targets) {
        const path = findWorldPath(map, start, item, { routeStateId: tideStateId })
        expect(path.length, `${map.id}:${tideStateId}:${start.id}→${item.id}`).toBeGreaterThan(0)
        expect(path.every((point) => isWorldPointWalkable(map, point, { routeStateId: tideStateId })), `${map.id}:${tideStateId}:${start.id}→${item.id} walkability`).toBe(true)
        expect(Math.hypot(path.at(-1).x - item.x, path.at(-1).y - item.y), `${map.id}:${tideStateId}:${start.id}→${item.id}`).toBeLessThan(56)
      }
      for (let left = 0; left < targets.length; left += 1) for (let right = left + 1; right < targets.length; right += 1) expect(Math.hypot(targets[left].x - targets[right].x, targets[left].y - targets[right].y), `${map.id}:${targets[left].id}↔${targets[right].id}`).toBeGreaterThanOrEqual(48)
    }
    expect(act2ChartwrightRuntimeEntityById('submerged-signal-shoal', 'signal-buoy')).toBeTruthy()
  })
})
