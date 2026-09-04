import { describe, expect, it } from 'vitest'
import { ALL_ITEM_DEFS, RECIPES } from '../src/rpg/crafting.js'
import { findWorldPath } from '../src/rpg/pathfinding.js'
import { addInventoryItem, xpForLevel } from '../src/rpg/progression.js'
import { rpgMapById } from '../src/rpg/registry.js'
import { normalizeState, serializeRPG } from '../src/rpg/save.js'
import {
  BRONZEWORK_SKILL_LOOP_COMPONENT_CANDIDATE,
  DECLARED_COMPLETE_SKILL_LOOPS,
  validateCompleteSkillLoopCapability,
  validateCompleteSkillLoopCapabilityShape,
} from '../src/rpg/skillLoopCapabilities.js'
import { applyEvent, createInitialState } from '../src/rpg/state.js'

const TEST_PATH = 'test/rpg-bronzework-complete-skill-loop.test.js'
const RECIPE_IDS = ['copper-bar', 'bronze-ingot', 'bronze-dory', 'bronze-aspis', 'laurel-aegis']
const BAND_RECIPES = RECIPE_IDS.map((id) => RECIPES.find((recipe) => recipe.id === id))
const itemQuantity = (inventory, itemId) => (inventory?.slots || []).filter((slot) => slot.itemId === itemId).reduce((total, slot) => total + slot.quantity, 0)

function atForge(state) {
  const map = rpgMapById('beacon-overlook')
  const forge = map.entities.find((entity) => entity.id === 'beacon-bronze-forge')
  const spawn = Object.values(map.spawns)[0]
  const path = findWorldPath(map, spawn, forge)
  expect(path.length).toBeGreaterThan(0)
  expect(Math.hypot(path.at(-1).x - forge.x, path.at(-1).y - forge.y)).toBeLessThan(56)
  return { ...state, world: { regionId: map.region, mapId: map.id, spawnId: spawn.id, position: path.at(-1), facing: spawn.facing || 0 } }
}

function atLevelWithInputs(state, recipe) {
  let next = {
    ...state,
    progression: { ...state.progression, skills: { ...state.progression.skills, bronzework: { xp: xpForLevel(recipe.level) } } },
  }
  for (const ingredient of recipe.ingredients) {
    next = { ...next, inventory: addInventoryItem(next.inventory, ingredient.itemId, ingredient.quantity, ALL_ITEM_DEFS).inventory }
  }
  return next
}

function openForge(state, entityId = 'beacon-bronze-forge', stationId = 'bronze-forge') {
  return applyEvent(atForge(state), { type: 'OPEN_CRAFTING', entityId, stationId })
}

function reload(state) {
  const raw = serializeRPG(state)
  expect(raw).toBeTruthy()
  return normalizeState(JSON.parse(raw))
}

describe('Bronzework complete skill-loop production proof', () => {
  it('crafts the exact L1/L5/L12/L26/L42 recipes at the reachable Beacon forge and keeps an equipped Laurel Aegis after reload', () => {
    expect(BAND_RECIPES.map((recipe) => recipe.level)).toEqual([1, 5, 12, 26, 42])
    let state = createInitialState()
    for (const recipe of BAND_RECIPES) {
      state = openForge(atLevelWithInputs(state, recipe))
      const crafted = applyEvent(state, { type: 'CRAFT', recipeId: recipe.id, quantity: 1 })
      expect(crafted.crafting.lastResult).toMatchObject({ ok: true, quantity: 1, xpAwarded: recipe.xp })
      for (const output of recipe.outputs) expect(itemQuantity(crafted.inventory, output.itemId)).toBeGreaterThanOrEqual(output.quantity)
      state = reload(crafted)
      expect(state.crafting.stationId).toBeNull()
      expect(state.flags['rpg:active-crafting-entity']).toBeUndefined()
    }
    expect(itemQuantity(state.inventory, 'laurel-aegis')).toBe(1)
    const equipped = applyEvent(state, { type: 'EQUIP_ITEM', itemId: 'laurel-aegis' })
    expect(equipped.inventory.equipment.offhand).toBe('laurel-aegis')
    expect(reload(equipped).inventory.equipment.offhand).toBe('laurel-aegis')
  })

  it('rejects remote, wrong-station, forged, and duplicate Laurel Aegis output attempts', () => {
    const mastery = BAND_RECIPES.at(-1)
    const prepared = atLevelWithInputs(createInitialState(), mastery)
    const nearby = atForge(prepared)
    const remote = { ...nearby, world: { ...nearby.world, position: { x: 40, y: 40 } } }
    expect(applyEvent(remote, { type: 'OPEN_CRAFTING', entityId: 'beacon-bronze-forge', stationId: 'bronze-forge' })).toBe(remote)
    expect(applyEvent(nearby, { type: 'OPEN_CRAFTING', entityId: 'beacon-bronze-forge', stationId: 'alchemy-lab' })).toBe(nearby)
    const open = openForge(prepared)
    const forged = applyEvent(open, { type: 'CRAFT', recipeId: 'forged-aegis', quantity: 1 })
    expect(forged.crafting.lastResult).toMatchObject({ ok: false, reason: 'unknown_recipe' })
    expect(itemQuantity(forged.inventory, 'laurel-aegis')).toBe(0)
    const crafted = applyEvent(open, { type: 'CRAFT', recipeId: mastery.id, quantity: 1 })
    expect(itemQuantity(crafted.inventory, 'laurel-aegis')).toBe(1)
    const duplicate = applyEvent(crafted, { type: 'CRAFT', recipeId: mastery.id, quantity: 1 })
    expect(duplicate.crafting.lastResult.ok).toBe(false)
    expect(itemQuantity(duplicate.inventory, 'laurel-aegis')).toBe(1)
  })

  it('requires registered recipe signatures and focused test evidence for the declared capability', () => {
    const artifact = { schemaVersion: 1, evidenceType: 'completeSkillLoop', skillId: 'bronzework', measurements: { learn: true, practice: true, mastery: true }, capability: BRONZEWORK_SKILL_LOOP_COMPONENT_CANDIDATE }
    expect(DECLARED_COMPLETE_SKILL_LOOPS.bronzework).toBeUndefined()
    expect(validateCompleteSkillLoopCapabilityShape(artifact, { testPaths: [TEST_PATH] })).toBe(true)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: { ...artifact.capability, bands: artifact.capability.bands.map((band, index) => index === 1 ? { ...band, recipeId: 'copper-bar' } : band) } }, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: { ...artifact.capability, mastery: { ...artifact.capability.mastery, entityId: 'forged-forge' } } }, { testPaths: [TEST_PATH] })).toBe(false)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: [] })).toBe(false)
  })
})
