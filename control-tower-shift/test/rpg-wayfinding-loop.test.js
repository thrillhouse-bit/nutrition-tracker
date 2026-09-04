import { describe, expect, it } from 'vitest'
import { xpForLevel } from '../src/rpg/progression.js'
import {
  WAYFINDING_LEVEL_BANDS,
  WAYFINDING_MASTERY_BUDGET,
  WAYFINDING_SURVEY_CONTRACTS,
  createWayfindingState,
  normalizeWayfindingState,
  surveyCooldownRemaining,
  surveyWayfindingContract,
  simulateWayfindingMasteryPath,
  wayfindingBandForLevel,
  wayfindingMasteryStatus,
} from '../src/rpg/wayfinding.js'
import { ACT2_CHARTWRIGHT_RUNTIME_MAPS } from '../src/rpg/act2ChartwrightRuntime.js'
import { ACT2_RUNTIME_MAPS } from '../src/rpg/act2Runtime.js'

const first = WAYFINDING_SURVEY_CONTRACTS[0]

function survey(params = {}) {
  return surveyWayfindingContract({
    state: createWayfindingState(), contractId: first.id, playtimeTicks: 100, skillXp: 0, chartIds: [], ...params,
  })
}

describe('Wayfinding Chartwright loop domain', () => {
  it('defines five ascending level bands and one gated survey contract for each', () => {
    expect(WAYFINDING_LEVEL_BANDS).toHaveLength(5)
    expect(WAYFINDING_SURVEY_CONTRACTS).toHaveLength(5)
    expect(WAYFINDING_LEVEL_BANDS.map((band) => band.minLevel)).toEqual([1, 10, 25, 45, 70])
    expect(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.requiredLevel)).toEqual([1, 10, 25, 45, 70])
    expect(new Set(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.shortcut.id)).size).toBe(5)
    for (const contract of WAYFINDING_SURVEY_CONTRACTS) {
      const destinationMaps = contract.shortcut.destinationScope === 'isolated-chartwright' ? ACT2_CHARTWRIGHT_RUNTIME_MAPS : ACT2_RUNTIME_MAPS
      expect(destinationMaps[contract.shortcut.toMapId]?.spawns[contract.shortcut.toSpawnId], contract.id).toBeTruthy()
    }
  })

  it('runs learn, repeatable practice, and mastery as separate deterministic transitions', () => {
    const learned = survey()
    expect(learned).toMatchObject({ ok: true, reason: 'discovered', reward: { kind: 'discovery', xp: first.discoveryXp } })
    expect(learned.state.shortcuts[first.shortcut.id]).toBe(true)
    expect(wayfindingMasteryStatus(learned.state, 0)).toMatchObject({ mastered: false, missingContracts: expect.arrayContaining([WAYFINDING_SURVEY_CONTRACTS[1].id]) })

    const practiced = survey({ state: learned.state, playtimeTicks: 100 + first.practiceCooldownTicks, skillXp: 0 })
    expect(practiced).toMatchObject({ ok: true, reason: 'practiced', reward: { kind: 'practice', xp: first.practiceXp } })
    expect(practiced.state.practices[first.id]).toEqual({ lastAwardedTick: 100 + first.practiceCooldownTicks, count: 1 })

    let state = createWayfindingState()
    let charts = []
    for (const contract of WAYFINDING_SURVEY_CONTRACTS) {
      const result = surveyWayfindingContract({ state, contractId: contract.id, playtimeTicks: 1_000 + contract.requiredLevel, skillXp: xpForLevel(contract.requiredLevel), chartIds: charts })
      expect(result.ok, contract.id).toBe(true)
      state = result.state
      charts = [...charts, result.reward.discoveryReward.itemId]
    }
    expect(wayfindingMasteryStatus(state, xpForLevel(70))).toMatchObject({ mastered: true, missingContracts: [], missingShortcuts: [] })
  })

  it('is exact-once for discovery and deterministic across normalize/reload boundaries', () => {
    const learned = survey()
    const reloaded = normalizeWayfindingState(JSON.parse(JSON.stringify(learned.state)))
    const duplicate = survey({ state: reloaded, playtimeTicks: 101 })
    expect(duplicate).toMatchObject({ ok: false, reason: 'practice_cooldown', reward: null })
    expect(duplicate.state).toEqual(reloaded)
    expect(duplicate.state.discoveries[first.id]).toEqual({ discoveredAtTick: 100 })
    expect(surveyCooldownRemaining(reloaded, first.id, 100 + first.practiceCooldownTicks - 1)).toBe(1)
    expect(surveyCooldownRemaining(reloaded, first.id, 100 + first.practiceCooldownTicks)).toBe(0)
  })

  it('fails closed for invalid contracts, ticks, levels, charts, and cooldown bypass attempts', () => {
    expect(survey({ contractId: 'missing' })).toMatchObject({ ok: false, reason: 'unknown_contract' })
    expect(survey({ playtimeTicks: -1 })).toMatchObject({ ok: false, reason: 'invalid_playtime_tick' })
    expect(survey({ skillXp: Infinity })).toMatchObject({ ok: false, reason: 'invalid_skill_xp' })
    const second = WAYFINDING_SURVEY_CONTRACTS[1]
    expect(surveyWayfindingContract({ state: createWayfindingState(), contractId: second.id, playtimeTicks: 1, skillXp: 0, chartIds: [] }))
      .toMatchObject({ ok: false, reason: 'level_too_low' })
    expect(surveyWayfindingContract({ state: createWayfindingState(), contractId: second.id, playtimeTicks: 1, skillXp: xpForLevel(second.requiredLevel), chartIds: [] }))
      .toMatchObject({ ok: false, reason: 'missing_chart' })
    expect(survey({ chartIds: ['valid', 2] })).toMatchObject({ ok: false, reason: 'invalid_chart_ids' })
  })

  it('maps levels to the current band without inventing a pre-learning band', () => {
    expect(wayfindingBandForLevel(0)).toBeNull()
    expect(wayfindingBandForLevel(1)).toMatchObject({ id: 'harbor-apprentice' })
    expect(wayfindingBandForLevel(44)).toMatchObject({ id: 'strait-surveyor' })
    expect(wayfindingBandForLevel(99)).toMatchObject({ id: 'covenant-chartwright' })
  })

  it('reaches level-70 mastery from actual discovery/practice rewards inside the documented bounded budget', () => {
    const path = simulateWayfindingMasteryPath()
    expect(path.valid).toBe(true)
    expect(path.level).toBeGreaterThanOrEqual(70)
    expect(path.discoveryCount).toBe(5)
    expect(path.actionCount).toBeGreaterThanOrEqual(WAYFINDING_MASTERY_BUDGET.actionCount.min)
    expect(path.actionCount).toBeLessThanOrEqual(WAYFINDING_MASTERY_BUDGET.actionCount.max)
    expect(path.practiceCount).toBeGreaterThanOrEqual(WAYFINDING_MASTERY_BUDGET.practiceCount.min)
    expect(path.practiceCount).toBeLessThanOrEqual(WAYFINDING_MASTERY_BUDGET.practiceCount.max)
    expect(path.minimumActiveSeconds).toBeGreaterThanOrEqual(WAYFINDING_MASTERY_BUDGET.minimumActiveSeconds.min)
    expect(path.minimumActiveSeconds).toBeLessThanOrEqual(WAYFINDING_MASTERY_BUDGET.minimumActiveSeconds.max)
    expect(path.actions.every((action, index) => index === 0 || action.tick >= path.actions[index - 1].tick)).toBe(true)
    expect(path.actions.filter((action) => action.kind === 'practice').every((action, index, practices) => index === 0 || action.tick > practices[index - 1].tick)).toBe(true)
    expect(path.actions.filter((action) => action.kind === 'discovery').map((action) => action.contractId)).toEqual(WAYFINDING_SURVEY_CONTRACTS.map((contract) => contract.id))
  })
})
