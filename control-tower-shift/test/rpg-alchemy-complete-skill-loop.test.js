import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { normalizeState, serializeRPG } from '../src/rpg/save.js'
import {
  ALCHEMY_SKILL_LOOP_COMPONENT_CANDIDATE,
  DECLARED_COMPLETE_SKILL_LOOPS,
  validateCompleteSkillLoopCapability,
  validateCompleteSkillLoopCapabilityShape,
} from '../src/rpg/skillLoopCapabilities.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

const TEST_PATH = 'test/rpg-alchemy-complete-skill-loop.test.js'
const ALCHEMY_RECIPES = RECIPES.filter((recipe) => recipe.skillId === 'alchemy')

const itemQuantity = (inventory, itemId) => (inventory?.slots || [])
  .filter((slot) => slot.itemId === itemId)
  .reduce((total, slot) => total + slot.quantity, 0)

function atBench(state) {
  const map = rpgMapById('beacon-overlook')
  const bench = map.entities.find((entity) => entity.id === 'beacon-alchemy-bench')
  const spawn = Object.values(map.spawns)[0]
  const path = findWorldPath(map, spawn, bench)
  expect(path.length).toBeGreaterThan(0)
  expect(Math.hypot(path.at(-1).x - bench.x, path.at(-1).y - bench.y)).toBeLessThan(56)
  return {
    ...state,
    world: {
      regionId: map.region, mapId: map.id, spawnId: spawn.id,
      position: path.at(-1), facing: spawn.facing || 0,
    },
  }
}

function withItems(state, ingredients) {
  return ingredients.reduce((next, { itemId, quantity }) => ({
    ...next,
    inventory: addInventoryItem(next.inventory, itemId, quantity, ALL_ITEM_DEFS).inventory,
  }), state)
}

function atLevel(state, level) {
  return {
    ...state,
    progression: {
      ...state.progression,
      skills: { ...state.progression.skills, alchemy: { xp: xpForLevel(level) } },
    },
  }
}

function openBench(state, entityId = 'beacon-alchemy-bench', stationId = 'alchemy-lab') {
  return applyEvent(atBench(state), { type: 'OPEN_CRAFTING', entityId, stationId })
}

function reload(state) {
  const serialized = serializeRPG(state)
  expect(serialized).toBeTruthy()
  const normalized = normalizeState(JSON.parse(serialized))
  expect(normalized).toBeTruthy()
  return normalized
}

describe('Alchemy complete skill-loop production proof', () => {
  it('crafts the exact L1/L12/L20/L30/L45 authored bands at the physical Beacon bench and preserves the mastery output across reloads', () => {
    expect(ALCHEMY_RECIPES.map((recipe) => recipe.level)).toEqual([1, 12, 20, 30, 45])
    let state = createInitialState()
    const outputs = []

    for (const recipe of ALCHEMY_RECIPES) {
      state = atLevel(state, recipe.level)
      state = withItems(state, recipe.ingredients)
      state = openBench(state)
      expect(state.crafting.stationId).toBe('alchemy-lab')
      const crafted = applyEvent(state, { type: 'CRAFT', recipeId: recipe.id, quantity: 1 })
      expect(crafted.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: recipe.xp })
      for (const output of recipe.outputs) {
        expect(itemQuantity(crafted.inventory, output.itemId)).toBeGreaterThanOrEqual(output.quantity)
        outputs.push(output.itemId)
      }
      state = reload(crafted)
      expect(state.crafting.stationId).toBeNull()
      expect(state.flags['rpg:active-crafting-entity']).toBeUndefined()
    }

    expect(outputs).toEqual(['dried-herbs', 'herbal-salve', 'sage-tonic', 'moly-tonic', 'ambrosia-distillate'])
    expect(itemQuantity(state.inventory, 'ambrosia-distillate')).toBe(1)
  })

  it('rejects remote, forged, wrong-station, and duplicate-output craft attempts without creating ambrosia-distillate', () => {
    const mastery = ALCHEMY_RECIPES.at(-1)
    let state = atLevel(createInitialState(), mastery.level)
    state = withItems(state, mastery.ingredients)
    const remote = {
      ...atBench(state),
      world: { ...atBench(state).world, position: { x: 40, y: 40 } },
    }
    expect(applyEvent(remote, { type: 'OPEN_CRAFTING', entityId: 'beacon-alchemy-bench', stationId: 'alchemy-lab' })).toBe(remote)
    const nearby = atBench(state)
    expect(applyEvent(nearby, { type: 'OPEN_CRAFTING', entityId: 'beacon-alchemy-bench', stationId: 'kiln' })).toBe(nearby)

    const open = openBench(state)
    const forged = applyEvent(open, { type: 'CRAFT', recipeId: 'forged-recipe', quantity: 1 })
    expect(forged.crafting.lastResult).toMatchObject({ ok: false, reason: 'unknown_recipe' })
    expect(itemQuantity(forged.inventory, 'ambrosia-distillate')).toBe(0)
    const crafted = applyEvent(open, { type: 'CRAFT', recipeId: mastery.id, quantity: 1 })
    expect(itemQuantity(crafted.inventory, 'ambrosia-distillate')).toBe(1)
    const duplicate = applyEvent(crafted, { type: 'CRAFT', recipeId: mastery.id, quantity: 1 })
    expect(itemQuantity(duplicate.inventory, 'ambrosia-distillate')).toBe(1)
    expect(duplicate.crafting.lastResult.ok).toBe(false)
  })

  it('describes Alchemy from registered recipes and keeps malformed capability evidence fail-closed', () => {
    const artifact = {
      schemaVersion: 1,
      evidenceType: 'completeSkillLoop',
      skillId: 'alchemy',
      measurements: { learn: true, practice: true, mastery: true },
      capability: ALCHEMY_SKILL_LOOP_COMPONENT_CANDIDATE,
    }
    expect(DECLARED_COMPLETE_SKILL_LOOPS.alchemy).toBeUndefined()
    expect(validateCompleteSkillLoopCapabilityShape(artifact, { testPaths: [TEST_PATH] })).toBe(true)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: {
      ...artifact.capability,
      bands: artifact.capability.bands.map((band, index) => index === 1 ? { ...band, recipeId: 'dried-herbs' } : band),
    } }, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: {
      ...artifact.capability,
      mastery: { ...artifact.capability.mastery, entityId: 'forged-bench' },
    } }, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: [] })).toBe(false)
  })
})
