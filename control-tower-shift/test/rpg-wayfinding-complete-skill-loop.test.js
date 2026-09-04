import { describe, expect, it } from 'vitest'
import { levelForXp } from '../src/rpg/progression.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { routeStateForMap } from '../src/rpg/routeState.js'
import { normalizeState, serializeRPG } from '../src/rpg/save.js'
import {
  DECLARED_COMPLETE_SKILL_LOOPS,
  WAYFINDING_SKILL_LOOP_COMPONENT_CANDIDATE,
  validateCompleteSkillLoopCapability,
  validateCompleteSkillLoopCapabilityShape,
} from '../src/rpg/skillLoopCapabilities.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'
import {
  WAYFINDING_SHORTCUT_DESTINATION_SEAMS,
  WAYFINDING_SURVEY_CONTRACTS,
  wayfindingMasteryStatus,
} from '../src/rpg/wayfinding.js'

const TEST_PATH = 'test/rpg-wayfinding-complete-skill-loop.test.js'

const itemQuantity = (inventory, itemId) => (inventory?.slots || [])
  .filter((slot) => slot.itemId === itemId)
  .reduce((total, slot) => total + slot.quantity, 0)

function markerFor(contract) {
  for (const map of Object.values({
    'chartwright-hall': rpgMapById('chartwright-hall'),
    'submerged-signal-shoal': rpgMapById('submerged-signal-shoal'),
  })) {
    const entity = map.entities.find((candidate) => candidate.id === `survey-${contract.id}`)
    if (entity) return { map, entity }
  }
  throw new Error(`Missing survey marker for ${contract.id}`)
}

function atPhysicalTarget(state, map, target) {
  const spawn = Object.values(map.spawns)[0]
  const path = findWorldPath(map, spawn, target, {
    routeStateId: routeStateForMap(state, map),
  })
  expect(path.length, `${map.id}:${target.id}`).toBeGreaterThan(0)
  expect(Math.hypot(path.at(-1).x - target.x, path.at(-1).y - target.y)).toBeLessThan(56)
  return {
    ...state,
    world: {
      regionId: map.region,
      mapId: map.id,
      spawnId: spawn.id,
      position: path.at(-1),
      facing: spawn.facing || 0,
    },
  }
}

function surveyAtMarker(state, contract) {
  const { map, entity } = markerFor(contract)
  const nearby = atPhysicalTarget(state, map, entity)
  return applyEvent(nearby, {
    type: 'SURVEY_WAYFINDING', entityId: entity.id, surveyContractId: contract.id,
  })
}

function reload(state) {
  const serialized = serializeRPG(state)
  expect(serialized).toBeTruthy()
  const normalized = normalizeState(JSON.parse(serialized))
  expect(normalized).toBeTruthy()
  return normalized
}

describe('Wayfinding complete skill-loop production proof', () => {
  it('completes all five physical survey bands with real chart gates, cooldown practice, reloads, and a durable final shortcut', () => {
    let state = createInitialState()
    state = {
      ...state,
      flags: { ...state.flags, 'act2:tide-state': 'ebb' },
      quests: {
        ...state.quests,
        'mqy-wayfinding-covenant-routes': { state: 'active', objectiveIndex: 0, objectiveCounts: {} },
      },
    }

    for (const [index, contract] of WAYFINDING_SURVEY_CONTRACTS.entries()) {
      const discovered = surveyAtMarker(state, contract)
      expect(discovered).not.toBe(state)
      expect(discovered.wayfinding.discoveries[contract.id]).toBeTruthy()
      expect(discovered.wayfinding.shortcuts[contract.shortcut.id]).toBe(true)
      expect(itemQuantity(discovered.inventory, contract.discoveryReward.itemId)).toBe(1)
      expect(discovered.quests['mqy-wayfinding-covenant-routes'].objectiveIndex).toBe(index + 1)

      const duplicate = applyEvent(discovered, {
        type: 'SURVEY_WAYFINDING', entityId: `survey-${contract.id}`, surveyContractId: contract.id,
      })
      expect(duplicate).toBe(discovered)
      expect(itemQuantity(duplicate.inventory, contract.discoveryReward.itemId)).toBe(1)
      state = discovered

      const next = WAYFINDING_SURVEY_CONTRACTS[index + 1]
      while (next && levelForXp(state.progression.skills.wayfinding.xp) < next.requiredLevel) {
        state = { ...state, playtimeTicks: state.playtimeTicks + contract.practiceCooldownTicks }
        const practiced = surveyAtMarker(state, contract)
        expect(practiced).not.toBe(state)
        expect(practiced.wayfinding.discoveries[contract.id]).toEqual(state.wayfinding.discoveries[contract.id])
        state = practiced
      }

      // Saving a live crafting lease must retain Wayfinding progress but never
      // resume the physical panel authority across a reload.
      if (index === 0) {
        const hall = rpgMapById('chartwright-hall')
        const chartTable = hall.entities.find((entity) => entity.id === 'chart-table')
        state = atPhysicalTarget(state, hall, chartTable)
        state = applyEvent(state, {
          type: 'OPEN_CRAFTING', entityId: chartTable.id, stationId: chartTable.stationId,
        })
        expect(state.crafting.stationId).toBe('chartwright-open-table')
      }
      state = reload(state)
      expect(state.crafting.stationId).toBeNull()
      expect(state.flags['rpg:active-crafting-entity']).toBeUndefined()
    }

    expect(itemQuantity(state.inventory, 'covenant-return-chart')).toBe(1)
    expect(wayfindingMasteryStatus(state.wayfinding, state.progression.skills.wayfinding.xp))
      .toMatchObject({ mastered: true, missingContracts: [], missingShortcuts: [] })

    const finalShortcut = WAYFINDING_SHORTCUT_DESTINATION_SEAMS.at(-1)
    const archive = rpgMapById(finalShortcut.fromMapId)
    const post = archive.entities.find((entity) => entity.wayfindingShortcutId === finalShortcut.id)
    state = atPhysicalTarget(state, archive, post)
    const traversed = applyEvent(state, {
      type: 'TRAVERSE_WAYFINDING_SHORTCUT', entityId: post.id, shortcutId: finalShortcut.id,
    })
    expect(traversed.world).toMatchObject({ mapId: finalShortcut.toMapId, spawnId: finalShortcut.toSpawnId })
    expect(reload(traversed).wayfinding.shortcuts[finalShortcut.id]).toBe(true)
  })

  it('fails closed for remote, forged, and duplicate survey evidence', () => {
    const first = WAYFINDING_SURVEY_CONTRACTS[0]
    const { map, entity } = markerFor(first)
    const nearby = atPhysicalTarget(createInitialState(), map, entity)
    const remote = { ...nearby, world: { ...nearby.world, position: { x: 40, y: 40 } } }
    expect(applyEvent(remote, { type: 'SURVEY_WAYFINDING', entityId: entity.id })).toBe(remote)
    expect(applyEvent(nearby, {
      type: 'SURVEY_WAYFINDING', entityId: entity.id, surveyContractId: 'archive-return-bearing',
    })).toBe(nearby)
    const discovered = surveyAtMarker(nearby, first)
    expect(applyEvent(discovered, { type: 'SURVEY_WAYFINDING', entityId: entity.id })).toBe(discovered)
  })

  it('describes Wayfinding from registered physical targets but still requires independent artifact evidence', () => {
    const artifact = {
      schemaVersion: 1,
      evidenceType: 'completeSkillLoop',
      skillId: 'wayfinding',
      measurements: { learn: true, practice: true, mastery: true },
      capability: WAYFINDING_SKILL_LOOP_COMPONENT_CANDIDATE,
    }
    expect(DECLARED_COMPLETE_SKILL_LOOPS.wayfinding).toBeUndefined()
    expect(validateCompleteSkillLoopCapabilityShape(artifact, { testPaths: [TEST_PATH] })).toBe(true)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: {
      ...artifact.capability,
      bands: artifact.capability.bands.map((band, index) => index === 1 ? { ...band, entityId: 'survey-pelagos-harbor-soundings' } : band),
    } }, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: {
      ...artifact.capability,
      mastery: { ...artifact.capability.mastery, mapId: 'forged-map' },
    } }, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: [] })).toBe(false)
  })
})
